/**
 * Vibe Start Command - Start SurrealDB server for existing workspace
 * 
 * @tested_by tests/start.test.ts
 */

import { Effect, pipe } from 'effect'
import { createStorageError, type VibeError } from '../index.ts'
import { ensureWorkspaceInitialized } from '../workspace.ts'
import { connectToDatabase, createDatabaseSchema } from '../database.ts'
import { isServerRunning, getServerInfo, startSurrealServer } from '../surreal-server.ts'


/**
 * Start SurrealDB server and initialize database schema
 */
const startServerAndDatabase = (): Effect.Effect<void, VibeError> =>
  pipe(
    connectToDatabase('.vibe/code.db'),
    Effect.flatMap(db =>
      pipe(
        createDatabaseSchema(db),
        Effect.catchAll(error => {
          // If schema already exists, that's fine - just continue
          if (error._tag === 'StorageError' && 
              error.message.includes('already exists')) {
            return Effect.succeed(void 0)
          }
          return Effect.fail(error)
        }),
        Effect.tap(() => Effect.tryPromise({
          try: () => db.close(),
          catch: (error) => createStorageError(error, 'database', 'Failed to close database')
        }).pipe(Effect.catchAll(() => Effect.succeed(void 0))))
      )
    ),
    Effect.map(() => void 0)
  )

/**
 * Main start command implementation
 */
export const startCommand = (): Effect.Effect<void, VibeError> =>
  pipe(
    // Ensure workspace is initialized
    ensureWorkspaceInitialized(),
    
    // Check if server is already running
    Effect.flatMap(() => isServerRunning()),
    Effect.flatMap(running => {
      if (running) {
        return pipe(
          getServerInfo(),
          Effect.tap(serverInfo => Effect.sync(() => {
            if (serverInfo) {
              console.log('✅ SurrealDB server already running')
              console.log(`   🌐 Address: ${serverInfo.host}:${serverInfo.port}`)
              console.log(`   🆔 PID: ${serverInfo.pid}`)
              console.log(`   📁 Database: ${serverInfo.dbPath}`)
            } else {
              console.log('✅ SurrealDB server already running')
            }
          })),
          Effect.map(() => void 0)
        )
      }
      
      // Server not running, start it
      return pipe(
        startServerAndDatabase(),
        Effect.tap(() => Effect.sync(() => {
          console.log('')
          console.log('Next steps:')
          console.log('  vibe index src/     # Index your source code')
          console.log('  vibe query "async"  # Search your code')
        }))
      )
    })
  )