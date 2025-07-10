/**
 * Mastra Intelligent Code Indexing Agent
 * Uses Gemini via ai-sdk with proper Mastra patterns and Zod v4 schemas
 * 
 * @tested_by tests/indexing-agent.test.ts
 */

import { google } from '@ai-sdk/google'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod/v4'
import {
  list_filesystem,
  read_file,
  list_symbols_in_file,
  get_symbol_details,
  create_index_entry
} from '../tools/code_analysis_tools.ts'

const systemInstruction = `You are an expert programmer and system architect. Your goal is to deeply understand this codebase. I have provided you with a set of tools to explore the filesystem and the code's structure. Your task is to reason step-by-step, form a hypothesis about the project, and explore it until you understand the purpose of each major symbol. When you fully understand a symbol, you MUST call the create_index_entry tool. Your description should be concise and include critical code snippets where they are more descriptive than words. Begin by listing the contents of the root directory.`

// Create tools using Mastra patterns
const listFilesystemTool = createTool({
  id: "list_filesystem",
  description: "Lists all files and directories in a given path",
  inputSchema: z.object({
    path: z.string().describe("The directory path to list contents from")
  }),
  outputSchema: z.array(z.string()),
  execute: async ({ context: { path } }) => {
    return await list_filesystem(path)
  }
})

const readFileTool = createTool({
  id: "read_file",
  description: "Reads the complete content of a file",
  inputSchema: z.object({
    path: z.string().describe("The file path to read")
  }),
  outputSchema: z.string(),
  execute: async ({ context: { path } }) => {
    return await read_file(path)
  }
})

const listSymbolsTool = createTool({
  id: "list_symbols_in_file",
  description: "Lists all symbols (functions, classes, variables, interfaces, types, enums) in a TypeScript file using tree-sitter parsing",
  inputSchema: z.object({
    path: z.string().describe("The TypeScript file path to parse for symbols")
  }),
  outputSchema: z.array(z.object({
    name: z.string(),
    kind: z.string(),
    startLine: z.number(),
    endLine: z.number()
  })),
  execute: async ({ context: { path } }) => {
    return await list_symbols_in_file(path)
  }
})

const getSymbolDetailsTool = createTool({
  id: "get_symbol_details",
  description: "Gets detailed information about a specific symbol in a file, including its full content and location",
  inputSchema: z.object({
    path: z.string().describe("The file path containing the symbol"),
    symbolName: z.string().describe("The name of the symbol to get details for")
  }),
  outputSchema: z.object({
    name: z.string(),
    kind: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    content: z.string(),
    filePath: z.string()
  }),
  execute: async ({ context: { path, symbolName } }) => {
    return await get_symbol_details(path, symbolName)
  }
})

const createIndexEntryTool = createTool({
  id: "create_index_entry",
  description: "Creates an index entry for a code element with synthesized description and embeddings",
  inputSchema: z.object({
    path: z.string().describe("File path containing the symbol"),
    symbolName: z.string().describe("Name of the symbol"),
    symbolKind: z.string().describe("Kind of symbol (function, class, etc.)"),
    startLine: z.number().describe("Starting line number"),
    endLine: z.number().describe("Ending line number"),
    content: z.string().describe("Full content of the symbol"),
    synthesizedDescription: z.string().describe("Concise description with critical code snippets")
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  execute: async ({ context }) => {
    return await create_index_entry(context)
  }
})

// Create the indexing agent
const indexingAgent = new Agent({
  name: "Code Indexing Agent",
  instructions: systemInstruction,
  model: google("gemini-2.5-flash"),
  tools: {
    listFilesystemTool,
    readFileTool,
    listSymbolsTool,
    getSymbolDetailsTool,
    createIndexEntryTool
  }
})

/**
 * Run guided exploration of codebase using Mastra agent
 */
export async function runGuidedExploration(rootPath: string, verbose: boolean = false): Promise<void> {
  try {
    if (!verbose) {
      console.log('🚀 Starting intelligent codebase exploration with Mastra...')
    }

    // Check API key
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable not found')
    }

    if (verbose) {
      console.log('🛠️ Loaded 5 tools for Mastra agent')
      console.log('💬 Starting conversation with Gemini via Mastra')
    }

    // Execute the agent with initial exploration prompt
    const result = await indexingAgent.generate(`Begin by exploring the codebase at '${rootPath}'.`)

    if (verbose) {
      console.log(`🤖 Final LLM Response: ${result.text}`)
      console.log('\n✅ Mastra conversation completed - codebase exploration finished')
    } else {
      console.log('✅ Intelligent codebase exploration completed')
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Mastra agent error: ${errorMessage}`)
    throw error
  }
}