# Product Requirements Document

## Feature: Toy Vibe Query with Google Gemini Embeddings
**Status**: completed
**Priority**: high
**Created**: 2024-07-09

### Description
Implement a prototype version of the vibe query system using Google Gemini embeddings to enable semantic code search. This toy version demonstrates the core concept of natural language code querying and serves as the foundation for the full implementation.

### Acceptance Criteria
- [x] Integrate Google Gemini API for generating embeddings
- [x] Read API key from .env file with proper error handling
- [x] Generate embeddings for sample code.ts file
- [x] Store embeddings in embed.json with metadata
- [x] Implement vibe query command for natural language search
- [x] Calculate semantic similarity using cosine similarity
- [x] Extract relevant code snippets from search results
- [x] Provide relevance scoring for returned results
- [x] Follow Effect-TS patterns for all async operations
- [x] Use Zod v4 schemas for input validation
- [x] Implement tagged union error system

### Implementation Notes
- Uses @google/genai SDK for embedding generation
- Stores embeddings in JSON format for simplicity
- Implements cosine similarity for semantic matching
- Extracts code snippets intelligently (functions, interfaces, etc.)
- Includes relevance scoring based on similarity + keyword matching
- CLI supports both embed and query commands

### User Stories
- As a developer, I want to generate embeddings for my code with `vibe embed`
- As a developer, I want to search for "async functions" and get relevant code snippets
- As a developer, I want to see relevance scores to understand result quality
- As a developer, I want meaningful error messages when API calls fail

### Workflow
1. Set up .env file with GOOGLE_API_KEY
2. Run `deno task dev embed` to generate embeddings for code.ts
3. Run `deno task dev query "async functions"` to search semantically
4. Get formatted results with relevance scores

---

## Feature: Core Query System
**Status**: planned
**Priority**: high
**Created**: 2024-01-09

### Description
Implement the core `vibe query` command that provides 100x context compression by returning precise code snippets instead of loading entire files. This is the foundational feature that all other functionality will build upon.

### Acceptance Criteria
- [ ] Accept natural language queries and return relevant code snippets
- [ ] Implement pattern matching system for semantic code understanding
- [ ] Achieve measurable context compression (target: 10 lines vs 1000+ lines)
- [ ] Support multiple query types (natural language, pattern-based, file-specific)
- [ ] Provide relevance scoring for returned results
- [ ] Include comprehensive error handling with tagged union types
- [ ] Support configuration options (limit, complexity filter, etc.)

### Implementation Notes
- Use Effect-TS for all async operations
- Implement Zod v4 schemas for input validation
- Follow functional programming principles (no classes)
- Use tagged union error system for type safety
- Include @tested_by annotations for test coverage tracking
- Focus on memory efficiency and fast response times

### User Stories
- As a developer, I want to query "async functions" and get 5-10 relevant code snippets instead of loading multiple full files
- As a developer, I want to specify complexity levels to filter results by code complexity
- As a developer, I want to limit results to specific files or directories
- As a developer, I want to see relevance scores to understand result quality
- As a developer, I want meaningful error messages when queries fail

---

## Feature: CLI Interface
**Status**: planned
**Priority**: high
**Created**: 2024-01-09

### Description
Create a command-line interface for the vibe query system using commander.js. The CLI should be intuitive, fast, and provide helpful feedback to users.

### Acceptance Criteria
- [ ] Implement command-line argument parsing with commander.js
- [ ] Support common CLI patterns (--help, --version, --verbose)
- [ ] Provide clear usage instructions and examples
- [ ] Include input validation with helpful error messages
- [ ] Support common query options (--limit, --complexity, --file)
- [ ] Implement proper exit codes for different scenarios
- [ ] Include progress indicators for long-running queries

### Implementation Notes
- Use commander.js for argument parsing
- Implement structured logging for debugging
- Follow CLI best practices for user experience
- Include comprehensive help text and examples
- Support both interactive and scriptable usage

### User Stories
- As a developer, I want to run `vibe query "async functions" --limit 5` and get formatted results
- As a developer, I want to see helpful error messages when I provide invalid arguments
- As a developer, I want to use `--help` to understand available options
- As a developer, I want to use the CLI in scripts and CI/CD pipelines