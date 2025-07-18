# Data Directory

This directory contains runtime assets and dependencies for the dotvibe executable.

## Files

- `tree-sitter-typescript.wasm` - TypeScript/JavaScript parser (v0.23.2)
  - Downloaded by the Go installer from https://unpkg.com
  - Handles both .ts/.tsx and .js/.jsx files
  - Used by the unified TypeScript parser configuration

## Installation Process

1. **Deno executable**: Bundles this README.md for documentation
2. **Go installer**: Downloads the WASM file at installation time
3. **Runtime**: AST parser looks for WASM file in this directory

## Path Resolution

The AST parser (`src/infra/ast.ts`) automatically detects:
- **Development mode**: Uses WASM files from Deno's npm cache
- **Compiled executable**: Uses WASM file from this data/ directory

## Version Information

- Tree-sitter TypeScript: v0.23.2
- Download URL: https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm
- Managed by: installer/modules.go