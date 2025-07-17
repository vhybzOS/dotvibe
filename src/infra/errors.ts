/**
 * Unified Error Handling System
 * 
 * Extracts and consolidates error handling from src/index.ts into a central module
 * with tagged union types for better error management and debugging.
 * 
 * @tested_by tests/core/errors.test.ts (Error creation, handling, serialization)
 */

import { logSystem } from './logger.ts'

/**
 * Base error interface for all Vibe errors
 */
export interface BaseVibeError {
  readonly _tag: string
  readonly message: string
  readonly cause?: unknown
  readonly timestamp: Date
  readonly context?: Record<string, unknown>
}

/**
 * Storage operation error
 */
export interface StorageError extends BaseVibeError {
  readonly _tag: 'StorageError'
  readonly operation: 'connect' | 'query' | 'upsert' | 'delete' | 'schema' | 'transaction'
  readonly resource: string
  readonly details?: {
    query?: string
    params?: Record<string, unknown>
    connectionInfo?: string
  }
}

/**
 * Configuration error
 */
export interface ConfigurationError extends BaseVibeError {
  readonly _tag: 'ConfigurationError'
  readonly configType: 'environment' | 'file' | 'schema' | 'validation'
  readonly configPath?: string
  readonly invalidFields?: string[]
}

/**
 * Network operation error
 */
export interface NetworkError extends BaseVibeError {
  readonly _tag: 'NetworkError'
  readonly service: string
  readonly operation: string
  readonly statusCode?: number
  readonly headers?: Record<string, string>
  readonly retryable?: boolean
}

/**
 * Processing error
 */
export interface ProcessingError extends BaseVibeError {
  readonly _tag: 'ProcessingError'
  readonly stage: 'parsing' | 'analysis' | 'indexing' | 'embedding' | 'validation'
  readonly filePath?: string
  readonly componentName?: string
  readonly recoverable?: boolean
}

/**
 * File system error
 */
export interface FileSystemError extends BaseVibeError {
  readonly _tag: 'FileSystemError'
  readonly operation: 'read' | 'write' | 'delete' | 'create' | 'stat' | 'watch'
  readonly path: string
  readonly permissions?: boolean
}

/**
 * Validation error
 */
export interface ValidationError extends BaseVibeError {
  readonly _tag: 'ValidationError'
  readonly schemaName: string
  readonly validationErrors: Array<{
    path: string[]
    message: string
    code: string
  }>
  readonly input?: unknown
}

/**
 * Tree-sitter parsing error
 */
export interface TreeSitterError extends BaseVibeError {
  readonly _tag: 'TreeSitterError'
  readonly phase: 'initialization' | 'parsing' | 'query' | 'wasm_loading'
  readonly language?: string
  readonly wasmPath?: string
  readonly parseError?: string
}

/**
 * Agent/LLM error
 */
export interface AgentError extends BaseVibeError {
  readonly _tag: 'AgentError'
  readonly agentType: 'llm' | 'bridge' | 'conversation' | 'token_tracking'
  readonly model?: string
  readonly tokensUsed?: number
  readonly rateLimited?: boolean
}

/**
 * Workspace error
 */
export interface WorkspaceError extends BaseVibeError {
  readonly _tag: 'WorkspaceError'
  readonly workspace: string
  readonly action: 'initialize' | 'validate' | 'cleanup' | 'lock' | 'unlock'
  readonly lockFile?: string
}

/**
 * Union type for all possible errors
 */
export type VibeError = 
  | StorageError
  | ConfigurationError
  | NetworkError
  | ProcessingError
  | FileSystemError
  | ValidationError
  | TreeSitterError
  | AgentError
  | WorkspaceError

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Error recovery strategies
 */
export type RecoveryStrategy = 'retry' | 'skip' | 'fallback' | 'abort' | 'user_input'

/**
 * Error context for debugging
 */
export interface ErrorContext {
  operation: string
  subsystem: string
  severity: ErrorSeverity
  recoveryStrategy: RecoveryStrategy
  metadata?: Record<string, unknown>
}

/**
 * Create a storage error
 */
export const createStorageError = (
  cause: unknown,
  operation: StorageError['operation'],
  message: string,
  resource: string = 'unknown',
  details?: StorageError['details']
): StorageError => {
  return {
    _tag: 'StorageError',
    message,
    cause,
    operation,
    resource,
    details,
    timestamp: new Date(),
    context: {
      subsystem: 'storage',
      severity: 'high',
      recoveryStrategy: operation === 'connect' ? 'retry' : 'skip'
    }
  }
}

/**
 * Create a configuration error
 */
export const createConfigurationError = (
  cause: unknown,
  message: string,
  configType: ConfigurationError['configType'] = 'validation',
  configPath?: string,
  invalidFields?: string[]
): ConfigurationError => {
  return {
    _tag: 'ConfigurationError',
    message,
    cause,
    configType,
    configPath,
    invalidFields,
    timestamp: new Date(),
    context: {
      subsystem: 'configuration',
      severity: 'critical',
      recoveryStrategy: 'abort'
    }
  }
}

/**
 * Create a network error
 */
export const createNetworkError = (
  cause: unknown,
  service: string,
  operation: string,
  statusCode?: number,
  retryable: boolean = true
): NetworkError => {
  return {
    _tag: 'NetworkError',
    message: `Network error in ${service} during ${operation}`,
    cause,
    service,
    operation,
    statusCode,
    retryable,
    timestamp: new Date(),
    context: {
      subsystem: 'network',
      severity: statusCode && statusCode >= 500 ? 'high' : 'medium',
      recoveryStrategy: retryable ? 'retry' : 'skip'
    }
  }
}

/**
 * Create a processing error
 */
export const createProcessingError = (
  cause: unknown,
  stage: ProcessingError['stage'],
  message: string,
  filePath?: string,
  componentName?: string,
  recoverable: boolean = true
): ProcessingError => {
  return {
    _tag: 'ProcessingError',
    message,
    cause,
    stage,
    filePath,
    componentName,
    recoverable,
    timestamp: new Date(),
    context: {
      subsystem: 'processing',
      severity: recoverable ? 'medium' : 'high',
      recoveryStrategy: recoverable ? 'skip' : 'abort'
    }
  }
}

/**
 * Create a file system error
 */
export const createFileSystemError = (
  cause: unknown,
  operation: FileSystemError['operation'],
  path: string,
  permissions: boolean = false
): FileSystemError => {
  return {
    _tag: 'FileSystemError',
    message: `File system error: ${operation} failed for ${path}`,
    cause,
    operation,
    path,
    permissions,
    timestamp: new Date(),
    context: {
      subsystem: 'filesystem',
      severity: permissions ? 'high' : 'medium',
      recoveryStrategy: 'skip'
    }
  }
}

/**
 * Create a validation error
 */
export const createValidationError = (
  message: string,
  schemaName: string,
  validationErrors: ValidationError['validationErrors'],
  input?: unknown
): ValidationError => {
  return {
    _tag: 'ValidationError',
    message,
    cause: new Error(message),
    schemaName,
    validationErrors,
    input,
    timestamp: new Date(),
    context: {
      subsystem: 'validation',
      severity: 'medium',
      recoveryStrategy: 'user_input'
    }
  }
}

/**
 * Create a tree-sitter error
 */
export const createTreeSitterError = (
  cause: unknown,
  phase: TreeSitterError['phase'],
  message: string,
  language?: string,
  wasmPath?: string
): TreeSitterError => {
  return {
    _tag: 'TreeSitterError',
    message,
    cause,
    phase,
    language,
    wasmPath,
    timestamp: new Date(),
    context: {
      subsystem: 'treesitter',
      severity: phase === 'initialization' ? 'critical' : 'high',
      recoveryStrategy: phase === 'parsing' ? 'skip' : 'abort'
    }
  }
}

/**
 * Create an agent error
 */
export const createAgentError = (
  cause: unknown,
  agentType: AgentError['agentType'],
  message: string,
  model?: string,
  tokensUsed?: number,
  rateLimited: boolean = false
): AgentError => {
  return {
    _tag: 'AgentError',
    message,
    cause,
    agentType,
    model,
    tokensUsed,
    rateLimited,
    timestamp: new Date(),
    context: {
      subsystem: 'agent',
      severity: rateLimited ? 'medium' : 'high',
      recoveryStrategy: rateLimited ? 'retry' : 'skip'
    }
  }
}

/**
 * Create a workspace error
 */
export const createWorkspaceError = (
  cause: unknown,
  workspace: string,
  action: WorkspaceError['action'],
  message: string,
  lockFile?: string
): WorkspaceError => {
  return {
    _tag: 'WorkspaceError',
    message,
    cause,
    workspace,
    action,
    lockFile,
    timestamp: new Date(),
    context: {
      subsystem: 'workspace',
      severity: action === 'initialize' ? 'critical' : 'medium',
      recoveryStrategy: action === 'lock' ? 'retry' : 'skip'
    }
  }
}

/**
 * Get error severity from error object
 */
export const getErrorSeverity = (error: VibeError): ErrorSeverity => {
  return (error.context?.severity as ErrorSeverity) || 'medium'
}

/**
 * Get recovery strategy from error object
 */
export const getRecoveryStrategy = (error: VibeError): RecoveryStrategy => {
  return (error.context?.recoveryStrategy as RecoveryStrategy) || 'skip'
}

/**
 * Check if error is retryable
 */
export const isRetryable = (error: VibeError): boolean => {
  if (error._tag === 'NetworkError') {
    return error.retryable ?? true
  }
  return getRecoveryStrategy(error) === 'retry'
}

/**
 * Serialize error for logging/debugging
 */
export const serializeError = (error: VibeError): Record<string, unknown> => {
  return {
    tag: error._tag,
    message: error.message,
    timestamp: error.timestamp.toISOString(),
    context: error.context,
    cause: error.cause instanceof Error ? {
      name: error.cause.name,
      message: error.cause.message,
      stack: error.cause.stack
    } : error.cause,
    ...('operation' in error ? { operation: error.operation } : {}),
    ...('service' in error ? { service: error.service } : {}),
    ...('path' in error ? { path: error.path } : {}),
    ...('stage' in error ? { stage: error.stage } : {}),
    ...('phase' in error ? { phase: error.phase } : {})
  }
}

/**
 * Format error for user display
 */
export const formatErrorForUser = (error: VibeError): string => {
  const severity = getErrorSeverity(error)
  const emoji = severity === 'critical' ? '💥' : severity === 'high' ? '❌' : '⚠️'
  
  let message = `${emoji} ${error.message}`
  
  // Add context-specific information
  switch (error._tag) {
    case 'StorageError':
      message += `\n   Operation: ${error.operation}`
      if (error.resource !== 'unknown') {
        message += `\n   Resource: ${error.resource}`
      }
      break
    case 'NetworkError':
      message += `\n   Service: ${error.service}`
      if (error.statusCode) {
        message += `\n   Status: ${error.statusCode}`
      }
      break
    case 'FileSystemError':
      message += `\n   File: ${error.path}`
      message += `\n   Operation: ${error.operation}`
      break
    case 'ProcessingError':
      message += `\n   Stage: ${error.stage}`
      if (error.filePath) {
        message += `\n   File: ${error.filePath}`
      }
      if (error.componentName) {
        message += `\n   Component: ${error.componentName}`
      }
      break
  }
  
  return message
}

/**
 * Handle error with appropriate logging and recovery
 */
export const handleError = (error: VibeError, context?: string): void => {
  const severity = getErrorSeverity(error)
  const strategy = getRecoveryStrategy(error)
  const serialized = serializeError(error)
  
  // Log error based on severity
  if (severity === 'critical') {
    logSystem.error(`${context || 'Error'}: ${error.message}`)
  } else if (severity === 'high') {
    logSystem.error(`${context || 'Error'}: ${error.message}`)
  } else {
    logSystem.debug(`${context || 'Warning'}: ${error.message}`)
  }
  
  // Suggest recovery strategy
  if (strategy === 'retry') {
    logSystem.info('This error may be retryable. Consider retrying the operation.')
  } else if (strategy === 'user_input') {
    logSystem.info('Please check your input and try again.')
  }
}

/**
 * Create error chain for related errors
 */
export const chainError = (originalError: VibeError, newError: VibeError): VibeError => {
  return {
    ...newError,
    cause: originalError,
    context: {
      ...newError.context,
      chainedFrom: originalError._tag
    }
  }
}

/**
 * Error utilities namespace
 */
export const ErrorUtils = {
  create: {
    storage: createStorageError,
    configuration: createConfigurationError,
    network: createNetworkError,
    processing: createProcessingError,
    filesystem: createFileSystemError,
    validation: createValidationError,
    treesitter: createTreeSitterError,
    agent: createAgentError,
    workspace: createWorkspaceError
  },
  severity: getErrorSeverity,
  recovery: getRecoveryStrategy,
  retryable: isRetryable,
  serialize: serializeError,
  format: formatErrorForUser,
  handle: handleError,
  chain: chainError
} as const