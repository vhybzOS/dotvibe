/**
 * Simplified Conversation Management
 * 
 * Focuses on core conversation primitives without Mastra compatibility layer.
 * Clean, functional approach for managing conversation history and context.
 * 
 * @tested_by tests/agent/conversation.test.ts (Conversation management, message handling)
 */

import type { MessageRole } from './types.ts'

/**
 * Simple message interface
 */
export interface SimpleMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * Conversation context
 */
export interface ConversationContext {
  conversationId: string
  threadId?: string
  resourceId?: string
  maxMessages?: number
  systemInstruction?: string
}

/**
 * Simplified conversation manager
 */
export interface SimpleConversationManager {
  // Core message operations
  addMessage: (content: string, role: MessageRole, metadata?: Record<string, any>) => SimpleMessage
  addUserMessage: (content: string, metadata?: Record<string, any>) => SimpleMessage
  addAssistantMessage: (content: string, metadata?: Record<string, any>) => SimpleMessage
  addSystemMessage: (content: string, metadata?: Record<string, any>) => SimpleMessage
  
  // Message retrieval
  getMessages: () => SimpleMessage[]
  getLastMessage: () => SimpleMessage | null
  getLastUserMessage: () => SimpleMessage | null
  getLastAssistantMessage: () => SimpleMessage | null
  getMessagesByRole: (role: MessageRole) => SimpleMessage[]
  
  // Conversation management
  clearMessages: () => void
  getContext: () => ConversationContext
  updateContext: (updates: Partial<ConversationContext>) => void
  
  // Conversation history formatting
  formatForLLM: () => string
  formatForDisplay: () => string
  
  // Statistics
  getStats: () => {
    totalMessages: number
    userMessages: number
    assistantMessages: number
    systemMessages: number
  }
}

/**
 * Create a simple conversation manager using functional pattern
 */
export const createSimpleConversationManager = (
  context: ConversationContext
): SimpleConversationManager => {
  let messages: SimpleMessage[] = []
  let conversationContext = { ...context }
  
  // Generate unique IDs
  const generateId = (): string => crypto.randomUUID()
  
  // Add message with role
  const addMessage = (
    content: string,
    role: MessageRole,
    metadata: Record<string, any> = {}
  ): SimpleMessage => {
    const message: SimpleMessage = {
      id: generateId(),
      role,
      content,
      timestamp: new Date(),
      metadata
    }
    
    messages.push(message)
    
    // Enforce max messages if specified
    if (conversationContext.maxMessages && messages.length > conversationContext.maxMessages) {
      const systemMessages = messages.filter(m => m.role === 'system')
      const nonSystemMessages = messages.filter(m => m.role !== 'system')
      
      // Keep all system messages, trim non-system messages
      const keepCount = conversationContext.maxMessages - systemMessages.length
      const trimmedMessages = nonSystemMessages.slice(-keepCount)
      
      messages = [...systemMessages, ...trimmedMessages]
    }
    
    return message
  }
  
  // Convenience methods
  const addUserMessage = (content: string, metadata: Record<string, any> = {}): SimpleMessage =>
    addMessage(content, 'user', metadata)
  
  const addAssistantMessage = (content: string, metadata: Record<string, any> = {}): SimpleMessage =>
    addMessage(content, 'assistant', metadata)
  
  const addSystemMessage = (content: string, metadata: Record<string, any> = {}): SimpleMessage =>
    addMessage(content, 'system', metadata)
  
  // Message retrieval
  const getMessages = (): SimpleMessage[] => [...messages]
  
  const getLastMessage = (): SimpleMessage | null =>
    messages.length > 0 ? messages[messages.length - 1] : null
  
  const getLastUserMessage = (): SimpleMessage | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i]
    }
    return null
  }
  
  const getLastAssistantMessage = (): SimpleMessage | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i]
    }
    return null
  }
  
  const getMessagesByRole = (role: MessageRole): SimpleMessage[] =>
    messages.filter(m => m.role === role)
  
  // Conversation management
  const clearMessages = (): void => {
    messages = []
  }
  
  const getContext = (): ConversationContext => ({ ...conversationContext })
  
  const updateContext = (updates: Partial<ConversationContext>): void => {
    conversationContext = { ...conversationContext, ...updates }
  }
  
  // Formatting functions
  const formatForLLM = (): string => {
    return messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
  }
  
  const formatForDisplay = (): string => {
    return messages
      .map(m => `[${m.timestamp.toISOString()}] ${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')
  }
  
  // Statistics
  const getStats = () => ({
    totalMessages: messages.length,
    userMessages: messages.filter(m => m.role === 'user').length,
    assistantMessages: messages.filter(m => m.role === 'assistant').length,
    systemMessages: messages.filter(m => m.role === 'system').length
  })
  
  return {
    addMessage,
    addUserMessage,
    addAssistantMessage,
    addSystemMessage,
    getMessages,
    getLastMessage,
    getLastUserMessage,
    getLastAssistantMessage,
    getMessagesByRole,
    clearMessages,
    getContext,
    updateContext,
    formatForLLM,
    formatForDisplay,
    getStats
  }
}

/**
 * Create conversation context for windowing system
 */
export const createConversationContext = (
  windowItems: Array<{ id: string; content: string; metadata?: Record<string, any> }>,
  systemInstruction?: string
): string => {
  const context = systemInstruction ? `${systemInstruction}\n\n` : ''
  const items = windowItems
    .map(item => `Item ${item.id}: ${item.content}`)
    .join('\n')
  
  return context + items
}

/**
 * Merge multiple conversations
 */
export const mergeConversations = (
  ...conversations: SimpleConversationManager[]
): SimpleMessage[] => {
  const allMessages: SimpleMessage[] = []
  
  conversations.forEach(conv => {
    allMessages.push(...conv.getMessages())
  })
  
  // Sort by timestamp
  return allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

/**
 * Extract conversation window for specific time range
 */
export const extractTimeWindow = (
  messages: SimpleMessage[],
  startTime: Date,
  endTime: Date
): SimpleMessage[] => {
  return messages.filter(m => 
    m.timestamp >= startTime && m.timestamp <= endTime
  )
}

/**
 * Simple conversation utilities
 */
export const ConversationUtils = {
  createSimpleConversationManager,
  createConversationContext,
  mergeConversations,
  extractTimeWindow
} as const