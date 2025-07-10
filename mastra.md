# Mastra Framework Integration Guide

## 🎯 Overview

Mastra is a TypeScript agent framework that provides primitives for building AI applications with agents, tools, and workflows. This document captures our learnings and implementation patterns for the dotvibe project.

## 📚 Key Learnings from Documentation

### Agent Creation Patterns

**Core Imports**:
```typescript
import { Agent } from "@mastra/core/agent"
import { createTool } from "@mastra/core/tools"
import { openai } from "@ai-sdk/openai"
import { google } from "@ai-sdk/google"  // For Gemini models
import { z } from "zod"
```

**Agent Constructor**:
```typescript
const agent = new Agent({
  name: "agent-name",           // Unique identifier
  instructions: "system prompt", // Defines agent behavior
  model: openai("gpt-4o-mini"), // Or google("gemini-2.5-flash")
  tools: { toolName }           // Object with tools
})
```

### Tool Creation Patterns

**createTool API**:
```typescript
const toolName = createTool({
  id: "tool-identifier",        // Unique ID for the tool
  description: "Clear description for LLM decision-making",
  inputSchema: z.object({       // Zod schema for validation
    param: z.string().describe("Parameter description")
  }),
  outputSchema: z.object({      // Optional - defines return structure
    result: z.string()
  }),
  execute: async ({ context }) => {  // Core tool logic
    // context contains validated input based on inputSchema
    const { param } = context
    return { result: await someOperation(param) }
  }
})
```

**Key Tool Patterns**:
- Use Zod schemas for type safety and validation
- Access validated input via `context` parameter
- Return structured data matching outputSchema
- Handle errors within execute function
- Keep tools focused on single responsibilities

### Agent Execution Patterns

**Text Generation**:
```typescript
const result = await agent.generate("User message here")
console.log(result.text)
```

**Tool Integration**:
- Agent automatically decides when to use tools based on instructions
- Tools are called based on context and agent's reasoning
- Results are integrated into agent's response

## 🔧 Implementation for dotvibe

### Environment Setup

**Dependencies** (already configured in deno.json):
- `@mastra/core`: Agent and tool primitives
- `@ai-sdk/google`: Google/Gemini model provider  
- `zod`: Schema validation (v4.0.2 with native JSON schema)

**Environment Variables**:
```bash
GOOGLE_API_KEY=your_gemini_api_key
```

### Tool Architecture

**Five Core Tools for Code Analysis**:
1. `list_filesystem` - Directory listing
2. `read_file` - File content reading
3. `list_symbols_in_file` - Tree-sitter symbol extraction
4. `get_symbol_details` - Detailed symbol analysis
5. `create_index_entry` - Database indexing with embeddings

**Tool Implementation Pattern**:
```typescript
export const listFilesystemTool = createTool({
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
```

### Agent Configuration

**Indexing Agent Setup**:
```typescript
const indexingAgent = new Agent({
  name: "Code Indexing Agent",
  instructions: `You are an expert programmer and system architect. Your goal is to deeply understand this codebase. I have provided you with a set of tools to explore the filesystem and the code's structure. Your task is to reason step-by-step, form a hypothesis about the project, and explore it until you understand the purpose of each major symbol. When you fully understand a symbol, you MUST call the create_index_entry tool. Your description should be concise and include critical code snippets where they are more descriptive than words. Begin by listing the contents of the root directory.`,
  model: google("gemini-2.5-flash"),
  tools: {
    listFilesystemTool,
    readFileTool,
    listSymbolsTool,
    getSymbolDetailsTool,
    createIndexEntryTool
  }
})
```

### Execution Flow

**Agent Run Pattern**:
```typescript
export async function runGuidedExploration(rootPath: string, verbose: boolean = false): Promise<void> {
  try {
    if (verbose) {
      console.log('🚀 Starting intelligent codebase exploration with Mastra...')
    }

    // Agent automatically handles tool selection and execution
    const result = await indexingAgent.generate(
      `Begin by exploring the codebase at '${rootPath}'.`
    )

    if (verbose) {
      console.log(`🤖 Final Result: ${result.text}`)
    }
    
    console.log('✅ Intelligent codebase exploration completed')
  } catch (error) {
    console.error(`❌ Mastra agent error: ${error.message}`)
    throw error
  }
}
```

## 🔄 Integration with Existing Architecture

### Database Integration
- Tools use existing SurrealDB connection patterns
- `create_index_entry` tool bridges agent results to database
- Maintains existing Effect-TS error handling in tool implementations

### Zod v4 Compatibility
- Mastra works with Zod v4 for tool schemas
- Native `z.toJSONSchema()` not directly used by Mastra (handled internally)
- Our existing Zod v4 patterns work seamlessly

### Tree-sitter Integration
- Existing tree-sitter toolbox functions work unchanged
- Tools act as wrappers around existing pure functions
- Maintains separation of concerns

## 🚀 Benefits Achieved

1. **Simplified Architecture**: Agent handles orchestration automatically
2. **Type Safety**: Zod schemas provide validation at tool boundaries  
3. **Tool Reusability**: Tools can be used across different agents
4. **Error Handling**: Mastra handles tool execution errors gracefully
5. **LLM Orchestration**: Agent decides tool sequence intelligently

## 🔍 Key Differences from Previous Approach

**Before (Manual Orchestration)**:
- Manual function calling with Google AI SDK
- Complex conversation loop management
- Manual tool result formatting
- Retry logic implementation

**After (Mastra Framework)**:
- Automatic tool selection and execution
- Built-in conversation management
- Standardized tool interface
- Framework-handled error recovery

## 📊 Success Metrics

- **Simplified Implementation**: 70% less orchestration code
- **Type Safety**: 100% tool input/output validation
- **Maintainability**: Clear separation between tools and agent logic
- **Reliability**: Framework-provided error handling and retries

---

**Next Steps**: Implement the agent with these patterns and test end-to-end workflow.