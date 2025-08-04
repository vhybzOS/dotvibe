/**
 * Structured logging with levels, contexts, and conditional output
 * 
 * @tested_by tests/infra/logger.test.ts (Logging levels, contexts, conditional output)
 */

export enum LogLevel {
  QUIET = 0,
  NORMAL = 1,
  VERBOSE = 2,
  DEBUG = 3
}

export type LogContext = 
  | 'SYSTEM'
  | 'STORAGE' 
  | 'PROCESSING'
  | 'NETWORK'
  | 'AGENT'
  | 'VALIDATION'
  | 'WORKSPACE'

export type LogMessage = string | number | object | any[]
export type LogFunction = (...messages: LogMessage[]) => void
export type LazyLogFunction = (messageFn: () => string) => void

export interface LoggerConfig {
  context: LogContext
  enableTimestamps?: boolean
  enableColors?: boolean
  level?: LogLevel
}

export interface LoggerInstance {
  debug: LogFunction & LazyLogFunction
  info: LogFunction
  warn: LogFunction
  error: LogFunction
  context: (...args: any[]) => void
  start: () => void
  complete: (count?: number) => void
}

// Global state
let currentLogLevel: LogLevel = LogLevel.NORMAL
let timestampsEnabled: boolean = false
let colorsEnabled: boolean = true

// Color codes
const colors = {
  reset: '\x1b[0m',
  debug: '\x1b[36m',    // Cyan
  info: '\x1b[32m',     // Green  
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red
  context: '\x1b[90m'   // Gray
}

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLogLevel
}

export function enableTimestamps(): void {
  timestampsEnabled = true
}

export function disableTimestamps(): void {
  timestampsEnabled = false
}

export function enableColors(): void {
  colorsEnabled = true
}

export function disableColors(): void {
  colorsEnabled = false
}

export function debugOnly<T>(computation: () => T): T | undefined {
  if (currentLogLevel >= LogLevel.DEBUG) {
    return computation()
  }
  return undefined
}

function shouldLog(level: LogLevel): boolean {
  return currentLogLevel >= level
}

function formatMessage(context: LogContext, level: string, messages: LogMessage[]): string {
  const timestamp = timestampsEnabled ? `[${new Date().toISOString()}] ` : ''
  const contextStr = `[${context}]`
  const levelStr = `[${level}]`
  
  let formattedMessages: string[]
  try {
    formattedMessages = messages.map(msg => {
      if (msg === null) return 'null'
      if (msg === undefined) return 'undefined'
      if (msg === '') return '""'
      if (msg === 0) return '0'
      if (typeof msg === 'string') return msg
      if (typeof msg === 'number') return String(msg)
      return JSON.stringify(msg, null, 2)
    })
  } catch (error) {
    // Handle circular references
    formattedMessages = messages.map(msg => {
      if (typeof msg === 'object' && msg !== null) {
        return '[Circular Reference]'
      }
      return String(msg)
    })
  }
  
  const messageStr = formattedMessages.join(' ')
  
  if (colorsEnabled) {
    const levelColor = level === 'DEBUG' ? colors.debug :
                      level === 'INFO' ? colors.info :
                      level === 'WARN' ? colors.warn :
                      level === 'ERROR' ? colors.error : ''
    
    return `${timestamp}${colors.context}${contextStr}${colors.reset} ${levelColor}${levelStr}${colors.reset} ${messageStr}`
  }
  
  return `${timestamp}${contextStr} ${levelStr} ${messageStr}`
}

function createLoggerInstance(context: LogContext): LoggerInstance {
  const debug: LogFunction & LazyLogFunction = (...args: any[]) => {
    if (shouldLog(LogLevel.DEBUG)) {
      if (args.length === 1 && typeof args[0] === 'function') {
        // Lazy evaluation
        const message = args[0]()
        console.log(formatMessage(context, 'DEBUG', [message]))
      } else {
        console.log(formatMessage(context, 'DEBUG', args))
      }
    }
  }
  
  const info: LogFunction = (...messages: LogMessage[]) => {
    if (shouldLog(LogLevel.NORMAL)) {
      console.info(formatMessage(context, 'INFO', messages))
    }
  }
  
  const warn: LogFunction = (...messages: LogMessage[]) => {
    if (shouldLog(LogLevel.NORMAL)) {
      console.warn(formatMessage(context, 'WARN', messages))
    }
  }
  
  const error: LogFunction = (...messages: LogMessage[]) => {
    if (shouldLog(LogLevel.QUIET)) {
      console.error(formatMessage(context, 'ERROR', messages))
    }
  }
  
  const start = () => {
    if (shouldLog(LogLevel.VERBOSE)) {
      console.log(formatMessage(context, 'INFO', ['Starting operation...']))
    }
  }
  
  const complete = (count?: number) => {
    if (shouldLog(LogLevel.VERBOSE)) {
      const message = count !== undefined ? `Operation completed (${count} items)` : 'Operation completed'
      console.log(formatMessage(context, 'INFO', [message]))
    }
  }
  
  const contextMethod = (...args: any[]) => {
    if (shouldLog(LogLevel.VERBOSE)) {
      console.log(formatMessage(context, 'INFO', args))
    }
  }
  
  return { debug, info, warn, error, context: contextMethod, start, complete }
}

export function createLogger(config: LoggerConfig): LoggerInstance {
  if (config.level !== undefined) {
    setLogLevel(config.level)
  }
  if (config.enableTimestamps !== undefined) {
    if (config.enableTimestamps) enableTimestamps()
    else disableTimestamps()
  }
  if (config.enableColors !== undefined) {
    if (config.enableColors) enableColors()
    else disableColors()
  }
  
  return createLoggerInstance(config.context)
}

// Pre-configured logger instances for each subsystem
export const logSystem = createLoggerInstance('SYSTEM')
export const logStorage = createLoggerInstance('STORAGE')
export const logProcessing = createLoggerInstance('PROCESSING')
export const logNetwork = createLoggerInstance('NETWORK')
export const logAgent = createLoggerInstance('AGENT')
export const logValidation = createLoggerInstance('VALIDATION')
export const logWorkspace = createLoggerInstance('WORKSPACE')

// Additional specialized loggers for specific operations
export const logDiscovery = createLoggerInstance('AGENT')
export const logAnalysis = createLoggerInstance('AGENT')

// Component tracking state (for indexing operations)
let completedComponents: string[] = []

export function storeCompletedComponent(componentName: string): void {
  completedComponents.push(componentName)
  logProcessing.debug(`Stored completed component: ${componentName}`)
}

export function displayCompletedComponents(): void {
  if (completedComponents.length > 0) {
    logProcessing.info(`Completed components: ${completedComponents.join(', ')}`)
  }
}

export function clearCompletedComponents(): void {
  const count = completedComponents.length
  completedComponents = []
  logProcessing.debug(`Cleared ${count} completed components`)
}