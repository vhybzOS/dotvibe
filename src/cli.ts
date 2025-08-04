/**
 * CLI Interface for dotvibe toolbox
 * 
 * @tested_by tests/cli.test.ts (Command parsing, help display, input validation)
 */

// Auto-load .env file from current directory (if exists)
import '@std/dotenv/load'

import { Effect, pipe, Either } from 'effect'
import { Command } from 'commander'
import { type VibeError } from './index.ts'
import { executeQuery, formatQueryResults, QueryOptionsSchema } from './query.ts'
import { initCommand } from './commands/init.ts'
import { startCommand } from './commands/start.ts'
import { indexCommand, IndexOptionsSchema } from './commands/index.ts'
import { setupProcessCleanup } from './process-manager.ts'
import { stopSurrealServer, isServerRunning, getServerInfo } from './surreal-server.ts'
import { getWorkspaceStatus } from './workspace.ts'


/**
 * Handle init command - initialize vibe workspace
 */
const handleInitCommand = async () => {
  const program = pipe(
    initCommand(),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Initialization failed:')
        console.error(formatError(error))
        Deno.exit(1)
      })
    )
  )
  
  await Effect.runPromise(program)
}

/**
 * Handle start command - start SurrealDB server
 */
const handleStartCommand = async () => {
  const program = pipe(
    startCommand(),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Server start failed:')
        console.error(formatError(error))
        Deno.exit(1)
      })
    )
  )
  
  await Effect.runPromise(program)
}

/**
 * Handle index command - scan and index files
 */
const handleIndexCommand = async (
  targetPath: string,
  options: {
    ext?: string[]
    includeMarkdown?: boolean
    maxDepth?: number
    verbose?: boolean
    debug?: boolean
  }
) => {
  if (!targetPath || targetPath.trim().length === 0) {
    console.error('❌ Target path cannot be empty')
    console.error('💡 Example: vibe index src/')
    Deno.exit(1)
  }
  
  const indexOptions = IndexOptionsSchema.parse({
    verbose: options.verbose || false,
    debug: options.debug || false
  })
  
  const program = pipe(
    indexCommand(targetPath, indexOptions),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Indexing failed:')
        console.error(formatError(error))
        Deno.exit(1)
      })
    )
  )
  
  await Effect.runPromise(program)
}

/**
 * Handle query command - search code using natural language
 */
const handleQueryCommand = async (
  query: string, 
  options: { 
    limit?: number
    similarity?: number
    verbose?: boolean
  }
) => {
  if (!query || query.trim().length === 0) {
    console.error('❌ Query cannot be empty')
    console.error('💡 Example: vibe query "async functions"')
    Deno.exit(1)
  }
  
  if (options.verbose) {
    console.log(`🔍 Searching for: "${query}"`)
  }
  
  const queryOptions = QueryOptionsSchema.parse({
    limit: options.limit,
    minSimilarity: options.similarity
  })
  
  const program = pipe(
    executeQuery(query, queryOptions),
    Effect.tap(response => 
      Effect.sync(() => {
        const formatted = formatQueryResults(response)
        console.log(formatted)
        
        if (options.verbose) {
          console.log(`\n📈 Performance:`)
          console.log(`   Execution time: ${response.executionTime}ms`)
          console.log(`   Results found: ${response.totalResults}`)
        }
      })
    ),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Query failed:')
        console.error(formatError(error))
        Deno.exit(1)
      })
    )
  )
  
  await Effect.runPromise(program)
}

/**
 * Handle stop command - stop SurrealDB server
 */
const handleStopCommand = async () => {
  const program = pipe(
    isServerRunning(),
    Effect.flatMap(running => {
      if (!running) {
        return Effect.sync(() => {
          console.log('ℹ️  No SurrealDB server is currently running.')
        })
      }
      
      return pipe(
        stopSurrealServer(),
        Effect.tap(() => Effect.sync(() => {
          console.log('🎉 SurrealDB server stopped successfully.')
        }))
      )
    }),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Failed to stop server:')
        console.error(formatError(error))
        Deno.exit(1)
      })
    )
  )
  
  await Effect.runPromise(program)
}

/**
 * Handle status command - show workspace status
 */
const handleStatusCommand = async () => {
  const program = pipe(
    Effect.gen(function* () {
      console.log('🔍 Checking workspace status...\n')
      
      // Get comprehensive workspace status
      const workspaceStatus = yield* getWorkspaceStatus()
      
      if (!workspaceStatus.exists) {
        console.log('❌ No vibe workspace found in current directory')
        console.log('💡 Run `vibe init` to initialize a workspace')
        return
      }
      
      console.log('✅ Vibe workspace: `.vibe/`')
      
      if (workspaceStatus.createdAt) {
        console.log(`   📅 Created: ${new Date(workspaceStatus.createdAt).toLocaleString()}`)
      }
      if (workspaceStatus.databasePath) {
        console.log(`   🗄️  Database: ${workspaceStatus.databasePath}`)
      }
      if (!workspaceStatus.initialized) {
        console.log('   ⚠️  Warning: Workspace not fully initialized (missing config.json)')
      }
      
      // Check SurrealDB server status
      const serverRunning = yield* isServerRunning()
      const serverInfo = yield* getServerInfo()
      
      console.log('\n📊 Services Status:')
      
      if (serverRunning && serverInfo) {
        console.log(`✅ SurrealDB Server: Running`)
        console.log(`   🌐 Address: ${serverInfo.host}:${serverInfo.port}`)
        console.log(`   🆔 PID: ${serverInfo?.pid || 'Unknown'}`)
        console.log(`   📁 Database: ${serverInfo.dbPath}`)
        
        // Check database connection
        const dbHealthy = yield* Effect.tryPromise({
          try: async () => {
            const response = await fetch(`http://${serverInfo.host}:${serverInfo.port}/version`)
            return response.ok
          },
          catch: () => false
        })
        
        if (dbHealthy) {
          console.log(`   💚 Health: Healthy`)
        } else {
          console.log(`   💛 Health: Responding but may have issues`)
        }
      } else {
        console.log(`❌ SurrealDB Server: Not running`)
        console.log(`   💡 Run \`vibe start\` to start the server`)
      }
      
      console.log('\n📚 Data Status:')
      if (workspaceStatus.ready) {
        console.log(`✅ Database: Initialized`)
        console.log(`   📂 Location: ${workspaceStatus.databasePath}`)
      } else {
        console.log(`❌ Database: Not initialized`)
        console.log(`   💡 Run \`vibe start\` to initialize the database`)
      }
      
      // Show workspace isolation info
      console.log('\n🏠 Workspace Isolation:')
      console.log(`   📍 Current Path: ${Deno.cwd()}`)
      console.log(`   🔒 Isolated: Yes (path-specific server)`)
      
      console.log('\n💡 Available Commands:')
      console.log(`   vibe index src/     # Index your code`)
      console.log(`   vibe query "text"   # Search your code`)
      console.log(`   vibe stop           # Stop services`)
    }),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Status check failed:')
        console.error(formatError(error))
        Deno.exit(1)
      })
    )
  )
  
  await Effect.runPromise(program)
}

/**
 * Format error messages for user display
 */
const formatError = (error: VibeError): string => {
  switch (error._tag) {
    case 'ConfigurationError':
      return `Configuration Error: ${error.message}${error.details ? `\nDetails: ${error.details}` : ''}`
    
    case 'EmbeddingError':
      return `Embedding Error: ${error.message}${error.text ? `\nText: ${error.text.slice(0, 100)}...` : ''}`
    
    case 'StorageError':
      return `Storage Error: ${error.message}${error.path ? `\nPath: ${error.path}` : ''}`
    
    default:
      return `Unknown Error: ${JSON.stringify(error)}`
  }
}

/**
 * Get version from deno.json
 */
const getVersion = (): string => {
  try {
    // Try multiple paths to find deno.json
    const possiblePaths = [
      new URL('../deno.json', import.meta.url).pathname,
      './deno.json',
      '../deno.json',
      '../../deno.json'
    ]
    
    for (const path of possiblePaths) {
      try {
        const denoConfig = JSON.parse(Deno.readTextFileSync(path))
        return denoConfig.version || '1.0.0'
      } catch {
        continue
      }
    }
    
    // If no deno.json found, return fallback
    return '1.0.0'
  } catch {
    // Fallback version if deno.json can't be read
    return '1.0.0'
  }
}

/**
 * Setup CLI commands and options
 */
const setupCLI = () => {
  const program = new Command()
  
  program
    .name('vibe')
    .description('dotvibe - Intelligent Code Indexing and Search')
    .version(getVersion())
  
  // Init command
  program
    .command('init')
    .description('Initialize vibe workspace in current directory')
    .action(handleInitCommand)
  
  // Start command
  program
    .command('start')
    .description('Start SurrealDB server for current workspace')
    .action(handleStartCommand)
  
  // Index command
  program
    .command('index')
    .description('Index code files for search')
    .argument('<path>', 'Path to index (file or directory)')
    .option('--ext <extensions...>', 'Specific file extensions to index (e.g., .ts .js)')
    .option('--include-markdown', 'Include markdown files in indexing', false)
    .option('--max-depth <number>', 'Maximum directory depth to scan', (value) => parseInt(value), 10)
    .option('-v, --verbose', 'Verbose output with detailed progress', false)
    .option('--debug', 'Debug output with internal operations (includes verbose)', false)
    .action(handleIndexCommand)
  
  // Query command
  program
    .command('query')
    .description('Search code using natural language')
    .argument('<query>', 'Natural language query (e.g., "async functions")')
    .option('-l, --limit <number>', 'Maximum number of results', (value) => parseInt(value), 5)
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', (value) => parseFloat(value), 0.1)
    .option('-v, --verbose', 'Verbose output with performance metrics', false)
    .action(handleQueryCommand)
  
  // Stop command
  program
    .command('stop')
    .description('Stop the SurrealDB server')
    .action(handleStopCommand)
  
  // Status command
  program
    .command('status')
    .description('Show workspace and services status')
    .action(handleStatusCommand)
  
  // Help command
  program
    .command('help')
    .description('Show help information')
    .action(() => {
      console.log('🚀 dotvibe - Intelligent Code Indexing and Search\n')
      console.log('📖 Quick Start:')
      console.log('  1. vibe init              Initialize workspace + start server')
      console.log('  2. vibe index src/        Index your source code')
      console.log('  3. vibe query "async"     Search your code\n')
      console.log('🎯 Server Control:')
      console.log('  vibe start                Start server (if stopped)')
      console.log('  vibe stop                 Stop server')
      console.log('  vibe status               Check server status\n')
      console.log('🔧 Commands:')
      console.log('  vibe init                 Initialize .vibe workspace')
      console.log('  vibe start                Start SurrealDB server')
      console.log('  vibe index <path>         Index files for search')
      console.log('  vibe query <query>        Search indexed code')
      console.log('  vibe status               Show workspace status')
      console.log('  vibe stop                 Stop SurrealDB server')
      console.log('  vibe help                 Show this help message\n')
      console.log('🔍 Index Options:')
      console.log('  --ext .ts,.js             Index specific extensions')
      console.log('  --include-markdown        Include .md files')
      console.log('  --max-depth 5             Limit directory depth')
      console.log('  -v, --verbose             Show detailed progress')
      console.log('  --debug                   Show internal operations\n')
      console.log('🔍 Query Options:')
      console.log('  -l, --limit 10            Maximum results')
      console.log('  -s, --similarity 0.1      Similarity threshold')
      console.log('  -v, --verbose             Show performance metrics\n')
      console.log('💡 Examples:')
      console.log('  vibe init                        # New workspace')
      console.log('  vibe start                       # Start server')
      console.log('  vibe index src/ --ext .ts,.tsx   # Index specific files')
      console.log('  vibe query "async functions"     # Search code')
      console.log('  vibe stop                        # Stop server')
    })
  
  return program
}

/**
 * Main CLI entry point
 */
export const main = async () => {
  // Setup process cleanup for SurrealDB server
  await Effect.runPromise(setupProcessCleanup())
  
  const program = setupCLI()
  
  // Handle no arguments - show help
  if (Deno.args.length === 0) {
    program.help()
    return
  }
  
  try {
    await program.parseAsync(Deno.args, { from: 'user' })
  } catch (error) {
    console.error('❌ CLI Error:', error instanceof Error ? error.message : String(error))
    console.error('💡 Use "vibe help" for usage information')
    Deno.exit(1)
  }
}

// Run CLI if this is the main module
if (import.meta.main) {
  main()
}