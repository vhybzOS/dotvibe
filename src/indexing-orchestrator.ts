import { GoogleGenAI } from '@google/genai'
import { getGeminiToolDeclarations, executeTool } from './tool-registry.ts'
import type { ToolName } from './tool-registry.ts'

const MAX_ITERATIONS = 20

const SYSTEM_INSTRUCTION = `You are an expert programmer and system architect. Your goal is to deeply understand this codebase. I have provided you with a set of tools to explore the filesystem and the code's structure. Your task is to reason step-by-step, form a hypothesis about the project, and explore it until you understand the purpose of each major symbol. When you fully understand a symbol, you will call the create_index_entry tool. Begin by listing the contents of the root directory to get an overview.`

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry API calls with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === maxAttempts) {
        throw lastError
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = baseDelay * Math.pow(2, attempt - 1)
      console.log(`🔄 API call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }
  
  throw lastError!
}

/**
 * Main orchestrator function that manages LLM conversation using tool registry
 */
export async function runGuidedExploration(rootPath: string, verbose: boolean = false): Promise<void> {
  try {
    if (!verbose) {
      console.log('🚀 Starting intelligent codebase exploration...')
    }
    
    // Initialize Google AI client
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable not found')
    }
    
    const genAI = new GoogleGenAI(apiKey)
    
    // Get tool declarations from registry
    const tools = getGeminiToolDeclarations()
    if (verbose) {
      console.log(`🛠️ Loaded ${tools.length} tools from registry`)
    }
    
    // Get chat session with tools and system instruction
    const chat = genAI.chats.create({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: tools }]
    })
    if (verbose) {
      console.log('💬 Started conversation with Gemini')
    }
    
    // Send initial message to begin exploration
    const initialMessage = `Begin by exploring the codebase at '${rootPath}'.`
    if (verbose) {
      console.log(`📤 Initial message: ${initialMessage}`)
    }
    
    let response: any = await retryWithBackoff(() => chat.send(initialMessage))
    
    // Main conversation loop
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      if (verbose) {
        console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}`)
      }
      
      // Check for function calls
      const functionCalls = response.functionCalls()
      
      if (functionCalls && functionCalls.length > 0) {
        // Process each function call
        const functionResponses: Array<{ name: string; response: any }> = []
        
        for (const functionCall of functionCalls) {
          const { name, args } = functionCall
          
          if (verbose) {
            console.log(`🤖 LLM => Tool Call: ${name}(${JSON.stringify(args)})`)
          }
          
          try {
            // Execute the tool using our registry
            if (verbose) {
              console.log(`🛠️ Tool <= Executing: ${name} with args: ${JSON.stringify(args)}`)
            }
            
            const result = await executeTool(name as ToolName, args)
            
            // Format successful result as function response
            functionResponses.push({
              name,
              response: result
            })
            
            if (verbose) {
              console.log(`✅ Tool result: ${JSON.stringify(result).slice(0, 200)}${JSON.stringify(result).length > 200 ? '...' : ''}`)
            }
            
          } catch (error) {
            // Tool execution failed - report error to LLM
            const errorMessage = error instanceof Error ? error.message : String(error)
            const formattedError = `Error executing tool '${name}': ${errorMessage}`
            
            if (verbose) {
              console.log(`❌ Tool error: ${formattedError}`)
            }
            
            functionResponses.push({
              name,
              response: formattedError
            })
          }
        }
        
        // Send function responses back to LLM
        if (verbose) {
          console.log(`📤 Sending ${functionResponses.length} tool result(s) back to LLM...`)
        }
        
        response = await retryWithBackoff(() => chat.send(functionResponses))
        
      } else {
        // No function calls - LLM has finished
        const textResponse = response.text()
        if (verbose) {
          console.log(`🤖 LLM => Final response: ${textResponse}`)
        }
        
        if (!verbose) {
          console.log('✅ Codebase exploration completed')
        } else {
          console.log('\n✅ Conversation completed - LLM finished exploration')
        }
        return
      }
    }
    
    // Reached max iterations
    if (verbose) {
      console.log(`\n⚠️ Reached maximum iterations (${MAX_ITERATIONS}), stopping conversation`)
    } else {
      console.log('⚠️ Exploration stopped - reached maximum iteration limit')
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Orchestrator error: ${errorMessage}`)
    throw error
  }
}