/**
 * CLI Interface for dotvibe toolbox
 * 
 * @tested_by tests/cli.test.ts (Command parsing, help display, input validation)
 * @tested_by tests/cli-integration.test.ts (End-to-end CLI workflows)
 */

import { Effect, pipe } from 'effect'
import { Command } from 'commander'
import { embedCodeFile, type VibeError } from './index.ts'
import { executeQuery, formatQueryResults, QueryOptionsSchema } from './query.ts'

/**
 * Handle embedding command - generate embeddings for code.ts
 */
const handleEmbedCommand = async (options: { file?: string; output?: string }) => {
  const codeFile = options.file || './code.ts'
  const outputFile = options.output || './embed.json'
  
  console.log(`🔄 Generating embeddings for ${codeFile}...`)
  
  const program = pipe(
    embedCodeFile(codeFile, outputFile),
    Effect.tap(storage => 
      Effect.sync(() => {
        console.log(`✅ Successfully generated embeddings!`)
        console.log(`📁 Saved to: ${outputFile}`)
        console.log(`📊 Embeddings: ${storage.embeddings.length}`)
        console.log(`🕐 Created: ${new Date(storage.created).toISOString()}`)
      })
    ),
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.error('❌ Failed to generate embeddings:')
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
    embeddings?: string
    verbose?: boolean
  }
) => {
  if (!query || query.trim().length === 0) {
    console.error('❌ Query cannot be empty')
    console.error('💡 Example: vibe query "async functions"')
    Deno.exit(1)
  }
  
  const embeddingFile = options.embeddings || './embed.json'
  
  if (options.verbose) {
    console.log(`🔍 Searching for: "${query}"`)
    console.log(`📁 Using embeddings: ${embeddingFile}`)
  }
  
  const queryOptions = QueryOptionsSchema.parse({
    limit: options.limit,
    minSimilarity: options.similarity
  })
  
  const program = pipe(
    executeQuery(query, queryOptions, embeddingFile),
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
        
        if (error._tag === 'StorageError' && error.message.includes('No such file')) {
          console.error('')
          console.error('💡 Tip: Generate embeddings first with:')
          console.error('   deno task dev embed')
        }
        
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
  
  // Embed command
  program
    .command('embed')
    .description('Generate embeddings for code files')
    .option('-f, --file <path>', 'Code file to embed', './code.ts')
    .option('-o, --output <path>', 'Output file for embeddings', './embed.json')
    .action(handleEmbedCommand)
  
  // Query command
  program
    .command('query')
    .description('Search code using natural language')
    .argument('<query>', 'Natural language query (e.g., "async functions")')
    .option('-l, --limit <number>', 'Maximum number of results', (value) => parseInt(value), 5)
    .option('-s, --similarity <number>', 'Minimum similarity threshold (0-1)', (value) => parseFloat(value), 0.1)
    .option('-e, --embeddings <path>', 'Path to embeddings file', './embed.json')
    .option('-v, --verbose', 'Verbose output with performance metrics', false)
    .action(handleQueryCommand)
  
  // Help command
  program
    .command('help')
    .description('Show help information')
    .action(() => {
      console.log('🚀 dotvibe - Toolbox for Coding Agents\n')
      console.log('📖 Quick Start:')
      console.log('  1. Copy .env.example to .env and add your GOOGLE_API_KEY')
      console.log('  2. Generate embeddings: deno task dev embed')
      console.log('  3. Search your code: deno task dev query "async functions"\n')
      console.log('🔧 Commands:')
      program.outputHelp()
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
    program.commands.find(cmd => cmd.name() === 'help')?.action()
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