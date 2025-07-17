/**
 * Token Tracking Test Suite
 * Tests token progress display and accumulation functionality
 * 
 * @tested_by tests/agent/token-tracking.test.ts (Progress display, token accumulation)
 */

import { assertEquals, assertExists } from '@std/assert'
import { describe, it } from '@std/testing/bdd'

// Note: These imports will be created as part of TDD implementation
import { 
  createTokenTracker,
  formatTokenDisplay,
  calculateTokenPercentage,
  addTokenCounts,
  getProgressString
} from '../../src/agent/token-tracking.ts'
import type { 
  TokenEstimate, 
  ProgressDisplay, 
  ThreadContext 
} from '../../src/agent/types.ts'
import type { TokenTrackerInstance } from '../../src/agent/token-tracking.ts'

describe('Token Tracking', () => {
  describe('createTokenTracker() HOF', () => {
    it('should initialize with thread context', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      
      assertEquals(tracker.getThreadId(), 'thread-123')
      assertEquals(tracker.getMaxTokens(), 1000000)
      assertEquals(tracker.getCurrentTokens(), 0)
    })

    it('should add token counts correctly', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      
      const newTokens: TokenEstimate = {
        totalTokens: 50000,
        inputTokens: 30000,
        outputTokens: 20000,
        tokenizer: 'cl100k'
      }
      
      tracker.addTokens(newTokens)
      
      assertEquals(tracker.getCurrentTokens(), 290000) // 240000 + 50000
    })

    it('should generate progress display in "240K/1M" format', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      const progress = tracker.getProgress()
      
      assertEquals(progress.current, '240K')
      assertEquals(progress.max, '1M')
      assertEquals(progress.percentage, 24)
      assertEquals(progress.currentRaw, 240000)
      assertEquals(progress.maxRaw, 1000000)
    })

    it('should format progress string correctly', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      const progressString = tracker.getProgressString()
      
      assertEquals(progressString, '240K/1M')
    })

    it('should handle token accumulation across multiple adds', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 100000,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      
      // Add first batch
      tracker.addTokens({
        totalTokens: 50000,
        inputTokens: 30000,
        outputTokens: 20000,
        tokenizer: 'cl100k'
      })
      
      // Add second batch
      tracker.addTokens({
        totalTokens: 75000,
        inputTokens: 45000,
        outputTokens: 30000,
        tokenizer: 'cl100k'
      })
      
      assertEquals(tracker.getCurrentTokens(), 225000) // 100000 + 50000 + 75000
    })

    it('should track input and output tokens separately', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 0,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      
      tracker.addTokens({
        totalTokens: 1000,
        inputTokens: 600,
        outputTokens: 400,
        tokenizer: 'cl100k'
      })
      
      assertEquals(tracker.getTotalInputTokens(), 600)
      assertEquals(tracker.getTotalOutputTokens(), 400)
    })

    it('should detect when approaching token limit', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 950000, // 95% of limit
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      
      assertEquals(tracker.isNearLimit(0.9), true) // Over 90% threshold
      assertEquals(tracker.isNearLimit(0.96), false) // Under 96% threshold
    })

    it('should provide token usage statistics', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      const stats = tracker.getUsageStats()
      
      assertEquals(stats.current, 240000)
      assertEquals(stats.max, 1000000)
      assertEquals(stats.remaining, 760000)
      assertEquals(stats.percentage, 24)
    })
  })

  describe('Token Formatting Functions', () => {
    it('should format token counts in human-readable format', () => {
      assertEquals(formatTokenDisplay(1500000), '1.5M')
      assertEquals(formatTokenDisplay(240000), '240K')
      assertEquals(formatTokenDisplay(5000), '5K')
      assertEquals(formatTokenDisplay(500), '500')
    })

    it('should handle edge cases in token formatting', () => {
      assertEquals(formatTokenDisplay(0), '0')
      assertEquals(formatTokenDisplay(1000), '1K')
      assertEquals(formatTokenDisplay(1000000), '1M')
      assertEquals(formatTokenDisplay(999), '999')
      assertEquals(formatTokenDisplay(1001), '1K')
    })
  })

  describe('Token Calculation Functions', () => {
    it('should calculate correct token percentage', () => {
      assertEquals(calculateTokenPercentage(240000, 1000000), 24)
      assertEquals(calculateTokenPercentage(500000, 1000000), 50)
      assertEquals(calculateTokenPercentage(0, 1000000), 0)
      assertEquals(calculateTokenPercentage(1000000, 1000000), 100)
    })

    it('should handle edge cases in percentage calculation', () => {
      assertEquals(calculateTokenPercentage(1500000, 1000000), 100) // Should cap at 100%
      assertEquals(calculateTokenPercentage(500, 0), 0) // Division by zero
      assertEquals(calculateTokenPercentage(-100, 1000), 0) // Negative current
    })

    it('should add token counts correctly', () => {
      const estimate1: TokenEstimate = {
        totalTokens: 1000,
        inputTokens: 600,
        outputTokens: 400,
        tokenizer: 'cl100k'
      }
      
      const estimate2: TokenEstimate = {
        totalTokens: 500,
        inputTokens: 300,
        outputTokens: 200,
        tokenizer: 'cl100k'
      }
      
      const combined = addTokenCounts(estimate1, estimate2)
      
      assertEquals(combined.totalTokens, 1500)
      assertEquals(combined.inputTokens, 900)
      assertEquals(combined.outputTokens, 600)
      assertEquals(combined.tokenizer, 'cl100k')
    })
  })

  describe('Progress Display', () => {
    it('should generate progress string in various formats', () => {
      assertEquals(getProgressString(240000, 1000000), '240K/1M')
      assertEquals(getProgressString(1500, 10000), '2K/10K')
      assertEquals(getProgressString(750, 1000), '750/1K')
    })

    it('should handle thread-aware progress display', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 240000,
        model: 'gemini-2.5-flash'
      }
      
      const progressWithThread = getProgressString(
        threadContext.currentTokens, 
        threadContext.maxTokens, 
        threadContext.threadId
      )
      
      assertEquals(progressWithThread, 'Thread thread-123: 240K/1M')
    })
  })

  describe('Real-time Updates', () => {
    it('should support real-time progress updates', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 200000,
        model: 'gemini-2.5-flash'
      }
      
      const tracker = createTokenTracker(threadContext)
      
      // Simulate adding tokens during conversation
      let progressUpdates: string[] = []
      
      // Add tokens and capture progress
      tracker.addTokens({ totalTokens: 10000, inputTokens: 6000, outputTokens: 4000, tokenizer: 'cl100k' })
      progressUpdates.push(tracker.getProgressString())
      
      tracker.addTokens({ totalTokens: 15000, inputTokens: 9000, outputTokens: 6000, tokenizer: 'cl100k' })
      progressUpdates.push(tracker.getProgressString())
      
      assertEquals(progressUpdates[0], '210K/1M')
      assertEquals(progressUpdates[1], '225K/1M')
    })

    it('should provide callback for progress updates', () => {
      const threadContext: ThreadContext = {
        threadId: 'thread-123',
        maxTokens: 1000000,
        currentTokens: 200000,
        model: 'gemini-2.5-flash'
      }
      
      let lastProgressUpdate = ''
      
      const tracker = createTokenTracker(threadContext, (progress: ProgressDisplay) => {
        lastProgressUpdate = `${progress.current}/${progress.max} (${progress.percentage}%)`
      })
      
      tracker.addTokens({ totalTokens: 10000, inputTokens: 6000, outputTokens: 4000, tokenizer: 'cl100k' })
      
      assertEquals(lastProgressUpdate, '210K/1M (21%)')
    })
  })
})