/**
 * Tests for vibe init command
 * 
 * @tested_by src/commands/init.ts
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect, Either } from 'effect'
import { initCommand } from '../src/commands/init.ts'

// Test directory for isolated testing
const TEST_DIR = './test-workspace'

describe('vibe init command', () => {
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

  it('should create .vibe directory when it does not exist', async () => {
    const program = initCommand()
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isRight(result), 'Init command should succeed')
    
    // Verify .vibe directory was created
    const vibeStats = await Deno.stat('.vibe')
    assert(vibeStats.isDirectory, '.vibe should be a directory')
  })

  it('should create code.db file in .vibe directory', async () => {
    const program = initCommand()
    await Effect.runPromise(program)
    
    // Verify code.db file was created
    const dbStats = await Deno.stat('.vibe/code.db')
    assert(dbStats.isFile, 'code.db should be a file')
  })

  it('should fail if .vibe directory already exists', async () => {
    // Create .vibe directory first
    await Deno.mkdir('.vibe')
    
    const program = initCommand()
    const result = await Effect.runPromise(Effect.either(program))
    
    assert(Either.isLeft(result), 'Init command should fail when .vibe exists')
    const error = Either.getLeft(result)
    assert(error && error.message.includes('workspace already exists'), 'Should have appropriate error message')
  })

  it('should initialize SurrealDB with proper schema', async () => {
    const program = initCommand()
    await Effect.runPromise(program)
    
    // Verify database file exists and has proper size (not empty)
    const dbStats = await Deno.stat('.vibe/code.db')
    assert(dbStats.size > 0, 'Database file should not be empty')
    
    // TODO: Add test to verify schema was created properly
    // This will require connecting to the database and checking tables
  })

  it('should create config.json with default settings', async () => {
    const program = initCommand()
    await Effect.runPromise(program)
    
    // Verify config.json was created
    const configStats = await Deno.stat('.vibe/config.json')
    assert(configStats.isFile, 'config.json should be created')
    
    // Verify config content
    const configContent = await Deno.readTextFile('.vibe/config.json')
    const config = JSON.parse(configContent)
    
    assertExists(config.version, 'Config should have version')
    assertExists(config.created_at, 'Config should have created_at timestamp')
  })
})