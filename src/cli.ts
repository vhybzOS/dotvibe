/**
 * CLI Interface for dotvibe toolbox
 * 
 * @tested_by tests/cli.test.ts (Command parsing, help display, input validation)
 */

import { Effect, pipe } from 'effect'
import { Command } from 'commander'
import { type VibeError } from './index.ts'
import { executeQuery, formatQueryResults, QueryOptionsSchema } from './query.ts'


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
 * Setup CLI commands and options
 */
const setupCLI = () => {
  const program = new Command()
  
  program
    .name('vibe')
    .description('dotvibe - Toolbox for Coding Agents')
    .version('0.1.0')
  
  // Query command
  program
    .command('query')
    .description('Search code using natural language')
    .argument('<query>', 'Natural language query (e.g., "async functions")')
    .option('-l, --limit <number>', 'Maximum number of results', (value) => parseInt(value), 5)
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', (value) => parseFloat(value), 0.1)
    .option('-v, --verbose', 'Verbose output with performance metrics', false)
    .action(handleQueryCommand)
  
  // Help command
  program
    .command('help')
    .description('Show help information')
    .action(() => {
      console.log('🚀 dotvibe - Toolbox for Coding Agents\n')
      console.log('📖 Available Commands:')
      console.log('  vibe query <query>    Search code using natural language')
      console.log('  vibe help            Show this help message\n')
      console.log('🔧 Query Options:')
      console.log('  -l, --limit <number>      Maximum number of results (default: 5)')
      console.log('  -s, --similarity <number> Minimum similarity threshold 0-1 (default: 0.1)')
      console.log('  -v, --verbose             Show performance metrics\n')
      console.log('💡 Example: vibe query "async functions"')
    })
  
  return program
}

/**
 * Main CLI entry point
 */
export const main = async () => {
  const program = setupCLI()
  
  // Handle no arguments - show help
  if (Deno.args.length === 0) {
    const helpCmd = program.commands.find(cmd => cmd.name() === 'help')
    if (helpCmd) {
      helpCmd.action()()
    }
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