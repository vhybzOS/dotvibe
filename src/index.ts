/**
 * Core Query Infrastructure
 * 
 * @tested_by tests/query.test.ts (Query types, error handling)
 */

import { Effect } from 'effect'
import { z } from 'zod/v4'

// Core query types - placeholders for future implementation
export const QueryDataSchema = z.object({
  text: z.string(),
  metadata: z.record(z.unknown()).optional()
})

export type QueryData = z.infer<typeof QueryDataSchema>

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
 * Placeholder: Future implementation for querying code
 * This will be replaced with actual query logic
 */
export const queryCodebase = (
  query: string,
  options?: { limit?: number; similarity?: number }
): Effect.Effect<QueryData[], VibeError> =>
  Effect.sync(() => {
    console.log(`🔍 Querying: "${query}" with options:`, options)
    // TODO: Implement actual query logic
    return []
  })

