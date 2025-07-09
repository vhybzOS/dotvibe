/**
 * Process Management for SurrealDB Server
 * Handles server lifecycle and cleanup
 */

import { Effect } from 'effect'
import { createStorageError, type VibeError } from './index.ts'

/**
 * Setup basic process cleanup (no longer managing server directly)
 */
export const setupProcessCleanup = (): Effect.Effect<void, VibeError> =>
  Effect.sync(() => {
    // Basic cleanup for application shutdown
    const cleanup = () => {
      // Only cleanup application resources now
      // SurrealDB server runs in background and is managed separately
    }

    // Register cleanup handlers for application lifecycle
    Deno.addSignalListener('SIGINT', cleanup)
    Deno.addSignalListener('SIGTERM', cleanup)
    
    // Also cleanup on unhandled errors
    globalThis.addEventListener('unhandledrejection', cleanup)
    globalThis.addEventListener('error', cleanup)
    
    return void 0
  })