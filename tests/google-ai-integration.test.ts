/**
 * Google AI SDK v1.9.0 Integration Tests
 * 
 * TDD approach: Write tests first, then implement the code to make them pass
 */

import '@std/dotenv/load'
import { assertEquals, assertExists, assert } from '@std/assert'
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration, Type } from '@google/genai'
import { z } from 'zod/v4'
import { createTool, zodToFunctionDeclaration } from '../src/mastra/tools/tool-definition.ts'

Deno.test('Google AI SDK v1.9.0 - Basic Function Calling', async () => {
  // Arrange
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  assertExists(apiKey, 'GOOGLE_API_KEY environment variable is required')
  
  const genAI = new GoogleGenAI({ apiKey })
  
  // Create a simple test tool
  const testTool = createTool({
    id: 'simple_math',
    description: 'Performs simple addition',
    inputSchema: z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number')
    }),
    outputSchema: z.object({
      result: z.number()
    }),
    execute: async ({ context: { a, b } }) => ({ result: a + b })
  })
  
  const functionDeclaration = zodToFunctionDeclaration(testTool)
  
  // Act
  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Please add 5 and 3 using the simple_math function',
    config: {
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['simple_math']
        }
      },
      tools: [{
        functionDeclarations: [functionDeclaration]
      }]
    }
  })
  
  // Assert
  assertExists(response, 'Response should exist')
  assertExists(response.functionCalls, 'Function calls should exist in response')
  assertEquals(response.functionCalls.length, 1, 'Should have exactly one function call')
  
  const functionCall = response.functionCalls[0]!
  assertEquals(functionCall.name, 'simple_math', 'Function name should match')
  assertExists(functionCall.args, 'Function arguments should exist')
  assertEquals(functionCall.args.a, 5, 'First argument should be 5')
  assertEquals(functionCall.args.b, 3, 'Second argument should be 3')
  
  // Execute the tool (validate args first)
  const validatedArgs = testTool.inputSchema.parse(functionCall.args)
  const toolResult = await testTool.execute({ context: validatedArgs })
  assertEquals(toolResult.result, 8, 'Tool should correctly add 5 + 3 = 8')
})

Deno.test('Zod v4 Schema to FunctionDeclaration Bridge', () => {
  // Arrange
  const complexTool = createTool({
    id: 'complex_tool',
    description: 'A tool with complex schema',
    inputSchema: z.object({
      name: z.string().describe('The name field'),
      age: z.number().int().min(0).max(150).describe('Age in years'),
      active: z.boolean().default(true).describe('Whether active'),
      tags: z.array(z.string()).optional().describe('Optional tags')
    }),
    execute: async ({ context }) => ({ success: true })
  })
  
  // Act
  const declaration = zodToFunctionDeclaration(complexTool)
  
  // Assert
  assertEquals(declaration.name, 'complex_tool')
  assertEquals(declaration.description, 'A tool with complex schema')
  assertExists(declaration.parameters)
  
  // Check parameter structure
  assertEquals(declaration.parameters.type, 'object')
  assertExists(declaration.parameters.properties)
  
  // Check individual properties
  const props = declaration.parameters.properties
  assertExists(props.name)
  assertEquals(props.name.type, 'string')
  assertEquals(props.name.description, 'The name field')
  
  assertExists(props.age)
  assertEquals(props.age.type, 'integer') // Zod .int() produces "integer" type in JSON schema
  assertEquals(props.age.description, 'Age in years')
  
  assertExists(props.active)
  assertEquals(props.active.type, 'boolean')
  assertEquals(props.active.description, 'Whether active')
  
  assertExists(props.tags)
  assertEquals(props.tags.type, 'array')
  assertEquals(props.tags.description, 'Optional tags')
  
  // Check required fields
  assertExists(declaration.parameters.required)
  assert(declaration.parameters.required.includes('name'))
  assert(declaration.parameters.required.includes('age'))
  // active and tags should not be required (default value and optional)
})

Deno.test('Multiple Function Calls in Single Response', async () => {
  // This test ensures our system can handle multiple function calls
  // Skip if no API key available
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) {
    console.log('⏭️ Skipping test - GOOGLE_API_KEY not available')
    return
  }
  
  const genAI = new GoogleGenAI({ apiKey })
  
  const mathTool = createTool({
    id: 'math_add',
    description: 'Add two numbers',
    inputSchema: z.object({
      a: z.number(),
      b: z.number()
    }),
    execute: async ({ context: { a, b } }) => ({ result: a + b })
  })
  
  const greetTool = createTool({
    id: 'greet',
    description: 'Generate a greeting',
    inputSchema: z.object({
      name: z.string()
    }),
    execute: async ({ context: { name } }) => ({ message: `Hello, ${name}!` })
  })
  
  const tools = [mathTool, greetTool]
  const functionDeclarations = tools.map(zodToFunctionDeclaration)
  
  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Please add 2 and 3, then greet Alice',
    config: {
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['math_add', 'greet']
        }
      },
      tools: [{
        functionDeclarations
      }]
    }
  })
  
  // The model might call both functions or call them in sequence
  // We'll accept either behavior
  assertExists(response.functionCalls)
  assert(response.functionCalls.length >= 1, 'Should have at least one function call')
  
  // Verify all function calls are valid
  for (const call of response.functionCalls) {
    assertExists(call.name, 'Function call should have a name')
    assert(['math_add', 'greet'].includes(call.name!), `Function ${call.name} should be one of our tools`)
    assertExists(call.args, 'Each function call should have arguments')
  }
})

Deno.test('Error Handling - Invalid Function Call Arguments', async () => {
  // Test that our system handles invalid arguments gracefully
  const testTool = createTool({
    id: 'strict_tool',
    description: 'A tool with strict validation',
    inputSchema: z.object({
      requiredString: z.string().min(1),
      requiredNumber: z.number().int().positive()
    }),
    execute: async ({ context }) => ({ success: true })
  })
  
  // Test with invalid arguments
  const invalidArgs = {
    requiredString: '', // Too short
    requiredNumber: -5   // Negative
  }
  
  try {
    testTool.inputSchema.parse(invalidArgs)
    assert(false, 'Should have thrown validation error')
  } catch (error) {
    // This is expected - Zod should reject invalid arguments
    assert(error instanceof Error)
  }
  
  // Test with valid arguments
  const validArgs = {
    requiredString: 'hello',
    requiredNumber: 42
  }
  
  const parsedArgs = testTool.inputSchema.parse(validArgs)
  assertEquals(parsedArgs.requiredString, 'hello')
  assertEquals(parsedArgs.requiredNumber, 42)
})