# Component Refactoring Journey - Next Phase

## 🎯 **Current Status: Infrastructure → Agent Layer Refactoring**

### **✅ COMPLETED - Infrastructure Layer (100%)**
1. **✅ Three-Phase Graph Storage System** - `src/infra/storage.ts` 
   - ✅ Production-deployed three-phase architecture
   - ✅ Smart placeholder creation with semantic filtering
   - ✅ Edge-based resolution tracking  
   - ✅ 100% semantic database integrity
   - ✅ Cross-file relationship resolution
   - **Status**: PRODUCTION COMPLETE

2. **✅ Unified Infrastructure** - `src/infra/` 
   - ✅ Complete rename from `src/core/` to `src/infra/`
   - ✅ Single source of truth for all primitives
   - ✅ Effect-TS error handling with tagged unions
   - ✅ Comprehensive README with debugging methodology
   - **Status**: PRODUCTION COMPLETE

### **🚀 NEXT PHASE - Agent Layer Modernization**

## 📋 **PHASE 1: Agent Layer Modernization (Priority: HIGH)**

The infrastructure layer is complete. Now we focus on modernizing the agent layer to use the new infrastructure primitives and eliminate duplication.

### **Current Agent Layer Analysis**
```
src/agent/
├── indexing.ts          # 🔴 Needs migration to src/infra/storage.ts
├── llm.ts               # 🟡 Partially uses src/infra/embeddings.ts  
├── progress.ts          # 🟢 Can stay (UI concern)
├── conversation.ts      # 🟡 Needs src/infra integration
├── windowing.ts         # 🟡 Needs src/infra integration
└── ast-discovery.ts     # 🔴 Duplicate of src/infra/ast.ts functionality
```

### **1.1 Modernize Agent Indexing** - `src/agent/indexing.ts`
**Status**: 🔴 **NEEDS REFACTORING** - Uses old patterns, duplicates storage logic  
**Current Issues**: 
- Direct database operations instead of using `src/infra/storage.ts`
- Custom relationship logic instead of three-phase system
- Manual placeholder management

**Migration Strategy**:
```typescript
// ❌ Current approach (agent/indexing.ts)
const db = await connectToDatabase()
const elements = await parseAndExtract(content)
await db.query(`INSERT INTO code_elements ...`)

// ✅ New approach (use infra)
import { indexFile } from '../infra/storage.ts'
const result = await Effect.runPromise(
  indexFile(filePath, projectPath)
)
```

**Required Changes**:
1. **Replace direct database calls** with `src/infra/storage.ts` operations
2. **Use three-phase indexing** instead of custom logic
3. **Remove duplicate AST parsing** - use `src/infra/ast.ts`
4. **Integrate with project-aware operations**

### **1.2 Modernize Agent LLM Integration** - `src/agent/llm.ts`
**Status**: 🟡 **PARTIAL MIGRATION NEEDED** - Uses some infra, needs more integration  
**Current Issues**:
- Mixed use of old and new embedding patterns
- Direct database access for some operations
- Missing project-aware context

**Migration Strategy**:
```typescript
// ❌ Mixed approach
import { generateSingleEmbedding } from '../infra/embeddings.ts'
const db = await connectToDatabase() // Direct access

// ✅ Full infra integration
import { generateSingleEmbedding } from '../infra/embeddings.ts'
import { withProjectDatabase } from '../infra/storage.ts'
```

**Required Changes**:
1. **Use only infra embedding functions** - no direct Google AI calls
2. **Use project-aware database operations** from `src/infra/storage.ts`
3. **Leverage three-phase relationship data** for LLM context

### **1.3 Eliminate AST Discovery Duplication** - `src/agent/ast-discovery.ts`
**Status**: 🔴 **NEEDS ELIMINATION** - Duplicates `src/infra/ast.ts` functionality  
**Current Issues**:
- Completely overlaps with `src/infra/ast.ts` capabilities
- Uses old parsing patterns
- Missing relationship discovery

**Migration Strategy**:
```typescript
// ❌ Current (agent/ast-discovery.ts) - DELETE
export const discoverElements = async (content: string) => {
  // Custom AST parsing logic
}

// ✅ Use infra instead
import { parseFileWithRelationships } from '../infra/ast.ts'
const result = await Effect.runPromise(
  parseFileWithRelationships(content, 'typescript', filePath)
)
```

**Required Changes**:
1. **DELETE `src/agent/ast-discovery.ts`** entirely
2. **Update all imports** to use `src/infra/ast.ts`
3. **Leverage relationship discovery** from infra
4. **Use project-aware parsing** capabilities

## 📋 **PHASE 2: CLI Command Integration (Priority: MEDIUM)**

### **2.1 Modernize Index Command** - `src/commands/index.ts`
**Status**: 🟡 **PARTIAL MIGRATION NEEDED** - Uses some agent layer, needs direct infra  
**Current Issues**:
- Goes through agent layer instead of direct infra usage
- Missing project-aware capabilities
- No three-phase indexing integration

**Migration Strategy**:
```typescript
// ❌ Current approach
import { indexPath } from '../agent/indexing.ts'

// ✅ Direct infra usage
import { indexFile, getProjectCompletionStats } from '../infra/storage.ts'
import { findProjectRoot } from '../infra/storage.ts'
```

**Required Changes**:
1. **Use `src/infra/storage.ts` directly** for indexing operations
2. **Add project-aware CLI flags** (`--project-path`)
3. **Show completion metrics** after indexing
4. **Integrate with three-phase system**

### **2.2 Modernize Query Command** - `src/commands/query.ts`  
**Status**: 🟡 **PARTIAL MIGRATION NEEDED** - Uses basic search, needs relationship traversal  
**Current Issues**:
- Simple text search instead of graph traversal
- No relationship-based queries
- Missing project context

**Migration Strategy**:
```typescript
// ❌ Current approach
const results = await searchText(query)

// ✅ Graph-aware queries
import { findElementCallers, findElementsByName, searchElements } from '../infra/storage.ts'
const results = await Effect.runPromise(
  searchElements(query, projectPath, { limit: 10 })
)
```

**Required Changes**:
1. **Add graph traversal options** (--callers, --callees, --relationships)
2. **Use project-aware search** from `src/infra/storage.ts`
3. **Show relationship context** in results
4. **Add completion-based filtering**

## 📋 **PHASE 3: Testing & Validation (Priority: LOW)**

### **3.1 Agent Layer Migration Tests**
**Status**: 🔴 **MISSING** - Critical for migration validation  
**Files to Create**:
- `tests/agent/indexing.test.ts` - Validate infra integration
- `tests/agent/llm.test.ts` - Validate embedding integration  
- `tests/integration/agent-migration.test.ts` - Full workflow validation

**Test Strategy**:
1. **Before/After Tests**: Compare old vs new agent behavior
2. **Integration Tests**: Agent + infra interaction
3. **Performance Tests**: Ensure no regressions
4. **CLI Tests**: Validate command behavior

### **3.2 End-to-End Workflow Validation**
**Status**: 🔴 **MISSING** - Critical for production readiness  
**Validation Targets**:
- Complete indexing workflow with new agent layer
- Query performance with graph traversal
- Project completion metrics accuracy
- Cross-file relationship resolution

## 🎯 **DETAILED IMPLEMENTATION PLAN**

### **Step 1: Agent Indexing Migration (ETA: 2-3 hours)**
1. **Analyze current `src/agent/indexing.ts`** - Understand existing patterns
2. **Replace database operations** - Use `src/infra/storage.ts` functions
3. **Remove custom AST logic** - Use `src/infra/ast.ts` parsing
4. **Integrate three-phase system** - Use `indexFile()` with project awareness
5. **Update imports throughout codebase** - Point to modernized agent
6. **Test with real files** - Validate migration works
7. **Write migration tests** - `tests/agent/indexing.test.ts`

### **Step 2: LLM Integration Cleanup (ETA: 1-2 hours)**
1. **Review `src/agent/llm.ts`** - Identify infra integration gaps
2. **Remove direct database access** - Use `withProjectDatabase()`
3. **Standardize embedding usage** - Only use `src/infra/embeddings.ts`
4. **Add project-aware context** - Leverage three-phase data
5. **Update conversation management** - Use infra patterns
6. **Test LLM integration** - Validate embedding and database usage

### **Step 3: AST Discovery Elimination (ETA: 1 hour)**
1. **Delete `src/agent/ast-discovery.ts`** - Complete elimination
2. **Update all imports** - Point to `src/infra/ast.ts`
3. **Verify functionality** - Ensure no feature loss
4. **Update tests** - Remove ast-discovery tests
5. **Clean up dead code** - Remove unused functions

### **Step 4: CLI Command Integration (ETA: 1-2 hours)**
1. **Modernize `src/commands/index.ts`** - Direct infra usage
2. **Modernize `src/commands/query.ts`** - Graph-aware queries
3. **Add project-aware flags** - `--project-path` support
4. **Show completion metrics** - Project health indicators
5. **Test CLI commands** - End-to-end workflow validation

## 🚀 **SUCCESS CRITERIA - Agent Layer Modernization**

### **✅ Phase 1 Complete When (Agent Layer)**:
- [ ] `src/agent/indexing.ts` uses only `src/infra/storage.ts` operations
- [ ] `src/agent/llm.ts` uses only `src/infra/embeddings.ts` functions
- [ ] `src/agent/ast-discovery.ts` is completely deleted
- [ ] All agent imports point to `src/infra/` modules
- [ ] Zero duplicate AST/storage/embedding logic in agent layer

### **✅ Phase 2 Complete When (CLI Integration)**:
- [ ] `./vibe index` uses three-phase indexing with project awareness
- [ ] `./vibe query` uses graph traversal and relationship queries
- [ ] CLI commands show completion metrics and project health
- [ ] All commands support `--project-path` flag
- [ ] End-to-end workflow uses modernized agent layer

### **✅ Phase 3 Complete When (Testing & Validation)**:
- [ ] Agent migration tests validate before/after behavior
- [ ] Performance benchmarks show no regressions
- [ ] End-to-end tests cover complete workflow
- [ ] All imports updated throughout codebase

## 📊 **CURRENT TECHNICAL STATE**

### **✅ Infrastructure Layer (COMPLETE)**:
1. **Three-Phase Graph Storage** - `src/infra/storage.ts` 
   - ✅ Production-deployed with semantic integrity
   - ✅ Edge-based resolution tracking
   - ✅ Project-aware operations with completion metrics
   - ✅ Cross-file relationship resolution working

2. **Complete Infrastructure** - `src/infra/`
   - ✅ `storage.ts` - Three-phase graph database system
   - ✅ `ast.ts` - Tree-sitter parsing with relationship discovery
   - ✅ `embeddings.ts` - Google Gemini integration
   - ✅ `errors.ts` - Tagged union error system
   - ✅ `logger.ts` - Structured logging system
   - ✅ `README.md` - Comprehensive documentation

### **🔴 Agent Layer (NEEDS MODERNIZATION)**:
1. **Duplicate Logic** - `src/agent/`
   - 🔴 `indexing.ts` - Custom storage logic (should use infra)
   - 🔴 `ast-discovery.ts` - Duplicate AST parsing (should delete)
   - 🟡 `llm.ts` - Mixed infra integration (needs cleanup)
   - 🟡 `conversation.ts` - Needs infra integration
   - 🟡 `windowing.ts` - Needs infra integration

2. **CLI Commands** - `src/commands/`
   - 🟡 `index.ts` - Uses agent layer (should use infra directly)
   - 🟡 `query.ts` - Basic search (needs graph traversal)
   - ⚪ Missing project-aware flags and completion metrics

## 🔧 **DEVELOPMENT WORKFLOW**

### **For Agent Layer Migration**:
1. **Analyze current file** - Understand existing patterns and dependencies
2. **Replace with infra imports** - Use `src/infra/` modules only
3. **Remove duplicate logic** - Delete custom implementations
4. **Test migration** - Validate functionality preserved
5. **Update imports** - Fix all references throughout codebase

### **Tools Available**:
- **Infrastructure CLI** - `deno run --allow-all src/infra/storage.ts <command>`
- **AST Testing** - `deno run --allow-all src/infra/ast.ts parse-file <file>`
- **Database Validation** - `surreal sql` for direct database queries
- **Test Suite** - `deno test --allow-all` for validation
- **Type Checking** - `deno check` for TypeScript validation

## 🚨 **CRITICAL NEXT STEPS**

1. **Start with Agent Indexing Migration** - Highest impact, most duplication
2. **Delete AST Discovery** - Quick win, complete elimination  
3. **Clean up LLM Integration** - Remove mixed patterns
4. **Modernize CLI Commands** - Direct infra usage
5. **Validate end-to-end** - Ensure no feature loss

---

**📍 Current Position**: Infrastructure complete, agent layer needs modernization  
**🎯 Next Milestone**: Zero duplication between agent and infra layers  
**⏱️ Estimated Time to Complete**: 5-7 hours of focused refactoring  
**🔥 Priority**: Agent indexing → AST discovery deletion → LLM cleanup → CLI modernization

**A new agent can pick up from here by:**
1. Reading this roadmap for complete context
2. **Reading `src/infra/README.md`** for complete infrastructure capabilities
3. **Analyzing `src/agent/indexing.ts`** to understand current patterns
4. **Starting with Step 1** of the detailed implementation plan
5. Following the agent layer modernization strategy
6. Using the three-phase storage system for all database operations