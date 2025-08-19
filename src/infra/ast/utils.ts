/**
 * AST System Utilities
 *
 * Utility functions for path resolution, element extraction, and helper operations.
 *
 * @tested_by tests/core/ast-utils.test.ts
 */

import type { 
  ElementType, 
  RelationshipType,
  CodeElementData, 
  LanguageConfig,
  ParserCacheEntry 
} from './types.ts'

// =============================================================================
// GLOBAL CONSTANTS & CACHE
// =============================================================================

/**
 * Global parser cache
 */
export const parserCache = new Map<string, ParserCacheEntry>()

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
      `,
      dataflow: `
        ; Variable assignments (const config = DEFAULT_ERROR_CONFIG)
        (variable_declarator 
          name: (identifier) @var_name 
          value: (identifier) @var_value) @variable_assignment
        
        ; Property access (config.maxRetries)
        (member_expression 
          object: (identifier) @object 
          property: (property_identifier) @property) @property_access
        
        ; Assignment expressions (a = b)
        (assignment_expression 
          left: (identifier) @left 
          right: (identifier) @right) @assignment
        
        ; Function calls with arguments (func(arg1, arg2))
        (call_expression 
          function: (identifier) @function 
          arguments: (arguments) @args) @call
        
        ; Return statements (return value)
        (return_statement (identifier) @return_value) @return
      `
    }
  }
}

// =============================================================================
// WASM PATH RESOLUTION UTILITIES
// =============================================================================

/**
 * Detect if running in compiled mode
 * Extracted for testability
 */
export const isCompiledMode = (): boolean => {
  return !import.meta.url.startsWith('file:///')
}

/**
 * Resolve WASM path for a language dynamically
 * Detects compiled executable vs development mode
 */
export const resolveWasmPath = async (language: string, compiledMode?: boolean): Promise<string> => {
  const config = LANGUAGE_CONFIGS[language]
  if (!config) {
    throw new Error(`Unsupported language: ${language}`)
  }
  
  // Use provided mode or detect automatically
  const isCompiled = compiledMode ?? isCompiledMode()
  
  // Helper function to find latest version in a directory
  const findLatestVersion = async (basePath: string): Promise<string | null> => {
    try {
      const versions: string[] = []
      for await (const entry of Deno.readDir(basePath)) {
        if (entry.isDirectory && /^\d+\.\d+\.\d+/.test(entry.name)) {
          versions.push(entry.name)
        }
      }
      
      if (versions.length === 0) return null
      
      // Sort versions in descending order (latest first)
      const latestVersion = versions.sort((a, b) => {
        const versionA = a.split('.').map(n => parseInt(n, 10))
        const versionB = b.split('.').map(n => parseInt(n, 10))
        
        for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
          const a = versionA[i] || 0
          const b = versionB[i] || 0
          if (a !== b) return b - a
        }
        return 0
      })[0]
      
      return `${basePath}/${latestVersion}/data/${config.wasmFile}`
    } catch {
      return null
    }
  }
  
  // Helper function to check if file exists
  const fileExists = async (path: string): Promise<boolean> => {
    try {
      await Deno.stat(path)
      return true
    } catch {
      return false
    }
  }
  
  // Universal search paths (used in both modes)
  const possiblePaths: string[] = []
  
  // 1. Relative to current working directory (development/local builds)
  possiblePaths.push(`./data/${config.wasmFile}`)
  
  // 2. Relative to project root (development mode)
  possiblePaths.push(`../data/${config.wasmFile}`)
  possiblePaths.push(`../../data/${config.wasmFile}`)
  
  // 3. Relative to executable directory (portable installs)
  try {
    const executableDir = new URL('.', import.meta.url).pathname
    possiblePaths.push(`${executableDir}../data/${config.wasmFile}`)
    possiblePaths.push(`${executableDir}../../data/${config.wasmFile}`)
  } catch {
    // Continue if we can't determine executable directory
  }
  
  // 4. User space installation - find latest version (skip in compiled mode)
  if (!isCompiled) {
    const homeDir = Deno.env.get('HOME')
    if (homeDir) {
      const userLatestPath = await findLatestVersion(`${homeDir}/.local/dotvibe`)
      if (userLatestPath) {
        possiblePaths.push(userLatestPath)
      }
    }
  }
  
  // 5. System space installation - find latest version (skip in compiled mode)
  if (!isCompiled) {
    const systemLatestPath = await findLatestVersion('/usr/local/dotvibe')
    if (systemLatestPath) {
      possiblePaths.push(systemLatestPath)
    }
  }
  
  // Try all possible paths first (works for both compiled and development)
  for (const dataPath of possiblePaths) {
    if (await fileExists(dataPath)) {
      return dataPath
    }
  }
  
  // If not found and in development mode, try npm cache as fallback
  if (!isCompiled) {
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
      
      if (latestVersion) {
        const wasmPath = `${packageDir}/${latestVersion}/${config.wasmFile}`
        if (await fileExists(wasmPath)) {
          return wasmPath
        }
      }
    } catch {
      // Continue to error if npm cache lookup fails
    }
  }
  
  throw new Error(`Failed to find WASM file for ${language}. ` +
                 `Searched in: ${possiblePaths.join(', ')}${!isCompiled ? ', npm cache' : ''}. ` +
                 `Make sure dotvibe is properly installed with: curl -fsSL https://dotvibe.dev | sh`)
}

// =============================================================================
// LANGUAGE DETECTION UTILITIES
// =============================================================================

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

// =============================================================================
// ELEMENT EXTRACTION UTILITIES
// =============================================================================

/**
 * Check if node should be extracted as element
 */
export const shouldExtractElement = (node: any): boolean => {
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
export const isTopLevelDeclaration = (node: any): boolean => {
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
 * Map AST node type to element type
 */
export const mapNodeTypeToElementType = (nodeType: string): ElementType => {
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

// =============================================================================
// NAME EXTRACTION UTILITIES
// =============================================================================

/**
 * Extract name from node children
 */
export const extractNameFromChildren = (node: any): string | null => {
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
 * Extract module name from import statement
 */
export const extractModuleName = (node: any): string | null => {
  const sourceNode = node.namedChildren?.find((child: any) => child.type === 'string')
  if (sourceNode) {
    return sourceNode.text.replace(/['"]/g, '')
  }
  return null
}

/**
 * Extract ALL imported names from import statement (for hybrid ID scheme)
 */
export const extractImportNames = (node: any): string[] => {
  const names: string[] = []
  
  try {
    const importClause = node.namedChildren?.find((child: any) => child.type === 'import_clause')
    if (!importClause) return names
    
    // Default import (import Parser from 'web-tree-sitter')
    const defaultImport = importClause.namedChildren?.find((child: any) => child.type === 'identifier')
    if (defaultImport) {
      names.push(defaultImport.text)
    }
    
    // Named imports (import { Parser, Language } from 'web-tree-sitter')
    const namedImports = importClause.namedChildren?.find((child: any) => child.type === 'named_imports')
    if (namedImports) {
      for (const specifier of namedImports.namedChildren || []) {
        if (specifier.type === 'import_specifier') {
          const nameNode = specifier.namedChildren?.find((child: any) => child.type === 'identifier')
          if (nameNode) {
            names.push(nameNode.text)
          }
        }
      }
    }
    
    // Namespace imports (import * as fs from 'fs')
    const namespaceImport = importClause.namedChildren?.find((child: any) => child.type === 'namespace_import')
    if (namespaceImport) {
      const nameNode = namespaceImport.namedChildren?.find((child: any) => child.type === 'identifier')
      if (nameNode) {
        names.push(nameNode.text)
      }
    }
  } catch (error) {
    console.warn(`Failed to extract import names: ${error}`)
  }
  
  return names
}

// =============================================================================
// ID GENERATION UTILITIES
// =============================================================================

/**
 * Generate storage-compatible element ID with hybrid scheme
 * Internal elements: filePath:elementName
 * External imports: moduleName:importedName (resolved to absolute paths)
 */
export const generateStorageElementId = (filePath: string, elementName: string, node?: any): string => {
  // For import statements, use resolved module:element format
  if (node?.type === 'import_statement') {
    const moduleName = extractModuleName(node)
    if (moduleName) {
      const resolvedModuleName = resolveImportPath(moduleName, filePath)
      return `${resolvedModuleName}:${elementName}`
    }
  }
  
  // For all other elements, use filePath:elementName format
  return `${filePath}:${elementName}`
}

/**
 * Resolve relative import path to absolute path
 */
export const resolveImportPath = (importPath: string, currentFilePath: string): string => {
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
export const generateRelationshipId = (filePath: string, elementName: string): string => {
  return generateStorageElementId(filePath, elementName)
}

// =============================================================================
// SEARCH PHRASE GENERATION
// =============================================================================

/**
 * Generate search phrases for element
 */
export const generateSearchPhrases = (
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

// =============================================================================
// ELEMENT PROPERTY EXTRACTION
// =============================================================================

/**
 * Extract visibility from node
 */
export const extractVisibility = (node: any): 'public' | 'private' | 'protected' | undefined => {
  const text = node.text
  if (text.includes('private')) return 'private'
  if (text.includes('protected')) return 'protected'
  return 'public'
}

/**
 * Check if node is exported
 */
export const isExported = (node: any): boolean => {
  return node.parent?.type === 'export_statement' || node.text.includes('export')
}

/**
 * Check if node is async
 */
export const isAsync = (node: any): boolean => {
  return node.text.includes('async ')
}

/**
 * Extract parameters from function node
 */
export const extractParameters = (node: any): string[] | undefined => {
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
    console.warn(`Failed to extract parameters: ${error}`)
  }
  
  return parameters.length > 0 ? parameters : undefined
}

/**
 * Extract return type from function node
 */
export const extractReturnType = (node: any): string | undefined => {
  if (!node.type.includes('function') && !node.type.includes('method')) {
    return undefined
  }
  
  try {
    const typeNode = node.namedChildren?.find((child: any) => child.type === 'type_annotation')
    if (typeNode) {
      return typeNode.text.replace(/^:\s*/, '')
    }
  } catch (error) {
    console.warn(`Failed to extract return type: ${error}`)
  }
  
  return undefined
}