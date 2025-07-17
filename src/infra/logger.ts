/**
 * Structured Logging System for Vibe Index Command
 * 
 * Provides context-aware, debug-friendly logging that replaces noisy mock DB spam
 * with meaningful progress information and proper log level management.
 * 
 * @tested_by tests/lib/logger.test.ts
 */

/**
 * Log levels for different verbosity needs
 */
export enum LogLevel {
  /** No output except critical errors */
  QUIET = 0,
  /** Key progress milestones only */
  NORMAL = 1,
  /** Detailed progress with metrics */
  VERBOSE = 2,
  /** All internal operations including mock DB calls */
  DEBUG = 3
}

/**
 * Log context for grouping related operations
 */
export enum LogContext {
  /** File discovery and content ingestion */
  DISCOVERY = 'discovery',
  /** LLM analysis and architectural understanding */
  ANALYSIS = 'analysis', 
  /** Parallel component processing */
  PROCESSING = 'processing',
  /** Database storage operations */
  STORAGE = 'storage',
  /** System initialization and configuration */
  SYSTEM = 'system'
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  /** Current log level */
  level: LogLevel
  /** Enable timestamp prefixes */
  timestamps: boolean
  /** Enable colored output */
  colors: boolean
}

/**
 * Global logger state
 */
let globalConfig: LoggerConfig = {
  level: LogLevel.NORMAL,
  timestamps: false,
  colors: true
}

/**
 * Set global logging configuration
 */
export const setLogLevel = (level: LogLevel): void => {
  globalConfig.level = level
}

/**
 * Set logger options
 */
export const setLoggerOptions = (options: Partial<LoggerConfig>): void => {
  globalConfig = { ...globalConfig, ...options }
}

/**
 * Check if a log level should be displayed
 */
const shouldLog = (level: LogLevel): boolean => {
  return level <= globalConfig.level
}

/**
 * Format timestamp for logs
 */
const formatTimestamp = (): string => {
  if (!globalConfig.timestamps) return ''
  return `[${new Date().toISOString().slice(11, 23)}] `
}

/**
 * Apply color formatting if enabled
 */
const colorize = (text: string, color: string): string => {
  if (!globalConfig.colors) return text
  
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m', 
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
  }
  
  return `${colors[color as keyof typeof colors] || ''}${text}${colors.reset}`
}

/**
 * Core logging function
 */
const log = (level: LogLevel, context: LogContext, message: string, emoji = ''): void => {
  if (!shouldLog(level)) return
  
  const timestamp = formatTimestamp()
  const prefix = emoji ? `${emoji} ` : ''
  const contextStr = level >= LogLevel.DEBUG ? `[${context}] ` : ''
  
  console.log(`${timestamp}${contextStr}${prefix}${message}`)
}

/**
 * Progress tracking state for dynamic updates
 */
interface ProgressState {
  total: number
  completed: number
  failed: number
  analyzing: number
  lastUpdate: number
  startTime: number
}

let currentProgress: ProgressState | null = null

/**
 * Initialize progress tracking
 */
export const initProgress = (total: number): void => {
  currentProgress = {
    total,
    completed: 0,
    failed: 0,
    analyzing: 0,
    lastUpdate: 0,
    startTime: Date.now()
  }
}

/**
 * Update progress metrics
 */
export const updateProgress = (
  completed: number, 
  failed: number, 
  analyzing: number, 
  force = false
): void => {
  if (!currentProgress) return
  
  currentProgress.completed = completed
  currentProgress.failed = failed
  currentProgress.analyzing = analyzing
  
  const now = Date.now()
  const UPDATE_INTERVAL = 2000 // 2 seconds
  
  if (!force && (now - currentProgress.lastUpdate) < UPDATE_INTERVAL) {
    return
  }
  
  if (shouldLog(LogLevel.VERBOSE)) {
    const percentage = Math.round((completed / currentProgress.total) * 100)
    const queued = currentProgress.total - completed - failed - analyzing
    const elapsed = Math.round((now - currentProgress.startTime) / 1000)
    const rate = completed > 0 ? (completed / elapsed).toFixed(1) : '0.0'
    const eta = completed > 0 ? Math.ceil((currentProgress.total - completed) / (completed / elapsed)) : 0
    
    // Clear previous line if this is an update
    if (currentProgress.lastUpdate > 0) {
      Deno.stdout.writeSync(new TextEncoder().encode('\x1b[1A\x1b[2K'))
    }
    
    console.log(`⚡ Parallel processing: ${completed}/${currentProgress.total} (${percentage}%) | ✅ ${completed} | 🔄 ${analyzing} | ⏳ ${queued} | ❌ ${failed} | ${rate}/s | ETA: ${eta}s`)
  }
  
  currentProgress.lastUpdate = now
}

/**
 * Clear progress tracking
 */
export const clearProgress = (): void => {
  currentProgress = null
}

/**
 * Logging functions for different levels and contexts
 */

// System-level logging
export const logSystem = {
  info: (message: string) => log(LogLevel.NORMAL, LogContext.SYSTEM, message, '🚀'),
  verbose: (message: string) => log(LogLevel.VERBOSE, LogContext.SYSTEM, message, '🔧'),
  debug: (message: string) => log(LogLevel.DEBUG, LogContext.SYSTEM, message, '🐛'),
  warn: (message: string) => log(LogLevel.VERBOSE, LogContext.SYSTEM, colorize(message, 'yellow'), '⚠️'),
  error: (message: string) => log(LogLevel.QUIET, LogContext.SYSTEM, colorize(message, 'red'), '❌')
}

// Discovery phase logging
export const logDiscovery = {
  start: (path: string) => log(LogLevel.NORMAL, LogContext.DISCOVERY, `LLM-First Indexing: ${path}`, '🚀'),
  context: (files: number, tokens: number) => log(LogLevel.NORMAL, LogContext.DISCOVERY, `Context: ${files} files, ${Math.round(tokens/1000)}K tokens → LLM analysis...`, '📊'),
  debug: (message: string) => log(LogLevel.DEBUG, LogContext.DISCOVERY, message, '🔍')
}

// Analysis phase logging  
export const logAnalysis = {
  start: () => log(LogLevel.VERBOSE, LogContext.ANALYSIS, 'Starting LLM-first architectural analysis...', '🧠'),
  complete: (components: number) => log(LogLevel.NORMAL, LogContext.ANALYSIS, `Architectural analysis complete → ${components} components discovered`, '🧠'),
  debug: (message: string) => log(LogLevel.DEBUG, LogContext.ANALYSIS, message, '💭')
}

// Processing phase logging
export const logProcessing = {
  start: (total: number) => {
    log(LogLevel.VERBOSE, LogContext.PROCESSING, `Initiating parallel processing for ${total} components...`, '⚡')
    initProgress(total)
  },
  progress: (completed: number, failed: number, analyzing: number, force = false) => {
    updateProgress(completed, failed, analyzing, force)
  },
  complete: (successful: number, failed: number, timeMs: number) => {
    clearProgress()
    const rate = (successful / (timeMs / 1000)).toFixed(1)
    log(LogLevel.NORMAL, LogContext.PROCESSING, `Indexing complete: ${successful} components in ${Math.round(timeMs/1000)}s (${rate}/s)`, '✅')
  },
  recentCompletion: (name: string, kind: string, file: string, description?: string) => {
    if (shouldLog(LogLevel.VERBOSE)) {
      log(LogLevel.VERBOSE, LogContext.PROCESSING, `${name} (${kind}) in ${file}`, '📝')
      if (description && shouldLog(LogLevel.DEBUG)) {
        const truncated = description.length > 80 ? description.slice(0, 80) + '...' : description
        log(LogLevel.DEBUG, LogContext.PROCESSING, `    "${truncated}"`, '')
      }
    }
  }
}

// Storage phase logging
export const logStorage = {
  init: () => log(LogLevel.VERBOSE, LogContext.STORAGE, 'Database schema initialized', '✅'),
  debug: (operation: string, details?: string) => {
    const message = details ? `${operation}: ${details}` : operation
    log(LogLevel.DEBUG, LogContext.STORAGE, message, '🗄️')
  },
  error: (operation: string, error: string) => {
    log(LogLevel.QUIET, LogContext.STORAGE, colorize(`${operation} failed: ${error}`, 'red'), '❌')
  }
}

/**
 * Storage for completed components descriptions (for verbose display at end)
 */
interface CompletedComponent {
  name: string
  kind: string
  file: string
  description: string
  processingTime?: number
}

let completedComponents: CompletedComponent[] = []

/**
 * Store a completed component for later verbose display
 */
export const storeCompletedComponent = (component: CompletedComponent): void => {
  completedComponents.push(component)
}

/**
 * Display all completed components with descriptions (like old system)
 */
export const displayCompletedComponents = (): void => {
  if (!shouldLog(LogLevel.VERBOSE) || completedComponents.length === 0) {
    return
  }
  
  console.log('')
  console.log(`📋 Generated Descriptions for ${completedComponents.length} Components:`)
  console.log('='.repeat(80))
  
  completedComponents.forEach((comp, index) => {
    console.log(`${index + 1}. ${colorize(comp.name, 'cyan')} (${comp.kind}) in ${colorize(comp.file, 'blue')}`)
    
    // Format description with proper indentation
    const lines = comp.description.split('\n')
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`   ${line}`)
      }
    })
    
    if (comp.processingTime) {
      console.log(`   ${colorize(`⏱️ Processed in ${comp.processingTime}ms`, 'yellow')}`)
    }
    
    console.log('') // Empty line between components
  })
  
  console.log('='.repeat(80))
}

/**
 * Clear completed components storage
 */
export const clearCompletedComponents = (): void => {
  completedComponents = []
}

/**
 * Special logging for migration from old system
 */
export const logLegacy = {
  /** Replace old verbose console.log statements */
  verbose: (message: string) => log(LogLevel.VERBOSE, LogContext.SYSTEM, message),
  /** Replace old debug console.log statements */
  debug: (message: string) => log(LogLevel.DEBUG, LogContext.SYSTEM, message),
  /** For backwards compatibility with existing success messages */
  success: (message: string) => log(LogLevel.NORMAL, LogContext.SYSTEM, message, '✅')
}

/**
 * Utility to wrap noisy operations and only show in debug mode
 */
export const debugOnly = (operation: () => void): void => {
  if (shouldLog(LogLevel.DEBUG)) {
    operation()
  }
}

/**
 * Create a scoped logger for specific operations
 */
export const createScopedLogger = (context: LogContext, prefix: string) => ({
  info: (message: string) => log(LogLevel.NORMAL, context, `${prefix}: ${message}`),
  verbose: (message: string) => log(LogLevel.VERBOSE, context, `${prefix}: ${message}`),
  debug: (message: string) => log(LogLevel.DEBUG, context, `${prefix}: ${message}`),
  error: (message: string) => log(LogLevel.QUIET, context, colorize(`${prefix}: ${message}`, 'red'))
})