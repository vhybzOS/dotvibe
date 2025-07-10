/**
 * Vibe Index Command - Mastra-powered intelligent codebase exploration
 * 
 * @tested_by tests/index.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createConfigurationError, type VibeError } from '../index.ts'
import { runGuidedExploration } from '../mastra/agents/indexing_agent.ts'
import { ensureWorkspaceReady } from '../workspace.ts'

// Index command options schema (simplified for Phase 2)
export const IndexOptionsSchema = z.object({
  verbose: z.boolean().default(false)
})

export type IndexOptions = z.infer<typeof IndexOptionsSchema>

/**
 * Main index command implementation
 * Uses Mastra agent with Gemini to intelligently explore and understand the codebase
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
          await runGuidedExploration(targetPath, indexOptions.verbose)
          return void 0 // Explicitly return void for Effect.tryPromise
        },
        catch: (error) => createConfigurationError(error, 'Failed to run guided exploration')
      })
    )
  )
}