/**
 * Flexible Conversation Windowing Strategies
 * 
 * Provides reusable conversation assembly primitives for different processing patterns.
 * Allows easy switching between per-element, per-file, and per-batch conversation strategies
 * to optimize for API rate limits and processing efficiency.
 * 
 * @tested_by tests/agent/windowing.test.ts (Strategy patterns, conversation assembly)
 */

import { Effect, pipe } from 'effect'
import type { VibeError } from '../index.ts'
import { createIndexingProgressTracker, type IndexingProgressTracker } from './progress.ts'

/**
 * Windowing strategy configuration
 */
export interface WindowingStrategy {
  /** Processing granularity */
  type: 'per-element' | 'per-file' | 'per-batch'
  
  /** Execution mode */
  parallelism: 'parallel' | 'serial'
  
  /** Batch size for per-batch processing */
  batchSize?: number
  
  /** Rate limit delay between operations (ms) */
  rateLimit?: number
  
  /** Maximum concurrent operations */
  maxConcurrency?: number
}

/**
 * Processable item interface
 */
export interface ProcessableItem {
  id: string
  type: string
  data: any
  metadata?: Record<string, any>
}

/**
 * Conversation window for grouped processing
 */
export interface ConversationWindow {
  id: string
  strategy: WindowingStrategy
  items: ProcessableItem[]
  context?: string
  priority?: number
}

/**
 * Processing result
 */
export interface ProcessingResult {
  itemId: string
  success: boolean
  result?: any
  error?: string
  processingTime: number
  tokens?: number
}

/**
 * Windowing execution context
 */
export interface WindowingContext {
  progressTracker?: IndexingProgressTracker
  onProgress?: (progress: { completed: number; total: number; current?: ProcessableItem }) => void
  onError?: (error: VibeError, item: ProcessableItem) => void
  abortController?: AbortController
}

/**
 * Processor function type
 */
export type ProcessorFunction<T = any> = (
  item: ProcessableItem,
  context?: WindowingContext
) => Promise<T>

/**
 * Create conversation windows based on strategy
 */
export const createConversationWindows = (
  items: ProcessableItem[],
  strategy: WindowingStrategy
): ConversationWindow[] => {
  switch (strategy.type) {
    case 'per-element':
      return items.map(item => ({
        id: item.id,
        strategy,
        items: [item],
        context: `Processing single element: ${item.type}`,
        priority: 1
      }))
    
    case 'per-file':
      // Group items by file
      const fileGroups = items.reduce((groups, item) => {
        const fileKey = item.metadata?.filename || 'unknown'
        if (!groups[fileKey]) {
          groups[fileKey] = []
        }
        groups[fileKey].push(item)
        return groups
      }, {} as Record<string, ProcessableItem[]>)
      
      return Object.entries(fileGroups).map(([filename, fileItems]) => ({
        id: `file-${filename}`,
        strategy,
        items: fileItems,
        context: `Processing file: ${filename} (${fileItems.length} elements)`,
        priority: 2
      }))
    
    case 'per-batch':
      const batchSize = strategy.batchSize || 5
      const batches: ConversationWindow[] = []
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batchItems = items.slice(i, i + batchSize)
        batches.push({
          id: `batch-${Math.floor(i / batchSize)}`,
          strategy,
          items: batchItems,
          context: `Processing batch ${Math.floor(i / batchSize) + 1} (${batchItems.length} elements)`,
          priority: 3
        })
      }
      
      return batches
    
    default:
      throw new Error(`Unknown windowing strategy: ${strategy.type}`)
  }
}

/**
 * Execute processing with windowing strategy
 */
export const executeWithWindowing = async <T>(
  items: ProcessableItem[],
  strategy: WindowingStrategy,
  processor: ProcessorFunction<T>,
  context: WindowingContext = {}
): Promise<ProcessingResult[]> => {
  const windows = createConversationWindows(items, strategy)
  const results: ProcessingResult[] = []
  
  // Initialize progress tracking
  const progressTracker = context.progressTracker || createIndexingProgressTracker(items.length)
  
  if (strategy.parallelism === 'parallel') {
    // Parallel execution with concurrency control
    const concurrency = Math.min(
      strategy.maxConcurrency || 10,
      windows.length
    )
    
    const executeWindow = async (window: ConversationWindow): Promise<ProcessingResult[]> => {
      const windowResults: ProcessingResult[] = []
      
      for (const item of window.items) {
        const startTime = Date.now()
        
        try {
          // Check for abort signal
          if (context.abortController?.signal.aborted) {
            throw new Error('Operation aborted')
          }
          
          // Apply rate limiting
          if (strategy.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, strategy.rateLimit))
          }
          
          // Process item
          const result = await processor(item, context)
          const processingTime = Date.now() - startTime
          
          const processingResult: ProcessingResult = {
            itemId: item.id,
            success: true,
            result,
            processingTime
          }
          
          windowResults.push(processingResult)
          
          // Update progress
          if (context.onProgress) {
            context.onProgress({
              completed: results.length + windowResults.length,
              total: items.length,
              current: item
            })
          }
          
        } catch (error) {
          const processingTime = Date.now() - startTime
          const processingResult: ProcessingResult = {
            itemId: item.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            processingTime
          }
          
          windowResults.push(processingResult)
          
          // Handle error
          if (context.onError && error instanceof Error) {
            context.onError(error as VibeError, item)
          }
        }
      }
      
      return windowResults
    }
    
    // Execute windows with concurrency control
    const windowBatches: ConversationWindow[][] = []
    for (let i = 0; i < windows.length; i += concurrency) {
      windowBatches.push(windows.slice(i, i + concurrency))
    }
    
    for (const batch of windowBatches) {
      const batchResults = await Promise.allSettled(
        batch.map(window => executeWindow(window))
      )
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value)
        } else {
          // Handle failed window
          const window = batch[index]
          window.items.forEach(item => {
            results.push({
              itemId: item.id,
              success: false,
              error: result.reason.message || 'Window processing failed',
              processingTime: 0
            })
          })
        }
      })
    }
    
  } else {
    // Serial execution
    for (const window of windows) {
      for (const item of window.items) {
        const startTime = Date.now()
        
        try {
          // Check for abort signal
          if (context.abortController?.signal.aborted) {
            throw new Error('Operation aborted')
          }
          
          // Apply rate limiting
          if (strategy.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, strategy.rateLimit))
          }
          
          // Process item
          const result = await processor(item, context)
          const processingTime = Date.now() - startTime
          
          const processingResult: ProcessingResult = {
            itemId: item.id,
            success: true,
            result,
            processingTime
          }
          
          results.push(processingResult)
          
          // Update progress
          if (context.onProgress) {
            context.onProgress({
              completed: results.length,
              total: items.length,
              current: item
            })
          }
          
        } catch (error) {
          const processingTime = Date.now() - startTime
          const processingResult: ProcessingResult = {
            itemId: item.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            processingTime
          }
          
          results.push(processingResult)
          
          // Handle error
          if (context.onError && error instanceof Error) {
            context.onError(error as VibeError, item)
          }
        }
      }
    }
  }
  
  return results
}

/**
 * Predefined windowing strategies
 */
export const WindowingStrategies = {
  /**
   * Current strategy (causes API rate limits)
   */
  perElementParallel: {
    type: 'per-element',
    parallelism: 'parallel',
    maxConcurrency: 10
  } as WindowingStrategy,
  
  /**
   * Fix for API rate limits
   */
  perFileSerial: {
    type: 'per-file',
    parallelism: 'serial',
    rateLimit: 1000 // 1 second between files
  } as WindowingStrategy,
  
  /**
   * Future optimization
   */
  perBatchOptimized: {
    type: 'per-batch',
    parallelism: 'parallel',
    batchSize: 5,
    maxConcurrency: 3,
    rateLimit: 500
  } as WindowingStrategy,
  
  /**
   * Conservative approach
   */
  perElementSerial: {
    type: 'per-element',
    parallelism: 'serial',
    rateLimit: 2000 // 2 seconds between elements
  } as WindowingStrategy
}

/**
 * Create custom windowing strategy
 */
export const createCustomWindowing = (
  baseStrategy: WindowingStrategy,
  overrides: Partial<WindowingStrategy>
): WindowingStrategy => {
  return { ...baseStrategy, ...overrides }
}

/**
 * Estimate processing time for a windowing strategy
 */
export const estimateProcessingTime = (
  itemCount: number,
  strategy: WindowingStrategy,
  averageItemTime: number = 2000 // 2 seconds per item
): number => {
  const rateLimit = strategy.rateLimit || 0
  const concurrency = strategy.maxConcurrency || 1
  
  if (strategy.parallelism === 'parallel') {
    const batches = Math.ceil(itemCount / concurrency)
    return batches * (averageItemTime + rateLimit)
  } else {
    return itemCount * (averageItemTime + rateLimit)
  }
}

/**
 * Effect-TS wrapper for windowing execution
 */
export const executeWithWindowingEffect = <T>(
  items: ProcessableItem[],
  strategy: WindowingStrategy,
  processor: ProcessorFunction<T>,
  context: WindowingContext = {}
): Effect.Effect<ProcessingResult[], VibeError> =>
  Effect.tryPromise({
    try: () => executeWithWindowing(items, strategy, processor, context),
    catch: (error) => error as VibeError
  })

/**
 * Windowing utilities
 */
export const WindowingUtils = {
  createConversationWindows,
  executeWithWindowing,
  estimateProcessingTime,
  createCustomWindowing,
  WindowingStrategies
} as const