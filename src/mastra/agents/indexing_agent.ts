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
    // Enhanced logging for digest
    const digestLines = codebaseDigest.split('\n').length
    const digestChars = codebaseDigest.length
    
    if (verbose) {
      console.log(`📊 Codebase digest prepared: ${digestLines} lines, ${digestChars} characters`)
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
      console.log('')
      console.log('💬 LLM ARCHITECTURAL ANALYSIS:')
      console.log('='.repeat(80))
      console.log(analysisResult.text || 'No analysis provided')
      console.log('='.repeat(80))
      console.log('')
    }

    // Extract JSON component list from LLM response
    const componentList = extractComponentListFromResponse(analysisResult.text || '')
    
    if (verbose) {
      console.log(`📋 Component extraction result:`)
      console.log(`   - ${componentList.length} files found`)
      const totalComponents = componentList.reduce((sum, file) => sum + file.components.length, 0)
      console.log(`   - ${totalComponents} total components to index`)
      
      // Show breakdown by file
      componentList.forEach(file => {
        console.log(`   - ${file.filename}: ${file.components.length} components`)
      })
      console.log('')
    }

    // Systematic component indexing with progress tracking and API key
    await indexComponentsSystematically(componentList, rootPath, verbose, apiKey)

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
    if (!jsonText) {
      console.warn('⚠️ Empty JSON content in LLM response')
      return []
    }
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
 * Get LLM description for a specific component with architectural context
 */
async function getLLMComponentDescription(
  componentName: string,
  componentKind: string,
  fileContent: string,
  filePath: string,
  apiKey: string,
  verbose: boolean
): Promise<string> {
  try {
    const genAI = new GoogleGenAI({ apiKey })
    
    const prompt = `Describe to a potent coder LLM what this element "${componentName}" is. The coder sees the full code below. Your description provides additional context, e.g. where else this block is used and what role it plays in the overall architecture. Just provide the description in your answer.

File: ${filePath}
Element: ${componentName} (${componentKind})

Code:
${fileContent}`

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    })

    const description = result.text || `${componentName} (${componentKind}): AI-generated description unavailable`
    
    if (verbose) {
      console.log(`💬 LLM description (${description.length} chars): "${description.slice(0, 100)}${description.length > 100 ? '...' : ''}"`)
    }
    
    return description

  } catch (error) {
    const fallbackDescription = `${componentName} (${componentKind}): Error generating AI description - ${error instanceof Error ? error.message : String(error)}`
    if (verbose) {
      console.log(`⚠️ LLM description failed, using fallback`)
    }
    return fallbackDescription
  }
}

/**
 * Live progress dashboard utilities for parallel processing
 */
interface ComponentTask {
  filename: string
  componentName: string
  componentKind: string
  status: 'queued' | 'analyzing' | 'completed' | 'failed'
  startTime?: number
  description?: string
  error?: string
}

function clearLines(count: number) {
  for (let i = 0; i < count; i++) {
    Deno.stdout.writeSync(new TextEncoder().encode('\x1b[1A\x1b[2K')) // Move up and clear line
  }
}

function updateProgressDashboard(tasks: ComponentTask[], startTime: number, totalComponents: number, force = false) {
  const now = Date.now()
  const elapsed = (now - startTime) / 1000
  
  const completed = tasks.filter(t => t.status === 'completed').length
  const analyzing = tasks.filter(t => t.status === 'analyzing').length
  const failed = tasks.filter(t => t.status === 'failed').length
  const queued = tasks.filter(t => t.status === 'queued').length
  
  // Calculate performance metrics
  const completionRate = elapsed > 0 ? completed / elapsed : 0 // components per second
  const eta = (queued + analyzing) > 0 && completionRate > 0 ? ((queued + analyzing) / completionRate) : 0
  const componentsPerMin = completionRate * 60
  
  // Show recent completions (last 3)
  const recentCompletions = tasks
    .filter(t => t.status === 'completed')
    .slice(-3)
    .reverse()
  
  const currentlyAnalyzing = tasks.filter(t => t.status === 'analyzing').slice(0, 3)
  
  console.log(`🔄 Parallel Processing: ${totalComponents} components`)
  console.log('')
  
  // Recent completions with improved formatting
  if (recentCompletions.length > 0) {
    console.log('📁 Recently completed:')
    recentCompletions.forEach(task => {
      // Move description to next line with full width (80 chars max)
      const shortDesc = task.description ? task.description.slice(0, 80) + (task.description.length > 80 ? '...' : '') : 'Description generated'
      console.log(`✅ ${task.filename}::${task.componentName}`)
      console.log(`   "${shortDesc}"`)
    })
    console.log('')
  }
  
  // Currently analyzing
  if (currentlyAnalyzing.length > 0) {
    console.log('🤖 Currently analyzing:')
    currentlyAnalyzing.forEach(task => {
      const duration = task.startTime ? ((now - task.startTime) / 1000).toFixed(1) + 's' : 'starting...'
      console.log(`🤖 ${task.filename}::${task.componentName} (${task.componentKind}) ${duration}`)
    })
    console.log('')
  }
  
  // Progress summary
  const percentage = ((completed / totalComponents) * 100).toFixed(1)
  const etaStr = eta > 60 ? `${Math.ceil(eta / 60)}m ${Math.ceil(eta % 60)}s` : `${Math.ceil(eta)}s`
  
  console.log(`⚡ ${componentsPerMin.toFixed(1)} components/min | ETA: ${etaStr} | ✅ ${completed}/${totalComponents} (${percentage}%) | 🤖 ${analyzing} active | ⏳ ${queued} queued`)
  
  if (failed > 0) {
    console.log(`❌ ${failed} failed`)
  }
}

/**
 * Revolutionary parallel component indexing with live progress dashboard
 */
async function indexComponentsSystematically(
  componentList: Array<{filename: string, components: Array<{name: string, kind: string}>}>, 
  rootPath: string, 
  verbose: boolean,
  apiKey: string
): Promise<void> {
  const totalComponents = componentList.reduce((sum, file) => sum + file.components.length, 0)
  const startTime = Date.now()
  
  if (verbose) {
    console.log(`🚀 PARALLEL PROCESSING INITIATED`)
    console.log(`📊 Preparing ${totalComponents} components for simultaneous LLM analysis...`)
    console.log('')
  }

  // Phase 1: Pre-cache all file contents and symbol details
  const fileCache = new Map<string, string>()
  const symbolCache = new Map<string, any>()
  
  if (verbose) {
    console.log('🗂️ Pre-caching file contents and symbol details...')
  }
  
  for (const fileEntry of componentList) {
    try {
      // Cache file content
      const fileContent = await read_file(fileEntry.filename)
      fileCache.set(fileEntry.filename, fileContent)
      
      // Cache symbol details for all components in this file
      for (const component of fileEntry.components) {
        try {
          const symbolDetails = await get_symbol_details(fileEntry.filename, component.name)
          symbolCache.set(`${fileEntry.filename}::${component.name}`, symbolDetails)
        } catch (error) {
          if (verbose) {
            console.log(`⚠️ Symbol ${component.name} not found in ${fileEntry.filename}, will skip`)
          }
        }
      }
    } catch (error) {
      console.error(`❌ Failed to cache ${fileEntry.filename}: ${error}`)
    }
  }
  
  if (verbose) {
    console.log(`✅ Cached ${fileCache.size} files and ${symbolCache.size} symbols`)
    console.log('')
  }

  // Phase 2: Create all component processing tasks
  const tasks: ComponentTask[] = []
  
  for (const fileEntry of componentList) {
    for (const component of fileEntry.components) {
      tasks.push({
        filename: fileEntry.filename,
        componentName: component.name,
        componentKind: component.kind,
        status: 'queued'
      })
    }
  }

  // Phase 3: Process all components in parallel with live dashboard
  let dashboardLines = 0
  let lastUpdate = 0
  const UPDATE_INTERVAL = 2000 // Update every 2 seconds to reduce spam
  
  const updateDashboard = (force = false) => {
    if (!verbose) return
    
    const now = Date.now()
    if (!force && (now - lastUpdate) < UPDATE_INTERVAL) {
      return // Rate limit updates
    }
    
    if (dashboardLines > 0) {
      clearLines(dashboardLines)
    }
    updateProgressDashboard(tasks, startTime, totalComponents, force)
    
    // Calculate actual lines printed (more accurate counting)
    const recentCompletions = tasks.filter(t => t.status === 'completed').slice(-3)
    const currentlyAnalyzing = tasks.filter(t => t.status === 'analyzing').slice(0, 3)
    const failed = tasks.filter(t => t.status === 'failed').length
    
    dashboardLines = 3 // Base: title + empty line + final stats
    
    if (recentCompletions.length > 0) {
      dashboardLines += 1 // "Recently completed:" header
      dashboardLines += recentCompletions.length * 2 // Each completion = 2 lines (name + description)
      dashboardLines += 1 // Empty line after completions
    }
    
    if (currentlyAnalyzing.length > 0) {
      dashboardLines += 1 // "Currently analyzing:" header  
      dashboardLines += currentlyAnalyzing.length // Each analysis = 1 line
      dashboardLines += 1 // Empty line after analyzing
    }
    
    if (failed > 0) {
      dashboardLines += 1 // Failed line
    }
    
    lastUpdate = now
  }
  
  if (verbose) {
    updateDashboard(true)
  }
  
  // Periodic dashboard updates
  const dashboardInterval = verbose ? setInterval(() => {
    updateDashboard(false)
  }, UPDATE_INTERVAL) : null

  // Create promises for all components
  const componentPromises = tasks.map(async (task, index) => {
    const fileContent = fileCache.get(task.filename)
    const symbolDetails = symbolCache.get(`${task.filename}::${task.componentName}`)
    
    if (!fileContent || !symbolDetails) {
      task.status = 'failed'
      task.error = 'Missing cached data'
      if (verbose) updateDashboard()
      return
    }

    try {
      // Mark as analyzing
      task.status = 'analyzing'
      task.startTime = Date.now()
      
      // Get LLM description with cached file content
      const llmDescription = await getLLMComponentDescription(
        task.componentName,
        task.componentKind,
        fileContent,
        task.filename,
        apiKey,
        false // Don't show individual verbose logs
      )
      
      // Create index entry
      const indexResult = await create_index_entry({
        path: task.filename,
        symbolName: task.componentName,
        symbolKind: task.componentKind,
        startLine: symbolDetails.startLine,
        endLine: symbolDetails.endLine,
        content: symbolDetails.content,
        synthesizedDescription: llmDescription
      })

      if (indexResult.success) {
        task.status = 'completed'
        task.description = llmDescription // Store full description for final report
      } else {
        task.status = 'failed'
        task.error = 'Database storage failed'
      }
      
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : String(error)
    }
  })

  // Wait for all components to complete
  await Promise.allSettled(componentPromises)
  
  // Clean up interval
  if (dashboardInterval) {
    clearInterval(dashboardInterval)
  }
  
  // Final results
  const completed = tasks.filter(t => t.status === 'completed').length
  const failed = tasks.filter(t => t.status === 'failed').length
  const totalTime = (Date.now() - startTime) / 1000
  const avgSpeed = totalTime > 0 ? (completed / totalTime * 60) : 0
  
  if (verbose) {
    // Clear dynamic dashboard but leave a final summary with recently completed
    if (dashboardLines > 0) {
      clearLines(dashboardLines)
    }
    
    // Show ALL completed components for permanent reference
    const finalRecentCompletions = tasks
      .filter(t => t.status === 'completed')
      .reverse() // Show most recent first, but show ALL completed
    
    if (finalRecentCompletions.length > 0) {
      console.log('📁 Final completed components:')
      finalRecentCompletions.forEach((task, index) => {
        // Show FULL description in final report (no truncation)
        const fullDesc = task.description || 'Description generated'
        console.log(`✅ ${task.filename}::${task.componentName}`)
        console.log('   ---')
        
        // Format multiline description with proper indentation and word wrapping
        // Split on newlines first, then word wrap long lines
        const paragraphs = fullDesc.split('\n')
        paragraphs.forEach(paragraph => {
          if (paragraph.trim() === '') {
            console.log('   ') // Empty line
          } else {
            // Word wrap long lines to reasonable width (100 chars)
            const words = paragraph.split(' ')
            let currentLine = '   '
            
            words.forEach(word => {
              if (currentLine.length + word.length + 1 > 103) { // 100 + 3 for indent
                console.log(currentLine)
                currentLine = `   ${word}`
              } else {
                currentLine += (currentLine === '   ' ? word : ` ${word}`)
              }
            })
            
            if (currentLine.trim() !== '') {
              console.log(currentLine)
            }
          }
        })
        console.log('   ---')
        console.log('') // Empty line between components for readability
      })
    }
    
    console.log('🎉 PARALLEL PROCESSING COMPLETE!')
    console.log(`📊 Results: ${completed}/${totalComponents} components indexed successfully`)
    if (failed > 0) {
      console.log(`❌ Failed: ${failed} components`)
      // Show failed components
      const failedTasks = tasks.filter(t => t.status === 'failed')
      failedTasks.forEach(task => {
        console.log(`   - ${task.filename}::${task.componentName}: ${task.error}`)
      })
    }
    console.log(`⚡ Performance: ${avgSpeed.toFixed(1)} components/min`)
    console.log(`⏱️ Total time: ${totalTime.toFixed(1)}s`)
    console.log(`🗄️ Database: All components stored with code blocks and architectural context`)
  } else {
    console.log(`✅ Indexing complete - ${completed} components stored`)
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