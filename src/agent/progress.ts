/**
 * Unified Progress Tracking and Display
 * 
 * Provides real-time progress tracking for various operations:
 * - Token tracking with progress display in "240K/1M" format
 * - Indexing operations with completion dashboards
 * - Processing tasks with status tracking
 * Uses functional programming patterns with higher-order functions.
 * 
 * @tested_by tests/agent/progress.test.ts (Progress display, token accumulation, indexing progress)
 */

import { Effect, pipe } from 'effect'
import type { ThreadContext, TokenEstimate, ProgressDisplay } from './types.ts'
import type { VibeError } from '../index.ts'
import { logProcessing } from '../infra/logger.ts'

/**
 * Task status for indexing operations
 */
export type TaskStatus = 'queued' | 'analyzing' | 'completed' | 'failed'

/**
 * Processing task interface
 */
export interface ProcessingTask {
  id: string
  name: string
  type: string
  filename?: string
  status: TaskStatus
  startTime?: number
  endTime?: number
  description?: string
  error?: string
}

/**
 * Indexing progress tracker interface
 */
export interface IndexingProgressTracker {
  updateTask: (taskId: string, updates: Partial<ProcessingTask>) => void
  getProgress: () => IndexingProgressDisplay
  getDashboard: () => string
  isComplete: () => boolean
  getTasks: () => ProcessingTask[]
}

/**
 * Indexing progress display
 */
export interface IndexingProgressDisplay {
  total: number
  completed: number
  failed: number
  analyzing: number
  percentage: number
  elapsedTime: number
  estimatedTimeRemaining?: number
  tasksPerMinute?: number
}

/**
 * Token usage statistics
 */
export interface TokenUsageStats {
  current: number
  max: number
  remaining: number
  percentage: number
}

/**
 * Token tracker state
 */
export interface TokenTrackerState {
  currentTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  maxTokens: number
  threadId: string
}

/**
 * Token tracker instance returned by createTokenTracker
 */
export interface TokenTrackerInstance {
  addTokens: (tokens: TokenEstimate) => number
  getProgress: () => ProgressDisplay
  getProgressString: () => string
  getCurrentTokens: () => number
  getTotalInputTokens: () => number
  getTotalOutputTokens: () => number
  getMaxTokens: () => number
  getThreadId: () => string
  isNearLimit: (threshold?: number) => boolean
  getUsageStats: () => TokenUsageStats
  reset: () => void
  updateContext: (updates: Partial<ThreadContext>) => void
}

/**
 * Progress update callback type
 */
export type ProgressUpdateCallback = (progress: ProgressDisplay) => void

/**
 * Create a token tracker using higher-order function pattern
 */
export const createTokenTracker = (
  context: ThreadContext,
  onProgressUpdate?: ProgressUpdateCallback
): TokenTrackerInstance => {
  // Mutable state encapsulated in closure
  let state: TokenTrackerState = {
    currentTokens: context.currentTokens,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    maxTokens: context.maxTokens,
    threadId: context.threadId
  }

  const addTokens = (tokens: TokenEstimate): number => {
    state.currentTokens += tokens.totalTokens
    state.totalInputTokens += tokens.inputTokens
    state.totalOutputTokens += tokens.outputTokens

    // Trigger progress update callback if provided
    if (onProgressUpdate) {
      onProgressUpdate(getProgress())
    }

    return state.currentTokens
  }

  const getProgress = (): ProgressDisplay => ({
    current: formatTokenDisplay(state.currentTokens),
    max: formatTokenDisplay(state.maxTokens),
    percentage: calculateTokenPercentage(state.currentTokens, state.maxTokens),
    currentRaw: state.currentTokens,
    maxRaw: state.maxTokens
  })

  const getProgressString = (): string => {
    const progress = getProgress()
    return `${progress.current}/${progress.max}`
  }

  const getCurrentTokens = (): number => state.currentTokens
  const getTotalInputTokens = (): number => state.totalInputTokens
  const getTotalOutputTokens = (): number => state.totalOutputTokens
  const getMaxTokens = (): number => state.maxTokens
  const getThreadId = (): string => state.threadId

  const isNearLimit = (threshold = 0.9): boolean => {
    const percentage = state.currentTokens / state.maxTokens
    return percentage >= threshold
  }

  const getUsageStats = (): TokenUsageStats => ({
    current: state.currentTokens,
    max: state.maxTokens,
    remaining: Math.max(0, state.maxTokens - state.currentTokens),
    percentage: calculateTokenPercentage(state.currentTokens, state.maxTokens)
  })

  const reset = (): void => {
    state.currentTokens = 0
    state.totalInputTokens = 0
    state.totalOutputTokens = 0
  }

  const updateContext = (updates: Partial<ThreadContext>): void => {
    if (updates.maxTokens !== undefined) state.maxTokens = updates.maxTokens
    if (updates.currentTokens !== undefined) state.currentTokens = updates.currentTokens
    if (updates.threadId !== undefined) state.threadId = updates.threadId
  }

  return {
    addTokens,
    getProgress,
    getProgressString,
    getCurrentTokens,
    getTotalInputTokens,
    getTotalOutputTokens,
    getMaxTokens,
    getThreadId,
    isNearLimit,
    getUsageStats,
    reset,
    updateContext
  }
}

/**
 * Format token count for human-readable display
 */
export function formatTokenDisplay(tokens: number): string {
  if (tokens >= 1000000) {
    const millions = tokens / 1000000
    // Show as integer if it's a whole number, otherwise with decimal
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`
  } else if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`
  } else {
    return tokens.toString()
  }
}

/**
 * Calculate token usage percentage
 */
export function calculateTokenPercentage(current: number, max: number): number {
  if (max <= 0) return 0
  if (current < 0) return 0
  return Math.min(100, Math.round((current / max) * 100))
}

/**
 * Add two token estimates together
 */
export function addTokenCounts(estimate1: TokenEstimate, estimate2: TokenEstimate): TokenEstimate {
  return {
    totalTokens: estimate1.totalTokens + estimate2.totalTokens,
    inputTokens: estimate1.inputTokens + estimate2.inputTokens,
    outputTokens: estimate1.outputTokens + estimate2.outputTokens,
    tokenizer: estimate1.tokenizer // Use first tokenizer
  }
}

/**
 * Generate progress string with optional thread identification
 */
export function getProgressString(
  current: number, 
  max: number, 
  threadId?: string
): string {
  const progress = `${formatTokenDisplay(current)}/${formatTokenDisplay(max)}`
  
  if (threadId) {
    return `Thread ${threadId}: ${progress}`
  }
  
  return progress
}

/**
 * Create a simple progress bar string
 */
export function createProgressBar(
  current: number, 
  max: number, 
  width = 20
): string {
  const percentage = calculateTokenPercentage(current, max)
  const filled = Math.round((percentage / 100) * width)
  const empty = width - filled
  
  return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${percentage}%`
}

/**
 * Estimate remaining tokens available
 */
export function getRemainingTokens(current: number, max: number): number {
  return Math.max(0, max - current)
}

/**
 * Check if adding tokens would exceed limit
 */
export function wouldExceedLimit(
  current: number, 
  max: number, 
  additional: number
): boolean {
  return (current + additional) > max
}

/**
 * Get token efficiency ratio (output/input)
 */
export function getTokenEfficiency(inputTokens: number, outputTokens: number): number {
  if (inputTokens <= 0) return 0
  return outputTokens / inputTokens
}

/**
 * Effect-TS pattern for processing tokens
 */
export const processTokensWithEffect = (
  context: ThreadContext,
  estimate: TokenEstimate
): Effect.Effect<ProgressDisplay, VibeError> =>
  pipe(
    Effect.succeed(context),
    Effect.map(ctx => ({
      ...ctx,
      currentTokens: ctx.currentTokens + estimate.totalTokens
    })),
    Effect.map(updated => ({
      current: formatTokenDisplay(updated.currentTokens),
      max: formatTokenDisplay(updated.maxTokens),
      percentage: calculateTokenPercentage(updated.currentTokens, updated.maxTokens),
      currentRaw: updated.currentTokens,
      maxRaw: updated.maxTokens
    }))
  )

/**
 * Create token tracker with Effect-TS validation
 */
export const createTokenTrackerWithEffect = (
  context: ThreadContext,
  onProgressUpdate?: ProgressUpdateCallback
): Effect.Effect<TokenTrackerInstance, VibeError> =>
  pipe(
    Effect.succeed(context),
    Effect.map(ctx => createTokenTracker(ctx, onProgressUpdate))
  )

/**
 * Create an indexing progress tracker for processing tasks
 */
export const createIndexingProgressTracker = (
  totalTasks: number,
  startTime: number = Date.now()
): IndexingProgressTracker => {
  let tasks: ProcessingTask[] = []
  const operationStartTime = startTime

  const updateTask = (taskId: string, updates: Partial<ProcessingTask>): void => {
    const taskIndex = tasks.findIndex(t => t.id === taskId)
    if (taskIndex >= 0) {
      tasks[taskIndex] = { ...tasks[taskIndex], ...updates }
    }
  }

  const getProgress = (): IndexingProgressDisplay => {
    const completed = tasks.filter(t => t.status === 'completed').length
    const failed = tasks.filter(t => t.status === 'failed').length
    const analyzing = tasks.filter(t => t.status === 'analyzing').length
    const elapsedTime = Date.now() - operationStartTime
    
    const percentage = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0
    const tasksPerMinute = elapsedTime > 0 ? (completed / (elapsedTime / 60000)) : 0
    const estimatedTimeRemaining = tasksPerMinute > 0 ? ((totalTasks - completed) / tasksPerMinute) * 60000 : undefined

    return {
      total: totalTasks,
      completed,
      failed,
      analyzing,
      percentage,
      elapsedTime,
      estimatedTimeRemaining,
      tasksPerMinute
    }
  }

  const getDashboard = (): string => {
    const progress = getProgress()
    const bar = createProgressBar(progress.completed, progress.total)
    const eta = progress.estimatedTimeRemaining 
      ? ` (ETA: ${Math.round(progress.estimatedTimeRemaining / 60000)}m)`
      : ''
    
    return `${bar} ${progress.completed}/${progress.total} completed${eta}`
  }

  const isComplete = (): boolean => {
    return tasks.filter(t => t.status === 'completed' || t.status === 'failed').length === totalTasks
  }

  const getTasks = (): ProcessingTask[] => {
    return [...tasks]
  }

  return {
    updateTask,
    getProgress,
    getDashboard,
    isComplete,
    getTasks
  }
}

/**
 * Update progress dashboard using structured logging
 */
export const updateProgressDashboard = (
  tasks: ProcessingTask[],
  startTime: number,
  totalComponents: number,
  force: boolean = false
): void => {
  const completed = tasks.filter(t => t.status === 'completed').length
  const failed = tasks.filter(t => t.status === 'failed').length
  const analyzing = tasks.filter(t => t.status === 'analyzing').length
  
  // Use the structured progress logging
  logProcessing.progress(completed, failed, analyzing, force)
  
  // Store recent completions for verbose display
  const recentCompletions = tasks.filter(t => t.status === 'completed').slice(-3)
  recentCompletions.forEach(task => {
    if (task.description) {
      logProcessing.recentCompletion(task.name, task.type, task.filename || 'unknown', task.description)
    }
  })
}