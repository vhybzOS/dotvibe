/**
 * Tests for SurrealDB integration
 * 
 * @tested_by src/database.ts
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect, Either } from 'effect'
import { 
  connectToDatabase, 
  createDatabaseSchema, 
  insertVector, 
  searchVectors,
  insertFileMetadata,
  type DatabaseConnection,
  type VectorRecord,
  type FileMetadata
} from '../src/database.ts'

const TEST_DB_PATH = './test-database.db'

describe('SurrealDB Integration', () => {
  let db: DatabaseConnection

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await Deno.remove(TEST_DB_PATH)
    } catch {
      // File doesn't exist, which is fine
    }
  })

  afterEach(async () => {
    // Close database connection and clean up
    if (db) {
      try {
        await Effect.runPromise(Effect.tryPromise({
          try: () => db.close(),
          catch: () => null
        }))
      } catch {
        // Ignore close errors
      }
    }
    
    try {
      await Deno.remove(TEST_DB_PATH)
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should connect to SurrealDB file database', async () => {
    const program = connectToDatabase(TEST_DB_PATH)
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Should successfully connect to database')
    db = Either.getRight(result)!
    assertExists(db, 'Database connection should exist')
  })

  it('should create proper database schema', async () => {
    db = await Effect.runPromise(connectToDatabase(TEST_DB_PATH))
    
    const program = createDatabaseSchema(db)
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Schema creation should succeed')
    
    // TODO: Verify tables were created
    // Query SHOW TABLES or similar to confirm vectors and file_metadata tables exist
  })

  it('should insert vector records', async () => {
    db = await Effect.runPromise(connectToDatabase(TEST_DB_PATH))
    await Effect.runPromise(createDatabaseSchema(db))
    
    const vectorRecord: VectorRecord = {
      file_path: 'src/test.ts',
      content: 'export const test = () => console.log("hello")',
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
      created_at: new Date().toISOString()
    }
    
    const program = insertVector(db, vectorRecord)
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Vector insertion should succeed')
  })

  it('should insert file metadata', async () => {
    db = await Effect.runPromise(connectToDatabase(TEST_DB_PATH))
    await Effect.runPromise(createDatabaseSchema(db))
    
    const metadata: FileMetadata = {
      path: 'src/test.ts',
      size: 1024,
      modified_at: new Date().toISOString(),
      language: 'typescript'
    }
    
    const program = insertFileMetadata(db, metadata)
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Metadata insertion should succeed')
  })

  it('should perform vector similarity search', async () => {
    db = await Effect.runPromise(connectToDatabase(TEST_DB_PATH))
    await Effect.runPromise(createDatabaseSchema(db))
    
    // Insert test vectors
    const vector1: VectorRecord = {
      file_path: 'src/async.ts',
      content: 'async function fetchData() { return await api.get() }',
      embedding: [0.8, 0.2, 0.1, 0.9, 0.3],
      created_at: new Date().toISOString()
    }
    
    const vector2: VectorRecord = {
      file_path: 'src/sync.ts', 
      content: 'function addNumbers(a, b) { return a + b }',
      embedding: [0.1, 0.9, 0.8, 0.2, 0.4],
      created_at: new Date().toISOString()
    }
    
    await Effect.runPromise(insertVector(db, vector1))
    await Effect.runPromise(insertVector(db, vector2))
    
    // Search with query vector similar to first vector
    const queryVector = [0.7, 0.3, 0.2, 0.8, 0.4]
    const program = searchVectors(db, queryVector, { limit: 2, threshold: 0.5 })
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Vector search should succeed')
    const results = Either.getRight(result)
    
    assert(results.length > 0, 'Should return search results')
    assert(results[0]!.file_path === 'src/async.ts', 'Should return most similar vector first')
  })

  it('should use SurrealDB vector::similarity::cosine function', async () => {
    db = await Effect.runPromise(connectToDatabase(TEST_DB_PATH))
    await Effect.runPromise(createDatabaseSchema(db))
    
    // Insert a test vector
    const testVector: VectorRecord = {
      file_path: 'test.ts',
      content: 'test content',
      embedding: [1.0, 0.0, 0.0],
      created_at: new Date().toISOString()
    }
    
    await Effect.runPromise(insertVector(db, testVector))
    
    // Query using vector::similarity::cosine
    const queryVector = [1.0, 0.0, 0.0] // Identical vector should have similarity 1.0
    const program = searchVectors(db, queryVector, { limit: 1, threshold: 0.0 })
    const results = await Effect.runPromise(program)
    
    assert(results.length === 1, 'Should find the identical vector')
    assert(results[0]!.similarity >= 0.99, 'Identical vectors should have high similarity')
  })

  it('should handle database connection errors gracefully', async () => {
    const program = connectToDatabase('/invalid/path/database.db')
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isLeft(result), 'Should fail with invalid database path')
    const error = Either.getLeft(result)
    assertEquals(error._tag, 'DatabaseError', 'Should return DatabaseError')
  })
})