/**
 * AST System Index
 *
 * Main entry point for the AST system with clean, organized exports.
 *
 * @tested_by tests/core/ast-index.test.ts
 */

import { Effect } from 'effect'
import { detectLanguage } from './utils.ts'
import type {
  FileParseResult,
  ParseResult,
  CodeElementData,
  RelationshipData,
  DataFlowRelationshipData,
  ElementType,
  RelationshipType,
  DataFlowType,
  SymbolInfo,
  LanguageConfig,
  ParserCacheEntry,
  DataFlowPattern,
  Relationship,
  DataFlowRelationship
} from './types.ts'

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type {
  // Core data types
  ElementType,
  RelationshipType,
  DataFlowType,
  DataFlowPattern,
  
  // Symbol and element interfaces
  SymbolInfo,
  CodeElementData,
  
  // Relationship interfaces
  RelationshipData,
  DataFlowRelationshipData,
  Relationship,
  DataFlowRelationship,
  
  // Parse result interfaces
  ParseResult,
  FileParseResult,
  
  // Parser types
  LanguageConfig,
  ParserCacheEntry
}

// =============================================================================
// CORE OPERATIONS
// =============================================================================

export {
  // Parser management
  initializeParser,
  getParser,
  withTreeSitterParser,
  
  // Main parsing functions
  parseFileWithRelationships,
  discoverRelationships,
  analyzeDataFlow
} from './core.ts'

// =============================================================================
// UTILITIES
// =============================================================================

export {
  // Parser cache and configs
  parserCache,
  LANGUAGE_CONFIGS,
  
  // Path resolution
  resolveWasmPath,
  
  // Language detection
  detectLanguage,
  
  // Element extraction utilities
  shouldExtractElement,
  mapNodeTypeToElementType,
  
  // Name extraction utilities
  extractNameFromChildren,
  extractModuleName,
  extractImportNames,
  
  // ID generation utilities
  generateStorageElementId,
  resolveImportPath,
  generateRelationshipId,
  
  // Search phrase generation
  generateSearchPhrases,
  
  // Element property extraction
  extractVisibility,
  isExported,
  isAsync,
  extractParameters,
  extractReturnType
} from './utils.ts'

// =============================================================================
// CONVENIENCE CLASS
// =============================================================================

/**
 * Simple AST interface for common operations
 */
export class AST {
  constructor() {}
  
  // Main parsing operations
  async parseFileWithRelationships(
    content: string, 
    language: string = 'typescript', 
    filePath: string = 'unknown'
  ): Promise<FileParseResult> {
    const { parseFileWithRelationships } = await import('./core.ts')
    return Effect.runPromise(parseFileWithRelationships(content, language, filePath))
  }
  
  // Helper to create ParseResult for other operations
  async parseToResult(
    content: string, 
    language: string = 'typescript', 
    filePath: string = 'unknown'
  ): Promise<ParseResult> {
    // For now, we'll use the full parsing and extract the parse result
    const fullResult = await this.parseFileWithRelationships(content, language, filePath)
    
    // Reconstruct the intermediate parse result
    const { withTreeSitterParser } = await import('./core.ts')
    const absolutePath = filePath.startsWith('/') ? filePath : `${Deno.cwd()}/${filePath}`
    
    return Effect.runPromise(
      withTreeSitterParser(language, async (parser) => {
        const tree = parser.parse(content)
        if (!tree) {
          throw new Error('Failed to parse content - tree is null')
        }
        
        return {
          elements: fullResult.elements,
          tree,
          content,
          filePath: absolutePath
        } satisfies ParseResult
      })
    )
  }
  
  // Relationship discovery
  async discoverRelationships(parseResult: ParseResult): Promise<RelationshipData[]> {
    const { discoverRelationships } = await import('./core.ts')
    return Effect.runPromise(discoverRelationships(parseResult))
  }
  
  // Data flow analysis
  async analyzeDataFlow(parseResult: ParseResult): Promise<DataFlowRelationshipData[]> {
    const { analyzeDataFlow } = await import('./core.ts')
    return Effect.runPromise(analyzeDataFlow(parseResult))
  }
  
  // Language detection
  detectLanguage(filePath: string): string {
    // Import synchronously from utils
    return detectLanguage(filePath)
  }
  
  // WASM path resolution
  async resolveWasmPath(language: string): Promise<string> {
    const { resolveWasmPath } = await import('./utils.ts')
    return resolveWasmPath(language)
  }
}