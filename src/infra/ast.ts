/**
 * Enhanced AST Analyzer - Relationship Discovery & Data Flow Analysis
 * 
 * Unified TypeScript/JavaScript parser for relationship discovery and data flow analysis.
 * Uses TypeScript parser for both .ts/.tsx and .js/.jsx files since TypeScript is a 
 * superset of JavaScript.
 * 
 * @tests tests/core/ast-analyzer.test.ts (AST parsing, relationships, data flow)
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { Parser } from 'web-tree-sitter'
import { createTreeSitterError, createProcessingError, type VibeError } from './errors.ts'
import { logSystem } from './logger.ts'
import { Language } from 'web-tree-sitter'

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
  }
}

/**
 * Parser cache entry
 */
interface ParserCacheEntry {
  parser: Parser
  language: Language
  lastUsed: number
}

/**
 * Global parser cache
 */
const parserCache = new Map<string, ParserCacheEntry>()

/**
 * Language configuration
 * Unified TypeScript parser handles both JavaScript and TypeScript files
 */
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    name: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    wasmFile: 'tree-sitter-typescript.wasm',
    queries: {
      symbols: `
        (function_declaration name: (identifier) @name) @function
        (method_definition name: (property_identifier) @name) @method
        (class_declaration name: (type_identifier) @name) @class
        (interface_declaration name: (type_identifier) @name) @interface
        (type_alias_declaration name: (type_identifier) @name) @type
        (enum_declaration name: (identifier) @name) @enum
        (variable_declaration (variable_declarator name: (identifier) @name)) @variable
        (lexical_declaration (variable_declarator name: (identifier) @name)) @variable
      `,
      imports: `
        (import_statement source: (string) @source) @import
        (import_statement (import_clause (identifier) @default)) @import
        (import_statement (import_clause (named_imports (import_specifier name: (identifier) @name)))) @import
      `,
      exports: `
        (export_statement (function_declaration name: (identifier) @name)) @export
        (export_statement (class_declaration name: (type_identifier) @name)) @export
        (export_statement (interface_declaration name: (type_identifier) @name)) @export
        (export_statement (variable_declaration (variable_declarator name: (identifier) @name))) @export
      `,
      comments: `
        (comment) @comment
      `
    }
  }
}

/**
 * Resolve WASM path for a language dynamically
 * Detects compiled executable vs development mode
 */
export const resolveWasmPath = async (language: string): Promise<string> => {
  const config = LANGUAGE_CONFIGS[language]
  if (!config) {
    throw new Error(`Unsupported language: ${language}`)
  }
  
  // Check if running from compiled executable
  const isCompiled = !import.meta.url.startsWith('file:///')
  
  if (isCompiled) {
    // Compiled executable: use WASM files from data/ directory
    // Try relative to current working directory first (installed alongside executable)
    try {
      const dataPath = `./data/${config.wasmFile}`
      await Deno.stat(dataPath)
      return dataPath
    } catch {
      // Fallback: relative to executable directory
      try {
        const executableDir = new URL('.', import.meta.url).pathname
        const dataPath = `${executableDir}../data/${config.wasmFile}`
        await Deno.stat(dataPath)
        return dataPath
      } catch (error) {
        throw new Error(`Failed to find WASM file in data/ directory for ${language}. ` +
                       `Make sure the installer has downloaded the required files: ${error}`)
      }
    }
  }
  
  // Development mode: use npm cache (existing logic)
  const cacheBase = `${Deno.env.get('HOME')}/.cache/deno/npm/registry.npmjs.org`
  const packageName = `tree-sitter-${language}`
  
  try {
    const packageDir = `${cacheBase}/${packageName}`
    const entries = []
    for await (const entry of Deno.readDir(packageDir)) {
      if (entry.isDirectory && /^\d+\.\d+\.\d+/.test(entry.name)) {
        entries.push(entry.name)
      }
    }
    
    const latestVersion = entries.sort((a, b) => {
      const versionA = a.split('.').map(n => parseInt(n, 10))
      const versionB = b.split('.').map(n => parseInt(n, 10))
      
      for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
        const a = versionA[i] || 0
        const b = versionB[i] || 0
        if (a !== b) return b - a
      }
      return 0
    })[0]
    
    if (!latestVersion) {
      throw new Error(`No version found for ${packageName}`)
    }
    
    const wasmPath = `${packageDir}/${latestVersion}/${config.wasmFile}`
    await Deno.stat(wasmPath)
    return wasmPath
  } catch (error) {
    throw new Error(`Failed to resolve WASM path for ${language}: ${error}`)
  }
}

/**
 * Initialize parser for a language
 */
export const initializeParser = async (language: string): Promise<Parser> => {
  const cacheKey = language
  
  const cached = parserCache.get(cacheKey)
  if (cached) {
    cached.lastUsed = Date.now()
    return cached.parser
  }
  
  try {
    await Parser.init()
    const parser = new Parser()
    const wasmPath = await resolveWasmPath(language)
    const wasmBytes = await Deno.readFile(wasmPath)
    const lang = await Language.load(wasmBytes)
    parser.setLanguage(lang)
    
    parserCache.set(cacheKey, {
      parser,
      language: lang,
      lastUsed: Date.now()
    })
    
    return parser
  } catch (error) {
    throw createTreeSitterError(
      error,
      'initialization',
      `Failed to initialize parser for ${language}`,
      language
    )
  }
}

/**
 * Get parser for language (cached)
 */
export const getParser = (language: string): Effect.Effect<Parser, VibeError> => {
  return Effect.tryPromise({
    try: () => initializeParser(language),
    catch: (error) => error as VibeError
  })
}

/**
 * Detect language from file extension
 * All JavaScript and TypeScript files use the unified TypeScript parser
 */
export const detectLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase()
  
  // All JS/TS files use TypeScript parser (which handles both)
  if (ext && ['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    return 'typescript'
  }
  
  // Default fallback for any other files
  return 'typescript'
}

/**
 * Core data types from data_specs.md
 */
export type ElementType = 'function' | 'class' | 'interface' | 'variable' | 'import' | 'export' | 'method' | 'field' | 'type' | 'enum' | 'expression' | 'property' | 'call' | 'assignment' | 'conditional' | 'literal' | 'statement'
export type RelationshipType = 'calls' | 'imports' | 'extends' | 'implements' | 'contains' | 'exports' | 'uses'
export type DataFlowType = 'parameter_input' | 'return_output' | 'argument_passing' | 'assignment' | 'property_access' | 'transformation' | 'side_effect'

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
 * Higher-order function for parser operations
 */
export const withTreeSitterParser = <T>(
  language: string,
  processor: (parser: Parser) => Promise<T>
): Effect.Effect<T, VibeError> => {
  return pipe(
    getParser(language),
    Effect.flatMap(parser =>
      Effect.tryPromise({
        try: () => processor(parser),
        catch: (error) => createTreeSitterError(
          error,
          'parsing',
          `Parser operation failed for ${language}`,
          language
        )
      })
    )
  )
}

/**
 * Enhanced parsing with relationships
 */
export const parseFileWithRelationships = (
  content: string,
  language: string = 'typescript',
  filePath: string = 'unknown'
): Effect.Effect<FileParseResult, VibeError> => {
  const startTime = Date.now()
  
  // Convert to absolute path if relative
  const absolutePath = filePath.startsWith('/') ? filePath : `${Deno.cwd()}/${filePath}`
  
  return pipe(
    withTreeSitterParser(language, async (parser) => {
      const tree = parser.parse(content)
      
      if (!tree) {
        throw new Error('Failed to parse content - tree is null')
      }
      
      // Extract elements
      const elements = await extractElements(tree, content, absolutePath)
      
      // Create intermediate parse result
      const parseResult: ParseResult = {
        elements,
        tree,
        content,
        filePath: absolutePath
      }
      
      // Discover relationships
      const relationships = await discoverRelationshipsSync(parseResult)
      
      // Analyze data flow
      const dataFlows = await analyzeDataFlowSync(parseResult)
      
      return {
        filePath: absolutePath,
        elements,
        relationships,
        dataFlows,
        processingTime: Date.now() - startTime,
        errors: []
      } satisfies FileParseResult
    }),
    Effect.catchAll(error => Effect.succeed({
      filePath: absolutePath,
      elements: [],
      relationships: [],
      dataFlows: [],
      processingTime: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : String(error)]
    } satisfies FileParseResult))
  )
}

/**
 * Discover relationships from parse result
 */
export const discoverRelationships = (
  parseResult: ParseResult
): Effect.Effect<RelationshipData[], VibeError> => {
  return Effect.tryPromise({
    try: () => discoverRelationshipsSync(parseResult),
    catch: (error) => createProcessingError(
      error,
      'analysis',
      'Failed to discover relationships',
      parseResult.filePath
    )
  })
}

/**
 * Analyze data flow from parse result
 */
export const analyzeDataFlow = (
  parseResult: ParseResult
): Effect.Effect<DataFlowRelationshipData[], VibeError> => {
  return Effect.tryPromise({
    try: () => analyzeDataFlowSync(parseResult),
    catch: (error) => createProcessingError(
      error,
      'analysis',
      'Failed to analyze data flow',
      parseResult.filePath
    )
  })
}


/**
 * Extract elements from AST tree
 */
const extractElements = async (
  tree: any,
  content: string,
  filePath: string
): Promise<CodeElementData[]> => {
  const elements: CodeElementData[] = []
  const lines = content.split('\n')
  
  const walkNode = (node: any) => {
    if (shouldExtractElement(node)) {
      const element = extractElementFromNode(node, lines, content, filePath)
      if (element) {
        elements.push(element)
      }
    }
    
    // Recursively walk children
    for (const child of node.children || []) {
      walkNode(child)
    }
  }
  
  walkNode(tree.rootNode)
  
  // Deduplicate elements - prefer "export" over "interface"/"type" for the same element
  const elementMap = new Map<string, CodeElementData>()
  
  for (const element of elements) {
    // Skip elements with meaningless names
    if (!element.element_name || element.element_name === 'unknown') continue
    
    // Filter out very short literals that aren't meaningful
    if (element.element_type === 'literal' && element.element_name.length < 2) continue
    
    // Filter out empty expressions
    if (element.element_type === 'expression' && element.element_name === 'expression') continue
    
    const key = element.id || `${element.file_path}:${element.element_name}`
    const existing = elementMap.get(key)
    
    if (!existing) {
      elementMap.set(key, element)
    } else {
      // Prefer exports over other types for the same element
      const preferenceOrder = ['export', 'function', 'class', 'interface', 'type', 'variable', 'import']
      const existingPref = preferenceOrder.indexOf(existing.element_type)
      const currentPref = preferenceOrder.indexOf(element.element_type)
      
      if (currentPref < existingPref) {
        elementMap.set(key, element)
      }
    }
  }
  
  return Array.from(elementMap.values())
}

/**
 * Check if node should be extracted as element
 */
const shouldExtractElement = (node: any): boolean => {
  // Only extract semantically meaningful units
  const semanticTypes = [
    // Public interface elements
    'function_declaration',
    'method_definition', 
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'import_statement',
    'export_statement',
    
    // Top-level constants/variables (not internal temps)
    'variable_declaration',
    'lexical_declaration'
  ]
  
  // For variable declarations, only extract if they're top-level (not inside functions)
  if (node.type === 'variable_declaration' || node.type === 'lexical_declaration') {
    return isTopLevelDeclaration(node)
  }
  
  return semanticTypes.includes(node.type)
}

/**
 * Check if a declaration is at the top level (not inside a function/class)
 */
const isTopLevelDeclaration = (node: any): boolean => {
  let parent = node.parent
  while (parent) {
    // If we find a function or method, this is not top-level
    if (parent.type === 'function_declaration' || 
        parent.type === 'method_definition' || 
        parent.type === 'arrow_function') {
      return false
    }
    parent = parent.parent
  }
  return true
}

/**
 * Extract element from AST node
 */
const extractElementFromNode = (
  node: any,
  lines: string[],
  content: string,
  filePath: string
): CodeElementData | null => {
  try {
    const startLine = node.startPosition.row + 1
    const endLine = node.endPosition.row + 1
    const startColumn = node.startPosition.column
    const endColumn = node.endPosition.column
    
    // Extract element name
    const elementName = extractElementName(node)
    if (!elementName || elementName === 'unknown') return null
    
    // Determine element type
    const elementType = mapNodeTypeToElementType(node.type)
    
    // Extract content
    const elementContent = lines.slice(startLine - 1, endLine).join('\n')
    
    // Extract additional properties
    const visibility = extractVisibility(node)
    const exported = isExported(node)
    const async = isAsync(node)
    const parameters = extractParameters(node)
    const returnType = extractReturnType(node)
    
    // Generate search phrases
    const searchPhrases = generateSearchPhrases(elementName, elementType, elementContent)
    
    return {
      id: generateStorageElementId(filePath, elementName),
      file_path: filePath,
      element_name: elementName,
      element_type: elementType,
      start_line: startLine,
      end_line: endLine,
      start_column: startColumn,
      end_column: endColumn,
      content: elementContent,
      search_phrases: searchPhrases,
      visibility,
      exported,
      async,
      parameters,
      return_type: returnType
    }
  } catch (error) {
    logSystem.warn(`Failed to extract element from node: ${error}`)
    return null
  }
}

/**
 * Extract element name from node
 */
const extractElementName = (node: any): string | null => {
  // Handle different node types
  switch (node.type) {
    case 'import_statement':
      return extractImportName(node)
    case 'export_statement':
      return extractExportName(node)
    case 'call_expression':
      return extractCallName(node)
    case 'member_expression':
      return extractMemberName(node)
    case 'assignment_expression':
      return extractAssignmentName(node)
    case 'lexical_declaration':
    case 'variable_declaration':
      // For variable declarations, look for variable_declarator children
      const declarator = node.namedChildren?.find((child: any) => child.type === 'variable_declarator')
      if (declarator) {
        return extractNameFromChildren(declarator)
      }
      return extractNameFromChildren(node)
    case 'string':
    case 'template_string':
    case 'number':
    case 'boolean':
      return node.text.length > 50 ? node.text.substring(0, 50) + '...' : node.text
    case 'identifier':
      return node.text
    case 'variable_declarator':
      return extractNameFromChildren(node)
    case 'expression_statement':
      return extractNameFromChildren(node) || 'expression'
    case 'return_statement':
      return 'return'
    case 'throw_statement':
      return 'throw'
    case 'if_statement':
      return 'if'
    case 'for_statement':
      return 'for'
    case 'while_statement':
      return 'while'
    case 'try_statement':
      return 'try'
    case 'switch_statement':
      return 'switch'
    case 'arrow_function':
      return 'arrow_function'
    case 'conditional_expression':
      return 'conditional'
    case 'binary_expression':
      return `${extractNameFromChildren(node?.namedChildren?.[0])} ${node?.namedChildren?.[1]?.text || 'op'} ${extractNameFromChildren(node?.namedChildren?.[2])}`
    case 'unary_expression':
      return `${node?.namedChildren?.[0]?.text || 'op'} ${extractNameFromChildren(node?.namedChildren?.[1])}`
    case 'update_expression':
      return extractNameFromChildren(node) || 'update'
    default:
      return extractNameFromChildren(node)
  }
}

/**
 * Extract name from node children
 */
const extractNameFromChildren = (node: any): string | null => {
  if (node.namedChildren) {
    for (const child of node.namedChildren) {
      if (child.type === 'identifier' || child.type === 'type_identifier' || child.type === 'property_identifier') {
        return child.text
      }
    }
  }
  return null
}

/**
 * Extract import name
 */
const extractImportName = (node: any): string | null => {
  // Extract source module name
  const sourceNode = node.namedChildren?.find((child: any) => child.type === 'string')
  if (sourceNode) {
    return sourceNode.text.replace(/['"]/g, '')
  }
  return null
}

/**
 * Extract export name
 */
const extractExportName = (node: any): string | null => {
  // Look for exported declaration
  const declaration = node.namedChildren?.find((child: any) => 
    child.type.includes('declaration')
  )
  if (declaration) {
    // For lexical_declaration (const, let), look for variable_declarator
    if (declaration.type === 'lexical_declaration') {
      const declarator = declaration.namedChildren?.find((child: any) => 
        child.type === 'variable_declarator'
      )
      if (declarator) {
        return extractNameFromChildren(declarator)
      }
    }
    return extractNameFromChildren(declaration)
  }
  return null
}

/**
 * Extract call name
 */
const extractCallName = (node: any): string | null => {
  // Get the function being called
  const functionNode = node.namedChildren?.[0]
  if (!functionNode) return null
  
  if (functionNode.type === 'member_expression') {
    return extractMemberName(functionNode)
  } else if (functionNode.type === 'identifier') {
    return functionNode.text
  }
  
  return functionNode.text || 'call'
}

/**
 * Extract member expression name
 */
const extractMemberName = (node: any): string | null => {
  const object = node.namedChildren?.[0]
  const property = node.namedChildren?.[1]
  
  if (object && property) {
    const objectName = object.type === 'identifier' ? object.text : extractNameFromChildren(object)
    const propertyName = property.text
    return `${objectName}.${propertyName}`
  }
  
  return null
}

/**
 * Extract assignment name
 */
const extractAssignmentName = (node: any): string | null => {
  const left = node.namedChildren?.[0]
  const right = node.namedChildren?.[1]
  
  if (left && right) {
    const leftName = extractNameFromChildren(left) || left.text
    const rightName = extractNameFromChildren(right) || right.text
    return `${leftName} = ${rightName?.substring(0, 20) || 'value'}`
  }
  
  return null
}

/**
 * Map AST node type to element type
 */
const mapNodeTypeToElementType = (nodeType: string): ElementType => {
  const mapping: Record<string, ElementType> = {
    // Top-level declarations
    'function_declaration': 'function',
    'method_definition': 'method',
    'class_declaration': 'class',
    'interface_declaration': 'interface',
    'type_alias_declaration': 'type',
    'enum_declaration': 'enum',
    'variable_declaration': 'variable',
    'lexical_declaration': 'variable',
    'import_statement': 'import',
    'export_statement': 'export',
    
    // Expressions and statements
    'expression_statement': 'expression',
    'call_expression': 'call',
    'assignment_expression': 'assignment',
    'conditional_expression': 'conditional',
    'arrow_function': 'function',
    'return_statement': 'statement',
    'throw_statement': 'statement',
    'if_statement': 'conditional',
    'for_statement': 'statement',
    'while_statement': 'statement',
    'try_statement': 'statement',
    'switch_statement': 'conditional',
    
    // Literals and identifiers
    'string': 'literal',
    'template_string': 'literal',
    'number': 'literal',
    'boolean': 'literal',
    'null': 'literal',
    'undefined': 'literal',
    'identifier': 'variable',
    
    // Property and object patterns
    'property_identifier': 'property',
    'object_pattern': 'variable',
    'array_pattern': 'variable',
    'property_signature': 'property',
    'method_signature': 'method',
    
    // Variable declarators (internal variables)
    'variable_declarator': 'variable',
    
    // Member expressions (property access)
    'member_expression': 'property',
    
    // Binary and unary expressions
    'binary_expression': 'expression',
    'unary_expression': 'expression',
    'update_expression': 'expression'
  }
  
  return mapping[nodeType] || 'expression'
}

/**
 * Extract visibility from node
 */
const extractVisibility = (node: any): 'public' | 'private' | 'protected' | undefined => {
  const text = node.text
  if (text.includes('private')) return 'private'
  if (text.includes('protected')) return 'protected'
  return 'public'
}

/**
 * Check if node is exported
 */
const isExported = (node: any): boolean => {
  return node.parent?.type === 'export_statement' || node.text.includes('export')
}

/**
 * Check if node is async
 */
const isAsync = (node: any): boolean => {
  return node.text.includes('async ')
}

/**
 * Extract parameters from function node
 */
const extractParameters = (node: any): string[] | undefined => {
  if (!node.type.includes('function') && !node.type.includes('method')) {
    return undefined
  }
  
  const parameters: string[] = []
  
  try {
    const paramsNode = node.namedChildren?.find((child: any) => child.type === 'formal_parameters')
    if (paramsNode) {
      for (const param of paramsNode.namedChildren || []) {
        if (param.type === 'identifier' || param.type === 'required_parameter') {
          parameters.push(param.text)
        }
      }
    }
  } catch (error) {
    logSystem.warn(`Failed to extract parameters: ${error}`)
  }
  
  return parameters.length > 0 ? parameters : undefined
}

/**
 * Extract return type from function node
 */
const extractReturnType = (node: any): string | undefined => {
  if (!node.type.includes('function') && !node.type.includes('method')) {
    return undefined
  }
  
  try {
    const typeNode = node.namedChildren?.find((child: any) => child.type === 'type_annotation')
    if (typeNode) {
      return typeNode.text.replace(/^:\s*/, '')
    }
  } catch (error) {
    logSystem.warn(`Failed to extract return type: ${error}`)
  }
  
  return undefined
}

/**
 * Generate search phrases for element
 */
const generateSearchPhrases = (
  name: string,
  type: ElementType,
  content: string
): string[] => {
  const phrases: string[] = [name]
  
  // Add type-specific phrases
  phrases.push(`${type} ${name}`)
  
  // Add contextual phrases based on content
  if (content.includes('async')) phrases.push(`async ${name}`)
  if (content.includes('export')) phrases.push(`export ${name}`)
  if (content.includes('private')) phrases.push(`private ${name}`)
  if (content.includes('public')) phrases.push(`public ${name}`)
  
  // Add domain-specific phrases
  if (name.toLowerCase().includes('test')) phrases.push('test function')
  if (name.toLowerCase().includes('validate')) phrases.push('validation')
  if (name.toLowerCase().includes('auth')) phrases.push('authentication')
  if (name.toLowerCase().includes('config')) phrases.push('configuration')
  
  return phrases
}

/**
 * Synchronous relationship discovery - focuses on external interactions
 */
const discoverRelationshipsSync = async (parseResult: ParseResult): Promise<RelationshipData[]> => {
  const relationships: RelationshipData[] = []
  
  // Build a map of imports for identifying external calls
  const importMap = new Map<string, string>()
  
  const walkNode = (node: any, depth: number = 0) => {
    // Find imports - these are external dependencies
    if (node.type === 'import_statement') {
      const importRelationship = extractImportRelationship(node, parseResult)
      if (importRelationship) {
        relationships.push(importRelationship)
        // Track imported names for external call detection
        trackImportedNames(node, importMap, parseResult.filePath)
      }
    }
    
    // Find ALL external usage patterns
    if (node.type === 'call_expression') {
      const callRelationship = extractExternalUsageRelationship(node, parseResult, importMap, 'calls')
      if (callRelationship) {
        relationships.push(callRelationship)
      }
    }
    
    // Find member expressions (object.property, namespace.function)
    if (node.type === 'member_expression') {
      const memberRelationship = extractExternalUsageRelationship(node, parseResult, importMap, 'uses')
      if (memberRelationship) {
        relationships.push(memberRelationship)
      }
    }
    
    // Find identifiers (variable usage, enum access, class references)
    if (node.type === 'identifier') {
      const identifierRelationship = extractExternalUsageRelationship(node, parseResult, importMap, 'uses')
      if (identifierRelationship) {
        relationships.push(identifierRelationship)
      }
    }
    
    // Find new expressions (class instantiation)
    if (node.type === 'new_expression') {
      const newRelationship = extractExternalUsageRelationship(node, parseResult, importMap, 'uses')
      if (newRelationship) {
        relationships.push(newRelationship)
      }
    }
    
    // Find inheritance (extends, implements) - these are type relationships
    if (node.type === 'class_declaration') {
      const inheritanceRelationships = extractInheritanceRelationships(node, parseResult)
      relationships.push(...inheritanceRelationships)
    }
    
    // Find type annotations that reference imported types
    if (node.type === 'type_annotation') {
      const typeRelationship = extractTypeRelationship(node, parseResult, importMap)
      if (typeRelationship) {
        relationships.push(typeRelationship)
      }
    }
    
    // Recursively walk children
    for (const child of node.children || []) {
      walkNode(child, depth + 1)
    }
  }
  
  walkNode(parseResult.tree.rootNode)
  
  return relationships
}

/**
 * Track ALL imported names for external usage detection
 */
const trackImportedNames = (importNode: any, importMap: Map<string, string>, currentFilePath: string): void => {
  try {
    const sourceNode = importNode.namedChildren?.find((child: any) => child.type === 'string')
    if (!sourceNode) return
    
    const moduleName = sourceNode.text.replace(/['"]/g, '')
    const resolvedModuleName = resolveImportPath(moduleName, currentFilePath)
    
    // Track named imports
    const importClause = importNode.namedChildren?.find((child: any) => child.type === 'import_clause')
    if (importClause) {
      // Default import (could be class, function, object, anything)
      const defaultImport = importClause.namedChildren?.find((child: any) => child.type === 'identifier')
      if (defaultImport) {
        importMap.set(defaultImport.text, resolvedModuleName)
      }
      
      // Named imports (functions, variables, types, enums, etc.)
      const namedImports = importClause.namedChildren?.find((child: any) => child.type === 'named_imports')
      if (namedImports) {
        for (const specifier of namedImports.namedChildren || []) {
          if (specifier.type === 'import_specifier') {
            const nameNode = specifier.namedChildren?.find((child: any) => child.type === 'identifier')
            if (nameNode) {
              importMap.set(nameNode.text, resolvedModuleName)
            }
          }
        }
      }
      
      // Namespace imports (import * as fs from 'fs')
      const namespaceImport = importClause.namedChildren?.find((child: any) => child.type === 'namespace_import')
      if (namespaceImport) {
        const nameNode = namespaceImport.namedChildren?.find((child: any) => child.type === 'identifier')
        if (nameNode) {
          importMap.set(nameNode.text, resolvedModuleName)
        }
      }
    }
  } catch (error) {
    logSystem.warn(`Failed to track imported names: ${error}`)
  }
}

/**
 * Extract external usage relationship (ANY usage of imported identifiers)
 */
const extractExternalUsageRelationship = (
  node: any, 
  parseResult: ParseResult, 
  importMap: Map<string, string>,
  relationshipType: RelationshipType = 'uses'
): RelationshipData | null => {
  try {
    let externalIdentifier: string | null = null
    let usageContext: any = {}
    
    // Extract identifier based on node type
    switch (node.type) {
      case 'call_expression':
        const callTarget = node.namedChildren?.[0]
        if (callTarget?.type === 'identifier') {
          externalIdentifier = callTarget.text
          usageContext = {
            usage_type: 'function_call',
            call_text: node.text.substring(0, 100),
            arguments_count: node.namedChildren?.find((child: any) => child.type === 'arguments')?.namedChildren?.length || 0
          }
        } else if (callTarget?.type === 'member_expression') {
          const object = callTarget.namedChildren?.[0]
          if (object?.type === 'identifier') {
            externalIdentifier = object.text
            usageContext = {
              usage_type: 'method_call',
              object_name: object.text,
              method_name: callTarget.namedChildren?.[1]?.text,
              call_text: node.text.substring(0, 100)
            }
          }
        }
        break
        
      case 'member_expression':
        const object = node.namedChildren?.[0]
        if (object?.type === 'identifier') {
          externalIdentifier = object.text
          usageContext = {
            usage_type: 'property_access',
            object_name: object.text,
            property_name: node.namedChildren?.[1]?.text,
            access_text: node.text
          }
        }
        break
        
      case 'identifier':
        // Only track if this identifier is directly imported (not inside other expressions)
        if (importMap.has(node.text) && !isInsideComplexExpression(node)) {
          externalIdentifier = node.text
          usageContext = {
            usage_type: 'variable_reference',
            identifier_name: node.text,
            context_type: getIdentifierContext(node)
          }
        }
        break
        
      case 'new_expression':
        const constructor = node.namedChildren?.[0]
        if (constructor?.type === 'identifier') {
          externalIdentifier = constructor.text
          usageContext = {
            usage_type: 'class_instantiation',
            class_name: constructor.text,
            constructor_args: node.namedChildren?.find((child: any) => child.type === 'arguments')?.namedChildren?.length || 0
          }
        }
        break
    }
    
    // Check if this is external
    if (!externalIdentifier || !importMap.has(externalIdentifier)) {
      // Also check for API calls and built-ins
      if (externalIdentifier && (isAPICall(externalIdentifier) || isBuiltInFunction(externalIdentifier))) {
        // Handle built-in/API usage
        const fromElement = findContainingElement(node, parseResult.elements)
        if (!fromElement) return null
        
        const fromId = generateRelationshipId(parseResult.filePath, fromElement.element_name)
        const toId = generateRelationshipId('built-in', externalIdentifier)
        
        return {
          from: fromId,
          to: toId,
          relationship_type: relationshipType,
          context: {
            ...usageContext,
            line: node.startPosition.row + 1,
            external: true,
            module: 'built-in'
          },
          complexity_score: 0.2
        }
      }
      return null
    }
    
    const fromElement = findContainingElement(node, parseResult.elements)
    if (!fromElement) return null
    
    const fromId = generateRelationshipId(parseResult.filePath, fromElement.element_name)
    const toModule = importMap.get(externalIdentifier)!
    const toId = generateRelationshipId(toModule, externalIdentifier)
    
    return {
      from: fromId,
      to: toId,
      relationship_type: relationshipType,
      context: {
        ...usageContext,
        line: node.startPosition.row + 1,
        external: true,
        module: toModule
      },
      complexity_score: 0.3
    }
  } catch (error) {
    logSystem.warn(`Failed to extract external usage relationship: ${error}`)
    return null
  }
}

/**
 * Check if identifier is inside a complex expression (to avoid double counting)
 */
const isInsideComplexExpression = (node: any): boolean => {
  let parent = node.parent
  while (parent) {
    if (parent.type === 'member_expression' || 
        parent.type === 'call_expression' || 
        parent.type === 'new_expression') {
      return true
    }
    parent = parent.parent
  }
  return false
}

/**
 * Get the context type for an identifier
 */
const getIdentifierContext = (node: any): string => {
  let parent = node.parent
  if (!parent) return 'unknown'
  
  switch (parent.type) {
    case 'variable_declarator':
      return 'variable_assignment'
    case 'assignment_expression':
      return 'assignment'
    case 'binary_expression':
      return 'comparison'
    case 'return_statement':
      return 'return_value'
    case 'expression_statement':
      return 'expression'
    case 'type_annotation':
      return 'type_usage'
    default:
      return parent.type
  }
}

/**
 * Extract type relationship (when a function uses an imported type)
 */
const extractTypeRelationship = (
  node: any, 
  parseResult: ParseResult, 
  importMap: Map<string, string>
): RelationshipData | null => {
  try {
    const typeText = node.text.replace(/^:\s*/, '')
    const baseType = typeText.split('<')[0].split('[')[0].trim()
    
    // Check if this type is imported
    if (!importMap.has(baseType)) return null
    
    const fromElement = findContainingElement(node, parseResult.elements)
    if (!fromElement) return null
    
    const fromId = generateRelationshipId(parseResult.filePath, fromElement.element_name)
    const toModule = importMap.get(baseType)!
    const toId = generateRelationshipId(toModule, baseType)
    
    return {
      from: fromId,
      to: toId,
      relationship_type: 'uses',
      context: {
        usage_type: 'type_annotation',
        type_text: typeText
      },
      complexity_score: 0.2
    }
  } catch (error) {
    logSystem.warn(`Failed to extract type relationship: ${error}`)
    return null
  }
}

/**
 * Check if a function call is an API call
 */
const isAPICall = (functionName: string): boolean => {
  const apiPatterns = [
    'fetch', 'axios', 'http', 'https',
    'readFile', 'writeFile', 'readTextFile',
    'embedContent', 'generateContent'
  ]
  
  // Check exact matches or common API prefixes
  const exactMatches = ['post', 'get', 'put', 'delete', 'query', 'execute', 'connect']
  
  return apiPatterns.some(pattern => functionName.includes(pattern)) ||
         exactMatches.some(exact => functionName === exact || functionName.startsWith(exact + '.'))
}

/**
 * Generate storage-compatible element ID
 */
const generateStorageElementId = (filePath: string, elementName: string): string => {
  // Generate simple ID without table prefix - storage layer adds table prefix when needed
  // Let SurrealDB handle escaping automatically for complex identifiers
  return `${filePath}:${elementName}`
}

/**
 * Resolve relative import path to absolute path
 */
const resolveImportPath = (importPath: string, currentFilePath: string): string => {
  // If already absolute, return as-is
  if (importPath.startsWith('/')) {
    return importPath
  }
  
  // If it's a relative path starting with ./ or ../
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const currentDir = currentFilePath.split('/').slice(0, -1).join('/')
    const parts = currentDir.split('/')
    const importParts = importPath.split('/')
    
    for (const part of importParts) {
      if (part === '.') {
        continue
      } else if (part === '..') {
        parts.pop()
      } else {
        parts.push(part)
      }
    }
    
    return parts.join('/')
  }
  
  // For non-relative imports (like 'react', 'lodash'), return as-is
  return importPath
}

/**
 * Generate relationship ID using same format as element IDs
 * This ensures relationship from/to IDs match actual database records
 */
const generateRelationshipId = (filePath: string, elementName: string): string => {
  return generateStorageElementId(filePath, elementName)
}

/**
 * Check if a function is a built-in function
 */
const isBuiltInFunction = (functionName: string): boolean => {
  const builtIns = [
    'console', 'JSON', 'Object', 'Array',
    'setTimeout', 'setInterval', 'clearTimeout',
    'parseInt', 'parseFloat', 'isNaN',
    'Math', 'Date', 'RegExp', 'Error'
  ]
  
  return builtIns.some(builtin => functionName.startsWith(builtin))
}

/**
 * Extract import relationship
 */
const extractImportRelationship = (node: any, parseResult: ParseResult): RelationshipData | null => {
  try {
    const sourceNode = node.namedChildren?.find((child: any) => child.type === 'string')
    if (!sourceNode) return null
    
    const moduleName = sourceNode.text.replace(/['"]/g, '')
    const resolvedModuleName = resolveImportPath(moduleName, parseResult.filePath)
    const fromId = generateRelationshipId(parseResult.filePath, 'module')
    const toId = generateRelationshipId(resolvedModuleName, 'module')
    
    return {
      from: fromId,
      to: toId,
      relationship_type: 'imports',
      context: {
        import_line: node.startPosition.row + 1,
        import_text: node.text
      },
      complexity_score: 0.3
    }
  } catch (error) {
    logSystem.warn(`Failed to extract import relationship: ${error}`)
    return null
  }
}

/**
 * Extract inheritance relationships
 */
const extractInheritanceRelationships = (node: any, parseResult: ParseResult): RelationshipData[] => {
  const relationships: RelationshipData[] = []
  
  try {
    const className = extractNameFromChildren(node)
    if (!className) return relationships
    
    const fromId = generateRelationshipId(parseResult.filePath, className)
    
    // Find heritage clause (extends, implements)
    const heritageClause = node.namedChildren?.find((child: any) => child.type === 'class_heritage')
    if (heritageClause) {
      for (const heritage of heritageClause.namedChildren || []) {
        if (heritage.type === 'extends_clause') {
          const superClass = heritage.namedChildren?.[0]?.text
          if (superClass) {
            relationships.push({
              from: fromId,
              to: generateRelationshipId(parseResult.filePath, superClass),
              relationship_type: 'extends',
              context: {
                heritage_line: heritage.startPosition.row + 1
              },
              complexity_score: 0.8
            })
          }
        }
        
        if (heritage.type === 'implements_clause') {
          const interfaces = heritage.namedChildren || []
          for (const interfaceNode of interfaces) {
            if (interfaceNode.type === 'type_identifier') {
              relationships.push({
                from: fromId,
                to: generateRelationshipId(parseResult.filePath, interfaceNode.text),
                relationship_type: 'implements',
                context: {
                  heritage_line: heritage.startPosition.row + 1
                },
                complexity_score: 0.6
              })
            }
          }
        }
      }
    }
  } catch (error) {
    logSystem.warn(`Failed to extract inheritance relationships: ${error}`)
  }
  
  return relationships
}

/**
 * Find containing element for a node
 */
const findContainingElement = (node: any, elements: CodeElementData[]): CodeElementData | null => {
  const line = node.startPosition.row + 1
  
  for (const element of elements) {
    if (line >= element.start_line && line <= element.end_line) {
      return element
    }
  }
  
  return null
}

/**
 * Synchronous data flow analysis
 */
const analyzeDataFlowSync = async (parseResult: ParseResult): Promise<DataFlowRelationshipData[]> => {
  const dataFlows: DataFlowRelationshipData[] = []
  
  const walkNode = (node: any) => {
    // Find assignments
    if (node.type === 'assignment_expression') {
      const assignmentFlow = extractAssignmentFlow(node, parseResult)
      if (assignmentFlow) {
        dataFlows.push(assignmentFlow)
      }
    }
    
    // Find function calls with arguments
    if (node.type === 'call_expression') {
      const argumentFlows = extractArgumentFlows(node, parseResult)
      dataFlows.push(...argumentFlows)
    }
    
    // Find return statements
    if (node.type === 'return_statement') {
      const returnFlow = extractReturnFlow(node, parseResult)
      if (returnFlow) {
        dataFlows.push(returnFlow)
      }
    }
    
    // Recursively walk children
    for (const child of node.children || []) {
      walkNode(child)
    }
  }
  
  walkNode(parseResult.tree.rootNode)
  
  return dataFlows
}

/**
 * Extract assignment flow
 */
const extractAssignmentFlow = (node: any, parseResult: ParseResult): DataFlowRelationshipData | null => {
  try {
    const left = node.namedChildren?.[0]?.text
    const right = node.namedChildren?.[1]?.text
    
    if (!left || !right) return null
    
    const fromId = generateRelationshipId(parseResult.filePath, right)
    const toId = generateRelationshipId(parseResult.filePath, left)
    
    return {
      from: fromId,
      to: toId,
      flow_type: 'assignment',
      flow_metadata: {
        assignment_line: node.startPosition.row + 1,
        assignment_text: node.text
      }
    }
  } catch (error) {
    logSystem.warn(`Failed to extract assignment flow: ${error}`)
    return null
  }
}

/**
 * Extract argument flows
 */
const extractArgumentFlows = (node: any, parseResult: ParseResult): DataFlowRelationshipData[] => {
  const flows: DataFlowRelationshipData[] = []
  
  try {
    const functionName = node.namedChildren?.[0]?.text
    if (!functionName) return flows
    
    const argumentsNode = node.namedChildren?.find((child: any) => child.type === 'arguments')
    if (!argumentsNode) return flows
    
    const toId = generateRelationshipId(parseResult.filePath, functionName)
    
    for (const [index, arg] of (argumentsNode.namedChildren || []).entries()) {
      const fromId = generateRelationshipId(parseResult.filePath, arg.text)
      
      flows.push({
        from: fromId,
        to: toId,
        flow_type: 'argument_passing',
        flow_metadata: {
          parameter_position: index,
          call_line: node.startPosition.row + 1,
          argument_text: arg.text
        }
      })
    }
  } catch (error) {
    logSystem.warn(`Failed to extract argument flows: ${error}`)
  }
  
  return flows
}

/**
 * Extract return flow
 */
const extractReturnFlow = (node: any, parseResult: ParseResult): DataFlowRelationshipData | null => {
  try {
    const containingFunction = findContainingElement(node, parseResult.elements)
    if (!containingFunction) return null
    
    const returnValue = node.namedChildren?.[0]?.text
    if (!returnValue) return null
    
    const fromId = generateRelationshipId(parseResult.filePath, containingFunction.element_name)
    const toId = generateRelationshipId(parseResult.filePath, returnValue)
    
    return {
      from: fromId,
      to: toId,
      flow_type: 'return_output',
      flow_metadata: {
        return_line: node.startPosition.row + 1,
        return_text: node.text
      }
    }
  } catch (error) {
    logSystem.warn(`Failed to extract return flow: ${error}`)
    return null
  }
}


/**
 * CLI interface for testing
 */
if (import.meta.main) {
  const args = Deno.args
  const command = args[0]
  const filePath = args[1]
  
  if (!command || !filePath) {
    console.log('Usage: deno run --allow-all ast-analyzer.ts <command> <file>')
    console.log('Commands:')
    console.log('  parse-file <file>           - Parse file with relationships')
    console.log('  discover-relationships <file> - Discover relationships only')
    console.log('  analyze-data-flow <file>    - Analyze data flow only')
    Deno.exit(1)
  }
  
  const content = await Deno.readTextFile(filePath)
  const language = detectLanguage(filePath)
  const absolutePath = filePath.startsWith('/') ? filePath : `${Deno.cwd()}/${filePath}`
  
  switch (command) {
    case 'parse-file':
      const result = await Effect.runPromise(
        parseFileWithRelationships(content, language, absolutePath)
      )
      console.log(JSON.stringify(result, null, 2))
      break
      
    case 'discover-relationships':
      const parseResult = await Effect.runPromise(
        withTreeSitterParser(language, async (parser) => {
          const tree = parser.parse(content)
          const elements = await extractElements(tree, content, absolutePath)
          return { elements, tree, content, filePath: absolutePath }
        })
      )
      const relationships = await Effect.runPromise(discoverRelationships(parseResult))
      console.log(JSON.stringify(relationships, null, 2))
      break
      
    case 'analyze-data-flow':
      const parseResult2 = await Effect.runPromise(
        withTreeSitterParser(language, async (parser) => {
          const tree = parser.parse(content)
          const elements = await extractElements(tree, content, absolutePath)
          return { elements, tree, content, filePath: absolutePath }
        })
      )
      const dataFlows = await Effect.runPromise(analyzeDataFlow(parseResult2))
      console.log(JSON.stringify(dataFlows, null, 2))
      break
      
    default:
      console.log(`Unknown command: ${command}`)
      Deno.exit(1)
  }
}