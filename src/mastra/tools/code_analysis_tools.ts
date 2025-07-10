/**
 * Core Code Analysis Toolbox with Tree-sitter
 * Pure functions with no Mastra/Gemini dependencies
 * 
 * @tested_by tests/code-analysis-tools.test.ts
 */

import { Parser } from 'web-tree-sitter'
import * as TypeScript from 'tree-sitter-typescript'
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
  parser.setLanguage(TypeScript.typescript)
  return parser
}

/**
 * List all files and directories in a given path
 */
export async function list_filesystem(path: string): Promise<string[]> {
  try {
    const entries: string[] = []
    for await (const entry of Deno.readDir(path)) {
      entries.push(entry.name)
    }
    return entries.sort()
  } catch (error) {
    throw new Error(`Failed to list directory ${path}: ${error.message}`)
  }
}

/**
 * Read complete content of a file
 */
export async function read_file(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    throw new Error(`Failed to read file ${path}: ${error.message}`)
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
    throw new Error(`Failed to parse symbols in ${path}: ${error.message}`)
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
    
    let foundSymbol: SymbolDetails | null = null
    
    function walkNode(node: any) {
      const symbolTypes = [
        'function_declaration',
        'class_declaration', 
        'interface_declaration',
        'type_alias_declaration',
        'enum_declaration',
        'variable_declaration'
      ]
      
      if (symbolTypes.includes(node.type)) {
        // Check if this node contains our target symbol
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (child && (child.type === 'identifier' || child.type === 'type_identifier')) {
            const name = content.slice(child.startIndex, child.endIndex)
            if (name === symbolName) {
              // Extract the full content of this symbol
              const symbolContent = content.slice(node.startIndex, node.endIndex)
              
              foundSymbol = {
                name: symbolName,
                kind: node.type,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                content: symbolContent,
                filePath: path
              }
              return
            }
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
    throw new Error(`Failed to get symbol details for '${symbolName}' in ${path}: ${error.message}`)
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
    
    // Upsert record into code_symbols table
    const query = `
      UPSERT $id CONTENT {
        id: $id,
        file_path: $file_path,
        symbol_name: $symbol_name,
        symbol_kind: $symbol_kind,
        start_line: $start_line,
        end_line: $end_line,
        content_hash: $content_hash,
        description: $description,
        embedding: $embedding
      }
    `
    
    await db.query(query, {
      id: `code_symbols:${recordId}`,
      file_path: data.path,
      symbol_name: data.symbolName,
      symbol_kind: data.symbolKind,
      start_line: data.startLine,
      end_line: data.endLine,
      content_hash: hashHex,
      description: data.synthesizedDescription,
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