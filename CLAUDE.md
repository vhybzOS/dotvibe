# dotvibe - Development Guidelines

## 🎯 Project Overview

**dotvibe** is a toolbox for coding agents, providing them with superpowers through a collection of useful CLI tools. Our mission is to build practical utilities that enhance developer productivity and enable powerful agent workflows.

**Core Tool**: `vibe query` - A context-aware code search that returns precise code snippets instead of loading entire files.

## 🏗️ Architecture

### Current Architecture
- **src/infra/**: Consolidated primitives (config, storage, embeddings, errors, AST, logger)
- **src/agent/**: Clean agent system with composable primitives
- **src/commands/**: CLI entry points (init, index, query)
- **tests/**: Comprehensive test suite with @tested_by annotations

### Architecture Principles
- ✅ **No duplicate implementations** (single source of truth)
- ✅ **Composable primitives** (focused modules that can be combined)
- ✅ **Clean module boundaries** (single responsibility principle)
- ✅ **Comprehensive test coverage** (100% @tested_by annotations)

### Composable Primitives Pattern
```typescript
// Use composable functions for different use cases
import { createLLMClient } from './llm.ts'
import { createProgressTracker } from './progress.ts'  
import { createWindowingStrategy } from './windowing.ts'

// Components can be combined as needed
const client = createLLMClient(config)
const progress = createProgressTracker(context)
const windowing = createWindowingStrategy('per-file', maxTokens)

// Benefits:
// - Cleaner module boundaries (single responsibility)
// - Easier testing (each module focused)
// - Flexible composition for different use cases
// - Reduced cognitive load
```

## 🔧 Core Development Principles

### 1. Functional Programming (NO Classes)
```typescript
// ❌ Don't create custom classes
export class TokenTracker { ... }

// ✅ Use functional patterns with higher-order functions
export const createTokenTracker = (context: ThreadContext) => {
  let state = { currentTokens: context.currentTokens }
  
  return {
    addTokens: (tokens: TokenEstimate) => {
      state.currentTokens += tokens.totalTokens
      return state.currentTokens
    },
    getProgress: () => formatProgress(state.currentTokens, context.maxTokens)
  }
}

// ✅ Use function composition with Effect-TS
export const processTokens = (
  context: ThreadContext,
  estimate: TokenEstimate
): Effect.Effect<ProgressDisplay, VibeError> => pipe(
  Effect.succeed(context),
  Effect.map(ctx => addTokensToContext(ctx, estimate)),
  Effect.map(updated => createProgressDisplay(updated))
)
```

**Key Rules**:
- **Only TypeScript interfaces, function composition, and higher-order functions**
- **Use Effect-TS for async operations and error handling**
- **When state is needed, use HOF that return objects with methods**
- **No classes whatsoever - functional patterns only**

### 2. Effect-TS Patterns (KISS Principle)
```typescript
// ✅ Use Effect for:
// - Async operations with error handling
// - Resource management (db connections)
// - Complex composition chains

// ❌ Don't use Effect for:
// - Simple async/await
// - Synchronous transformations
// - Test utilities

// ✅ All async operations MUST use Effect.tryPromise
Effect.tryPromise({
  try: () => fileExists(path),
  catch: (error) => createFileSystemError(error, path, 'Failed to check file')
})

// ✅ Error handling with tagged unions
export type VibeError = 
  | StorageError 
  | ConfigError 
  | ProcessingError 
  | NetworkError

export const handleError = (error: VibeError): void => {
  switch (error._tag) {
    case 'StorageError':
      logger.error(`Storage: ${error.operation} failed`, error)
      break
    case 'ConfigError':
      logger.error(`Config: ${error.field} invalid`, error)
      break
    case 'ProcessingError':
      logger.error(`Processing: ${error.stage} failed`, error)
      break
    case 'NetworkError':
      logger.error(`Network: ${error.url} unreachable`, error)
      break
  }
}
```

### 3. Module Organization
```typescript
// ✅ Import from core modules
import { withDatabase } from '../core/storage.ts'
import { createConfig } from '../core/config.ts'
import { createFileSystemError } from '../core/errors.ts'

// ✅ Use composable agent primitives
import { createLLMClient } from '../agent/llm.ts'
import { createProgressTracker } from '../agent/progress.ts'
import { createWindowingStrategy } from '../agent/windowing.ts'
```

### 4. Testing Strategy (TDD Philosophy)
```typescript
// 🚨 Core Principle: "Write tests first, then implement to pass tests"
// This ensures every feature is completely validated before release

// ✅ All functions must have @tested_by annotations
/**
 * @tested_by tests/core/storage.test.ts (Database operations, error handling)
 * @tested_by tests/integration/query.test.ts (End-to-end query workflow)
 */
export const executeQuery = (queryText: string): Effect.Effect<QueryResult, VibeError> => {
  // Implementation
}

// ✅ Test Coverage Requirements:
// - Maintain 100% @tested_by annotations
// - All tests run in <10 seconds
// - 0 flaky tests
// - Clear test structure matching architecture
// - Red-Green-Refactor cycle (fail, pass, improve)

// ✅ Test Types:
// - Unit tests for individual functions
// - Integration tests for module interactions
// - End-to-end tests for full workflows
```

## 🚀 Technology Stack

### Core Dependencies
- **Runtime**: Deno (TypeScript-first, no Node.js dependencies)
- **Functional**: Effect-TS (async operations, error handling)
- **Validation**: Zod v4 (schema validation, JSON schema generation)
- **Database**: SurrealDB (unified storage with code_symbols table)
- **LLM**: Google AI SDK v1.9.0 (`gemini-2.5-flash`)
- **Parsing**: Tree-sitter (AST parsing for code indexing)

### Architecture Philosophy
- **Functional Programming**: No classes, only functions and HOF
- **Composable Primitives**: Small, focused modules that can be combined
- **Effect-TS Composition**: Functional error handling and async operations
- **Type Safety**: Zod v4 schemas for runtime validation
- **Test-Driven Development**: Tests written before implementation

### Integration Patterns

#### Google AI SDK v1.9.0 (Production-Tested)
```typescript
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration, Type } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: config.apiKey })

// Function calling with Zod v4 schemas
const response = await genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Your message to the model',
  config: {
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: ['tool_name']
      }
    },
    tools: [{ functionDeclarations: [toolDeclaration] }],
    systemInstruction: 'Your system instruction'
  }
})
```

#### Zod v4 Schema Bridge
```typescript
// ✅ Use Zod v4's native JSON schema generation
export function zodToFunctionDeclaration(toolDef: ToolDefinition): FunctionDeclaration {
  const jsonSchema = z.toJSONSchema(toolDef.inputSchema)
  const { $schema, ...cleanParameters } = jsonSchema
  
  return {
    name: toolDef.id,
    description: toolDef.description,
    parameters: cleanParameters
  }
}
```

#### Tree-sitter + Deno Integration
```typescript
import { Parser, Language } from 'web-tree-sitter'

async function initializeParser(): Promise<Parser> {
  await Parser.init()
  const parser = new Parser()
  
  // Direct WASM loading - the only reliable approach for Deno
  const wasmPath = await resolveWasmPath('tree-sitter-typescript')
  const wasmBytes = await Deno.readFile(wasmPath)
  const language = await Language.load(wasmBytes)
  parser.setLanguage(language)
  
  return parser
}

// Key Learning: web-tree-sitter requires explicit WASM loading in Deno
// - No automatic module resolution like Node.js
// - Must load Language objects from WASM bytes
// - Singleton pattern recommended (parser initialization is expensive)
```

## 📋 Development Workflow

### 1. TDD Protocol (Critical - NO CODE BEFORE TESTS)
```typescript
// 🚨 MANDATORY: Write tests FIRST, then implement
// ❌ NEVER write implementation code before tests exist

// 1. Create test file first
// tests/core/new-feature.test.ts
describe('NewFeature', () => {
  it('should handle basic functionality', () => {
    // Test implementation
  })
})

// 2. Run test (it should FAIL)
// deno test tests/core/new-feature.test.ts

// 3. Only THEN implement the feature
// src/infra/new-feature.ts
```

### 2. Feature Development Process
1. **Create feature in prd.md** with acceptance criteria
2. **🚨 WRITE TESTS FIRST** (TDD approach - tests must exist before any implementation)
3. **Run tests to verify they fail** (red phase)
4. **Implement minimal code to pass tests** (green phase)
5. **Refactor while keeping tests passing** (refactor phase)
6. **Update @tested_by annotations**
7. **Verify all tests pass**

### 3. Testing Commands
```bash
# Core module tests
deno test tests/core/

# Agent system tests
deno test tests/agent/

# Full test suite
deno test --allow-all

# CLI integration tests
./vibe index test_simple.ts
./vibe query "interface"
```

### 4. Build and Release
```bash
# Build production binary
deno task build

# Cross-platform builds
deno task build:cross-platform

# Run type checking
deno task check
```

## 🚨 Critical Guidelines

### What to NEVER Do
- ❌ **Write implementation code before tests exist** (TDD violation)
- ❌ Create classes (use functional patterns only)
- ❌ Add new core modules without justification
- ❌ Use async/await without Effect-TS error handling
- ❌ **Hardcode file paths** (use dynamic resolution instead)
- ❌ Create duplicate implementations
- ❌ Skip @tested_by annotations
- ❌ Use Effect for simple async/await or synchronous transformations

### What to ALWAYS Do
- ✅ **Write tests FIRST, then implement** (TDD Protocol - Critical)
- ✅ **Remove ALL hardcoded values** (use dynamic resolution)
- ✅ Use composable primitives from src/agent/
- ✅ Import from src/infra/ for shared functionality
- ✅ Use Effect-TS for async operations with error handling
- ✅ Validate with Zod v4 schemas
- ✅ Follow functional programming patterns
- ✅ **Maintain 100% @tested_by annotations** (comprehensive test coverage)
- ✅ Update documentation after changes

### Critical Examples - Dynamic Path Resolution
```typescript
// ❌ BAD (hardcoded paths)
const wasmPath = '/home/keyvan/.cache/deno/npm/...'

// ✅ GOOD (dynamic resolution)
const wasmPath = await resolveWasmPath('tree-sitter-typescript')

// ✅ More examples:
// Dynamic config paths
const configPath = await resolveConfigPath('.vibe/config.json')

// Dynamic database paths
const dbPath = await resolveDatabasePath('surreal://localhost:8000')

// Dynamic template paths
const templatePath = await resolveTemplatePath('universal-template')
```

## 📁 File Structure Reference

```
src/
├── core/                    # Consolidated primitives
│   ├── config.ts           # Central configuration
│   ├── storage.ts          # Unified SurrealDB operations
│   ├── embeddings.ts       # Embedding generation
│   ├── errors.ts           # Tagged union error system
│   ├── ast.ts              # Tree-sitter utilities
│   └── logger.ts           # Structured logging
├── agent/                   # Clean agent system
│   ├── llm.ts              # Google GenAI wrapper
│   ├── progress.ts         # Unified progress tracking
│   ├── windowing.ts        # Flexible conversation strategies
│   ├── conversation.ts     # Simple conversation management
│   ├── indexing.ts         # Unified LLM-first indexing
│   └── ...
├── commands/                # CLI entry points
│   ├── init.ts             # Project initialization
│   ├── index.ts            # Code indexing
│   └── query.ts            # Code search
└── tests/                   # Comprehensive test suite
    ├── core/               # Core module tests
    ├── agent/              # Agent system tests
    └── integration/        # End-to-end tests
```

## 📖 Documentation Files

- **prd.md**: Feature requirements and acceptance criteria
- **ARCHITECTURE.md**: System design and patterns
- **CHANGELOG.md**: Release history and version tracking
- **CLAUDE.md**: Development guidelines and best practices (this file)

---

**Remember**: This codebase prioritizes simplicity, composability, and functional programming patterns. When in doubt, choose the simpler approach that maintains clean module boundaries.