/**
 * Vibe Index Command - LLM-First Contextual Indexing
 * 
 * @tested_by tests/index.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createConfigurationError, type VibeError } from '../index.ts'
import { runLLMFirstIndexing } from '../agent/indexing.ts'
import { ensureWorkspaceReady } from '../workspace.ts'
import { setLogLevel, LogLevel, logSystem } from '../core/logger.ts'

// Index command options schema with logging levels
export const IndexOptionsSchema = z.object({
  verbose: z.boolean().default(false),
  debug: z.boolean().default(false)
})

export type IndexOptions = z.infer<typeof IndexOptionsSchema>

/**
 * Main index command implementation
 * Uses LLM-First Indexing: complete codebase context → single LLM analysis → parallel component processing
 */
export const indexCommand = (
  targetPath: string,
  options: Partial<IndexOptions> = {}
): Effect.Effect<void, VibeError> => {
  const indexOptions = IndexOptionsSchema.parse(options)
  
  // Set logging level based on flags
  if (indexOptions.debug) {
    setLogLevel(LogLevel.DEBUG)
  } else if (indexOptions.verbose) {
    setLogLevel(LogLevel.VERBOSE)
  } else {
    setLogLevel(LogLevel.NORMAL)
  }
  
  return pipe(
    // Ensure workspace is ready (database server started, etc.)
    ensureWorkspaceReady(),
    Effect.flatMap(() =>
      Effect.tryPromise({
        try: async () => {
          // Run LLM-first indexing with new logging system
          await Effect.runPromise(runLLMFirstIndexing(targetPath, indexOptions.verbose))
          
          return void 0 // Explicitly return void for Effect.tryPromise
        },
        catch: (error) => {
          logSystem.error(`Failed to run LLM-first indexing: ${error instanceof Error ? error.message : String(error)}`)
          return createConfigurationError(error, 'Failed to run LLM-first indexing')
        }
      })
    )
  )
}