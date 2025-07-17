/**
 * Agent Tools Tests
 * 
 * Comprehensive tests for the agent tools system, including the critical
 * zodToFunctionDeclaration function that bridges Zod v4 to Google GenAI.
 * 
 * @tested_by src/agent/tools.ts
 */

import { assertEquals, assertThrows } from '@std/assert'
import { z } from 'zod/v4'
import {
  createTool,
  zodToFunctionDeclaration,
  executeTool,
  formatFunctionResponses,
  ToolRegistry,
  type ToolDefinition,
  type ToolExecutionResult
} from '../../src/agent/tools.ts'

// Mock tool for testing
const mockTool = createTool({
  id: 'test_tool',
  description: 'A test tool for validation',
  inputSchema: z.object({
    message: z.string().describe('Test message'),
    count: z.number().optional().describe('Optional count')
  }),
  outputSchema: z.object({
    result: z.string(),
    processed: z.boolean()
  }),
  execute: async ({ context }) => {
    return {
      result: `Processed: ${context.message}`,
      processed: true
    }
  }
})

// Mock tool that throws errors
const errorTool = createTool({
  id: 'error_tool',
  description: 'A tool that throws errors',
  inputSchema: z.object({
    shouldFail: z.boolean()
  }),
  execute: async ({ context }) => {
    if (context.shouldFail) {
      throw new Error('Tool execution failed')
    }
    return { success: true }
  }
})

// Complex tool with nested schema for zodToFunctionDeclaration testing
const complexTool = createTool({
  id: 'complex_tool',
  description: 'A tool with complex nested schema',
  inputSchema: z.object({
    user: z.object({
      name: z.string().describe('User name'),
      age: z.number().min(0).describe('User age')
    }).describe('User information'),
    options: z.array(z.string()).optional().describe('Optional settings'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata')
  }),
  execute: async ({ context }) => {
    return { processed: context.user.name }
  }
})

Deno.test('createTool - creates tool definition correctly', () => {
  const tool = createTool({
    id: 'test',
    description: 'Test tool',
    inputSchema: z.object({ input: z.string() }),
    execute: async () => ({ output: 'test' })
  })

  assertEquals(tool.id, 'test')
  assertEquals(tool.description, 'Test tool')
  assertEquals(typeof tool.execute, 'function')
})

Deno.test('zodToFunctionDeclaration - converts simple schema correctly', () => {
  // BATTLE-TESTED: This is the critical function that took iterations to perfect
  const functionDecl = zodToFunctionDeclaration(mockTool)
  
  assertEquals(functionDecl.name, 'test_tool')
  assertEquals(functionDecl.description, 'A test tool for validation')
  
  // Verify the parameters structure matches Google GenAI expected format
  assertEquals(functionDecl.parameters.type, 'object')
  assertEquals(typeof functionDecl.parameters.properties, 'object')
  assertEquals(functionDecl.parameters.properties.message.type, 'string')
  assertEquals(functionDecl.parameters.properties.message.description, 'Test message')
  assertEquals(functionDecl.parameters.properties.count.type, 'number')
  assertEquals(functionDecl.parameters.properties.count.description, 'Optional count')
  assertEquals(functionDecl.parameters.required, ['message'])
  
  // Verify $schema is stripped (critical for Google GenAI compatibility)
  assertEquals(functionDecl.parameters.$schema, undefined)
})

Deno.test('zodToFunctionDeclaration - handles complex nested schemas', () => {
  const functionDecl = zodToFunctionDeclaration(complexTool)
  
  assertEquals(functionDecl.name, 'complex_tool')
  assertEquals(functionDecl.parameters.type, 'object')
  
  // Verify nested object structure
  const userProperty = functionDecl.parameters.properties.user
  assertEquals(userProperty.type, 'object')
  assertEquals(userProperty.description, 'User information')
  assertEquals(userProperty.properties.name.type, 'string')
  assertEquals(userProperty.properties.age.type, 'number')
  assertEquals(userProperty.properties.age.minimum, 0)
  
  // Verify array property
  const optionsProperty = functionDecl.parameters.properties.options
  assertEquals(optionsProperty.type, 'array')
  assertEquals(optionsProperty.items.type, 'string')
  
  // Verify record/dictionary property
  const metadataProperty = functionDecl.parameters.properties.metadata
  assertEquals(metadataProperty.type, 'object')
})

Deno.test('zodToFunctionDeclaration - preserves descriptions from Zod schema', () => {
  // This tests that .describe() calls in Zod schemas flow through to Google GenAI
  const tool = createTool({
    id: 'description_test',
    description: 'Test descriptions',
    inputSchema: z.object({
      requiredField: z.string().describe('This field is required'),
      optionalField: z.number().optional().describe('This field is optional'),
      nestedObject: z.object({
        innerField: z.boolean().describe('Inner field description')
      }).describe('Nested object description')
    }),
    execute: async () => ({})
  })

  const functionDecl = zodToFunctionDeclaration(tool)
  
  assertEquals(functionDecl.parameters.properties.requiredField.description, 'This field is required')
  assertEquals(functionDecl.parameters.properties.optionalField.description, 'This field is optional')
  assertEquals(functionDecl.parameters.properties.nestedObject.description, 'Nested object description')
  assertEquals(functionDecl.parameters.properties.nestedObject.properties.innerField.description, 'Inner field description')
})

Deno.test('executeTool - executes tool successfully with valid input', async () => {
  const result = await executeTool(mockTool, {
    message: 'Hello, world!',
    count: 42
  })

  assertEquals(result.name, 'test_tool')
  assertEquals(result.response.result, 'Processed: Hello, world!')
  assertEquals(result.response.processed, true)
  assertEquals(result.error, undefined)
})

Deno.test('executeTool - handles validation errors', async () => {
  const result = await executeTool(mockTool, {
    // Missing required 'message' field
    count: 42
  })

  assertEquals(result.name, 'test_tool')
  assertEquals(typeof result.response.error, 'string')
  assertEquals(typeof result.error, 'string')
  assertEquals(result.response.error.includes('message'), true)
})

Deno.test('executeTool - handles tool execution errors', async () => {
  const result = await executeTool(errorTool, {
    shouldFail: true
  })

  assertEquals(result.name, 'error_tool')
  assertEquals(result.response.error, 'Tool execution failed')
  assertEquals(result.error, 'Tool execution failed')
})

Deno.test('executeTool - handles tool execution success', async () => {
  const result = await executeTool(errorTool, {
    shouldFail: false
  })

  assertEquals(result.name, 'error_tool')
  assertEquals(result.response.success, true)
  assertEquals(result.error, undefined)
})

Deno.test('formatFunctionResponses - formats single response correctly', () => {
  const responses: ToolExecutionResult[] = [
    {
      name: 'test_tool',
      response: { result: 'Success', data: [1, 2, 3] }
    }
  ]

  const formatted = formatFunctionResponses(responses)
  
  // PRESERVE: This exact format is battle-tested with Google GenAI
  const expected = `Here are the function results:
Function test_tool result: {"result":"Success","data":[1,2,3]}

Based on these results, please continue your exploration.`

  assertEquals(formatted, expected)
})

Deno.test('formatFunctionResponses - formats multiple responses correctly', () => {
  const responses: ToolExecutionResult[] = [
    {
      name: 'list_files',
      response: ['file1.ts', 'file2.ts']
    },
    {
      name: 'read_file',
      response: 'export function example() {}'
    },
    {
      name: 'error_tool',
      response: { error: 'File not found' },
      error: 'File not found'
    }
  ]

  const formatted = formatFunctionResponses(responses)
  
  const expected = `Here are the function results:
Function list_files result: ["file1.ts","file2.ts"]
Function read_file result: "export function example() {}"
Function error_tool result: {"error":"File not found"}

Based on these results, please continue your exploration.`

  assertEquals(formatted, expected)
})

Deno.test('formatFunctionResponses - handles empty responses', () => {
  const formatted = formatFunctionResponses([])
  
  const expected = `Here are the function results:


Based on these results, please continue your exploration.`

  assertEquals(formatted, expected)
})

Deno.test('ToolRegistry - registers and retrieves tools', () => {
  const registry = new ToolRegistry()
  
  registry.register(mockTool)
  registry.register(errorTool)
  
  assertEquals(registry.get('test_tool'), mockTool)
  assertEquals(registry.get('error_tool'), errorTool)
  assertEquals(registry.get('nonexistent'), undefined)
})

Deno.test('ToolRegistry - returns all registered tools', () => {
  const registry = new ToolRegistry()
  
  registry.register(mockTool)
  registry.register(errorTool)
  
  const allTools = registry.getAll()
  assertEquals(allTools.length, 2)
  assertEquals(allTools.includes(mockTool), true)
  assertEquals(allTools.includes(errorTool), true)
})

Deno.test('ToolRegistry - generates function declarations for all tools', () => {
  const registry = new ToolRegistry()
  
  registry.register(mockTool)
  registry.register(complexTool)
  
  const declarations = registry.getFunctionDeclarations()
  assertEquals(declarations.length, 2)
  assertEquals(declarations[0].name, 'test_tool')
  assertEquals(declarations[1].name, 'complex_tool')
  
  // Verify each declaration has the required Google GenAI format
  declarations.forEach(decl => {
    assertEquals(typeof decl.name, 'string')
    assertEquals(typeof decl.description, 'string')
    assertEquals(typeof decl.parameters, 'object')
    assertEquals(decl.parameters.type, 'object')
    assertEquals(typeof decl.parameters.properties, 'object')
  })
})

Deno.test('ToolRegistry - returns allowed function names', () => {
  const registry = new ToolRegistry()
  
  registry.register(mockTool)
  registry.register(errorTool)
  registry.register(complexTool)
  
  const names = registry.getAllowedFunctionNames()
  assertEquals(names, ['test_tool', 'error_tool', 'complex_tool'])
})

Deno.test('ToolRegistry - handles duplicate tool registration', () => {
  const registry = new ToolRegistry()
  
  registry.register(mockTool)
  registry.register(mockTool) // Register same tool again
  
  const allTools = registry.getAll()
  assertEquals(allTools.length, 1) // Should only have one instance
})

// Integration test: Full tool workflow
Deno.test('Integration - complete tool workflow', async () => {
  const registry = new ToolRegistry()
  registry.register(mockTool)
  registry.register(complexTool)
  
  // Get function declarations for Google GenAI
  const declarations = registry.getFunctionDeclarations()
  assertEquals(declarations.length, 2)
  
  // Simulate Google GenAI function call
  const mockFunctionCall = {
    name: 'test_tool',
    args: {
      message: 'Integration test',
      count: 99
    }
  }
  
  // Execute the tool
  const tool = registry.get(mockFunctionCall.name)!
  const result = await executeTool(tool, mockFunctionCall.args)
  
  assertEquals(result.name, 'test_tool')
  assertEquals(result.response.result, 'Processed: Integration test')
  assertEquals(result.error, undefined)
  
  // Format for conversation
  const formatted = formatFunctionResponses([result])
  assertEquals(formatted.includes('Function test_tool result:'), true)
  assertEquals(formatted.includes('Based on these results, please continue'), true)
})