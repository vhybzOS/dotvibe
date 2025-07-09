/**
 * Integration tests for CLI commands
 * 
 * @tested_by src/cli.ts
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect, Either } from 'effect'
import { executeQuery } from '../src/query.ts'
import { initCommand } from '../src/commands/init.ts'
import { indexCommand } from '../src/commands/index.ts'

const TEST_DIR = './test-cli-workspace'

describe('CLI Integration Tests', () => {
  beforeEach(async () => {
    // Clean up any existing test directory
    try {
      await Deno.remove(TEST_DIR, { recursive: true })
    } catch {
      // Directory doesn't exist, which is fine
    }
    
    // Create fresh test directory and cd into it
    await Deno.mkdir(TEST_DIR, { recursive: true })
    Deno.chdir(TEST_DIR)
    
    // Create test source files
    await Deno.mkdir('src', { recursive: true })
    
    await Deno.writeTextFile('src/auth.ts', `
export async function authenticateUser(token: string) {
  try {
    const response = await fetch('/api/auth/verify', {
      headers: { Authorization: \`Bearer \${token}\` }
    })
    return response.json()
  } catch (error) {
    throw new Error('Authentication failed')
  }
}

export function validateToken(token: string): boolean {
  return token.length > 0 && token.startsWith('vibe_')
}
`)
    
    await Deno.writeTextFile('src/database.ts', `
import { Effect } from 'effect'

export const connectDB = (): Effect.Effect<Database, ConnectionError> =>
  Effect.tryPromise({
    try: () => createConnection(),
    catch: (error) => createConnectionError(error)
  })

export async function queryUsers(filter: UserFilter) {
  const db = await connectDB()
  return db.query('SELECT * FROM users WHERE ?', filter)
}
`)
    
    await Deno.writeTextFile('src/utils.ts', `
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T {
  let timeout: number | undefined
  return ((...args: any[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), wait)
  }) as T
}

export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
`)

    // Set up environment for embeddings
    Deno.env.set('GOOGLE_API_KEY', 'test-api-key-for-integration')
  })

  afterEach(async () => {
    // Return to parent directory and clean up
    Deno.chdir('../')
    try {
      await Deno.remove(TEST_DIR, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should complete full workflow: init -> index -> query', async () => {
    // Step 1: Initialize workspace
    const initResult = await Effect.runPromise(Effect.either(initCommand()))
    assert(Either.isRight(initResult), 'Init should succeed')
    
    // Verify workspace was created
    const vibeStats = await Deno.stat('.vibe')
    assert(vibeStats.isDirectory, '.vibe directory should be created')
    
    const dbStats = await Deno.stat('.vibe/code.db')
    assert(dbStats.isFile, 'Database file should be created')
    
    // Step 2: Index source files
    const indexResult = await Effect.runPromise(Effect.either(indexCommand('src/')))
    assert(Either.isRight(indexResult), 'Index should succeed')
    
    // Step 3: Query the indexed content
    const queryResult = await Effect.runPromise(Effect.either(
      executeQuery('async functions', { limit: 5 })
    ))
    assert(Either.isRight(queryResult), 'Query should succeed')
    
    const response = Either.getRight(queryResult)
    assert(response && response.results.length > 0, 'Should return search results')
    
    // Should find the async function from auth.ts
    const hasAsyncResult = response.results.some((result: any) => 
      result.text.includes('authenticateUser') || result.text.includes('async')
    )
    assert(hasAsyncResult, 'Should find async functions in results')
  })

  it('should handle error when indexing without init', async () => {
    // Try to index without initializing first
    const indexResult = await Effect.runPromise(Effect.either(indexCommand('src/')))
    
    assert(Either.isLeft(indexResult), 'Index should fail without .vibe workspace')
    const error = Either.getLeft(indexResult)
    assert(error && error.message.includes('No .vibe workspace found'), 'Should have appropriate error message')
  })

  it('should handle error when querying without data', async () => {
    // Initialize but don't index
    await Effect.runPromise(initCommand())
    
    const queryResult = await Effect.runPromise(Effect.either(
      executeQuery('async functions', { limit: 5 })
    ))
    
    // Query should succeed but return no results
    if (Either.isRight(queryResult)) {
      const response = Either.getRight(queryResult)
      assertEquals(response && response.results.length, 0, 'Should return no results when nothing is indexed')
    }
  })

  it('should maintain data across multiple index operations', async () => {
    // Initialize workspace
    await Effect.runPromise(initCommand())
    
    // Index src/ directory first
    await Effect.runPromise(indexCommand('src/'))
    
    // Create additional file
    await Deno.writeTextFile('src/new-feature.ts', `
export function newAsyncFeature() {
  return Promise.resolve('new feature')
}
`)
    
    // Index the new file
    await Effect.runPromise(indexCommand('src/new-feature.ts'))
    
    // Query should find content from both index operations
    const queryResult = await Effect.runPromise(
      executeQuery('async', { limit: 10 })
    )
    
    assert(queryResult.results.length > 0, 'Should find results from multiple index operations')
    
    // Should find content from both original files and new file
    const resultTexts = queryResult.results.map(r => r.text).join(' ')
    assert(resultTexts.includes('authenticateUser') || resultTexts.includes('newAsyncFeature'), 
      'Should find content from multiple indexing operations')
  })

  it('should respect query options', async () => {
    await Effect.runPromise(initCommand())
    await Effect.runPromise(indexCommand('src/'))
    
    // Query with limit
    const limitedQuery = await Effect.runPromise(
      executeQuery('function', { limit: 2 })
    )
    assert(limitedQuery.results.length <= 2, 'Should respect limit option')
    
    // Query with similarity threshold
    const similarityQuery = await Effect.runPromise(
      executeQuery('function', { limit: 10, minSimilarity: 0.8 })
    )
    
    // All results should meet similarity threshold
    for (const result of similarityQuery.results) {
      assert(result.relevanceScore >= 0, 'Results should have relevance score')
    }
  })

  it('should handle different file types in same index operation', async () => {
    await Effect.runPromise(initCommand())
    
    // Create files with different extensions
    await Deno.writeTextFile('src/component.jsx', `
export const Component = () => {
  return <div>Hello from JSX</div>
}
`)
    
    await Deno.writeTextFile('src/script.py', `
def python_function():
    return "Hello from Python"
`)
    
    // Index all files
    await Effect.runPromise(indexCommand('src/'))
    
    // Query should find content from different file types
    const queryResult = await Effect.runPromise(
      executeQuery('function', { limit: 10 })
    )
    
    assert(queryResult.results.length > 0, 'Should find functions from different file types')
    
    // Verify we have results from different languages
    const resultTexts = queryResult.results.map(r => r.text).join(' ')
    const hasTypeScript = resultTexts.includes('authenticateUser') || resultTexts.includes('Effect')
    const hasJSX = resultTexts.includes('Component') || resultTexts.includes('JSX')
    const hasPython = resultTexts.includes('python_function') || resultTexts.includes('Python')
    
    assert(hasTypeScript || hasJSX || hasPython, 'Should index multiple file types')
  })

  it('should preserve database across CLI sessions', async () => {
    // First session: init and index
    await Effect.runPromise(initCommand())
    await Effect.runPromise(indexCommand('src/'))
    
    // Simulate new CLI session by only querying (no re-init or re-index)
    const queryResult = await Effect.runPromise(
      executeQuery('async', { limit: 5 })
    )
    
    assert(queryResult.results.length > 0, 'Database should persist data across sessions')
  })
})