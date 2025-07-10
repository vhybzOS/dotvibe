# Product Requirements Document

## Feature: Phase 2 - LLM Indexing Orchestrator
**Status**: planned
**Priority**: high
**Created**: 2025-07-10

### Description
Build an LLM-based orchestrator that uses the Phase 1 Code Analysis Toolbox to intelligently explore and understand codebases. This system will use the tool registry to dynamically call analysis functions based on LLM decision-making.

### Acceptance Criteria
- [ ] Create LLM orchestrator that can use tool registry
- [ ] Implement intelligent codebase exploration strategy
- [ ] Add database integration for storing analysis results
- [ ] Create query interface for semantic code search
- [ ] Implement context compression (10 relevant lines instead of 1000-line files)
- [ ] Add support for incremental indexing
- [ ] Create unified CLI interface that combines Phase 1 tools with LLM orchestration

### Implementation Notes
**Technical Approach**:
- Use Google Gemini API for LLM orchestration
- Leverage existing tool registry from Phase 1
- Build on Effect-TS functional patterns
- Integrate with SurrealDB for vector storage
- Use tree-sitter analysis results as input for LLM processing

**Dependencies**:
- Phase 1 Code Analysis Toolbox (completed)
- Google Gemini API integration
- SurrealDB vector storage
- Effect-TS async patterns

**Architecture**:
```
LLM Orchestrator (Phase 2)
├── Tool Registry Interface (from Phase 1)
├── Codebase Exploration Strategy
├── Context Compression Engine
├── Vector Database Integration
└── Query Interface
```

### User Stories
- As a developer, I want to query my codebase with natural language so that I can find relevant code quickly
- As a developer, I want intelligent code indexing so that the system understands code relationships
- As a developer, I want 100x context compression so that I get precise results instead of large file dumps
- As a developer, I want incremental indexing so that I can efficiently update my code index