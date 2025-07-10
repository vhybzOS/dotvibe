/**
 * Mastra Intelligent Code Indexing Agent
 * Uses Gemini via ai-sdk with proper Mastra patterns and Zod v4 schemas
 * 
 * @tested_by tests/indexing-agent.test.ts
 */

import { z } from 'zod/v4'
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration, Type } from '@google/genai'
import { createTool, zodToFunctionDeclaration } from '../tools/tool-definition.ts'
import {
  list_filesystem,
  read_file,
  list_symbols_in_file,
  get_symbol_details,
  create_index_entry
} from '../tools/code_analysis_tools.ts'

const systemInstruction = `You are an expert programmer and system architect. Your goal is to deeply understand this codebase. I have provided you with a set of tools to explore the filesystem and the code's structure. 

The list_filesystem tool returns full file paths that you can directly use with read_file and other tools - no path manipulation needed.

Your task is to reason step-by-step, form a hypothesis about the project, and explore it until you understand the purpose of each major symbol. When you fully understand a symbol, you MUST call the create_index_entry tool with a concise description that includes critical code snippets where they are more descriptive than words. 

Begin by listing the contents of the root directory to get an overview.`

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

// Tool registry for hybrid orchestrator
const tools = [
  listFilesystemTool,
  readFileTool,
  listSymbolsTool,
  getSymbolDetailsTool,
  createIndexEntryTool
];

/**
 * LLM-First Contextual Indexing - Revolutionary Architecture Upgrade
 * Provides complete codebase context upfront → architectural analysis → systematic component indexing
 */
export async function runLLMFirstIndexing(rootPath: string, codebaseDigest: string, verbose: boolean = false): Promise<void> {
  try {
    if (verbose) {
      console.log('💬 LLM Architectural Analysis...')
    }

    // Check API key
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable not found')
    }

    // Initialize Google AI SDK
    const genAI = new GoogleGenAI({ apiKey })
    
    // Enhanced system instruction with full codebase context
    const llmFirstSystemInstruction = `You are an expert programmer and system architect. I have provided you with the COMPLETE codebase below. 

${codebaseDigest}

Your task is to first provide a detailed architectural summary of this system, then return a JSON list of all components to be indexed.

First response format:
## Architectural Summary
[Detailed analysis of system architecture, component relationships, design patterns]

## Components to Index
\`\`\`json
[{"filename": "src/index.ts", "components": [{"name": "QueryData", "kind": "interface"}, {"name": "createError", "kind": "function"}]}]
\`\`\`

After this, I will systematically ask you to describe each component with full architectural context.`

    // Initial request for architectural analysis
    const analysisResult = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Analyze this codebase and provide the architectural summary and JSON component list as specified.",
      config: {
        systemInstruction: llmFirstSystemInstruction
      }
    })

    if (verbose) {
      console.log(`📋 LLM provided architectural analysis (${analysisResult.text?.length || 0} chars)`)
    }

    // Extract JSON component list from LLM response
    const componentList = extractComponentListFromResponse(analysisResult.text || '')
    
    if (verbose) {
      console.log(`📋 Extracted ${componentList.length} components for indexing`)
    }

    // Systematic component indexing with progress tracking
    await indexComponentsSystematically(componentList, rootPath, verbose)

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ LLM-First indexing error: ${errorMessage}`)
    throw error
  }
}

/**
 * Extract JSON component list from LLM response
 */
function extractComponentListFromResponse(response: string): Array<{filename: string, components: Array<{name: string, kind: string}>}> {
  try {
    // Look for JSON code block in the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    if (!jsonMatch) {
      console.warn('⚠️ No JSON component list found in LLM response')
      return []
    }

    const jsonText = jsonMatch[1]
    const componentList = JSON.parse(jsonText)
    
    // Validate the structure
    if (!Array.isArray(componentList)) {
      throw new Error('Component list is not an array')
    }

    return componentList

  } catch (error) {
    console.error('❌ Failed to extract component list from LLM response:', error)
    return []
  }
}

/**
 * Systematically index components with progress tracking
 */
async function indexComponentsSystematically(
  componentList: Array<{filename: string, components: Array<{name: string, kind: string}>}>, 
  rootPath: string, 
  verbose: boolean
): Promise<void> {
  // Flatten component list for progress tracking
  const allComponents = componentList.flatMap(file => 
    file.components.map(comp => ({
      filename: file.filename,
      name: comp.name,
      kind: comp.kind
    }))
  )

  const totalComponents = allComponents.length
  let indexed = 0

  if (verbose) {
    console.log(`🔄 Starting systematic indexing of ${totalComponents} components...`)
  }

  for (const component of allComponents) {
    try {
      // Progress tracking with console overwrite
      indexed++
      if (verbose) {
        process.stdout.write(`\r📊 Indexing: ${indexed}/${totalComponents} (${component.name})`)
      }

      // Get symbol details using existing tools
      const symbolDetails = await get_symbol_details(component.filename, component.name)
      
      // Create index entry with enhanced architectural context
      const indexResult = await create_index_entry({
        path: component.filename,
        symbolName: component.name,
        symbolKind: component.kind,
        startLine: symbolDetails.startLine,
        endLine: symbolDetails.endLine,
        content: symbolDetails.content,
        synthesizedDescription: `${component.name} (${component.kind}): Architectural component from LLM-first analysis of complete system context.`
      })

      if (verbose && !indexResult.success) {
        console.log(`\n⚠️ Failed to index ${component.name}`)
      }

    } catch (error) {
      if (verbose) {
        console.log(`\n❌ Error indexing ${component.name}: ${error}`)
      }
    }
  }

  if (verbose) {
    process.stdout.write(`\n✅ Indexing complete - ${indexed} components stored\n`)
  } else {
    console.log(`✅ Indexing complete - ${indexed} components stored`)
  }
}

/**
 * Run guided exploration of codebase using hybrid orchestrator (Legacy)
 */
export async function runGuidedExploration(rootPath: string, verbose: boolean = false): Promise<void> {
  try {
    if (verbose) {
      console.log('🚀 Starting intelligent codebase exploration with hybrid orchestrator...')
      console.log('🛠️ Loaded 5 tools for AI agent')
      console.log('💬 Starting conversation with Gemini via Google AI SDK')
    } else {
      console.log('🚀 Starting intelligent codebase exploration...')
    }

    // Check API key
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable not found')
    }

    // --- HYBRID ORCHESTRATOR IMPLEMENTATION ---
    // NOTE: The following manual orchestration loop replaces the Mastra agent.run()
    // due to a Zod v4 dependency conflict in the current version of Mastra.
    // TODO_MASTRA_UPGRADE: When Mastra supports Zod v4, this entire block
    // can be deleted and replaced with the original line:
    // const result = await indexingAgent.generate(`Begin by exploring the codebase at '${rootPath}'.`)

    // Initialize Google AI SDK
    const genAI = new GoogleGenAI({ apiKey })
    
    // Convert our tools to Google AI function declarations
    const functionDeclarations = tools.map(zodToFunctionDeclaration)
    
    if (verbose) {
      console.log(`🔧 Registered ${functionDeclarations.length} tools with Gemini`)
    }

    // Initialize base configuration for Google AI SDK v1.9.0
    const baseConfig = {
      model: "gemini-2.5-flash",
      config: {
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: tools.map(t => t.id)
          }
        },
        tools: [{ functionDeclarations }],
        systemInstruction: systemInstruction
      }
    }
    // Maintain conversation history for context
    const conversationHistory = [
      `Begin by exploring the codebase at '${rootPath}'.`
    ]
    
    if (verbose) {
      console.log(`💬 Starting conversation with: "${conversationHistory[0]}"`)
    }

    const MAX_ITERATIONS = 20
    let iteration = 0

    while (iteration < MAX_ITERATIONS) {
      iteration++
      
      if (verbose) {
        console.log(`\n--- Iteration ${iteration}/${MAX_ITERATIONS} ---`)
        console.log(`💬 Conversation has ${conversationHistory.length} messages`)
        console.log(`📤 Latest message: "${conversationHistory[conversationHistory.length - 1].slice(0, 150)}${conversationHistory[conversationHistory.length - 1].length > 150 ? '...' : ''}"`)
      }

      // Send FULL conversation history to maintain context
      const result = await genAI.models.generateContent({
        ...baseConfig,
        contents: conversationHistory.join('\n\n---\n\n')
      })
      
      if (verbose && result.text) {
        console.log(`💬 LLM Response: "${result.text.slice(0, 200)}${result.text.length > 200 ? '...' : ''}"`)
      }
      
      const functionCalls = result.functionCalls

      if (!functionCalls || functionCalls.length === 0) {
        // No function calls - agent has finished
        if (verbose) {
          console.log(`🤖 Final LLM Response: ${result.text || 'No text response'}`)
        }
        break
      }

      // Execute function calls
      const functionResponses = []
      
      for (const functionCall of functionCalls) {
        const toolName = functionCall.name
        const args = functionCall.args || {}
        
        if (verbose) {
          console.log(`🤖 LLM => Tool Call: ${toolName}(${JSON.stringify(args)})`)
        }

        // Find and execute the tool
        const tool = tools.find(t => t.id === toolName)
        if (!tool) {
          const errorResponse = { error: `Tool '${toolName}' not found` }
          functionResponses.push({
            name: toolName,
            response: errorResponse
          })
          if (verbose) {
            console.log(`❌ Tool not found: ${toolName}`)
          }
          continue
        }

        try {
          // Validate input with Zod schema
          const validatedArgs = tool.inputSchema.parse(args)
          
          // Execute tool
          const toolResult = await tool.execute({ context: validatedArgs })
          
          functionResponses.push({
            name: toolName,
            response: toolResult
          })
          
          if (verbose) {
            console.log(`✅ Tool executed successfully: ${toolName}`)
            // Show result preview for key operations
            if (toolName === 'list_symbols_in_file' && Array.isArray(toolResult)) {
              console.log(`📋 Found symbols: ${JSON.stringify(toolResult.map(s => `${s.name} (${s.kind})`), null, 2)}`)
            } else if (toolName === 'create_index_entry') {
              console.log(`💾 Indexed: ${args.symbolName} (${args.symbolKind})`)
            } else if (toolName === 'list_filesystem' && Array.isArray(toolResult)) {
              console.log(`📁 Found ${toolResult.length} items: [${toolResult.slice(0, 3).join(', ')}${toolResult.length > 3 ? '...' : ''}]`)
            }
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          const errorResponse = { error: errorMessage }
          functionResponses.push({
            name: toolName,
            response: errorResponse
          })
          if (verbose) {
            console.log(`❌ Tool execution failed: ${toolName} - ${errorMessage}`)
          }
        }
      }

      // Add function responses to conversation history
      if (verbose) {
        console.log(`📤 Adding ${functionResponses.length} function responses to conversation history...`)
      }
      
      // Format function responses and add to conversation
      const responseText = functionResponses.map(fr => 
        `Function ${fr.name} result: ${JSON.stringify(fr.response)}`
      ).join('\n')
      
      const nextMessage = `Here are the function results:\n${responseText}\n\nBased on these results, please continue your exploration.`
      conversationHistory.push(nextMessage)
      
      if (verbose) {
        console.log(`💾 Conversation history now has ${conversationHistory.length} messages (${conversationHistory.join('').length} chars total)`)
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.log(`⚠️ Reached maximum iterations (${MAX_ITERATIONS})`)
    }

    if (verbose) {
      console.log('\n✅ Intelligent codebase exploration completed')
    } else {
      console.log('✅ Intelligent codebase exploration completed')
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Hybrid orchestrator error: ${errorMessage}`)
    throw error
  }
}