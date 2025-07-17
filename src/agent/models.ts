/**
 * Agent Models Configuration
 * 
 * Provides environment-driven model configuration and tokenizer mapping
 * for the agent system.
 * 
 * @tested_by tests/agent/models.test.ts (Configuration loading, tokenizer mapping)
 */

import { z } from 'zod/v4'
import type { AgentConfig, TokenizerMapping, EnvironmentConfig } from './types.ts'

/**
 * Agent configuration schema for validation
 */
const AgentConfigSchema = z.object({
  model: z.string().min(1, 'Model name is required'),
  maxTokens: z.number().positive('Max tokens must be positive'),
  apiKey: z.string().min(1, 'API key is required'),
  enableFunctionCalling: z.boolean(),
  temperature: z.number().min(0).max(1).optional(),
  verbose: z.boolean().optional()
})

/**
 * Options for loading agent configuration
 */
export interface LoadConfigOptions {
  /** Override model name */
  model?: string
  
  /** Override max tokens */
  maxTokens?: number
  
  /** Override temperature */
  temperature?: number
  
  /** Override verbose setting */
  verbose?: boolean
  
  /** Whether to require API key (default: false for testing) */
  requireApiKey?: boolean
}

/**
 * Load agent configuration from environment variables with optional overrides
 */
export function loadAgentConfig(options: LoadConfigOptions = {}): AgentConfig {
  const {
    model: overrideModel,
    maxTokens: overrideMaxTokens,
    temperature: overrideTemperature,
    verbose: overrideVerbose,
    requireApiKey = false
  } = options
  
  // Get environment variables
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  const chatModel = Deno.env.get('GEMINI_CHAT_MODEL')
  
  // Check for required API key
  if (requireApiKey && !apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required')
  }
  
  // Build configuration with defaults and overrides
  const config: AgentConfig = {
    model: overrideModel ?? chatModel ?? 'gemini-2.5-flash',
    maxTokens: overrideMaxTokens ?? 1000000,
    apiKey: apiKey ?? 'test-api-key', // Default for testing
    enableFunctionCalling: true,
    ...(overrideTemperature !== undefined && { temperature: overrideTemperature }),
    ...(overrideVerbose !== undefined && { verbose: overrideVerbose })
  }
  
  return config
}

/**
 * Default tokenizer mappings for code2prompt
 */
const DEFAULT_TOKENIZER_MAPPINGS: TokenizerMapping[] = [
  { modelPattern: 'gemini', tokenizer: 'cl100k' },
  { modelPattern: 'gpt-4', tokenizer: 'cl100k' },
  { modelPattern: 'gpt-3.5', tokenizer: 'cl100k' },
  { modelPattern: 'claude', tokenizer: 'cl100k' },
  { modelPattern: 'default', tokenizer: 'cl100k' }
]

/**
 * Map model name to appropriate code2prompt tokenizer
 */
export function mapModelToCode2promptTokenizer(modelName: string): string {
  const normalizedModel = modelName.toLowerCase()
  
  // Find matching tokenizer mapping
  for (const mapping of DEFAULT_TOKENIZER_MAPPINGS) {
    if (normalizedModel.includes(mapping.modelPattern.toLowerCase())) {
      return mapping.tokenizer
    }
  }
  
  // Default to cl100k if no specific mapping found
  return 'cl100k'
}

/**
 * Get all default tokenizer mappings
 */
export function getDefaultTokenizerMappings(): TokenizerMapping[] {
  return [...DEFAULT_TOKENIZER_MAPPINGS]
}

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Validate agent configuration using Zod schema
 */
export function validateAgentConfig(config: AgentConfig): ValidationResult<AgentConfig> {
  try {
    const validatedConfig = AgentConfigSchema.parse(config)
    return {
      success: true,
      data: validatedConfig as AgentConfig
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Get embedding model configuration separately from chat model
 */
export function getEmbeddingModel(): string {
  return Deno.env.get('GEMINI_EMBEDDING_MODEL') ?? 'text-embedding-004'
}

/**
 * Check if environment is properly configured
 */
export function checkEnvironmentConfiguration(): EnvironmentConfig {
  const env: EnvironmentConfig = {}
  
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  const chatModel = Deno.env.get('GEMINI_CHAT_MODEL')
  const embeddingModel = Deno.env.get('GEMINI_EMBEDDING_MODEL')
  
  if (apiKey) env.GOOGLE_API_KEY = apiKey
  if (chatModel) env.GEMINI_CHAT_MODEL = chatModel
  if (embeddingModel) env.GEMINI_EMBEDDING_MODEL = embeddingModel
  
  return env
}

/**
 * Format token count for human-readable display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`
  } else {
    return tokens.toString()
  }
}

/**
 * Calculate token percentage
 */
export function calculateTokenPercentage(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.round((current / max) * 100))
}