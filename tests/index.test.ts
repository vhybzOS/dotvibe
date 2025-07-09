/**
 * Tests for vibe index command
 * 
 * @tested_by src/commands/index.ts
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect, Either } from 'effect'
import { indexCommand } from '../src/commands/index.ts'
import { initCommand } from '../src/commands/init.ts'

// Test directory for isolated testing
const TEST_DIR = './test-index-workspace'

describe('vibe index command', () => {
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
    
    // Create some test files
    await Deno.mkdir('src', { recursive: true })
    await Deno.mkdir('tests', { recursive: true })
    await Deno.mkdir('docs', { recursive: true })
    
    await Deno.writeTextFile('src/app.ts', `
export const fetchUser = async (id: string) => {
  const response = await fetch(\`/api/users/\${id}\`)
  return response.json()
}

export function validateEmail(email: string): boolean {
  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/
  return regex.test(email)
}
`)
    
    await Deno.writeTextFile('src/utils.js', `
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
`)
    
    await Deno.writeTextFile('tests/app.test.ts', `
import { fetchUser } from '../src/app.ts'
// Test content
`)
    
    await Deno.writeTextFile('docs/README.md', `
# Documentation
This is a markdown file that should be ignored by default.
`)
    
    await Deno.writeTextFile('package.json', `{"name": "test-project"}`)
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

  it('should error if no .vibe workspace exists', async () => {
    const program = indexCommand('src/')
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isLeft(result), 'Index command should fail without .vibe workspace')
    const error = Either.getLeft(result)
    assert(error && error.message.includes('No .vibe workspace found'), 'Should have appropriate error message')
  })

  it('should successfully index files when .vibe workspace exists', async () => {
    // Initialize workspace first
    await Effect.runPromise(initCommand())
    
    const program = indexCommand('src/')
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Index command should succeed with .vibe workspace')
  })

  it('should scan TypeScript and JavaScript files by default', async () => {
    await Effect.runPromise(initCommand())
    
    const program = indexCommand('src/')
    await Effect.runPromise(program)
    
    // TODO: Verify that both app.ts and utils.js were indexed
    // This will require querying the database
  })

  it('should respect --ext flag for specific extensions', async () => {
    await Effect.runPromise(initCommand())
    
    const program = indexCommand('src/', { ext: ['.ts'] })
    await Effect.runPromise(program)
    
    // TODO: Verify that only .ts files were indexed, not .js files
  })

  it('should ignore non-code files by default', async () => {
    await Effect.runPromise(initCommand())
    
    const program = indexCommand('.')
    await Effect.runPromise(program)
    
    // TODO: Verify that package.json and README.md were not indexed
  })

  it('should generate embeddings for indexed files', async () => {
    await Effect.runPromise(initCommand())
    
    // Mock the embedding generation to avoid API calls in tests
    const program = indexCommand('src/')
    await Effect.runPromise(program)
    
    // TODO: Verify that embeddings were generated and stored in database
  })

  it('should store file metadata in SurrealDB', async () => {
    await Effect.runPromise(initCommand())
    
    const program = indexCommand('src/')
    await Effect.runPromise(program)
    
    // TODO: Query database to verify file metadata was stored
    // Should include file paths, content, embeddings, timestamps
  })

  it('should handle nested directories recursively', async () => {
    await Effect.runPromise(initCommand())
    
    // Create nested structure
    await Deno.mkdir('src/components', { recursive: true })
    await Deno.writeTextFile('src/components/Button.tsx', 'export const Button = () => <button>Click me</button>')
    
    const program = indexCommand('src/')
    await Effect.runPromise(program)
    
    // TODO: Verify that nested files were indexed
  })
})