/**
 * Google Gemini Embeddings Integration
 * 
 * @tested_by tests/embeddings.test.ts (Embedding generation, API integration)
 * @tested_by tests/embedding-storage.test.ts (JSON storage, file operations)
 */

import { Effect, pipe } from 'effect'
import { GoogleGenAI } from '@google/genai'
import { load } from '@std/dotenv'
import { z } from 'zod/v4'

// Type definitions with Zod schemas
export const EmbeddingRequestSchema = z.object({
  text: z.string().min(1),
  model: z.string().default('text-embedding-004')
})

export const EmbeddingResultSchema = z.object({
  text: z.string(),
  embedding: z.array(z.number()),
  model: z.string(),
  timestamp: z.number()
})

export const EmbeddingStorageSchema = z.object({
  version: z.string(),
  created: z.number(),
  embeddings: z.array(EmbeddingResultSchema)
})

export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>
export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>
export type EmbeddingStorage = z.infer<typeof EmbeddingStorageSchema>

// Tagged union error schemas
export const ConfigurationErrorSchema = z.object({
  _tag: z.literal('ConfigurationError'),
  message: z.string(),
  details: z.string().optional()
})

export const EmbeddingErrorSchema = z.object({
  _tag: z.literal('EmbeddingError'),
  message: z.string(),
  text: z.string().optional()
})

export const StorageErrorSchema = z.object({
  _tag: z.literal('StorageError'),
  message: z.string(),
  path: z.string().optional()
})

export const VibeErrorSchema = z.discriminatedUnion('_tag', [
  ConfigurationErrorSchema,
  EmbeddingErrorSchema,
  StorageErrorSchema
])

export type ConfigurationError = z.infer<typeof ConfigurationErrorSchema>
export type EmbeddingError = z.infer<typeof EmbeddingErrorSchema>
export type StorageError = z.infer<typeof StorageErrorSchema>

export type VibeError = ConfigurationError | EmbeddingError | StorageError

// Error constructors
export const createConfigurationError = (
  error: unknown,
  details?: string
): ConfigurationError => {
  const baseError = {
    _tag: 'ConfigurationError' as const,
    message: error instanceof Error ? error.message : String(error)
  }
  return details ? { ...baseError, details } : baseError
}

export const createEmbeddingError = (
  error: unknown,
  text?: string
): EmbeddingError => {
  const baseError = {
    _tag: 'EmbeddingError' as const,
    message: error instanceof Error ? error.message : String(error)
  }
  return text ? { ...baseError, text } : baseError
}

export const createStorageError = (
  error: unknown,
  path?: string
): StorageError => {
  const baseError = {
    _tag: 'StorageError' as const,
    message: error instanceof Error ? error.message : String(error)
  }
  return path ? { ...baseError, path } : baseError
}

/**
 * Load environment configuration with validation
 */
export const loadConfiguration = (): Effect.Effect<{ apiKey: string; model: string }, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const env = await load()
      const apiKey = env.GOOGLE_API_KEY || Deno.env.get('GOOGLE_API_KEY')
      
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY not found in environment variables')
      }

      const model = env.GEMINI_MODEL || Deno.env.get('GEMINI_MODEL') || 'text-embedding-004'
      
      return { apiKey, model }
    },
    catch: (error) => createConfigurationError(error, 'Failed to load environment configuration')
  })

/**
 * Initialize Google Gemini client
 */
export const createGeminiClient = (apiKey: string): Effect.Effect<GoogleGenAI, VibeError> =>
  Effect.try({
    try: () => new GoogleGenAI({ apiKey }),
    catch: (error) => createConfigurationError(error, 'Failed to initialize Gemini client')
  })

/**
 * Generate embedding for text using Google Gemini
 */
export const generateEmbedding = (
  client: GoogleGenAI,
  request: EmbeddingRequest
): Effect.Effect<EmbeddingResult, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      // Try with content parameter
      const result = await client.models.embedContent({
        model: request.model,
        contents: [{ parts: [{ text: request.text }] }]
      })
      
      if (!result.embeddings?.[0]?.values) {
        throw new Error('No embedding values returned from API')
      }

      return {
        text: request.text,
        embedding: result.embeddings[0].values,
        model: request.model,
        timestamp: Date.now()
      }
    },
    catch: (error) => createEmbeddingError(error, request.text)
  })

/**
 * Save embeddings to JSON file
 */
export const saveEmbeddings = (
  embeddings: EmbeddingResult[],
  filePath: string = './embed.json'
): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const storage: EmbeddingStorage = {
        version: '1.0.0',
        created: Date.now(),
        embeddings
      }
      
      const jsonContent = JSON.stringify(storage, null, 2)
      await Deno.writeTextFile(filePath, jsonContent)
    },
    catch: (error) => createStorageError(error, filePath)
  })

/**
 * Load embeddings from JSON file
 */
export const loadEmbeddings = (
  filePath: string = './embed.json'
): Effect.Effect<EmbeddingStorage, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const content = await Deno.readTextFile(filePath)
      const parsed = JSON.parse(content)
      return EmbeddingStorageSchema.parse(parsed)
    },
    catch: (error) => createStorageError(error, filePath)
  })

/**
 * Read file content
 */
export const readFileContent = (filePath: string): Effect.Effect<string, VibeError> =>
  Effect.tryPromise({
    try: () => Deno.readTextFile(filePath),
    catch: (error) => createStorageError(error, filePath)
  })

/**
 * Main function to embed code file
 */
export const embedCodeFile = (
  codeFilePath: string = './code.ts',
  outputPath: string = './embed.json'
): Effect.Effect<EmbeddingStorage, VibeError> =>
  pipe(
    Effect.all([
      loadConfiguration(),
      readFileContent(codeFilePath)
    ]),
    Effect.flatMap(([config, content]) =>
      pipe(
        createGeminiClient(config.apiKey),
        Effect.flatMap(client =>
          generateEmbedding(client, {
            text: content,
            model: config.model
          })
        ),
        Effect.flatMap(embedding =>
          pipe(
            saveEmbeddings([embedding], outputPath),
            Effect.map(() => ({
              version: '1.0.0',
              created: Date.now(),
              embeddings: [embedding]
            }))
          )
        )
      )
    )
  )

/**
 * Calculate cosine similarity between two vectors
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    return 0
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}