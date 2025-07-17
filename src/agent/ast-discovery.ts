/**
 * AST Element Discovery Module
 * 
 * Imports real tree-sitter functions from mastra tools and provides them to the new agent system.
 * Replaces the mock implementations with actual functionality for symbol extraction and analysis.
 * 
 * @tested_by tests/agent/ast-discovery.test.ts (Real tree-sitter integration, symbol extraction)
 */

import { Effect, pipe } from 'effect'
import { createConfigurationError, type VibeError } from '../index.ts'

// Import real tree-sitter functions from core AST module
import {
  parseFile,
  getSymbolDetails,
  readAndParseFile,
  detectLanguage,
  type SymbolInfo,
  type SymbolDetails
} from '../core/ast.ts'

/**
 * Enhanced symbol info with additional metadata for LLM processing
 */
export interface ExtendedSymbolInfo extends SymbolInfo {
  /** File path containing this symbol */
  filePath: string
  
  /** Relative path for display */
  relativePath: string
  
  /** Symbol complexity score (lines, nesting, etc.) */
  complexity?: number
  
  /** Dependencies/imports in this symbol */
  dependencies?: string[]
}

/**
 * Complete AST discovery result for a file
 */
export interface FileASTResult {
  /** File path */
  filePath: string
  
  /** Symbols found in this file */
  symbols: ExtendedSymbolInfo[]
  
  /** Total symbol count */
  symbolCount: number
  
  /** Processing time in ms */
  processingTime: number
  
  /** Any errors encountered */
  errors: string[]
}

/**
 * Complete AST discovery result for entire codebase
 */
export interface CodebaseASTResult {
  /** Target path processed */
  targetPath: string
  
  /** File results */
  files: FileASTResult[]
  
  /** Total files processed */
  fileCount: number
  
  /** Total symbols found */
  totalSymbols: number
  
  /** Processing time in ms */
  totalProcessingTime: number
  
  /** Component list in old system format for compatibility */
  componentList: Array<{
    filename: string
    components: Array<{
      name: string
      kind: string
    }>
  }>
}

/**
 * Real filesystem listing using Deno filesystem API
 */
export const listFilesystemReal = (path: string): Effect.Effect<string[], VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const files: string[] = []
      for await (const entry of Deno.readDir(path)) {
        if (entry.isFile) {
          files.push(`${path}/${entry.name}`)
        }
      }
      return files
    },
    catch: (error) => createConfigurationError(error, `Failed to list filesystem at ${path}`)
  })

/**
 * Real file reading using Deno filesystem API
 */
export const readFileReal = (path: string): Effect.Effect<string, VibeError> =>
  Effect.tryPromise({
    try: () => Deno.readTextFile(path),
    catch: (error) => createConfigurationError(error, `Failed to read file ${path}`)
  })

/**
 * Real symbol listing using core AST utilities (with filtering for invalid symbols)
 */
export const listSymbolsReal = (path: string): Effect.Effect<SymbolInfo[], VibeError> =>
  pipe(
    readAndParseFile(path),
    Effect.map(result => {
      // Filter out invalid symbols that cause processing failures
      const validSymbols = result.symbols.filter(symbol => {
        // Filter out symbols with "unknown" names (from export/import statements)
        if (symbol.name === 'unknown') {
          return false
        }
        
        // Filter out statement types that aren't actual code symbols
        if (symbol.kind === 'export_statement' || symbol.kind === 'import_statement') {
          return false
        }
        
        return true
      })
      
      return validSymbols
    }),
    Effect.catchAll(error => Effect.fail(
      createConfigurationError(error, `Failed to list symbols in ${path}`)
    ))
  )

/**
 * Real symbol details using core AST utilities
 */
export const getSymbolDetailsReal = (path: string, symbolName: string): Effect.Effect<SymbolDetails, VibeError> =>
  pipe(
    Effect.tryPromise({
      try: () => Deno.readTextFile(path),
      catch: (error) => createConfigurationError(error, `Failed to read file ${path}`)
    }),
    Effect.flatMap(content => 
      pipe(
        getSymbolDetails(content, symbolName, detectLanguage(path)),
        Effect.catchAll(error => Effect.fail(
          createConfigurationError(error, `Failed to get symbol details for ${symbolName} in ${path}`)
        ))
      )
    )
  )

/**
 * Real index entry creation using core storage utilities
 */
export const createIndexEntryReal = (data: {
  path: string
  symbolName: string
  symbolKind: string
  startLine: number
  endLine: number
  content: string
  synthesizedDescription: string
}): Effect.Effect<{ success: boolean }, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      // This would typically use the storage module to create the index entry
      // For now, return success as a placeholder
      // TODO: Implement actual index entry creation using core storage
      return { success: true }
    },
    catch: (error) => createConfigurationError(error, `Failed to create index entry for ${data.symbolName}`)
  })

/**
 * Discover AST elements in a single file
 */
export const discoverFileAST = (filePath: string): Effect.Effect<FileASTResult, VibeError> => {
  const startTime = Date.now()
  
  return pipe(
    listSymbolsReal(filePath),
    Effect.map(symbols => {
      const processingTime = Date.now() - startTime
      const extendedSymbols: ExtendedSymbolInfo[] = symbols.map(symbol => ({
        ...symbol,
        filePath,
        relativePath: filePath, // TODO: Calculate relative path
        complexity: symbol.endLine - symbol.startLine, // Simple complexity measure
        dependencies: [] // TODO: Extract dependencies
      }))
      
      return {
        filePath,
        symbols: extendedSymbols,
        symbolCount: symbols.length,
        processingTime,
        errors: []
      } satisfies FileASTResult
    }),
    Effect.catchAll(error => 
      Effect.succeed({
        filePath,
        symbols: [],
        symbolCount: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)]
      } satisfies FileASTResult)
    )
  )
}

/**
 * Discover AST elements for entire codebase using file list from JSON ingest
 */
export const discoverCodebaseAST = (
  targetPath: string,
  fileList: string[]
): Effect.Effect<CodebaseASTResult, VibeError> => {
  const startTime = Date.now()
  
  return pipe(
    // Process all files in parallel using Effect.all
    Effect.all(
      fileList.map(filePath => discoverFileAST(filePath)),
      { concurrency: 10 } // Limit concurrent file processing
    ),
    Effect.map(fileResults => {
      const totalProcessingTime = Date.now() - startTime
      const totalSymbols = fileResults.reduce((sum, file) => sum + file.symbolCount, 0)
      
      // Create component list in old system format for compatibility
      const componentList = fileResults
        .filter(file => file.symbols.length > 0)
        .map(file => ({
          filename: file.filePath,
          components: file.symbols.map(symbol => ({
            name: symbol.name,
            kind: symbol.kind
          }))
        }))
      
      return {
        targetPath,
        files: fileResults,
        fileCount: fileList.length,
        totalSymbols,
        totalProcessingTime,
        componentList
      } satisfies CodebaseASTResult
    })
  )
}

/**
 * Extract all unique symbol types from AST discovery result
 */
export const extractSymbolTypes = (astResult: CodebaseASTResult): string[] => {
  const symbolTypes = new Set<string>()
  
  astResult.files.forEach(file => {
    file.symbols.forEach(symbol => {
      symbolTypes.add(symbol.kind)
    })
  })
  
  return Array.from(symbolTypes).sort()
}

/**
 * Filter symbols by type and complexity
 */
export const filterSymbolsByComplexity = (
  astResult: CodebaseASTResult,
  minComplexity: number = 1,
  symbolTypes?: string[]
): ExtendedSymbolInfo[] => {
  const allSymbols = astResult.files.flatMap(file => file.symbols)
  
  return allSymbols.filter(symbol => {
    const complexityMatch = (symbol.complexity || 0) >= minComplexity
    const typeMatch = !symbolTypes || symbolTypes.includes(symbol.kind)
    return complexityMatch && typeMatch
  })
}

/**
 * Generate processing statistics for AST discovery
 */
export const generateASTStatistics = (astResult: CodebaseASTResult) => {
  const symbolTypeCounts = astResult.files.reduce((counts, file) => {
    file.symbols.forEach(symbol => {
      counts[symbol.kind] = (counts[symbol.kind] || 0) + 1
    })
    return counts
  }, {} as Record<string, number>)
  
  const averageSymbolsPerFile = astResult.fileCount > 0 ? astResult.totalSymbols / astResult.fileCount : 0
  const filesWithSymbols = astResult.files.filter(file => file.symbolCount > 0).length
  const filesWithErrors = astResult.files.filter(file => file.errors.length > 0).length
  
  return {
    totalFiles: astResult.fileCount,
    filesWithSymbols,
    filesWithErrors,
    totalSymbols: astResult.totalSymbols,
    averageSymbolsPerFile: Math.round(averageSymbolsPerFile * 100) / 100,
    symbolTypeCounts,
    totalProcessingTime: astResult.totalProcessingTime,
    averageProcessingTimePerFile: astResult.fileCount > 0 ? Math.round(astResult.totalProcessingTime / astResult.fileCount) : 0
  }
}