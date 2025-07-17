/**
 * Agent Types Test Suite
 * Tests core interface definitions and type safety for the agent system
 * 
 * @tested_by tests/agent/types.test.ts (Interface definitions, type safety)
 */

import { assertEquals, assertExists } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { z } from 'zod/v4'

// Note: These imports will be created as part of TDD implementation
import type { 
  ThreadContext, 
  TokenEstimate, 
  AgentConfig,
  MessageRole,
  AgentMessage,
  ThreadState
} from '../../src/agent/types.ts'

describe('Agent Types', () => {
  describe('ThreadContext Interface', () => {
    it('should define required thread context properties', () => {
      // This test validates the ThreadContext interface structure
      const mockThreadContext: ThreadContext = {
        threadId: 'thread-123',
        resourceId: 'resource-456',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      assertEquals(mockThreadContext.threadId, 'thread-123')
      assertEquals(mockThreadContext.resourceId, 'resource-456') 
      assertEquals(mockThreadContext.maxTokens, 1000000)
      assertEquals(mockThreadContext.currentTokens, 240000)
      assertEquals(mockThreadContext.model, 'gemini-2.5-flash')
    })

    it('should allow optional resourceId', () => {
      const mockThreadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      assertEquals(mockThreadContext.resourceId, undefined)
    })
  })

  describe('TokenEstimate Interface', () => {
    it('should define token counting properties', () => {
      const mockTokenEstimate: TokenEstimate = {
        totalTokens: 240000,
        inputTokens: 200000,
        outputTokens: 40000,
        tokenizer: 'cl100k'
      }
      
      assertEquals(mockTokenEstimate.totalTokens, 240000)
      assertEquals(mockTokenEstimate.inputTokens, 200000)
      assertEquals(mockTokenEstimate.outputTokens, 40000)
      assertEquals(mockTokenEstimate.tokenizer, 'cl100k')
    })

    it('should calculate correct total tokens', () => {
      const estimate: TokenEstimate = {
        totalTokens: 100,
        inputTokens: 60,
        outputTokens: 40,
        tokenizer: 'cl100k'
      }
      
      assertEquals(estimate.inputTokens + estimate.outputTokens, estimate.totalTokens)
    })
  })

  describe('AgentConfig Interface', () => {
    it('should define agent configuration properties', () => {
      const mockConfig: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        temperature: 0.7,
        apiKey: 'test-api-key',
        enableFunctionCalling: true,
        verbose: false
      }
      
      assertEquals(mockConfig.model, 'gemini-2.5-flash')
      assertEquals(mockConfig.maxTokens, 1000000)
      assertEquals(mockConfig.temperature, 0.7)
      assertEquals(mockConfig.apiKey, 'test-api-key')
      assertEquals(mockConfig.enableFunctionCalling, true)
      assertEquals(mockConfig.verbose, false)
    })

    it('should have optional temperature and verbose properties', () => {
      const mockConfig: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: true
      }
      
      assertEquals(mockConfig.temperature, undefined)
      assertEquals(mockConfig.verbose, undefined)
    })
  })

  describe('MessageRole Type', () => {
    it('should define valid message roles', () => {
      const userRole: MessageRole = 'user'
      const assistantRole: MessageRole = 'assistant'
      const systemRole: MessageRole = 'system'
      
      assertEquals(userRole, 'user')
      assertEquals(assistantRole, 'assistant')
      assertEquals(systemRole, 'system')
    })
  })

  describe('AgentMessage Interface', () => {
    it('should define complete message structure', () => {
      const mockMessage: AgentMessage = {
        id: 'msg-123',
        role: 'user',
        content: 'Hello, world!',
        timestamp: new Date('2025-07-14T10:00:00Z'),
        tokenCount: 4
      }
      
      assertEquals(mockMessage.id, 'msg-123')
      assertEquals(mockMessage.role, 'user')
      assertEquals(mockMessage.content, 'Hello, world!')
      assertEquals(mockMessage.timestamp.toISOString(), '2025-07-14T10:00:00.000Z')
      assertEquals(mockMessage.tokenCount, 4)
    })

    it('should allow optional tokenCount and metadata', () => {
      const mockMessage: AgentMessage = {
        id: 'msg-123',
        role: 'assistant',
        content: 'Response message',
        timestamp: new Date(),
        metadata: { tool_calls: ['function1'] }
      }
      
      assertEquals(mockMessage.tokenCount, undefined)
      assertEquals(mockMessage.metadata?.tool_calls, ['function1'])
    })
  })

  describe('ThreadState Type', () => {
    it('should define valid thread states', () => {
      const activeState: ThreadState = 'active'
      const pausedState: ThreadState = 'paused'
      const completedState: ThreadState = 'completed'
      const errorState: ThreadState = 'error'
      
      assertEquals(activeState, 'active')
      assertEquals(pausedState, 'paused')
      assertEquals(completedState, 'completed')
      assertEquals(errorState, 'error')
    })
  })

  describe('Type Compatibility', () => {
    it('should be compatible with Zod v4 validation', () => {
      // Test that our types can be used with Zod v4 schemas
      const ThreadContextSchema = z.object({
        threadId: z.string(),
        resourceId: z.string().optional(),
        maxTokens: z.number().positive(),
        currentTokens: z.number().nonnegative(),
        model: z.string()
      })
      
      const testData = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      const validated = ThreadContextSchema.parse(testData)
      assertEquals(validated.threadId, 'thread-123')
      assertEquals(validated.maxTokens, 1000000)
    })

    it('should support future migration to mastra patterns', () => {
      // Test that our AgentMessage follows patterns similar to what mastra would expect
      const message: AgentMessage = {
        id: 'msg-123',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
        tokenCount: 3
      }
      
      // Verify structure matches expected patterns for future mastra migration
      assertExists(message.id, 'Message should have id field')
      assertExists(message.role, 'Message should have role field')
      assertExists(message.content, 'Message should have content field')
      assertExists(message.timestamp, 'Message should have timestamp field')
      
      // Role should be one of the expected values
      const validRoles = ['user', 'assistant', 'system']
      assertEquals(validRoles.includes(message.role), true, 'Role should be valid')
    })
  })
})