/**
 * Semantic Query System using Google Gemini Embeddings
 * 
 * @tested_by tests/query.test.ts (Natural language processing, semantic search)
 * @tested_by tests/query-similarity.test.ts (Similarity calculation, relevance scoring)
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import {
  loadConfiguration,
  createGeminiClient,
  generateEmbedding,
  loadEmbeddings,
  cosineSimilarity,
  type VibeError,
  type EmbeddingStorage,
  type EmbeddingResult
} from './index.ts'

// Re-export types for testing
export type { EmbeddingStorage, EmbeddingResult } from './index.ts'

// Query schemas
export const QueryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(5),
  minSimilarity: z.number().min(0).max(1).default(0.1),
  model: z.string().default('text-embedding-004')
})

export const QueryResultSchema = z.object({
  text: z.string(),
  similarity: z.number(),
  relevanceScore: z.number(),
  sourceEmbedding: z.object({
    text: z.string(),
    model: z.string(),
    timestamp: z.number()
  })
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
 * Extract relevant code snippets from text based on line context
 */
export const extractCodeSnippets = (text: string, maxLines: number = 10): string[] => {
  const lines = text.split('\n')
  const snippets: string[] = []
  
  // Extract function definitions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.includes('export const') || line.includes('export function') || line.includes('interface') || line.includes('type ')) {
      const snippet = lines.slice(i, Math.min(i + maxLines, lines.length)).join('\n')
      snippets.push(snippet.trim())
    }
  }
  
  // If no functions found, split into chunks
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
 * Calculate relevance score based on similarity and text characteristics
 */
export const calculateRelevanceScore = (
  similarity: number,
  queryText: string,
  resultText: string
): number => {
  // Base score from similarity
  let score = similarity * 100
  
  // Boost score for keyword matches
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
  
  if (queryText.toLowerCase().includes('error') && resultText.includes('Error')) {
    score += 10
  }
  
  return Math.min(score, 100)
}

/**
 * Generate embedding for query text
 */
export const embedQuery = (queryText: string): Effect.Effect<EmbeddingResult, VibeError> =>
  pipe(
    loadConfiguration(),
    Effect.flatMap(config =>
      pipe(
        createGeminiClient(config.apiKey),
        Effect.flatMap(client =>
          generateEmbedding(client, {
            text: queryText,
            model: config.model
          })
        )
      )
    )
  )

/**
 * Search embeddings using semantic similarity
 */
export const searchEmbeddings = (
  queryEmbedding: EmbeddingResult,
  storage: EmbeddingStorage,
  options: QueryOptions
): Effect.Effect<QueryResult[], VibeError> =>
  Effect.try({
    try: () => {
      const results: QueryResult[] = []
      
      for (const embedding of storage.embeddings) {
        // Extract code snippets from the embedded text
        const snippets = extractCodeSnippets(embedding.text)
        
        for (const snippet of snippets) {
          const similarity = cosineSimilarity(queryEmbedding.embedding, embedding.embedding)
          
          if (similarity >= options.minSimilarity) {
            const relevanceScore = calculateRelevanceScore(
              similarity,
              queryEmbedding.text,
              snippet
            )
            
            results.push({
              text: snippet,
              similarity,
              relevanceScore,
              sourceEmbedding: {
                text: embedding.text,
                model: embedding.model,
                timestamp: embedding.timestamp
              }
            })
          }
        }
      }
      
      // Sort by relevance score (descending) and take top results
      return results
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, options.limit)
    },
    catch: (error) => ({
      _tag: 'EmbeddingError' as const,
      message: error instanceof Error ? error.message : String(error)
    })
  })

/**
 * Execute semantic query
 */
export const executeQuery = (
  queryText: string,
  options: Partial<QueryOptions> = {},
  embeddingPath: string = './embed.json'
): Effect.Effect<QueryResponse, VibeError> => {
  const startTime = Date.now()
  const queryOptions = QueryOptionsSchema.parse(options)
  
  return pipe(
    Effect.all([
      embedQuery(queryText),
      loadEmbeddings(embeddingPath)
    ]),
    Effect.flatMap(([queryEmbedding, storage]) =>
      searchEmbeddings(queryEmbedding, storage, queryOptions)
    ),
    Effect.map(results => ({
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
    lines.push('Try adjusting your query or lowering the similarity threshold.')
    return lines.join('\n')
  }
  
  response.results.forEach((result, index) => {
    lines.push(`## Result ${index + 1} (Relevance: ${result.relevanceScore.toFixed(1)}%, Similarity: ${(result.similarity * 100).toFixed(1)}%)`)
    lines.push('```typescript')
    lines.push(result.text)
    lines.push('```')
    lines.push('')
  })
  
  return lines.join('\n')
}