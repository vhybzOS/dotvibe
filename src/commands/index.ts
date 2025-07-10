/**
 * Vibe Index Command - LLM-First Contextual Indexing
 * 
 * @tested_by tests/index.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createConfigurationError, type VibeError } from '../index.ts'
import { runLLMFirstIndexing } from '../mastra/agents/indexing_agent.ts'
import { ensureWorkspaceReady } from '../workspace.ts'
import { ingestPath, defaultConfigs } from '../path-ingest.ts'

// Index command options schema (simplified for Phase 2)
export const IndexOptionsSchema = z.object({
  verbose: z.boolean().default(false)
})

export type IndexOptions = z.infer<typeof IndexOptionsSchema>

/**
 * Main index command implementation
 * Uses LLM-First Contextual Indexing: full codebase context → architectural analysis → systematic indexing
 */
export const indexCommand = (
  targetPath: string,
  options: Partial<IndexOptions> = {}
): Effect.Effect<void, VibeError> => {
  const indexOptions = IndexOptionsSchema.parse(options)
  
  return pipe(
    // Ensure workspace is ready (database server started, etc.)
    ensureWorkspaceReady(),
    Effect.flatMap(() =>
      Effect.tryPromise({
        try: async () => {
          // Phase 1: Generate complete codebase digest using path-ingest
          if (indexOptions.verbose) {
            console.log('🚀 Generating codebase digest...')
          }
          
          const ingestResult = await ingestPath(targetPath, defaultConfigs.typescript)
          
          if (indexOptions.verbose) {
            console.log(`📊 Found ${ingestResult.stats.fileCount} files (${ingestResult.stats.totalLines} lines total)`)
          }
          
          // Phase 2: Run LLM-First indexing with full context
          await runLLMFirstIndexing(targetPath, ingestResult.content, indexOptions.verbose)
          
          return void 0 // Explicitly return void for Effect.tryPromise
        },
        catch: (error) => createConfigurationError(error, 'Failed to run LLM-first indexing')
      })
    )
  )
}