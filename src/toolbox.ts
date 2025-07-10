import { z } from 'zod/v4'
import { Parser } from 'web-tree-sitter'
import * as TypeScript from 'tree-sitter-typescript'

// Schema definitions for our toolbox functions
export const SymbolInfoSchema = z.object({
  name: z.string(),
  kind: z.enum(['Function', 'Class', 'Variable', 'Interface', 'Type', 'Enum']),
  startLine: z.number(),
  endLine: z.number(),
  startColumn: z.number(),
  endColumn: z.number()
})

export const SymbolDetailsSchema = z.object({
  name: z.string(),
  kind: z.enum(['Function', 'Class', 'Variable', 'Interface', 'Type', 'Enum']),
  content: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  startColumn: z.number(),
  endColumn: z.number()
})

export type SymbolInfo = z.infer<typeof SymbolInfoSchema>
export type SymbolDetails = z.infer<typeof SymbolDetailsSchema>

// Global parser instance
let parser: Parser | null = null

/**
 * Initialize the tree-sitter parser with TypeScript grammar
 */
async function initializeParser(): Promise<Parser> {
  if (parser) return parser

  // Initialize tree-sitter
  await Parser.init()
  parser = new Parser()
  
  // Set TypeScript language
  parser.setLanguage(TypeScript.typescript)
  console.log('✅ Initialized tree-sitter with TypeScript grammar')
  
  return parser
}

/**
 * Lists all files and directories in a given path
 */
export async function list_filesystem(path: string): Promise<string[]> {
  const items: string[] = []
  
  try {
    for await (const entry of Deno.readDir(path)) {
      items.push(entry.name)
    }
  } catch (error) {
    throw new Error(`Failed to list directory ${path}: ${error.message}`)
  }
  
  return items.sort()
}

/**
 * Reads the content of a file
 */
export async function read_file(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    throw new Error(`Failed to read file ${path}: ${error.message}`)
  }
}

/**
 * Extract symbol information from tree-sitter node
 */
function extractSymbolInfo(node: any, sourceCode: string): SymbolInfo | null {
  // For functions, classes, etc., try to find the name node
  let nameNode = null
  let name = ''
  
  // Try different ways to get the name based on node type
  if (node.type === 'function_declaration' || node.type === 'class_declaration') {
    nameNode = node.childForFieldName('name')
  } else if (node.type === 'variable_declaration') {
    // For variable declarations, we need to look at the declarator
    const declarator = node.child(0)
    if (declarator && declarator.type === 'variable_declarator') {
      nameNode = declarator.childForFieldName('name')
    }
  } else if (node.type === 'lexical_declaration') {
    // For let/const declarations
    const declarator = node.child(1) // Skip the let/const keyword
    if (declarator && declarator.type === 'variable_declarator') {
      nameNode = declarator.childForFieldName('name')
    }
  } else if (node.type === 'interface_declaration' || node.type === 'type_alias_declaration' || node.type === 'enum_declaration') {
    nameNode = node.childForFieldName('name')
  }
  
  if (!nameNode) {
    // Try to extract name from the text directly for simpler cases
    const nodeText = sourceCode.slice(node.startIndex, node.endIndex)
    const match = nodeText.match(/(?:function|class|interface|type|enum|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/i)
    if (match && match[1]) {
      name = match[1]
    } else {
      return null
    }
  } else {
    name = sourceCode.slice(nameNode.startIndex, nameNode.endIndex)
  }

  let kind: SymbolInfo['kind'] = 'Function'

  switch (node.type) {
    case 'function_declaration':
    case 'function_expression':
    case 'arrow_function':
    case 'method_definition':
      kind = 'Function'
      break
    case 'class_declaration':
      kind = 'Class'
      break
    case 'variable_declaration':
    case 'lexical_declaration':
      kind = 'Variable'
      break
    case 'interface_declaration':
      kind = 'Interface'
      break
    case 'type_alias_declaration':
      kind = 'Type'
      break
    case 'enum_declaration':
      kind = 'Enum'
      break
    default:
      return null
  }

  return {
    name,
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column
  }
}

/**
 * Recursively find all symbols in the AST
 */
function findSymbols(node: any, sourceCode: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = []
  
  // Check if current node is a symbol we're interested in
  const symbolTypes = [
    'function_declaration',
    'function_expression', 
    'arrow_function',
    'method_definition',
    'class_declaration',
    'variable_declaration',
    'lexical_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration'
  ]
  
  if (symbolTypes.includes(node.type)) {
    const symbolInfo = extractSymbolInfo(node, sourceCode)
    if (symbolInfo) {
      symbols.push(symbolInfo)
    }
  }
  
  // Recursively process children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      symbols.push(...findSymbols(child, sourceCode))
    }
  }
  
  return symbols
}

/**
 * Lists all symbols (functions, classes, variables, etc.) in a TypeScript file
 */
export async function list_symbols_in_file(path: string): Promise<SymbolInfo[]> {
  try {
    const sourceCode = await read_file(path)
    console.log(`📄 File content length: ${sourceCode.length} characters`)
    console.log(`📄 First 100 chars: ${sourceCode.slice(0, 100)}`)
    
    const parser = await initializeParser()
    console.log('🔍 Parser initialized, attempting to parse...')
    
    const tree = parser.parse(sourceCode)
    console.log('🌳 Parse result:', tree ? 'SUCCESS' : 'FAILED')
    
    if (!tree) {
      throw new Error('Failed to parse source code into AST')
    }
    
    console.log('🌳 Root node type:', tree.rootNode?.type)
    console.log('🌳 Root node children:', tree.rootNode?.childCount)
    
    const symbols = findSymbols(tree.rootNode, sourceCode)
    console.log(`🔍 Found ${symbols.length} symbols`)
    
    return symbols
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse symbols in ${path}: ${errorMessage}`)
  }
}

/**
 * Find a specific symbol node by name
 */
function findSymbolByName(node: any, symbolName: string, sourceCode: string): any | null {
  const symbolTypes = [
    'function_declaration',
    'function_expression',
    'arrow_function', 
    'method_definition',
    'class_declaration',
    'variable_declaration',
    'lexical_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration'
  ]
  
  if (symbolTypes.includes(node.type)) {
    // Try to extract the name using the same logic as extractSymbolInfo
    const symbolInfo = extractSymbolInfo(node, sourceCode)
    if (symbolInfo && symbolInfo.name === symbolName) {
      return node
    }
  }
  
  // Recursively search children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      const found = findSymbolByName(child, symbolName, sourceCode)
      if (found) return found
    }
  }
  
  return null
}

/**
 * Gets detailed information about a specific symbol in a file
 */
export async function get_symbol_details(path: string, symbolName: string): Promise<SymbolDetails> {
  try {
    const sourceCode = await read_file(path)
    const parser = await initializeParser()
    
    const tree = parser.parse(sourceCode)
    const symbolNode = findSymbolByName(tree.rootNode, symbolName, sourceCode)
    
    if (!symbolNode) {
      throw new Error(`Symbol '${symbolName}' not found in ${path}`)
    }
    
    const symbolInfo = extractSymbolInfo(symbolNode, sourceCode)
    if (!symbolInfo) {
      throw new Error(`Could not extract info for symbol '${symbolName}' in ${path}`)
    }
    
    const content = sourceCode.slice(symbolNode.startIndex, symbolNode.endIndex)
    
    return {
      name: symbolInfo.name,
      kind: symbolInfo.kind,
      content,
      startLine: symbolInfo.startLine,
      endLine: symbolInfo.endLine,
      startColumn: symbolInfo.startColumn,
      endColumn: symbolInfo.endColumn
    }
  } catch (error) {
    throw new Error(`Failed to get symbol details for '${symbolName}' in ${path}: ${error.message}`)
  }
}

/**
 * Mock implementation of create_index_entry for Phase 1
 */
export async function create_index_entry(...args: any[]): Promise<{ success: boolean }> {
  console.log('create_index_entry called with args:', args)
  return { success: true }
}