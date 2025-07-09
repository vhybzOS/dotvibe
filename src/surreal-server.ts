/**
 * SurrealDB Server Management
 * Automatically starts and manages SurrealDB server instances
 */

import { Effect, pipe } from 'effect'
import { createStorageError, type VibeError } from './index.ts'

// Server configuration
export interface ServerConfig {
  host: string
  port: number
  username: string
  password: string
  dbPath: string
}

export const defaultServerConfig: ServerConfig = {
  host: '127.0.0.1',
  port: 4243,
  username: 'root',
  password: 'root',
  dbPath: '.vibe/code.db'
}

/**
 * Check if port is available
 */
export const isPortAvailable = (port: number): Effect.Effect<boolean, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`)
        return false // Port is occupied
      } catch {
        return true // Port is available
      }
    },
    catch: (error) => createStorageError(error, 'port-check', 'Failed to check port availability')
  })

/**
 * Find next available port starting from base port
 */
export const findAvailablePort = (basePort: number = 4243): Effect.Effect<number, VibeError> =>
  pipe(
    Effect.gen(function* () {
      for (let port = basePort; port < basePort + 100; port++) {
        const available = yield* isPortAvailable(port)
        if (available) {
          return port
        }
      }
      throw new Error('No available ports found')
    }),
    Effect.catchAll((error) => 
      Effect.fail(createStorageError(error, 'port-scan', 'Failed to find available port'))
    )
  )

/**
 * Start SurrealDB server process with available port (background)
 */
export const startSurrealServer = (dbPath: string): Effect.Effect<ServerConfig, VibeError> =>
  pipe(
    findAvailablePort(),
    Effect.flatMap(port =>
      Effect.tryPromise({
        try: async () => {
          const config: ServerConfig = {
            host: '127.0.0.1',
            port,
            username: 'root',
            password: 'root',
            dbPath
          }
          
          console.log(`🚀 Starting SurrealDB server on ${config.host}:${config.port}...`)
          console.log(`📁 Database: ${config.dbPath}`)
          
          const absolutePath = config.dbPath.startsWith('/') ? config.dbPath : `${Deno.cwd()}/${config.dbPath}`
          
          // Start SurrealDB in background using nohup
          const surrealCmd = `nohup surreal start --log warn --user ${config.username} --pass ${config.password} --bind ${config.host}:${config.port} file://${absolutePath} > /dev/null 2>&1 &`
          
          const process = new Deno.Command('sh', {
            args: ['-c', surrealCmd],
            stdout: 'null',
            stderr: 'null',
            stdin: 'null'
          }).spawn()
          
          // Wait for the shell command to complete
          await process.status
          
          // Give the server a moment to start
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Find the actual SurrealDB process PID
          const findPidCmd = `pgrep -f "surreal start.*${config.port}"`
          const findPidProcess = new Deno.Command('sh', {
            args: ['-c', findPidCmd],
            stdout: 'piped',
            stderr: 'piped'
          }).spawn()
          
          const findPidOutput = await findPidProcess.output()
          const actualPid = new TextDecoder().decode(findPidOutput.stdout).trim()
          
          if (!actualPid) {
            throw new Error('Failed to find SurrealDB process PID')
          }
          
          // Save server info to PID file with actual PID
          const pidInfo = {
            pid: parseInt(actualPid),
            port: config.port,
            host: config.host,
            dbPath: config.dbPath,
            startTime: new Date().toISOString()
          }
          
          await Deno.writeTextFile('.vibe/server.pid', JSON.stringify(pidInfo, null, 2))
          
          // Wait for server to start (shorter wait)
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Verify server is responding
          let serverReady = false
          for (let i = 0; i < 10; i++) {
            try {
              const response = await fetch(`http://${config.host}:${config.port}/version`)
              if (response.ok) {
                serverReady = true
                break
              }
            } catch {
              // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          
          if (!serverReady) {
            console.log(`⚠️  Server may still be starting. Check with 'vibe stop' if needed.`)
          }
          
          console.log(`✅ SurrealDB server started on port ${config.port} (PID: ${pidInfo.pid})`)
          console.log(`🔄 Server running in background. Use 'vibe stop' to shutdown.`)
          
          // Don't wait for the process - let it run independently
          
          return config
        },
        catch: (error) => createStorageError(error, dbPath, 'Failed to start SurrealDB server')
      })
    )
  )

/**
 * Ensure SurrealDB server is running (start if needed)
 */
export const ensureSurrealServer = (dbPath: string): Effect.Effect<ServerConfig, VibeError> =>
  pipe(
    isServerRunning(),
    Effect.flatMap(running => {
      if (running) {
        return pipe(
          getServerInfo(),
          Effect.map(info => {
            if (info) {
              console.log(`✅ SurrealDB server already running on ${info.host}:${info.port}`)
              return info
            }
            // Fallback if no info but server is running
            return defaultServerConfig
          })
        )
      }
      
      return startSurrealServer(dbPath)
    })
  )

/**
 * Stop SurrealDB server using PID file
 */
export const stopSurrealServer = (): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const pidFilePath = '.vibe/server.pid'
      
      try {
        const pidFileContent = await Deno.readTextFile(pidFilePath)
        const pidInfo = JSON.parse(pidFileContent)
        
        console.log(`🛑 Stopping SurrealDB server (PID: ${pidInfo.pid})...`)
        
        // Try to kill the process using system command
        try {
          const killCmd = new Deno.Command('kill', {
            args: ['-TERM', pidInfo.pid.toString()],
            stdout: 'piped',
            stderr: 'piped'
          })
          
          const killResult = await killCmd.output()
          
          if (killResult.code === 0) {
            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // Check if process is still running by checking port
            try {
              const response = await fetch(`http://${pidInfo.host}:${pidInfo.port}/version`)
              if (response.ok) {
                // Process still running, force kill
                console.log('⚠️  Process still running, forcing shutdown...')
                const forceKillCmd = new Deno.Command('kill', {
                  args: ['-KILL', pidInfo.pid.toString()],
                  stdout: 'piped',
                  stderr: 'piped'
                })
                await forceKillCmd.output()
              }
            } catch {
              // Process is dead, this is expected
            }
            
            console.log('✅ SurrealDB server stopped')
          } else {
            console.log('⚠️  Server process not found (may have already stopped)')
          }
        } catch (error) {
          console.log('⚠️  Failed to stop server process:', error.message)
        }
        
        // Clean up PID file
        await Deno.remove(pidFilePath)
        
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          console.log('⚠️  No server PID file found. Server may not be running.')
        } else {
          throw error
        }
      }
    },
    catch: (error) => createStorageError(error, 'server-stop', 'Failed to stop SurrealDB server')
  })

/**
 * Check if server is running using PID file
 */
export const isServerRunning = (): Effect.Effect<boolean, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const pidFileContent = await Deno.readTextFile('.vibe/server.pid')
        const pidInfo = JSON.parse(pidFileContent)
        
        // Check if process is still running by checking the port response
        // (Deno.kill with signal 0 has issues, so we rely on HTTP check)
        try {
          const response = await fetch(`http://${pidInfo.host}:${pidInfo.port}/version`)
          return response.ok
        } catch {
          // Server not responding, clean up stale PID file
          await Deno.remove('.vibe/server.pid')
          return false
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return false // No PID file means no server
        }
        throw error
      }
    },
    catch: (error) => createStorageError(error, 'server-check', 'Failed to check server status')
  })

/**
 * Get server info from PID file
 */
export const getServerInfo = (): Effect.Effect<ServerConfig | null, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const pidFileContent = await Deno.readTextFile('.vibe/server.pid')
        const pidInfo = JSON.parse(pidFileContent)
        
        return {
          host: pidInfo.host,
          port: pidInfo.port,
          username: 'root',
          password: 'root',
          dbPath: pidInfo.dbPath
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return null
        }
        throw error
      }
    },
    catch: (error) => createStorageError(error, 'server-info', 'Failed to get server info')
  })

/**
 * Get server URL for connections
 */
export const getServerUrl = (config: ServerConfig = defaultServerConfig): string =>
  `http://${config.host}:${config.port}/rpc`