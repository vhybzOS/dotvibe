# dotvibe Architecture

## 🎯 System Overview

**dotvibe** is a hybrid intelligent code indexing and semantic search system that combines traditional vector embeddings with LLM-powered code analysis. It provides developers with 100x context compression by returning intelligent symbol descriptions instead of raw code chunks.

## 🏗️ Core Architecture Components

### System Components Flow

```
┌─────────────────┐    manages    ┌─────────────────┐    connects to    ┌─────────────────┐
│  CLI Commands   │ ─────────────→ │  SurrealDB      │ ─────────────────→ │  File Database  │
│  (src/cli.ts)   │               │  Server         │                   │  .vibe/code.db  │
│                 │               │  (background)   │                   │                 │
└─────────────────┘               └─────────────────┘                   └─────────────────┘
        │                                   │                                     │
        ▼                                   ▼                                     ▼
┌─────────────────┐               ┌─────────────────┐                   ┌─────────────────┐
│  Workspace      │               │  Process        │                   │  Intelligent    │
│  Validation     │               │  Management     │                   │  Symbol Index   │
│  (src/workspace)│               │  (PID files)    │                   │  (code_symbols) │
└─────────────────┘               └─────────────────┘                   └─────────────────┘
```

### Intelligent Indexing Pipeline

```
┌─────────────────┐    analyzes    ┌─────────────────┐    generates    ┌─────────────────┐
│  Tree-sitter    │ ─────────────→ │  Google AI SDK  │ ────────────────→ │  Symbol         │
│  Parser         │               │  (Gemini)       │                  │  Descriptions   │
│  (WASM Loading) │               │  (Function      │                  │                 │
└─────────────────┘               │   Calling)      │                  └─────────────────┘
        │                         └─────────────────┘                           │
        │                                   │                                   │
        ▼                                   ▼                                   ▼
┌─────────────────┐               ┌─────────────────┐                  ┌─────────────────┐
│  Symbol         │               │  Conversation   │                  │  Embeddings     │
│  Extraction     │               │  Loop           │                  │  (Google Gemini)│
│  (AST Parsing)  │               │  (MAX_ITERATIONS)│                  │                 │
└─────────────────┘               └─────────────────┘                  └─────────────────┘
                                            │                                   │
                                            ▼                                   ▼
                                  ┌─────────────────┐                  ┌─────────────────┐
                                  │  Database       │ ◄────────────────│  Semantic       │
                                  │  Persistence    │                  │  Search         │
                                  │  (code_symbols) │                  │  (Vector Space) │
                                  └─────────────────┘                  └─────────────────┘
```

### Query Processing Flow

```
┌─────────────────┐    embeds     ┌─────────────────┐    searches     ┌─────────────────┐
│  User Query     │ ─────────────→│  Google Gemini  │ ───────────────→│  code_symbols   │
│  "async funcs"  │               │  Embedding      │                 │  Table          │
└─────────────────┘               │  Generation     │                 │  (SurrealDB)    │
                                  └─────────────────┘                 └─────────────────┘
                                            │                                   │
                                            ▼                                   ▼
                                  ┌─────────────────┐                 ┌─────────────────┐
                                  │  Vector         │                 │  Cosine         │
                                  │  [0.1, 0.3,     │                 │  Similarity     │
                                  │   0.8, ...]     │                 │  Search         │
                                  └─────────────────┘                 └─────────────────┘
                                                                              │
                                                                              ▼
                                                                    ┌─────────────────┐
                                                                    │  Ranked         │
                                                                    │  Symbol         │
                                                                    │  Results        │
                                                                    └─────────────────┘
```

## 📁 File Structure & Implementation Map

### Core Components

#### 1. CLI Interface (`src/cli.ts`)
**Purpose**: Main entry point for all user interactions
**Commands**: `init`, `start`, `stop`, `status`, `index`, `query`, `help`
**Key Functions**:
- `handleIndexCommand()` - Orchestrates intelligent indexing
- `handleQueryCommand()` - Executes semantic search
- `setupCLI()` - Commander.js configuration

#### 2. Intelligent Indexing Agent (`src/mastra/agents/indexing_agent.ts`)
**Purpose**: LLM-powered codebase exploration and understanding
**Key Components**:
- `runGuidedExploration()` - Main orchestration function
- `systemInstruction` - LLM guidance for code analysis
- Hybrid Google AI SDK + Mastra pattern integration

**Tool Registry** (`src/mastra/tools/`):
- `list_filesystem()` - Directory exploration with full path resolution
- `read_file()` - File content reading
- `list_symbols_in_file()` - Tree-sitter AST parsing
- `get_symbol_details()` - Symbol content extraction
- `create_index_entry()` - Database persistence with embeddings

#### 3. Tree-sitter Integration (`src/mastra/tools/code_analysis_tools.ts:34-47`)
**Purpose**: TypeScript AST parsing for symbol extraction
**Key Innovation**: Direct WASM loading in Deno environment
```typescript
// Critical implementation pattern
const wasmPath = '/home/keyvan/.cache/deno/npm/registry.npmjs.org/tree-sitter-typescript/0.23.2/tree-sitter-typescript.wasm'
const wasmBytes = await Deno.readFile(wasmPath)
const language = await Language.load(wasmBytes)
parser.setLanguage(language)
```

#### 4. Database Layer (`src/database.ts`)
**Purpose**: SurrealDB integration with dual schema support
**Schemas**:
- `code_symbols` - Intelligent symbol index with embeddings
- `file_metadata` - File tracking and metadata
- `workspace_info` - Project statistics

**Key Functions**:
- `searchCodeSymbols()` - Vector similarity search on symbol descriptions
- `connectToDatabaseEffect()` - Effect-TS database connections
- `createDatabaseSchema()` - Automatic schema initialization

#### 5. Server Management (`src/surreal-server.ts`)
**Purpose**: Automatic SurrealDB server lifecycle management
**Features**:
- Background server startup with `nohup`
- PID file management for graceful shutdown
- Port discovery and conflict resolution
- Health checking and status monitoring

#### 6. Embedding System (`src/embeddings.ts`)
**Purpose**: Google Gemini embedding generation
**Key Function**: `generateSingleEmbedding()` - Converts text to vector representations

#### 7. Query System (`src/query.ts`)
**Purpose**: Semantic search orchestration
**Flow**:
1. Embed user query with Google Gemini
2. Search `code_symbols` table using cosine similarity
3. Return ranked symbol descriptions with metadata

## 🔧 Technical Architecture Decisions

### 1. Hybrid LLM + Traditional Search
**Decision**: Combine Google AI SDK function calling with vector embeddings
**Rationale**: Get both intelligent code understanding AND fast semantic search
**Implementation**: LLM generates descriptions → Embed descriptions → Search embeddings

### 2. Effect-TS Functional Composition
**Decision**: Use Effect-TS for all async operations and error handling
**Pattern**: `Effect.tryPromise()` for all external API calls
**Benefit**: Consistent error handling and functional composition

### 3. Direct WASM Loading for Tree-sitter
**Decision**: Load tree-sitter WASM files directly from Deno cache
**Problem Solved**: Module resolution conflicts in Deno environment
**Innovation**: Bypassed standard import patterns with direct file access

### 4. Path-Specific Workspace Isolation
**Decision**: Each directory gets its own `.vibe/` workspace and server
**Benefit**: Multiple projects can run simultaneously without conflicts
**Implementation**: Server startup uses workspace-specific database paths

### 5. Zod v4 + Google AI SDK Bridge
**Decision**: Use Zod v4's native JSON schema generation for function calling
**Innovation**: `z.toJSONSchema()` → Google AI SDK function declarations
**Benefit**: Single source of truth for validation and LLM tools

## 🚀 Key Performance Characteristics

### Context Compression
- **Input**: 1000-line files with raw code
- **Output**: Precise symbol descriptions with semantic meaning
- **Compression Ratio**: ~100x (10 relevant lines vs 1000-line files)

### Search Performance
- **Embedding Generation**: ~100ms per query (Google Gemini)
- **Vector Search**: <50ms (SurrealDB cosine similarity)
- **Total Query Time**: ~150ms end-to-end

### Indexing Efficiency  
- **Symbol Extraction**: Tree-sitter AST parsing (~10ms per file)
- **LLM Analysis**: Conversation-based understanding (variable time)
- **Database Persistence**: Batch upserts with content hashing

## 🔄 Data Flow Examples

### Example 1: Index Command Flow
```bash
$ vibe index src/
```

1. **CLI** (`src/cli.ts:handleIndexCommand`) → 
2. **Agent** (`src/mastra/agents/indexing_agent.ts:runGuidedExploration`) →
3. **Tool: list_filesystem** → Returns `["src/index.ts", "src/cli.ts"]` →
4. **Tool: read_file** → Loads file content →
5. **Tool: list_symbols_in_file** → Tree-sitter extracts `[User, getUserById]` →
6. **Tool: get_symbol_details** → Gets symbol code snippets →
7. **LLM Analysis** → Generates "User interface for user entity data" →
8. **Tool: create_index_entry** → Embeds description + stores in `code_symbols`

### Example 2: Query Command Flow
```bash
$ vibe query "user interfaces"
```

1. **CLI** (`src/cli.ts:handleQueryCommand`) →
2. **Query System** (`src/query.ts:executeQuery`) →
3. **Embedding** (`src/embeddings.ts:generateSingleEmbedding`) → Vector `[0.1, 0.3, ...]` →
4. **Database Search** (`src/database.ts:searchCodeSymbols`) → Cosine similarity →
5. **Results** → `[{symbol: "User", similarity: 0.85, description: "..."}]`

## 🧪 Testing Architecture

### Test Categories
- **Unit Tests**: Individual function validation
- **Integration Tests**: End-to-end tool workflows  
- **E2E Tests**: Complete CLI command validation

### Key Test Files
- `tests/indexing-e2e.test.ts` - Complete tool execution pipeline
- `tests/google-ai-integration.test.ts` - LLM function calling validation
- `tests/database.test.ts` - SurrealDB operations

### @tested_by Coverage System
```typescript
/**
 * @tested_by tests/query.test.ts (Natural language processing, context compression)
 * @tested_by tests/integration.test.ts (End-to-end query workflow)
 */
export function executeQuery() { ... }
```

## 🔮 Future Architecture Considerations

### Mastra Framework Migration
**Current**: Hybrid approach with local tool definitions
**Future**: Full Mastra integration when Zod v4 support arrives
**Migration Path**: Simple import swap due to API compatibility

### Scaling Considerations
- **Database**: SurrealDB supports clustering for larger codebases
- **Embeddings**: Batch processing for improved throughput
- **LLM**: Function calling parallelization for faster indexing

### Extension Points
- **Language Support**: Additional tree-sitter grammars
- **Model Options**: Alternative embedding providers
- **Storage Backends**: Vector database alternatives

---

*This architecture enables intelligent code understanding at scale while maintaining fast, semantic search capabilities. The hybrid approach bridges traditional IR techniques with modern LLM capabilities.*