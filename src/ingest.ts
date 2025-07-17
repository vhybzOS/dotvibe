/**
 * Modern File Ingestion with code2prompt CLI Integration
 * 
 * Replaces path-ingest.ts with battle-tested code2prompt CLI for enhanced
 * file processing, accurate token counting, and agent system integration.
 * 
 * @tested_by tests/ingest.test.ts (CLI integration, token parsing, agent compatibility)
 */

import { z } from 'zod/v4'
import { Effect, pipe } from 'effect'
import { createStorageError, type VibeError } from './index.ts'
import type { TokenEstimate, Code2PromptOptions } from './agent/types.ts'
import { mapModelToCode2promptTokenizer } from './agent/models.ts'

/**
 * Ingest configuration schema with code2prompt CLI options
 */
export const IngestConfigSchema = z.object({
  // Core options
  outputFormat: z.enum(['markdown', 'json', 'xml']).default('markdown'),
  includeTokens: z.boolean().default(true),
  tokenizer: z.string().default('cl100k'),
  
  // File filtering
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  includeHidden: z.boolean().default(false),
  followSymlinks: z.boolean().default(false),
  
  // Advanced options
  lineNumbers: z.boolean().default(false),
  absolutePaths: z.boolean().default(false),
  fullDirectoryTree: z.boolean().default(true),
  noCodeblock: z.boolean().default(false),
  noClipboard: z.boolean().default(true),
  noIgnore: z.boolean().default(false),
  
  // Git integration
  includeDiff: z.boolean().default(false),
  gitDiffBranch: z.tuple([z.string(), z.string()]).optional(),
  gitLogBranch: z.tuple([z.string(), z.string()]).optional(),
  
  // File processing
  maxFileSize: z.number().optional(),
  sort: z.enum(['name_asc', 'name_desc', 'date_asc', 'date_desc']).optional(),
})

export type IngestConfig = z.infer<typeof IngestConfigSchema>

/**
 * File statistics from code2prompt processing
 */
export interface IngestStats {
  /** Total number of files processed */
  fileCount: number
  
  /** Total size of all files in bytes */
  totalSize: number
  
  /** Processing time in milliseconds */
  processingTime: number
  
  /** code2prompt CLI version used */
  cliVersion: string
  
  /** Files that were excluded/ignored */
  excludedFiles: string[]
  
  /** Files that were included */
  includedFiles: string[]
}

/**
 * Metadata about the ingestion process
 */
export interface IngestMetadata {
  /** Target path that was processed */
  targetPath: string
  
  /** Resolved absolute path */
  absolutePath: string
  
  /** Configuration used for processing */
  config: IngestConfig
  
  /** Timestamp when ingestion started */
  startTime: Date
  
  /** Timestamp when ingestion completed */
  endTime: Date
  
  /** code2prompt CLI command that was executed */
  cliCommand: string
  
  /** Model tokenizer used for token counting */
  modelTokenizer: string
}

/**
 * Complete ingestion result with content, tokens, and metadata
 */
export interface IngestResult {
  /** Processed content from code2prompt (markdown by default) */
  content: string
  
  /** Token estimate from code2prompt --tokens raw */
  tokenEstimate: TokenEstimate
  
  /** File processing statistics */
  stats: IngestStats
  
  /** Ingestion metadata */
  metadata: IngestMetadata
}

/**
 * JSON ingestion result for structured file processing
 */
export interface IngestJSONResult {
  /** Directory name that was processed */
  directoryName: string
  
  /** Array of file paths found */
  files: string[]
  
  /** Complete markdown content (same as IngestResult.content) */
  content: string
  
  /** Token estimate from code2prompt --tokens raw */
  tokenEstimate: TokenEstimate
  
  /** File processing statistics */
  stats: IngestStats
  
  /** Ingestion metadata */
  metadata: IngestMetadata
}

/**
 * code2prompt JSON output structure
 */
export interface Code2PromptJSONOutput {
  directory_name: string
  files: string[]
  model_info: string
  prompt: string
}

/**
 * Parse token count from code2prompt output
 * Expected format: "[i] Token count: 50, Model info: ChatGPT models, text-embedding-ada-002"
 */
export const parseTokenCount = (
  output: string,
  tokenizer: string
): Effect.Effect<TokenEstimate, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      const tokenRegex = /\[i\] Token count: (\d+), Model info: (.+)/
      const match = output.match(tokenRegex)
      
      if (!match) {
        throw new Error(`Failed to parse token count from output: ${output}`)
      }
      
      const totalTokens = parseInt(match[1]!, 10)
      const modelInfo = match[2]!
      
      return {
        totalTokens,
        inputTokens: totalTokens, // code2prompt counts input tokens
        outputTokens: 0,
        tokenizer
      } satisfies TokenEstimate
    },
    catch: (error) => createStorageError(error, 'output', 'Failed to parse token count')
  })
}

/**
 * Build code2prompt CLI command with options
 */
export const buildCode2PromptCommand = (
  targetPath: string,
  config: IngestConfig
): string => {
  const cmd = ['code2prompt']
  
  // Core options
  cmd.push(`--output-format=${config.outputFormat}`)
  cmd.push(`--encoding=${config.tokenizer}`)
  
  if (config.includeTokens) {
    cmd.push('--tokens=raw')
  }
  
  // File filtering
  if (config.include) {
    config.include.forEach(pattern => cmd.push(`--include="${pattern}"`))
  }
  
  if (config.exclude) {
    config.exclude.forEach(pattern => cmd.push(`--exclude="${pattern}"`))
  }
  
  // Boolean flags
  if (config.includeHidden) cmd.push('--hidden')
  if (config.followSymlinks) cmd.push('--follow-symlinks')
  if (config.lineNumbers) cmd.push('--line-numbers')
  if (config.absolutePaths) cmd.push('--absolute-paths')
  if (config.fullDirectoryTree) cmd.push('--full-directory-tree')
  if (config.noCodeblock) cmd.push('--no-codeblock')
  if (config.noClipboard) cmd.push('--no-clipboard')
  if (config.noIgnore) cmd.push('--no-ignore')
  
  // Git integration
  if (config.includeDiff) cmd.push('--diff')
  if (config.gitDiffBranch) {
    cmd.push(`--git-diff-branch=${config.gitDiffBranch[0]}`, config.gitDiffBranch[1])
  }
  if (config.gitLogBranch) {
    cmd.push(`--git-log-branch=${config.gitLogBranch[0]}`, config.gitLogBranch[1])
  }
  
  // Advanced options
  if (config.sort) cmd.push(`--sort=${config.sort}`)
  
  // Target path (must be last)
  cmd.push(targetPath)
  
  return cmd.join(' ')
}

/**
 * Execute code2prompt CLI with JSON output format
 */
export const executeCode2PromptJSON = (
  targetPath: string,
  config: IngestConfig
): Effect.Effect<{ jsonOutput: Code2PromptJSONOutput; tokenOutput: string }, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      // Create temporary file for JSON output
      const tempFile = await Deno.makeTempFile({ suffix: '.json' })
      
      try {
        // Build args array for JSON output
        const args: string[] = []
        
        // Core options - JSON format
        args.push(`--output-format=json`)
        args.push(`--encoding=${config.tokenizer}`)
        args.push(`--output-file=${tempFile}`)
        
        if (config.includeTokens) {
          args.push('--tokens=raw')
        }
        
        // File filtering
        if (config.include) {
          config.include.forEach(pattern => {
            args.push('--include')
            args.push(pattern)
          })
        }
        
        if (config.exclude) {
          config.exclude.forEach(pattern => {
            args.push('--exclude')
            args.push(pattern)
          })
        }
        
        // Boolean flags
        if (config.includeHidden) args.push('--hidden')
        if (config.followSymlinks) args.push('--follow-symlinks')
        if (config.lineNumbers) args.push('--line-numbers')
        if (config.absolutePaths) args.push('--absolute-paths')
        if (config.fullDirectoryTree) args.push('--full-directory-tree')
        if (config.noCodeblock) args.push('--no-codeblock')
        if (config.noIgnore) args.push('--no-ignore')
        
        // Git integration
        if (config.includeDiff) args.push('--diff')
        if (config.gitDiffBranch) {
          args.push('--git-diff-branch')
          args.push(config.gitDiffBranch[0])
          args.push(config.gitDiffBranch[1])
        }
        if (config.gitLogBranch) {
          args.push('--git-log-branch')
          args.push(config.gitLogBranch[0])
          args.push(config.gitLogBranch[1])
        }
        
        // Advanced options
        if (config.sort) args.push(`--sort=${config.sort}`)
        
        // Target path (must be last)
        args.push(targetPath)
        
        const process = new Deno.Command('code2prompt', {
          args,
          stdout: 'piped',
          stderr: 'piped'
        })
        
        const { code, stdout, stderr } = await process.output()
        
        const stdoutText = new TextDecoder().decode(stdout)
        const stderrText = new TextDecoder().decode(stderr)
        
        if (code !== 0) {
          throw new Error(`code2prompt failed with exit code ${code}: ${stderrText}`)
        }
        
        // Read the JSON output from the file
        const jsonContent = await Deno.readTextFile(tempFile)
        const jsonOutput: Code2PromptJSONOutput = JSON.parse(jsonContent)
        
        return {
          jsonOutput,
          tokenOutput: stdoutText
        }
        
      } finally {
        // Clean up temporary file
        try {
          await Deno.remove(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    catch: (error) => createStorageError(error, `code2prompt JSON ${targetPath}`, 'Failed to execute code2prompt with JSON output')
  })
}

/**
 * Execute code2prompt CLI and capture output using temporary file
 */
export const executeCode2Prompt = (
  targetPath: string,
  config: IngestConfig
): Effect.Effect<{ content: string; tokenOutput: string }, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      // Create temporary file for output
      const tempFile = await Deno.makeTempFile({ suffix: '.md' })
      
      try {
        // Build args array
        const args: string[] = []
        
        // Core options
        args.push(`--output-format=${config.outputFormat}`)
        args.push(`--encoding=${config.tokenizer}`)
        args.push(`--output-file=${tempFile}`)
        
        if (config.includeTokens) {
          args.push('--tokens=raw')
        }
        
        // File filtering
        if (config.include) {
          config.include.forEach(pattern => {
            args.push('--include')
            args.push(pattern)
          })
        }
        
        if (config.exclude) {
          config.exclude.forEach(pattern => {
            args.push('--exclude')
            args.push(pattern)
          })
        }
        
        // Boolean flags
        if (config.includeHidden) args.push('--hidden')
        if (config.followSymlinks) args.push('--follow-symlinks')
        if (config.lineNumbers) args.push('--line-numbers')
        if (config.absolutePaths) args.push('--absolute-paths')
        if (config.fullDirectoryTree) args.push('--full-directory-tree')
        if (config.noCodeblock) args.push('--no-codeblock')
        if (config.noIgnore) args.push('--no-ignore')
        
        // Git integration
        if (config.includeDiff) args.push('--diff')
        if (config.gitDiffBranch) {
          args.push('--git-diff-branch')
          args.push(config.gitDiffBranch[0])
          args.push(config.gitDiffBranch[1])
        }
        if (config.gitLogBranch) {
          args.push('--git-log-branch')
          args.push(config.gitLogBranch[0])
          args.push(config.gitLogBranch[1])
        }
        
        // Advanced options
        if (config.sort) args.push(`--sort=${config.sort}`)
        
        // Target path (must be last)
        args.push(targetPath)
        
        const process = new Deno.Command('code2prompt', {
          args,
          stdout: 'piped',
          stderr: 'piped'
        })
        
        const { code, stdout, stderr } = await process.output()
        
        const stdoutText = new TextDecoder().decode(stdout)
        const stderrText = new TextDecoder().decode(stderr)
        
        if (code !== 0) {
          throw new Error(`code2prompt failed with exit code ${code}: ${stderrText}`)
        }
        
        // Read the actual content from the output file
        const content = await Deno.readTextFile(tempFile)
        
        return {
          content,
          tokenOutput: stdoutText
        }
        
      } finally {
        // Clean up temporary file
        try {
          await Deno.remove(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    catch: (error) => createStorageError(error, `code2prompt ${targetPath}`, 'Failed to execute code2prompt')
  })
}

/**
 * Get basic file statistics from target path
 */
export const getFileStats = (
  targetPath: string,
  stdout: string,
  stderr: string,
  processingTime: number
): Effect.Effect<IngestStats, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      // Parse file information from stdout (markdown format)
      const fileCount = (stdout.match(/^`[^`]+`:/gm) || []).length
      
      // Get directory size (approximation)
      let totalSize = 0
      try {
        const stat = await Deno.stat(targetPath)
        totalSize = stat.size
      } catch {
        // If it's a directory, size will be 0, which is fine
      }
      
      // Extract CLI version from stderr if available
      const versionMatch = stderr.match(/code2prompt\s+v?([\d.]+)/)
      const cliVersion = versionMatch ? versionMatch[1]! : 'unknown'
      
      return {
        fileCount,
        totalSize,
        processingTime,
        cliVersion,
        excludedFiles: [], // TODO: Parse from stderr if available
        includedFiles: []  // TODO: Parse from stdout if available
      } satisfies IngestStats
    },
    catch: (error) => createStorageError(error, targetPath, 'Failed to get file stats')
  })
}

/**
 * Check if target is a single file and handle directly without code2prompt
 */
const ingestSingleFile = (
  filePath: string,
  config: IngestConfig
): Effect.Effect<IngestResult, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      const content = await Deno.readTextFile(filePath)
      const stat = await Deno.stat(filePath)
      
      // Simple token estimation (rough approximation)
      const tokenCount = Math.ceil(content.length / 4) // Rough estimate: 4 chars per token
      
      // Create structured output similar to code2prompt
      const structuredContent = `Project Path: ${filePath}

Source Tree:

\`\`\`txt
${filePath}
\`\`\`

<files>
<file path="${filePath}">
\`\`\`typescript
${content}
\`\`\`
</file>
</files>`

      return {
        content: structuredContent,
        stats: {
          fileCount: 1,
          totalSize: content.length,
          processingTime: 0,
          cliVersion: 'direct-read',
          excludedFiles: [],
          includedFiles: [filePath]
        },
        tokenEstimate: {
          totalTokens: tokenCount,
          inputTokens: tokenCount,
          outputTokens: 0,
          tokenizer: config.tokenizer
        },
        metadata: {
          targetPath: filePath,
          absolutePath: await Deno.realPath(filePath),
          config,
          startTime: new Date(),
          endTime: new Date(),
          cliCommand: 'direct-file-read',
          modelTokenizer: config.tokenizer
        }
      } satisfies IngestResult
    },
    catch: (error) => createStorageError(error, 'single file ingest', `Failed to read single file ${filePath}`)
  })
}

/**
 * Main ingestion function using code2prompt CLI or direct file reading
 */
export const ingestPath = (
  targetPath: string,
  config: Partial<IngestConfig> = {},
  model: string = 'gemini-2.5-flash'
): Effect.Effect<IngestResult, VibeError> => {
  const startTime = new Date()
  
  return pipe(
    // Parse and validate configuration
    Effect.succeed(IngestConfigSchema.parse({
      ...config,
      tokenizer: config.tokenizer || mapModelToCode2promptTokenizer(model)
    })),
    
    // Check if target is a single file
    Effect.flatMap(parsedConfig =>
      Effect.tryPromise({
        try: async () => {
          const stat = await Deno.stat(targetPath)
          return { config: parsedConfig, isFile: stat.isFile }
        },
        catch: (error) => createStorageError(error, 'path check', `Failed to check path type for ${targetPath}`)
      })
    ),
    
    // Handle single files directly or use code2prompt for directories
    Effect.flatMap(({ config: parsedConfig, isFile }) => {
      if (isFile) {
        return ingestSingleFile(targetPath, parsedConfig)
      }
      
      // Use code2prompt for directories
      return pipe(
        // Build CLI command
        Effect.succeed({
          config: parsedConfig,
          command: buildCode2PromptCommand(targetPath, parsedConfig)
        }),
        
        // Execute code2prompt
        Effect.flatMap(({ config, command }) =>
          pipe(
            executeCode2Prompt(targetPath, config),
            Effect.map(result => ({ config, command, ...result }))
          )
        ),
        
        // Parse token count from token output
        Effect.flatMap(({ config, command, content, tokenOutput }) =>
          pipe(
            parseTokenCount(tokenOutput, config.tokenizer),
            Effect.map(tokenEstimate => ({ 
              config, 
              command, 
              content,
              tokenOutput,
              tokenEstimate
            }))
          )
        ),
        
        // Get file statistics
        Effect.flatMap(({ config, command, content, tokenOutput, tokenEstimate }) => {
      const endTime = new Date()
      const processingTime = endTime.getTime() - startTime.getTime()
      
      return pipe(
        getFileStats(targetPath, content, '', processingTime),
        Effect.map(stats => ({
          content,
          tokenEstimate,
          stats,
          metadata: {
            targetPath,
            absolutePath: Deno.cwd() + '/' + targetPath, // TODO: Use proper path resolution
            config,
            startTime,
            endTime,
            cliCommand: command,
            modelTokenizer: config.tokenizer
          } satisfies IngestMetadata
        }))
      )
    })
      )
    })
  )
}

/**
 * Single file JSON ingest without code2prompt
 */
const ingestSingleFileJSON = (
  filePath: string,
  config: IngestConfig
): Effect.Effect<IngestJSONResult, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      const content = await Deno.readTextFile(filePath)
      const tokenCount = Math.ceil(content.length / 4) // Rough estimate
      
      // Create structured content similar to code2prompt
      const structuredContent = `Project Path: ${filePath}

Source Tree:

\`\`\`txt
${filePath}
\`\`\`

<files>
<file path="${filePath}">
\`\`\`typescript
${content}
\`\`\`
</file>
</files>`
      
      // Create structured JSON output
      const jsonOutput: Code2PromptJSONOutput = {
        directory_name: filePath,
        files: [filePath],
        model_info: 'direct-file-read',
        prompt: structuredContent
      }
      
      return {
        directoryName: filePath,
        files: [filePath],
        content: structuredContent,
        tokenEstimate: {
          totalTokens: tokenCount,
          inputTokens: tokenCount,
          outputTokens: 0,
          tokenizer: config.tokenizer
        },
        stats: {
          fileCount: 1,
          totalSize: content.length,
          processingTime: 0,
          cliVersion: 'direct-read',
          excludedFiles: [],
          includedFiles: [filePath]
        },
        metadata: {
          targetPath: filePath,
          absolutePath: await Deno.realPath(filePath),
          config,
          startTime: new Date(),
          endTime: new Date(),
          cliCommand: 'direct-file-read-json',
          modelTokenizer: config.tokenizer
        }
      } satisfies IngestJSONResult
    },
    catch: (error) => createStorageError(error, 'single file JSON ingest', `Failed to read single file ${filePath}`)
  })
}

/**
 * JSON ingestion function using code2prompt CLI with structured output or direct file reading
 * Returns both the file list and complete content for LLM-first processing
 */
export const ingestPathJSON = (
  targetPath: string,
  config: Partial<IngestConfig> = {},
  model: string = 'gemini-2.5-flash'
): Effect.Effect<IngestJSONResult, VibeError> => {
  const startTime = new Date()
  
  return pipe(
    // Parse and validate configuration
    Effect.succeed(IngestConfigSchema.parse({
      ...config,
      tokenizer: config.tokenizer || mapModelToCode2promptTokenizer(model)
    })),
    
    // Check if target is a single file
    Effect.flatMap(parsedConfig =>
      Effect.tryPromise({
        try: async () => {
          const stat = await Deno.stat(targetPath)
          return { config: parsedConfig, isFile: stat.isFile }
        },
        catch: (error) => createStorageError(error, 'path check', `Failed to check path type for ${targetPath}`)
      })
    ),
    
    // Handle single files directly or use code2prompt for directories  
    Effect.flatMap(({ config: parsedConfig, isFile }) => {
      if (isFile) {
        return ingestSingleFileJSON(targetPath, parsedConfig)
      }
      
      // Use code2prompt for directories - convert to IngestJSONResult format
      return pipe(
        executeCode2PromptJSON(targetPath, parsedConfig),
        Effect.flatMap(({ jsonOutput, tokenOutput }) =>
          pipe(
            parseTokenCount(tokenOutput, parsedConfig.tokenizer),
            Effect.flatMap(tokenEstimate =>
              pipe(
                getFileStats(targetPath, jsonOutput.prompt, '', 0),
                Effect.map(stats => ({
                  directoryName: jsonOutput.directory_name,
                  files: jsonOutput.files,
                  content: jsonOutput.prompt,
                  tokenEstimate,
                  stats: {
                    ...stats,
                    fileCount: jsonOutput.files.length
                  },
                  metadata: {
                    targetPath,
                    absolutePath: Deno.cwd() + '/' + targetPath,
                    config: parsedConfig,
                    startTime: new Date(),
                    endTime: new Date(),
                    cliCommand: `code2prompt --output-format=json --encoding=${parsedConfig.tokenizer} ${targetPath}`,
                    modelTokenizer: parsedConfig.tokenizer
                  }
                } satisfies IngestJSONResult))
              )
            )
          )
        )
      )
    })
  )
}

/**
 * Pre-configured ingestion presets for common use cases
 */
export const defaultConfigs = {
  /** TypeScript/JavaScript projects */
  typescript: {
    include: ['*.ts', '*.tsx', '*.js', '*.jsx'],
    exclude: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/*.min.js'],
    outputFormat: 'markdown' as const,
    includeTokens: true,
    tokenizer: 'cl100k',
    fullDirectoryTree: true,
    noClipboard: true
  },
  
  /** Web development projects */
  web: {
    include: ['**/*.{ts,tsx,js,jsx,html,css,scss,sass,vue,svelte}'],
    exclude: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/*.min.*'],
    outputFormat: 'markdown' as const,
    includeTokens: true,
    tokenizer: 'cl100k',
    fullDirectoryTree: true,
    noClipboard: true
  },
  
  /** Documentation projects */
  docs: {
    include: ['**/*.{md,mdx,txt,rst}'],
    exclude: ['**/node_modules/**', '**/build/**'],
    outputFormat: 'markdown' as const,
    includeTokens: true,
    tokenizer: 'cl100k',
    fullDirectoryTree: true,
    noClipboard: true
  },
  
  /** Configuration files */
  config: {
    include: ['**/*.{json,yml,yaml,toml,ini,env}'],
    exclude: ['**/node_modules/**', '**/build/**'],
    outputFormat: 'markdown' as const,
    includeTokens: true,
    tokenizer: 'cl100k',
    fullDirectoryTree: true,
    noClipboard: true
  },
  
  /** Comprehensive analysis (all text files) */
  comprehensive: {
    include: ['**/*'],
    exclude: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/.git/**', '**/*.min.*'],
    outputFormat: 'markdown' as const,
    includeTokens: true,
    tokenizer: 'cl100k',
    fullDirectoryTree: true,
    noClipboard: true,
    includeHidden: false
  }
} satisfies Record<string, Partial<IngestConfig>>

/**
 * Convenience function for quick ingestion with default typescript config
 */
export const ingestTypescriptProject = (
  targetPath: string,
  model: string = 'gemini-2.5-flash'
): Effect.Effect<IngestResult, VibeError> => {
  return ingestPath(targetPath, defaultConfigs.typescript, model)
}

/**
 * Convenience function for comprehensive codebase analysis
 */
export const ingestComprehensive = (
  targetPath: string,
  model: string = 'gemini-2.5-flash'
): Effect.Effect<IngestResult, VibeError> => {
  return ingestPath(targetPath, defaultConfigs.comprehensive, model)
}

/**
 * Debug main function for testing ingest in isolation
 * Usage: deno run --allow-all src/ingest.ts src/
 */
async function debugMain() {
  const args = Deno.args
  if (args.length === 0) {
    console.error('Usage: deno run --allow-all src/ingest.ts <path> [--json]')
    console.error('Examples:')
    console.error('  deno run --allow-all src/ingest.ts src/')
    console.error('  deno run --allow-all src/ingest.ts src/ --json')
    Deno.exit(1)
  }
  
  const targetPath = args[0]!
  const useJSON = args.includes('--json')
  
  console.log(`🔍 Debug Ingest Test for: ${targetPath}`)
  console.log(`📋 Mode: ${useJSON ? 'JSON' : 'Markdown'}`)
  console.log(`📋 Using config:`, JSON.stringify(defaultConfigs.typescript, null, 2))
  
  try {
    if (useJSON) {
      console.log('\n⚡ Running ingestPathJSON...')
      const effect = ingestPathJSON(targetPath, defaultConfigs.typescript)
      const result = await Effect.runPromise(effect)
      
      console.log('\n✅ SUCCESS! JSON Ingest Result:')
      console.log('📊 Stats:', JSON.stringify(result.stats, null, 2))
      console.log('🎯 Token Estimate:', JSON.stringify(result.tokenEstimate, null, 2))
      console.log('🔧 Metadata:', JSON.stringify(result.metadata, null, 2))
      
      console.log('\n📁 File Structure:')
      console.log(`📂 Directory: ${result.directoryName}`)
      console.log(`📋 Files (${result.files.length}):`)
      result.files.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`)
      })
      
      console.log('\n📄 Content Preview (first 500 chars):')
      console.log('=' + '='.repeat(50))
      console.log(result.content.slice(0, 500))
      if (result.content.length > 500) {
        console.log(`\n... (truncated, total length: ${result.content.length} chars)`)
      }
      console.log('=' + '='.repeat(50))
      
      console.log('\n📈 Summary:')
      console.log(`- Files found: ${result.stats.fileCount}`)
      console.log(`- Total size: ${result.stats.totalSize} bytes`)
      console.log(`- Total tokens: ${result.tokenEstimate.totalTokens}`)
      console.log(`- Processing time: ${result.stats.processingTime}ms`)
      console.log(`- CLI version: ${result.stats.cliVersion}`)
      
    } else {
      console.log('\n⚡ Running ingestPath...')
      const effect = ingestPath(targetPath, defaultConfigs.typescript)
      const result = await Effect.runPromise(effect)
      
      console.log('\n✅ SUCCESS! Ingest Result:')
      console.log('📊 Stats:', JSON.stringify(result.stats, null, 2))
      console.log('🎯 Token Estimate:', JSON.stringify(result.tokenEstimate, null, 2))
      console.log('🔧 Metadata:', JSON.stringify(result.metadata, null, 2))
      
      console.log('\n📄 Content Preview (first 500 chars):')
      console.log('=' + '='.repeat(50))
      console.log(result.content.slice(0, 500))
      if (result.content.length > 500) {
        console.log(`\n... (truncated, total length: ${result.content.length} chars)`)
      }
      console.log('=' + '='.repeat(50))
      
      console.log('\n📈 Summary:')
      console.log(`- Files found: ${result.stats.fileCount}`)
      console.log(`- Total size: ${result.stats.totalSize} bytes`)
      console.log(`- Total tokens: ${result.tokenEstimate.totalTokens}`)
      console.log(`- Processing time: ${result.stats.processingTime}ms`)
      console.log(`- CLI version: ${result.stats.cliVersion}`)
      
      console.log('\n📋 FULL CONTENT (what goes to LLM pipeline):')
      console.log('=' + '='.repeat(80))
      console.log(result.content)
      console.log('=' + '='.repeat(80))
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error)
    console.error('\nError details:', error instanceof Error ? error.stack : error)
    Deno.exit(1)
  }
}

// Run debug main if this file is executed directly
if (import.meta.main) {
  await debugMain()
}