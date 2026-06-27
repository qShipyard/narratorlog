use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixListener;

mod tests;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ReadRequest {
    file_path: String,
    diff: String,
    language: String,
    context_lines: Option<usize>,
}

#[derive(Debug, Serialize)]
struct ReadResponse {
    file_path: String,
    changed_functions: Vec<String>,
    context: String,
    imports: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tokio::main]
async fn main() {
    let socket_path = std::env::var("READER_SOCKET")
        .unwrap_or_else(|_| "/tmp/narratorlog-reader.sock".to_string());

    if Path::new(&socket_path).exists() {
        std::fs::remove_file(&socket_path).expect("Failed to remove existing socket");
    }

    let listener = UnixListener::bind(&socket_path)
        .expect("Failed to bind Unix socket");

    eprintln!("narratorlog-reader listening on {}", socket_path);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                tokio::spawn(handle_connection(stream));
            }
            Err(e) => {
                eprintln!("Accept error: {}", e);
            }
        }
    }
}

async fn handle_connection(mut stream: tokio::net::UnixStream) {
    let mut buf = Vec::new();

    if let Err(e) = stream.read_to_end(&mut buf).await {
        eprintln!("Read error: {}", e);
        return;
    }

    let response = match serde_json::from_slice::<ReadRequest>(&buf) {
        Ok(request) => process_request(request),
        Err(e) => ReadResponse {
            file_path: String::new(),
            changed_functions: vec![],
            context: String::new(),
            imports: vec![],
            error: Some(format!("Failed to parse request: {}", e)),
        },
    };

    let response_json = serde_json::to_vec(&response).unwrap_or_default();
    let _ = stream.write_all(&response_json).await;
}

fn process_request(request: ReadRequest) -> ReadResponse {
    // Read the file from disk
    let file_content = match std::fs::read_to_string(&request.file_path) {
        Ok(content) => content,
        Err(e) => {
            return ReadResponse {
                file_path: request.file_path,
                changed_functions: vec![],
                context: String::new(),
                imports: vec![],
                error: Some(format!("Failed to read file: {}", e)),
            }
        }
    };

    let context_lines = request.context_lines.unwrap_or(20);
    let changed_lines = extract_changed_lines(&request.diff);
    let changed_functions = extract_changed_functions(
        &file_content,
        &request.language,
        &changed_lines,
    );
    let context = extract_context(&file_content, &changed_lines, context_lines);
    let imports = extract_imports(&file_content, &request.language);

    ReadResponse {
        file_path: request.file_path,
        changed_functions,
        context,
        imports,
        error: None,
    }
}

// ─── Diff parsing ─────────────────────────────────────────────────────────────

// Extracts the line numbers that were added or modified in the diff.
fn extract_changed_lines(diff: &str) -> HashSet<usize> {
    let mut changed = HashSet::new();
    let mut current_line: usize = 0;

    for line in diff.lines() {
        if line.starts_with("@@") {
            // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            if let Some(new_start) = parse_hunk_new_start(line) {
                current_line = new_start.saturating_sub(1);
            }
        } else if line.starts_with('+') && !line.starts_with("+++") {
            current_line += 1;
            changed.insert(current_line);
        } else if !line.starts_with('-') {
            current_line += 1;
        }
    }

    changed
}

fn parse_hunk_new_start(hunk_header: &str) -> Option<usize> {
    // Format: @@ -old +new_start,new_count @@
    let plus_part = hunk_header.split('+').nth(1)?;
    let start_str = plus_part.split(',').next()?.split(' ').next()?;
    start_str.parse().ok()
}

// ─── Function extraction ──────────────────────────────────────────────────────

fn extract_changed_functions(
    content: &str,
    language: &str,
    changed_lines: &HashSet<usize>,
) -> Vec<String> {
    let lines: Vec<&str> = content.lines().collect();
    let mut functions = Vec::new();
    let mut seen = HashSet::new();

    for &changed_line in changed_lines {
        if changed_line == 0 || changed_line > lines.len() {
            continue;
        }

        // Walk backwards from changed line to find enclosing function
        if let Some(name) = find_enclosing_function(&lines, changed_line - 1, language) {
            if seen.insert(name.clone()) {
                functions.push(name);
            }
        }
    }

    functions.sort();
    functions
}

fn find_enclosing_function(lines: &[&str], from_line: usize, language: &str) -> Option<String> {
    let patterns = function_patterns(language);

    // Walk backwards from the changed line
    let start = if from_line < lines.len() { from_line } else { lines.len().saturating_sub(1) };

    for i in (0..=start).rev() {
        let line = lines[i].trim();
        for pattern in &patterns {
            if let Some(name) = extract_function_name(line, pattern) {
                return Some(name);
            }
        }
    }

    None
}

fn function_patterns(language: &str) -> Vec<&'static str> {
    match language {
        "go" => vec!["func ", "func("],
        "typescript" | "javascript" => vec![
            "function ",
            "async function ",
            "const ",
            "export function ",
            "export async function ",
            "export const ",
        ],
        "python" => vec!["def ", "async def "],
        "rust" => vec!["fn ", "pub fn ", "async fn ", "pub async fn "],
        "ruby" => vec!["def ", "define_method"],
        _ => vec!["function ", "func ", "def ", "fn "],
    }
}

fn extract_function_name(line: &str, pattern: &str) -> Option<String> {
    if !line.starts_with(pattern) {
        return None;
    }

    let after = &line[pattern.len()..];

    // Extract name up to first '(' or ' ' or '<'
    let name: String = after
        .chars()
        .take_while(|&c| c.is_alphanumeric() || c == '_')
        .collect();

    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

// ─── Context extraction ───────────────────────────────────────────────────────

fn extract_context(
    content: &str,
    changed_lines: &HashSet<usize>,
    context_lines: usize,
) -> String {
    if changed_lines.is_empty() {
        return String::new();
    }

    let lines: Vec<&str> = content.lines().collect();
    let total = lines.len();

    // Find the range to extract
    let min_line = changed_lines.iter().min().copied().unwrap_or(1);
    let max_line = changed_lines.iter().max().copied().unwrap_or(1);

    let start = min_line.saturating_sub(context_lines + 1);
    let end = (max_line + context_lines).min(total);

    lines[start..end]
        .iter()
        .enumerate()
        .map(|(i, line)| format!("{:4} | {}", start + i + 1, line))
        .collect::<Vec<_>>()
        .join("\n")
}

// ─── Import extraction ────────────────────────────────────────────────────────

fn extract_imports(content: &str, language: &str) -> Vec<String> {
    match language {
        "go" => extract_go_imports(content),
        "typescript" | "javascript" => extract_ts_imports(content),
        "python" => extract_python_imports(content),
        "rust" => extract_rust_imports(content),
        "ruby" => extract_ruby_imports(content),
        _ => vec![],
    }
}

fn extract_go_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    let mut in_block = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "import (" {
            in_block = true;
            continue;
        }
        if in_block && trimmed == ")" {
            break;
        }
        if in_block {
            // Strip quotes and alias
            let pkg = trimmed.trim_matches('"')
                .split('"')
                .find(|s| s.contains('/') || !s.is_empty())
                .unwrap_or(trimmed)
                .to_string();
            if !pkg.is_empty() {
                imports.push(pkg);
            }
        } else if trimmed.starts_with("import \"") {
            let pkg = trimmed
                .trim_start_matches("import \"")
                .trim_end_matches('"')
                .to_string();
            imports.push(pkg);
        }
    }

    imports
}

fn extract_ts_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("import ") && trimmed.contains(" from ") {
            if let Some(from_part) = trimmed.split(" from ").last() {
                let module = from_part
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .trim_end_matches(';')
                    .to_string();
                imports.push(module);
            }
        }
    }

    imports
}

fn extract_python_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("import ") {
            let module = trimmed.trim_start_matches("import ").split(' ').next()
                .unwrap_or("").to_string();
            imports.push(module);
        } else if trimmed.starts_with("from ") && trimmed.contains(" import ") {
            if let Some(module) = trimmed.split_whitespace().nth(1) {
                imports.push(module.to_string());
            }
        }
    }

    imports
}

fn extract_rust_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("use ") {
            let module = trimmed
                .trim_start_matches("use ")
                .trim_end_matches(';')
                .trim();

            // Strip the last segment — keep the module path only
            // e.g. std::collections::HashMap → std::collections
            //      tokio::net::UnixListener  → tokio::net
            let parts: Vec<&str> = module.split("::").collect();
            let path = if parts.len() > 1 {
                parts[..parts.len() - 1].join("::")
            } else {
                parts[0].to_string()
            };

            // Handle grouped imports: use std::collections::{HashMap, HashSet}
            let clean = path.split("::{").next().unwrap_or(&path).to_string();

            if !clean.is_empty() {
                imports.push(clean);
            }
        }
    }

    imports
}

fn extract_ruby_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("require ") || trimmed.starts_with("require_relative ") {
            let module = trimmed
                .split_whitespace()
                .nth(1)
                .unwrap_or("")
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            if !module.is_empty() {
                imports.push(module);
            }
        }
    }

    imports
}