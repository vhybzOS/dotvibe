/**
 * Graph Storage System Test Suite (TDD)
 * Tests the revolutionary graph database architecture with multi-level embeddings
 * 
 * @tests src/infra/graph-storage.ts (Graph operations, relationships, embeddings)
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { Effect } from 'effect'

import { 
  connectToDatabase,
  withDatabase,
  withGraphTransaction,
  withEmbeddingGeneration,
  createCodeElement,
  createRelationship,
  createDataFlowRelationship,
  createBatch,
  searchCodeElements,
  traverseGraph,
  initializeGraphSchema,
  type DatabaseConnection,
  type CodeElementData,
  type RelationshipData,
  type DataFlowRelationshipData,
  type SearchOptions,
  type GraphQuery,
  type BatchResult
} from '../../src/infra/storage.ts'

describe('Graph Storage System (TDD)', () => {
  let testDb: DatabaseConnection | null = null
  const testNamespace = 'test-graph-vibe'
  const testDatabase = 'test-graph-code'
  
  beforeEach(async () => {
    // Connect to test database using existing infrastructure
    testDb = await connectToDatabase()
    
    // Use test namespace/database
    await testDb.signin({ username: 'root', password: 'root' })
    await testDb.use({ namespace: testNamespace, database: testDatabase })
    
    // Initialize test database schema
    await Effect.runPromise(initializeGraphSchema())
  })

  afterEach(async () => {
    if (testDb) {
      // Clean up test data
      await testDb.query('DELETE code_elements;')
      await testDb.query('DELETE structural_relationship;')
      await testDb.query('DELETE data_flow;')
      await testDb.close()
      testDb = null
    }
  })

  describe('Higher-Order Functions', () => {
    it('should provide withDatabase HOF for database operations', async () => {
      const result = await Effect.runPromise(
        withDatabase(async (db) => {
          const response = await db.query('SELECT * FROM code_elements LIMIT 1')
          return response
        })
      )
      
      assertExists(result)
    })

    it('should provide withGraphTransaction HOF for batch operations', async () => {
      const operations = [
        (db: any) => db.query('SELECT 1 as test1'),
        (db: any) => db.query('SELECT 2 as test2'),
        (db: any) => db.query('SELECT 3 as test3')
      ]
      
      const results = await Effect.runPromise(withGraphTransaction(operations))
      
      assertEquals(results.length, 3)
    })

    it('should provide withEmbeddingGeneration HOF for embedding operations', async () => {
      const result = await Effect.runPromise(
        withEmbeddingGeneration(async (generateEmbedding) => {
          const embedding = await generateEmbedding('test content')
          return embedding
        })
      )
      
      assertExists(result)
      assertEquals(Array.isArray(result), true)
      assertEquals(result.length > 0, true)
    })
  })

  describe('Code Element Operations', () => {
    it('should create code element with multi-level embeddings', async () => {
      const elementData: CodeElementData = {
        file_path: '/test/example.ts',
        element_name: 'processUser',
        element_type: 'function',
        start_line: 10,
        end_line: 20,
        content: 'export function processUser(user: User): UserResult { return { id: user.id, processed: true } }',
        description: 'Processes user data and returns a result object with status',
        search_phrases: ['user processing', 'data validation', 'user transformation'],
        metadata: { 
          parameters: ['user: User'],
          return_type: 'UserResult',
          exported: true
        }
      }
      
      const elementId = await Effect.runPromise(createCodeElement(elementData))
      
      assertExists(elementId)
      assertEquals(typeof elementId, 'string')
      
      // Verify element was created with embeddings
      const element = await Effect.runPromise(
        withDatabase(async (db) => {
          const result = await db.query('SELECT * FROM code_elements WHERE id = $id', { id: elementId })
          return result[0]
        })
      )
      
      assertEquals(element.file_path, elementData.file_path)
      assertEquals(element.element_name, elementData.element_name)
      assertEquals(element.element_type, elementData.element_type)
      assertEquals(element.content, elementData.content)
      assertEquals(element.description, elementData.description)
      assertExists(element.content_embedding)
      assertExists(element.semantic_embedding)
      assertEquals(Array.isArray(element.content_embedding), true)
      assertEquals(Array.isArray(element.semantic_embedding), true)
      assertEquals(element.content_embedding.length > 0, true)
      assertEquals(element.semantic_embedding.length > 0, true)
    })

    it('should search code elements by semantic similarity', async () => {
      // Create test elements
      const element1: CodeElementData = {
        file_path: '/test/auth.ts',
        element_name: 'validateUser',
        element_type: 'function',
        start_line: 5,
        end_line: 15,
        content: 'function validateUser(user: User) { return user.email && user.password }',
        description: 'Validates user credentials for authentication'
      }
      
      const element2: CodeElementData = {
        file_path: '/test/utils.ts',
        element_name: 'formatDate',
        element_type: 'function',
        start_line: 20,
        end_line: 25,
        content: 'function formatDate(date: Date) { return date.toISOString() }',
        description: 'Formats date object to ISO string'
      }
      
      await Effect.runPromise(createCodeElement(element1))
      await Effect.runPromise(createCodeElement(element2))
      
      // Search for validation-related code
      const results = await Effect.runPromise(
        searchCodeElements('user validation authentication', {
          limit: 5,
          threshold: 0.3,
          embedding_type: 'semantic'
        })
      )
      
      assertEquals(results.length > 0, true)
      assertEquals(results[0].element_name, 'validateUser')
      assertEquals(results[0].similarity > 0.3, true)
    })
  })

  describe('Relationship Operations', () => {
    it('should create structural relationship with LLM enrichment', async () => {
      // Create two code elements
      const element1Id = await Effect.runPromise(createCodeElement({
        file_path: '/test/user.ts',
        element_name: 'processUser',
        element_type: 'function',
        start_line: 10,
        end_line: 20,
        content: 'function processUser(user: User) { return validateEmail(user.email) }',
        description: 'Processes user data with email validation'
      }))
      
      const element2Id = await Effect.runPromise(createCodeElement({
        file_path: '/test/validation.ts',
        element_name: 'validateEmail',
        element_type: 'function',
        start_line: 5,
        end_line: 10,
        content: 'function validateEmail(email: string) { return /^[^@]+@[^@]+$/.test(email) }',
        description: 'Validates email format using regex'
      }))
      
      // Create relationship
      const relationshipData: RelationshipData = {
        from: element1Id,
        to: element2Id,
        relationship_type: 'calls',
        context: {
          call_site_line: 12,
          parameters_passed: ['user.email'],
          conditional: false
        },
        semantic_description: 'processUser calls validateEmail to ensure user email format is correct before processing',
        architectural_purpose: 'Separation of concerns - email validation logic is centralized and reusable',
        complexity_score: 0.3
      }
      
      const relationshipId = await Effect.runPromise(createRelationship(relationshipData))
      
      assertExists(relationshipId)
      
      // Verify relationship was created with embeddings
      const relationship = await Effect.runPromise(
        withDatabase(async (db) => {
          const result = await db.query('SELECT * FROM structural_relationship WHERE id = $id', { id: relationshipId })
          return result[0]
        })
      )
      
      assertEquals(relationship.relationship_type, 'calls')
      assertEquals(relationship.semantic_description, relationshipData.semantic_description)
      assertEquals(relationship.architectural_purpose, relationshipData.architectural_purpose)
      assertEquals(relationship.complexity_score, 0.3)
      assertExists(relationship.relationship_embedding)
      assertEquals(Array.isArray(relationship.relationship_embedding), true)
    })

    it('should create data flow relationship with business logic understanding', async () => {
      const element1Id = await Effect.runPromise(createCodeElement({
        file_path: '/test/user.ts',
        element_name: 'user',
        element_type: 'variable',
        start_line: 5,
        end_line: 5,
        content: 'const user = { id: 1, email: "test@example.com", name: "John" }',
        description: 'User object with id, email, and name properties'
      }))
      
      const element2Id = await Effect.runPromise(createCodeElement({
        file_path: '/test/user.ts',
        element_name: 'processUser',
        element_type: 'function',
        start_line: 10,
        end_line: 15,
        content: 'function processUser(userData: User) { return { id: userData.id, processed: true } }',
        description: 'Processes user data and returns result with processed flag'
      }))
      
      const dataFlowData: DataFlowRelationshipData = {
        from: element1Id,
        to: element2Id,
        flow_type: 'argument_passing',
        type_annotation: 'User',
        flow_metadata: {
          parameter_position: 0,
          transformation_type: 'extraction',
          data_shape_before: '{ id, email, name }',
          data_shape_after: '{ id, processed }'
        },
        data_transformation_description: 'User object is passed as argument and transformed to include processed status',
        business_logic_purpose: 'Tracks user processing state for downstream systems',
        side_effects: ['logs processing attempt', 'updates user status']
      }
      
      const dataFlowId = await Effect.runPromise(createDataFlowRelationship(dataFlowData))
      
      assertExists(dataFlowId)
      
      // Verify data flow relationship
      const dataFlow = await Effect.runPromise(
        withDatabase(async (db) => {
          const result = await db.query('SELECT * FROM data_flow WHERE id = $id', { id: dataFlowId })
          return result[0]
        })
      )
      
      assertEquals(dataFlow.flow_type, 'argument_passing')
      assertEquals(dataFlow.type_annotation, 'User')
      assertEquals(dataFlow.data_transformation_description, dataFlowData.data_transformation_description)
      assertEquals(dataFlow.business_logic_purpose, dataFlowData.business_logic_purpose)
      assertEquals(dataFlow.side_effects, dataFlowData.side_effects)
      assertExists(dataFlow.data_flow_embedding)
    })
  })

  describe('Batch Operations', () => {
    it('should create batch of elements and relationships efficiently', async () => {
      const elements: CodeElementData[] = [
        {
          file_path: '/test/batch1.ts',
          element_name: 'function1',
          element_type: 'function',
          start_line: 1,
          end_line: 5,
          content: 'function function1() { return "test1" }',
          description: 'Test function 1'
        },
        {
          file_path: '/test/batch2.ts',
          element_name: 'function2',
          element_type: 'function',
          start_line: 1,
          end_line: 5,
          content: 'function function2() { return "test2" }',
          description: 'Test function 2'
        }
      ]
      
      const relationships: RelationshipData[] = [
        {
          from: 'function1',
          to: 'function2',
          relationship_type: 'calls',
          semantic_description: 'function1 calls function2 for processing',
          architectural_purpose: 'Modular function composition',
          complexity_score: 0.2
        }
      ]
      
      const batchResult = await Effect.runPromise(createBatch(elements, relationships))
      
      assertExists(batchResult)
      assertEquals(batchResult.elements.length, 2)
      assertEquals(batchResult.relationships.length, 1)
      assertEquals(batchResult.errors.length, 0)
    })
  })

  describe('Graph Traversal', () => {
    it('should traverse graph relationships with SurrealDB graph queries', async () => {
      // Create a small graph: A -> B -> C
      const elementA = await Effect.runPromise(createCodeElement({
        file_path: '/test/graph.ts',
        element_name: 'functionA',
        element_type: 'function',
        start_line: 1,
        end_line: 5,
        content: 'function functionA() { return functionB() }',
        description: 'Function A calls function B'
      }))
      
      const elementB = await Effect.runPromise(createCodeElement({
        file_path: '/test/graph.ts',
        element_name: 'functionB',
        element_type: 'function',
        start_line: 7,
        end_line: 11,
        content: 'function functionB() { return functionC() }',
        description: 'Function B calls function C'
      }))
      
      const elementC = await Effect.runPromise(createCodeElement({
        file_path: '/test/graph.ts',
        element_name: 'functionC',
        element_type: 'function',
        start_line: 13,
        end_line: 17,
        content: 'function functionC() { return "result" }',
        description: 'Function C returns final result'
      }))
      
      // Create relationships
      await Effect.runPromise(createRelationship({
        from: elementA,
        to: elementB,
        relationship_type: 'calls',
        semantic_description: 'functionA calls functionB',
        architectural_purpose: 'Function composition',
        complexity_score: 0.1
      }))
      
      await Effect.runPromise(createRelationship({
        from: elementB,
        to: elementC,
        relationship_type: 'calls',
        semantic_description: 'functionB calls functionC',
        architectural_purpose: 'Function composition',
        complexity_score: 0.1
      }))
      
      // Traverse graph from A
      const traversal = await Effect.runPromise(
        traverseGraph(elementA, {
          relationship_types: ['calls'],
          max_depth: 2,
          direction: 'outgoing'
        })
      )
      
      assertEquals(traversal.nodes.length, 3)
      assertEquals(traversal.edges.length, 2)
      assertEquals(traversal.path.length, 3)
      assertEquals(traversal.depth, 2)
      assertEquals(traversal.nodes[0].element_name, 'functionA')
      assertEquals(traversal.nodes[1].element_name, 'functionB')
      assertEquals(traversal.nodes[2].element_name, 'functionC')
    })
  })

  describe('Schema Initialization', () => {
    it('should initialize unified graph schema with proper types and indexes', async () => {
      await Effect.runPromise(initializeGraphSchema())
      
      // Verify tables exist
      const tables = await Effect.runPromise(
        withDatabase(async (db) => {
          const result = await db.query('SHOW TABLES')
          return result
        })
      )
      
      const tableNames = tables.map((t: any) => t.name)
      assertEquals(tableNames.includes('code_elements'), true)
      assertEquals(tableNames.includes('structural_relationship'), true)
      assertEquals(tableNames.includes('data_flow'), true)
      
      // Verify indexes exist
      const indexes = await Effect.runPromise(
        withDatabase(async (db) => {
          const result = await db.query('SHOW INDEXES ON code_elements')
          return result
        })
      )
      
      const indexNames = indexes.map((i: any) => i.name)
      assertEquals(indexNames.includes('file_path_idx'), true)
      assertEquals(indexNames.includes('element_name_idx'), true)
      assertEquals(indexNames.includes('content_embedding_idx'), true)
      assertEquals(indexNames.includes('semantic_embedding_idx'), true)
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // Test with invalid database configuration
      await assertRejects(
        () => Effect.runPromise(
          withDatabase(async (db) => {
            await db.query('INVALID SQL QUERY')
          })
        ),
        Error,
        'Database operation failed'
      )
    })

    it('should handle embedding generation failures gracefully', async () => {
      // Test with invalid embedding configuration
      await assertRejects(
        () => Effect.runPromise(
          withEmbeddingGeneration(async (generateEmbedding) => {
            // This should fail with invalid input
            throw new Error('Embedding generation failed')
          })
        ),
        Error,
        'Embedding generation failed'
      )
    })
  })

  describe('Performance and Optimization', () => {
    it('should handle large batch operations efficiently', async () => {
      const largeElementBatch: CodeElementData[] = Array.from({ length: 100 }, (_, i) => ({
        file_path: `/test/large/file${i}.ts`,
        element_name: `function${i}`,
        element_type: 'function',
        start_line: 1,
        end_line: 10,
        content: `function function${i}() { return ${i} }`,
        description: `Test function ${i}`
      }))
      
      const startTime = Date.now()
      const result = await Effect.runPromise(createBatch(largeElementBatch, []))
      const endTime = Date.now()
      
      assertEquals(result.elements.length, 100)
      assertEquals(result.errors.length, 0)
      
      // Should complete within reasonable time (< 10 seconds)
      assertEquals(endTime - startTime < 10000, true)
    })

    it('should provide efficient semantic search with similarity thresholds', async () => {
      // Create elements with varying semantic similarity
      const elements: CodeElementData[] = [
        {
          file_path: '/test/search1.ts',
          element_name: 'authenticateUser',
          element_type: 'function',
          start_line: 1,
          end_line: 10,
          content: 'function authenticateUser(credentials) { return validateCredentials(credentials) }',
          description: 'Authenticates user with provided credentials'
        },
        {
          file_path: '/test/search2.ts',
          element_name: 'loginUser',
          element_type: 'function',
          start_line: 1,
          end_line: 10,
          content: 'function loginUser(username, password) { return signInUser(username, password) }',
          description: 'Logs in user with username and password'
        },
        {
          file_path: '/test/search3.ts',
          element_name: 'calculateTax',
          element_type: 'function',
          start_line: 1,
          end_line: 10,
          content: 'function calculateTax(amount) { return amount * 0.1 }',
          description: 'Calculates tax amount based on base amount'
        }
      ]
      
      for (const element of elements) {
        await Effect.runPromise(createCodeElement(element))
      }
      
      // Search for authentication-related functions
      const results = await Effect.runPromise(
        searchCodeElements('user authentication login', {
          limit: 10,
          threshold: 0.5,
          embedding_type: 'semantic'
        })
      )
      
      assertEquals(results.length >= 2, true)
      assertEquals(results.every(r => r.similarity >= 0.5), true)
      
      // Authentication-related functions should rank higher
      const authResults = results.filter(r => 
        r.element_name.includes('authenticate') || 
        r.element_name.includes('login')
      )
      assertEquals(authResults.length >= 2, true)
    })
  })
})