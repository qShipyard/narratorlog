#[cfg(test)]
mod tests {
    use crate::{
        extract_changed_lines,
        extract_context,
        extract_function_name,
        extract_go_imports,
        extract_ts_imports,
        extract_python_imports,
        extract_rust_imports,
        extract_ruby_imports,
        parse_hunk_new_start,
    };

    // ─── Diff parsing ─────────────────────────────────────────────────────────

    #[test]
    fn test_extract_changed_lines_single_hunk() {
        let diff = "@@ -10,4 +10,6 @@\n context\n+added line 1\n+added line 2\n context";
        let lines = extract_changed_lines(diff);
        assert!(lines.contains(&11));
        assert!(lines.contains(&12));
        assert!(!lines.contains(&10));
    }

    #[test]
    fn test_extract_changed_lines_empty_diff() {
        let lines = extract_changed_lines("");
        assert!(lines.is_empty());
    }

    #[test]
    fn test_parse_hunk_new_start() {
        assert_eq!(parse_hunk_new_start("@@ -10,4 +20,6 @@"), Some(20));
        assert_eq!(parse_hunk_new_start("@@ -1 +1 @@"), Some(1));
        assert_eq!(parse_hunk_new_start("not a hunk"), None);
    }

    // ─── Function extraction ──────────────────────────────────────────────────

    #[test]
    fn test_extract_function_name_go() {
        assert_eq!(
            extract_function_name("func ValidateToken(ctx context.Context) error {", "func "),
            Some("ValidateToken".to_string())
        );
        assert_eq!(extract_function_name("type Foo struct {", "func "), None);
    }

    #[test]
    fn test_extract_function_name_typescript() {
        assert_eq!(
            extract_function_name("async function fetchUser(id: string) {", "async function "),
            Some("fetchUser".to_string())
        );
    }

    #[test]
    fn test_extract_function_name_python() {
        assert_eq!(
            extract_function_name("def process_payment(amount):", "def "),
            Some("process_payment".to_string())
        );
    }

    #[test]
    fn test_extract_function_name_rust() {
        assert_eq!(
            extract_function_name("pub fn handle_connection(stream: TcpStream) {", "pub fn "),
            Some("handle_connection".to_string())
        );
    }

    #[test]
    fn test_extract_function_name_empty_name() {
        assert_eq!(extract_function_name("func (", "func "), None);
    }

    // ─── Import extraction ────────────────────────────────────────────────────

    #[test]
    fn test_extract_go_imports_block() {
        let content = r#"package main

import (
    "fmt"
    "github.com/gin-gonic/gin"
    "context"
)
"#;
        let imports = extract_go_imports(content);
        assert!(imports.iter().any(|i| i.contains("gin")));
        assert!(imports.iter().any(|i| i.contains("fmt")));
    }

    #[test]
    fn test_extract_ts_imports() {
        let content = r#"import { useState } from 'react'
import axios from "axios"
import type { User } from './types'
"#;
        let imports = extract_ts_imports(content);
        assert!(imports.contains(&"react".to_string()));
        assert!(imports.contains(&"axios".to_string()));
        assert!(imports.contains(&"./types".to_string()));
    }

    #[test]
    fn test_extract_python_imports() {
        let content = "import os\nimport sys\nfrom pathlib import Path\n";
        let imports = extract_python_imports(content);
        assert!(imports.contains(&"os".to_string()));
        assert!(imports.contains(&"sys".to_string()));
        assert!(imports.contains(&"pathlib".to_string()));
    }

    #[test]
    fn test_extract_rust_imports() {
        let content = "use std::collections::HashMap;\nuse tokio::net::UnixListener;\n";
        let imports = extract_rust_imports(content);
        assert!(imports.contains(&"std::collections".to_string()));
        assert!(imports.contains(&"tokio::net".to_string()));
    }

    #[test]
    fn test_extract_ruby_imports() {
        let content = "require 'rails'\nrequire_relative '../models/user'\n";
        let imports = extract_ruby_imports(content);
        assert!(imports.contains(&"rails".to_string()));
        assert!(imports.contains(&"../models/user".to_string()));
    }

    // ─── Context extraction ───────────────────────────────────────────────────

    #[test]
    fn test_extract_context_includes_surrounding_lines() {
        let content = (1..=20)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");

        let mut changed = std::collections::HashSet::new();
        changed.insert(10usize);

        let context = extract_context(&content, &changed, 3);
        assert!(context.contains("line 10"));
        assert!(context.contains("line 7"));
        assert!(context.contains("line 13"));
    }

    #[test]
    fn test_extract_context_empty_when_no_changes() {
        let context = extract_context("some content", &std::collections::HashSet::new(), 5);
        assert!(context.is_empty());
    }
}