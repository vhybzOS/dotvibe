/**
 * Simplified Google GenAI LLM Integration
 * 
 * Pure Google GenAI wrapper focused on LLM operations without mock handling or complex orchestration.
 * Extracted from bridge.ts to provide clean, focused LLM integration.
 * Uses windowing system for conversation management.
 * 
 * @tested_by tests/agent/llm.test.ts (Google GenAI integration, response handling)
 */

import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai'
import { Effect, pipe } from 'effect'
import type { VibeError } from '../index.ts'
import { createConfigurationError } from '../core/errors.ts'
import type { 
  AgentConfig,
  TokenEstimate,
  MessageSource
} from './types.ts'

/**
 * LLM response structure
 */
export interface LLMResponse {
  content: string
  tokenUsage: TokenEstimate
  model: string
  responseTime: number
  functionCalls?: Array<{
    name: string
    arguments: Record<string, unknown>
  }>
}

/**
 * LLM client configuration
 */
export interface LLMConfig {
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
  enableFunctionCalling?: boolean
}

/**
 * LLM request options
 */
export interface LLMRequestOptions {
  temperature?: number
  maxTokens?: number
  systemInstruction?: string
  functionDeclarations?: FunctionDeclaration[]
  conversationHistory?: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
}

/**
 * LLM client instance
 */
export interface LLMClient {
  generateResponse: (prompt: string, options?: LLMRequestOptions) => Promise<LLMResponse>
  generateResponseEffect: (prompt: string, options?: LLMRequestOptions) => Effect.Effect<LLMResponse, VibeError>
  estimateTokens: (text: string) => TokenEstimate
  getConfig: () => LLMConfig
}

/**
 * Create LLM client using functional pattern
 */
export const createLLMClient = (config: LLMConfig): LLMClient => {
  const genAI = new GoogleGenAI({ apiKey: config.apiKey })
  
  // Token estimation helper
  const estimateTokens = (text: string): TokenEstimate => {
    // Simple token estimation (4 chars per token average)
    const estimatedTokens = Math.ceil(text.length / 4)
    return {
      totalTokens: estimatedTokens,
      inputTokens: estimatedTokens,
      outputTokens: 0,
      tokenizer: 'cl100k'
    }
  }
  
  // Format conversation history for Google GenAI
  const formatConversationHistory = (
    prompt: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []
  ): string => {
    if (history.length === 0) return prompt
    
    const contextMessages = history.map(msg => `${msg.role}: ${msg.content}`).join('\n')
    return `${contextMessages}\nuser: ${prompt}`
  }
  
  // Core generate response function
  const generateResponse = async (
    prompt: string,
    options: LLMRequestOptions = {}
  ): Promise<LLMResponse> => {
    const startTime = Date.now()
    
    // Prepare request
    const fullPrompt = formatConversationHistory(prompt, options.conversationHistory)
    const inputEstimate = estimateTokens(fullPrompt)
    
    // Build request configuration
    const requestConfig = {
      model: config.model,
      contents: fullPrompt,
      config: {
        systemInstruction: options.systemInstruction || 'You are a helpful AI assistant.',
        temperature: options.temperature ?? config.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? config.maxTokens ?? 4096,
        
        // Function calling configuration
        ...(config.enableFunctionCalling && options.functionDeclarations?.length ? {
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: options.functionDeclarations.map(fd => fd.name)
            }
          },
          tools: [{
            functionDeclarations: options.functionDeclarations
          }]
        } : {})
      }
    }
    
    try {
      // Call Google GenAI
      const response = await genAI.models.generateContent(requestConfig)
      const responseTime = Date.now() - startTime
      
      // Extract response content
      const content = response.text || ''
      const outputEstimate = estimateTokens(content)
      
      return {
        content,
        tokenUsage: {
          totalTokens: inputEstimate.totalTokens + outputEstimate.totalTokens,
          inputTokens: inputEstimate.totalTokens,
          outputTokens: outputEstimate.totalTokens,
          tokenizer: 'cl100k'
        },
        model: config.model,
        responseTime,
        functionCalls: response.functionCalls ? response.functionCalls.map(fc => ({
          name: fc.name || 'unknown',
          arguments: fc.args || {}
        })) : undefined
      }
    } catch (error) {
      throw createConfigurationError(
        error,
        `Failed to generate response with ${config.model}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  
  // Effect-TS wrapper
  const generateResponseEffect = (
    prompt: string,
    options: LLMRequestOptions = {}
  ): Effect.Effect<LLMResponse, VibeError> =>
    Effect.tryPromise({
      try: () => generateResponse(prompt, options),
      catch: (error) => error as VibeError
    })
  
  const getConfig = (): LLMConfig => ({ ...config })
  
  return {
    generateResponse,
    generateResponseEffect,
    estimateTokens,
    getConfig
  }
}

/**
 * Create LLM client from agent config
 */
export const createLLMClientFromAgentConfig = (config: AgentConfig): LLMClient => {
  return createLLMClient({
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    enableFunctionCalling: config.enableFunctionCalling
  })
}

/**
 * Batch process multiple prompts
 */
export const batchGenerateResponses = async (
  client: LLMClient,
  prompts: Array<{ prompt: string; options?: LLMRequestOptions }>,
  concurrency: number = 3
): Promise<LLMResponse[]> => {
  const results: LLMResponse[] = []
  
  // Process in batches to respect rate limits
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency)
    const batchPromises = batch.map(({ prompt, options }) => 
      client.generateResponse(prompt, options)
    )
    
    const batchResults = await Promise.allSettled(batchPromises)
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        // Create error response
        const originalPrompt = batch[index].prompt
        results.push({
          content: '',
          tokenUsage: client.estimateTokens(originalPrompt),
          model: client.getConfig().model,
          responseTime: 0,
          functionCalls: []
        })
      }
    })
  }
  
  return results
}

/**
 * Generate search phrases for improved code discoverability
 */
export const generateSearchPhrases = async (
  client: LLMClient,
  symbolName: string,
  symbolKind: string,
  code: string,
  description: string
): Promise<string[]> => {
  const prompt = `
Analyze this code symbol and generate 3-5 search phrases that would help developers find this code.
Focus on:
- What the code does functionally
- Key concepts and patterns used
- Common search terms developers would use
- Technical keywords and domain terms

Symbol: ${symbolName} (${symbolKind})
Description: ${description}
Code:
\`\`\`
${code}
\`\`\`

Generate 3-5 concise search phrases (2-4 words each) that capture different aspects of what this code does.
Return only the phrases, one per line, no explanations.
`

  try {
    const response = await client.generateResponse(prompt, {
      systemInstruction: 'You are a code analysis expert that generates search phrases to help developers find relevant code.',
      temperature: 0.3,
      maxTokens: 200
    })
    
    // Parse response into phrases
    const phrases = response.content
      .split('\n')
      .map(phrase => phrase.trim())
      .filter(phrase => phrase.length > 0 && phrase.length < 50)
      .slice(0, 5) // Limit to 5 phrases
    
    return phrases.length > 0 ? phrases : ['code symbol', 'programming', symbolKind.replace('_', ' ')]
  } catch (error) {
    // Fallback to basic phrases if LLM fails
    return ['code symbol', 'programming', symbolKind.replace('_', ' '), symbolName.toLowerCase()]
  }
}

/**
 * Stream response chunks (placeholder for future streaming support)
 */
export const streamResponse = async function* (
  client: LLMClient,
  prompt: string,
  options: LLMRequestOptions = {}
): AsyncGenerator<string, void, unknown> {
  // For now, yield the complete response
  // TODO: Implement actual streaming when Google GenAI supports it
  const response = await client.generateResponse(prompt, options)
  yield response.content
}

/**
 * Utility functions
 */
export const LLMUtils = {
  createLLMClient,
  createLLMClientFromAgentConfig,
  batchGenerateResponses,
  generateSearchPhrases,
  streamResponse
} as const