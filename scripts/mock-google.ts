/**
 * Google GenAI Mock Response Generator
 * 
 * This script makes actual calls to Google GenAI API to capture real response
 * structures for use in tests. Run this manually to generate mock data.
 * 
 * Usage: deno run --allow-env --allow-net scripts/mock-google.ts
 */

import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai'
import { z } from 'zod/v4'

// Load environment
const apiKey = Deno.env.get('GOOGLE_API_KEY')
if (!apiKey) {
  console.error('❌ GOOGLE_API_KEY environment variable required')
  Deno.exit(1)
}

// Create tools for function calling (simplified versions)
const tools = [
  {
    name: "list_filesystem",
    description: "Lists all files and directories in a given path",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory path to list contents from"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "read_file", 
    description: "Reads the complete content of a file",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to read"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "list_symbols_in_file",
    description: "Lists all symbols (functions, classes, variables, interfaces, types, enums) in a TypeScript file",
    parameters: {
      type: "object", 
      properties: {
        path: {
          type: "string",
          description: "The TypeScript file path to parse for symbols"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "get_symbol_details",
    description: "Gets detailed information about a specific symbol in a file",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path containing the symbol"
        },
        symbolName: {
          type: "string", 
          description: "The name of the symbol to get details for"
        }
      },
      required: ["path", "symbolName"]
    }
  },
  {
    name: "create_index_entry",
    description: "Creates an index entry for a code element with synthesized description",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path containing the symbol" },
        symbolName: { type: "string", description: "Name of the symbol" },
        symbolKind: { type: "string", description: "Kind of symbol (function, class, etc.)" },
        startLine: { type: "number", description: "Starting line number" },
        endLine: { type: "number", description: "Ending line number" },
        content: { type: "string", description: "Full content of the symbol" },
        synthesizedDescription: { type: "string", description: "Concise description" }
      },
      required: ["path", "symbolName", "symbolKind", "startLine", "endLine", "content", "synthesizedDescription"]
    }
  }
]

const systemInstruction = `You are an expert programmer and system architect. Your goal is to deeply understand this codebase. I have provided you with a set of tools to explore the filesystem and the code's structure. 

The list_filesystem tool returns full file paths that you can directly use with read_file and other tools - no path manipulation needed.

Your task is to reason step-by-step, form a hypothesis about the project, and explore it until you understand the purpose of each major symbol. When you fully understand a symbol, you MUST call the create_index_entry tool with a concise description that includes critical code snippets where they are more descriptive than words. 

Begin by listing the contents of the root directory to get an overview.`

// Mock tool responses (what the tools would return)
const mockToolResponses: Record<string, any> = {
  list_filesystem: [
    "/test/project/src",
    "/test/project/src/index.ts", 
    "/test/project/src/utils.ts",
    "/test/project/src/types.ts",
    "/test/project/package.json",
    "/test/project/README.md"
  ],
  
  read_file: `/**
 * Main application entry point
 */
export function main(): void {
  console.log("Hello, world!");
  const result = processData("example");
  console.log("Result:", result);
}

export function processData(input: string): string {
  return \`Processed: \${input.toUpperCase()}\`;
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export class DataManager {
  private data: Map<string, any> = new Map();
  
  store(key: string, value: any): void {
    this.data.set(key, value);
  }
  
  retrieve(key: string): any {
    return this.data.get(key);
  }
}`,

  list_symbols_in_file: [
    { name: "main", kind: "function", startLine: 4, endLine: 8 },
    { name: "processData", kind: "function", startLine: 10, endLine: 12 },
    { name: "User", kind: "interface", startLine: 14, endLine: 18 },
    { name: "DataManager", kind: "class", startLine: 20, endLine: 30 }
  ],
  
  get_symbol_details: {
    name: "main",
    kind: "function", 
    startLine: 4,
    endLine: 8,
    content: `export function main(): void {
  console.log("Hello, world!");
  const result = processData("example");
  console.log("Result:", result);
}`,
    filePath: "/test/project/src/index.ts"
  },
  
  create_index_entry: { success: true }
}

async function captureGoogleGenAIResponses() {
  console.log('🤖 Capturing Google GenAI responses for test mocking...')
  console.log('🔑 Using API key:', apiKey.slice(0, 10) + '...')
  
  const genAI = new GoogleGenAI({ apiKey })
  
  const baseConfig = {
    model: "gemini-2.5-flash",
    config: {
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: tools.map(t => t.name)
        }
      },
      tools: [{ functionDeclarations: tools }],
      systemInstruction: systemInstruction
    }
  }
  
  // Simulate the conversation flow
  const conversationHistory = [
    "Begin by exploring the codebase at '/test/project'."
  ]
  
  console.log('\n📝 MOCK_GENAI_RESPONSES = [')
  
  const MAX_ITERATIONS = 6
  let iteration = 0
  
  while (iteration < MAX_ITERATIONS) {
    iteration++
    
    console.log(`\n  // === ITERATION ${iteration} ===`)
    
    try {
      const result = await genAI.models.generateContent({
        ...baseConfig,
        contents: conversationHistory.join('\n\n---\n\n')
      })
      
      // Log the actual response structure for copying to tests
      const response = {
        text: result.text || '',
        functionCalls: result.functionCalls || null
      }
      
      console.log('  {')
      console.log(`    text: ${JSON.stringify(response.text)},`)
      console.log(`    functionCalls: ${JSON.stringify(response.functionCalls, null, 4)}`)
      console.log('  },')
      
      // If no function calls, we're done
      if (!result.functionCalls || result.functionCalls.length === 0) {
        console.log(`\n  // === CONVERSATION ENDED (No function calls) ===`)
        break
      }
      
      // Simulate tool execution and add responses to conversation
      const functionResponses = []
      
      for (const functionCall of result.functionCalls) {
        const toolName = functionCall.name
        const args = functionCall.args || {}
        
        console.log(`\n  // Tool call: ${toolName}(${JSON.stringify(args)})`)
        
        // Get mock response for this tool
        let toolResponse = mockToolResponses[toolName]
        
        // Handle specific tool variations
        if (toolName === 'get_symbol_details' && args.symbolName) {
          toolResponse = {
            ...mockToolResponses.get_symbol_details,
            name: args.symbolName,
            content: `export function ${args.symbolName}() { /* implementation */ }`
          }
        }
        
        functionResponses.push({
          name: toolName,
          response: toolResponse
        })
      }
      
      // Add function responses to conversation history
      const responseText = functionResponses.map(fr => 
        `Function ${fr.name} result: ${JSON.stringify(fr.response)}`
      ).join('\n')
      
      const nextMessage = `Here are the function results:\n${responseText}\n\nBased on these results, please continue your exploration.`
      conversationHistory.push(nextMessage)
      
      // Add a small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error(`\n  // ERROR in iteration ${iteration}:`, error)
      
      // Log error response for test mocking
      console.log('  {')
      console.log(`    text: "Error occurred during analysis",`)
      console.log(`    functionCalls: null,`)
      console.log(`    error: ${JSON.stringify(error instanceof Error ? error.message : String(error))}`)
      console.log('  },')
      break
    }
  }
  
  if (iteration >= MAX_ITERATIONS) {
    console.log(`\n  // === REACHED MAX_ITERATIONS (${MAX_ITERATIONS}) ===`)
  }
  
  console.log('\n]')
  console.log('\n✅ Google GenAI response capture complete!')
  console.log('\n📋 Instructions:')
  console.log('1. Copy the MOCK_GENAI_RESPONSES array above')
  console.log('2. Replace the mock data in tests/agent/indexing.test.ts')
  console.log('3. Update any tool response structures that changed')
  console.log('4. Run tests to verify the mocked responses work correctly')
}

async function testSingleApiCall() {
  console.log('\n🧪 Testing single API call for response structure...')
  
  const genAI = new GoogleGenAI({ apiKey })
  
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Respond with exactly this: 'Test response for structure validation'",
      config: {
        systemInstruction: "You are a helpful assistant. Follow instructions exactly."
      }
    })
    
    console.log('\n📊 Single API Response Structure:')
    console.log('result.text:', JSON.stringify(result.text))
    console.log('result.functionCalls:', result.functionCalls)
    console.log('result.response:', !!result.response)
    console.log('Full result keys:', Object.keys(result))
    
    if (result.response) {
      console.log('result.response.text():', result.response.text ? result.response.text() : 'undefined')
      console.log('result.response keys:', Object.keys(result.response))
    }
    
  } catch (error) {
    console.error('❌ Single API call failed:', error)
  }
}

async function testFunctionCallingStructure() {
  console.log('\n🔧 Testing function calling structure...')
  
  const genAI = new GoogleGenAI({ apiKey })
  
  const simpleTools = [
    {
      name: "test_tool",
      description: "A simple test tool",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Test message" }
        },
        required: ["message"]
      }
    }
  ]
  
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Please call the test_tool with message 'Hello from test'",
      config: {
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["test_tool"]
          }
        },
        tools: [{ functionDeclarations: simpleTools }],
        systemInstruction: "You must use the available tools when requested."
      }
    })
    
    console.log('\n📊 Function Calling Response Structure:')
    console.log('result.text:', JSON.stringify(result.text))
    console.log('result.functionCalls:', JSON.stringify(result.functionCalls, null, 2))
    
  } catch (error) {
    console.error('❌ Function calling test failed:', error)
  }
}

async function testEmbeddingGeneration() {
  console.log('\n🔮 Testing Google Gemini Embedding Generation...')
  
  const genAI = new GoogleGenAI({ apiKey })
  
  // Test texts that represent real use cases in our indexing system
  const testTexts = [
    "export function main(): void { console.log('Hello, world!'); }",
    "A TypeScript function that serves as the main entry point for the application",
    "interface User { id: number; name: string; email: string; }",
    "User interface defining the structure for user data with ID, name, and email fields",
    "class DataManager implements storage and retrieval of key-value pairs"
  ]
  
  console.log('\n📊 REAL_EMBEDDING_RESPONSES = [')
  
  for (let i = 0; i < testTexts.length; i++) {
    const text = testTexts[i]
    console.log(`\n  // === EMBEDDING ${i + 1}: "${text.slice(0, 50)}..." ===`)
    
    try {
      // Use the official Google GenAI embedContent API
      const result = await genAI.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      })
      
      console.log('    {')
      console.log(`      text: ${JSON.stringify(text)},`)
      console.log(`      model: "text-embedding-004",`)
      
      // Log the actual structure of the embedding response
      console.log(`      response: ${JSON.stringify(result, null, 6)},`)
      console.log(`      timestamp: ${Date.now() + i * 1000}`)
      console.log('    },')
      
      // Show embedding characteristics if available
      if (result.embeddings && result.embeddings.length > 0) {
        const embedding = result.embeddings[0]
        if (embedding.values && Array.isArray(embedding.values)) {
          console.log(`    // Embedding: ${embedding.values.length} dimensions, range: [${Math.min(...embedding.values).toFixed(4)}, ${Math.max(...embedding.values).toFixed(4)}]`)
        }
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.log('    {')
      console.log(`      text: ${JSON.stringify(text)},`)
      console.log(`      model: "text-embedding-004",`)
      console.log(`      response: null,`)
      console.log(`      error: ${JSON.stringify(error instanceof Error ? error.message : String(error))}`)
      console.log('    },')
    }
  }
  
  console.log('\n]')
  console.log('\n✅ Real embedding generation test complete!')
}

async function testEmbeddingAPI() {
  console.log('\n🔍 Testing Embedding API Methods...')
  
  const genAI = new GoogleGenAI({ apiKey })
  
  console.log('\n📊 Available methods on genAI:')
  console.log('genAI.models:', Object.keys(genAI.models || {}))
  
  console.log('\n📊 Available methods on genAI.models:')
  if (genAI.models) {
    console.log('Methods:', Object.getOwnPropertyNames(genAI.models).filter(name => typeof genAI.models[name] === 'function'))
  }
  
  // Try to get a model instance
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    console.log('\n📊 Available methods on model instance:')
    console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(model)).filter(name => typeof model[name] === 'function'))
  } catch (error) {
    console.log('\n❌ Failed to get model instance:', error.message)
  }
  
  // Try different embedding approaches
  const testText = "Hello, world!"
  
  console.log('\n🧪 Testing different embedding API approaches:')
  
  // Approach 1: Direct embedContent
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    if (typeof model.embedContent === 'function') {
      const result = await model.embedContent(testText)
      console.log('✅ Approach 1 (embedContent):', typeof result, Object.keys(result))
    } else {
      console.log('❌ Approach 1 (embedContent): Method not available')
    }
  } catch (error) {
    console.log('❌ Approach 1 (embedContent):', error.message)
  }
  
  // Approach 2: generateEmbedding
  try {
    if (genAI.models.generateEmbedding) {
      const result = await genAI.models.generateEmbedding({
        model: 'text-embedding-004',
        text: testText
      })
      console.log('✅ Approach 2 (generateEmbedding):', typeof result, Object.keys(result))
    } else {
      console.log('❌ Approach 2 (generateEmbedding): Method not available')
    }
  } catch (error) {
    console.log('❌ Approach 2 (generateEmbedding):', error.message)
  }
  
  // Approach 3: embedContent on models
  try {
    if (genAI.models.embedContent) {
      const result = await genAI.models.embedContent({
        model: 'text-embedding-004',
        content: testText
      })
      console.log('✅ Approach 3 (models.embedContent):', typeof result, Object.keys(result))
    } else {
      console.log('❌ Approach 3 (models.embedContent): Method not available')
    }
  } catch (error) {
    console.log('❌ Approach 3 (models.embedContent):', error.message)
  }
}

async function generateMockEmbeddings() {
  console.log('\n🎯 Generating Mock Embeddings for Tests...')
  
  // Since we may not have working embedding API yet, generate realistic mock data
  const testTexts = [
    "export function main(): void { console.log('Hello, world!'); }",
    "A TypeScript function that serves as the main entry point for the application",
    "interface User { id: number; name: string; email: string; }",
    "User interface defining the structure for user data with ID, name, and email fields",
    "class DataManager implements storage and retrieval of key-value pairs"
  ]
  
  console.log('\n📊 MOCK_EMBEDDING_RESPONSES = [')
  
  testTexts.forEach((text, i) => {
    // Generate deterministic "realistic" embeddings for testing
    // Use simple hash-based approach to ensure consistency across test runs
    const embedding = Array.from({ length: 768 }, (_, j) => {
      const hash = text.length + i * 100 + j
      return (Math.sin(hash) * 0.5) + (Math.cos(hash * 0.7) * 0.3) + (Math.sin(hash * 1.3) * 0.2)
    })
    
    console.log('  {')
    console.log(`    text: ${JSON.stringify(text)},`)
    console.log(`    model: "text-embedding-004",`)
    console.log(`    embedding: [${embedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}${embedding.length > 5 ? `, /* ... ${embedding.length - 5} more values */` : ''}],`)
    console.log(`    timestamp: ${Date.now() + i * 1000},`)
    console.log(`    length: ${embedding.length}`)
    console.log('  },')
  })
  
  console.log(']')
  console.log('\n✅ Mock embedding generation complete!')
  console.log('\n📋 Instructions for embedding mocks:')
  console.log('1. Copy the MOCK_EMBEDDING_RESPONSES array above')
  console.log('2. Use in tests/agent/embeddings.test.ts')
  console.log('3. These embeddings are deterministic for consistent testing')
  console.log('4. Each embedding has 768 dimensions (typical for Google embeddings)')
}

// Main execution
if (import.meta.main) {
  console.log('🚀 Google GenAI & Embedding Mock Generator')
  console.log('=' .repeat(50))
  
  const args = Deno.args
  
  if (args.includes('--test-single')) {
    await testSingleApiCall()
  } else if (args.includes('--test-function-calling')) {
    await testFunctionCallingStructure()
  } else if (args.includes('--test-embeddings')) {
    await testEmbeddingGeneration()
  } else if (args.includes('--test-embedding-api')) {
    await testEmbeddingAPI()
  } else if (args.includes('--mock-embeddings')) {
    await generateMockEmbeddings()
  } else if (args.includes('--capture')) {
    await captureGoogleGenAIResponses()
  } else if (args.includes('--all')) {
    await testSingleApiCall()
    await testFunctionCallingStructure()
    await testEmbeddingAPI()
    await testEmbeddingGeneration()
    await generateMockEmbeddings()
    await captureGoogleGenAIResponses()
  } else {
    console.log('Usage:')
    console.log('  deno run --allow-env --allow-net scripts/mock-google.ts [OPTION]')
    console.log('\nOptions:')
    console.log('  --test-single           Test basic API response structure')
    console.log('  --test-function-calling Test function calling response structure')
    console.log('  --test-embeddings       Test embedding generation with real API')
    console.log('  --test-embedding-api    Explore available embedding API methods')
    console.log('  --mock-embeddings       Generate deterministic mock embeddings')
    console.log('  --capture              Capture full conversation responses')
    console.log('  --all                  Run all tests and capture everything')
    console.log('\n💡 Start with --test-embedding-api to see what methods are available')
  }
}