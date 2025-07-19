# SurrealDB Query Reference for Graph Operations

## 🎯 **Overview**

This document compiles comprehensive findings about SurrealDB syntax, operators, and best practices for graph database operations. Essential reference for developing robust queries in storage-2.ts and future development.

## 📋 **Key Findings Summary**

### **Graph Database Model**
- **Nodes**: Entities (people, products, concepts) stored as records
- **Edges**: Relationships between nodes with full metadata support
- **Structure**: Semantic triple pattern `subject → predicate → object`
- **Bidirectional**: All relationships are bidirectional by default
- **Edge Tables**: Relationships are stored in separate tables with `in` and `out` fields

### **Critical SQL Syntax Rules**
- **Reserved Keywords**: `from`, `to`, `in`, `out` must be escaped with backticks
- **String Matching**: Use `~` for regex, `CONTAINS` for substring matching
- **Field Escaping**: Use backticks for complex field names: `` `field name` ``
- **Graph Traversal**: Use `->` and `<-` for directional traversal

## 🔧 **Operators & Syntax**

### **String Matching Operators**
```surrealql
-- Regex matching (recommended)
WHERE field ~ "pattern"
WHERE field !~ "pattern"

-- Contains matching
WHERE field CONTAINS "substring"
WHERE field CONTAINSNOT "substring"

-- Fuzzy matching
WHERE field ~ "value"
WHERE field !~ "value"

-- Full-text search
WHERE field @@ "search terms"
```

### **Comparison Operators**
```surrealql
-- Equality
WHERE field = "value"
WHERE field IS "value"
WHERE field != "value"  
WHERE field IS NOT "value"

-- Exact equality (including type)
WHERE field == "value"

-- Numeric comparisons
WHERE field < 100
WHERE field >= 50
WHERE field IN 18..=65  -- Range
```

### **Logical Operators**
```surrealql
-- AND/OR
WHERE condition1 AND condition2
WHERE condition1 && condition2
WHERE condition1 OR condition2
WHERE condition1 || condition2

-- NOT
WHERE !condition
WHERE NOT condition
```

### **Graph Traversal Operators**
```surrealql
-- Forward traversal
SELECT ->wrote->posts.* FROM users:alice

-- Reverse traversal  
SELECT <-wrote<-users.* FROM posts:hello

-- Filtered traversal
SELECT ->(likes WHERE like_strength > 10) AS likes FROM person

-- Multi-level traversal
SELECT ->wrote->posts->comments.* FROM users:alice
```

## 🗂️ **Schema Definition Best Practices**

### **Table Creation**
```surrealql
-- Node table
DEFINE TABLE code_elements SCHEMAFULL;

-- Edge table (for relationships) - MUST have 'in' and 'out' fields for RELATE
DEFINE TABLE structural_relationship SCHEMAFULL;

-- Required fields for edge tables (CRITICAL for RELATE to work)
DEFINE FIELD `in` ON structural_relationship TYPE record;
DEFINE FIELD `out` ON structural_relationship TYPE record;
```

### **Field Definitions**
```surrealql
-- Standard fields
DEFINE FIELD file_path ON code_elements TYPE string;
DEFINE FIELD element_name ON code_elements TYPE string;

-- Reserved keyword fields (must be escaped)
DEFINE FIELD `from` ON structural_relationship TYPE string;
DEFINE FIELD `to` ON structural_relationship TYPE string;

-- Arrays and objects
DEFINE FIELD content_embedding ON code_elements TYPE array;
DEFINE FIELD metadata ON code_elements TYPE object;
```

### **Index Creation**
```surrealql
-- Standard indexes
DEFINE INDEX file_path_idx ON code_elements COLUMNS file_path;
DEFINE INDEX element_name_idx ON code_elements COLUMNS element_name;

-- Reserved keyword indexes
DEFINE INDEX from_idx ON structural_relationship COLUMNS `from`;
DEFINE INDEX to_idx ON structural_relationship COLUMNS `to`;
```

## 🚀 **RELATE Statement for Graph Relationships**

### **Basic Syntax**
```surrealql
RELATE @from_record -> @table -> @to_record
    [ CONTENT @value | SET @field = @value ]
    [ RETURN options ]
    [ TIMEOUT @duration ]
    [ PARALLEL ]
```

### **Critical Requirements for RELATE**
- **Edge tables MUST have `in` and `out` fields** (not `from` and `to`)
- **Records must exist before relating** (use placeholder creation)
- **Use proper record ID format**: `table:⟨id⟩`

### **Creating Relationships**
```surrealql
-- Basic relationship
RELATE person:alice -> wrote -> article:hello;

-- With metadata
RELATE person:alice -> wrote -> article:hello SET 
    created_at = time::now(),
    metadata = { location: "Tallinn" };

-- With content
RELATE person:alice -> wrote -> article:hello CONTENT {
    created_at: time::now(),
    strength: 0.9
};
```

### **Relationship Characteristics**
- **Bidirectional**: Can be traversed in both directions
- **Metadata**: Full support for additional properties
- **Auto-cleanup**: Automatically deleted when no connections remain
- **Unique**: Can define unique indexes to prevent duplicates

## 🔍 **SELECT Statement Patterns**

### **Basic Queries**
```surrealql
-- Simple select
SELECT * FROM code_elements WHERE file_path = "/path/to/file.ts";

-- With conditions
SELECT * FROM code_elements 
WHERE element_name ~ "function.*" 
AND element_type = "function";
```

### **Graph Traversal Queries**
```surrealql
-- Find callers
SELECT * FROM code_elements 
WHERE id IN (
    SELECT `from` FROM structural_relationship 
    WHERE `to` = "element_id" AND relationship_type = "calls"
);

-- Find callees
SELECT * FROM code_elements 
WHERE id IN (
    SELECT `to` FROM structural_relationship 
    WHERE `from` = "element_id" AND relationship_type = "calls"
);
```

### **Pattern Matching**
```surrealql
-- Regex matching (recommended over LIKE)
WHERE element_name ~ "get.*"
WHERE file_path ~ "/src/.*\\.ts$"

-- Contains matching
WHERE content CONTAINS "async function"
WHERE element_name CONTAINS "handler"

-- Negation
WHERE element_name !~ "test.*"
WHERE content CONTAINSNOT "deprecated"
```

## 🚨 **Common Pitfalls & Solutions**

### **Reserved Keywords**
```surrealql
-- ❌ Wrong - causes parse errors
WHERE from = "value"
WHERE to = "value"

-- ✅ Correct - escape with backticks
WHERE `from` = "value"
WHERE `to` = "value"
```

### **String Matching**
```surrealql
-- ❌ Wrong - LIKE not supported
WHERE field LIKE "pattern%"

-- ✅ Correct - use regex
WHERE field ~ "pattern.*"

-- ✅ Correct - use contains
WHERE field CONTAINS "substring"
```

### **Field Escaping**
```surrealql
-- ❌ Wrong - complex field names
WHERE complex field = "value"

-- ✅ Correct - escape complex names
WHERE `complex field` = "value"
WHERE `marketing settings` = "value"
```

## 📊 **Performance Optimization**

### **Index Usage**
```surrealql
-- Force index usage
SELECT * FROM code_elements WITH INDEX file_path_idx 
WHERE file_path = "/path/to/file.ts";

-- Avoid index (force table scan)
SELECT * FROM code_elements WITH NOINDEX 
WHERE element_name ~ "pattern";

-- Explain query execution
EXPLAIN SELECT * FROM code_elements WHERE file_path = "/path/to/file.ts";
```

### **Graph Query Optimization**
```surrealql
-- Use timeout for recursive queries
SELECT ->wrote->posts.* FROM users:alice TIMEOUT 5s;

-- Use parallel for large datasets
SELECT * FROM code_elements PARALLEL;

-- Limit relationship traversal depth
SELECT ->(wrote)[..2]->posts.* FROM users:alice;
```

## 🔧 **Data Type Handling**

### **Type Casting**
```surrealql
-- Cast to specific types
RETURN <bool> "true";
RETURN <datetime> "2022-06-07";
RETURN <decimal> "13.572948";

-- Multi-type casting
RETURN <array<int>> ["42", "314"];
RETURN <array<datetime|string>> ["2022-06-07", "hello"];
```

### **Field Type Definitions**
```surrealql
-- Standard types
DEFINE FIELD age ON person TYPE int;
DEFINE FIELD name ON person TYPE string;
DEFINE FIELD active ON person TYPE bool;

-- Array types
DEFINE FIELD tags ON article TYPE array<string>;
DEFINE FIELD embeddings ON code_elements TYPE array<float>;

-- Object types
DEFINE FIELD metadata ON code_elements TYPE object;
```

## 🛡️ **Best Practices for Graph Operations**

### **Relationship Management**
1. **Use RELATE**: Always use RELATE for creating graph relationships
2. **Metadata**: Store relationship metadata on edge tables
3. **Indexes**: Create indexes on `from` and `to` fields for performance
4. **Cleanup**: Leverage auto-cleanup for orphaned relationships

### **Query Patterns**
1. **Escape Keywords**: Always escape `from`, `to`, `in`, `out` with backticks
2. **Use Regex**: Prefer `~` over LIKE for pattern matching
3. **Limit Traversal**: Set reasonable limits on graph traversal depth
4. **Index Strategy**: Use appropriate indexes for frequent queries

### **Schema Design**
1. **Separate Tables**: Use separate tables for nodes and edges
2. **Type Safety**: Define field types explicitly with SCHEMAFULL
3. **Unique Constraints**: Prevent duplicate relationships with unique indexes
4. **Consistent Naming**: Use consistent naming conventions for fields

## 🎯 **Application to Storage-2.ts**

### **Query Corrections Needed**
```typescript
// ❌ Current problematic queries
`DELETE FROM structural_relationship WHERE \`from\` LIKE $filePath`

// ✅ Corrected queries
`DELETE FROM structural_relationship WHERE \`from\` = $filePath`
`DELETE FROM structural_relationship WHERE \`from\` ~ $filePathPattern`
```

### **Recommended Query Patterns**
```typescript
// Find dependencies with regex
const query = `
  SELECT DISTINCT \`to\` as dependency FROM structural_relationship 
  WHERE \`from\` ~ $filePathPattern 
  AND \`to\` !~ $filePathPattern
  AND relationship_type = 'imports'
`

// Find callers with proper escaping
const query = `
  SELECT * FROM code_elements 
  WHERE id IN (
    SELECT \`from\` FROM structural_relationship 
    WHERE \`to\` = $elementId AND relationship_type = 'calls'
  )
`
```

## 📚 **References**

- [SurrealDB Graph Models](https://surrealdb.com/docs/surrealdb/models/graph)
- [RELATE Statement](https://surrealdb.com/docs/surrealql/statements/relate)
- [SELECT Statement](https://surrealdb.com/docs/surrealql/statements/select)
- [SurrealQL Operators](https://surrealdb.com/docs/surrealql/operators)
- [Data Casting](https://surrealdb.com/docs/surrealql/datamodel/casting)

## 🔍 **Advanced Patterns from Codebase Analysis**

### **Higher-Order Function Pattern for Database Operations**
```typescript
// Pattern: withDatabase HOF for consistent connection management
export const withDatabase = <T>(operation: (db: Surreal) => Promise<T>): Effect.Effect<T, VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const db = new Surreal()
        await db.connect(config.database.url)
        await db.use({ namespace: config.database.namespace, database: config.database.database })
        
        const result = await operation(db)
        await db.close()
        return result
      },
      catch: (error) => createStorageError(error, 'withDatabase', 'Database operation failed')
    })
  )
}

// Usage: All database operations use this pattern
const result = await Effect.runPromise(
  withDatabase(db => db.query('SELECT * FROM code_elements'))
)
```

### **Hybrid ID Generation for Cross-Module References**
```typescript
// Pattern: Different ID schemes for internal vs external elements
const generateStorageElementId = (filePath: string, elementName: string, node?: any): string => {
  // For import statements: use resolved module:element format
  if (node?.type === 'import_statement') {
    const moduleName = extractModuleName(node)
    if (moduleName) {
      const resolvedModuleName = resolveImportPath(moduleName, filePath)
      return `${resolvedModuleName}:${elementName}` // external reference
    }
  }
  
  // For internal elements: use filePath:elementName format
  return `${filePath}:${elementName}` // internal reference
}
```

### **Import-Aware Element Extraction**
```typescript
// Pattern: Special handling for import statements to create multiple elements
if (node.type === 'import_statement') {
  const importedNames = extractImportNames(node) // ['Parser', 'Language', 'Query']
  const moduleName = extractModuleName(node)     // 'web-tree-sitter'
  
  // Create separate element for each imported name
  for (const importedName of importedNames) {
    const element = extractElementFromNodeWithName(node, lines, content, filePath, importedName)
    // Results in: web-tree-sitter:Parser, web-tree-sitter:Language, web-tree-sitter:Query
  }
}
```

### **Tree-sitter Query-Based Data Flow Analysis**
```typescript
// Pattern: Using tree-sitter queries instead of AST walking for better performance
const analyzeDataFlowSync = async (parseResult: ParseResult): Promise<DataFlowRelationshipData[]> => {
  const language = cached.language
  const query = new Query(language, LANGUAGE_CONFIGS.typescript.queries.dataflow)
  const matches = query.matches(parseResult.tree.rootNode)
  
  // Query pattern example:
  dataflow: `
    ; Variable assignments (const config = DEFAULT_ERROR_CONFIG)
    (variable_declarator 
      name: (identifier) @var_name 
      value: (identifier) @var_value) @variable_assignment
    
    ; Property access (config.maxRetries)
    (member_expression 
      object: (identifier) @object 
      property: (property_identifier) @property) @property_access
  `
}
```

### **Configuration-Driven Language Support**
```typescript
// Pattern: Unified configuration for all supported languages
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    name: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx'], // Unified: TS parser handles JS too
    wasmFile: 'tree-sitter-typescript.wasm',
    queries: {
      symbols: `...`,    // Element extraction queries
      imports: `...`,    // Import detection queries  
      exports: `...`,    // Export detection queries
      comments: `...`,   // Comment extraction queries
      dataflow: `...`    // Data flow analysis queries
    }
  }
}
```

### **Effect-TS Error Handling with Tagged Unions**
```typescript
// Pattern: Structured error handling throughout storage operations
export type VibeError = 
  | StorageError 
  | ConfigError 
  | ProcessingError 
  | NetworkError

// Usage in database operations
const createRecord = (data: any): Effect.Effect<any, VibeError> => {
  return pipe(
    withDatabase(db => db.create('code_elements', data)),
    Effect.catchAll(error => {
      if (error._tag === 'StorageError') {
        return Effect.fail(createProcessingError(error, 'create', 'Failed to create record'))
      }
      return Effect.fail(error)
    })
  )
}
```

### **Development vs Production Mode Detection**
```typescript
// Pattern: Runtime environment detection for WASM file resolution
export const resolveWasmPath = async (language: string): Promise<string> => {
  const isCompiled = !import.meta.url.startsWith('file:///')
  
  if (isCompiled) {
    // Production: Look for installer-provided WASM files
    const dataPath = `./data/${config.wasmFile}`
  } else {
    // Development: Use Deno's npm cache
    const cacheBase = `${Deno.env.get('HOME')}/.cache/deno/npm/registry.npmjs.org`
  }
}
```

### **Batch Operations with Concurrency Control**
```typescript
// Pattern: Efficient batch processing with controlled concurrency
const processBatch = async (items: any[], batchSize = 100): Effect.Effect<any[], VibeError> => {
  return pipe(
    Effect.forEach(
      chunk(items, batchSize),
      batch => withDatabase(db => 
        Promise.all(batch.map(item => db.create('table', item)))
      ),
      { concurrency: 3 } // Process 3 batches concurrently
    ),
    Effect.map(batches => batches.flat())
  )
}
```

### **Smart Deduplication with Priority-Based Selection**
```typescript
// Pattern: Intelligent deduplication based on element type priority
const elementMap = new Map<string, CodeElementData>()

for (const element of elements) {
  const key = `${element.file_path}:${element.element_name}`
  const existing = elementMap.get(key)
  
  if (!existing) {
    elementMap.set(key, element)
  } else {
    // Prefer exports over other types for the same element
    const preferenceOrder = ['export', 'function', 'class', 'interface', 'type', 'variable', 'import']
    const existingPref = preferenceOrder.indexOf(existing.element_type)
    const currentPref = preferenceOrder.indexOf(element.element_type)
    
    if (currentPref < existingPref) {
      elementMap.set(key, element) // Replace with higher priority element
    }
  }
}
```

### **SurrealDB Parameterized Query Pattern**
```typescript
// Pattern: Always use parameterized queries for security and performance
const searchElements = (searchTerm: string): Effect.Effect<any[], VibeError> => {
  return withDatabase(async db => {
    // ✅ Good: Parameterized query
    const [result] = await db.query(`
      SELECT * FROM code_elements 
      WHERE element_name ~ $searchPattern 
      OR search_phrases && [$searchTerm]
      ORDER BY similarity::cosine(content_embedding, $embedding) DESC
    `, {
      searchPattern: `.*${searchTerm}.*`,
      searchTerm,
      embedding: await generateEmbedding(searchTerm)
    })
    
    return result
  })
}
```

## 🚀 **Performance Patterns**

### **Semantic Search with Vector Similarity**
```surrealql
-- Pattern: Combining text search with vector similarity
SELECT *, 
  similarity::cosine(content_embedding, $query_embedding) as similarity_score,
  search_phrases
FROM code_elements 
WHERE element_name ~ $name_pattern 
  OR search_phrases && $search_terms
ORDER BY similarity_score DESC 
LIMIT 10;
```

### **Graph Traversal with Filtered Relationships**
```surrealql
-- Pattern: Efficient relationship traversal with filtering
SELECT `to` as dependency 
FROM structural_relationship 
WHERE `from` ~ $file_pattern 
  AND `to` !~ $file_pattern  -- External dependencies only
  AND relationship_type = 'imports'
  AND complexity_score < $max_complexity;
```

---

**Key Takeaway**: SurrealDB uses different syntax than traditional SQL. Reserved keywords must be escaped, LIKE is not supported (use regex `~`), and graph traversal has specific operators. The codebase demonstrates advanced patterns for Effect-TS integration, hybrid ID schemes, and performance-optimized queries. Always refer to this guide when writing queries for the storage system.