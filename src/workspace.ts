/**
 * Shared Workspace Utilities
 * Unified workspace validation and management functions
 * 
 * @tested_by tests/workspace.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createStorageError, type VibeError } from './index.ts'

/**
 * Workspace validation levels
 */
export enum WorkspaceValidationLevel {
  EXISTS = 'exists',           // .vibe directory exists
  INITIALIZED = 'initialized', // .vibe directory + config.json exists
  READY = 'ready'             // .vibe directory + config.json + database directory exists
}

/**
 * Workspace status information
 */
export const WorkspaceStatusSchema = z.object({
  exists: z.boolean(),
  initialized: z.boolean(),
  ready: z.boolean(),
  configPath: z.string().optional(),
  databasePath: z.string().optional(),
  createdAt: z.string().optional()
})

export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>

/**
 * Get comprehensive workspace status
 */
export const getWorkspaceStatus = (): Effect.Effect<WorkspaceStatus, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const status: WorkspaceStatus = {
        exists: false,
        initialized: false,
        ready: false
      }

      // Check if .vibe directory exists
      try {
        const vibeStats = await Deno.stat('.vibe')
        if (vibeStats.isDirectory) {
          status.exists = true
        }
      } catch {
        return status
      }

      // Check if workspace is initialized (has config.json)
      try {
        const configStats = await Deno.stat('.vibe/config.json')
        if (configStats.isFile) {
          status.initialized = true
          status.configPath = '.vibe/config.json'
          
          // Read config to get creation date
          try {
            const configContent = await Deno.readTextFile('.vibe/config.json')
            const config = JSON.parse(configContent)
            status.createdAt = config.created_at
          } catch {
            // Config file exists but can't read it - still considered initialized
          }
        }
      } catch {
        return status
      }

      // Check if workspace is ready (has database directory)
      try {
        const dbStats = await Deno.stat('.vibe/code.db')
        if (dbStats.isDirectory) {
          status.ready = true
          status.databasePath = '.vibe/code.db'
        }
      } catch {
        return status
      }

      return status
    },
    catch: (error) => createStorageError(error, '.vibe', 'Failed to check workspace status')
  })

/**
 * Check if workspace meets validation level (returns boolean)
 */
export const checkWorkspace = (level: WorkspaceValidationLevel): Effect.Effect<boolean, VibeError> =>
  pipe(
    getWorkspaceStatus(),
    Effect.map(status => {
      switch (level) {
        case WorkspaceValidationLevel.EXISTS:
          return status.exists
        case WorkspaceValidationLevel.INITIALIZED:
          return status.initialized
        case WorkspaceValidationLevel.READY:
          return status.ready
        default:
          return false
      }
    })
  )

/**
 * Ensure workspace meets validation level (throws on failure)
 */
export const ensureWorkspace = (level: WorkspaceValidationLevel): Effect.Effect<void, VibeError> =>
  pipe(
    getWorkspaceStatus(),
    Effect.flatMap(status => {
      switch (level) {
        case WorkspaceValidationLevel.EXISTS:
          if (!status.exists) {
            return Effect.fail({
              _tag: 'StorageError' as const,
              message: 'No vibe workspace found in current directory',
              path: '.vibe',
              details: 'Run "vibe init" to initialize a workspace first'
            })
          }
          break
        
        case WorkspaceValidationLevel.INITIALIZED:
          if (!status.exists) {
            return Effect.fail({
              _tag: 'StorageError' as const,
              message: 'No vibe workspace found in current directory',
              path: '.vibe',
              details: 'Run "vibe init" to initialize a workspace first'
            })
          }
          if (!status.initialized) {
            return Effect.fail({
              _tag: 'StorageError' as const,
              message: 'Vibe workspace not properly initialized',
              path: '.vibe/config.json',
              details: 'Workspace directory exists but is missing config.json. Try running "vibe init" again.'
            })
          }
          break
        
        case WorkspaceValidationLevel.READY:
          if (!status.exists) {
            return Effect.fail({
              _tag: 'StorageError' as const,
              message: 'No vibe workspace found in current directory',
              path: '.vibe',
              details: 'Run "vibe init" to initialize a workspace first'
            })
          }
          if (!status.initialized) {
            return Effect.fail({
              _tag: 'StorageError' as const,
              message: 'Vibe workspace not properly initialized',
              path: '.vibe/config.json',
              details: 'Run "vibe init" to initialize the workspace first'
            })
          }
          if (!status.ready) {
            return Effect.fail({
              _tag: 'StorageError' as const,
              message: 'Vibe workspace database not found',
              path: '.vibe/code.db',
              details: 'Run "vibe start" to initialize the database'
            })
          }
          break
      }
      
      return Effect.succeed(void 0)
    })
  )

/**
 * Check if workspace already exists (for init command)
 */
export const checkWorkspaceAlreadyExists = (): Effect.Effect<boolean, VibeError> =>
  checkWorkspace(WorkspaceValidationLevel.EXISTS)

/**
 * Ensure workspace exists (for commands that require workspace)
 */
export const ensureWorkspaceExists = (): Effect.Effect<void, VibeError> =>
  ensureWorkspace(WorkspaceValidationLevel.EXISTS)

/**
 * Ensure workspace is initialized (for commands that need config)
 */
export const ensureWorkspaceInitialized = (): Effect.Effect<void, VibeError> =>
  ensureWorkspace(WorkspaceValidationLevel.INITIALIZED)

/**
 * Ensure workspace is ready (for commands that need database)
 */
export const ensureWorkspaceReady = (): Effect.Effect<void, VibeError> =>
  ensureWorkspace(WorkspaceValidationLevel.READY)