/**
 * Multi-Level Embedding Service Test Suite (TDD)
 * Tests configurable embedding generation with multiple embedding types
 * 
 * @tests src/infra/embedding-service.ts (Multi-level embeddings, batch processing)
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { Effect } from 'effect'

import { 
  withEmbeddingGeneration,
  generateCodeEmbedding,
  generateSemanticEmbedding,
  generateRelationshipEmbedding,
  generateDataFlowEmbedding,
  generateBatchEmbeddings,
  configureEmbeddings,
  getEmbeddingConfiguration,
  calculateSimilarity,
  type EmbeddingConfig,
  type EmbeddingType,
  type SimilarityResult
} from '../../src/infra/embedding-service.ts'

// Mock embedding data from scripts/mock-google.ts
const MOCK_EMBEDDING_RESPONSES = [
  {
    text: "export function main(): void { console.log('Hello, world!'); }",
    model: "text-embedding-004",
    embedding: [0.123456, -0.654321, 0.789012, -0.345678, 0.901234],
    length: 768
  },
  {
    text: "A TypeScript function that serves as the main entry point for the application",
    model: "text-embedding-004", 
    embedding: [0.234567, -0.567890, 0.890123, -0.456789, 0.012345],
    length: 768
  },
  {
    text: "interface User { id: number; name: string; email: string; }",
    model: "text-embedding-004",
    embedding: [0.345678, -0.678901, 0.901234, -0.567890, 0.123456],
    length: 768
  },
  {
    text: "User interface defining the structure for user data with ID, name, and email fields",
    model: "text-embedding-004",
    embedding: [0.456789, -0.789012, 0.012345, -0.678901, 0.234567],
    length: 768
  },
  {
    text: "class DataManager implements storage and retrieval of key-value pairs",
    model: "text-embedding-004",
    embedding: [0.567890, -0.890123, 0.123456, -0.789012, 0.345678],
    length: 768
  }
]

describe('Multi-Level Embedding Service (TDD)', () => {
  beforeEach(async () => {
    // Reset to default configuration
    await Effect.runPromise(configureEmbeddings({
      dimensions: 768,
      model: 'text-embedding-004',
      batchSize: 100,
      enableCaching: true,
      apiKey: 'test-key'
    }))
  })

  afterEach(async () => {
    // Clear any caches or connections
    await Effect.runPromise(withEmbeddingGeneration(async () => {
      // Cleanup logic
    }))
  })

  describe('Configuration Management', () => {
    it('should configure embedding service with custom dimensions', async () => {
      const customConfig: EmbeddingConfig = {
        dimensions: 1024,
        model: 'text-embedding-004',
        batchSize: 50,
        enableCaching: false,
        apiKey: 'custom-key'
      }
      
      await Effect.runPromise(configureEmbeddings(customConfig))
      
      const config = await Effect.runPromise(getEmbeddingConfiguration())
      
      assertEquals(config.dimensions, 1024)
      assertEquals(config.model, 'text-embedding-004')
      assertEquals(config.batchSize, 50)
      assertEquals(config.enableCaching, false)
    })

    it('should support different embedding models', async () => {
      const models = ['text-embedding-004', 'text-embedding-3-large', 'text-embedding-3-small']
      
      for (const model of models) {
        await Effect.runPromise(configureEmbeddings({
          dimensions: 768,
          model,
          batchSize: 100,
          enableCaching: true,
          apiKey: 'test-key'
        }))
        
        const config = await Effect.runPromise(getEmbeddingConfiguration())
        assertEquals(config.model, model)
      }
    })

    it('should validate configuration parameters', async () => {
      // Test invalid dimensions
      await assertRejects(
        () => Effect.runPromise(configureEmbeddings({
          dimensions: 0,
          model: 'text-embedding-004',
          batchSize: 100,
          enableCaching: true,
          apiKey: 'test-key'
        })),
        Error,
        'Dimensions must be positive'
      )

      // Test invalid batch size
      await assertRejects(
        () => Effect.runPromise(configureEmbeddings({
          dimensions: 768,
          model: 'text-embedding-004',
          batchSize: 0,
          enableCaching: true,
          apiKey: 'test-key'
        })),
        Error,
        'Batch size must be positive'
      )

      // Test missing API key
      await assertRejects(
        () => Effect.runPromise(configureEmbeddings({
          dimensions: 768,
          model: 'text-embedding-004',
          batchSize: 100,
          enableCaching: true,
          apiKey: ''
        })),
        Error,
        'API key is required'
      )
    })
  })

  describe('Higher-Order Function for Embedding Operations', () => {
    it('should provide withEmbeddingGeneration HOF', async () => {
      const result = await Effect.runPromise(
        withEmbeddingGeneration(async (generateEmbedding) => {
          const embedding = await generateEmbedding('test text')
          return embedding
        })
      )
      
      assertExists(result)
      assertEquals(Array.isArray(result), true)
      assertEquals(result.length, 768)
    })

    it('should handle embedding generation errors gracefully', async () => {
      await assertRejects(
        () => Effect.runPromise(
          withEmbeddingGeneration(async (generateEmbedding) => {
            throw new Error('Embedding generation failed')
          })
        ),
        Error,
        'Embedding generation failed'
      )
    })
  })

  describe('Code Embedding Generation', () => {
    it('should generate embeddings for raw code content', async () => {
      const codeContent = "export function processUser(user: User): UserResult { return { id: user.id, processed: true } }"
      
      const embedding = await Effect.runPromise(generateCodeEmbedding(codeContent))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
      assertEquals(embedding.every(val => typeof val === 'number'), true)
      
      // Should be normalized vector
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
      assertEquals(Math.abs(magnitude - 1.0) < 0.1, true)
    })

    it('should generate consistent embeddings for identical code', async () => {
      const codeContent = "function test() { return 'hello' }"
      
      const embedding1 = await Effect.runPromise(generateCodeEmbedding(codeContent))
      const embedding2 = await Effect.runPromise(generateCodeEmbedding(codeContent))
      
      assertEquals(embedding1.length, embedding2.length)
      
      // Should be identical or very similar (depending on caching)
      const similarity = calculateSimilarity(embedding1, embedding2)
      assertEquals(similarity > 0.95, true)
    })

    it('should generate different embeddings for different code patterns', async () => {
      const functionCode = "function processUser(user: User) { return user.id }"
      const classCode = "class UserProcessor { process(user: User) { return user.id } }"
      
      const functionEmbedding = await Effect.runPromise(generateCodeEmbedding(functionCode))
      const classEmbedding = await Effect.runPromise(generateCodeEmbedding(classCode))
      
      const similarity = calculateSimilarity(functionEmbedding, classEmbedding)
      
      // Should be different but related (both process users)
      assertEquals(similarity > 0.3, true)
      assertEquals(similarity < 0.9, true)
    })
  })

  describe('Semantic Embedding Generation', () => {
    it('should generate embeddings for human-readable descriptions', async () => {
      const description = "Processes user data and validates email format before returning result"
      
      const embedding = await Effect.runPromise(generateSemanticEmbedding(description))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
      assertEquals(embedding.every(val => typeof val === 'number'), true)
    })

    it('should generate similar embeddings for semantically similar descriptions', async () => {
      const description1 = "Validates user email address format"
      const description2 = "Checks if user email is valid"
      
      const embedding1 = await Effect.runPromise(generateSemanticEmbedding(description1))
      const embedding2 = await Effect.runPromise(generateSemanticEmbedding(description2))
      
      const similarity = calculateSimilarity(embedding1, embedding2)
      
      // Should be semantically similar
      assertEquals(similarity > 0.7, true)
    })

    it('should generate different embeddings for different semantic meanings', async () => {
      const description1 = "Validates user email address format"
      const description2 = "Calculates tax amount based on income"
      
      const embedding1 = await Effect.runPromise(generateSemanticEmbedding(description1))
      const embedding2 = await Effect.runPromise(generateSemanticEmbedding(description2))
      
      const similarity = calculateSimilarity(embedding1, embedding2)
      
      // Should be semantically different
      assertEquals(similarity < 0.5, true)
    })
  })

  describe('Relationship Embedding Generation', () => {
    it('should generate embeddings for relationship descriptions', async () => {
      const relationshipDescription = "processUser calls validateEmail to ensure user email format is correct before processing"
      
      const embedding = await Effect.runPromise(generateRelationshipEmbedding(relationshipDescription))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
    })

    it('should generate similar embeddings for similar relationship types', async () => {
      const callsDescription = "functionA calls functionB to process data"
      const invokesDescription = "functionA invokes functionB for data processing"
      
      const callsEmbedding = await Effect.runPromise(generateRelationshipEmbedding(callsDescription))
      const invokesEmbedding = await Effect.runPromise(generateRelationshipEmbedding(invokesDescription))
      
      const similarity = calculateSimilarity(callsEmbedding, invokesEmbedding)
      
      // Should be similar (both describe function calls)
      assertEquals(similarity > 0.8, true)
    })

    it('should generate different embeddings for different relationship types', async () => {
      const callsDescription = "functionA calls functionB to process data"
      const extendsDescription = "ClassA extends ClassB to inherit functionality"
      
      const callsEmbedding = await Effect.runPromise(generateRelationshipEmbedding(callsDescription))
      const extendsEmbedding = await Effect.runPromise(generateRelationshipEmbedding(extendsDescription))
      
      const similarity = calculateSimilarity(callsEmbedding, extendsEmbedding)
      
      // Should be different (different relationship types)
      assertEquals(similarity < 0.7, true)
    })
  })

  describe('Data Flow Embedding Generation', () => {
    it('should generate embeddings for data flow descriptions', async () => {
      const dataFlowDescription = "User object is passed as parameter and transformed to include processed status"
      
      const embedding = await Effect.runPromise(generateDataFlowEmbedding(dataFlowDescription))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
    })

    it('should generate similar embeddings for similar data transformations', async () => {
      const transformation1 = "User data is validated and transformed to include status"
      const transformation2 = "User object is processed and enriched with validation status"
      
      const embedding1 = await Effect.runPromise(generateDataFlowEmbedding(transformation1))
      const embedding2 = await Effect.runPromise(generateDataFlowEmbedding(transformation2))
      
      const similarity = calculateSimilarity(embedding1, embedding2)
      
      // Should be similar (both describe user data transformation)
      assertEquals(similarity > 0.7, true)
    })

    it('should generate different embeddings for different data flow types', async () => {
      const parameterFlow = "User data flows in as function parameter"
      const returnFlow = "Processed result flows out as function return value"
      
      const parameterEmbedding = await Effect.runPromise(generateDataFlowEmbedding(parameterFlow))
      const returnEmbedding = await Effect.runPromise(generateDataFlowEmbedding(returnFlow))
      
      const similarity = calculateSimilarity(parameterEmbedding, returnEmbedding)
      
      // Should be different (different flow directions)
      assertEquals(similarity < 0.6, true)
    })
  })

  describe('Batch Embedding Generation', () => {
    it('should generate embeddings for multiple texts efficiently', async () => {
      const texts = [
        "function processUser(user: User) { return user.id }",
        "Processes user data and returns user ID",
        "processUser calls validateUser to ensure data integrity",
        "User object flows through validation pipeline"
      ]
      
      const startTime = Date.now()
      const embeddings = await Effect.runPromise(generateBatchEmbeddings(texts))
      const endTime = Date.now()
      
      assertEquals(embeddings.length, texts.length)
      assertEquals(embeddings.every(emb => Array.isArray(emb)), true)
      assertEquals(embeddings.every(emb => emb.length === 768), true)
      
      // Should be faster than individual requests
      assertEquals(endTime - startTime < 5000, true)
    })

    it('should handle large batch sizes efficiently', async () => {
      const largeBatch = Array.from({ length: 200 }, (_, i) => `function test${i}() { return ${i} }`)
      
      const embeddings = await Effect.runPromise(generateBatchEmbeddings(largeBatch))
      
      assertEquals(embeddings.length, 200)
      assertEquals(embeddings.every(emb => Array.isArray(emb)), true)
      assertEquals(embeddings.every(emb => emb.length === 768), true)
    })

    it('should split large batches automatically', async () => {
      // Configure small batch size
      await Effect.runPromise(configureEmbeddings({
        dimensions: 768,
        model: 'text-embedding-004',
        batchSize: 10,
        enableCaching: true,
        apiKey: 'test-key'
      }))
      
      const largeBatch = Array.from({ length: 25 }, (_, i) => `test text ${i}`)
      
      const embeddings = await Effect.runPromise(generateBatchEmbeddings(largeBatch))
      
      assertEquals(embeddings.length, 25)
      assertEquals(embeddings.every(emb => Array.isArray(emb)), true)
    })

    it('should handle batch errors gracefully', async () => {
      const mixedBatch = [
        "valid text 1",
        "", // Empty text might cause issues
        "valid text 2",
        null, // Invalid input
        "valid text 3"
      ]
      
      const embeddings = await Effect.runPromise(generateBatchEmbeddings(mixedBatch))
      
      // Should handle errors and return embeddings for valid inputs
      assertEquals(embeddings.length, mixedBatch.length)
      assertEquals(embeddings.filter(emb => emb !== null).length >= 3, true)
    })
  })

  describe('Similarity Calculation', () => {
    it('should calculate cosine similarity between embeddings', () => {
      const embedding1 = [1, 0, 0, 0, 0]
      const embedding2 = [0, 1, 0, 0, 0]
      const embedding3 = [1, 0, 0, 0, 0]
      
      const similarity12 = calculateSimilarity(embedding1, embedding2)
      const similarity13 = calculateSimilarity(embedding1, embedding3)
      
      // Orthogonal vectors should have similarity 0
      assertEquals(Math.abs(similarity12) < 0.01, true)
      
      // Identical vectors should have similarity 1
      assertEquals(Math.abs(similarity13 - 1.0) < 0.01, true)
    })

    it('should handle normalized and unnormalized vectors', () => {
      const normalized = [0.6, 0.8, 0, 0, 0]
      const unnormalized = [3, 4, 0, 0, 0]
      
      const similarity = calculateSimilarity(normalized, unnormalized)
      
      // Should be close to 1 (same direction)
      assertEquals(Math.abs(similarity - 1.0) < 0.01, true)
    })

    it('should return similarity results with metadata', async () => {
      const text1 = "function processUser(user: User) { return user.id }"
      const text2 = "function handleUser(userData: User) { return userData.id }"
      
      const embedding1 = await Effect.runPromise(generateCodeEmbedding(text1))
      const embedding2 = await Effect.runPromise(generateCodeEmbedding(text2))
      
      const result: SimilarityResult = {
        similarity: calculateSimilarity(embedding1, embedding2),
        embedding1,
        embedding2,
        metadata: {
          text1,
          text2,
          embeddingType: 'code',
          dimensions: embedding1.length
        }
      }
      
      assertEquals(result.similarity > 0.8, true)
      assertEquals(result.metadata.embeddingType, 'code')
      assertEquals(result.metadata.dimensions, 768)
    })
  })

  describe('Caching and Performance', () => {
    it('should cache embeddings when caching is enabled', async () => {
      await Effect.runPromise(configureEmbeddings({
        dimensions: 768,
        model: 'text-embedding-004',
        batchSize: 100,
        enableCaching: true,
        apiKey: 'test-key'
      }))
      
      const text = "test caching functionality"
      
      // First request
      const startTime1 = Date.now()
      const embedding1 = await Effect.runPromise(generateCodeEmbedding(text))
      const endTime1 = Date.now()
      
      // Second request (should be cached)
      const startTime2 = Date.now()
      const embedding2 = await Effect.runPromise(generateCodeEmbedding(text))
      const endTime2 = Date.now()
      
      // Should be identical
      const similarity = calculateSimilarity(embedding1, embedding2)
      assertEquals(similarity, 1.0)
      
      // Second request should be faster
      assertEquals(endTime2 - startTime2 < endTime1 - startTime1, true)
    })

    it('should not cache embeddings when caching is disabled', async () => {
      await Effect.runPromise(configureEmbeddings({
        dimensions: 768,
        model: 'text-embedding-004',
        batchSize: 100,
        enableCaching: false,
        apiKey: 'test-key'
      }))
      
      const text = "test no caching functionality"
      
      const embedding1 = await Effect.runPromise(generateCodeEmbedding(text))
      const embedding2 = await Effect.runPromise(generateCodeEmbedding(text))
      
      // Should still be very similar but maybe not identical due to API variations
      const similarity = calculateSimilarity(embedding1, embedding2)
      assertEquals(similarity > 0.95, true)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty text gracefully', async () => {
      const embedding = await Effect.runPromise(generateCodeEmbedding(""))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
    })

    it('should handle very long text', async () => {
      const longText = "function ".repeat(1000) + "test() { return 'long' }"
      
      const embedding = await Effect.runPromise(generateCodeEmbedding(longText))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
    })

    it('should handle special characters and unicode', async () => {
      const specialText = "function 测试() { return '👍🚀💻' }"
      
      const embedding = await Effect.runPromise(generateCodeEmbedding(specialText))
      
      assertExists(embedding)
      assertEquals(Array.isArray(embedding), true)
      assertEquals(embedding.length, 768)
    })

    it('should handle API rate limits gracefully', async () => {
      // Simulate rate limit by making many requests quickly
      const requests = Array.from({ length: 100 }, (_, i) => 
        generateCodeEmbedding(`function test${i}() { return ${i} }`)
      )
      
      const results = await Promise.allSettled(
        requests.map(req => Effect.runPromise(req))
      )
      
      // Should have some successful results
      const successful = results.filter(r => r.status === 'fulfilled')
      assertEquals(successful.length > 0, true)
      
      // Rate limited requests should be handled gracefully
      const failed = results.filter(r => r.status === 'rejected')
      failed.forEach(failure => {
        assertEquals(failure.reason.message.includes('rate limit'), true)
      })
    })
  })

  describe('Multi-Model Support', () => {
    it('should support different embedding models with different dimensions', async () => {
      const models = [
        { model: 'text-embedding-004', dimensions: 768 },
        { model: 'text-embedding-3-large', dimensions: 3072 },
        { model: 'text-embedding-3-small', dimensions: 1536 }
      ]
      
      for (const config of models) {
        await Effect.runPromise(configureEmbeddings({
          dimensions: config.dimensions,
          model: config.model,
          batchSize: 100,
          enableCaching: true,
          apiKey: 'test-key'
        }))
        
        const embedding = await Effect.runPromise(generateCodeEmbedding("test text"))
        
        assertEquals(embedding.length, config.dimensions)
      }
    })

    it('should maintain model consistency across embedding types', async () => {
      const model = 'text-embedding-004'
      const dimensions = 768
      
      await Effect.runPromise(configureEmbeddings({
        dimensions,
        model,
        batchSize: 100,
        enableCaching: true,
        apiKey: 'test-key'
      }))
      
      const codeEmbedding = await Effect.runPromise(generateCodeEmbedding("function test() {}"))
      const semanticEmbedding = await Effect.runPromise(generateSemanticEmbedding("test function"))
      const relationshipEmbedding = await Effect.runPromise(generateRelationshipEmbedding("test relationship"))
      const dataFlowEmbedding = await Effect.runPromise(generateDataFlowEmbedding("test data flow"))
      
      // All should have same dimensions
      assertEquals(codeEmbedding.length, dimensions)
      assertEquals(semanticEmbedding.length, dimensions)
      assertEquals(relationshipEmbedding.length, dimensions)
      assertEquals(dataFlowEmbedding.length, dimensions)
    })
  })
})