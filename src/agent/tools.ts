/**
 * Agent Tools Integration
 * 
 * Provides tool definition and Google GenAI function calling bridge functionality
 * for the agent system. Contains battle-tested patterns for Zod v4 + Google GenAI integration.
 * 
 * @tested_by tests/agent/tools.test.ts (Tool definitions, function calling bridge)
 */

import { z, type ZodSchema } from 'zod/v4'
import { type FunctionDeclaration } from '@google/genai'

/**
 * Tool definition interface (Mastra-compatible)
 */
export interface ToolDefinition<TInput = any, TOutput = any> {
  id: string
  description: string
  inputSchema: ZodSchema<TInput>
  outputSchema?: ZodSchema<TOutput>
  execute: (args: { context: TInput }) => Promise<TOutput>
}

/**
 * Creates a tool definition that's compatible with the agent system
 */
export function createTool<TInput = any, TOutput = any>(
  config: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return config
}

/**
 * BATTLE-TESTED: Converts Zod v4 schema to Google GenAI Function Declaration
 * 
 * This function took multiple iterations to perfect and bridges our Zod v4 schemas
 * to the Google GenAI API format. The exact pattern works with function calling.
 * 
 * PRESERVE EXACTLY: This is the working solution for Zod v4 + Google GenAI integration
 */
export function zodToFunctionDeclaration(
  toolDef: ToolDefinition
): FunctionDeclaration {
  // Use Zod v4's native JSON schema generation
  const jsonSchema = z.toJSONSchema(toolDef.inputSchema)
  
  // Strip the $schema property for Gemini API compatibility
  const { $schema, ...cleanParameters } = jsonSchema
  
  return {
    name: toolDef.id,
    description: toolDef.description,
    parameters: cleanParameters as any // Type cast needed for Google AI SDK compatibility
  }
}

/**
 * Tool execution result for function calling
 */
export interface ToolExecutionResult {
  name: string
  response: any
  error?: string
}

/**
 * Execute a tool with validated input (battle-tested pattern)
 */
export async function executeTool(
  tool: ToolDefinition,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    // PRESERVE: This Zod validation pattern works with Google GenAI function calls
    const validatedArgs = tool.inputSchema.parse(args)
    
    // Execute tool
    const toolResult = await tool.execute({ context: validatedArgs })
    
    return {
      name: tool.id,
      response: toolResult
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      name: tool.id,
      response: { error: errorMessage },
      error: errorMessage
    }
  }
}

/**
 * Format function responses for conversation history (battle-tested pattern)
 */
export function formatFunctionResponses(responses: ToolExecutionResult[]): string {
  // PRESERVE: This exact format works with Google GenAI conversation flow
  const responseText = responses.map(fr => 
    `Function ${fr.name} result: ${JSON.stringify(fr.response)}`
  ).join('\n')
  
  return `Here are the function results:\n${responseText}\n\nBased on these results, please continue your exploration.`
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()
  
  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool)
  }
  
  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }
  
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }
  
  getFunctionDeclarations(): FunctionDeclaration[] {
    return this.getAll().map(zodToFunctionDeclaration)
  }
  
  getAllowedFunctionNames(): string[] {
    return this.getAll().map(t => t.id)
  }
}