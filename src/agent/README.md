# Agent System - Modern Functional Architecture

A modular agent system that provides clean conversation management, LLM integration, and code processing capabilities using functional programming patterns. Built with Google GenAI integration and Effect-TS composition.

## 🎯 Architecture Overview

This system provides composable primitives for agent operations, focusing on clean separation of concerns and functional patterns. Each module has a single responsibility and can be used independently or composed together.

```
src/agent/
├── types.ts             # Core interfaces and type definitions
├── models.ts            # Environment configuration and model management
├── conversation.ts      # Simple conversation management primitives
├── llm.ts               # Google GenAI client wrapper
├── progress.ts          # Token tracking and progress display
├── windowing.ts         # Flexible conversation windowing strategies
├── indexing.ts          # LLM-first indexing with parallel processing
├── tools.ts             # Tool definitions and function calling bridge
├── ast-discovery.ts     # Real tree-sitter integration
└── README.md           # This file
```

## 🔧 Core Components

### 1. Simple Conversation Management (conversation.ts)

Focused conversation primitives without complex compatibility layers:

```typescript
import { createSimpleConversationManager } from './conversation.ts'

const conversation = createSimpleConversationManager({
  conversationId: 'conv-123',
  maxMessages: 50
})

// Add messages
conversation.addUserMessage('Hello, how can you help?')
conversation.addAssistantMessage('I can help with code analysis and generation.')

// Retrieve messages
const allMessages = conversation.getMessages()
const lastUser = conversation.getLastUserMessage()
const stats = conversation.getStats()

// Format for different uses
const llmFormat = conversation.formatForLLM()
const displayFormat = conversation.formatForDisplay()
```

### 2. Google GenAI LLM Client (llm.ts)

Pure Google GenAI wrapper focused on LLM operations:

```typescript
import { createLLMClient } from './llm.ts'

const client = createLLMClient({
  apiKey: 'your-api-key',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  enableFunctionCalling: true
})

// Generate responses
const response = await client.generateResponse('Analyze this code...', {
  systemInstruction: 'You are a code expert.',
  conversationHistory: [
    { role: 'user', content: 'Previous message' },
    { role: 'assistant', content: 'Previous response' }
  ]
})

console.log(response.content)
console.log(`Tokens: ${response.tokenUsage.totalTokens}`)
```

### 3. Unified Progress Tracking (progress.ts)

Real-time progress tracking for various operations:

```typescript
import { createTokenTracker } from './progress.ts'

const tracker = createTokenTracker(
  {
    threadId: 'thread-123',
    maxTokens: 1000000,
    currentTokens: 0,
    model: 'gemini-2.5-flash'
  },
  (progress) => {
    console.log(`Progress: ${progress.current}/${progress.max}`)
  }
)

// Add tokens and get formatted display
tracker.addTokens({
  totalTokens: 1500,
  inputTokens: 800,
  outputTokens: 700,
  tokenizer: 'cl100k'
})

const progress = tracker.getProgress() // "1.5K/1M"
const isNearLimit = tracker.isNearLimit(0.9) // Check if 90% full
```

### 4. Flexible Windowing Strategies (windowing.ts)

Reusable conversation assembly primitives for different processing patterns:

```typescript
import { executeWithWindowing, WindowingStrategies } from './windowing.ts'

const items = [
  { id: '1', type: 'function', data: { name: 'parseData' } },
  { id: '2', type: 'class', data: { name: 'DataProcessor' } }
]

// Execute with different strategies
const results = await executeWithWindowing(
  items,
  WindowingStrategies.perFileSerial, // Avoids API rate limits
  async (item) => {
    // Process each item
    return await processItem(item)
  },
  {
    onProgress: ({ completed, total }) => {
      console.log(`${completed}/${total} processed`)
    }
  }
)
```

### 5. LLM-First Indexing (indexing.ts)

Battle-tested indexing algorithm using complete codebase context:

```typescript
import { runLLMFirstIndexing } from './indexing.ts'

// Index entire codebase with LLM analysis
const result = await Effect.runPromise(
  runLLMFirstIndexing('./src', true) // verbose mode
)

// Process:
// 1. Ingest complete codebase (185K+ chars)
// 2. Single LLM call for architectural analysis
// 3. Parallel processing of all components
```

### 6. Tool Integration (tools.ts)

Tool definition and Google GenAI function calling bridge:

```typescript
import { createTool, zodToFunctionDeclaration } from './tools.ts'
import { z } from 'zod/v4'

// Define a tool
const searchTool = createTool({
  id: 'search_code',
  description: 'Search for code patterns',
  inputSchema: z.object({
    query: z.string(),
    filePattern: z.string().optional()
  }),
  execute: async ({ context }) => {
    return await searchCode(context.query, context.filePattern)
  }
})

// Convert to Google GenAI format
const functionDeclaration = zodToFunctionDeclaration(searchTool)
```

## 🚀 Technology Stack

### Core Dependencies
- **Runtime**: Deno (TypeScript-first)
- **Functional**: Effect-TS (async operations, error handling)
- **Validation**: Zod v4 (schema validation)
- **LLM**: Google GenAI SDK v1.9.0 (`gemini-2.5-flash`)
- **Parsing**: Tree-sitter (AST parsing)

### Architecture Principles
- **Functional Programming**: No classes, only functions and higher-order functions
- **Composable Primitives**: Small, focused modules that can be combined
- **Effect-TS Composition**: Functional error handling and async operations
- **Type Safety**: Zod v4 schemas for runtime validation

## 📋 Usage Examples

### Basic Agent Setup

```typescript
import { createLLMClient } from './llm.ts'
import { createSimpleConversationManager } from './conversation.ts'
import { createTokenTracker } from './progress.ts'
import { loadAgentConfig } from './models.ts'

// Load configuration
const config = loadAgentConfig({
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  requireApiKey: true
})

// Create components
const llmClient = createLLMClient({
  apiKey: config.apiKey,
  model: config.model,
  temperature: config.temperature,
  enableFunctionCalling: true
})

const conversation = createSimpleConversationManager({
  conversationId: crypto.randomUUID(),
  maxMessages: 50
})

const tokenTracker = createTokenTracker({
  threadId: crypto.randomUUID(),
  maxTokens: 1000000,
  currentTokens: 0,
  model: config.model
})

// Use together
conversation.addUserMessage('Analyze this TypeScript code...')

const response = await llmClient.generateResponse(
  conversation.getLastUserMessage()?.content || '',
  {
    conversationHistory: conversation.getMessages().map(m => ({
      role: m.role,
      content: m.content
    })),
    systemInstruction: 'You are a TypeScript expert.'
  }
)

conversation.addAssistantMessage(response.content)
tokenTracker.addTokens(response.tokenUsage)

console.log(`Progress: ${tokenTracker.getProgressString()}`)
```

### Batch Processing with Windowing

```typescript
import { executeWithWindowing } from './windowing.ts'

const files = ['src/index.ts', 'src/utils.ts', 'src/types.ts']
const items = files.map(file => ({
  id: file,
  type: 'file',
  data: { path: file },
  metadata: { filename: file }
}))

const results = await executeWithWindowing(
  items,
  {
    type: 'per-file',
    parallelism: 'serial',
    rateLimit: 1000 // 1 second between files
  },
  async (item) => {
    // Process each file
    const content = await Deno.readTextFile(item.data.path)
    return await analyzeFile(content)
  }
)

console.log(`Processed ${results.length} files`)
```

## 🧪 Testing Strategy

### Comprehensive Test Coverage

All modules have corresponding test files in `tests/agent/`:

- **types.test.ts**: Interface definitions, type safety
- **models.test.ts**: Configuration loading, environment handling
- **conversation.test.ts**: Message management, formatting
- **llm.test.ts**: Google GenAI integration, response handling
- **progress.test.ts**: Token tracking, progress display
- **windowing.test.ts**: Strategy patterns, execution modes
- **indexing.test.ts**: LLM-first approach, parallel processing
- **tools.test.ts**: Tool definitions, function calling
- **ast-discovery.test.ts**: Tree-sitter integration, symbol extraction

### Test Execution

```bash
# Run all agent tests
deno test tests/agent/ --allow-all --no-check

# Individual module tests
deno test tests/agent/llm.test.ts --allow-env --no-check
deno test tests/agent/conversation.test.ts --no-check
```

## 🔑 Environment Configuration

### Required Environment Variables

```bash
# Google AI SDK (required)
GOOGLE_API_KEY=your_api_key_here

# Model Configuration (optional - defaults provided)
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
```

### Configuration Loading

```typescript
import { loadAgentConfig, checkEnvironmentConfiguration } from './models.ts'

// Load with defaults
const config = loadAgentConfig()

// Load with overrides
const customConfig = loadAgentConfig({
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  verbose: true,
  requireApiKey: true
})

// Check environment
const env = checkEnvironmentConfiguration()
console.log('Available config:', env)
```

## 🏗️ Design Principles

### 1. Functional Programming (NO Classes)

All modules use higher-order functions and functional composition:

```typescript
// ❌ Don't use classes
export class ConversationManager { ... }

// ✅ Use functional patterns
export const createConversationManager = (config) => {
  // State in closure
  let messages = []
  
  // Return object with methods
  return {
    addMessage: (content, role) => { ... },
    getMessages: () => [...messages]
  }
}
```

### 2. Composable Primitives

Each module focuses on a single responsibility and can be combined:

```typescript
// Individual primitives
const llmClient = createLLMClient(config)
const conversation = createConversationManager(context)
const tracker = createTokenTracker(threadContext)

// Compose as needed
const response = await llmClient.generateResponse(
  conversation.formatForLLM(),
  { systemInstruction: 'You are helpful.' }
)

conversation.addAssistantMessage(response.content)
tracker.addTokens(response.tokenUsage)
```

### 3. Battle-Tested Google GenAI Patterns

Uses exact patterns from working production code:

```typescript
// From llm.ts - proven to work with function calling
const response = await genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,
  config: {
    systemInstruction: 'You are helpful.',
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: ['tool_name']
      }
    },
    tools: [{ functionDeclarations }]
  }
})
```

## 📊 Performance Characteristics

### Token Tracking Accuracy
- Real-time progress updates: "240K/1M (24%)"
- Token estimation with 4 chars/token heuristic
- Input/output token separation
- Context window limit enforcement

### Conversation Management
- Message deduplication for system messages
- Thread-aware context with optional persistence
- Multiple format support for different use cases
- Method chaining for fluent interface

### Error Handling
- Detailed typed errors with Effect-TS
- Graceful degradation for API failures
- Token limit warnings and enforcement
- Comprehensive validation with Zod v4

---

This agent system provides immediate production value through composable primitives and functional architecture. The clean module boundaries ensure maintainability while the comprehensive test suite guarantees reliability.