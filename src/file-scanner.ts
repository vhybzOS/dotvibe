/**
 * File Scanner for Code Pattern Detection
 * 
 * @tested_by tests/file-scanner.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { join, extname, relative } from '@std/path'
import { createStorageError, type VibeError } from './index.ts'

// Scanner configuration schemas
export const ScanOptionsSchema = z.object({
  extensions: z.array(z.string()).optional(),
  includeMarkdown: z.boolean().default(false),
  maxDepth: z.number().int().min(1).default(10),
  maxFileSize: z.number().int().default(1024 * 1024), // 1MB default
  ignorePatterns: z.array(z.string()).optional()
})

export const ScannedFileSchema = z.object({
  path: z.string(),
  content: z.string().nullable(),
  size: z.number(),
  language: z.string(),
  modifiedAt: z.string(),
  isBinary: z.boolean().default(false)
})

export type ScanOptions = z.infer<typeof ScanOptionsSchema>
export type ScannedFile = z.infer<typeof ScannedFileSchema>

// Default code file extensions
const DEFAULT_CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',  // TypeScript/JavaScript
  '.py', '.pyx',                 // Python
  '.rs',                         // Rust
  '.go',                         // Go
  '.java', '.kt',                // Java/Kotlin
  '.cpp', '.cc', '.cxx', '.c',   // C/C++
  '.h', '.hpp', '.hxx',          // Headers
  '.cs',                         // C#
  '.php',                        // PHP
  '.rb',                         // Ruby
  '.swift',                      // Swift
  '.scala',                      // Scala
  '.clj', '.cljs',              // Clojure
  '.elm',                        // Elm
  '.ex', '.exs',                // Elixir
  '.fs', '.fsx',                // F#
  '.hs',                         // Haskell
  '.ml', '.mli',                // OCaml
  '.pas',                        // Pascal
  '.pl', '.pm',                 // Perl
  '.r', '.R',                   // R
  '.sh', '.bash', '.zsh',       // Shell scripts
  '.sql',                       // SQL
  '.vim',                       // Vim script
  '.lua'                        // Lua
]

// Default ignore patterns
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  '.svn/',
  '.hg/',
  'build/',
  'dist/',
  'target/',
  'out/',
  'bin/',
  'obj/',
  '.next/',
  '.nuxt/',
  'coverage/',
  '.nyc_output/',
  '.vscode/',
  '.idea/',
  '*.log',
  '*.tmp',
  '*.temp',
  '.DS_Store',
  'Thumbs.db',
  '*.pyc',
  '__pycache__/',
  '.pytest_cache/',
  '.cache/',
  '.vibe/' // Don't scan our own workspace
]

/**
 * Check if file is a code file based on extension
 */
export const isCodeFile = (filePath: string): boolean => {
  const ext = extname(filePath).toLowerCase()
  return DEFAULT_CODE_EXTENSIONS.includes(ext)
}

/**
 * Check if file should be ignored based on patterns
 */
export const shouldIgnoreFile = (filePath: string, customPatterns: string[] = []): boolean => {
  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...customPatterns]
  
  return allPatterns.some(pattern => {
    if (pattern.endsWith('/')) {
      // Directory pattern
      return filePath.includes(pattern) || filePath.startsWith(pattern.slice(0, -1))
    } else if (pattern.includes('*')) {
      // Glob pattern (simple implementation)
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      return regex.test(filePath)
    } else {
      // Exact match or substring
      return filePath.includes(pattern)
    }
  })
}

/**
 * Detect if file is binary by checking for null bytes or non-text content
 */
const isBinaryFile = (content: Uint8Array): boolean => {
  // Check first 1KB for null bytes or high ratio of non-printable characters
  const sampleSize = Math.min(1024, content.length)
  let nonPrintable = 0
  
  for (let i = 0; i < sampleSize; i++) {
    const byte = content[i]!
    if (byte === 0) {
      return true // Null byte = binary
    }
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintable++
    }
  }
  
  // If more than 30% non-printable, consider binary
  return (nonPrintable / sampleSize) > 0.3
}

/**
 * Determine programming language from file extension
 */
const getLanguageFromExtension = (filePath: string): string => {
  const ext = extname(filePath).toLowerCase()
  
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.scala': 'scala',
    '.clj': 'clojure',
    '.elm': 'elm',
    '.ex': 'elixir',
    '.fs': 'fsharp',
    '.hs': 'haskell',
    '.ml': 'ocaml',
    '.pas': 'pascal',
    '.pl': 'perl',
    '.r': 'r',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.sql': 'sql',
    '.vim': 'vimscript',
    '.lua': 'lua',
    '.md': 'markdown'
  }
  
  return languageMap[ext] || 'unknown'
}

/**
 * Read and process a single file
 */
const processFile = (filePath: string, options: ScanOptions): Effect.Effect<ScannedFile, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const stats = await Deno.stat(filePath)
      
      // Check file size limit
      if (stats.size > options.maxFileSize) {
        return {
          path: filePath,
          content: null,
          size: stats.size,
          language: getLanguageFromExtension(filePath),
          modifiedAt: stats.mtime?.toISOString() || new Date().toISOString(),
          isBinary: false
        }
      }
      
      // Read file content
      const contentBytes = await Deno.readFile(filePath)
      
      // Check if binary
      if (isBinaryFile(contentBytes)) {
        return {
          path: filePath,
          content: null,
          size: stats.size,
          language: getLanguageFromExtension(filePath),
          modifiedAt: stats.mtime?.toISOString() || new Date().toISOString(),
          isBinary: true
        }
      }
      
      // Convert to text
      const content = new TextDecoder().decode(contentBytes)
      
      return {
        path: filePath,
        content,
        size: stats.size,
        language: getLanguageFromExtension(filePath),
        modifiedAt: stats.mtime?.toISOString() || new Date().toISOString(),
        isBinary: false
      }
    },
    catch: (error) => createStorageError(error, filePath, 'Failed to process file')
  })

/**
 * Recursively scan directory for files
 */
const scanDirectory = (
  dirPath: string,
  options: ScanOptions,
  currentDepth: number = 0
): Effect.Effect<string[], VibeError> =>
  Effect.tryPromise({
    try: async () => {
      if (currentDepth >= options.maxDepth) {
        return []
      }
      
      const entries = []
      
      try {
        for await (const entry of Deno.readDir(dirPath)) {
          const fullPath = join(dirPath, entry.name)
          const relativePath = relative('.', fullPath)
          
          // Skip ignored files/directories
          if (shouldIgnoreFile(relativePath, options.ignorePatterns)) {
            continue
          }
          
          if (entry.isDirectory) {
            // Recursively scan subdirectory
            const subFiles = await Effect.runPromise(
              scanDirectory(fullPath, options, currentDepth + 1)
            )
            entries.push(...subFiles)
          } else if (entry.isFile) {
            // Check if file should be included
            const ext = extname(entry.name).toLowerCase()
            
            if (options.extensions) {
              // Use specified extensions
              if (options.extensions.includes(ext)) {
                entries.push(fullPath)
              }
            } else {
              // Use default code file detection
              if (isCodeFile(entry.name) || (options.includeMarkdown && ext === '.md')) {
                entries.push(fullPath)
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Deno.errors.PermissionDenied) {
          // Skip directories we can't read
          console.warn(`Permission denied: ${dirPath}`)
          return []
        }
        throw error
      }
      
      return entries
    },
    catch: (error) => createStorageError(error, dirPath, 'Failed to scan directory')
  })

/**
 * Main file scanning function
 */
export const scanFiles = (
  targetPath: string,
  options: Partial<ScanOptions> = {}
): Effect.Effect<ScannedFile[], VibeError> => {
  const scanOptions = ScanOptionsSchema.parse(options)
  
  return pipe(
    Effect.tryPromise({
      try: () => Deno.stat(targetPath),
      catch: (error) => createStorageError(error, targetPath, 'Target path does not exist')
    }),
    Effect.flatMap(stats => {
      if (stats.isFile) {
        // Single file
        return pipe(
          processFile(targetPath, scanOptions),
          Effect.map(file => [file])
        )
      } else if (stats.isDirectory) {
        // Directory - scan recursively
        return pipe(
          scanDirectory(targetPath, scanOptions),
          Effect.flatMap(filePaths =>
            Effect.all(filePaths.map(filePath => processFile(filePath, scanOptions)))
          )
        )
      } else {
        return Effect.fail(createStorageError(
          new Error('Target is neither file nor directory'),
          targetPath
        ))
      }
    })
  )
}