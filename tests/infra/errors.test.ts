/**
 * Core Error System Test Suite
 * Tests tagged union error types with structured error handling and recovery strategies
 * 
 * @tested_by tests/core/errors.test.ts (Error creation, handling, serialization, recovery)
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'

import { 
  createStorageError,
  createConfigurationError,
  createNetworkError,
  createProcessingError,
  createFileSystemError,
  createValidationError,
  createTreeSitterError,
  createAgentError,
  createWorkspaceError,
  getErrorSeverity,
  getRecoveryStrategy,
  isRetryable,
  serializeError,
  formatErrorForUser,
  handleError,
  chainError,
  ErrorUtils,
  type VibeError,
  type StorageError,
  type ConfigurationError,
  type NetworkError,
  type ProcessingError,
  type FileSystemError,
  type ValidationError,
  type TreeSitterError,
  type AgentError,
  type WorkspaceError,
  type ErrorSeverity,
  type RecoveryStrategy
} from '../../src/infra/errors.ts'

describe('Core Error System', () => {
  describe('Error Creation Functions', () => {
    it('should create storage errors with proper structure', () => {
      const originalError = new Error('Database connection failed')
      const error = createStorageError(
        originalError,
        'connect',
        'Failed to connect to database',
        'code_symbols',
        {
          host: 'localhost',
          port: 4243,
          connectionTimeout: 5000
        }
      )
      
      assertEquals(error._tag, 'StorageError')
      assertEquals(error.message, 'Failed to connect to database')
      assertEquals(error.cause, originalError)
      assertEquals(error.operation, 'connect')
      assertEquals(error.resource, 'code_symbols')
      assertExists(error.details)
      assertEquals(error.details.host, 'localhost')
      assertEquals(error.details.port, 4243)
      assertEquals(error.details.connectionTimeout, 5000)
      assertExists(error.timestamp)
      assertExists(error.context)
      assertEquals(error.context.subsystem, 'storage')
      assertEquals(error.context.severity, 'high')
      assertEquals(error.context.recoveryStrategy, 'retry')
    })

    it('should create configuration errors with validation info', () => {
      const error = createConfigurationError(
        new Error('Invalid configuration'),
        'Configuration validation failed',
        'schema',
        '.vibe/config.json',
        ['llm.apiKey', 'storage.port']
      )
      
      assertEquals(error._tag, 'ConfigurationError')
      assertEquals(error.message, 'Configuration validation failed')
      assertEquals(error.configType, 'schema')
      assertEquals(error.configPath, '.vibe/config.json')
      assertEquals(error.invalidFields?.length, 2)
      assertEquals(error.invalidFields?.[0], 'llm.apiKey')
      assertEquals(error.invalidFields?.[1], 'storage.port')
      assertEquals(error.context?.subsystem, 'configuration')
      assertEquals(error.context?.severity, 'critical')
      assertEquals(error.context?.recoveryStrategy, 'abort')
    })

    it('should create network errors with retry logic', () => {
      const error = createNetworkError(
        new Error('Request timeout'),
        'google-genai',
        'generateContent',
        503,
        true
      )
      
      assertEquals(error._tag, 'NetworkError')
      assertEquals(error.service, 'google-genai')
      assertEquals(error.operation, 'generateContent')
      assertEquals(error.statusCode, 503)
      assertEquals(error.retryable, true)
      assertEquals(error.context?.subsystem, 'network')
      assertEquals(error.context?.severity, 'high') // 503 >= 500
      assertEquals(error.context?.recoveryStrategy, 'retry')
    })

    it('should create processing errors with file context', () => {
      const error = createProcessingError(
        new Error('Parse error'),
        'parsing',
        'Failed to parse TypeScript file',
        'src/complex.ts',
        'ComplexComponent',
        true
      )
      
      assertEquals(error._tag, 'ProcessingError')
      assertEquals(error.stage, 'parsing')
      assertEquals(error.message, 'Failed to parse TypeScript file')
      assertEquals(error.filePath, 'src/complex.ts')
      assertEquals(error.componentName, 'ComplexComponent')
      assertEquals(error.recoverable, true)
      assertEquals(error.context?.subsystem, 'processing')
      assertEquals(error.context?.severity, 'medium') // recoverable = true
      assertEquals(error.context?.recoveryStrategy, 'skip')
    })

    it('should create file system errors with permissions info', () => {
      const error = createFileSystemError(
        new Error('Permission denied'),
        'read',
        '/protected/file.ts',
        true
      )
      
      assertEquals(error._tag, 'FileSystemError')
      assertEquals(error.operation, 'read')
      assertEquals(error.path, '/protected/file.ts')
      assertEquals(error.permissions, true)
      assertEquals(error.context?.subsystem, 'filesystem')
      assertEquals(error.context?.severity, 'high') // permissions = true
      assertEquals(error.context?.recoveryStrategy, 'skip')
    })

    it('should create validation errors with detailed info', () => {
      const validationErrors = [
        { path: ['llm', 'apiKey'], message: 'Required', code: 'too_small' },
        { path: ['storage', 'port'], message: 'Invalid port', code: 'invalid_type' }
      ]
      
      const error = createValidationError(
        'Configuration validation failed',
        'VibeConfigSchema',
        validationErrors,
        { llm: { apiKey: '' }, storage: { port: 'invalid' } }
      )
      
      assertEquals(error._tag, 'ValidationError')
      assertEquals(error.message, 'Configuration validation failed')
      assertEquals(error.schemaName, 'VibeConfigSchema')
      assertEquals(error.validationErrors.length, 2)
      assertEquals(error.validationErrors[0].path, ['llm', 'apiKey'])
      assertEquals(error.validationErrors[0].message, 'Required')
      assertEquals(error.validationErrors[0].code, 'too_small')
      assertExists(error.input)
      assertEquals(error.context?.subsystem, 'validation')
      assertEquals(error.context?.severity, 'medium')
      assertEquals(error.context?.recoveryStrategy, 'user_input')
    })

    it('should create tree-sitter errors with language info', () => {
      const error = createTreeSitterError(
        new Error('WASM loading failed'),
        'wasm_loading',
        'Failed to load tree-sitter WASM file',
        'typescript',
        '/home/user/.cache/tree-sitter-typescript.wasm'
      )
      
      assertEquals(error._tag, 'TreeSitterError')
      assertEquals(error.phase, 'wasm_loading')
      assertEquals(error.message, 'Failed to load tree-sitter WASM file')
      assertEquals(error.language, 'typescript')
      assertEquals(error.wasmPath, '/home/user/.cache/tree-sitter-typescript.wasm')
      assertEquals(error.context?.subsystem, 'treesitter')
      assertEquals(error.context?.severity, 'high') // wasm_loading is not initialization
      assertEquals(error.context?.recoveryStrategy, 'abort')
    })

    it('should create agent errors with token info', () => {
      const error = createAgentError(
        new Error('Rate limit exceeded'),
        'llm',
        'Rate limit exceeded for API requests',
        'gemini-2.5-flash',
        50000,
        true
      )
      
      assertEquals(error._tag, 'AgentError')
      assertEquals(error.agentType, 'llm')
      assertEquals(error.message, 'Rate limit exceeded for API requests')
      assertEquals(error.model, 'gemini-2.5-flash')
      assertEquals(error.tokensUsed, 50000)
      assertEquals(error.rateLimited, true)
      assertEquals(error.context?.subsystem, 'agent')
      assertEquals(error.context?.severity, 'medium') // rateLimited = true
      assertEquals(error.context?.recoveryStrategy, 'retry')
    })

    it('should create workspace errors with lock info', () => {
      const error = createWorkspaceError(
        new Error('Workspace locked'),
        '/home/user/project',
        'lock',
        'Unable to acquire workspace lock',
        '.vibe/workspace.lock'
      )
      
      assertEquals(error._tag, 'WorkspaceError')
      assertEquals(error.workspace, '/home/user/project')
      assertEquals(error.action, 'lock')
      assertEquals(error.message, 'Unable to acquire workspace lock')
      assertEquals(error.lockFile, '.vibe/workspace.lock')
      assertEquals(error.context?.subsystem, 'workspace')
      assertEquals(error.context?.severity, 'medium') // lock is not initialize
      assertEquals(error.context?.recoveryStrategy, 'retry')
    })
  })

  describe('Error Analysis Functions', () => {
    it('should get error severity correctly', () => {
      const highError = createStorageError(new Error('test'), 'connect', 'test', 'test')
      const criticalError = createConfigurationError(new Error('test'), 'test', 'schema')
      const mediumError = createProcessingError(new Error('test'), 'parsing', 'test')
      
      assertEquals(getErrorSeverity(highError), 'high')
      assertEquals(getErrorSeverity(criticalError), 'critical')
      assertEquals(getErrorSeverity(mediumError), 'medium')
    })

    it('should get recovery strategy correctly', () => {
      const retryError = createStorageError(new Error('test'), 'connect', 'test', 'test')
      const abortError = createConfigurationError(new Error('test'), 'test', 'schema')
      const skipError = createProcessingError(new Error('test'), 'parsing', 'test')
      
      assertEquals(getRecoveryStrategy(retryError), 'retry')
      assertEquals(getRecoveryStrategy(abortError), 'abort')
      assertEquals(getRecoveryStrategy(skipError), 'skip')
    })

    it('should determine if error is retryable', () => {
      const retryableNetwork = createNetworkError(new Error('test'), 'service', 'op', 503, true)
      const nonRetryableNetwork = createNetworkError(new Error('test'), 'service', 'op', 400, false)
      const retryableStorage = createStorageError(new Error('test'), 'connect', 'test', 'test')
      const nonRetryableConfig = createConfigurationError(new Error('test'), 'test', 'schema')
      
      assertEquals(isRetryable(retryableNetwork), true)
      assertEquals(isRetryable(nonRetryableNetwork), false)
      assertEquals(isRetryable(retryableStorage), true)
      assertEquals(isRetryable(nonRetryableConfig), false)
    })
  })

  describe('Error Serialization', () => {
    it('should serialize error to JSON-compatible object', () => {
      const originalError = new Error('Original error')
      originalError.stack = 'Stack trace here'
      
      const error = createStorageError(
        originalError,
        'query',
        'Database query failed',
        'code_symbols',
        { query: 'SELECT * FROM test', params: { limit: 10 } }
      )
      
      const serialized = serializeError(error)
      
      assertEquals(serialized.tag, 'StorageError')
      assertEquals(serialized.message, 'Database query failed')
      assertEquals(serialized.operation, 'query')
      assertExists(serialized.timestamp)
      assertExists(serialized.context)
      assertExists(serialized.cause)
      assertEquals(serialized.cause.name, 'Error')
      assertEquals(serialized.cause.message, 'Original error')
      assertEquals(serialized.cause.stack, 'Stack trace here')
    })

    it('should handle non-Error causes', () => {
      const error = createProcessingError(
        'String error cause',
        'validation',
        'Processing failed',
        'src/test.ts'
      )
      
      const serialized = serializeError(error)
      
      assertEquals(serialized.tag, 'ProcessingError')
      assertEquals(serialized.cause, 'String error cause')
      assertEquals(serialized.stage, 'validation')
    })
  })

  describe('Error Formatting', () => {
    it('should format storage error for user display', () => {
      const error = createStorageError(
        new Error('Connection failed'),
        'connect',
        'Failed to connect to database',
        'code_symbols'
      )
      
      const formatted = formatErrorForUser(error)
      
      assertStringIncludes(formatted, '❌ Failed to connect to database')
      assertStringIncludes(formatted, 'Operation: connect')
      assertStringIncludes(formatted, 'Resource: code_symbols')
    })

    it('should format network error for user display', () => {
      const error = createNetworkError(
        new Error('Request failed'),
        'google-genai',
        'generateContent',
        503
      )
      
      const formatted = formatErrorForUser(error)
      
      assertStringIncludes(formatted, '❌ Network error in google-genai during generateContent')
      assertStringIncludes(formatted, 'Service: google-genai')
      assertStringIncludes(formatted, 'Status: 503')
    })

    it('should format file system error for user display', () => {
      const error = createFileSystemError(
        new Error('Permission denied'),
        'read',
        '/protected/file.ts'
      )
      
      const formatted = formatErrorForUser(error)
      
      assertStringIncludes(formatted, '❌ File system error: read failed for /protected/file.ts')
      assertStringIncludes(formatted, 'File: /protected/file.ts')
      assertStringIncludes(formatted, 'Operation: read')
    })

    it('should format processing error for user display', () => {
      const error = createProcessingError(
        new Error('Parse failed'),
        'parsing',
        'Failed to parse file',
        'src/complex.ts',
        'ComplexComponent'
      )
      
      const formatted = formatErrorForUser(error)
      
      assertStringIncludes(formatted, '⚠️ Failed to parse file') // medium severity
      assertStringIncludes(formatted, 'Stage: parsing')
      assertStringIncludes(formatted, 'File: src/complex.ts')
      assertStringIncludes(formatted, 'Component: ComplexComponent')
    })

    it('should use appropriate emoji for severity levels', () => {
      const criticalError = createConfigurationError(new Error('test'), 'test', 'schema')
      const highError = createStorageError(new Error('test'), 'connect', 'test', 'test')
      const mediumError = createProcessingError(new Error('test'), 'parsing', 'test')
      
      const criticalFormatted = formatErrorForUser(criticalError)
      const highFormatted = formatErrorForUser(highError)
      const mediumFormatted = formatErrorForUser(mediumError)
      
      assertStringIncludes(criticalFormatted, '💥')
      assertStringIncludes(highFormatted, '❌')
      assertStringIncludes(mediumFormatted, '⚠️')
    })
  })

  describe('Error Handling', () => {
    it('should handle errors with appropriate logging', () => {
      const error = createStorageError(
        new Error('Database failed'),
        'connect',
        'Connection failed',
        'code_symbols'
      )
      
      // Note: This test verifies the function runs without error
      // In a real implementation, you'd mock the logging system
      handleError(error, 'Database Connection')
      
      // Test passes if no exception is thrown
      assertEquals(true, true)
    })

    it('should suggest recovery strategies', () => {
      const retryableError = createNetworkError(
        new Error('Timeout'),
        'service',
        'request',
        503,
        true
      )
      
      const validationError = createValidationError(
        'Invalid input',
        'TestSchema',
        [{ path: ['test'], message: 'Required', code: 'too_small' }]
      )
      
      // Test that handling doesn't throw
      handleError(retryableError, 'Network Request')
      handleError(validationError, 'Input Validation')
      
      assertEquals(true, true)
    })
  })

  describe('Error Chaining', () => {
    it('should chain errors properly', () => {
      const originalError = createNetworkError(
        new Error('Network failed'),
        'service',
        'request',
        503
      )
      
      const chainedError = createProcessingError(
        new Error('Processing failed'),
        'indexing',
        'Failed to process due to network error'
      )
      
      const result = chainError(originalError, chainedError)
      
      assertEquals(result._tag, 'ProcessingError')
      assertEquals(result.cause, originalError)
      assertEquals(result.context?.chainedFrom, 'NetworkError')
      assertEquals(result.message, 'Failed to process due to network error')
    })

    it('should preserve context in chained errors', () => {
      const originalError = createStorageError(
        new Error('DB failed'),
        'connect',
        'Connection failed',
        'test'
      )
      
      const chainedError = createProcessingError(
        new Error('Process failed'),
        'validation',
        'Validation failed'
      )
      
      const result = chainError(originalError, chainedError)
      
      assertExists(result.context)
      assertEquals(result.context.chainedFrom, 'StorageError')
      assertEquals(result.context.subsystem, 'processing')
      assertEquals(result.context.severity, 'medium')
    })
  })

  describe('ErrorUtils Namespace', () => {
    it('should provide all error creation functions', () => {
      assertExists(ErrorUtils.create.storage)
      assertExists(ErrorUtils.create.configuration)
      assertExists(ErrorUtils.create.network)
      assertExists(ErrorUtils.create.processing)
      assertExists(ErrorUtils.create.filesystem)
      assertExists(ErrorUtils.create.validation)
      assertExists(ErrorUtils.create.treesitter)
      assertExists(ErrorUtils.create.agent)
      assertExists(ErrorUtils.create.workspace)
    })

    it('should provide all utility functions', () => {
      assertExists(ErrorUtils.severity)
      assertExists(ErrorUtils.recovery)
      assertExists(ErrorUtils.retryable)
      assertExists(ErrorUtils.serialize)
      assertExists(ErrorUtils.format)
      assertExists(ErrorUtils.handle)
      assertExists(ErrorUtils.chain)
    })

    it('should work with ErrorUtils factory functions', () => {
      const error = ErrorUtils.create.storage(
        new Error('test'),
        'query',
        'Test error',
        'table'
      )
      
      assertEquals(error._tag, 'StorageError')
      assertEquals(error.operation, 'query')
      assertEquals(error.message, 'Test error')
      assertEquals(error.resource, 'table')
    })

    it('should work with ErrorUtils utility functions', () => {
      const error = createStorageError(
        new Error('test'),
        'connect',
        'Test error',
        'table'
      )
      
      assertEquals(ErrorUtils.severity(error), 'high')
      assertEquals(ErrorUtils.recovery(error), 'retry')
      assertEquals(ErrorUtils.retryable(error), true)
      
      const serialized = ErrorUtils.serialize(error)
      assertEquals(serialized.tag, 'StorageError')
      
      const formatted = ErrorUtils.format(error)
      assertStringIncludes(formatted, 'Test error')
    })
  })

  describe('Type System Validation', () => {
    it('should properly discriminate union types', () => {
      const storageError: VibeError = createStorageError(
        new Error('test'),
        'connect',
        'test',
        'table'
      )
      
      const networkError: VibeError = createNetworkError(
        new Error('test'),
        'service',
        'request',
        503
      )
      
      // TypeScript should properly narrow these types
      if (storageError._tag === 'StorageError') {
        assertEquals(storageError.operation, 'connect')
        assertEquals(storageError.resource, 'table')
      }
      
      if (networkError._tag === 'NetworkError') {
        assertEquals(networkError.service, 'service')
        assertEquals(networkError.operation, 'request')
        assertEquals(networkError.statusCode, 503)
      }
    })

    it('should validate severity and recovery strategy types', () => {
      const severities: ErrorSeverity[] = ['low', 'medium', 'high', 'critical']
      const strategies: RecoveryStrategy[] = ['retry', 'skip', 'fallback', 'abort', 'user_input']
      
      assertEquals(severities.length, 4)
      assertEquals(strategies.length, 5)
      
      // Test that these are valid types
      const testSeverity: ErrorSeverity = 'high'
      const testStrategy: RecoveryStrategy = 'retry'
      
      assertEquals(testSeverity, 'high')
      assertEquals(testStrategy, 'retry')
    })
  })

  describe('Error Context Validation', () => {
    it('should provide consistent context across error types', () => {
      const errors = [
        createStorageError(new Error('test'), 'connect', 'test', 'table'),
        createNetworkError(new Error('test'), 'service', 'request', 503),
        createProcessingError(new Error('test'), 'parsing', 'test'),
        createConfigurationError(new Error('test'), 'test', 'schema'),
        createFileSystemError(new Error('test'), 'read', '/test'),
        createValidationError('test', 'schema', []),
        createTreeSitterError(new Error('test'), 'parsing', 'test'),
        createAgentError(new Error('test'), 'llm', 'test'),
        createWorkspaceError(new Error('test'), '/test', 'lock', 'test')
      ]
      
      for (const error of errors) {
        assertExists(error.context)
        assertExists(error.context.subsystem)
        assertExists(error.context.severity)
        assertExists(error.context.recoveryStrategy)
        assertExists(error.timestamp)
        
        // Verify valid severity values
        assertEquals(
          ['low', 'medium', 'high', 'critical'].includes(error.context.severity as string),
          true
        )
        
        // Verify valid recovery strategy values
        assertEquals(
          ['retry', 'skip', 'fallback', 'abort', 'user_input'].includes(error.context.recoveryStrategy as string),
          true
        )
      }
    })

    it('should have appropriate severity mapping', () => {
      const errors = [
        { error: createStorageError(new Error('test'), 'connect', 'test', 'table'), expectedSeverity: 'high' },
        { error: createConfigurationError(new Error('test'), 'test', 'schema'), expectedSeverity: 'critical' },
        { error: createNetworkError(new Error('test'), 'service', 'request', 503), expectedSeverity: 'high' },
        { error: createNetworkError(new Error('test'), 'service', 'request', 400), expectedSeverity: 'medium' },
        { error: createProcessingError(new Error('test'), 'parsing', 'test', undefined, undefined, true), expectedSeverity: 'medium' },
        { error: createProcessingError(new Error('test'), 'parsing', 'test', undefined, undefined, false), expectedSeverity: 'high' },
        { error: createFileSystemError(new Error('test'), 'read', '/test', true), expectedSeverity: 'high' },
        { error: createFileSystemError(new Error('test'), 'read', '/test', false), expectedSeverity: 'medium' },
        { error: createTreeSitterError(new Error('test'), 'initialization', 'test'), expectedSeverity: 'critical' },
        { error: createTreeSitterError(new Error('test'), 'parsing', 'test'), expectedSeverity: 'high' },
        { error: createAgentError(new Error('test'), 'llm', 'test', undefined, undefined, true), expectedSeverity: 'medium' },
        { error: createAgentError(new Error('test'), 'llm', 'test', undefined, undefined, false), expectedSeverity: 'high' },
        { error: createWorkspaceError(new Error('test'), '/test', 'initialize', 'test'), expectedSeverity: 'critical' },
        { error: createWorkspaceError(new Error('test'), '/test', 'lock', 'test'), expectedSeverity: 'medium' }
      ]
      
      for (const { error, expectedSeverity } of errors) {
        assertEquals(error.context?.severity, expectedSeverity)
      }
    })
  })
})