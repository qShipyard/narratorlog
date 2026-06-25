//! narratorlog codebase reader
//!
//! Runs as a Unix socket server. Receives file read requests from the Go
//! pipeline, extracts surrounding context from changed functions, and returns
//! structured context JSON.
//!
//! Protocol:
//!   Request:  { "file_path": "...", "diff": "...", "language": "go", "context_lines": 20 }
//!   Response: { "file_path": "...", "changed_functions": [...], "context": "...", "imports": [...] }

use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixListener;

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

    // Remove existing socket file if present
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
        Ok(request) => process_request(request).await,
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

async fn process_request(request: ReadRequest) -> ReadResponse {
    // TODO: implement per-language AST parsing
    // TODO: extract changed functions from diff
    // TODO: pull surrounding context lines
    // TODO: resolve one level of imports

    ReadResponse {
        file_path: request.file_path,
        changed_functions: vec![],
        context: String::new(),
        imports: vec![],
        error: Some("Reader not yet implemented".to_string()),
    }
}
