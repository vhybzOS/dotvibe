/**
 * Core Code Analysis Toolbox with Tree-sitter
 * Pure functions with no Mastra/Gemini dependencies
 * 
 * @tested_by tests/code-analysis-tools.test.ts
 */

import { Parser, Language } from 'web-tree-sitter'
import { generateSingleEmbedding } from '../../embeddings.ts'
import { connectToDatabase } from '../../database.ts'
import { Effect, pipe } from 'effect'
import { createConfigurationError, type VibeError } from '../../index.ts'

// Types for symbol information
export interface SymbolInfo {
  name: string
  kind: string
  startLine: number
  endLine: number
}

export interface SymbolDetails {
  name: string
  kind: string
  startLine: number
  endLine: number
  content: string
  filePath: string
}

// Tree-sitter parser initialization
let parser: Parser | null = null

async function initializeParser(): Promise<Parser> {
  if (parser) return parser
  
  await Parser.init()
  parser = new Parser()
  
  // Load TypeScript language from WASM file
  // This is the correct approach for web-tree-sitter with Deno
  const wasmPath = '/home/keyvan/.cache/deno/npm/registry.npmjs.org/tree-sitter-typescript/0.23.2/tree-sitter-typescript.wasm'
  const wasmBytes = await Deno.readFile(wasmPath)
  const language = await Language.load(wasmBytes)
  parser.setLanguage(language)
  
  return parser
}

/**
 * List all files and directories in a given path
 * Returns full paths relative to current working directory for easier LLM usage
 */
export async function list_filesystem(path: string): Promise<string[]> {
  try {
    const entries: string[] = []
    const basePath = path === '.' || path === './' ? '' : path
    for await (const entry of Deno.readDir(path)) {
      // Return full path by combining directory path with entry name
      const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name
      entries.push(fullPath)
    }
    return entries.sort()
  } catch (error) {
    throw new Error(`Failed to list directory ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Read complete content of a file
 */
export async function read_file(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    throw new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * List all symbols in a TypeScript file using tree-sitter
 */
export async function list_symbols_in_file(path: string): Promise<SymbolInfo[]> {
  try {
    const content = await Deno.readTextFile(path)
    const parser = await initializeParser()
    const tree = parser.parse(content)
    
    if (!tree) {
      throw new Error('Failed to parse source code - tree is null')
    }
    
    const symbols: SymbolInfo[] = []
    
    // Walk the tree to find symbols
    function walkNode(node: any, depth = 0) {
      // Define symbol types we're interested in
      const symbolTypes = [
        'function_declaration',
        'class_declaration', 
        'interface_declaration',
        'type_alias_declaration',
        'enum_declaration',
        'variable_declaration',
        'export_statement',
        'import_statement'
      ]
      
      if (symbolTypes.includes(node.type)) {
        // Extract symbol name
        let symbolName = 'unknown'
        let symbolKind = node.type
        
        // Try to find identifier child node
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (child && child.type === 'identifier') {
            symbolName = content.slice(child.startIndex, child.endIndex)
            break
          }
          // For type aliases, look for type_identifier
          if (child && child.type === 'type_identifier') {
            symbolName = content.slice(child.startIndex, child.endIndex)
            break
          }
        }
        
        symbols.push({
          name: symbolName,
          kind: symbolKind,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        })
      }
      
      // Recursively walk children
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) {
          walkNode(child, depth + 1)
        }
      }
    }
    
    walkNode(tree.rootNode)
    return symbols
    
  } catch (error) {
    throw new Error(`Failed to parse symbols in ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get detailed information about a specific symbol in a file
 */
export async function get_symbol_details(path: string, symbolName: string): Promise<SymbolDetails> {
  try {
    const content = await Deno.readTextFile(path)
    const parser = await initializeParser()
    const tree = parser.parse(content)
    
    if (!tree) {
      throw new Error('Failed to parse source code - tree is null')
    }
    
    let foundSymbol: SymbolDetails | null = null
    
    // Helper function to find symbol name in a node
    function findSymbolInNode(node: any, targetName: string, content: string): boolean {
      // Direct identifier check
      if (node.type === 'identifier' && content.slice(node.startIndex, node.endIndex) === targetName) {
        return true
      }
      
      // Check children for identifiers
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) {
          if ((child.type === 'identifier' || child.type === 'type_identifier')) {
            const name = content.slice(child.startIndex, child.endIndex)
            if (name === targetName) {
              return true
            }
          }
          // For variable_declarator, check nested patterns
          if (child.type === 'variable_declarator') {
            if (findSymbolInNode(child, targetName, content)) {
              return true
            }
          }
        }
      }
      
      return false
    }
    
    function walkNode(node: any) {
      const symbolTypes = [
        'function_declaration',
        'class_declaration', 
        'interface_declaration',
        'type_alias_declaration',
        'enum_declaration',
        'variable_declaration',
        'export_statement',
        'lexical_declaration'
      ]
      
      if (symbolTypes.includes(node.type)) {
        // Handle export statements
        if (node.type === 'export_statement') {
          // Look for declarations inside export statement
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child && ['variable_declaration', 'lexical_declaration', 'function_declaration', 'class_declaration', 'interface_declaration', 'type_alias_declaration'].includes(child.type)) {
              const symbolInExport = findSymbolInNode(child, symbolName, content)
              if (symbolInExport) {
                foundSymbol = {
                  name: symbolName,
                  kind: child.type,
                  startLine: node.startPosition.row + 1,
                  endLine: node.endPosition.row + 1,
                  content: content.slice(node.startIndex, node.endIndex),
                  filePath: path
                }
                return
              }
            }
          }
        } else {
          // Handle regular declarations
          const symbolInNode = findSymbolInNode(node, symbolName, content)
          if (symbolInNode) {
            foundSymbol = {
              name: symbolName,
              kind: node.type,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
              content: content.slice(node.startIndex, node.endIndex),
              filePath: path
            }
            return
          }
        }
      }
      
      // Continue walking if not found
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) {
          walkNode(child)
        }
      }
    }
    
    walkNode(tree.rootNode)
    
    if (!foundSymbol) {
      throw new Error(`Symbol '${symbolName}' not found in ${path}`)
    }
    
    return foundSymbol
    
  } catch (error) {
    throw new Error(`Failed to get symbol details for '${symbolName}' in ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Create index entry with real SurrealDB integration
 */
export async function create_index_entry(data: {
  path: string
  symbolName: string
  symbolKind: string
  startLine: number
  endLine: number
  content: string
  synthesizedDescription: string
}): Promise<{ success: boolean }> {
  try {
    // Generate embedding for the synthesized description
    const embeddingResult = await Effect.runPromise(
      generateSingleEmbedding(data.synthesizedDescription)
    )
    
    // Connect to database
    const db = await connectToDatabase()
    
    // Create content hash for idempotency
    const contentHash = await crypto.subtle.digest(
      'SHA-256', 
      new TextEncoder().encode(data.content)
    )
    const hashHex = Array.from(new Uint8Array(contentHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Construct record ID for upsert
    const recordId = `${data.path}@${data.symbolName}`.replace(/[^a-zA-Z0-9@_]/g, '_')
    
    // Get symbol details to extract actual code content
    const symbolDetails = await get_symbol_details(data.path, data.symbolName)
    
    // Upsert record into code_symbols table with enhanced fields
    const query = `
      UPSERT code_symbols:⟨$record_id⟩ CONTENT {
        file_path: $file_path,
        symbol_name: $symbol_name,
        symbol_kind: $symbol_kind,
        start_line: $start_line,
        end_line: $end_line,
        content_hash: $content_hash,
        description: $description,
        code: $code,
        lines: $lines,
        embedding: $embedding
      }
    `
    
    await db.query(query, {
      record_id: recordId,
      file_path: data.path,
      symbol_name: data.symbolName,
      symbol_kind: data.symbolKind,
      start_line: data.startLine,
      end_line: data.endLine,
      content_hash: hashHex,
      description: data.synthesizedDescription,
      code: symbolDetails.content,
      lines: [symbolDetails.startLine, symbolDetails.endLine],
      embedding: embeddingResult.embedding
    })
    
    // Close database connection
    await db.close()
    
    return { success: true }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Failed to create index entry: ${errorMessage}`)
    return { success: false }
  }
}