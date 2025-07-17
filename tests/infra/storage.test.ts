/**
 * Core Storage System Test Suite
 * Tests unified SurrealDB integration with battle-tested patterns
 * 
 * @tested_by tests/core/storage.test.ts (Database operations, Effect-TS integration, unified schema)
 */

import { assertEquals, assertExists, assertRejects, assertArrayIncludes } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { Effect } from 'effect'

import { 
  connectToDatabase,
  withDatabase,
  createDatabaseSchema,
  createIndexEntry,
  searchCodeSymbols,
  searchByVector,
  getSymbolsByPath,
  getSymbolsByKind,
  deleteSymbolsByPath,
  getDatabaseStats,
  StorageUtils,
  type CodeSymbolRecord,
  type FileMetadata,
  type WorkspaceInfo,
  type SearchOptions,
  type SearchResult,
  type DatabaseConnection,
  type StorageSchema
} from '../../src/infra/storage.ts'
import { createStorageError } from '../../src/infra/errors.ts'

describe('Core Storage System', () => {
  let testDb: DatabaseConnection | null = null
  const testNamespace = 'test-vibe'
  const testDatabase = 'test-code'
  
  beforeEach(async () => {
    // Connect to test database
    testDb = await connectToDatabase({
      host: '127.0.0.1',
      port: 4243,
      username: 'root',
      password: 'root',
      namespace: testNamespace,
      database: testDatabase
    })
    
    // Create test schema
    await createDatabaseSchema(testDb)
  })
  
  afterEach(async () => {
    if (testDb) {
      // Clean up test data
      await testDb.query('DELETE FROM code_symbols')
      await testDb.query('DELETE FROM file_metadata')
      await testDb.query('DELETE FROM workspace_info')
      await testDb.close()
      testDb = null
    }
  })

  describe('Database Connection Management', () => {
    it('should connect to SurrealDB with configuration', async () => {
      const db = await connectToDatabase({
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: 'test-connection',
        database: 'test-db'
      })
      
      assertExists(db)
      assertExists(db.query)
      assertExists(db.close)
      
      // Test basic query
      const result = await db.query('SELECT * FROM $table', { table: 'code_symbols' })
      assertExists(result)
      
      await db.close()
    })

    it('should handle connection errors gracefully', async () => {
      await assertRejects(
        () => connectToDatabase({
          host: 'nonexistent-host',
          port: 9999,
          username: 'invalid',
          password: 'invalid',
          namespace: 'test',
          database: 'test'
        }),
        Error
      )
    })

    it('should create database schema successfully', async () => {
      const db = await connectToDatabase({
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: 'test-schema',
        database: 'test-db'
      })
      
      await createDatabaseSchema(db)
      
      // Verify tables exist by querying info
      const tableInfo = await db.query('INFO FOR DB')
      assertExists(tableInfo)
      
      await db.close()
    })
  })

  describe('withDatabase() Higher-Order Function', () => {
    it('should manage database connections automatically', async () => {
      const config = {
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: testNamespace,
        database: testDatabase
      }
      
      const result = await Effect.runPromise(
        withDatabase(config, async (db) => {
          // Database should be available in the operation
          assertExists(db)
          assertExists(db.query)
          
          // Test query
          const queryResult = await db.query('SELECT * FROM code_symbols')
          return queryResult
        })
      )
      
      assertExists(result)
    })

    it('should handle database operation errors', async () => {
      const config = {
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: testNamespace,
        database: testDatabase
      }
      
      const operation = withDatabase(config, async (db) => {
        // Invalid query should cause error
        await db.query('INVALID SQL QUERY')
        return 'should not reach here'
      })
      
      await assertRejects(() => Effect.runPromise(operation))
    })

    it('should close database connections even on error', async () => {
      const config = {
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: testNamespace,
        database: testDatabase
      }
      
      let connectionUsed = false
      
      try {
        await Effect.runPromise(
          withDatabase(config, async (db) => {
            connectionUsed = true
            assertExists(db)
            throw new Error('Simulated error')
          })
        )
      } catch (error) {
        assertEquals(error.message, 'Simulated error')
        assertEquals(connectionUsed, true)
      }
    })
  })

  describe('Code Symbol Operations', () => {
    it('should create index entries for code symbols', async () => {
      const symbolData: Omit<CodeSymbolRecord, 'id'> = {
        path: 'src/test.ts',
        symbolName: 'testFunction',
        symbolKind: 'function_declaration',
        startLine: 10,
        endLine: 15,
        startColumn: 0,
        endColumn: 20,
        content: 'function testFunction() { return "test"; }',
        synthesizedDescription: 'A test function that returns a string',
        embedding: new Array(768).fill(0).map(() => Math.random())
      }
      
      const result = await Effect.runPromise(createIndexEntry(testDb!, symbolData))
      
      assertExists(result)
      assertExists(result.id)
      assertEquals(result.path, 'src/test.ts')
      assertEquals(result.symbolName, 'testFunction')
      assertEquals(result.symbolKind, 'function_declaration')
      assertEquals(result.startLine, 10)
      assertEquals(result.endLine, 15)
      assertEquals(result.content, 'function testFunction() { return "test"; }')
      assertEquals(result.synthesizedDescription, 'A test function that returns a string')
      assertEquals(result.embedding.length, 768)
    })

    it('should search code symbols by vector similarity', async () => {
      // Create test symbols
      const symbols = [
        {
          path: 'src/auth.ts',
          symbolName: 'authenticateUser',
          symbolKind: 'function_declaration',
          startLine: 5,
          endLine: 10,
          startColumn: 0,
          endColumn: 25,
          content: 'function authenticateUser(token: string) { ... }',
          synthesizedDescription: 'Authenticates a user with a token',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/utils.ts',
          symbolName: 'formatDate',
          symbolKind: 'function_declaration',
          startLine: 15,
          endLine: 20,
          startColumn: 0,
          endColumn: 30,
          content: 'function formatDate(date: Date) { ... }',
          synthesizedDescription: 'Formats a date object to string',
          embedding: new Array(768).fill(0).map(() => Math.random())
        }
      ]
      
      // Insert test symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      // Search with query embedding
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random())
      const results = await Effect.runPromise(
        searchByVector(testDb!, queryEmbedding, { 
          limit: 10, 
          similarityThreshold: 0.0 
        })
      )
      
      assertExists(results)
      assertEquals(results.length, 2)
      
      // Check result structure
      const firstResult = results[0]
      assertExists(firstResult.id)
      assertExists(firstResult.path)
      assertExists(firstResult.symbolName)
      assertExists(firstResult.symbolKind)
      assertExists(firstResult.content)
      assertExists(firstResult.synthesizedDescription)
      assertExists(firstResult.similarity)
      assertEquals(typeof firstResult.similarity, 'number')
    })

    it('should search code symbols with advanced options', async () => {
      // Create test symbols
      const symbols = [
        {
          path: 'src/components/Header.tsx',
          symbolName: 'Header',
          symbolKind: 'function_declaration',
          startLine: 5,
          endLine: 20,
          startColumn: 0,
          endColumn: 15,
          content: 'function Header() { return <div>Header</div>; }',
          synthesizedDescription: 'React header component',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/components/Button.tsx',
          symbolName: 'Button',
          symbolKind: 'function_declaration',
          startLine: 10,
          endLine: 25,
          startColumn: 0,
          endColumn: 15,
          content: 'function Button(props: ButtonProps) { ... }',
          synthesizedDescription: 'Reusable button component',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/utils/helpers.ts',
          symbolName: 'formatString',
          symbolKind: 'function_declaration',
          startLine: 1,
          endLine: 5,
          startColumn: 0,
          endColumn: 20,
          content: 'function formatString(str: string) { ... }',
          synthesizedDescription: 'String formatting utility',
          embedding: new Array(768).fill(0).map(() => Math.random())
        }
      ]
      
      // Insert test symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      // Search with path filter
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random())
      const results = await Effect.runPromise(
        searchCodeSymbols(testDb!, queryEmbedding, {
          limit: 10,
          pathFilter: 'src/components/',
          kindFilter: 'function_declaration',
          similarityThreshold: 0.0
        })
      )
      
      assertExists(results)
      assertEquals(results.length, 2) // Only components, not utils
      
      // Verify all results match filter
      for (const result of results) {
        assertEquals(result.path.startsWith('src/components/'), true)
        assertEquals(result.symbolKind, 'function_declaration')
      }
    })

    it('should get symbols by file path', async () => {
      // Create test symbols
      const symbols = [
        {
          path: 'src/app.ts',
          symbolName: 'App',
          symbolKind: 'class_declaration',
          startLine: 1,
          endLine: 10,
          startColumn: 0,
          endColumn: 15,
          content: 'class App { ... }',
          synthesizedDescription: 'Main application class',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/app.ts',
          symbolName: 'startApp',
          symbolKind: 'function_declaration',
          startLine: 12,
          endLine: 18,
          startColumn: 0,
          endColumn: 20,
          content: 'function startApp() { ... }',
          synthesizedDescription: 'Function to start the app',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/other.ts',
          symbolName: 'otherFunction',
          symbolKind: 'function_declaration',
          startLine: 1,
          endLine: 5,
          startColumn: 0,
          endColumn: 25,
          content: 'function otherFunction() { ... }',
          synthesizedDescription: 'Another function',
          embedding: new Array(768).fill(0).map(() => Math.random())
        }
      ]
      
      // Insert test symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      const results = await Effect.runPromise(getSymbolsByPath(testDb!, 'src/app.ts'))
      
      assertExists(results)
      assertEquals(results.length, 2)
      
      // Verify all results have correct path
      for (const result of results) {
        assertEquals(result.path, 'src/app.ts')
      }
      
      // Verify we get both symbols
      const symbolNames = results.map(r => r.symbolName)
      assertArrayIncludes(symbolNames, ['App', 'startApp'])
    })

    it('should get symbols by kind', async () => {
      // Create test symbols with different kinds
      const symbols = [
        {
          path: 'src/types.ts',
          symbolName: 'User',
          symbolKind: 'interface_declaration',
          startLine: 1,
          endLine: 5,
          startColumn: 0,
          endColumn: 15,
          content: 'interface User { ... }',
          synthesizedDescription: 'User interface',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/types.ts',
          symbolName: 'Product',
          symbolKind: 'interface_declaration',
          startLine: 7,
          endLine: 12,
          startColumn: 0,
          endColumn: 20,
          content: 'interface Product { ... }',
          synthesizedDescription: 'Product interface',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/functions.ts',
          symbolName: 'processData',
          symbolKind: 'function_declaration',
          startLine: 1,
          endLine: 8,
          startColumn: 0,
          endColumn: 25,
          content: 'function processData() { ... }',
          synthesizedDescription: 'Data processing function',
          embedding: new Array(768).fill(0).map(() => Math.random())
        }
      ]
      
      // Insert test symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      const results = await Effect.runPromise(getSymbolsByKind(testDb!, 'interface_declaration'))
      
      assertExists(results)
      assertEquals(results.length, 2)
      
      // Verify all results have correct kind
      for (const result of results) {
        assertEquals(result.symbolKind, 'interface_declaration')
      }
      
      // Verify we get both interfaces
      const symbolNames = results.map(r => r.symbolName)
      assertArrayIncludes(symbolNames, ['User', 'Product'])
    })

    it('should delete symbols by path', async () => {
      // Create test symbols
      const symbols = [
        {
          path: 'src/delete-me.ts',
          symbolName: 'functionToDelete',
          symbolKind: 'function_declaration',
          startLine: 1,
          endLine: 5,
          startColumn: 0,
          endColumn: 20,
          content: 'function functionToDelete() { ... }',
          synthesizedDescription: 'Function to be deleted',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/keep-me.ts',
          symbolName: 'functionToKeep',
          symbolKind: 'function_declaration',
          startLine: 1,
          endLine: 5,
          startColumn: 0,
          endColumn: 20,
          content: 'function functionToKeep() { ... }',
          synthesizedDescription: 'Function to keep',
          embedding: new Array(768).fill(0).map(() => Math.random())
        }
      ]
      
      // Insert test symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      // Delete symbols from one file
      await Effect.runPromise(deleteSymbolsByPath(testDb!, 'src/delete-me.ts'))
      
      // Verify deletion
      const deletedResults = await Effect.runPromise(getSymbolsByPath(testDb!, 'src/delete-me.ts'))
      assertEquals(deletedResults.length, 0)
      
      // Verify other symbols remain
      const keptResults = await Effect.runPromise(getSymbolsByPath(testDb!, 'src/keep-me.ts'))
      assertEquals(keptResults.length, 1)
      assertEquals(keptResults[0].symbolName, 'functionToKeep')
    })
  })

  describe('Database Statistics', () => {
    it('should get database statistics', async () => {
      // Create test symbols
      const symbols = [
        {
          path: 'src/stats-test.ts',
          symbolName: 'function1',
          symbolKind: 'function_declaration',
          startLine: 1,
          endLine: 5,
          startColumn: 0,
          endColumn: 15,
          content: 'function function1() { ... }',
          synthesizedDescription: 'First function',
          embedding: new Array(768).fill(0).map(() => Math.random())
        },
        {
          path: 'src/stats-test.ts',
          symbolName: 'function2',
          symbolKind: 'function_declaration',
          startLine: 7,
          endLine: 12,
          startColumn: 0,
          endColumn: 15,
          content: 'function function2() { ... }',
          synthesizedDescription: 'Second function',
          embedding: new Array(768).fill(0).map(() => Math.random())
        }
      ]
      
      // Insert test symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      const stats = await Effect.runPromise(getDatabaseStats(testDb!))
      
      assertExists(stats)
      assertEquals(stats.codeSymbols, 2)
      assertEquals(stats.uniquePaths, 1)
      assertExists(stats.symbolKinds)
      assertEquals(stats.symbolKinds['function_declaration'], 2)
      assertExists(stats.totalEmbeddings)
      assertEquals(stats.totalEmbeddings, 2)
    })
  })

  describe('File Metadata Operations', () => {
    it('should handle file metadata records', async () => {
      const metadata: FileMetadata = {
        path: 'src/metadata-test.ts',
        lastModified: new Date(),
        size: 1024,
        checksum: 'abc123',
        symbolCount: 5,
        processingTime: 150,
        lastIndexed: new Date()
      }
      
      const result = await testDb!.query(
        'CREATE file_metadata CONTENT $metadata',
        { metadata }
      )
      
      assertExists(result)
      assertEquals(result.length, 1)
      assertEquals(result[0].path, 'src/metadata-test.ts')
      assertEquals(result[0].size, 1024)
      assertEquals(result[0].checksum, 'abc123')
      assertEquals(result[0].symbolCount, 5)
      assertEquals(result[0].processingTime, 150)
    })
  })

  describe('Workspace Info Operations', () => {
    it('should handle workspace info records', async () => {
      const workspaceInfo: WorkspaceInfo = {
        path: '/home/user/project',
        name: 'test-project',
        version: '1.0.0',
        totalFiles: 100,
        totalSymbols: 500,
        lastFullIndex: new Date(),
        indexingStrategy: 'incremental',
        configuration: {
          excludePatterns: ['node_modules', '.git'],
          includePatterns: ['**/*.ts', '**/*.js']
        }
      }
      
      const result = await testDb!.query(
        'CREATE workspace_info CONTENT $workspaceInfo',
        { workspaceInfo }
      )
      
      assertExists(result)
      assertEquals(result.length, 1)
      assertEquals(result[0].path, '/home/user/project')
      assertEquals(result[0].name, 'test-project')
      assertEquals(result[0].version, '1.0.0')
      assertEquals(result[0].totalFiles, 100)
      assertEquals(result[0].totalSymbols, 500)
      assertEquals(result[0].indexingStrategy, 'incremental')
      assertExists(result[0].configuration)
      assertEquals(result[0].configuration.excludePatterns.length, 2)
      assertEquals(result[0].configuration.includePatterns.length, 2)
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const invalidConfig = {
        host: 'invalid-host',
        port: 9999,
        username: 'invalid',
        password: 'invalid',
        namespace: 'invalid',
        database: 'invalid'
      }
      
      const operation = withDatabase(invalidConfig, async (db) => {
        return await db.query('SELECT 1')
      })
      
      await assertRejects(() => Effect.runPromise(operation))
    })

    it('should handle query errors', async () => {
      const config = {
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: testNamespace,
        database: testDatabase
      }
      
      const operation = withDatabase(config, async (db) => {
        await db.query('INVALID SQL SYNTAX')
        return 'should not reach here'
      })
      
      await assertRejects(() => Effect.runPromise(operation))
    })

    it('should create storage errors with proper context', () => {
      const error = createStorageError(
        new Error('Database connection failed'),
        'connect',
        'Failed to connect to database',
        'code_symbols',
        {
          host: 'localhost',
          port: 4243,
          connectionTimeout: 5000
        }
      )
      
      assertEquals(error._tag, 'StorageError')
      assertEquals(error.operation, 'connect')
      assertEquals(error.message, 'Failed to connect to database')
      assertEquals(error.resource, 'code_symbols')
      assertExists(error.details)
      assertEquals(error.details.host, 'localhost')
      assertEquals(error.details.port, 4243)
      assertEquals(error.details.connectionTimeout, 5000)
    })
  })

  describe('StorageUtils Namespace', () => {
    it('should provide all utility functions', () => {
      assertExists(StorageUtils.connect)
      assertExists(StorageUtils.withDatabase)
      assertExists(StorageUtils.createSchema)
      assertExists(StorageUtils.createIndexEntry)
      assertExists(StorageUtils.searchByVector)
      assertExists(StorageUtils.searchCodeSymbols)
      assertExists(StorageUtils.getSymbolsByPath)
      assertExists(StorageUtils.getSymbolsByKind)
      assertExists(StorageUtils.deleteSymbolsByPath)
      assertExists(StorageUtils.getDatabaseStats)
    })
  })

  describe('Effect-TS Integration', () => {
    it('should compose operations with Effect', async () => {
      const config = {
        host: '127.0.0.1',
        port: 4243,
        username: 'root',
        password: 'root',
        namespace: testNamespace,
        database: testDatabase
      }
      
      const symbolData = {
        path: 'src/effect-test.ts',
        symbolName: 'effectTest',
        symbolKind: 'function_declaration',
        startLine: 1,
        endLine: 5,
        startColumn: 0,
        endColumn: 20,
        content: 'function effectTest() { ... }',
        synthesizedDescription: 'Test function for Effect integration',
        embedding: new Array(768).fill(0).map(() => Math.random())
      }
      
      const composedOperation = Effect.gen(function* () {
        // Create the symbol
        const symbol = yield* withDatabase(config, async (db) => {
          return await Effect.runPromise(createIndexEntry(db, symbolData))
        })
        
        // Search for the symbol
        const results = yield* withDatabase(config, async (db) => {
          return await Effect.runPromise(
            getSymbolsByPath(db, 'src/effect-test.ts')
          )
        })
        
        return { symbol, results }
      })
      
      const result = await Effect.runPromise(composedOperation)
      
      assertExists(result.symbol)
      assertExists(result.results)
      assertEquals(result.results.length, 1)
      assertEquals(result.results[0].symbolName, 'effectTest')
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle batch operations efficiently', async () => {
      const startTime = Date.now()
      
      // Create multiple symbols
      const symbols = Array.from({ length: 50 }, (_, i) => ({
        path: `src/batch-test-${i}.ts`,
        symbolName: `batchFunction${i}`,
        symbolKind: 'function_declaration' as const,
        startLine: 1,
        endLine: 5,
        startColumn: 0,
        endColumn: 20,
        content: `function batchFunction${i}() { ... }`,
        synthesizedDescription: `Batch test function ${i}`,
        embedding: new Array(768).fill(0).map(() => Math.random())
      }))
      
      // Insert all symbols
      for (const symbol of symbols) {
        await Effect.runPromise(createIndexEntry(testDb!, symbol))
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete within reasonable time (adjust threshold as needed)
      assertEquals(duration < 10000, true) // 10 seconds
      
      // Verify all symbols were inserted
      const stats = await Effect.runPromise(getDatabaseStats(testDb!))
      assertEquals(stats.codeSymbols, 50)
    })

    it('should handle large embeddings efficiently', async () => {
      // Create symbol with large embedding
      const symbolData = {
        path: 'src/large-embedding-test.ts',
        symbolName: 'largeEmbeddingFunction',
        symbolKind: 'function_declaration' as const,
        startLine: 1,
        endLine: 5,
        startColumn: 0,
        endColumn: 30,
        content: 'function largeEmbeddingFunction() { ... }',
        synthesizedDescription: 'Function with large embedding',
        embedding: new Array(1536).fill(0).map(() => Math.random()) // Larger embedding
      }
      
      const startTime = Date.now()
      
      const result = await Effect.runPromise(createIndexEntry(testDb!, symbolData))
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      assertExists(result)
      assertEquals(result.embedding.length, 1536)
      assertEquals(duration < 1000, true) // Should complete within 1 second
    })
  })

  describe('Schema Validation', () => {
    it('should validate code symbol schema', async () => {
      const validSymbol = {
        path: 'src/schema-test.ts',
        symbolName: 'validFunction',
        symbolKind: 'function_declaration',
        startLine: 1,
        endLine: 5,
        startColumn: 0,
        endColumn: 20,
        content: 'function validFunction() { ... }',
        synthesizedDescription: 'Valid function for schema test',
        embedding: new Array(768).fill(0).map(() => Math.random())
      }
      
      const result = await Effect.runPromise(createIndexEntry(testDb!, validSymbol))
      
      assertExists(result)
      assertEquals(result.symbolName, 'validFunction')
      assertEquals(result.symbolKind, 'function_declaration')
    })

    it('should handle required fields validation', async () => {
      const invalidSymbol = {
        path: 'src/invalid-test.ts',
        // Missing required symbolName
        symbolKind: 'function_declaration',
        startLine: 1,
        endLine: 5,
        startColumn: 0,
        endColumn: 20,
        content: 'function invalidFunction() { ... }',
        synthesizedDescription: 'Invalid function missing name',
        embedding: new Array(768).fill(0).map(() => Math.random())
      }
      
      await assertRejects(() => 
        Effect.runPromise(createIndexEntry(testDb!, invalidSymbol as any))
      )
    })
  })
})