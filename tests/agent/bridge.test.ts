/**
 * Agent Bridge Test Suite
 * Tests the hybrid AgentBridge that combines mastra conversation management with Google GenAI execution
 * 
 * @tested_by tests/agent/bridge.test.ts (Hybrid orchestration, Google GenAI integration)
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { describe, it } from '@std/testing/bdd'

// Note: These imports will be created as part of TDD implementation
import { 
  createAgentBridge,
  executeWithBridge,
  formatThreadProgress,
  AgentResponse,
  AgentError
} from '../../src/agent/bridge.ts'
import type { 
  AgentConfig,
  ThreadContext,
  TokenEstimate,
  MastraMessageV2
} from '../../src/agent/types.ts'

describe('Agent Bridge (Hybrid Mastra + Google GenAI)', () => {
  describe('createAgentBridge() HOF', () => {
    it('should initialize with agent configuration and thread context', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: true,
        temperature: 0.7,
        verbose: true
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        resourceId: 'test-resource-456',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Should have bridge interface
      assertExists(bridge.generateResponse)
      assertExists(bridge.addMessage)
      assertExists(bridge.getMessages)
      assertExists(bridge.getProgress)
      assertExists(bridge.clearConversation)
      assertExists(bridge.getConversationStats)
    })

    it('should track token usage across multiple interactions', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Add message should update token count
      bridge.addMessage('Hello, AI!', 'user')
      
      const progress = bridge.getProgress()
      assertEquals(progress.currentRaw > 0, true) // Should have some tokens
      assertEquals(progress.maxRaw, 1000)
      assertEquals(typeof progress.current, 'string') // Human readable format
      assertEquals(typeof progress.percentage, 'number')
    })

    it('should maintain conversation history through bridge', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Add multiple messages
      bridge.addMessage('First message', 'user')
      bridge.addMessage('Second message', 'user')
      bridge.addMessage('Bot response', 'response')
      
      const messages = bridge.getMessages()
      assertEquals(messages.length, 3)
      assertEquals(messages[0].content.content, 'First message')
      assertEquals(messages[1].content.content, 'Second message')
      assertEquals(messages[2].content.content, 'Bot response')
    })

    it('should format thread progress with human-readable display', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1500000, // 1.5M
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1500000,
        currentTokens: 250000, // 250K
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      const progress = bridge.getProgress()
      
      // Should format like "250K/1.5M"
      assertEquals(progress.current, '250K')
      assertEquals(progress.max, '1.5M')
      assertEquals(Math.round(progress.percentage), 17) // 250K/1.5M ≈ 16.67%
    })

    it('should provide conversation statistics', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Add test messages
      bridge.addMessage('User message 1', 'user')
      bridge.addMessage('User message 2', 'user')
      bridge.addMessage('Assistant response', 'response')
      
      const stats = bridge.getConversationStats()
      assertEquals(stats.totalMessages, 3)
      assertEquals(stats.userMessages, 2)
      assertEquals(stats.assistantMessages, 1)
      assertEquals(stats.systemMessages, 0)
      assertEquals(typeof stats.totalTokens, 'number')
    })

    it('should clear conversation and reset token tracking', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000000,
        currentTokens: 5000, // Start with some tokens
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Add messages
      bridge.addMessage('Test message', 'user')
      assertEquals(bridge.getMessages().length, 1)
      
      // Clear conversation
      bridge.clearConversation()
      assertEquals(bridge.getMessages().length, 0)
      
      // Token count should reset to context's currentTokens
      const progress = bridge.getProgress()
      assertEquals(progress.currentRaw, 5000)
    })
  })

  describe('executeWithBridge() Function', () => {
    it('should execute simple text generation request', async () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false,
        temperature: 0.5
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Mock the Google GenAI response
      const mockResponse: AgentResponse = {
        content: 'Hello! I am a helpful AI assistant.',
        tokenUsage: {
          totalTokens: 250,
          inputTokens: 100,
          outputTokens: 150,
          tokenizer: 'cl100k'
        },
        model: 'gemini-2.5-flash',
        conversationId: 'test-thread-123',
        metadata: {
          temperature: 0.5,
          maxTokens: 1000000,
          responseTime: 1500
        }
      }
      
      // This would normally call Google GenAI - for testing we simulate
      const result = await executeWithBridge(
        bridge,
        'Hello, AI assistant!',
        { 
          mockResponse,
          simulateDelay: false 
        }
      )
      
      assertEquals(result.content, 'Hello! I am a helpful AI assistant.')
      assertEquals(result.tokenUsage.totalTokens, 250)
      assertEquals(result.model, 'gemini-2.5-flash')
      assertEquals(result.conversationId, 'test-thread-123')
    })

    it('should handle function calling when enabled', async () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: true,
        temperature: 0.0
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Mock function calling response
      const mockResponse: AgentResponse = {
        content: 'I need to call a function to help you.',
        tokenUsage: {
          totalTokens: 350,
          inputTokens: 200,
          outputTokens: 150,
          tokenizer: 'cl100k'
        },
        model: 'gemini-2.5-flash',
        conversationId: 'test-thread-123',
        metadata: {
          functionCalls: [
            {
              name: 'search_code',
              arguments: { query: 'user authentication', limit: 5 }
            }
          ],
          temperature: 0.0
        }
      }
      
      const result = await executeWithBridge(
        bridge,
        'Search for user authentication code',
        { 
          mockResponse,
          simulateDelay: false 
        }
      )
      
      assertEquals(result.content, 'I need to call a function to help you.')
      assertEquals(result.metadata?.functionCalls?.length, 1)
      assertEquals(result.metadata?.functionCalls?.[0].name, 'search_code')
    })

    it('should handle errors gracefully with detailed error info', async () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'invalid-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Mock error response
      const mockError: AgentError = {
        type: 'AUTHENTICATION_ERROR',
        message: 'Invalid API key provided',
        code: 401,
        model: 'gemini-2.5-flash',
        conversationId: 'test-thread-123',
        timestamp: new Date(),
        metadata: {
          apiKey: 'invalid-***',
          request: 'generateContent'
        }
      }
      
      await assertRejects(
        () => executeWithBridge(
          bridge,
          'This should fail',
          { 
            mockError,
            simulateDelay: false 
          }
        ),
        Error,
        'Invalid API key provided'
      )
    })

    it('should respect token limits and provide warnings', async () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000, // Small limit for testing
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        maxTokens: 1000,
        currentTokens: 950, // Near the limit
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      const mockResponse: AgentResponse = {
        content: 'This response would exceed token limits.',
        tokenUsage: {
          totalTokens: 100, // This would put us over 1000
          inputTokens: 50,
          outputTokens: 50,
          tokenizer: 'cl100k'
        },
        model: 'gemini-2.5-flash',
        conversationId: 'test-thread-123',
        metadata: {
          warning: 'Token limit exceeded',
          tokensExceeded: 50
        }
      }
      
      const result = await executeWithBridge(
        bridge,
        'Short request',
        { 
          mockResponse,
          simulateDelay: false 
        }
      )
      
      assertEquals(result.metadata?.warning, 'Token limit exceeded')
      assertEquals(result.metadata?.tokensExceeded, 50)
    })
  })

  describe('formatThreadProgress() Utility', () => {
    it('should format thousands with K suffix', () => {
      const result = formatThreadProgress(5000, 10000)
      assertEquals(result.current, '5K')
      assertEquals(result.max, '10K')
      assertEquals(result.percentage, 50)
    })

    it('should format millions with M suffix', () => {
      const result = formatThreadProgress(1500000, 2000000)
      assertEquals(result.current, '1.5M')
      assertEquals(result.max, '2M')
      assertEquals(result.percentage, 75)
    })

    it('should handle small numbers without suffix', () => {
      const result = formatThreadProgress(250, 1000)
      assertEquals(result.current, '250')
      assertEquals(result.max, '1K')
      assertEquals(result.percentage, 25)
    })

    it('should handle edge cases and zero values', () => {
      const result = formatThreadProgress(0, 1000000)
      assertEquals(result.current, '0')
      assertEquals(result.max, '1M')
      assertEquals(result.percentage, 0)
    })

    it('should provide exact raw values for programmatic access', () => {
      const result = formatThreadProgress(1234567, 2000000)
      assertEquals(result.currentRaw, 1234567)
      assertEquals(result.maxRaw, 2000000)
      assertEquals(result.current, '1.2M')
      assertEquals(result.max, '2M')
    })
  })

  describe('Integration with Conversation Management', () => {
    it('should integrate seamlessly with mastra-compatible conversation manager', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        resourceId: 'test-resource-456',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // Should support method chaining like mastra
      bridge
        .addMessage('First user message', 'user')
        .addMessage(['Second', 'Third'], 'user')
        .addMessage('Assistant response', 'response')
      
      const messages = bridge.getMessages()
      assertEquals(messages.length, 4) // 3 user + 1 assistant
      
      // Should support mastra-style filtering
      assertEquals(messages.filter(m => m.role === 'user').length, 3)
      assertEquals(messages.filter(m => m.role === 'assistant').length, 1)
    })

    it('should maintain thread context across operations', () => {
      const config: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-api-key',
        enableFunctionCalling: false
      }
      
      const threadContext: ThreadContext = {
        threadId: 'test-thread-123',
        resourceId: 'test-resource-456',
        maxTokens: 1000000,
        currentTokens: 1000,
        model: 'gemini-2.5-flash'
      }
      
      const bridge = createAgentBridge(config, threadContext)
      
      // All messages should have thread context
      bridge.addMessage('Test message', 'user')
      const messages = bridge.getMessages()
      
      assertEquals(messages[0].threadId, 'test-thread-123')
      assertEquals(messages[0].resourceId, 'test-resource-456')
      
      // Progress should reflect thread context
      const progress = bridge.getProgress()
      assertEquals(progress.currentRaw >= 1000, true) // Should include base + new tokens
    })
  })
})