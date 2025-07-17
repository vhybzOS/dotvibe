/**
 * Core Logger System Test Suite
 * Tests structured logging with levels, contexts, and conditional output
 * 
 * @tested_by tests/core/logger.test.ts (Logging levels, contexts, conditional output)
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'

import { 
  setLogLevel,
  getLogLevel,
  enableTimestamps,
  disableTimestamps,
  enableColors,
  disableColors,
  debugOnly,
  logSystem,
  logStorage,
  logProcessing,
  logNetwork,
  logAgent,
  logValidation,
  logWorkspace,
  createLogger,
  LogLevel,
  type LogContext,
  type LogMessage,
  type LoggerConfig,
  type LoggerInstance
} from '../../src/infra/logger.ts'

describe('Core Logger System', () => {
  let originalConsoleLog: typeof console.log
  let originalConsoleError: typeof console.error
  let originalConsoleWarn: typeof console.warn
  let originalConsoleInfo: typeof console.info
  let capturedLogs: { level: string; message: string; args: any[] }[]
  
  beforeEach(() => {
    // Capture console output
    capturedLogs = []
    
    originalConsoleLog = console.log
    originalConsoleError = console.error
    originalConsoleWarn = console.warn
    originalConsoleInfo = console.info
    
    console.log = (...args: any[]) => {
      capturedLogs.push({ level: 'log', message: args[0], args: args.slice(1) })
    }
    
    console.error = (...args: any[]) => {
      capturedLogs.push({ level: 'error', message: args[0], args: args.slice(1) })
    }
    
    console.warn = (...args: any[]) => {
      capturedLogs.push({ level: 'warn', message: args[0], args: args.slice(1) })
    }
    
    console.info = (...args: any[]) => {
      capturedLogs.push({ level: 'info', message: args[0], args: args.slice(1) })
    }
    
    // Reset to default state
    setLogLevel(LogLevel.NORMAL)
    disableTimestamps()
    enableColors()
  })
  
  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    console.info = originalConsoleInfo
  })

  describe('Log Level Management', () => {
    it('should set and get log levels', () => {
      setLogLevel(LogLevel.DEBUG)
      assertEquals(getLogLevel(), LogLevel.DEBUG)
      
      setLogLevel(LogLevel.QUIET)
      assertEquals(getLogLevel(), LogLevel.QUIET)
      
      setLogLevel(LogLevel.VERBOSE)
      assertEquals(getLogLevel(), LogLevel.VERBOSE)
      
      setLogLevel(LogLevel.NORMAL)
      assertEquals(getLogLevel(), LogLevel.NORMAL)
    })

    it('should respect log level hierarchy', () => {
      // Test QUIET level - should suppress all logs
      setLogLevel(LogLevel.QUIET)
      
      logSystem.debug('Debug message')
      logSystem.info('Info message')
      logSystem.warn('Warning message')
      logSystem.error('Error message')
      
      // Should only show error messages in QUIET mode
      const errorLogs = capturedLogs.filter(log => log.level === 'error')
      const otherLogs = capturedLogs.filter(log => log.level !== 'error')
      
      assertEquals(errorLogs.length, 1)
      assertEquals(otherLogs.length, 0)
    })

    it('should show appropriate messages for NORMAL level', () => {
      setLogLevel(LogLevel.NORMAL)
      
      logSystem.debug('Debug message')
      logSystem.info('Info message')
      logSystem.warn('Warning message')
      logSystem.error('Error message')
      
      const debugLogs = capturedLogs.filter(log => log.message.includes('Debug'))
      const infoLogs = capturedLogs.filter(log => log.message.includes('Info'))
      const warnLogs = capturedLogs.filter(log => log.message.includes('Warning'))
      const errorLogs = capturedLogs.filter(log => log.message.includes('Error'))
      
      assertEquals(debugLogs.length, 0) // Debug suppressed in NORMAL
      assertEquals(infoLogs.length, 1)
      assertEquals(warnLogs.length, 1)
      assertEquals(errorLogs.length, 1)
    })

    it('should show all messages for VERBOSE level', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logSystem.debug('Debug message')
      logSystem.info('Info message')
      logSystem.warn('Warning message')
      logSystem.error('Error message')
      
      const debugLogs = capturedLogs.filter(log => log.message.includes('Debug'))
      const infoLogs = capturedLogs.filter(log => log.message.includes('Info'))
      const warnLogs = capturedLogs.filter(log => log.message.includes('Warning'))
      const errorLogs = capturedLogs.filter(log => log.message.includes('Error'))
      
      assertEquals(debugLogs.length, 1)
      assertEquals(infoLogs.length, 1)
      assertEquals(warnLogs.length, 1)
      assertEquals(errorLogs.length, 1)
    })

    it('should show all messages for DEBUG level', () => {
      setLogLevel(LogLevel.DEBUG)
      
      logSystem.debug('Debug message')
      logSystem.info('Info message')
      logSystem.warn('Warning message')
      logSystem.error('Error message')
      
      assertEquals(capturedLogs.length >= 4, true) // Should show all messages
    })
  })

  describe('Context-Specific Loggers', () => {
    it('should provide system logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logSystem.debug('System debug')
      logSystem.info('System info')
      logSystem.warn('System warning')
      logSystem.error('System error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[SYSTEM]')
      }
    })

    it('should provide storage logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logStorage.debug('Storage debug')
      logStorage.info('Storage info')
      logStorage.warn('Storage warning')
      logStorage.error('Storage error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[STORAGE]')
      }
    })

    it('should provide processing logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logProcessing.debug('Processing debug')
      logProcessing.info('Processing info')
      logProcessing.warn('Processing warning')
      logProcessing.error('Processing error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[PROCESSING]')
      }
    })

    it('should provide network logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logNetwork.debug('Network debug')
      logNetwork.info('Network info')
      logNetwork.warn('Network warning')
      logNetwork.error('Network error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[NETWORK]')
      }
    })

    it('should provide agent logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logAgent.debug('Agent debug')
      logAgent.info('Agent info')
      logAgent.warn('Agent warning')
      logAgent.error('Agent error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[AGENT]')
      }
    })

    it('should provide validation logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logValidation.debug('Validation debug')
      logValidation.info('Validation info')
      logValidation.warn('Validation warning')
      logValidation.error('Validation error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[VALIDATION]')
      }
    })

    it('should provide workspace logger with context', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logWorkspace.debug('Workspace debug')
      logWorkspace.info('Workspace info')
      logWorkspace.warn('Workspace warning')
      logWorkspace.error('Workspace error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[WORKSPACE]')
      }
    })
  })

  describe('Timestamp Management', () => {
    it('should enable and disable timestamps', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      // Test without timestamps
      disableTimestamps()
      logSystem.info('Message without timestamp')
      
      // Test with timestamps
      enableTimestamps()
      logSystem.info('Message with timestamp')
      
      assertEquals(capturedLogs.length, 2)
      
      const withoutTimestamp = capturedLogs[0].message
      const withTimestamp = capturedLogs[1].message
      
      // Without timestamp should not contain time pattern
      assertEquals(withoutTimestamp.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), null)
      
      // With timestamp should contain time pattern
      assertEquals(withTimestamp.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) !== null, true)
    })

    it('should format timestamps correctly', () => {
      setLogLevel(LogLevel.VERBOSE)
      enableTimestamps()
      
      logSystem.info('Timestamp test')
      
      assertEquals(capturedLogs.length, 1)
      
      const logMessage = capturedLogs[0].message
      const timestampMatch = logMessage.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]/)
      
      assertExists(timestampMatch)
      
      const timestamp = timestampMatch[1]
      const parsedDate = new Date(timestamp)
      
      // Should be a valid date
      assertEquals(isNaN(parsedDate.getTime()), false)
      
      // Should be recent (within last minute)
      const now = new Date()
      const diff = now.getTime() - parsedDate.getTime()
      assertEquals(diff < 60000, true) // Less than 1 minute ago
    })
  })

  describe('Color Management', () => {
    it('should enable and disable colors', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      // Test with colors
      enableColors()
      logSystem.info('Colored message')
      logSystem.warn('Colored warning')
      logSystem.error('Colored error')
      
      // Test without colors
      disableColors()
      logSystem.info('Plain message')
      logSystem.warn('Plain warning')
      logSystem.error('Plain error')
      
      assertEquals(capturedLogs.length, 6)
      
      const coloredMessages = capturedLogs.slice(0, 3)
      const plainMessages = capturedLogs.slice(3, 6)
      
      // Colored messages should contain ANSI escape codes
      for (const log of coloredMessages) {
        assertEquals(log.message.includes('\u001b['), true)
      }
      
      // Plain messages should not contain ANSI escape codes
      for (const log of plainMessages) {
        assertEquals(log.message.includes('\u001b['), false)
      }
    })

    it('should use appropriate colors for different levels', () => {
      setLogLevel(LogLevel.VERBOSE)
      enableColors()
      
      logSystem.debug('Debug message')
      logSystem.info('Info message')
      logSystem.warn('Warning message')
      logSystem.error('Error message')
      
      assertEquals(capturedLogs.length, 4)
      
      const [debugLog, infoLog, warnLog, errorLog] = capturedLogs
      
      // Each level should have different color codes
      assertEquals(debugLog.message.includes('\u001b[37m'), true) // Gray for debug
      assertEquals(infoLog.message.includes('\u001b[36m'), true) // Cyan for info
      assertEquals(warnLog.message.includes('\u001b[33m'), true) // Yellow for warn
      assertEquals(errorLog.message.includes('\u001b[31m'), true) // Red for error
    })
  })

  describe('Debug-Only Logging', () => {
    it('should only execute debug function in debug mode', () => {
      let executionCount = 0
      
      // Test in non-debug mode
      setLogLevel(LogLevel.NORMAL)
      
      debugOnly(() => {
        executionCount++
        logSystem.debug('Debug only message')
      })
      
      assertEquals(executionCount, 0)
      assertEquals(capturedLogs.length, 0)
      
      // Test in debug mode
      setLogLevel(LogLevel.DEBUG)
      
      debugOnly(() => {
        executionCount++
        logSystem.debug('Debug only message')
      })
      
      assertEquals(executionCount, 1)
      assertEquals(capturedLogs.length, 1)
    })

    it('should handle expensive operations in debug only', () => {
      let expensiveOperationCalled = false
      
      const expensiveOperation = () => {
        expensiveOperationCalled = true
        return 'expensive result'
      }
      
      // Test in non-debug mode
      setLogLevel(LogLevel.NORMAL)
      
      debugOnly(() => {
        const result = expensiveOperation()
        logSystem.debug('Expensive operation result:', result)
      })
      
      assertEquals(expensiveOperationCalled, false)
      
      // Test in debug mode
      setLogLevel(LogLevel.DEBUG)
      expensiveOperationCalled = false
      
      debugOnly(() => {
        const result = expensiveOperation()
        logSystem.debug('Expensive operation result:', result)
      })
      
      assertEquals(expensiveOperationCalled, true)
    })
  })

  describe('Custom Logger Creation', () => {
    it('should create custom logger with context', () => {
      const customLogger = createLogger('CUSTOM')
      
      setLogLevel(LogLevel.VERBOSE)
      
      customLogger.debug('Custom debug')
      customLogger.info('Custom info')
      customLogger.warn('Custom warning')
      customLogger.error('Custom error')
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertStringIncludes(log.message, '[CUSTOM]')
      }
    })

    it('should create logger with custom configuration', () => {
      const config: LoggerConfig = {
        context: 'TEST',
        level: LogLevel.DEBUG,
        enableTimestamps: true,
        enableColors: false
      }
      
      const customLogger = createLogger('TEST', config)
      
      customLogger.debug('Test message')
      
      assertEquals(capturedLogs.length, 1)
      
      const logMessage = capturedLogs[0].message
      assertStringIncludes(logMessage, '[TEST]')
      assertStringIncludes(logMessage, 'Test message')
      
      // Should have timestamp
      assertEquals(logMessage.includes('[2'), true)
      
      // Should not have colors
      assertEquals(logMessage.includes('\u001b['), false)
    })
  })

  describe('Message Formatting', () => {
    it('should format messages with metadata', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      const metadata = {
        requestId: 'req-123',
        userId: 'user-456',
        duration: 150
      }
      
      logSystem.info('Operation completed', metadata)
      
      assertEquals(capturedLogs.length, 1)
      
      const logMessage = capturedLogs[0].message
      assertStringIncludes(logMessage, 'Operation completed')
      
      // Should include metadata
      const args = capturedLogs[0].args
      assertEquals(args.length, 1)
      assertEquals(args[0], metadata)
    })

    it('should handle different message types', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logSystem.info('String message')
      logSystem.info(123)
      logSystem.info({ key: 'value' })
      logSystem.info(['array', 'values'])
      
      assertEquals(capturedLogs.length, 4)
      
      assertStringIncludes(capturedLogs[0].message, 'String message')
      assertStringIncludes(capturedLogs[1].message, '123')
      assertEquals(capturedLogs[2].args[0], { key: 'value' })
      assertEquals(capturedLogs[3].args[0], ['array', 'values'])
    })

    it('should handle multiple arguments', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logSystem.info('Message with', 'multiple', 'arguments', 123, { key: 'value' })
      
      assertEquals(capturedLogs.length, 1)
      
      const log = capturedLogs[0]
      assertStringIncludes(log.message, 'Message with')
      
      assertEquals(log.args.length, 4)
      assertEquals(log.args[0], 'multiple')
      assertEquals(log.args[1], 'arguments')
      assertEquals(log.args[2], 123)
      assertEquals(log.args[3], { key: 'value' })
    })
  })

  describe('Logger Instance Interface', () => {
    it('should provide complete logger interface', () => {
      const logger = logSystem
      
      assertExists(logger.debug)
      assertExists(logger.info)
      assertExists(logger.warn)
      assertExists(logger.error)
      
      assertEquals(typeof logger.debug, 'function')
      assertEquals(typeof logger.info, 'function')
      assertEquals(typeof logger.warn, 'function')
      assertEquals(typeof logger.error, 'function')
    })

    it('should maintain logger context consistently', () => {
      const contexts = [
        { logger: logSystem, expectedContext: 'SYSTEM' },
        { logger: logStorage, expectedContext: 'STORAGE' },
        { logger: logProcessing, expectedContext: 'PROCESSING' },
        { logger: logNetwork, expectedContext: 'NETWORK' },
        { logger: logAgent, expectedContext: 'AGENT' },
        { logger: logValidation, expectedContext: 'VALIDATION' },
        { logger: logWorkspace, expectedContext: 'WORKSPACE' }
      ]
      
      setLogLevel(LogLevel.VERBOSE)
      
      for (const { logger, expectedContext } of contexts) {
        logger.info(`Test message for ${expectedContext}`)
      }
      
      assertEquals(capturedLogs.length, 7)
      
      for (let i = 0; i < capturedLogs.length; i++) {
        const log = capturedLogs[i]
        const expectedContext = contexts[i].expectedContext
        assertStringIncludes(log.message, `[${expectedContext}]`)
      }
    })
  })

  describe('Performance Considerations', () => {
    it('should not execute expensive operations when log level suppresses output', () => {
      let expensiveCallCount = 0
      
      const expensiveFunction = () => {
        expensiveCallCount++
        return 'expensive result'
      }
      
      setLogLevel(LogLevel.QUIET)
      
      // These should not call the expensive function
      logSystem.debug(() => `Debug: ${expensiveFunction()}`)
      logSystem.info(() => `Info: ${expensiveFunction()}`)
      logSystem.warn(() => `Warn: ${expensiveFunction()}`)
      
      assertEquals(expensiveCallCount, 0)
      assertEquals(capturedLogs.length, 0)
    })

    it('should handle high-frequency logging efficiently', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      const startTime = Date.now()
      
      for (let i = 0; i < 1000; i++) {
        logSystem.debug(`Debug message ${i}`)
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      assertEquals(capturedLogs.length, 1000)
      assertEquals(duration < 1000, true) // Should complete within 1 second
    })
  })

  describe('Error Handling', () => {
    it('should handle logging errors gracefully', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      // Create a circular reference that would cause JSON.stringify to fail
      const circularObject: any = { name: 'test' }
      circularObject.self = circularObject
      
      // Should not throw error
      logSystem.info('Message with circular reference', circularObject)
      
      assertEquals(capturedLogs.length, 1)
      assertStringIncludes(capturedLogs[0].message, 'Message with circular reference')
    })

    it('should handle undefined and null values', () => {
      setLogLevel(LogLevel.VERBOSE)
      
      logSystem.info('Undefined value:', undefined)
      logSystem.info('Null value:', null)
      logSystem.info('Empty string:', '')
      logSystem.info('Zero:', 0)
      
      assertEquals(capturedLogs.length, 4)
      
      for (const log of capturedLogs) {
        assertExists(log.message)
      }
    })
  })

  describe('Type Safety', () => {
    it('should enforce proper log context types', () => {
      const context: LogContext = 'CUSTOM'
      const logger = createLogger(context)
      
      assertExists(logger)
      assertEquals(typeof logger.debug, 'function')
      assertEquals(typeof logger.info, 'function')
      assertEquals(typeof logger.warn, 'function')
      assertEquals(typeof logger.error, 'function')
    })

    it('should enforce proper log level types', () => {
      const levels: LogLevel[] = [
        LogLevel.QUIET,
        LogLevel.NORMAL,
        LogLevel.VERBOSE,
        LogLevel.DEBUG
      ]
      
      for (const level of levels) {
        setLogLevel(level)
        assertEquals(getLogLevel(), level)
      }
    })

    it('should enforce proper logger config types', () => {
      const config: LoggerConfig = {
        context: 'TEST',
        level: LogLevel.DEBUG,
        enableTimestamps: true,
        enableColors: false
      }
      
      const logger = createLogger('TEST', config)
      
      assertExists(logger)
      assertEquals(typeof logger.debug, 'function')
    })
  })
})