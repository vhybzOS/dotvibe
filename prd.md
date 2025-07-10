# Product Requirements Document

## Feature: Database Persistence Resolution for Intelligent Indexing System
**Status**: planned
**Priority**: critical
**Created**: 2025-07-10
**Last Updated**: 2025-07-10

### Description
**CRITICAL PRODUCTION BLOCKER**: The intelligent indexing system is 99% functional with perfect LLM conversation flow, symbol extraction, and semantic description generation. However, database persistence is failing with SurrealDB transaction errors, preventing symbol storage and making the query system non-functional.

**Current State**: LLM successfully generates intelligent symbol descriptions (e.g., "Zod schema for defining query data structure") but all `create_index_entry` operations fail with: `"There was a problem with a datastore transaction: IO error: No such file or directory: while stat a file for size: /home/keyvan/.vibe/dotvibe/.vibe/code.db/000010.blob"`

### Acceptance Criteria
**Phase 1: Database Investigation & Diagnosis**
- [ ] Analyze SurrealDB transaction error patterns and root cause
- [ ] Investigate database file integrity and corruption issues
- [ ] Test manual record insertion via SurrealDB CLI to isolate issue
- [ ] Verify schema field requirements and data format compatibility
- [ ] Check database file permissions and storage directory access

**Phase 2: Database Connection & Schema Fixes**
- [ ] Fix SurrealDB server startup and connection stability issues
- [ ] Resolve schema field validation errors (missing required fields)
- [ ] Test database persistence with minimal test records
- [ ] Validate UPSERT operations with correct record ID format
- [ ] Ensure proper database cleanup and transaction handling

**Phase 3: Production Validation**
- [ ] Execute successful end-to-end indexing workflow: `./vibe index src/index.ts`
- [ ] Verify symbol storage in database with manual SQL queries
- [ ] Test semantic search functionality: `./vibe query "configuration error"`
- [ ] Validate conversation history preservation and LLM context building
- [ ] Confirm 100x context compression with real data

### Implementation Notes

#### **Root Cause Analysis Required**
**Primary Investigation Areas**:

1. **Database Transaction Errors** ([`src/mastra/tools/code_analysis_tools.ts:240-280`](./src/mastra/tools/code_analysis_tools.ts))
   - Error: `IO error: No such file or directory: while stat a file for size: .vibe/code.db/000010.blob`
   - Investigate SurrealDB file-based storage corruption
   - Check database initialization sequence and schema creation timing

2. **Schema Validation Issues** ([`src/database.ts:94-140`](./src/database.ts))
   - Verify all required fields present in UPSERT operations
   - Test manual record creation via SurrealDB CLI
   - Validate embedding array format and data types

3. **Server Connection Stability** ([`src/surreal-server.ts:64-157`](./src/surreal-server.ts))
   - Investigate background server startup reliability
   - Check PID file management and process lifecycle
   - Verify port binding and health check mechanisms

#### **Technical Approach**

**Step 1: Isolate Database Issues**
```bash
# Test manual record insertion
echo "CREATE code_symbols:\`test\` CONTENT { 
  file_path: 'test.ts', 
  symbol_name: 'Test', 
  symbol_kind: 'interface',
  start_line: 1,
  end_line: 5,
  content_hash: 'abc123',
  description: 'Test symbol',
  embedding: [0.1, 0.2, 0.3]
};" | surreal sql --endpoint http://127.0.0.1:4244 --username root --password root --namespace vibe --database code
```

**Step 2: Fix UPSERT Operation** ([`src/mastra/tools/code_analysis_tools.ts:254-280`](./src/mastra/tools/code_analysis_tools.ts))
- Current UPSERT may have incorrect field mappings
- Verify record ID format: `code_symbols:⟨$record_id⟩`
- Ensure all schema fields are provided in correct data types

**Step 3: Database Cleanup Strategy**
```bash
# Clean restart procedure
./vibe stop
rm -rf .vibe/
./vibe init
# Test with single symbol insertion
```

#### **Working System Components (99% Functional)**

**✅ Perfect LLM Intelligence**:
- **Conversation Flow**: 21 messages, 9,732 chars conversation history
- **Symbol Discovery**: Found 21 symbols in `src/index.ts` with accurate parsing
- **Semantic Descriptions**: Generated sophisticated descriptions like:
  - `QueryDataSchema`: "Zod schema for defining query data structure with text and metadata fields"
  - `createConfigurationError`: "Creates ConfigurationError object from unknown error with optional details"
  - `VibeError`: "TypeScript union type combining all possible errors within Vibe system"

**✅ Tool Execution Pipeline**:
- `list_filesystem()`: Returns full paths, eliminating LLM confusion ✅
- `read_file()`: Loads file content successfully ✅
- `list_symbols_in_file()`: Tree-sitter parsing working perfectly ✅  
- `get_symbol_details()`: Symbol extraction operational ✅
- `create_index_entry()`: **ONLY THIS FAILS** with database errors ❌

**✅ Infrastructure**:
- Google AI SDK v1.9.0 function calling: 100% operational
- Tree-sitter TypeScript parsing: WASM loading successful
- Effect-TS composition: Error handling working
- CLI commands: All 6 commands functional
- Query system: Ready for data (schema exists, no records)

#### **Expected Outcome After Fix**

**Immediate Results**:
```bash
$ ./vibe index src/index.ts --verbose
# Should show successful symbol storage:
💾 Indexed: QueryDataSchema (variable)
💾 Indexed: VibeError (type_alias) 
💾 Indexed: createConfigurationError (function)
# ... (14+ symbols indexed successfully)

$ ./vibe query "configuration error"
# Should return:
📊 Found 2 results in 150ms
## Result 1 - src/index.ts
**Relevance:** 89.2% | **Similarity:** 89.2%
```typescript
createConfigurationError (function): Creates ConfigurationError object from unknown error with optional details
```
```

#### **File Reference Map for Investigation**

**Critical Files for Database Fix**:
- **Database Schema**: [`src/database.ts:94-140`](./src/database.ts) - Table definitions and field requirements
- **Index Entry Creation**: [`src/mastra/tools/code_analysis_tools.ts:240-280`](./src/mastra/tools/code_analysis_tools.ts) - UPSERT operation that's failing  
- **Server Management**: [`src/surreal-server.ts:64-157`](./src/surreal-server.ts) - Background server startup and lifecycle
- **Connection Logic**: [`src/database.ts:61-85`](./src/database.ts) - Effect-TS database connection with server management

**Validation Files**:
- **E2E Test**: [`tests/indexing-e2e.test.ts`](./tests/indexing-e2e.test.ts) - Last test fails on database persistence
- **Integration Test**: [`tests/google-ai-integration.test.ts`](./tests/google-ai-integration.test.ts) - Validates LLM components work

**Architecture Reference**:
- **System Overview**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) - Complete system understanding for cold start
- **Development Guidelines**: [`CLAUDE.md:182-489`](./CLAUDE.md) - Technical implementation patterns

### User Stories
- As a developer, I want `./vibe index src/` to successfully store all discovered symbols in the database
- As a developer, I want `./vibe query "error handling"` to return relevant symbol descriptions from stored data
- As a developer, I want reliable database persistence so the intelligent indexing system is production-ready
- As a developer, I want the 100x context compression to work end-to-end with real data storage and retrieval

### Success Criteria
**Definition of Done**:
1. **Database Persistence Working**: All `create_index_entry` operations succeed
2. **End-to-End Flow**: `./vibe index` → database storage → `./vibe query` → semantic results
3. **Data Validation**: Manual SQL queries show stored symbols with embeddings
4. **Production Ready**: System handles real codebase indexing without transaction errors
5. **Performance Maintained**: ~150ms query time, successful symbol extraction, conversation flow preservation

**Critical Success Indicator**:
```bash
$ ./vibe index src/index.ts && ./vibe query "configuration"
# Expected: Successful indexing + semantic search results returned
```