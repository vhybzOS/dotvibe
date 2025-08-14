/**
 * AST System Core Logic
 *
 * Core parsing, relationship discovery, and data flow analysis functionality.
 *
 * @tested_by tests/core/ast-core.test.ts
 */

import { Effect, pipe } from 'effect'
import { Parser, Language, Query } from 'web-tree-sitter'
import { createError, type VibeError } from '../errors.ts'
import { getCommandVerbose } from '../config.ts'
import type {
  FileParseResult,
  ParseResult,
  CodeElementData,
  RelationshipData,
  DataFlowRelationshipData,
  ElementType,
  RelationshipType
} from './types.ts'
import { DataFlowPattern } from './types.ts'
import {
  parserCache,
  LANGUAGE_CONFIGS,
  resolveWasmPath,
  detectLanguage,
  shouldExtractElement,
  mapNodeTypeToElementType,
  extractNameFromChildren,
  extractModuleName,
  extractImportNames,
  generateStorageElementId,
  resolveImportPath,
  generateRelationshipId,
  generateSearchPhrases,
  extractVisibility,
  isExported,
  isAsync,
  extractParameters,
  extractReturnType
} from './utils.ts'

// Create subsystem-specific error creators
const treeSitterError = createError('treesitter')
const processingError = createError('processing')

// Get verbose setting for this command invocation
const verbose = getCommandVerbose()

// =============================================================================
// PARSER MANAGEMENT
// =============================================================================

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
    throw treeSitterError(
      'error',
      `Failed to initialize parser for ${language}`,
      language,
      { error, phase: 'initialization' }
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
        catch: (error) => treeSitterError(
          'error',
          `Parser operation failed for ${language}`,
          language,
          { error, phase: 'parsing' }
        )
      })
    )
  )
}

// =============================================================================
// MAIN PARSING FUNCTIONS
// =============================================================================

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
    catch: (error) => processingError(
      'error',
      'Failed to discover relationships',
      parseResult.filePath,
      { error, phase: 'analysis' }
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
    catch: (error) => processingError(
      'error',
      'Failed to analyze data flow',
      parseResult.filePath,
      { error, phase: 'analysis' }
    )
  })
}

// =============================================================================
// ELEMENT EXTRACTION
// =============================================================================

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
      // Special handling for import statements - create separate elements for each imported name
      if (node.type === 'import_statement') {
        const importedNames = extractImportNames(node)
        const moduleName = extractModuleName(node)
        
        if (moduleName && importedNames.length > 0) {
          for (const importedName of importedNames) {
            const element = extractElementFromNodeWithName(node, lines, filePath, importedName)
            if (element) {
              elements.push(element)
            }
          }
        } else {
          // Fallback to original logic if extraction fails
          const element = extractElementFromNode(node, lines, filePath)
          if (element) {
            elements.push(element)
          }
        }
      } else {
        // Normal element extraction for non-imports
        const element = extractElementFromNode(node, lines, filePath)
        if (element) {
          elements.push(element)
        }
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
 * Extract element from AST node with specific name (for imports)
 */
const extractElementFromNodeWithName = (
  node: any,
  lines: string[],
  filePath: string,
  elementName: string
): CodeElementData | null => {
  try {
    const startLine = node.startPosition.row + 1
    const endLine = node.endPosition.row + 1
    const startColumn = node.startPosition.column
    const endColumn = node.endPosition.column
    
    // Use provided element name instead of extracting
    if (!elementName) return null
    
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
    
    // Generate ID and file_path using hybrid scheme
    const elementId = generateStorageElementId(filePath, elementName, node)
    const elementFilePath = node.type === 'import_statement' ? extractModuleName(node) || filePath : filePath
    
    return {
      id: elementId,
      file_path: elementFilePath,
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
    verbose && console.warn(`Failed to extract element from node with name: ${error}`)
    return null
  }
}

/**
 * Extract element from AST node
 */
const extractElementFromNode = (
  node: any,
  lines: string[],
  filePath: string
): CodeElementData | null => {
  try {
    // Extract element name
    const elementName = extractElementName(node)
    if (!elementName || elementName === 'unknown') return null
    
    // Use the helper function with extracted name
    return extractElementFromNodeWithName(node, lines, filePath, elementName)
  } catch (error) {
    verbose && console.warn(`Failed to extract element from node: ${error}`)
    return null
  }
}

/**
 * Extract element name from node
 */
const extractElementName = (node: any): string | null => {
  // Handle different node types
  switch (node.type) {
    case 'import_statement': {
      return extractImportName(node)
    }
    case 'export_statement': {
      return extractExportName(node)
    }
    case 'call_expression': {
      return extractCallName(node)
    }
    case 'member_expression': {
      return extractMemberName(node)
    }
    case 'assignment_expression': {
      return extractAssignmentName(node)
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      // For variable declarations, look for variable_declarator children
      const declarator = node.namedChildren?.find((child: any) => child.type === 'variable_declarator')
      if (declarator) {
        return extractNameFromChildren(declarator)
      }
      return extractNameFromChildren(node)
    }
    case 'string':
    case 'template_string':
    case 'number':
    case 'boolean': {
      return node.text.length > 50 ? node.text.substring(0, 50) + '...' : node.text
    }
    case 'identifier': {
      return node.text
    }
    case 'variable_declarator': {
      return extractNameFromChildren(node)
    }
    case 'expression_statement': {
      return extractNameFromChildren(node) || 'expression'
    }
    case 'return_statement': {
      return 'return'
    }
    case 'throw_statement': {
      return 'throw'
    }
    case 'if_statement': {
      return 'if'
    }
    case 'for_statement': {
      return 'for'
    }
    case 'while_statement': {
      return 'while'
    }
    case 'try_statement': {
      return 'try'
    }
    case 'switch_statement': {
      return 'switch'
    }
    case 'arrow_function': {
      return 'arrow_function'
    }
    case 'conditional_expression': {
      return 'conditional'
    }
    case 'binary_expression': {
      return `${extractNameFromChildren(node?.namedChildren?.[0])} ${node?.namedChildren?.[1]?.text || 'op'} ${extractNameFromChildren(node?.namedChildren?.[2])}`
    }
    case 'unary_expression': {
      return `${node?.namedChildren?.[0]?.text || 'op'} ${extractNameFromChildren(node?.namedChildren?.[1])}`
    }
    case 'update_expression': {
      return extractNameFromChildren(node) || 'update'
    }
    default: {
      return extractNameFromChildren(node)
    }
  }
}

/**
 * Extract import name (legacy - returns first imported name or module name)
 */
const extractImportName = (node: any): string | null => {
  const names = extractImportNames(node)
  if (names.length > 0) {
    return names[0] ?? null // Return first imported name with null check
  }
  
  // Fallback to module name
  return extractModuleName(node)
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

// =============================================================================
// RELATIONSHIP DISCOVERY
// =============================================================================

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
    verbose && console.warn(`Failed to track imported names: ${error}`)
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
      case 'call_expression': {
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
      }
        
      case 'member_expression': {
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
      }
        
      case 'identifier': {
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
      }
        
      case 'new_expression': {
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
    verbose && console.warn(`Failed to extract external usage relationship: ${error}`)
    return null
  }
}

// =============================================================================
// HELPER FUNCTIONS FOR RELATIONSHIPS
// =============================================================================

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
  const parent = node.parent
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
    verbose && console.warn(`Failed to extract import relationship: ${error}`)
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
    verbose && console.warn(`Failed to extract inheritance relationships: ${error}`)
  }
  
  return relationships
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
    verbose && console.warn(`Failed to extract type relationship: ${error}`)
    return null
  }
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

// =============================================================================
// DATA FLOW ANALYSIS
// =============================================================================

/**
 * Generate data flow element ID - checks if element is imported and uses correct path
 */
const generateDataFlowElementId = (parseResult: ParseResult, elementName: string): string => {
  // Check if this element name is imported - look through the parse result elements
  for (const element of parseResult.elements) {
    if (element.element_type === 'import' && element.element_name === elementName) {
      // Use the import element's ID which should have the resolved path
      return element.id || generateStorageElementId(parseResult.filePath, elementName)
    }
  }
  
  // Not imported, use local file path
  return generateRelationshipId(parseResult.filePath, elementName)
}

/**
 * Tree-sitter query-based data flow analysis
 */
const analyzeDataFlowSync = async (parseResult: ParseResult): Promise<DataFlowRelationshipData[]> => {
  const dataFlows: DataFlowRelationshipData[] = []
  
  try {
    // Get the language from parser cache
    const cached = parserCache.get('typescript')
    if (!cached) {
      console.log('DEBUG: No cached language found, skipping query-based analysis')
      return dataFlows
    }
    
    const language = cached.language
    // Use new Query constructor instead of deprecated language.query
    const query = new Query(language, LANGUAGE_CONFIGS.typescript!.queries.dataflow)
    const matches = query.matches(parseResult.tree.rootNode)
    
    for (const match of matches) {
      const flow = extractDataFlowFromMatch(match, parseResult)
      if (flow) {
        dataFlows.push(flow)
      }
    }
  } catch (error) {
    console.log('DEBUG: Query error:', error)
    verbose && console.warn(`Failed to analyze data flow with tree-sitter queries: ${error}`)
    // Fallback to empty array - better than crashing
  }
  
  return dataFlows
}

/**
 * Extract data flow from tree-sitter query match
 */
const extractDataFlowFromMatch = (match: any, parseResult: ParseResult): DataFlowRelationshipData | null => {
  try {
    const captures = new Map()
    for (const capture of match.captures) {
      captures.set(capture.name, capture.node)
    }
    
    const patternIndex = match.patternIndex
    
    // Handle variable assignment: const config = DEFAULT_ERROR_CONFIG
    if (patternIndex === DataFlowPattern.VARIABLE_ASSIGNMENT) {
      const varName = captures.get('var_name')?.text
      const varValue = captures.get('var_value')?.text
      
      if (!varName || !varValue) return null
      
      // For variable assignments, we need to check if the source variable is imported
      const fromPath = generateDataFlowElementId(parseResult, varValue) // DEFAULT_ERROR_CONFIG (could be imported)
      const toPath = generateRelationshipId(parseResult.filePath, varName)     // config (local variable)
      
      return {
        from: fromPath,
        to: toPath,
        flow_type: 'assignment',
        flow_metadata: {
          assignment_line: captures.get('var_name')?.startPosition.row + 1,
          assignment_text: `${varName} = ${varValue}`
        }
      }
    }
    
    // Handle property access: config.maxRetries
    if (patternIndex === DataFlowPattern.PROPERTY_ACCESS) {
      const object = captures.get('object')?.text
      const property = captures.get('property')?.text
      
      if (!object || !property) return null
      
      return {
        from: generateRelationshipId(parseResult.filePath, object), // config
        to: generateRelationshipId(parseResult.filePath, `${object}.${property}`), // config.maxRetries
        flow_type: 'property_access',
        flow_metadata: {
          access_line: captures.get('object')?.startPosition.row + 1,
          property_name: property,
          object_name: object
        }
      }
    }
    
    // Handle assignment expressions: a = b
    if (patternIndex === DataFlowPattern.ASSIGNMENT) {
      const left = captures.get('left')?.text
      const right = captures.get('right')?.text
      
      if (!left || !right) return null
      
      return {
        from: generateRelationshipId(parseResult.filePath, right),
        to: generateRelationshipId(parseResult.filePath, left),
        flow_type: 'assignment',
        flow_metadata: {
          assignment_line: captures.get('left')?.startPosition.row + 1,
          assignment_text: `${left} = ${right}`
        }
      }
    }
    
    // Handle function calls: func(arg1, arg2)
    if (patternIndex === DataFlowPattern.CALL) {
      const functionName = captures.get('function')?.text
      const argsNode = captures.get('args')
      
      if (!functionName || !argsNode) return null
      
      // For now, create one flow for the function call itself
      // Could be extended to handle individual arguments
      return {
        from: generateRelationshipId(parseResult.filePath, 'caller'),
        to: generateRelationshipId(parseResult.filePath, functionName),
        flow_type: 'argument_passing',
        flow_metadata: {
          call_line: captures.get('function')?.startPosition.row + 1,
          function_name: functionName,
          argument_count: argsNode.namedChildren?.length || 0
        }
      }
    }
    
    // Handle return statements: return value
    if (patternIndex === DataFlowPattern.RETURN) {
      const returnValue = captures.get('return_value')?.text
      if (!returnValue) return null
      
      const containingFunction = findContainingElement(captures.get('return_value'), parseResult.elements)
      if (!containingFunction) return null
      
      return {
        from: generateRelationshipId(parseResult.filePath, containingFunction.element_name),
        to: generateRelationshipId(parseResult.filePath, returnValue),
        flow_type: 'return_output',
        flow_metadata: {
          return_line: captures.get('return_value')?.startPosition.row + 1,
          return_text: returnValue
        }
      }
    }
    
    return null
  } catch (error) {
    verbose && console.warn(`Failed to extract data flow from match: ${error}`)
    return null
  }
}