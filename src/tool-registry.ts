import { z } from 'zod/v4'
import {
  list_filesystem,
  read_file,
  list_symbols_in_file,
  get_symbol_details,
  create_index_entry,
  SymbolInfoSchema,
  SymbolDetailsSchema
} from './toolbox.ts'

// Define parameter schemas for each tool
export const toolSchemas = {
  list_filesystem: {
    description: 'Lists all files and directories in a given path.',
    parameters: z.object({
      path: z.string().describe('The directory path to list contents from')
    })
  },
  
  read_file: {
    description: 'Reads the complete content of a file.',
    parameters: z.object({
      path: z.string().describe('The file path to read')
    })
  },
  
  list_symbols_in_file: {
    description: 'Lists all symbols (functions, classes, variables, interfaces, types, enums) in a TypeScript file using tree-sitter parsing.',
    parameters: z.object({
      path: z.string().describe('The TypeScript file path to parse for symbols')
    })
  },
  
  get_symbol_details: {
    description: 'Gets detailed information about a specific symbol in a file, including its full content and location.',
    parameters: z.object({
      path: z.string().describe('The file path containing the symbol'),
      symbolName: z.string().describe('The name of the symbol to get details for')
    })
  },
  
  create_index_entry: {
    description: 'Creates an index entry for a code element (mock implementation for Phase 1).',
    parameters: z.object({
      data: z.any().describe('The data to index (flexible schema for Phase 1)')
    })
  }
} as const

// Define return schemas for each tool
export const toolReturnSchemas = {
  list_filesystem: z.array(z.string()),
  read_file: z.string(),
  list_symbols_in_file: z.array(SymbolInfoSchema),
  get_symbol_details: SymbolDetailsSchema,
  create_index_entry: z.object({ success: z.boolean() })
} as const

// Map tool names to their implementations
export const toolImplementations = {
  list_filesystem,
  read_file,
  list_symbols_in_file,
  get_symbol_details,
  create_index_entry
} as const

// Type for tool names
export type ToolName = keyof typeof toolSchemas

// Type for tool parameters
export type ToolParameters<T extends ToolName> = z.infer<typeof toolSchemas[T]['parameters']>

// Type for tool return values
export type ToolReturnValue<T extends ToolName> = z.infer<typeof toolReturnSchemas[T]>

/**
 * Executes a tool with validated parameters
 */
export async function executeTool<T extends ToolName>(
  name: T,
  args: unknown
): Promise<ToolReturnValue<T>> {
  // Validate tool name
  if (!(name in toolSchemas)) {
    throw new Error(`Unknown tool: ${name}`)
  }
  
  // Get the schema for this tool
  const toolSchema = toolSchemas[name]
  
  // Validate the arguments
  let validatedArgs: ToolParameters<T>
  try {
    validatedArgs = toolSchema.parameters.parse(args) as ToolParameters<T>
  } catch (error) {
    throw new Error(`Invalid arguments for tool '${name}': ${error.message}`)
  }
  
  // Get the implementation
  const implementation = toolImplementations[name]
  
  // Execute the tool with validated arguments
  try {
    const result = await (implementation as any)(...Object.values(validatedArgs))
    
    // Validate the return value
    const returnSchema = toolReturnSchemas[name]
    const validatedResult = returnSchema.parse(result)
    
    return validatedResult as ToolReturnValue<T>
  } catch (error) {
    throw new Error(`Tool '${name}' execution failed: ${error.message}`)
  }
}

/**
 * Get the JSON schema for a tool's parameters (using Zod 4's native conversion)
 */
export function getToolParameterSchema(toolName: ToolName): Record<string, any> {
  if (!(toolName in toolSchemas)) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  
  const schema = toolSchemas[toolName]
  return z.toJSONSchema(schema.parameters)
}

/**
 * Get the JSON schema for a tool's return value (using Zod 4's native conversion)
 */
export function getToolReturnSchema(toolName: ToolName): Record<string, any> {
  if (!(toolName in toolReturnSchemas)) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  
  const schema = toolReturnSchemas[toolName]
  return z.toJSONSchema(schema)
}

/**
 * Get all available tools with their descriptions and schemas
 */
export function getAllTools(): Record<string, {
  description: string
  parameterSchema: Record<string, any>
  returnSchema: Record<string, any>
}> {
  const tools: Record<string, any> = {}
  
  for (const [name, schema] of Object.entries(toolSchemas)) {
    tools[name] = {
      description: schema.description,
      parameterSchema: getToolParameterSchema(name as ToolName),
      returnSchema: getToolReturnSchema(name as ToolName)
    }
  }
  
  return tools
}