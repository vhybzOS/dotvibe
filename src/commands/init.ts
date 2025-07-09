/**
 * Vibe Init Command - Initialize workspace with SurrealDB
 * 
 * @tested_by tests/init.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createStorageError, type VibeError } from '../index.ts'
import { checkWorkspaceAlreadyExists } from '../workspace.ts'
import { startCommand } from './start.ts'

// Configuration schema
export const WorkspaceConfigSchema = z.object({
  version: z.string(),
  created_at: z.string(),
  database_path: z.string(),
  last_indexed: z.string().optional()
})

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>


/**
 * Create .vibe directory
 */
const createVibeDirectory = (): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: () => Deno.mkdir('.vibe', { recursive: true }),
    catch: (error) => createStorageError(error, '.vibe', 'Failed to create .vibe directory')
  })

/**
 * Create workspace configuration file
 */
const createWorkspaceConfig = (): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const config: WorkspaceConfig = {
        version: '1.0.0',
        created_at: new Date().toISOString(),
        database_path: '.vibe/code.db'
      }
      
      const configContent = JSON.stringify(config, null, 2)
      await Deno.writeTextFile('.vibe/config.json', configContent)
    },
    catch: (error) => createStorageError(error, '.vibe/config.json', 'Failed to create config file')
  })


/**
 * Main init command implementation
 */
export const initCommand = (): Effect.Effect<void, VibeError> =>
  pipe(
    checkWorkspaceAlreadyExists(),
    Effect.flatMap(exists => {
      if (exists) {
        return Effect.fail({
          _tag: 'StorageError' as const,
          message: 'Vibe workspace already exists in this directory',
          path: '.vibe',
          details: 'Use "vibe start" to start the server if needed'
        })
      }
      return Effect.succeed(void 0)
    }),
    Effect.flatMap(() => createVibeDirectory()),
    Effect.flatMap(() => createWorkspaceConfig()),
    Effect.tap(() => Effect.sync(() => {
      console.log('✅ Vibe workspace initialized in .vibe/')
      console.log('🗄️  Database: .vibe/code.db')
      console.log('⚙️  Config: .vibe/config.json')
    })),
    Effect.flatMap(() => startCommand())
  )