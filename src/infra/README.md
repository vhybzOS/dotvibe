# Core Primitives - dotvibe Architecture Foundation

## 📋 Overview

The `src/infra/` directory contains the foundational primitives that power the entire dotvibe system. These modules provide unified, battle-tested implementations that replace scattered, duplicate code throughout the codebase.

**Design Philosophy**: Single source of truth, functional composition, effect-based error handling, and zero duplication.

## 🏗️ Architecture Components

### 1. **Configuration System** (`config.ts`)

**Purpose**: Central configuration management with environment variable integration, validation, and type safety.

**Core Features**:
- **Unified Schema**: All configuration in one place with Zod v4 validation
- **Environment Integration**: Automatic mapping from env vars to config properties
- **Dynamic Resolution**: Runtime resolution of system-dependent values (WASM paths)
- **Type Safety**: Full TypeScript inference with compile-time validation

**Usage Example**:
```typescript
import { loadConfig, getSubsystemConfig } from '../core/config.ts'

// Load complete configuration
const config = await loadConfig({ requireApiKey: true })

// Get specific subsystem config
const llmConfig = getSubsystemConfig(config, 'llm')

// Use in your code
const genAI = new GoogleGenAI({ apiKey: llmConfig.apiKey })
```

**Best Practices**:
- ✅ **Always use `loadConfig()`** instead of `Deno.env.get()` directly
- ✅ **Validate configuration at startup** to fail fast on invalid config
- ✅ **Use subsystem getters** for cleaner code organization
- ✅ **Override defaults** through environment variables or config files

**Anti-Patterns**:
- ❌ **Don't hardcode values** - use configuration schema
- ❌ **Don't access env vars directly** - use the configuration system
- ❌ **Don't ignore validation errors** - handle them gracefully
- ❌ **Don't create duplicate config loading** - use the single source

### 2. **Error Handling System** (`errors.ts`)

**Purpose**: Tagged union error types with structured error handling, recovery strategies, and comprehensive debugging information.

**Core Features**:
- **Tagged Union Types**: Discriminated unions for precise error handling
- **Recovery Strategies**: Built-in guidance for error recovery
- **Serialization**: Structured error data for logging and debugging
- **Severity Levels**: Appropriate error classification and handling

**Usage Example**:
```typescript
import { createStorageError, handleError, ErrorUtils } from '../core/errors.ts'

// Create specific error types
const error = createStorageError(
  cause,
  'query',
  'Failed to execute search query',
  'code_symbols',
  { query: 'SELECT * FROM...', params: { limit: 10 } }
)

// Handle with appropriate logging
handleError(error, 'Database Query')

// Check error properties
if (ErrorUtils.retryable(error)) {
  // Retry logic
}
```

**Best Practices**:
- ✅ **Use specific error creators** for different error types
- ✅ **Include context** in error creation for debugging
- ✅ **Handle errors at appropriate levels** using the error handling system
- ✅ **Use recovery strategies** to guide error resolution

**Anti-Patterns**:
- ❌ **Don't throw generic Error objects** - use typed errors
- ❌ **Don't ignore error context** - include relevant metadata
- ❌ **Don't handle all errors the same way** - use severity and recovery info
- ❌ **Don't lose error chains** - use `chainError` for related errors

### 3. **Storage System** (`storage.ts`) - Three-Phase Graph Database

**Purpose**: Smart graph database system with three-phase processing, edge-based resolution tracking, and semantic integrity.

**SurrealDB Query Reference**: For comprehensive SurrealDB syntax, operators, and best practices, see [SURREAL.md](./SURREAL.md) - essential reference for developing robust graph database queries and understanding SurrealDB-specific syntax requirements.

**Architecture**:
- **Three-Phase Processing**: Element storage → Smart placeholders → Resolution tracking
- **Edge-Based Resolution**: Relationships track resolution status instead of element replacement
- **Semantic Integrity**: Meaningful code elements only, zero database pollution
- **Cross-File Intelligence**: Project-aware resolution with completion metrics

**Core Features**:
- **Phase 1 - Element Storage**: Store only real semantic elements (exports, functions, classes, interfaces)
- **Phase 2 - Smart Placeholders**: Create placeholders only for legitimate semantic references
- **Phase 3 - Resolution Updates**: Track when internal dependencies become available
- **Binary Classification**: Simple internal/external target classification
- **Project Metrics**: Calculate project completion percentage from resolution rates

**Usage Example**:
```typescript
import { indexFile, withProjectDatabase, findElementCallers, getProjectCompletionStats } from '../core/storage.ts'

// Index file with three-phase processing
const result = await Effect.runPromise(
  indexFile('src/infra/storage.ts', '/home/project')
)
// Result: { elementsAdded: 28, relationshipsStored: 42, placeholdersCreated: 8 }

// Project-aware database operations
const elements = await Effect.runPromise(
  withProjectDatabase('/home/project', async (db) => {
    return await db.query('SELECT * FROM code_elements WHERE file_path = $path', { path })
  })
)

// Cross-file graph traversal
const callers = await Effect.runPromise(
  findElementCallers('parseFileWithRelationships', '/home/project')
)

// Project completion metrics
const stats = await Effect.runPromise(
  getProjectCompletionStats('/home/project')
)
// Result: { completion_percentage: 92.5, resolved_internal: 37, total_internal: 40 }
```

**Three-Phase Processing Flow**:
```typescript
// Phase 1: Store semantic elements only
for (const element of parseResult.elements) {
  await storeElement(element) // Real functions, classes, interfaces
}

// Phase 2: Create smart placeholders for missing internal targets
const semanticTargets = relationships
  .filter(rel => rel.target_type === 'internal')
  .filter(rel => isSemanticElementName(rel.to))
  .filter(rel => !elementExists(rel.to))
await createPlaceholders(semanticTargets)

// Phase 3: Update resolution status for existing relationships
await updateResolutionStatus(filePath, projectPath)
```

**Technical Innovations**:

1. **Semantic Filtering**: Eliminates database pollution
   ```typescript
   const isSemanticElementName = (name: string): boolean => {
     // Skip expressions, literals, complex code
     if (name.includes('(') || name.includes('=>') || name.startsWith('"')) return false
     return /^[a-zA-Z_$][a-zA-Z0-9_$]*(\\.\\w+)?$/.test(name)
   }
   ```

2. **UPSERT Relationship Preservation**: Updates placeholders without breaking existing relationships
   ```typescript
   if (existingElement?.is_placeholder) {
     // UPDATE preserves ID and relationships
     await db.query(`UPDATE code_elements SET element_type = $type, is_placeholder = false WHERE id = $id`)
   } else {
     await db.query(`UPSERT code_elements CONTENT { ... }`)
   }
   ```

3. **Edge-Based Resolution Tracking**: Track resolution in relationships, not elements
   ```sql
   DEFINE TABLE structural_relationship TYPE RELATION SCHEMAFULL;
   DEFINE FIELD resolved ON structural_relationship TYPE bool DEFAULT false;
   DEFINE FIELD target_type ON structural_relationship TYPE string; -- 'internal' | 'external'
   ```

**Database Schema**:
```sql
-- Semantic elements with placeholder support
DEFINE TABLE code_elements SCHEMAFULL;
DEFINE FIELD element_path ON code_elements TYPE string;
DEFINE FIELD element_name ON code_elements TYPE string;
DEFINE FIELD element_type ON code_elements TYPE string;
DEFINE FIELD is_placeholder ON code_elements TYPE bool DEFAULT false;
DEFINE FIELD file_path ON code_elements TYPE string;
DEFINE FIELD content ON code_elements TYPE string;

-- Relationships with resolution tracking
DEFINE TABLE structural_relationship TYPE RELATION SCHEMAFULL;
DEFINE FIELD relationship_type ON structural_relationship TYPE string;
DEFINE FIELD resolved ON structural_relationship TYPE bool DEFAULT false;
DEFINE FIELD target_type ON structural_relationship TYPE string;
DEFINE FIELD context ON structural_relationship TYPE object;

-- Data flow tracking
DEFINE TABLE data_flow TYPE RELATION SCHEMAFULL;
DEFINE FIELD flow_type ON data_flow TYPE string;
DEFINE FIELD resolved ON data_flow TYPE bool DEFAULT false;
DEFINE FIELD target_type ON data_flow TYPE string;
```

**Best Practices**:
- ✅ **Use `indexFile()` for complete three-phase processing** instead of manual element creation
- ✅ **Leverage project-aware functions** with explicit projectPath parameters
- ✅ **Monitor completion metrics** to track project interconnection quality
- ✅ **Use semantic filtering** to maintain database quality
- ✅ **Track resolution status** for cross-file dependency management

**Critical Implementation Details**:

**Database Connection**: 
- Uses PID-based connection discovery via `.vibe/server.pid`
- Namespace: `vibe`, Database: `code`, Default port: 4244
- All operations are project-aware with explicit `projectPath` parameters

**File Clearing Strategy**:
```typescript
// CRITICAL: Preserve cross-file placeholders when re-indexing
await db.query(`DELETE FROM code_elements WHERE file_path = $filePath AND is_placeholder = false`)
// NOT: DELETE FROM code_elements WHERE file_path = $filePath (breaks cross-file relationships)
```

**Resolution Update Scope**:
```typescript
// CRITICAL: Update ALL relationships pointing to newly indexed file
const updateQuery = `
  UPDATE structural_relationship 
  SET resolved = true 
  WHERE resolved = false 
  AND target_type = 'internal' 
  AND out = $elementId  -- Specific element that just became real
`
```

**CLI Commands**:
```bash
# Initialize schema with resolution tracking
deno run --allow-all src/infra/storage.ts init-schema --project-path=/path/to/project

# Index file with three-phase processing  
deno run --allow-all src/infra/storage.ts index-file src/file.ts --project-path=/path/to/project

# Query project completion metrics
deno run --allow-all src/infra/storage.ts project-stats --project-path=/path/to/project
```

**Debugging Methodology** (proven effective):

**1. AST Analysis First**:
```bash
# Test AST parsing directly to verify relationship discovery
deno run --allow-all src/infra/ast.ts parse-file src/infra/storage.ts

# Count elements and relationships 
deno run --allow-all src/infra/ast.ts parse-file src/infra/storage.ts | jq '.elements | length'
deno run --allow-all src/infra/ast.ts parse-file src/infra/storage.ts | jq '.relationships | length'

# Filter internal relationships
deno run --allow-all src/infra/ast.ts parse-file src/infra/storage.ts | jq '[.relationships[] | select(.to | contains("/home/keyvan/.vibe/dotvibe"))] | length'
```

**2. Direct Database Queries**:
```bash
# Get the dynamic port first (not static!)
./vibe start
# ✅ SurrealDB server already running
#    🌐 Address: 127.0.0.1:4244  <- Use this port
#    🆔 PID: undefined
#    📁 Database: .vibe/code.db

# Connect to SurrealDB CLI with the dynamic port
surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code

# Check table contents and counts
echo "SELECT count() FROM code_elements GROUP ALL;" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code

# Verify relationship statistics
echo "SELECT relationship_type, resolved, target_type, count() FROM structural_relationship GROUP BY relationship_type, resolved, target_type;" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code

# Check specific elements
echo "SELECT element_name, element_type, is_placeholder FROM code_elements WHERE element_name = 'parseFileWithRelationships';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code

# Find unresolved internal relationships
echo "SELECT COUNT(*) as unresolved_count FROM structural_relationship WHERE resolved = false AND target_type = 'internal';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code
```

**3. Clean Slate Testing**:
```bash
# Complete reset for controlled testing
echo "REMOVE TABLE code_elements; REMOVE TABLE structural_relationship; REMOVE TABLE data_flow;" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code

# Re-initialize and test step by step
deno run --allow-all src/infra/storage.ts init-schema --project-path=/home/keyvan/.vibe/dotvibe
deno run --allow-all src/infra/storage.ts index-file src/infra/storage.ts --project-path=/home/keyvan/.vibe/dotvibe
```

**4. Cross-File Resolution Testing** (storage.ts ↔ ast.ts example):
```bash
# Index storage.ts first (creates placeholder for parseFileWithRelationships)
deno run --allow-all src/infra/storage.ts index-file src/infra/storage.ts --project-path=/home/keyvan/.vibe/dotvibe

# Check that parseFileWithRelationships was created as placeholder
echo "SELECT element_name, element_type, is_placeholder, id FROM code_elements WHERE element_name = 'parseFileWithRelationships';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code
# Expected: element_type = 'external', is_placeholder = true, id = some_uuid

# Save the placeholder ID for verification
PLACEHOLDER_ID=$(echo "SELECT id FROM code_elements WHERE element_name = 'parseFileWithRelationships';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code | jq -r '.[0][0].id')

# Index ast.ts (should takeover the placeholder)
deno run --allow-all src/infra/storage.ts index-file src/infra/ast.ts --project-path=/home/keyvan/.vibe/dotvibe

# CRITICAL: Verify placeholder takeover (same ID, real element)
echo "SELECT element_name, element_type, is_placeholder, id FROM code_elements WHERE element_name = 'parseFileWithRelationships';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code
# Expected: Same ID as before, is_placeholder = false, element_type = 'export'

# Verify relationships from storage.ts to ast.ts are now resolved
echo "SELECT rel.resolved, from_elem.element_name as caller, to_elem.element_name as callee FROM structural_relationship rel JOIN code_elements from_elem ON from_elem.id = rel.in JOIN code_elements to_elem ON to_elem.id = rel.out WHERE from_elem.file_path CONTAINS 'storage.ts' AND to_elem.element_name = 'parseFileWithRelationships';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code
# Expected: resolved = true for calls from indexFile, withProjectDatabase, etc.

# Verify all storage.ts → ast.ts relationships are resolved
echo "SELECT COUNT(*) FILTER (WHERE resolved = true) as resolved_count, COUNT(*) as total_count FROM structural_relationship rel JOIN code_elements from_elem ON from_elem.id = rel.in JOIN code_elements to_elem ON to_elem.id = rel.out WHERE from_elem.file_path CONTAINS 'storage.ts' AND to_elem.file_path CONTAINS 'ast.ts' AND rel.target_type = 'internal';" | surreal sql --conn http://127.0.0.1:4244 --user root --pass root --ns vibe --db code
# Expected: resolved_count = total_count (100% resolution)
```

**Anti-Patterns**:
- ❌ **Don't create elements manually** - use `indexFile()` for complete processing
- ❌ **Don't bypass semantic filtering** - maintain database quality standards
- ❌ **Don't ignore resolution tracking** - use resolved status for dependency analysis
- ❌ **Don't pollute with non-semantic elements** - only store meaningful code constructs
- ❌ **Don't assume all relationships resolve** - handle unresolved internal dependencies
- ❌ **Don't delete placeholders during file clearing** - breaks cross-file relationships

### 4. **Embedding System** (`embeddings.ts`)

**Purpose**: Consolidated Google Gemini embedding generation with caching, retry logic, and batch processing.

**Core Features**:
- **Single Implementation**: Eliminates duplicate embedding code
- **Batch Processing**: Efficient processing of multiple texts
- **Retry Logic**: Automatic retry with exponential backoff
- **Validation**: Embedding validation and normalization utilities

**Usage Example**:
```typescript
import { generateSingleEmbedding, generateBatchEmbeddings, EmbeddingUtils } from '../core/embeddings.ts'

// Generate single embedding
const embedding = await Effect.runPromise(
  generateSingleEmbedding('Hello world', {
    model: 'text-embedding-004',
    taskType: 'SEMANTIC_SIMILARITY'
  })
)

// Batch processing
const embeddings = await Effect.runPromise(
  generateBatchEmbeddings(['text1', 'text2', 'text3'], {
    concurrency: 3
  })
)

// Use utilities
const similarity = EmbeddingUtils.similarity(embedding1.embedding, embedding2.embedding)
```

**Best Practices**:
- ✅ **Use batch processing** for multiple embeddings
- ✅ **Specify task types** for optimal embedding quality
- ✅ **Validate embeddings** before storage
- ✅ **Use retry logic** for production robustness

**Anti-Patterns**:
- ❌ **Don't create duplicate embedding functions** - use the single implementation
- ❌ **Don't ignore embedding validation** - validate before use
- ❌ **Don't process embeddings sequentially** - use batch processing
- ❌ **Don't hardcode model names** - use configuration

### 5. **AST Processing System** (`ast.ts`)

**Purpose**: Tree-sitter integration with dynamic WASM loading, parser caching, and symbol extraction.

**Core Features**:
- **Dynamic WASM Resolution**: Automatic WASM path discovery
- **Parser Caching**: Efficient parser reuse with automatic cleanup
- **Symbol Extraction**: Comprehensive symbol information extraction
- **Language Detection**: Automatic language detection from file extensions

**Usage Example**:
```typescript
import { parseFile, getSymbolDetails, readAndParseFile, ASTUtils } from '../core/ast.ts'

// Parse file content
const symbols = await Effect.runPromise(
  parseFile(content, 'typescript')
)

// Get detailed symbol information
const details = await Effect.runPromise(
  getSymbolDetails(content, 'myFunction', 'typescript')
)

// Read and parse file
const result = await Effect.runPromise(
  readAndParseFile('src/example.ts')
)

// Use utilities
ASTUtils.startCacheCleanup()
```

**Best Practices**:
- ✅ **Use parser caching** for performance
- ✅ **Let language detection work automatically** unless specific needs
- ✅ **Handle parsing errors gracefully** with fallback behavior
- ✅ **Start cache cleanup** for long-running processes

**Anti-Patterns**:
- ❌ **Don't hardcode WASM paths** - use dynamic resolution
- ❌ **Don't create parsers for every file** - use caching
- ❌ **Don't ignore parsing errors** - handle them appropriately
- ❌ **Don't leak parser memory** - use cache cleanup

### 6. **Logging System** (`logger.ts`)

**Purpose**: Structured logging with levels, contexts, and conditional output for debugging and monitoring.

**Core Features**:
- **Log Levels**: QUIET, NORMAL, VERBOSE, DEBUG with appropriate filtering
- **Context Grouping**: Organized logging by subsystem (storage, processing, etc.)
- **Conditional Logging**: Debug-only logging with zero performance impact
- **Structured Output**: Consistent formatting and metadata

**Usage Example**:
```typescript
import { logStorage, logSystem, debugOnly, setLogLevel, LogLevel } from '../core/logger.ts'

// Set log level
setLogLevel(LogLevel.VERBOSE)

// Use context-specific loggers
logStorage.debug('Database connection established')
logSystem.info('Configuration loaded successfully')

// Debug-only logging (zero cost when not in debug mode)
debugOnly(() => {
  logStorage.debug('Query details:', { query, params })
})
```

**Best Practices**:
- ✅ **Use appropriate log levels** for different message types
- ✅ **Use context-specific loggers** for organization
- ✅ **Use `debugOnly()`** for expensive debug logging
- ✅ **Include relevant metadata** in log messages

**Anti-Patterns**:
- ❌ **Don't use `console.log` directly** - use the logging system
- ❌ **Don't log sensitive information** - sanitize before logging
- ❌ **Don't ignore log levels** - respect user preferences
- ❌ **Don't create excessive debug output** - use appropriate levels

## 🔄 Integration Patterns

### Effect-TS Composition

The core modules are designed for Effect-TS composition:

```typescript
import { pipe, Effect } from 'effect'
import { loadConfig } from '../core/config.ts'
import { generateSingleEmbedding } from '../core/embeddings.ts'
import { createIndexEntry } from '../core/storage.ts'

// Compose operations
const indexDocument = (text: string, metadata: any) => pipe(
  loadConfigEffect(),
  Effect.flatMap(config => generateSingleEmbedding(text)),
  Effect.flatMap(embedding => createIndexEntry({
    ...metadata,
    description: text,
    embedding: embedding.embedding
  })),
  Effect.catchAll(error => {
    handleError(error, 'Document Indexing')
    return Effect.fail(error)
  })
)
```

### Dependency Injection

Use configuration to inject dependencies:

```typescript
// Good: Configurable dependencies
const createProcessor = (config: ProcessingConfig) => {
  return {
    process: async (items: any[]) => {
      const batches = chunk(items, config.batchSize)
      // Process with configured batch size
    }
  }
}

// Bad: Hardcoded dependencies
const processor = {
  process: async (items: any[]) => {
    const batches = chunk(items, 50) // Hardcoded!
  }
}
```

### Error Boundaries

Create error boundaries for subsystems:

```typescript
const withErrorBoundary = <T>(
  operation: Effect.Effect<T, VibeError>,
  context: string
): Effect.Effect<T, never> => {
  return pipe(
    operation,
    Effect.catchAll(error => {
      handleError(error, context)
      return Effect.succeed(null as T) // Or appropriate fallback
    })
  )
}
```

## 🚨 Common Pitfalls

### 1. **Configuration Anti-Patterns**

```typescript
// ❌ Bad: Direct environment access
const apiKey = Deno.env.get('GOOGLE_API_KEY')

// ✅ Good: Configuration system
const config = await loadConfig()
const apiKey = config.llm.apiKey
```

### 2. **Error Handling Anti-Patterns**

```typescript
// ❌ Bad: Generic error throwing
throw new Error('Database failed')

// ✅ Good: Typed error creation
throw createStorageError(error, 'query', 'Database query failed', 'code_symbols')
```

### 3. **Resource Management Anti-Patterns**

```typescript
// ❌ Bad: Manual connection management
const db = await connectToDatabase()
const result = await db.query('...')
await db.close()

// ✅ Good: Higher-order function
const result = await Effect.runPromise(
  withDatabase(db => db.query('...'))
)
```

### 4. **Performance Anti-Patterns**

```typescript
// ❌ Bad: Sequential processing
for (const text of texts) {
  await generateSingleEmbedding(text)
}

// ✅ Good: Batch processing
await generateBatchEmbeddings(texts, { concurrency: 5 })
```

## 🎯 Migration Guide

### From Legacy Code

1. **Replace direct database access**:
   ```typescript
   // Old: src/database.ts
   const db = await connectToDatabase()
   
   // New: src/infra/storage.ts
   const result = await Effect.runPromise(withDatabase(db => ...))
   ```

2. **Replace embedding duplication**:
   ```typescript
   // Old: src/embeddings.ts AND src/agent/embeddings.ts
   
   // New: src/infra/embeddings.ts (single source)
   import { generateSingleEmbedding } from '../core/embeddings.ts'
   ```

3. **Replace error handling**:
   ```typescript
   // Old: Generic errors
   throw new Error('Something failed')
   
   // New: Typed errors
   throw createProcessingError(error, 'indexing', 'Failed to index component')
   ```

### Testing Integration

```typescript
// Test with mock configuration
const testConfig = createConfig({
  llm: { apiKey: 'test-key' },
  storage: { host: 'localhost' }
})

// Test with error scenarios
const mockError = createStorageError(
  new Error('Connection failed'),
  'connect',
  'Test connection error'
)
```

## 📊 Performance Characteristics

### Configuration Loading
- **Cold start**: ~5ms (with file system access)
- **Environment only**: ~1ms
- **Cached**: ~0.1ms

### Storage Operations
- **Connection establishment**: ~10ms
- **Query execution**: ~5-50ms depending on complexity
- **Batch operations**: ~2-5ms per item

### Embedding Generation
- **Single embedding**: ~100ms (Google API latency)
- **Batch (10 items)**: ~300ms (parallelized)
- **Cache hit**: ~0.1ms

### AST Processing
- **Parser initialization**: ~50ms (WASM loading)
- **File parsing**: ~1-10ms depending on size
- **Cached parser**: ~1-5ms

## 🔧 Debugging Tips

### Enable Debug Logging
```typescript
import { setLogLevel, LogLevel } from '../core/logger.ts'
setLogLevel(LogLevel.DEBUG)
```

### Error Tracing
```typescript
import { serializeError } from '../core/errors.ts'
console.log(JSON.stringify(serializeError(error), null, 2))
```

### Performance Monitoring
```typescript
import { getCacheStats } from '../core/ast.ts'
console.log('AST Cache:', getCacheStats())
```

---

**Remember**: These primitives are designed to be the foundation for all dotvibe functionality. Always prefer using these consolidated implementations over creating new ones, and follow the established patterns for consistency and maintainability.