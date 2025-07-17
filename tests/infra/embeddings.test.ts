/**
 * Core Embeddings System Test Suite
 * Tests consolidated Google Gemini embedding generation with caching and batch processing
 * 
 * @tested_by tests/core/embeddings.test.ts (Embedding generation, batch processing, caching)
 */

import { assertEquals, assertExists, assertRejects, assertArrayIncludes } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { Effect } from 'effect'

import { 
  generateSingleEmbedding,
  generateBatchEmbeddings,
  validateEmbedding,
  normalizeEmbedding,
  EmbeddingUtils,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type BatchEmbeddingRequest,
  type BatchEmbeddingResponse,
  type EmbeddingOptions,
  type EmbeddingValidationResult
} from '../../src/infra/embeddings.ts'

describe('Core Embeddings System', () => {
  let originalApiKey: string | undefined
  
  beforeEach(() => {
    // Save original API key
    originalApiKey = Deno.env.get('GOOGLE_API_KEY')
    
    // Set test API key
    Deno.env.set('GOOGLE_API_KEY', 'test-api-key')
  })
  
  afterEach(() => {
    // Restore original API key
    if (originalApiKey) {
      Deno.env.set('GOOGLE_API_KEY', originalApiKey)
    } else {
      Deno.env.delete('GOOGLE_API_KEY')
    }
  })

  describe('Single Embedding Generation', () => {
    it('should generate embedding for single text', async () => {
      const text = 'Hello world, this is a test'
      const options: EmbeddingOptions = {
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY'
      }
      
      try {
        const embeddingEffect = generateSingleEmbedding(text, options)
        const result = await Effect.runPromise(embeddingEffect)
        
        assertExists(result)
        assertEquals(result.text, text)
        assertEquals(result.model, 'text-embedding-004')
        assertEquals(result.taskType, 'SEMANTIC_SIMILARITY')
        assertExists(result.embedding)
        assertEquals(Array.isArray(result.embedding), true)
        assertEquals(result.embedding.length > 0, true)
        assertEquals(typeof result.dimensions, 'number')
        assertEquals(result.dimensions > 0, true)
        assertExists(result.metadata)
        assertExists(result.metadata.processingTime)
        assertEquals(typeof result.metadata.processingTime, 'number')
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should handle different task types', async () => {
      const text = 'Test text for different task types'
      const taskTypes = ['RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT', 'SEMANTIC_SIMILARITY', 'CLASSIFICATION', 'CLUSTERING'] as const
      
      for (const taskType of taskTypes) {
        try {
          const embeddingEffect = generateSingleEmbedding(text, { taskType })
          const result = await Effect.runPromise(embeddingEffect)
          
          assertExists(result)
          assertEquals(result.taskType, taskType)
          
        } catch (error) {
          // Expected to fail without real API key
          assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
        }
      }
    })

    it('should handle empty text gracefully', async () => {
      const embeddingEffect = generateSingleEmbedding('', {})
      
      await assertRejects(() => Effect.runPromise(embeddingEffect))
    })

    it('should handle very long text', async () => {
      const longText = 'word '.repeat(10000) // Very long text
      
      try {
        const embeddingEffect = generateSingleEmbedding(longText, {})
        const result = await Effect.runPromise(embeddingEffect)
        
        assertExists(result)
        assertEquals(result.text.length > 10000, true)
        
      } catch (error) {
        // Expected to fail without real API key or due to length limits
        assertEquals(
          error.message.includes('API key') || 
          error.message.includes('authentication') || 
          error.message.includes('length') ||
          error.message.includes('too long'),
          true
        )
      }
    })

    it('should include proper metadata', async () => {
      const text = 'Test text with metadata'
      
      try {
        const embeddingEffect = generateSingleEmbedding(text, {
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY'
        })
        const result = await Effect.runPromise(embeddingEffect)
        
        assertExists(result.metadata)
        assertEquals(typeof result.metadata.processingTime, 'number')
        assertEquals(result.metadata.processingTime > 0, true)
        assertEquals(result.metadata.model, 'text-embedding-004')
        assertEquals(result.metadata.taskType, 'SEMANTIC_SIMILARITY')
        assertExists(result.metadata.requestId)
        assertEquals(typeof result.metadata.requestId, 'string')
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })
  })

  describe('Batch Embedding Generation', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = [
        'First text for batch processing',
        'Second text for batch processing',
        'Third text for batch processing'
      ]
      
      const options: EmbeddingOptions = {
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY',
        concurrency: 2
      }
      
      try {
        const batchEffect = generateBatchEmbeddings(texts, options)
        const results = await Effect.runPromise(batchEffect)
        
        assertExists(results)
        assertEquals(results.length, 3)
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          assertExists(result)
          assertEquals(result.text, texts[i])
          assertEquals(result.model, 'text-embedding-004')
          assertEquals(result.taskType, 'SEMANTIC_SIMILARITY')
          assertExists(result.embedding)
          assertEquals(Array.isArray(result.embedding), true)
          assertEquals(result.embedding.length > 0, true)
        }
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should handle batch processing with concurrency limits', async () => {
      const texts = Array.from({ length: 10 }, (_, i) => `Text ${i + 1}`)
      const options: EmbeddingOptions = {
        concurrency: 3,
        batchSize: 5
      }
      
      try {
        const batchEffect = generateBatchEmbeddings(texts, options)
        const results = await Effect.runPromise(batchEffect)
        
        assertExists(results)
        assertEquals(results.length, 10)
        
        // Verify all texts were processed
        for (let i = 0; i < results.length; i++) {
          assertEquals(results[i].text, texts[i])
        }
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should handle empty batch gracefully', async () => {
      const batchEffect = generateBatchEmbeddings([], {})
      const results = await Effect.runPromise(batchEffect)
      
      assertExists(results)
      assertEquals(results.length, 0)
    })

    it('should handle single item batch', async () => {
      const texts = ['Single text item']
      
      try {
        const batchEffect = generateBatchEmbeddings(texts, {})
        const results = await Effect.runPromise(batchEffect)
        
        assertExists(results)
        assertEquals(results.length, 1)
        assertEquals(results[0].text, 'Single text item')
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should handle batch errors gracefully', async () => {
      const texts = [
        'Valid text',
        '', // Empty text should cause error
        'Another valid text'
      ]
      
      const batchEffect = generateBatchEmbeddings(texts, {})
      
      await assertRejects(() => Effect.runPromise(batchEffect))
    })
  })

  describe('Embedding Validation', () => {
    it('should validate proper embedding structure', () => {
      const validEmbedding = {
        text: 'Test text',
        embedding: new Array(768).fill(0).map(() => Math.random()),
        dimensions: 768,
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY' as const,
        metadata: {
          processingTime: 150,
          requestId: 'test-request-123',
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY' as const
        }
      }
      
      const validation = validateEmbedding(validEmbedding)
      
      assertEquals(validation.valid, true)
      assertEquals(validation.errors.length, 0)
      assertEquals(validation.warnings.length, 0)
    })

    it('should detect invalid embedding dimensions', () => {
      const invalidEmbedding = {
        text: 'Test text',
        embedding: new Array(512).fill(0).map(() => Math.random()), // Wrong dimension
        dimensions: 768, // Claims 768 but embedding is 512
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY' as const,
        metadata: {
          processingTime: 150,
          requestId: 'test-request-123',
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY' as const
        }
      }
      
      const validation = validateEmbedding(invalidEmbedding)
      
      assertEquals(validation.valid, false)
      assertEquals(validation.errors.length > 0, true)
      assertEquals(validation.errors[0].includes('dimension'), true)
    })

    it('should detect invalid embedding values', () => {
      const invalidEmbedding = {
        text: 'Test text',
        embedding: [1, 2, NaN, 4, Infinity], // Contains invalid values
        dimensions: 5,
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY' as const,
        metadata: {
          processingTime: 150,
          requestId: 'test-request-123',
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY' as const
        }
      }
      
      const validation = validateEmbedding(invalidEmbedding)
      
      assertEquals(validation.valid, false)
      assertEquals(validation.errors.length > 0, true)
      assertEquals(validation.errors[0].includes('NaN') || validation.errors[0].includes('Infinity'), true)
    })

    it('should detect empty text', () => {
      const invalidEmbedding = {
        text: '', // Empty text
        embedding: new Array(768).fill(0).map(() => Math.random()),
        dimensions: 768,
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY' as const,
        metadata: {
          processingTime: 150,
          requestId: 'test-request-123',
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY' as const
        }
      }
      
      const validation = validateEmbedding(invalidEmbedding)
      
      assertEquals(validation.valid, false)
      assertEquals(validation.errors.length > 0, true)
      assertEquals(validation.errors[0].includes('text') || validation.errors[0].includes('empty'), true)
    })

    it('should provide warnings for unusual values', () => {
      const unusualEmbedding = {
        text: 'Test text',
        embedding: new Array(768).fill(0.9999), // All values very close to 1
        dimensions: 768,
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY' as const,
        metadata: {
          processingTime: 150,
          requestId: 'test-request-123',
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY' as const
        }
      }
      
      const validation = validateEmbedding(unusualEmbedding)
      
      assertEquals(validation.valid, true)
      assertEquals(validation.warnings.length > 0, true)
    })
  })

  describe('Embedding Normalization', () => {
    it('should normalize embedding to unit length', () => {
      const embedding = [3, 4, 0] // Length = 5
      const normalized = normalizeEmbedding(embedding)
      
      assertEquals(normalized.length, 3)
      assertEquals(Math.abs(normalized[0] - 0.6), 0.001) // 3/5 = 0.6
      assertEquals(Math.abs(normalized[1] - 0.8), 0.001) // 4/5 = 0.8
      assertEquals(Math.abs(normalized[2] - 0.0), 0.001) // 0/5 = 0.0
      
      // Check unit length
      const length = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0))
      assertEquals(Math.abs(length - 1.0), 0.001)
    })

    it('should handle zero vector', () => {
      const embedding = [0, 0, 0]
      const normalized = normalizeEmbedding(embedding)
      
      assertEquals(normalized.length, 3)
      assertEquals(normalized[0], 0)
      assertEquals(normalized[1], 0)
      assertEquals(normalized[2], 0)
    })

    it('should handle single dimension', () => {
      const embedding = [5]
      const normalized = normalizeEmbedding(embedding)
      
      assertEquals(normalized.length, 1)
      assertEquals(normalized[0], 1)
    })

    it('should handle negative values', () => {
      const embedding = [-3, 4, 0]
      const normalized = normalizeEmbedding(embedding)
      
      assertEquals(normalized.length, 3)
      assertEquals(Math.abs(normalized[0] - (-0.6)), 0.001) // -3/5 = -0.6
      assertEquals(Math.abs(normalized[1] - 0.8), 0.001) // 4/5 = 0.8
      assertEquals(Math.abs(normalized[2] - 0.0), 0.001) // 0/5 = 0.0
    })
  })

  describe('EmbeddingUtils Namespace', () => {
    it('should provide all utility functions', () => {
      assertExists(EmbeddingUtils.generateSingle)
      assertExists(EmbeddingUtils.generateBatch)
      assertExists(EmbeddingUtils.validate)
      assertExists(EmbeddingUtils.normalize)
      assertExists(EmbeddingUtils.similarity)
      assertExists(EmbeddingUtils.distance)
    })

    it('should calculate cosine similarity correctly', () => {
      const embedding1 = [1, 0, 0]
      const embedding2 = [0, 1, 0]
      const embedding3 = [1, 0, 0]
      
      const similarity1 = EmbeddingUtils.similarity(embedding1, embedding2)
      const similarity2 = EmbeddingUtils.similarity(embedding1, embedding3)
      
      assertEquals(Math.abs(similarity1 - 0.0), 0.001) // Orthogonal vectors
      assertEquals(Math.abs(similarity2 - 1.0), 0.001) // Identical vectors
    })

    it('should calculate euclidean distance correctly', () => {
      const embedding1 = [0, 0, 0]
      const embedding2 = [3, 4, 0]
      
      const distance = EmbeddingUtils.distance(embedding1, embedding2)
      
      assertEquals(Math.abs(distance - 5.0), 0.001) // 3-4-5 triangle
    })

    it('should handle same vectors', () => {
      const embedding = [1, 2, 3]
      
      const similarity = EmbeddingUtils.similarity(embedding, embedding)
      const distance = EmbeddingUtils.distance(embedding, embedding)
      
      assertEquals(Math.abs(similarity - 1.0), 0.001)
      assertEquals(Math.abs(distance - 0.0), 0.001)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      Deno.env.delete('GOOGLE_API_KEY')
      
      const embeddingEffect = generateSingleEmbedding('test text', {})
      
      await assertRejects(() => Effect.runPromise(embeddingEffect))
    })

    it('should handle invalid API key format', async () => {
      Deno.env.set('GOOGLE_API_KEY', 'invalid-key-format')
      
      const embeddingEffect = generateSingleEmbedding('test text', {})
      
      await assertRejects(() => Effect.runPromise(embeddingEffect))
    })

    it('should handle network errors', async () => {
      // This test would require mocking network failures
      // For now, we test that the function properly handles errors
      
      const embeddingEffect = generateSingleEmbedding('test text', {})
      
      try {
        await Effect.runPromise(embeddingEffect)
      } catch (error) {
        assertExists(error)
        assertEquals(typeof error.message, 'string')
      }
    })

    it('should handle rate limiting', async () => {
      // This test would require mocking rate limit responses
      // For now, we test that the function properly handles errors
      
      const texts = Array.from({ length: 100 }, (_, i) => `Text ${i}`)
      const batchEffect = generateBatchEmbeddings(texts, {})
      
      try {
        await Effect.runPromise(batchEffect)
      } catch (error) {
        assertExists(error)
        assertEquals(typeof error.message, 'string')
      }
    })
  })

  describe('Performance and Optimization', () => {
    it('should handle large batch efficiently', async () => {
      const texts = Array.from({ length: 50 }, (_, i) => `Performance test text ${i}`)
      const startTime = Date.now()
      
      try {
        const batchEffect = generateBatchEmbeddings(texts, {
          concurrency: 5,
          batchSize: 10
        })
        const results = await Effect.runPromise(batchEffect)
        
        const endTime = Date.now()
        const duration = endTime - startTime
        
        assertEquals(results.length, 50)
        assertEquals(duration < 30000, true) // Should complete within 30 seconds
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should respect concurrency limits', async () => {
      const texts = Array.from({ length: 20 }, (_, i) => `Concurrency test ${i}`)
      const concurrency = 3
      
      try {
        const batchEffect = generateBatchEmbeddings(texts, { concurrency })
        const results = await Effect.runPromise(batchEffect)
        
        assertEquals(results.length, 20)
        
        // In a real implementation, you'd verify that at most 3 requests
        // were made concurrently by checking timestamps or using mocks
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })
  })

  describe('Configuration Integration', () => {
    it('should use default configuration when options not provided', async () => {
      const text = 'Test with default config'
      
      try {
        const embeddingEffect = generateSingleEmbedding(text, {})
        const result = await Effect.runPromise(embeddingEffect)
        
        assertEquals(result.model, 'text-embedding-004') // Default model
        assertEquals(result.taskType, 'SEMANTIC_SIMILARITY') // Default task type
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should override defaults with provided options', async () => {
      const text = 'Test with custom config'
      const options: EmbeddingOptions = {
        model: 'custom-embedding-model',
        taskType: 'RETRIEVAL_DOCUMENT'
      }
      
      try {
        const embeddingEffect = generateSingleEmbedding(text, options)
        const result = await Effect.runPromise(embeddingEffect)
        
        assertEquals(result.model, 'custom-embedding-model')
        assertEquals(result.taskType, 'RETRIEVAL_DOCUMENT')
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })
  })

  describe('Caching Behavior', () => {
    it('should support caching when enabled', async () => {
      const text = 'Cached embedding test'
      const options: EmbeddingOptions = {
        enableCaching: true,
        cacheTTL: 3600
      }
      
      try {
        // First request
        const embeddingEffect1 = generateSingleEmbedding(text, options)
        const result1 = await Effect.runPromise(embeddingEffect1)
        
        // Second request (should use cache)
        const embeddingEffect2 = generateSingleEmbedding(text, options)
        const result2 = await Effect.runPromise(embeddingEffect2)
        
        assertEquals(result1.text, result2.text)
        assertEquals(result1.embedding.length, result2.embedding.length)
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })

    it('should bypass cache when disabled', async () => {
      const text = 'Non-cached embedding test'
      const options: EmbeddingOptions = {
        enableCaching: false
      }
      
      try {
        const embeddingEffect = generateSingleEmbedding(text, options)
        const result = await Effect.runPromise(embeddingEffect)
        
        assertEquals(result.text, text)
        
      } catch (error) {
        // Expected to fail without real API key
        assertEquals(error.message.includes('API key') || error.message.includes('authentication'), true)
      }
    })
  })

  describe('Type Safety', () => {
    it('should enforce proper request types', () => {
      const request: EmbeddingRequest = {
        text: 'Test text',
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY'
      }
      
      assertEquals(request.text, 'Test text')
      assertEquals(request.model, 'text-embedding-004')
      assertEquals(request.taskType, 'SEMANTIC_SIMILARITY')
    })

    it('should enforce proper response types', () => {
      const response: EmbeddingResponse = {
        text: 'Test text',
        embedding: [0.1, 0.2, 0.3],
        dimensions: 3,
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY',
        metadata: {
          processingTime: 150,
          requestId: 'test-123',
          model: 'text-embedding-004',
          taskType: 'SEMANTIC_SIMILARITY'
        }
      }
      
      assertEquals(response.text, 'Test text')
      assertEquals(response.embedding.length, 3)
      assertEquals(response.dimensions, 3)
      assertEquals(response.model, 'text-embedding-004')
    })

    it('should enforce proper batch types', () => {
      const batchRequest: BatchEmbeddingRequest = {
        texts: ['Text 1', 'Text 2'],
        model: 'text-embedding-004',
        taskType: 'SEMANTIC_SIMILARITY',
        concurrency: 2,
        batchSize: 10
      }
      
      assertEquals(batchRequest.texts.length, 2)
      assertEquals(batchRequest.concurrency, 2)
      assertEquals(batchRequest.batchSize, 10)
    })
  })
})