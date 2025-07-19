/**
 * Unified Embeddings Module - Google Gemini Integration
 * 
 * Consolidates src/embeddings.ts and removes duplicate src/agent/embeddings.ts
 * Single source of truth for all embedding generation operations.
 * 
 * @tested_by tests/core/embeddings.test.ts (Embedding generation, error handling)
 */

import { GoogleGenAI } from '@google/genai'
import { Effect, pipe } from 'effect'
import { createError, type VibeError } from './errors.ts'

// Create subsystem-specific error creator
const networkError = createError('network')

/**
 * Embedding result structure
 */
export interface EmbeddingResult {
  /** The embedding vector (768 dimensions for Gemini) */
  embedding: number[]
  
  /** Original text that was embedded */
  text: string
  
  /** Model used for embedding */
  model: string
  
  /** Timestamp when embedding was generated */
  timestamp: Date
  
  /** Token count estimate */
  tokenCount: number
}

/**
 * Embedding options
 */
export interface EmbeddingOptions {
  /** Model to use (defaults to text-embedding-004) */
  model?: string
  
  /** Maximum retries on failure */
  maxRetries?: number
  
  /** Task type hint for the embedding model */
  taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING'
}

/**
 * Default embedding configuration
 */
const DEFAULT_CONFIG = {
  model: 'text-embedding-004',
  maxRetries: 3,
  taskType: 'SEMANTIC_SIMILARITY' as const,
  dimensions: 768 // Default Google AI embedding dimensions
}

/**
 * Get Google AI client with API key from environment
 */
const getGoogleAIClient = (): GoogleGenAI => {
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required')
  }
  return new GoogleGenAI({ apiKey })
}

/**
 * Simple token count estimation (4 chars per token average)
 */
const estimateTokenCount = (text: string): number => {
  return Math.ceil(text.length / 4)
}

/**
 * Generate embedding for a single text string
 * 
 * This is the main function used throughout the codebase for embedding generation.
 * Consolidates both implementations into a single, battle-tested function.
 */
export const generateSingleEmbedding = (
  text: string,
  options: EmbeddingOptions = {}
): Effect.Effect<EmbeddingResult, VibeError> => {
  const config = { ...DEFAULT_CONFIG, ...options }
  
  return Effect.tryPromise({
    try: async () => {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty')
      }
      
      const genAI = getGoogleAIClient()
      
      // Generate embedding using Google AI
      const result = await genAI.models.embedContent({
        model: config.model,
        contents: text
      })
      
      if (!result.embeddings || !result.embeddings[0] || !result.embeddings[0].values) {
        throw new Error('Invalid embedding response from Google AI')
      }
      
      return {
        embedding: result.embeddings[0].values,
        text,
        model: config.model,
        timestamp: new Date(),
        tokenCount: estimateTokenCount(text)
      } satisfies EmbeddingResult
    },
    catch: (error) => networkError('error', 'Failed to generate embedding', 'Google AI API', { error })
  })
}

/**
 * Generate embeddings for multiple texts in batch
 * 
 * Processes multiple texts efficiently with optional concurrency control
 */
export const generateBatchEmbeddings = (
  texts: string[],
  options: EmbeddingOptions & { concurrency?: number } = {}
): Effect.Effect<EmbeddingResult[], VibeError> => {
  const concurrency = options.concurrency || 5
  
  return Effect.all(
    texts.map(text => generateSingleEmbedding(text, options)),
    { concurrency }
  )
}

/**
 * Generate embedding with retry logic
 * 
 * Useful for handling rate limits and temporary failures
 */
export const generateEmbeddingWithRetry = (
  text: string,
  options: EmbeddingOptions = {}
): Effect.Effect<EmbeddingResult, VibeError> => {
  const config = { ...DEFAULT_CONFIG, ...options }
  
  const attemptEmbedding = (attemptsLeft: number): Effect.Effect<EmbeddingResult, VibeError> => {
    return pipe(
      generateSingleEmbedding(text, options),
      Effect.catchAll(error => {
        if (attemptsLeft > 0) {
          // Add delay before retry
          const delay = (config.maxRetries - attemptsLeft + 1) * 1000
          return pipe(
            Effect.sleep(delay),
            Effect.flatMap(() => attemptEmbedding(attemptsLeft - 1))
          )
        }
        return Effect.fail(error)
      })
    )
  }
  
  return attemptEmbedding(config.maxRetries)
}

/**
 * Calculate cosine similarity between two embeddings
 * 
 * Utility function for comparing embeddings locally
 */
export const cosineSimilarity = (embedding1: number[], embedding2: number[]): number => {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length')
  }
  
  let dotProduct = 0
  let magnitude1 = 0
  let magnitude2 = 0
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i]! * embedding2[i]!
    magnitude1 += embedding1[i]! * embedding1[i]!
    magnitude2 += embedding2[i]! * embedding2[i]!
  }
  
  magnitude1 = Math.sqrt(magnitude1)
  magnitude2 = Math.sqrt(magnitude2)
  
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0
  }
  
  return dotProduct / (magnitude1 * magnitude2)
}

/**
 * Validate embedding vector
 * 
 * Checks if an embedding vector is valid for storage/comparison
 */
export const validateEmbedding = (embedding: number[]): boolean => {
  if (!Array.isArray(embedding)) {
    return false
  }
  
  if (embedding.length === 0) {
    return false
  }
  
  // Check if all values are numbers and finite
  return embedding.every(value => typeof value === 'number' && isFinite(value))
}

/**
 * Normalize embedding vector
 * 
 * Converts embedding to unit vector (magnitude = 1)
 */
export const normalizeEmbedding = (embedding: number[]): number[] => {
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  
  if (magnitude === 0) {
    return embedding
  }
  
  return embedding.map(val => val / magnitude)
}

/**
 * Get embedding model info
 * 
 * Returns information about the embedding model being used
 */
export const getEmbeddingModelInfo = () => {
  return {
    model: DEFAULT_CONFIG.model,
    dimensions: 768, // Gemini text-embedding-004 dimensions
    maxTokens: 2048, // Approximate max tokens for embedding
    taskTypes: [
      'RETRIEVAL_QUERY',
      'RETRIEVAL_DOCUMENT', 
      'SEMANTIC_SIMILARITY',
      'CLASSIFICATION',
      'CLUSTERING'
    ]
  }
}

/**
 * Create embedding cache key
 * 
 * Generates a consistent cache key for embedding results
 */
export const createEmbeddingCacheKey = (text: string, options: EmbeddingOptions = {}): string => {
  const config = { ...DEFAULT_CONFIG, ...options }
  const content = `${config.model}:${config.taskType}:${text}`
  
  // Simple hash function for cache key
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  return `embedding:${hash.toString(36)}`
}

/**
 * Legacy compatibility function
 * 
 * Maintains compatibility with existing code that expects the old function signature
 */
export const generateEmbedding = generateSingleEmbedding

/**
 * Embedding utilities namespace
 * 
 * Groups utility functions for easier imports
 */
export const EmbeddingUtils = {
  similarity: cosineSimilarity,
  validate: validateEmbedding,
  normalize: normalizeEmbedding,
  modelInfo: getEmbeddingModelInfo,
  cacheKey: createEmbeddingCacheKey,
  tokenCount: estimateTokenCount
} as const