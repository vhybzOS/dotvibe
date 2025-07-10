/**
 * Vibe Index Command - LLM-driven intelligent codebase exploration
 * 
 * @tested_by tests/index.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createConfigurationError, type VibeError } from '../index.ts'
import { runGuidedExploration } from '../indexing-orchestrator.ts'

// Index command options schema (simplified for Phase 2)
export const IndexOptionsSchema = z.object({
  verbose: z.boolean().default(false)
})

export type IndexOptions = z.infer<typeof IndexOptionsSchema>

/**
 * Main index command implementation
 * Uses LLM orchestrator to intelligently explore and understand the codebase
 */
export const indexCommand = (
  targetPath: string,
  options: Partial<IndexOptions> = {}
): Effect.Effect<void, VibeError> => {
  const indexOptions = IndexOptionsSchema.parse(options)
  
  return pipe(
    Effect.tryPromise({
      try: () => runGuidedExploration(targetPath, indexOptions.verbose),
      catch: (error) => createConfigurationError(error, 'Failed to run guided exploration')
    })
  )
}