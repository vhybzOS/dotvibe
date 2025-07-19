/**
 * Unified Error Handling System
 *
 * Clean HOF-based error creation with automatic logging and Effect compatibility.
 * Single error type with subsystem-specific creators and immediate console output.
 *
 * @tested_by tests/core/errors.test.ts (Error creation, logging, Effect integration)
 */

/**
 * Error severity levels that map directly to console methods
 */
export type Severity = 'error' | 'warn' | 'info'

/**
 * Unified error interface for all Vibe errors
 */
export interface VibeError {
  readonly _tag: 'VibeError'
  readonly message: string
  readonly subsystem: string
  readonly severity: Severity
  readonly resource?: string
  readonly details: Record<string, unknown>
  readonly timestamp: Date
}

/**
 * Create a subsystem-specific error creator function
 * 
 * @param subsystem - The system component (e.g., 'storage', 'network', 'processing')
 * @returns Function to create errors for that subsystem with automatic logging and stack traces
 */
export const createError = (subsystem: string) => (
  severity: Severity,
  message: string,
  resource?: string,
  details: { error?: unknown } & Record<string, unknown> = {}
): VibeError => {
  const { error, ...otherDetails } = details
  
  // Log with stack trace if available
  const logMessage = `${subsystem}: ${message}`
  if (error instanceof Error && error.stack) {
    console[severity](logMessage)
    console[severity](error.stack)
  } else {
    console[severity](logMessage)
  }
  
  const vibeError: VibeError = {
    _tag: 'VibeError',
    message,
    subsystem,
    severity,
    resource,
    details: { error, ...otherDetails },
    timestamp: new Date()
  }
  
  return vibeError
}

/**
 * Get error severity (for compatibility with existing code)
 */
export const getErrorSeverity = (error: VibeError): Severity => {
  return error.severity
}

/**
 * Check if error suggests retry is possible
 */
export const isRetryable = (error: VibeError): boolean => {
  return error.details.retryable === true || error.severity === 'warn'
}

/**
 * Serialize error for structured logging/debugging
 */
export const serializeError = (error: VibeError): Record<string, unknown> => {
  return {
    tag: error._tag,
    message: error.message,
    subsystem: error.subsystem,
    severity: error.severity,
    resource: error.resource,
    timestamp: error.timestamp.toISOString(),
    details: error.details
  }
}

/**
 * Format error for user display with emoji indicators
 */
export const formatErrorForUser = (error: VibeError): string => {
  const emoji = error.severity === 'error' ? '❌' : error.severity === 'warn' ? '⚠️' : 'ℹ️'
  
  let message = `${emoji} ${error.message}`
  
  if (error.resource) {
    message += `\n   Resource: ${error.resource}`
  }
  
  if (error.subsystem) {
    message += `\n   Subsystem: ${error.subsystem}`
  }
  
  return message
}

/**
 * Create an error collector for batch operations
 */
export const createErrorCollector = (context: string = 'Operation') => {
  const errors: string[] = []
  
  return {
    add: (error: string) => errors.push(error),
    addVibe: (vibeError: VibeError) => {
      // Error already logged by createError, just collect message
      errors.push(vibeError.message)
    },
    getAll: () => [...errors],
    length: () => errors.length,
    hasErrors: () => errors.length > 0,
    getSummary: () => `${errors.length} errors in ${context}`
  }
}

/**
 * Error utilities namespace for easy access
 */
export const ErrorUtils = {
  create: createError,
  severity: getErrorSeverity,
  retryable: isRetryable,
  serialize: serializeError,
  format: formatErrorForUser,
  collector: createErrorCollector
} as const

