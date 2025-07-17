# Core Data Specifications - Graph Database Architecture

## 🎯 **Overview**

This document provides complete specifications for the graph database infrastructure that serves as the foundation for the AI coding agent system. The core provides "infra" while the agent layer provides "intelligence".

## 📋 **Context & Research**

### **Problem Analysis**
- **Current State**: Analyzed in `src/infra/storage.ts` (lines 1-667) - Complex storage with legacy tables and hardcoded embeddings
- **Agent Requirements**: Analyzed all files in `src/agent/` directory - Need batch operations, relationship discovery, LLM integration
- **User Vision**: "World map of code" with human-centric blocks, "who-calls-who" navigation, data flow tracking

### **Key Files Analyzed**

| File | Purpose | Key Findings |
|------|---------|-------------|
| `src/infra/storage.ts` | Current storage implementation | Legacy tables, 768-dim embeddings, no relationships |
| `src/infra/ast.ts` | AST parsing utilities | Symbol extraction, TODO: imports/exports |
| `src/agent/indexing.ts` | LLM-first indexing | Needs batch operations, parallel processing |
| `src/agent/ast-discovery.ts` | AST discovery | Real filesystem operations, symbol filtering |
| `src/agent/llm.ts` | LLM integration | Clean separation from database operations |
| `scripts/mock-google.ts` | Embedding generation | Real Google API calls, deterministic mocks |

## 🗄️ **Database Schema Design**

### **Single Unified Graph Schema**

```sql
-- NODES: Code Elements (replaces code_symbols, file_metadata, workspace_info)
CREATE TABLE code_elements SCHEMAFULL;

-- Core identification
DEFINE FIELD file_path ON code_elements TYPE string;
DEFINE FIELD element_name ON code_elements TYPE string;
DEFINE FIELD element_type ON code_elements TYPE string ASSERT $value IN [
  'function', 'class', 'interface', 'variable', 'import', 'export', 
  'method', 'field', 'type', 'enum', 'block'
];

-- Location information
DEFINE FIELD start_line ON code_elements TYPE int;
DEFINE FIELD end_line ON code_elements TYPE int;
DEFINE FIELD start_column ON code_elements TYPE int;
DEFINE FIELD end_column ON code_elements TYPE int;

-- Content
DEFINE FIELD content ON code_elements TYPE string;
DEFINE FIELD content_hash ON code_elements TYPE string; -- SHA-256 for idempotency

-- Multi-level embeddings (configurable dimensions)
DEFINE FIELD content_embedding ON code_elements TYPE array<float>;      -- Raw code embedding
DEFINE FIELD semantic_embedding ON code_elements TYPE array<float>;     -- LLM description embedding
DEFINE FIELD llm_description ON code_elements TYPE string;              -- Human-readable explanation
DEFINE FIELD search_phrases ON code_elements TYPE array<string>;        -- Discoverability keywords

-- Extensible metadata
DEFINE FIELD metadata ON code_elements TYPE object;                     -- Flexible future extension
DEFINE FIELD visibility ON code_elements TYPE option<string>;           -- public, private, protected
DEFINE FIELD exported ON code_elements TYPE bool DEFAULT false;
DEFINE FIELD async ON code_elements TYPE bool DEFAULT false;
DEFINE FIELD parameters ON code_elements TYPE option<array<string>>;
DEFINE FIELD return_type ON code_elements TYPE option<string>;

-- Timestamps
DEFINE FIELD created_at ON code_elements TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON code_elements TYPE datetime DEFAULT time::now();

-- Indexes for performance
DEFINE INDEX file_path_idx ON code_elements COLUMNS file_path;
DEFINE INDEX element_name_idx ON code_elements COLUMNS element_name;
DEFINE INDEX element_type_idx ON code_elements COLUMNS element_type;
DEFINE INDEX content_hash_idx ON code_elements COLUMNS content_hash UNIQUE;
DEFINE INDEX content_embedding_idx ON code_elements COLUMNS content_embedding MTREE DIMENSION 768;
DEFINE INDEX semantic_embedding_idx ON code_elements COLUMNS semantic_embedding MTREE DIMENSION 768;

-- EDGES: Structural Relationships
CREATE TABLE structural_relationship SCHEMAFULL TYPE RELATION IN code_elements OUT code_elements;

DEFINE FIELD relationship_type ON structural_relationship TYPE string ASSERT $value IN [
  'calls', 'imports', 'extends', 'implements', 'contains', 'exports', 'uses'
];

-- Context information
DEFINE FIELD context ON structural_relationship TYPE object;             -- Call site, parameters, etc.
DEFINE FIELD call_site_line ON structural_relationship TYPE option<int>;
DEFINE FIELD parameters_passed ON structural_relationship TYPE option<array<string>>;
DEFINE FIELD conditional ON structural_relationship TYPE bool DEFAULT false;

-- LLM-enriched relationship understanding
DEFINE FIELD semantic_description ON structural_relationship TYPE string;     -- WHY this relationship exists
DEFINE FIELD relationship_embedding ON structural_relationship TYPE array<float>; -- Semantic search on relationships
DEFINE FIELD architectural_purpose ON structural_relationship TYPE string;    -- What it solves architecturally
DEFINE FIELD complexity_score ON structural_relationship TYPE float DEFAULT 0.0; -- Relationship complexity (0-1)

-- Timestamps
DEFINE FIELD created_at ON structural_relationship TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON structural_relationship TYPE datetime DEFAULT time::now();

-- EDGES: Data Flow Relationships
CREATE TABLE data_flow SCHEMAFULL TYPE RELATION IN code_elements OUT code_elements;

DEFINE FIELD flow_type ON data_flow TYPE string ASSERT $value IN [
  'parameter_input', 'return_output', 'argument_passing', 'assignment', 
  'property_access', 'transformation', 'side_effect'
];

-- Type and flow information
DEFINE FIELD type_annotation ON data_flow TYPE option<string>;
DEFINE FIELD flow_metadata ON data_flow TYPE object;
DEFINE FIELD parameter_name ON data_flow TYPE option<string>;
DEFINE FIELD parameter_position ON data_flow TYPE option<int>;
DEFINE FIELD property_path ON data_flow TYPE option<string>;
DEFINE FIELD assignment_site ON data_flow TYPE option<string>;

-- LLM-enriched data flow understanding
DEFINE FIELD data_transformation_description ON data_flow TYPE string;        -- HOW data is transformed
DEFINE FIELD data_flow_embedding ON data_flow TYPE array<float>;              -- Semantic search on data flow
DEFINE FIELD business_logic_purpose ON data_flow TYPE string;                 -- WHAT business problem it solves
DEFINE FIELD side_effects ON data_flow TYPE array<string>;                    -- What side effects occur
DEFINE FIELD data_shape_before ON data_flow TYPE option<string>;              -- Input data structure
DEFINE FIELD data_shape_after ON data_flow TYPE option<string>;               -- Output data structure

-- Timestamps
DEFINE FIELD created_at ON data_flow TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON data_flow TYPE datetime DEFAULT time::now();
```

## 🔧 **Core Infrastructure Modules**

### **1. Graph Storage Module** (`src/infra/graph-storage.ts`)

**Purpose**: Unified graph database operations with SurrealDB  
**Replaces**: Current `src/infra/storage.ts`  
**Pattern**: Higher-order functions with Effect-TS composition

```typescript
// HOF for database operations
export const withGraphDatabase = <T>(
  operation: (db: DatabaseConnection) => Promise<T>
): Effect.Effect<T, VibeError>

// HOF for batch operations
export const withGraphTransaction = <T>(
  operations: Array<(db: DatabaseConnection) => Promise<T>>
): Effect.Effect<T[], VibeError>

// Core operations
export const createCodeElement: (data: CodeElementData) => Effect.Effect<string, VibeError>
export const createRelationship: (data: RelationshipData) => Effect.Effect<string, VibeError>
export const createBatch: (elements: CodeElementData[], relationships: RelationshipData[]) => Effect.Effect<BatchResult, VibeError>
export const searchCodeElements: (query: string, options?: SearchOptions) => Effect.Effect<CodeElement[], VibeError>
export const traverseGraph: (startId: string, query: GraphQuery) => Effect.Effect<GraphTraversal, VibeError>
```

### **2. AST Analyzer Module** (`src/infra/ast-analyzer.ts`)

**Purpose**: Enhanced AST processing with relationship discovery  
**Enhances**: Current `src/infra/ast.ts`  
**Pattern**: Higher-order functions for parsing and analysis

```typescript
// HOF for parser operations
export const withTreeSitterParser = <T>(
  language: string,
  processor: (parser: Parser) => Promise<T>
): Effect.Effect<T, VibeError>

// Enhanced parsing with relationships
export const parseFileWithRelationships: (content: string, language: string) => Effect.Effect<FileParseResult, VibeError>
export const discoverRelationships: (parseResult: ParseResult) => Effect.Effect<Relationship[], VibeError>
export const analyzeDataFlow: (parseResult: ParseResult) => Effect.Effect<DataFlowRelationship[], VibeError>
export const detectBlocks: (content: string) => Effect.Effect<BlockStructure[], VibeError>
```

### **3. Embedding Service Module** (`src/infra/embedding-service.ts`)

**Purpose**: Multi-level embedding generation with configurable dimensions  
**Replaces**: Embedding logic in current `src/infra/embeddings.ts`  
**Pattern**: Higher-order functions with caching and batching

```typescript
// HOF for embedding operations
export const withEmbeddingGeneration = <T>(
  processor: (generateEmbedding: (text: string) => Promise<number[]>) => Promise<T>
): Effect.Effect<T, VibeError>

// Multi-level embedding generation
export const generateCodeEmbedding: (content: string) => Effect.Effect<number[], VibeError>
export const generateSemanticEmbedding: (description: string) => Effect.Effect<number[], VibeError>
export const generateRelationshipEmbedding: (description: string) => Effect.Effect<number[], VibeError>
export const generateBatchEmbeddings: (texts: string[]) => Effect.Effect<number[][], VibeError>

// Configuration
export const configureEmbeddings: (dimensions: number, model: string) => Effect.Effect<void, VibeError>
```

### **4. Relationship Builder Module** (`src/infra/relationship-builder.ts`)

**Purpose**: Single-pass relationship discovery and enrichment  
**New Module**: Not in current codebase  
**Pattern**: HOF for graph construction

```typescript
// HOF for relationship building
export const withRelationshipBuilder = <T>(
  builder: (addElement: (element: CodeElementData) => void, addRelationship: (rel: RelationshipData) => void) => Promise<T>
): Effect.Effect<T, VibeError>

// Single-pass graph construction
export const buildGraphFromFile: (filePath: string) => Effect.Effect<GraphBuildResult, VibeError>
export const buildGraphFromDirectory: (directoryPath: string) => Effect.Effect<GraphBuildResult, VibeError>
export const enrichRelationshipsWithLLM: (relationships: Relationship[]) => Effect.Effect<EnrichedRelationship[], VibeError>
```

## 📊 **Data Types and Interfaces**

### **Core Data Types**

```typescript
// Node data structure
export interface CodeElementData {
  file_path: string
  element_name: string
  element_type: ElementType
  start_line: number
  end_line: number
  start_column?: number
  end_column?: number
  content: string
  description?: string
  search_phrases?: string[]
  metadata?: Record<string, any>
  visibility?: 'public' | 'private' | 'protected'
  exported?: boolean
  async?: boolean
  parameters?: string[]
  return_type?: string
}

// Edge data structure
export interface RelationshipData {
  from: string
  to: string
  relationship_type: RelationshipType
  context?: Record<string, any>
  semantic_description?: string
  architectural_purpose?: string
  complexity_score?: number
}

// Data flow edge structure
export interface DataFlowRelationshipData {
  from: string
  to: string
  flow_type: DataFlowType
  type_annotation?: string
  flow_metadata?: Record<string, any>
  data_transformation_description?: string
  business_logic_purpose?: string
  side_effects?: string[]
}

// Enums
export type ElementType = 'function' | 'class' | 'interface' | 'variable' | 'import' | 'export' | 'method' | 'field' | 'type' | 'enum' | 'block'
export type RelationshipType = 'calls' | 'imports' | 'extends' | 'implements' | 'contains' | 'exports' | 'uses'
export type DataFlowType = 'parameter_input' | 'return_output' | 'argument_passing' | 'assignment' | 'property_access' | 'transformation' | 'side_effect'
```

### **Query and Result Types**

```typescript
// Search options
export interface SearchOptions {
  limit?: number
  threshold?: number
  element_type?: ElementType
  file_path_pattern?: string
  embedding_type?: 'content' | 'semantic' | 'both'
}

// Graph traversal
export interface GraphQuery {
  relationship_types?: RelationshipType[]
  max_depth?: number
  direction?: 'incoming' | 'outgoing' | 'both'
  filters?: Record<string, any>
}

// Results
export interface GraphTraversal {
  nodes: CodeElement[]
  edges: (StructuralRelationship | DataFlowRelationship)[]
  path: string[]
  depth: number
}

export interface BatchResult {
  elements: string[]
  relationships: string[]
  errors: string[]
}
```

## 🔍 **Example Queries**

### **Basic Node Operations**
```sql
-- Find all functions in a file
SELECT * FROM code_elements WHERE file_path = '/src/utils.ts' AND element_type = 'function';

-- Semantic search for authentication code
SELECT * FROM code_elements 
WHERE vector::similarity::cosine(semantic_embedding, $query_embedding) > 0.7
ORDER BY vector::similarity::cosine(semantic_embedding, $query_embedding) DESC;
```

### **Relationship Traversal**
```sql
-- Who calls this function?
SELECT * FROM code_elements:processUser 
<-structural_relationship[WHERE relationship_type = 'calls']<-code_elements;

-- What does this function call?
SELECT * FROM code_elements:processUser 
->structural_relationship[WHERE relationship_type = 'calls']->code_elements;

-- Find all validation functions
SELECT * FROM code_elements 
->structural_relationship[WHERE semantic_description ~ 'validation']->code_elements;
```

### **Data Flow Analysis**
```sql
-- What data flows through this function?
SELECT * FROM code_elements:processUser 
<-data_flow[WHERE flow_type = 'parameter_input']<-code_elements AS inputs,
->data_flow[WHERE flow_type = 'return_output']->code_elements AS outputs;

-- Full type flow chain
SELECT * FROM code_elements:UserData 
->data_flow->code_elements->data_flow->code_elements
WHERE flow_type IN ['argument_passing', 'assignment', 'return_output'];
```

## 🤖 **Agent Integration Points**

### **Clean Interfaces for Agent Layer**

The agent layer (`src/agent/`) provides intelligence while core provides infrastructure:

```typescript
// Agent uses core through these interfaces
export interface CoreInfrastructure {
  // Graph storage
  graphStorage: GraphStorageService
  
  // AST analysis
  astAnalyzer: ASTAnalyzer
  
  // Embedding generation
  embeddingService: EmbeddingService
  
  // Relationship building
  relationshipBuilder: RelationshipBuilder
}

// Agent provides LLM enrichment
export interface AgentEnrichment {
  // LLM description generation
  generateElementDescription: (element: CodeElementData) => Promise<string>
  
  // Relationship enrichment
  enrichRelationship: (from: CodeElement, to: CodeElement, rel: Relationship) => Promise<RelationshipEnrichment>
  
  // Data flow analysis
  analyzeDataFlowSemantics: (flow: DataFlowRelationship) => Promise<DataFlowEnrichment>
}
```

### **Agent Dependencies**

From analysis of `src/agent/` files:

- **`indexing.ts`**: Needs batch operations, parallel processing → Use `createBatch`
- **`ast-discovery.ts`**: Needs symbol extraction → Use `parseFileWithRelationships`
- **`llm.ts`**: Needs LLM integration → Stays in agent layer
- **`progress.ts`**: Needs progress tracking → Stays in agent layer
- **`tools.ts`**: Needs function calling → Stays in agent layer

## 📁 **File Structure**

```
src/infra/
├── graph-storage.ts        # Graph database operations (replaces storage.ts)
├── ast-analyzer.ts         # Enhanced AST processing (enhances ast.ts)
├── embedding-service.ts    # Multi-level embedding generation (new)
├── relationship-builder.ts # Single-pass relationship discovery (new)
├── config.ts              # Configuration management (existing, enhanced)
├── errors.ts              # Error handling (existing)
├── logger.ts              # Logging (existing)
└── data_specs.md          # This specification file

src/agent/
├── indexing.ts            # LLM-first indexing (existing)
├── llm.ts                 # LLM integration (existing)
├── progress.ts            # Progress tracking (existing)
├── tools.ts               # Function calling (existing)
└── ...                    # Other agent modules (existing)
```

## 🧪 **Testing Strategy**

### **Mock Data Generation**

Use `scripts/mock-google.ts` to generate real embedding data:

```bash
# Generate real embeddings for testing
deno run --allow-env --allow-net scripts/mock-google.ts --test-embeddings

# Generate mock embeddings for deterministic tests
deno run --allow-env --allow-net scripts/mock-google.ts --mock-embeddings
```

### **Test Data Structure**

Based on analysis of `scripts/mock-google.ts` (lines 370-540):

```typescript
// Use real embedding responses from Google API
export const REAL_EMBEDDING_RESPONSES = [
  {
    text: "export function main(): void { console.log('Hello, world!'); }",
    model: "text-embedding-004",
    embedding: [0.123456, -0.654321, ...], // 768 dimensions
    timestamp: 1699123456789
  },
  // ... more real responses
]

// Use deterministic mock embeddings for consistent tests
export const MOCK_EMBEDDING_RESPONSES = [
  {
    text: "export function main(): void { console.log('Hello, world!'); }",
    model: "text-embedding-004",
    embedding: [0.123456, -0.654321, ...], // Deterministic values
    length: 768
  },
  // ... more mock responses
]
```

## 🚀 **Implementation Roadmap**

### **Phase 1: Core Infrastructure**
1. Create `graph-storage.ts` with HOF patterns
2. Enhance `ast-analyzer.ts` with relationship discovery
3. Create `embedding-service.ts` with configurable dimensions
4. Update database schema to unified graph structure

### **Phase 2: Relationship Discovery**
1. Create `relationship-builder.ts` for single-pass graph construction
2. Implement structural relationship discovery
3. Add data flow analysis capabilities
4. Add block detection for human-readable organization

### **Phase 3: LLM Integration**
1. Integrate with agent layer for LLM enrichment
2. Add semantic descriptions to relationships
3. Generate embeddings for all levels (content, semantic, relationship)
4. Implement batch processing for agent efficiency

### **Phase 4: Query and Search**
1. Implement graph traversal queries
2. Add semantic search capabilities
3. Optimize performance with proper indexing
4. Add caching for frequently accessed data

## 🎯 **Success Criteria**

1. **Single Source of Truth**: All code knowledge in `code.db` graph database
2. **Efficient Queries**: Graph traversal for "who calls who" in O(log n)
3. **Semantic Search**: Find code by meaning, not just keywords
4. **Data Flow Tracking**: Understand how data transforms through the system
5. **Agent Ready**: Clean interfaces for LLM integration and batch operations
6. **Extensible**: Metadata fields and flexible schema for future enhancements

---

**This specification provides complete context for implementing the graph database architecture. Any agent coder can continue from this point with full understanding of the requirements, existing codebase, and implementation strategy.**