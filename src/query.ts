/**
 * Query System - SurrealDB Vector Search Implementation
 * 
 * @tested_by tests/query.test.ts (Query processing, result formatting)
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createStorageError, type VibeError } from './index.ts'
import { ensureWorkspaceReady } from './workspace.ts'
import { connectToDatabaseEffect, searchCodeSymbols, type SearchOptions } from './database.ts'
import { generateSingleEmbedding } from './embeddings.ts'

// Query schemas
export const QueryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(5),
  minSimilarity: z.number().min(0).max(1).default(0.1)
})

export const QueryResultSchema = z.object({
  text: z.string(),
  similarity: z.number(),
  relevanceScore: z.number(),
  filePath: z.string(),
  createdAt: z.string(),
  symbolName: z.string().optional(),
  symbolKind: z.string().optional(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  code: z.string().optional(),
  lines: z.array(z.number()).optional(),
  search_phrases: z.array(z.string()).optional()
})

export const QueryResponseSchema = z.object({
  query: z.string(),
  results: z.array(QueryResultSchema),
  totalResults: z.number(),
  executionTime: z.number()
})

export type QueryOptions = z.infer<typeof QueryOptionsSchema>
export type QueryResult = z.infer<typeof QueryResultSchema>
export type QueryResponse = z.infer<typeof QueryResponseSchema>

/**
 * Extract relevant code snippets from text
 */
export const extractCodeSnippets = (text: string, maxLines: number = 10): string[] => {
  const lines = text.split('\n')
  const snippets: string[] = []
  
  // Extract function definitions, classes, interfaces, etc.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.includes('function') || line.includes('class') || line.includes('interface') || 
        line.includes('export') || line.includes('const') || line.includes('let') || 
        line.includes('type') || line.includes('enum')) {
      const snippet = lines.slice(i, Math.min(i + maxLines, lines.length)).join('\n')
      snippets.push(snippet.trim())
    }
  }
  
  // If no specific patterns found, return chunks
  if (snippets.length === 0) {
    for (let i = 0; i < lines.length; i += maxLines) {
      const chunk = lines.slice(i, i + maxLines).join('\n').trim()
      if (chunk) {
        snippets.push(chunk)
      }
    }
  }
  
  return snippets
}

/**
 * Calculate relevance score based on similarity, keyword matching, and search phrases
 */
export const calculateRelevanceScore = (
  similarity: number,
  queryText: string,
  resultText: string,
  searchPhrases: string[] = []
): number => {
  // Base score from similarity (0-100)
  let score = similarity * 100
  
  // Boost for keyword matches in description
  const queryWords = queryText.toLowerCase().split(/\s+/)
  const resultWords = resultText.toLowerCase()
  
  const keywordMatches = queryWords.filter(word => 
    word.length > 2 && resultWords.includes(word)
  ).length
  
  const keywordBoost = (keywordMatches / queryWords.length) * 20
  score += keywordBoost
  
  // NEW: Boost for search phrase matches
  const searchPhraseMatches = searchPhrases.filter(phrase => 
    queryWords.some(word => phrase.toLowerCase().includes(word)) ||
    phrase.toLowerCase().includes(queryText.toLowerCase())
  ).length
  
  if (searchPhrases.length > 0) {
    const searchPhraseBoost = (searchPhraseMatches / searchPhrases.length) * 30
    score += searchPhraseBoost
  }
  
  // Boost for code-specific patterns
  if (queryText.toLowerCase().includes('async') && resultText.includes('async')) {
    score += 10
  }
  
  if (queryText.toLowerCase().includes('function') && resultText.includes('function')) {
    score += 10
  }
  
  if (queryText.toLowerCase().includes('error') && resultText.includes('error')) {
    score += 10
  }
  
  return Math.min(score, 100)
}


/**
 * Search for relevant code using vector similarity
 */
export const searchCode = (
  queryText: string,
  options: QueryOptions
): Effect.Effect<QueryResult[], VibeError> =>
  pipe(
    ensureWorkspaceReady(),
    Effect.flatMap(() => generateSingleEmbedding(queryText)),
    Effect.flatMap(queryEmbedding =>
      pipe(
        connectToDatabaseEffect('.vibe/code.db'),
        Effect.flatMap(db => {
          const searchOptions: SearchOptions = {
            limit: options.limit,
            threshold: options.minSimilarity
          }
          
          return pipe(
            searchCodeSymbols(db, queryEmbedding.embedding, searchOptions),
            Effect.tap(() => Effect.tryPromise({
              try: () => db.close(),
              catch: (error) => createStorageError(error, 'database', 'Failed to close database')
            }).pipe(Effect.catchAll(() => Effect.succeed(void 0))))
          )
        })
      )
    ),
    Effect.map(searchResults =>
      searchResults.map(result => {
        const relevanceScore = calculateRelevanceScore(
          result.similarity,
          queryText,
          result.content,
          result.search_phrases
        )
        
        return {
          text: result.content,
          similarity: result.similarity,
          relevanceScore,
          filePath: result.file_path,
          createdAt: result.created_at,
          symbolName: result.symbol_name,
          symbolKind: result.symbol_kind,
          startLine: result.start_line,
          endLine: result.end_line,
          code: result.code,
          lines: result.lines,
          search_phrases: result.search_phrases
        }
      })
    )
  )

/**
 * Execute query - main entry point
 */
export const executeQuery = (
  queryText: string,
  options: Partial<QueryOptions> = {}
): Effect.Effect<QueryResponse, VibeError> => {
  const startTime = Date.now()
  const queryOptions = QueryOptionsSchema.parse(options)
  
  return pipe(
    searchCode(queryText, queryOptions),
    Effect.flatMap((results) => Effect.sync(() => ({
      query: queryText,
      results,
      totalResults: results.length,
      executionTime: Date.now() - startTime
    })))
  )
}

/**
 * Format query results for display
 */
export const formatQueryResults = (response: QueryResponse): string => {
  const lines: string[] = []
  
  lines.push(`🔍 Query: "${response.query}"`)
  lines.push(`📊 Found ${response.totalResults} results in ${response.executionTime}ms`)
  lines.push('')
  
  if (response.results.length === 0) {
    lines.push('No relevant code snippets found.')
    lines.push('Try:')
    lines.push('  - Using different keywords')
    lines.push('  - Lowering the similarity threshold with --similarity 0.05')
    lines.push('  - Checking if files have been indexed with "vibe index <path>"')
    return lines.join('\n')
  }
  
  response.results.forEach((result, index) => {
    // Enhanced header with line number range
    const lineRange = result.lines && result.lines.length >= 2 
      ? `:${result.lines[0]}-${result.lines[1]}`
      : result.startLine && result.endLine 
        ? `:${result.startLine}-${result.endLine}` 
        : ''
    
    lines.push(`## Result ${index + 1} - ${result.filePath}${lineRange}`)
    lines.push(`**Relevance:** ${result.relevanceScore.toFixed(1)}% | **Similarity:** ${(result.similarity * 100).toFixed(1)}%`)
    
    // Show component info if available
    if (result.symbolName && result.symbolKind) {
      lines.push(`**Component:** ${result.symbolName} (${result.symbolKind})`)
    }
    lines.push('')
    
    // Display actual code block with line numbers
    if (result.code && result.lines && result.lines.length >= 2) {
      lines.push('```typescript')
      const codeLines = result.code.split('\n')
      const startLine = result.lines[0]
      codeLines.forEach((codeLine, idx) => {
        const lineNumber = startLine + idx
        lines.push(`${lineNumber}: ${codeLine}`)
      })
      lines.push('```')
    } else {
      // Fallback to old format if new fields are not available
      const snippets = extractCodeSnippets(result.text, 15)
      if (snippets.length > 0) {
        lines.push('```typescript')
        lines.push(snippets[0]!) // Show first snippet
        lines.push('```')
      } else {
        lines.push('```')
        lines.push(result.text.split('\n').slice(0, 10).join('\n'))
        lines.push('```')
      }
    }
    
    // Show architectural description
    if (result.text && result.text !== `${result.symbolName} (${result.symbolKind}): ${result.text}`) {
      lines.push('')
      lines.push(`**Description:** ${result.text.replace(`${result.symbolName} (${result.symbolKind}): `, '')}`)
    }
    
    // NEW: Show search phrases if available
    if (result.search_phrases && result.search_phrases.length > 0) {
      lines.push('')
      lines.push(`**Search Terms:** ${result.search_phrases.join(', ')}`)
    }
    
    lines.push('')
  })
  
  return lines.join('\n')
}