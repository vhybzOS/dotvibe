/**
 * LLM-First Indexing Algorithm
 * 
 * Implements the proven "context-first" approach where complete codebase content (185K+ chars)
 * is passed to LLM as system instruction for immediate architectural analysis.
 * 
 * Replaces the broken 20-iteration function calling loop with single LLM call +
 * parallel processing approach that has been battle-tested in production.
 * 
 * @tested_by tests/agent/llm-first-indexing.test.ts (LLM-first approach, parallel processing)
 */

import { GoogleGenAI } from '@google/genai'
import { z } from 'zod/v4'
import { Effect, pipe } from 'effect'
import { createStorageError, type VibeError } from '../index.ts'
import { loadAgentConfig } from './models.ts'
import { createLLMClient } from './llm.ts'
import { ingestPath, type IngestResult } from '../ingest.ts'
import type { ThreadContext } from './types.ts'
import { 
  logDiscovery, logAnalysis, logProcessing, 
  storeCompletedComponent, displayCompletedComponents, clearCompletedComponents,
  debugOnly 
} from '../infra/logger.ts'
import { updateProgressDashboard as progressDashboard, type ProcessingTask } from './progress.ts'

/**
 * Component to be indexed (from LLM analysis)
 */
export interface ComponentToIndex {
  /** Component name (function, class, interface, etc.) */
  name: string
  
  /** Component kind (function_declaration, class_declaration, etc.) */
  kind: string
}

/**
 * File with components from LLM analysis
 */
export interface FileWithComponents {
  /** File path relative to project root */
  filename: string
  
  /** Components found in this file */
  components: ComponentToIndex[]
}

/**
 * LLM architectural analysis result
 */
export interface ArchitecturalAnalysis {
  /** Architectural summary from LLM */
  summary: string
  
  /** Components to index extracted from LLM response */
  componentList: FileWithComponents[]
  
  /** Total number of components found */
  totalComponents: number
  
  /** Raw LLM response for debugging */
  rawResponse: string
}

/**
 * Component processing task for parallel execution
 */
interface ComponentTask {
  /** File containing the component */
  filename: string
  
  /** Component name */
  componentName: string
  
  /** Component kind */
  componentKind: string
  
  /** Processing status */
  status: 'queued' | 'analyzing' | 'completed' | 'failed'
  
  /** Start time for this task */
  startTime?: number
  
  /** End time for this task */
  endTime?: number
  
  /** Error message if failed */
  error?: string
  
  /** Generated description if completed */
  description?: string
}

/**
 * Component schema for validation
 */
const ComponentSchema = z.object({
  name: z.string(),
  kind: z.string()
})

/**
 * File with components schema
 */
const FileWithComponentsSchema = z.object({
  filename: z.string(),
  components: z.array(ComponentSchema)
})

/**
 * Extract JSON component list from LLM response
 * 
 * Looks for ```json blocks and attempts to parse component structure
 */
export const extractComponentListFromResponse = (response: string): FileWithComponents[] => {
  try {
    // Look for ```json blocks in the response
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g
    const matches = [...response.matchAll(jsonBlockRegex)]
    
    if (matches.length === 0) {
      console.log('⚠️ No JSON blocks found in LLM response')
      return []
    }
    
    // Try to parse the first JSON block
    const jsonContent = matches[0]?.[1]?.trim()
    if (!jsonContent) {
      console.log('⚠️ Empty JSON block found')
      return []
    }
    
    const parsed = JSON.parse(jsonContent)
    
    // Validate the structure
    const componentList = z.array(FileWithComponentsSchema).parse(parsed)
    
    return componentList
    
  } catch (error) {
    console.error('❌ Failed to extract component list from LLM response:', error)
    console.log('Raw response excerpt:', response.slice(0, 500))
    return []
  }
}

/**
 * Get architectural analysis from LLM using complete codebase context
 * 
 * This is the core "LLM-first" approach - pass all 185K+ chars upfront
 */
export const getArchitecturalAnalysis = (
  ingestResult: IngestResult,
  verbose: boolean = false
): Effect.Effect<ArchitecturalAnalysis, VibeError> => {
  return Effect.tryPromise({
    try: async () => {
      debugOnly(() => {
        console.log(`🔧 [architectural] Starting architectural analysis`)
        console.log(`🔧 [architectural] Content length: ${ingestResult.content.length}`)
        console.log(`🔧 [architectural] Token estimate: ${ingestResult.tokenEstimate?.totalTokens || 0}`)
      })
      
      const config = loadAgentConfig({ requireApiKey: true, verbose })
      const genAI = new GoogleGenAI({ apiKey: config.apiKey })
      
      debugOnly(() => {
        console.log(`🔧 [architectural] Config loaded, model: ${config.model}`)
        console.log(`🔧 [architectural] API key present: ${config.apiKey ? 'YES' : 'NO'}`)
      })
      
      if (verbose) {
        logAnalysis.start()
        logDiscovery.context(ingestResult.stats.fileCount, ingestResult.tokenEstimate?.totalTokens || 0)
      }
      
      // Enhanced system instruction with full codebase context (BATTLE-TESTED PATTERN)
      const llmFirstSystemInstruction = `You are an expert programmer and system architect. I have provided you with the COMPLETE codebase below. 

${ingestResult.content}

Your task is to first provide a detailed architectural summary of this system, then return a JSON list of all components to be indexed.

First response format:
## Architectural Summary
[Detailed analysis of system architecture, component relationships, design patterns]

## Components to Index
\`\`\`json
[{"filename": "src/index.ts", "components": [{"name": "QueryData", "kind": "interface"}, {"name": "createError", "kind": "function"}]}]
\`\`\`

After this, I will systematically ask you to describe each component with full architectural context.`

      // Initial request for architectural analysis (SINGLE LLM CALL)
      debugOnly(() => {
        console.log(`🤖 [architectural] Sending LLM request for architectural analysis`)
        console.log(`🤖 [architectural] System instruction length: ${llmFirstSystemInstruction.length}`)
      })
      
      const analysisResult = await genAI.models.generateContent({
        model: config.model,
        contents: "Analyze this codebase and provide the architectural summary and JSON component list as specified.",
        config: {
          systemInstruction: llmFirstSystemInstruction
        }
      })

      debugOnly(() => {
        console.log(`🤖 [architectural] LLM response received`)
      })

      const rawResponse = analysisResult.text || ''
      
      debugOnly(() => {
        console.log(`🤖 [architectural] Raw response length: ${rawResponse.length}`)
        if (rawResponse.length === 0) {
          console.log(`⚠️ [architectural] WARNING: Empty LLM response`)
        }
      })
      
      if (verbose) {
        debugOnly(() => {
          console.log('')
          console.log('💬 LLM ARCHITECTURAL ANALYSIS:')
          console.log('='.repeat(80))
          console.log(rawResponse)
          console.log('='.repeat(80))
          console.log('')
        })
      }

      // Extract JSON component list from LLM response
      const componentList = extractComponentListFromResponse(rawResponse)
      
      // Extract architectural summary (everything before the JSON block)
      const summaryMatch = rawResponse.match(/## Architectural Summary\s*\n([\s\S]*?)(?=## Components to Index|```json|$)/)
      const summary = summaryMatch ? summaryMatch[1]?.trim() || '' : ''
      
      const totalComponents = componentList.reduce((sum, file) => sum + file.components.length, 0)
      
      if (verbose) {
        logAnalysis.complete(totalComponents)
        
        debugOnly(() => {
          console.log(`📋 Component extraction breakdown:`)
          console.log(`   - ${componentList.length} files found`)
          componentList.forEach(file => {
            console.log(`   - ${file.filename}: ${file.components.length} components`)
          })
          console.log('')
        })
      }
      
      return {
        summary,
        componentList,
        totalComponents,
        rawResponse
      } satisfies ArchitecturalAnalysis
    },
    catch: (error) => createStorageError(error, 'LLM analysis', 'Failed to get architectural analysis from LLM')
  })
}

/**
 * Convert ComponentTask to ProcessingTask for unified progress module
 */
const convertToProcessingTasks = (componentTasks: ComponentTask[]): ProcessingTask[] => {
  return componentTasks.map(task => ({
    id: `${task.filename}-${task.componentName}`,
    name: task.componentName,
    type: task.componentKind,
    filename: task.filename,
    status: task.status as ProcessingTask['status'],
    startTime: task.startTime,
    endTime: task.endTime,
    description: task.description,
    error: task.error
  }))
}

/**
 * Clear console lines for dashboard updates (Deno compatible)
 */
const clearLines = (lineCount: number) => {
  for (let i = 0; i < lineCount; i++) {
    // Deno equivalent of process.stdout.write
    Deno.stdout.writeSync(new TextEncoder().encode('\x1b[1A\x1b[2K'))
  }
}

/**
 * Process a single component with LLM analysis
 */
const processComponent = async (
  task: ComponentTask,
  fileCache: Map<string, string>,
  symbolCache: Map<string, any>,
  genAI: GoogleGenAI,
  config: any,
  codebaseContent: string
): Promise<ComponentTask> => {
  const updatedTask = { ...task }
  updatedTask.status = 'analyzing'
  updatedTask.startTime = Date.now()
  
  debugOnly(() => {
    console.log(`🔍 [processComponent] Starting analysis of ${task.componentName} in ${task.filename}`)
  })
  
  try {
    // Get cached symbol details
    const symbolKey = `${task.filename}::${task.componentName}`
    const symbolDetails = symbolCache.get(symbolKey)
    
    debugOnly(() => {
      console.log(`🗂️ [processComponent] Looking for symbol key: ${symbolKey}`)
      console.log(`🗂️ [processComponent] Symbol details found: ${symbolDetails ? 'YES' : 'NO'}`)
      if (symbolDetails) {
        console.log(`🗂️ [processComponent] Symbol details: lines ${symbolDetails.startLine}-${symbolDetails.endLine}, content length: ${symbolDetails.content?.length || 0}`)
      }
    })
    
    if (!symbolDetails) {
      debugOnly(() => {
        console.log(`❌ [processComponent] Available symbol keys:`, Array.from(symbolCache.keys()).slice(0, 5))
      })
      throw new Error(`Symbol details not found for ${task.componentName}`)
    }
    
    // Create detailed prompt for this specific component
    const componentPrompt = `Focus on this specific component in the codebase:

**Component**: ${task.componentName} (${task.componentKind})
**File**: ${task.filename}
**Lines**: ${symbolDetails.startLine}-${symbolDetails.endLine}

**Component Code**:
\`\`\`typescript
${symbolDetails.content}
\`\`\`

Provide a concise description (2-3 sentences) that explains:
1. What this component does
2. How it fits into the overall architecture
3. Any critical implementation details or patterns

Include relevant code snippets only if they're more descriptive than words.`

    // Send component analysis request
    debugOnly(() => {
      console.log(`🤖 [processComponent] Sending LLM request for ${task.componentName} (prompt length: ${componentPrompt.length})`)
    })
    
    const response = await genAI.models.generateContent({
      model: config.model,
      contents: componentPrompt,
      config: {
        systemInstruction: `You are analyzing components in this codebase:\n\n${codebaseContent}`
      }
    })
    
    const description = response.text?.trim() || 'No description generated'
    
    debugOnly(() => {
      console.log(`🤖 [processComponent] LLM response received for ${task.componentName} (description length: ${description.length})`)
    })
    
    // Generate search phrases for improved discoverability
    const { generateSearchPhrases } = await import('./llm.ts')
    const llmClient = await import('./llm.ts').then(m => m.createLLMClient({
      apiKey: config.apiKey,
      model: config.model,
      temperature: 0.3
    }))
    
    debugOnly(() => {
      console.log(`🔍 [processComponent] Generating search phrases for ${task.componentName}`)
    })
    
    const searchPhrases = await generateSearchPhrases(
      llmClient,
      task.componentName,
      task.componentKind,
      symbolDetails.content,
      description
    )
    
    debugOnly(() => {
      console.log(`🔍 [processComponent] Generated ${searchPhrases.length} search phrases for ${task.componentName}:`, searchPhrases)
    })
    
    // Create actual index entry with SurrealDB storage
    const { createIndexEntry } = await import('../core/storage.ts')
    
    debugOnly(() => {
      console.log(`💾 [processComponent] Creating index entry for ${task.componentName}`)
    })
    
    const indexResult = await Effect.runPromise(createIndexEntry({
      path: task.filename,
      symbolName: task.componentName,
      symbolKind: task.componentKind,
      startLine: symbolDetails.startLine,
      endLine: symbolDetails.endLine,
      content: symbolDetails.content,
      synthesizedDescription: description,
      searchPhrases: searchPhrases
    }))
    
    debugOnly(() => {
      console.log(`💾 [processComponent] Index entry result for ${task.componentName}: success=${indexResult.success}, recordId=${indexResult.recordId}`)
    })
    
    if (!indexResult.success) {
      throw new Error(indexResult.error || 'Failed to create index entry')
    }
    
    updatedTask.description = description
    updatedTask.status = 'completed'
    updatedTask.endTime = Date.now()
    
    debugOnly(() => {
      console.log(`✅ [processComponent] Successfully completed ${task.componentName} in ${updatedTask.endTime! - updatedTask.startTime!}ms`)
    })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    updatedTask.status = 'failed'
    updatedTask.error = errorMessage
    updatedTask.endTime = Date.now()
    
    debugOnly(() => {
      console.log(`❌ [processComponent] Failed ${task.componentName}: ${errorMessage}`)
    })
  }
  
  return updatedTask
}

/**
 * Main LLM-first indexing function
 * 
 * 1. Get complete codebase via ingestPathJSON (185K+ chars)
 * 2. Single LLM call for architectural analysis + component discovery
 * 3. Parallel processing of all components using Promise.allSettled
 */
export const runLLMFirstIndexing = (
  rootPath: string,
  verbose: boolean = false
): Effect.Effect<void, VibeError> => {
  const startTime = Date.now()
  
  // Start discovery logging
  if (verbose) {
    logDiscovery.start(rootPath)
  }
  
  return pipe(
    // Step 1: Get complete codebase content (works for both single files and directories)
    ingestPath(rootPath, {
      include: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      exclude: ['**/node_modules/**', '**/build/**', '**/dist/**'],
      outputFormat: 'markdown',
      includeTokens: true,
      tokenizer: 'cl100k'
    }),
    
    // Step 2: Get architectural analysis from LLM (SINGLE CALL)
    Effect.flatMap(ingestResult => 
      pipe(
        getArchitecturalAnalysis(ingestResult, verbose),
        Effect.map(analysis => ({ ingestResult, analysis }))
      )
    ),
    
    // Step 3: Parallel processing implementation
    Effect.flatMap(({ ingestResult, analysis }) =>
      Effect.tryPromise({
        try: async () => {
          // Clear any previous components storage
          clearCompletedComponents()
          
          if (verbose) {
            logProcessing.start(analysis.totalComponents)
          }
          
          const config = loadAgentConfig({ requireApiKey: true, verbose })
          const genAI = new GoogleGenAI({ apiKey: config.apiKey })
          
          // Phase 1: Pre-cache all file contents and symbol details (BATTLE-TESTED PATTERN)
          const fileCache = new Map<string, string>()
          const symbolCache = new Map<string, any>()
          
          debugOnly(() => {
            console.log('🗂️ Pre-caching file contents and symbol details...')
          })
          
          // Import real tree-sitter functions for caching
          const { readFileReal, getSymbolDetailsReal } = await import('./ast-discovery.ts')
          
          for (const fileEntry of analysis.componentList) {
            try {
              // Cache file content
              const fileContentResult = await Effect.runPromise(readFileReal(fileEntry.filename))
              fileCache.set(fileEntry.filename, fileContentResult)
              
              // Cache symbol details for all components in this file
              for (const component of fileEntry.components) {
                try {
                  const symbolDetailsResult = await Effect.runPromise(
                    getSymbolDetailsReal(fileEntry.filename, component.name)
                  )
                  symbolCache.set(`${fileEntry.filename}::${component.name}`, symbolDetailsResult)
                } catch (error) {
                  debugOnly(() => {
                    console.log(`⚠️ Symbol ${component.name} not found in ${fileEntry.filename}, will skip`)
                  })
                }
              }
            } catch (error) {
              console.error(`❌ Failed to cache ${fileEntry.filename}: ${error}`)
            }
          }
          
          debugOnly(() => {
            console.log(`✅ Cached ${fileCache.size} files and ${symbolCache.size} symbols`)
            console.log('')
          })
          
          // Phase 2: Create all component processing tasks
          const tasks: ComponentTask[] = []
          
          debugOnly(() => {
            console.log(`🏗️ [parallel] Creating tasks for ${analysis.componentList.length} files`)
          })
          
          for (const fileEntry of analysis.componentList) {
            debugOnly(() => {
              console.log(`🏗️ [parallel] Processing file: ${fileEntry.filename} with ${fileEntry.components.length} components`)
            })
            
            for (const component of fileEntry.components) {
              tasks.push({
                filename: fileEntry.filename,
                componentName: component.name,
                componentKind: component.kind,
                status: 'queued'
              })
            }
          }
          
          debugOnly(() => {
            console.log(`🏗️ [parallel] Created ${tasks.length} total tasks`)
            console.log(`🏗️ [parallel] Task sample:`, tasks.slice(0, 3).map(t => `${t.componentName} (${t.componentKind}) in ${t.filename}`))
          })
          
          // Phase 3: Process all components in parallel with live dashboard
          let dashboardLines = 0
          let lastUpdate = 0
          const UPDATE_INTERVAL = 2000 // Update every 2 seconds
          
          const updateDashboard = (force = false) => {
            if (!verbose) return
            
            const now = Date.now()
            if (!force && (now - lastUpdate) < UPDATE_INTERVAL) {
              return
            }
            
            if (dashboardLines > 0) {
              clearLines(dashboardLines)
            }
            progressDashboard(convertToProcessingTasks(tasks), startTime, analysis.totalComponents, force)
            
            // Calculate dashboard lines for clearing
            const recentCompletions = tasks.filter(t => t.status === 'completed').slice(-3)
            const currentlyAnalyzing = tasks.filter(t => t.status === 'analyzing').slice(0, 3)
            const failed = tasks.filter(t => t.status === 'failed').length
            
            dashboardLines = 3 // Base lines
            if (recentCompletions.length > 0) {
              dashboardLines += 1 + (recentCompletions.length * 2) + 1
            }
            if (currentlyAnalyzing.length > 0) {
              dashboardLines += 1 + currentlyAnalyzing.length + 1
            }
            if (failed > 0) {
              dashboardLines += 1
            }
            
            lastUpdate = now
          }
          
          if (verbose) {
            updateDashboard(true)
          }
          
          // Start processing with Promise.allSettled (BATTLE-TESTED PARALLEL PATTERN)
          debugOnly(() => {
            console.log(`🚀 [parallel] Starting processing of ${tasks.length} components with Promise.allSettled`)
          })
          
          const processingPromises = tasks.map(async (task, index) => {
            debugOnly(() => {
              console.log(`🚀 [parallel] Starting task ${index + 1}/${tasks.length}: ${task.componentName} (delay: ${index * 100}ms)`)
            })
            
            // Add small delay to prevent API rate limiting
            await new Promise(resolve => setTimeout(resolve, index * 100))
            
            debugOnly(() => {
              console.log(`🔄 [parallel] Delay complete for ${task.componentName}, calling processComponent`)
            })
            
            const result = await processComponent(
              task,
              fileCache,
              symbolCache,
              genAI,
              config,
              ingestResult.content
            )
            
            debugOnly(() => {
              console.log(`📊 [parallel] ProcessComponent returned for ${task.componentName}: status=${result.status}`)
            })
            
            // Update task in place for dashboard
            const taskIndex = tasks.findIndex(t => 
              t.filename === task.filename && t.componentName === task.componentName
            )
            if (taskIndex >= 0) {
              tasks[taskIndex] = result
              debugOnly(() => {
                console.log(`📊 [parallel] Updated task ${taskIndex} in tasks array for ${task.componentName}`)
              })
            }
            
            updateDashboard()
            return result
          })
          
          // Wait for all processing to complete
          debugOnly(() => {
            console.log(`⏳ [parallel] Waiting for all ${processingPromises.length} promises to settle...`)
          })
          
          const results = await Promise.allSettled(processingPromises)
          
          debugOnly(() => {
            console.log(`🏁 [parallel] All promises settled. Analyzing results...`)
            results.forEach((result, index) => {
              if (result.status === 'fulfilled') {
                console.log(`✅ [parallel] Promise ${index}: fulfilled, task status=${result.value.status}`)
              } else {
                console.log(`❌ [parallel] Promise ${index}: rejected, reason=${result.reason}`)
              }
            })
          })
          
          const successful = results.filter(r => r.status === 'fulfilled').length
          const failed = results.filter(r => r.status === 'rejected').length
          const totalTime = Date.now() - startTime
          
          debugOnly(() => {
            console.log(`📈 [parallel] Final stats: ${successful} successful, ${failed} failed, ${totalTime}ms total`)
          })
          
          if (verbose) {
            updateDashboard(true)
            
            // Use new logging system for completion
            logProcessing.complete(successful, failed, totalTime)
            
            // Display all generated descriptions like the old system
            displayCompletedComponents()
          } else {
            // Even in non-verbose mode, show completion
            logProcessing.complete(successful, failed, totalTime)
          }
        },
        catch: (error) => createStorageError(error, 'parallel processing', 'Failed to execute parallel component processing')
      })
    )
  )
}