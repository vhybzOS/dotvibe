/**
 * Query System - SurrealDB Vector Search Implementation
 * 
 * @tested_by tests/query.test.ts (Query processing, result formatting)
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createStorageError, type VibeError } from './index.ts'
import { ensureWorkspaceReady } from './workspace.ts'
import { connectToDatabase, searchVectors, type SearchOptions } from './database.ts'
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
  createdAt: z.string()
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
 * Calculate relevance score based on similarity and keyword matching
 */
export const calculateRelevanceScore = (
  similarity: number,
  queryText: string,
  resultText: string
): number => {
  // Base score from similarity (0-100)
  let score = similarity * 100
  
  // Boost for keyword matches
  const queryWords = queryText.toLowerCase().split(/\s+/)
  const resultWords = resultText.toLowerCase()
  
  const keywordMatches = queryWords.filter(word => 
    word.length > 2 && resultWords.includes(word)
  ).length
  
  const keywordBoost = (keywordMatches / queryWords.length) * 20
  score += keywordBoost
  
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
        connectToDatabase('.vibe/code.db'),
        Effect.flatMap(db => {
          const searchOptions: SearchOptions = {
            limit: options.limit,
            threshold: options.minSimilarity
          }
          
          return pipe(
            searchVectors(db, queryEmbedding.embedding, searchOptions),
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
          result.content
        )
        
        return {
          text: result.content,
          similarity: result.similarity,
          relevanceScore,
          filePath: result.file_path,
          createdAt: result.created_at
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
  
  return Effect.flatMap(
    searchCode(queryText, queryOptions),
    (results) => Effect.sync(() => ({
      query: queryText,
      results,
      totalResults: results.length,
      executionTime: Date.now() - startTime
    }))
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
    lines.push(`## Result ${index + 1} - ${result.filePath}`)
    lines.push(`**Relevance:** ${result.relevanceScore.toFixed(1)}% | **Similarity:** ${(result.similarity * 100).toFixed(1)}%`)
    lines.push('')
    
    // Extract and display code snippets
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
    lines.push('')
  })
  
  return lines.join('\n')
}