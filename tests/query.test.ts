/**
 * Query system tests using real embedding data
 */

import { describe, it } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect } from 'effect'
import {
  executeQuery,
  extractCodeSnippets,
  calculateRelevanceScore,
  formatQueryResults,
  searchEmbeddings,
  type QueryOptions,
  type QueryResult,
  type EmbeddingStorage,
  type EmbeddingResult
} from '../src/query.ts'
import { cosineSimilarity } from '../src/index.ts'

// Mock embedding data based on actual Google Gemini API response
const MOCK_EMBEDDING_VECTOR = [
  -0.003287198, 0.0130567765, -0.05462892, 0.032720804, 0.07879235,
  0.044839807, 0.05569879, -0.012863496, -0.05548641, 0.018273016,
  0.028080128, 0.056656275, 0.07031554, 0.01386435, 0.001446831,
  -0.033401884, 0.023432441, 0.032914896, -0.06657191, -0.022444533,
  -0.027275058, -0.0004175116, -0.01685904, -0.011026565, -0.020244977,
  -0.03359941, 0.005093794, 0.0107810795, 0.024912063, -0.0116610285
  // Truncated for test readability
]

const MOCK_FULL_CODE_TEXT = `// Sample TypeScript code for testing embedding functionality

import { Effect, pipe } from 'effect'

/**
 * Async function that fetches user data from an API
 */
export const fetchUserData = (userId: string): Effect.Effect<User, FetchError> =>
  Effect.tryPromise({
    try: () => fetch('/api/users/' + userId).then(res => res.json()),
    catch: (error) => createFetchError(error, 'Failed to fetch user ' + userId)
  })

/**
 * Synchronous function that validates email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /\S+@\S+\.\S+/
  return emailRegex.test(email)
}

/**
 * Error handling utility for API responses
 */
export const handleApiError = (error: unknown): ApiError => {
  if (error instanceof Error) {
    return {
      _tag: 'ApiError',
      message: error.message,
      code: 'UNKNOWN_ERROR'
    }
  }
  return {
    _tag: 'ApiError', 
    message: 'Unknown error occurred',
    code: 'UNKNOWN_ERROR'
  }
}

/**
 * Complex async operation with error recovery
 */
export const processUserRegistration = (userData: UserRegistrationData) =>
  pipe(
    validateUserData(userData),
    Effect.flatMap(validData => createUser(validData)),
    Effect.flatMap(user => sendWelcomeEmail(user.email)),
    Effect.catchAll(error => 
      pipe(
        logError(error),
        Effect.flatMap(() => Effect.fail(error))
      )
    )
  )`

const MOCK_EMBEDDING_RESULT: EmbeddingResult = {
  text: MOCK_FULL_CODE_TEXT,
  embedding: MOCK_EMBEDDING_VECTOR,
  model: 'text-embedding-004',
  timestamp: 1752083209903
}

const MOCK_EMBEDDING_STORAGE: EmbeddingStorage = {
  version: '1.0.0',
  created: 1752083209903,
  embeddings: [MOCK_EMBEDDING_RESULT]
}

describe('Code Snippet Extraction', () => {
  it('should extract function definitions from code', () => {
    const snippets = extractCodeSnippets(MOCK_FULL_CODE_TEXT, 10)
    
    assert(snippets.length > 0)
    
    // Should extract the fetchUserData function
    const fetchUserSnippet = snippets.find(s => s.includes('export const fetchUserData'))
    assertExists(fetchUserSnippet, 'Could not find fetchUserData function in snippets')
    assert(fetchUserSnippet.includes('Effect.tryPromise'), `fetchUserData snippet missing Effect.tryPromise: ${fetchUserSnippet}`)
    
    // Should extract the validateEmail function
    const validateEmailSnippet = snippets.find(s => s.includes('export const validateEmail'))
    assertExists(validateEmailSnippet)
    assert(validateEmailSnippet.includes('emailRegex'))
    
    // Should extract error handling function
    const errorHandlerSnippet = snippets.find(s => s.includes('export const handleApiError'))
    assertExists(errorHandlerSnippet)
    assert(errorHandlerSnippet.includes('ApiError'))
  })

  it('should extract interface definitions', () => {
    const codeWithInterface = `interface User {
  id: string
  email: string
  name: string
}

export const createUser = (data: any) => ({ ...data })`

    const snippets = extractCodeSnippets(codeWithInterface, 5)
    
    const interfaceSnippet = snippets.find(s => s.includes('interface User'))
    assertExists(interfaceSnippet)
    assert(interfaceSnippet.includes('id: string'))
  })

  it('should extract type definitions', () => {
    const codeWithType = `type UserStatus = 'active' | 'inactive'

export const getStatus = () => 'active' as UserStatus`

    const snippets = extractCodeSnippets(codeWithType, 5)
    
    const typeSnippet = snippets.find(s => s.includes('type UserStatus'))
    assertExists(typeSnippet)
  })

  it('should fallback to chunks when no functions found', () => {
    const plainCode = `const a = 1
const b = 2
const c = 3
const d = 4
const e = 5`

    const snippets = extractCodeSnippets(plainCode, 3)
    
    assert(snippets.length > 0)
    assert(snippets[0]!.includes('const a = 1'))
  })

  it('should respect maxLines parameter', () => {
    const snippets = extractCodeSnippets(MOCK_FULL_CODE_TEXT, 5)
    
    for (const snippet of snippets) {
      const lines = snippet.split('\n')
      assert(lines.length <= 5)
    }
  })
})

describe('Relevance Score Calculation', () => {
  it('should calculate high score for exact keyword matches', () => {
    const queryText = 'async function'
    const resultText = 'export const fetchUserData = async function'
    const similarity = 0.8
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    // Should be high due to similarity + keyword match
    assert(score > 80)
  })

  it('should boost score for async keyword matches', () => {
    const queryText = 'async functions'
    const resultText = 'async function that does something'
    const similarity = 0.6
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    // Should get async boost
    assert(score > 60)
  })

  it('should boost score for function keyword matches', () => {
    const queryText = 'function definition'
    const resultText = 'export function doSomething'
    const similarity = 0.5
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    // Should get function boost
    assert(score > 50)
  })

  it('should boost score for error keyword matches', () => {
    const queryText = 'error handling'
    const resultText = 'catch (error) => createError(error)'
    const similarity = 0.5
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    // Should get error boost
    assert(score > 50)
  })

  it('should handle multiple keyword matches', () => {
    const queryText = 'async error function'
    const resultText = 'async function handleError(error) {}'
    const similarity = 0.7
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    // Should get multiple boosts
    assert(score > 70)
  })

  it('should cap score at 100', () => {
    const queryText = 'async function error'
    const resultText = 'async function handleError with function and async and error'
    const similarity = 1.0
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    assertEquals(score, 100)
  })

  it('should ignore short words in keyword matching', () => {
    const queryText = 'a an the in on'
    const resultText = 'some code with a and an and the'
    const similarity = 0.5
    
    const score = calculateRelevanceScore(similarity, queryText, resultText)
    
    // Should be close to base similarity score (no significant boost)
    assert(score >= 50)
    assert(score < 60)
  })
})

describe('Search Embeddings', () => {
  it('should search embeddings and return relevant results', async () => {
    // Create a mock query embedding (similar to stored embedding)
    const queryEmbedding: EmbeddingResult = {
      text: 'async functions',
      embedding: MOCK_EMBEDDING_VECTOR, // Same as stored for high similarity
      model: 'text-embedding-004',
      timestamp: Date.now()
    }

    const options: QueryOptions = {
      limit: 5,
      minSimilarity: 0.1,
      model: 'text-embedding-004'
    }

    const program = searchEmbeddings(queryEmbedding, MOCK_EMBEDDING_STORAGE, options)
    const results = await Effect.runPromise(program)

    assert(results.length > 0)
    
    // Results should be sorted by relevance score
    for (let i = 1; i < results.length; i++) {
      assert(results[i - 1]!.relevanceScore >= results[i]!.relevanceScore)
    }

    // Each result should have required fields
    for (const result of results) {
      assertExists(result.text)
      assert(typeof result.similarity === 'number')
      assert(typeof result.relevanceScore === 'number')
      assertExists(result.sourceEmbedding)
      assert(result.similarity >= 0)
      assert(result.similarity <= 1)
      assert(result.relevanceScore >= 0)
      assert(result.relevanceScore <= 100)
    }
  })

  it('should filter results by minimum similarity', async () => {
    // Create a very different query embedding
    const differentVector = MOCK_EMBEDDING_VECTOR.map(v => -v * 0.1)
    const queryEmbedding: EmbeddingResult = {
      text: 'completely different query',
      embedding: differentVector,
      model: 'text-embedding-004',
      timestamp: Date.now()
    }

    const options: QueryOptions = {
      limit: 5,
      minSimilarity: 0.9, // Very high threshold
      model: 'text-embedding-004'
    }

    const program = searchEmbeddings(queryEmbedding, MOCK_EMBEDDING_STORAGE, options)
    const results = await Effect.runPromise(program)

    // Should have no results due to high similarity threshold
    assertEquals(results.length, 0)
  })

  it('should respect limit parameter', async () => {
    const queryEmbedding: EmbeddingResult = {
      text: 'test query',
      embedding: MOCK_EMBEDDING_VECTOR,
      model: 'text-embedding-004',
      timestamp: Date.now()
    }

    const options: QueryOptions = {
      limit: 2,
      minSimilarity: 0.0,
      model: 'text-embedding-004'
    }

    const program = searchEmbeddings(queryEmbedding, MOCK_EMBEDDING_STORAGE, options)
    const results = await Effect.runPromise(program)

    assert(results.length <= 2)
  })
})

describe('Query Response Formatting', () => {
  it('should format query results with proper structure', () => {
    const mockResponse = {
      query: 'async functions',
      results: [
        {
          text: 'export const fetchUserData = async () => {}',
          similarity: 0.85,
          relevanceScore: 89.5,
          sourceEmbedding: {
            text: MOCK_FULL_CODE_TEXT,
            model: 'text-embedding-004',
            timestamp: 1752083209903
          }
        }
      ],
      totalResults: 1,
      executionTime: 150
    }

    const formatted = formatQueryResults(mockResponse)

    assert(formatted.includes('🔍 Query: "async functions"'))
    assert(formatted.includes('📊 Found 1 results in 150ms'))
    assert(formatted.includes('## Result 1'))
    assert(formatted.includes('Relevance: 89.5%'))
    assert(formatted.includes('Similarity: 85.0%'))
    assert(formatted.includes('```typescript'))
    assert(formatted.includes('export const fetchUserData'))
  })

  it('should handle empty results', () => {
    const mockResponse = {
      query: 'nonexistent code',
      results: [],
      totalResults: 0,
      executionTime: 50
    }

    const formatted = formatQueryResults(mockResponse)

    assert(formatted.includes('No relevant code snippets found'))
    assert(formatted.includes('Try adjusting your query'))
  })

  it('should format multiple results correctly', () => {
    const mockResponse = {
      query: 'functions',
      results: [
        {
          text: 'function one() {}',
          similarity: 0.9,
          relevanceScore: 95,
          sourceEmbedding: {
            text: 'source1',
            model: 'text-embedding-004',
            timestamp: Date.now()
          }
        },
        {
          text: 'function two() {}',
          similarity: 0.8,
          relevanceScore: 85,
          sourceEmbedding: {
            text: 'source2',
            model: 'text-embedding-004',
            timestamp: Date.now()
          }
        }
      ],
      totalResults: 2,
      executionTime: 200
    }

    const formatted = formatQueryResults(mockResponse)

    assert(formatted.includes('## Result 1'))
    assert(formatted.includes('## Result 2'))
    assert(formatted.includes('function one()'))
    assert(formatted.includes('function two()'))
  })
})

describe('Cosine Similarity Edge Cases', () => {
  it('should handle real embedding vector similarity', () => {
    // Test with actual embedding dimensions from Google Gemini
    const vector1 = MOCK_EMBEDDING_VECTOR
    const vector2 = MOCK_EMBEDDING_VECTOR.map(v => v + 0.01) // Slightly different
    
    const similarity = cosineSimilarity(vector1, vector2)
    
    // Should be very high but not 1.0
    assert(similarity > 0.99)
    assert(similarity < 1.0)
  })

  it('should handle real vector magnitudes', () => {
    // Test with vectors that have realistic magnitudes
    const vector1 = MOCK_EMBEDDING_VECTOR
    const vector2 = MOCK_EMBEDDING_VECTOR.map(v => v * 2) // Double magnitude
    
    const similarity = cosineSimilarity(vector1, vector2)
    
    // Should be 1.0 since direction is the same
    assert(similarity > 0.999)
  })
})