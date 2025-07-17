/**
 * Agent System Core Types
 * 
 * Defines core interfaces and types for the modular agent system.
 * Designed to match Mastra patterns exactly for seamless future migration.
 * 
 * @tested_by tests/agent/types.test.ts (Interface definitions, type safety)
 */

/**
 * Thread context for managing conversation state and token limits
 */
export interface ThreadContext {
  /** Unique identifier for the conversation thread */
  threadId: string
  
  /** Optional resource identifier for persistence */
  resourceId?: string
  
  /** Maximum token limit for this thread */
  maxTokens: number
  
  /** Current token count in the thread */
  currentTokens: number
  
  /** Model being used for this thread */
  model: string
}

/**
 * Token estimation and counting information
 */
export interface TokenEstimate {
  /** Total token count */
  totalTokens: number
  
  /** Input/prompt token count */
  inputTokens: number
  
  /** Output/response token count */
  outputTokens: number
  
  /** Tokenizer used for counting */
  tokenizer: string
}

/**
 * Agent configuration settings
 */
export interface AgentConfig {
  /** Model name (e.g., 'gemini-2.5-flash') */
  model: string
  
  /** Maximum token limit */
  maxTokens: number
  
  /** API key for the model provider */
  apiKey: string
  
  /** Whether to enable function calling */
  enableFunctionCalling: boolean
  
  /** Optional temperature setting (0.0-1.0) */
  temperature?: number
  
  /** Optional verbose logging */
  verbose?: boolean
}

/**
 * Valid message roles in conversations (matching mastra exactly)
 */
export type MessageRole = 'user' | 'assistant'

/**
 * Thread state for tracking conversation status
 */
export type ThreadState = 'active' | 'paused' | 'completed' | 'error'

/**
 * Message source type (matching mastra exactly)
 */
export type MessageSource = 'memory' | 'response' | 'user' | 'system' | 'context'

/**
 * ID Generator function type (matching mastra exactly)
 */
export type IDGenerator = () => string

/**
 * Memory info for thread persistence (matching mastra exactly)
 */
export interface MemoryInfo {
  threadId: string
  resourceId?: string
}

/**
 * Mastra-compatible message content structure (exact match for V2)
 */
export interface MastraMessageContentV2 {
  format: 2 // format 2 === UIMessage in AI SDK v4
  parts: any[] // AI SDK UIMessage parts
  experimental_attachments?: any[]
  content?: string
  toolInvocations?: any[]
  reasoning?: any[]
  annotations?: any[]
  metadata?: Record<string, unknown>
}

/**
 * Mastra-compatible message structure (exact match for drop-in replacement)
 */
export interface MastraMessageV2 {
  id: string
  content: MastraMessageContentV2
  role: MessageRole
  createdAt: Date
  threadId?: string
  resourceId?: string
  type?: string
}

/**
 * Core message for system messages (matching mastra/AI SDK)
 */
export interface CoreSystemMessage {
  role: 'system'
  content: string
}

/**
 * Core message type (simplified from AI SDK)
 */
export interface CoreMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | any[]
}

/**
 * UI Message type (simplified from AI SDK)
 */
export interface UIMessage {
  id?: string
  role: MessageRole
  parts: any[]
  experimental_attachments?: any[]
  content?: string
  toolInvocations?: any[]
  reasoning?: any[]
  annotations?: any[]
}

/**
 * Message input types (matching mastra exactly)
 */
export type MessageInput = string | UIMessage | CoreMessage | MastraMessageV2

/**
 * Standard agent message structure (simplified for internal use)
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string
  
  /** Message role */
  role: MessageRole
  
  /** Message content */
  content: string
  
  /** Message timestamp */
  timestamp: Date
  
  /** Optional token count for this message */
  tokenCount?: number
  
  /** Optional metadata for tool calls, function results, etc. */
  metadata?: Record<string, unknown>
}

/**
 * Progress tracking for token usage display
 */
export interface ProgressDisplay {
  /** Current tokens in human-readable format (e.g., "240K") */
  current: string
  
  /** Maximum tokens in human-readable format (e.g., "1M") */
  max: string
  
  /** Percentage of tokens used (0-100) */
  percentage: number
  
  /** Raw current token count */
  currentRaw: number
  
  /** Raw maximum token count */
  maxRaw: number
}

/**
 * Environment variable configuration
 */
export interface EnvironmentConfig {
  /** Google API key */
  GOOGLE_API_KEY?: string
  
  /** Chat model name */
  GEMINI_CHAT_MODEL?: string
  
  /** Embedding model name */
  GEMINI_EMBEDDING_MODEL?: string
}

/**
 * Model to tokenizer mapping for code2prompt
 */
export interface TokenizerMapping {
  /** Model name pattern */
  modelPattern: string
  
  /** Corresponding code2prompt tokenizer */
  tokenizer: string
}

/**
 * code2prompt CLI options
 */
export interface Code2PromptOptions {
  /** Output format (markdown, json, xml) */
  outputFormat: 'markdown' | 'json' | 'xml'
  
  /** Include token counting */
  includeTokens: boolean
  
  /** Tokenizer to use */
  tokenizer: string
  
  /** File patterns to include */
  include?: string[]
  
  /** File patterns to exclude */
  exclude?: string[]
  
  /** Maximum file size to process */
  maxFileSize?: number
}