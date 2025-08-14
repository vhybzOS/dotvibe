/**
 * AST System Types & Interfaces
 *
 * Core data types and interfaces for AST parsing, relationship discovery, and data flow analysis.
 *
 * @tested_by tests/core/ast-types.test.ts
 */

import type { Parser, Language } from 'web-tree-sitter'

// =============================================================================
// PARSER TYPES
// =============================================================================

/**
 * Parser cache entry
 */
export interface ParserCacheEntry {
  parser: Parser
  language: Language
  lastUsed: number
}

/**
 * Language configuration
 */
export interface LanguageConfig {
  name: string
  extensions: string[]
  wasmFile: string
  queries: {
    symbols: string
    imports: string
    exports: string
    comments: string
    dataflow: string
  }
}

// =============================================================================
// CORE DATA TYPES
// =============================================================================

/**
 * Core data types from data_specs.md
 */
export type ElementType = 
  | 'function' 
  | 'class' 
  | 'interface' 
  | 'variable' 
  | 'import' 
  | 'export' 
  | 'method' 
  | 'field' 
  | 'type' 
  | 'enum' 
  | 'expression' 
  | 'property' 
  | 'call' 
  | 'assignment' 
  | 'conditional' 
  | 'literal' 
  | 'statement'

export type RelationshipType = 
  | 'calls' 
  | 'imports' 
  | 'extends' 
  | 'implements' 
  | 'contains' 
  | 'exports' 
  | 'uses'

export type DataFlowType = 
  | 'parameter_input' 
  | 'return_output' 
  | 'argument_passing' 
  | 'assignment' 
  | 'property_access' 
  | 'transformation' 
  | 'side_effect'

/**
 * Data flow query pattern indices (matches order in LANGUAGE_CONFIGS.typescript.queries.dataflow)
 */
export enum DataFlowPattern {
  VARIABLE_ASSIGNMENT = 0,
  PROPERTY_ACCESS = 1, 
  ASSIGNMENT = 2,
  CALL = 3,
  RETURN = 4
}

// =============================================================================
// SYMBOL & ELEMENT INTERFACES
// =============================================================================

/**
 * Symbol information extracted from AST
 */
export interface SymbolInfo {
  name: string
  kind: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  visibility?: string
  exported?: boolean
  async?: boolean
  parameters?: string[]
  returnType?: string
  inheritance?: string[]
}

/**
 * Code element data structure (from data_specs.md)
 */
export interface CodeElementData {
  id?: string // Storage-compatible element ID
  file_path: string
  element_name: string
  element_type: ElementType
  start_line: number
  end_line: number
  start_column?: number
  end_column?: number
  content: string
  description?: string
  search_phrases?: string[]
  metadata?: Record<string, any>
  visibility?: 'public' | 'private' | 'protected'
  exported?: boolean
  async?: boolean
  parameters?: string[]
  return_type?: string
}

// =============================================================================
// RELATIONSHIP INTERFACES
// =============================================================================

/**
 * Relationship data structure (from data_specs.md)
 */
export interface RelationshipData {
  from: string
  to: string
  relationship_type: RelationshipType
  context?: Record<string, any>
  semantic_description?: string
  architectural_purpose?: string
  complexity_score?: number
}

/**
 * Data flow relationship data structure (from data_specs.md)
 */
export interface DataFlowRelationshipData {
  from: string
  to: string
  flow_type: DataFlowType
  type_annotation?: string
  flow_metadata?: Record<string, any>
  data_transformation_description?: string
  business_logic_purpose?: string
  side_effects?: string[]
}

/**
 * Relationship discovery result
 */
export interface Relationship {
  from: string
  to: string
  type: RelationshipType
  context: Record<string, any>
  line_number: number
  confidence: number
}

/**
 * Data flow relationship result
 */
export interface DataFlowRelationship {
  from: string
  to: string
  flow_type: DataFlowType
  type_annotation?: string
  context: Record<string, any>
  line_number: number
}

// =============================================================================
// PARSE RESULT INTERFACES
// =============================================================================

/**
 * Parse result (intermediate structure)
 */
export interface ParseResult {
  elements: CodeElementData[]
  tree: any
  content: string
  filePath: string
}

/**
 * Enhanced parse result with relationship information
 */
export interface FileParseResult {
  filePath: string
  elements: CodeElementData[]
  relationships: RelationshipData[]
  dataFlows: DataFlowRelationshipData[]
  processingTime: number
  errors: string[]
}