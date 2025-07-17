/**
 * Conversation Management Test Suite
 * Tests conversation management functions with exact mastra MessageList interface compatibility
 * 
 * @tested_by tests/agent/conversation.test.ts (MessageList wrapping, thread management)
 */

import { assertEquals, assertExists } from '@std/assert'
import { describe, it } from '@std/testing/bdd'

// Note: These imports will be created as part of TDD implementation
import { 
  createConversationManager,
  addMessage,
  getMessages,
  getLatestUserMessage,
  getMessageHistory,
  clearConversation,
  getConversationStats
} from '../../src/agent/conversation.ts'
import type { 
  MastraMessageV2,
  MessageRole,
  MessageSource,
  CoreSystemMessage,
  MessageInput
} from '../../src/agent/types.ts'
import type { ConversationManagerInstance } from '../../src/agent/conversation.ts'

describe('Conversation Management (Mastra-Compatible)', () => {
  describe('createConversationManager() HOF', () => {
    it('should initialize with mastra-compatible constructor', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123',
        resourceId: 'resource-456'
      })
      
      // Should have mastra interface
      assertExists(conversation.add)
      assertExists(conversation.getLatestUserContent)
      assertExists(conversation.get)
      assertExists(conversation.get.all)
      assertExists(conversation.get.all.v2)
    })

    it('should add messages using exact mastra interface', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      // Test string message (mastra pattern)
      conversation.add('Hello, AI!', 'user')
      
      const messages = conversation.get.all.v2()
      assertEquals(messages.length, 1)
      assertEquals(messages[0].role, 'user')
      assertEquals(messages[0].content.content, 'Hello, AI!')
      assertEquals(messages[0].threadId, 'thread-123')
      assertExists(messages[0].createdAt)
      assertExists(messages[0].id)
    })

    it('should support chaining like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      // Test method chaining (mastra pattern)
      const result = conversation
        .add('First message', 'user')
        .add('Second message', 'user')
        .addSystem('System instruction')
      
      assertEquals(result, conversation) // Should return self for chaining
      assertEquals(conversation.get.all.v2().length, 2)
      assertEquals(conversation.getSystemMessages().length, 1)
    })

    it('should handle multiple message types in single add call', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      // Test array of messages (mastra pattern)
      conversation.add(['First', 'Second', 'Third'], 'user')
      
      const messages = conversation.get.all.v2()
      assertEquals(messages.length, 3)
      assertEquals(messages[0].content.content, 'First')
      assertEquals(messages[1].content.content, 'Second')
      assertEquals(messages[2].content.content, 'Third')
    })

    it('should get latest user content like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      conversation
        .add('First user message', 'user')
        .add('Assistant response', 'response')
        .add('Latest user message', 'user')
      
      const latestContent = conversation.getLatestUserContent()
      assertEquals(latestContent, 'Latest user message')
    })

    it('should handle system messages with tags like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      conversation
        .addSystem('Base system message')
        .addSystem('Tagged system message', 'special')
        .addSystem(['Multi', 'System', 'Messages'], 'batch')
      
      const allSystem = conversation.getSystemMessages()
      const taggedSystem = conversation.getSystemMessages('special')
      const batchSystem = conversation.getSystemMessages('batch')
      
      assertEquals(allSystem.length, 1)
      assertEquals(taggedSystem.length, 1)
      assertEquals(batchSystem.length, 3)
      assertEquals(taggedSystem[0].content, 'Tagged system message')
    })

    it('should provide all getter variations like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      conversation
        .add('User message', 'user')
        .add('Response message', 'response')
        .add('Memory message', 'memory')
      
      // Test all mastra getter methods
      const allV2 = conversation.get.all.v2()
      const allV1 = conversation.get.all.v1()
      const allUI = conversation.get.all.ui()
      const allCore = conversation.get.all.core()
      const allPrompt = conversation.get.all.prompt()
      
      assertEquals(allV2.length, 3)
      assertEquals(allV1.length, 3)
      assertEquals(allUI.length, 3)
      assertEquals(allCore.length, 3)
      assertEquals(allPrompt.length, 3) // No system messages in this test
      
      // Check v2 format
      assertEquals(allV2[0].content.format, 2)
      assertExists(allV2[0].content.parts)
      
      // Check UI format
      assertExists(allUI[0].parts)
      assertEquals(allUI[0].role, 'user')
      
      // Check core format
      assertEquals(allCore[0].role, 'user')
      assertEquals(typeof allCore[0].content, 'string')
    })

    it('should filter messages by source like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      conversation
        .add('User input', 'user')
        .add('Bot response', 'response')
        .add('Remembered context', 'memory')
      
      const inputMessages = conversation.get.input.v2()
      const responseMessages = conversation.get.response.v2()
      const rememberedMessages = conversation.get.remembered.v2()
      
      assertEquals(inputMessages.length, 1)
      assertEquals(responseMessages.length, 1)
      assertEquals(rememberedMessages.length, 1)
      assertEquals(inputMessages[0].content.content, 'User input')
      assertEquals(responseMessages[0].content.content, 'Bot response')
    })

    it('should drain unsaved messages like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      conversation
        .add('User message', 'user')
        .add('Response message', 'response')
        .add('Memory message', 'memory') // This won't be drained
      
      const unsaved = conversation.drainUnsavedMessages()
      assertEquals(unsaved.length, 2) // user + response messages
      
      // After draining, should be empty
      const unsavedAgain = conversation.drainUnsavedMessages()
      assertEquals(unsavedAgain.length, 0)
    })

    it('should get earliest unsaved timestamp like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      // No unsaved messages initially
      const noTimestamp = conversation.getEarliestUnsavedMessageTimestamp()
      assertEquals(noTimestamp, undefined)
      
      conversation
        .add('First', 'user')
        .add('Second', 'response')
      
      const timestamp = conversation.getEarliestUnsavedMessageTimestamp()
      assertExists(timestamp)
      assertEquals(typeof timestamp, 'number')
    })

    it('should handle duplicate system messages like mastra', () => {
      const conversation = createConversationManager({
        threadId: 'thread-123'
      })
      
      conversation
        .addSystem('Same message')
        .addSystem('Same message') // Should be deduplicated
        .addSystem('Same tagged', 'tag1')
        .addSystem('Same tagged', 'tag1') // Should be deduplicated
        .addSystem('Same tagged', 'tag2') // Different tag, should be added
      
      assertEquals(conversation.getSystemMessages().length, 1)
      assertEquals(conversation.getSystemMessages('tag1').length, 1)
      assertEquals(conversation.getSystemMessages('tag2').length, 1)
    })
  })

  describe('Standalone Conversation Functions', () => {
    it('should add message using standalone function', () => {
      const messages: MastraMessageV2[] = []
      
      const newMessage: MastraMessageV2 = {
        id: 'msg-1',
        role: 'user',
        content: {
          format: 2,
          parts: [{ type: 'text', text: 'Hello' }],
          content: 'Hello'
        },
        createdAt: new Date()
      }
      
      const updatedMessages = addMessage(messages, newMessage)
      
      assertEquals(updatedMessages.length, 1)
      assertEquals(updatedMessages[0].content.content, 'Hello')
      assertEquals(messages.length, 0) // Original array unchanged (functional)
    })

    it('should get messages using standalone function', () => {
      const messages: MastraMessageV2[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Hello' }],
            content: 'Hello'
          },
          createdAt: new Date()
        }
      ]
      
      const result = getMessages(messages)
      assertEquals(result.length, 1)
      assertEquals(result[0].content.content, 'Hello')
    })

    it('should get latest user message using standalone function', () => {
      const messages: MastraMessageV2[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'First' }],
            content: 'First'
          },
          createdAt: new Date('2025-07-14T10:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Response' }],
            content: 'Response'
          },
          createdAt: new Date('2025-07-14T10:01:00Z')
        },
        {
          id: 'msg-3',
          role: 'user',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Latest' }],
            content: 'Latest'
          },
          createdAt: new Date('2025-07-14T10:02:00Z')
        }
      ]
      
      const latestUser = getLatestUserMessage(messages)
      assertEquals(latestUser?.content.content, 'Latest')
    })

    it('should clear conversation using standalone function', () => {
      const messages: MastraMessageV2[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Hello' }],
            content: 'Hello'
          },
          createdAt: new Date()
        }
      ]
      
      const cleared = clearConversation(messages)
      assertEquals(cleared.length, 0)
      assertEquals(messages.length, 1) // Original array unchanged (functional)
    })

    it('should get conversation stats using standalone function', () => {
      const messages: MastraMessageV2[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Hello' }],
            content: 'Hello',
            metadata: { tokenCount: 2 }
          },
          createdAt: new Date()
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Hi there!' }],
            content: 'Hi there!',
            metadata: { tokenCount: 3 }
          },
          createdAt: new Date()
        }
      ]
      
      const stats = getConversationStats(messages)
      
      assertEquals(stats.totalMessages, 2)
      assertEquals(stats.userMessages, 1)
      assertEquals(stats.assistantMessages, 1)
      assertEquals(stats.systemMessages, 0) // MastraV2 doesn't have system messages
      assertEquals(stats.totalTokens, 5)
    })
  })

  describe('Message History Functions', () => {
    it('should format message history chronologically', () => {
      const messages: MastraMessageV2[] = [
        {
          id: 'msg-2',
          role: 'assistant',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Response' }],
            content: 'Response'
          },
          createdAt: new Date('2025-07-14T10:01:00Z')
        },
        {
          id: 'msg-1',
          role: 'user',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Question' }],
            content: 'Question'
          },
          createdAt: new Date('2025-07-14T10:00:00Z')
        }
      ]
      
      const formatted = getMessageHistory(messages)
      
      assertEquals(formatted.length, 2)
      assertEquals(formatted[0].content.content, 'Question') // Earlier message first
      assertEquals(formatted[1].content.content, 'Response')
    })

    it('should limit message history when requested', () => {
      const messages: MastraMessageV2[] = []
      for (let i = 1; i <= 10; i++) {
        messages.push({
          id: `msg-${i}`,
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: {
            format: 2,
            parts: [{ type: 'text', text: `Message ${i}` }],
            content: `Message ${i}`
          },
          createdAt: new Date(Date.now() + i * 1000)
        })
      }
      
      const limited = getMessageHistory(messages, { limit: 5 })
      
      assertEquals(limited.length, 5)
      // Should return the most recent 5 messages
      assertEquals(limited[limited.length - 1].content.content, 'Message 10')
    })
  })
})