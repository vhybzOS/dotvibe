/**
 * Central Configuration Module
 * 
 * Single source of truth for all configuration across the dotvibe system.
 * Replaces scattered configuration values throughout the codebase.
 * 
 * @tested_by tests/core/config.test.ts (Configuration loading, validation, defaults)
 */

import { z } from 'zod/v4'
import { Effect, pipe } from 'effect'
import { createConfigurationError, type VibeError } from '../index.ts'

/**
 * LLM Configuration Schema
 */
export const LLMConfigSchema = z.object({
  /** Google AI model name */
  model: z.string().default('gemini-2.5-flash'),
  
  /** Google AI API key */
  apiKey: z.string().min(1),
  
  /** Temperature for text generation (0-1) */
  temperature: z.number().min(0).max(1).default(0.7),
  
  /** Maximum tokens for generation */
  maxTokens: z.number().int().min(1).default(1000000),
  
  /** Enable function calling */
  enableFunctionCalling: z.boolean().default(true),
  
  /** Maximum concurrent requests */
  maxConcurrentRequests: z.number().int().min(1).default(3),
  
  /** Request timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).default(30000),
  
  /** Retry configuration */
  retries: z.object({
    maxRetries: z.number().int().min(0).default(3),
    delayMs: z.number().int().min(100).default(1000)
  }).default({ maxRetries: 3, delayMs: 1000 })
})

/**
 * Storage Configuration Schema
 */
export const StorageConfigSchema = z.object({
  /** SurrealDB host */
  host: z.string().default('127.0.0.1'),
  
  /** SurrealDB port */
  port: z.number().int().min(1).max(65535).default(4243),
  
  /** Database username */
  username: z.string().default('root'),
  
  /** Database password */
  password: z.string().default('root'),
  
  /** Database namespace */
  namespace: z.string().default('vibe'),
  
  /** Database name */
  database: z.string().default('code'),
  
  /** Connection timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).default(10000),
  
  /** Connection pool size */
  poolSize: z.number().int().min(1).default(10),
  
  /** Enable connection pooling */
  enablePooling: z.boolean().default(true)
})

/**
 * Tree-sitter Configuration Schema
 */
export const TreeSitterConfigSchema = z.object({
  /** Custom WASM path (optional - will auto-resolve if not provided) */
  wasmPath: z.string().optional(),
  
  /** Supported languages */
  languages: z.array(z.string()).default(['typescript', 'javascript']),
  
  /** WASM cache directory */
  cacheDir: z.string().optional(),
  
  /** Enable parser caching */
  enableCaching: z.boolean().default(true),
  
  /** Parser timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).default(5000),
  
  /** Maximum file size to parse (bytes) */
  maxFileSize: z.number().int().min(1).default(10 * 1024 * 1024) // 10MB
})

/**
 * Processing Configuration Schema
 */
export const ProcessingConfigSchema = z.object({
  /** Parallel processing limit */
  parallelLimit: z.number().int().min(1).default(10),
  
  /** Rate limiting (requests per second) */
  rateLimit: z.number().int().min(1).default(3),
  
  /** Processing strategy */
  strategy: z.enum(['per-file', 'per-component', 'per-batch']).default('per-component'),
  
  /** Batch size for batch processing */
  batchSize: z.number().int().min(1).default(50),
  
  /** Enable progress dashboard */
  enableProgressDashboard: z.boolean().default(true),
  
  /** Progress update interval (milliseconds) */
  progressUpdateInterval: z.number().int().min(100).default(2000),
  
  /** Memory limit for processing (MB) */
  memoryLimitMB: z.number().int().min(100).default(2048)
})

/**
 * Embedding Configuration Schema
 */
export const EmbeddingConfigSchema = z.object({
  /** Embedding model name */
  model: z.string().default('text-embedding-004'),
  
  /** Embedding dimensions */
  dimensions: z.number().int().min(1).default(768),
  
  /** Task type for embeddings */
  taskType: z.enum(['RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT', 'SEMANTIC_SIMILARITY', 'CLASSIFICATION', 'CLUSTERING']).default('SEMANTIC_SIMILARITY'),
  
  /** Batch size for embedding generation */
  batchSize: z.number().int().min(1).default(100),
  
  /** Enable embedding caching */
  enableCaching: z.boolean().default(true),
  
  /** Cache TTL in seconds */
  cacheTTL: z.number().int().min(60).default(3600), // 1 hour
  
  /** Similarity threshold for searches */
  similarityThreshold: z.number().min(0).max(1).default(0.1)
})

/**
 * Logging Configuration Schema
 */
export const LoggingConfigSchema = z.object({
  /** Log level */
  level: z.enum(['QUIET', 'NORMAL', 'VERBOSE', 'DEBUG']).default('NORMAL'),
  
  /** Enable timestamps */
  timestamps: z.boolean().default(false),
  
  /** Enable colored output */
  colors: z.boolean().default(true),
  
  /** Enable file logging */
  enableFileLogging: z.boolean().default(false),
  
  /** Log file path */
  logFile: z.string().optional(),
  
  /** Log rotation size (MB) */
  rotationSizeMB: z.number().int().min(1).default(10),
  
  /** Maximum log files to keep */
  maxLogFiles: z.number().int().min(1).default(5)
})

/**
 * Workspace Configuration Schema
 */
export const WorkspaceConfigSchema = z.object({
  /** Workspace directory name */
  workspaceDir: z.string().default('.vibe'),
  
  /** Database file name */
  dbFile: z.string().default('code.db'),
  
  /** Server PID file name */
  pidFile: z.string().default('server.pid'),
  
  /** Lock file name */
  lockFile: z.string().default('workspace.lock'),
  
  /** Enable workspace auto-cleanup */
  enableAutoCleanup: z.boolean().default(true),
  
  /** Cleanup interval (hours) */
  cleanupInterval: z.number().int().min(1).default(24)
})

/**
 * Main Configuration Schema
 */
export const VibeConfigSchema = z.object({
  /** LLM configuration */
  llm: LLMConfigSchema.default({}),
  
  /** Storage configuration */
  storage: StorageConfigSchema.default({}),
  
  /** Tree-sitter configuration */
  treeSitter: TreeSitterConfigSchema.default({}),
  
  /** Processing configuration */
  processing: ProcessingConfigSchema.default({}),
  
  /** Embedding configuration */
  embedding: EmbeddingConfigSchema.default({}),
  
  /** Logging configuration */
  logging: LoggingConfigSchema.default({}),
  
  /** Workspace configuration */
  workspace: WorkspaceConfigSchema.default({})
})

/**
 * Configuration type inference
 */
export type VibeConfig = z.infer<typeof VibeConfigSchema>
export type LLMConfig = z.infer<typeof LLMConfigSchema>
export type StorageConfig = z.infer<typeof StorageConfigSchema>
export type TreeSitterConfig = z.infer<typeof TreeSitterConfigSchema>
export type ProcessingConfig = z.infer<typeof ProcessingConfigSchema>
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>

/**
 * Environment variable mappings
 */
const ENV_MAPPINGS = {
  // LLM
  'GOOGLE_API_KEY': 'llm.apiKey',
  'GEMINI_CHAT_MODEL': 'llm.model',
  'GEMINI_EMBEDDING_MODEL': 'embedding.model',
  'LLM_TEMPERATURE': 'llm.temperature',
  'LLM_MAX_TOKENS': 'llm.maxTokens',
  
  // Storage
  'SURREAL_HOST': 'storage.host',
  'SURREAL_PORT': 'storage.port',
  'SURREAL_USERNAME': 'storage.username',
  'SURREAL_PASSWORD': 'storage.password',
  'SURREAL_NAMESPACE': 'storage.namespace',
  'SURREAL_DATABASE': 'storage.database',
  
  // Processing
  'PROCESSING_PARALLEL_LIMIT': 'processing.parallelLimit',
  'PROCESSING_RATE_LIMIT': 'processing.rateLimit',
  'PROCESSING_STRATEGY': 'processing.strategy',
  
  // Logging
  'LOG_LEVEL': 'logging.level',
  'LOG_COLORS': 'logging.colors',
  'LOG_FILE': 'logging.logFile',
  
  // Workspace
  'VIBE_WORKSPACE_DIR': 'workspace.workspaceDir'
} as const

/**
 * Parse .env file content
 */
const parseEnvFile = (content: string): Record<string, string> => {
  const envVars: Record<string, string> = {}
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim()
      }
    }
  }
  
  return envVars
}

/**
 * Load configuration from .env file
 */
const loadFromEnvFile = async (envFile: string = '.env'): Promise<Partial<VibeConfig>> => {
  try {
    const content = await Deno.readTextFile(envFile)
    const envVars = parseEnvFile(content)
    return envVarsToConfig(envVars)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {} // .env file is optional
    }
    throw error
  }
}

/**
 * Convert environment variables to config structure
 */
const envVarsToConfig = (envVars: Record<string, string>): Partial<VibeConfig> => {
  const config: any = {}
  
  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const envValue = envVars[envVar]
    if (envValue !== undefined) {
      // Convert string values to appropriate types
      let value: any = envValue
      
      // Boolean conversion
      if (envValue.toLowerCase() === 'true') value = true
      else if (envValue.toLowerCase() === 'false') value = false
      // Number conversion
      else if (/^\d+$/.test(envValue)) value = parseInt(envValue, 10)
      else if (/^\d+\.\d+$/.test(envValue)) value = parseFloat(envValue)
      
      // Set nested property
      const parts = configPath.split('.')
      let current = config
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!
        if (!(part in current)) current[part] = {}
        current = current[part]
      }
      current[parts[parts.length - 1]!] = value
    }
  }
  
  return config
}

/**
 * Resolve tree-sitter WASM path dynamically
 */
const resolveWasmPath = async (language: string): Promise<string> => {
  const cacheBase = `${Deno.env.get('HOME')}/.cache/deno/npm/registry.npmjs.org`
  const packageName = `tree-sitter-${language}`
  
  try {
    // Find the package directory
    const packageDir = `${cacheBase}/${packageName}`
    
    // Look for version directories
    const entries = []
    for await (const entry of Deno.readDir(packageDir)) {
      if (entry.isDirectory) {
        entries.push(entry.name)
      }
    }
    
    // Sort versions and take the latest
    const latestVersion = entries.sort().reverse()[0]
    
    if (!latestVersion) {
      throw new Error(`No version found for ${packageName}`)
    }
    
    const wasmPath = `${packageDir}/${latestVersion}/${packageName}.wasm`
    
    // Verify the file exists
    await Deno.stat(wasmPath)
    
    return wasmPath
  } catch (error) {
    throw new Error(`Failed to resolve WASM path for ${language}: ${error}`)
  }
}

/**
 * Load configuration (KISS: .env file + programmatic overrides)
 */
export const loadConfig = async (options: {
  envFile?: string
  overrides?: Partial<VibeConfig>
  requireApiKey?: boolean
} = {}): Promise<VibeConfig> => {
  const { envFile = '.env', overrides = {}, requireApiKey = true } = options
  
  // Simple: .env file + overrides
  const envConfig = await loadFromEnvFile(envFile)
  const mergedConfig = { ...envConfig, ...overrides }
  
  // Validate and parse with defaults (Zod will fill in missing nested objects)
  const config = VibeConfigSchema.parse(mergedConfig)
  
  // Validate API key requirement
  if (requireApiKey && !config.llm.apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required')
  }
  
  // Resolve WASM paths if not provided
  if (!config.treeSitter.wasmPath) {
    try {
      config.treeSitter.wasmPath = await resolveWasmPath('typescript')
    } catch (error) {
      console.warn(`Warning: Could not resolve WASM path: ${error}`)
    }
  }
  
  return config
}

/**
 * Load configuration with Effect wrapper
 */
export const loadConfigEffect = (options: {
  envFile?: string
  overrides?: Partial<VibeConfig>
  requireApiKey?: boolean
} = {}): Effect.Effect<VibeConfig, VibeError> => {
  return Effect.tryPromise({
    try: () => loadConfig(options),
    catch: (error) => createConfigurationError(error, 'Failed to load configuration')
  })
}

/**
 * Update configuration programmatically (for future web UI, etc.)
 * Example: updateConfig({ llm: { model: 'gemini-2.5-ultra' } })
 */
export const updateConfig = async (updates: Partial<VibeConfig>, envFile: string = '.env'): Promise<VibeConfig> => {
  const currentConfig = await loadConfig({ envFile, requireApiKey: false })
  
  // Deep merge the updates with current config
  const updatedConfig = deepMergeUpdates(currentConfig, updates)
  
  // Convert back to .env format and save
  const envContent = configToEnvContent(updatedConfig)
  await Deno.writeTextFile(envFile, envContent)
  
  return updatedConfig
}

/**
 * Deep merge updates into current config
 */
const deepMergeUpdates = (current: VibeConfig, updates: Partial<VibeConfig>): VibeConfig => {
  const result = { ...current }
  
  for (const key in updates) {
    const updateValue = updates[key as keyof VibeConfig]
    if (updateValue && typeof updateValue === 'object' && !Array.isArray(updateValue)) {
      result[key as keyof VibeConfig] = { 
        ...result[key as keyof VibeConfig], 
        ...updateValue 
      } as any
    } else if (updateValue !== undefined) {
      ;(result as any)[key] = updateValue
    }
  }
  
  return result
}

/**
 * Convert config object back to .env file content
 */
const configToEnvContent = (config: VibeConfig): string => {
  const lines: string[] = []
  
  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const parts = configPath.split('.')
    let value: any = config
    
    // Navigate to nested property
    for (const part of parts) {
      value = value?.[part]
    }
    
    if (value !== undefined) {
      lines.push(`${envVar}=${value}`)
    }
  }
  
  return lines.join('\n')
}

/**
 * Get default configuration
 */
export const getDefaultConfig = (): VibeConfig => {
  return VibeConfigSchema.parse({
    llm: { apiKey: 'required' }, // Will be overridden by actual API key
    storage: {},
    treeSitter: {},
    processing: {},
    embedding: {},
    logging: {},
    workspace: {}
  })
}

/**
 * Validate configuration
 */
export const validateConfig = (config: unknown): Effect.Effect<VibeConfig, VibeError> => {
  return Effect.tryPromise({
    try: async () => VibeConfigSchema.parse(config),
    catch: (error) => createConfigurationError(error, 'Configuration validation failed')
  })
}

/**
 * Get configuration for specific subsystem
 */
export const getSubsystemConfig = <T extends keyof VibeConfig>(
  config: VibeConfig,
  subsystem: T
): VibeConfig[T] => {
  return config[subsystem]
}

/**
 * Create configuration with overrides
 */
export const createConfig = (overrides: Partial<VibeConfig> = {}): VibeConfig => {
  const defaults = getDefaultConfig()
  return { ...defaults, ...overrides }
}

/**
 * Configuration utilities
 */
export const ConfigUtils = {
  load: loadConfig,
  loadEffect: loadConfigEffect,
  update: updateConfig,
  validate: validateConfig,
  getDefault: getDefaultConfig,
  getSubsystem: getSubsystemConfig,
  create: createConfig,
  resolveWasmPath
} as const