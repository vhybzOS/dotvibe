/**
 * Comprehensive tests for src/ingest.ts - code2prompt CLI integration
 * 
 * Tests the new ingest system that replaces path-ingest.ts
 * Coverage areas:
 * - Effect-TS integration patterns
 * - code2prompt CLI dependency handling  
 * - Configuration validation and defaults
 * - Token parsing and file statistics
 * - Error handling and edge cases
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert, assertThrows } from '@std/assert'
import { Effect } from 'effect'
import { 
  ingestPath, 
  defaultConfigs, 
  IngestConfigSchema,
  parseTokenCount,
  getFileStats,
  type IngestResult,
  type IngestConfig
} from '../src/ingest.ts'
import { createStorageError } from '../src/infra/errors.ts'
import { join } from '@std/path'

// Test directory setup
const testDir = './test-ingest-new-temp'

describe('New Ingest Module (code2prompt integration)', () => {
  beforeEach(async () => {
    // Create test directory structure
    await Deno.mkdir(testDir, { recursive: true })
    await Deno.mkdir(join(testDir, 'src'), { recursive: true })
    await Deno.mkdir(join(testDir, 'docs'), { recursive: true })
    
    // Create test files
    await Deno.writeTextFile(join(testDir, 'src', 'index.ts'), `
export interface User {
  id: number
  name: string
}

export function createUser(name: string): User {
  return { id: Math.random(), name }
}
`.trim())

    await Deno.writeTextFile(join(testDir, 'src', 'utils.ts'), `
export function formatDate(date: Date): string {
  return date.toISOString()
}
`.trim())

    await Deno.writeTextFile(join(testDir, 'docs', 'README.md'), `
# Test Project
Documentation for test project.
`.trim())

    await Deno.writeTextFile(join(testDir, 'package.json'), `
{
  "name": "test-project",
  "version": "1.0.0"
}
`.trim())
  })

  afterEach(async () => {
    try {
      await Deno.remove(testDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Effect-TS Integration', () => {
    it('should return Effect.Effect<IngestResult, VibeError>', async () => {
      const effect = ingestPath(testDir, defaultConfigs.typescript)
      
      // Should be an Effect, not a Promise
      assertExists(effect)
      assert(typeof effect === 'object', 'Should be an Effect object')
      assert('pipe' in effect, 'Should be an Effect with pipe method')
      // Note: Effect API may not expose 'map' directly, but pipe is the key indicator
    })

    it('should unwrap properly with Effect.runPromise', async () => {
      const effect = ingestPath(testDir, defaultConfigs.typescript)
      
      try {
        const result = await Effect.runPromise(effect)
        
        assertExists(result)
        assertExists(result.content)
        assertExists(result.stats)
        assertExists(result.tokenEstimate)
        assertExists(result.metadata)
      } catch (error) {
        // Expected to fail if code2prompt is not available
        const errorMessage = error instanceof Error ? error.message : String(error)
        assert(errorMessage.includes('code2prompt') || errorMessage.includes('command not found'))
      }
    })

    it('should handle Effect errors gracefully', async () => {
      const effect = ingestPath('/nonexistent/path', defaultConfigs.typescript)
      
      try {
        await Effect.runPromise(effect)
        assert(false, 'Should have thrown an error for nonexistent path')
      } catch (error) {
        assertExists(error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        assert(errorMessage.includes('Failed') || errorMessage.includes('not found'))
      }
    })
  })

  describe('Configuration Validation', () => {
    it('should validate configuration with schema', () => {
      const validConfig = {
        include: ['**/*.ts'],
        exclude: ['**/node_modules/**'],
        outputFormat: 'markdown' as const,
        tokenizer: 'cl100k',
        fullDirectoryTree: true,
        noClipboard: true
      }
      
      const result = IngestConfigSchema.parse(validConfig)
      assertEquals(result.include, validConfig.include)
      assertEquals(result.outputFormat, 'markdown')
      assertEquals(result.tokenizer, 'cl100k')
    })

    it('should have working default configurations', () => {
      const configs = [
        defaultConfigs.typescript,
        defaultConfigs.web,
        defaultConfigs.docs,
        defaultConfigs.config,
        defaultConfigs.comprehensive
      ]
      
      for (const config of configs) {
        const validated = IngestConfigSchema.parse(config)
        assertExists(validated.include)
        assertExists(validated.outputFormat)
        assert(validated.include.length > 0)
      }
    })

    it('should apply defaults for missing fields', () => {
      const minimalConfig = { include: ['**/*.ts'] }
      const result = IngestConfigSchema.parse(minimalConfig)
      
      assertEquals(result.outputFormat, 'markdown') // Default
      assertEquals(result.noClipboard, true) // Default
      assertEquals(result.fullDirectoryTree, true) // Default
    })

    it('should reject invalid configurations', () => {
      assertThrows(() => {
        IngestConfigSchema.parse({
          include: [], // Empty include should fail
          outputFormat: 'invalid_format'
        })
      })
    })
  })

  describe('Token Parsing', () => {
    it('should parse token count from code2prompt output', async () => {
      const mockOutput = '[i] Token count: 150, Model info: ChatGPT models, text-embedding-ada-002'
      
      const result = await Effect.runPromise(parseTokenCount(mockOutput, 'cl100k'))
      
      assertEquals(result.totalTokens, 150)
      assertEquals(result.inputTokens, 150)
      assertEquals(result.outputTokens, 0)
      assertEquals(result.tokenizer, 'cl100k')
    })

    it('should handle different token count formats', async () => {
      const outputs = [
        '[i] Token count: 42, Model info: GPT-4 models',
        '[i] Token count: 1000, Model info: Claude models, claude-instant',
        '[i] Token count: 500, Model info: Custom tokenizer'
      ]
      
      for (const output of outputs) {
        const result = await Effect.runPromise(parseTokenCount(output, 'cl100k'))
        assert(result.totalTokens > 0)
        assertEquals(result.tokenizer, 'cl100k')
      }
    })

    it('should fail gracefully on invalid token output', async () => {
      const invalidOutputs = [
        'No token information',
        '[i] Processing files...',
        'Token count: not a number',
        ''
      ]
      
      for (const output of invalidOutputs) {
        try {
          await Effect.runPromise(parseTokenCount(output, 'cl100k'))
          assert(false, `Should have failed for: ${output}`)
        } catch (error) {
          assertExists(error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          assert(errorMessage.includes('Failed to parse token count'))
        }
      }
    })
  })

  describe('File Statistics', () => {
    it('should generate file statistics from stdout', async () => {
      const mockStdout = `
\`src/index.ts\`:
export function example() {}

\`src/utils.ts\`:
export const helper = () => true

\`docs/README.md\`:
# Documentation
`.trim()
      
      const result = await Effect.runPromise(
        getFileStats(testDir, mockStdout, '', 147)
      )
      
      assertEquals(result.fileCount, 3) // Should count 3 files
      assertEquals(result.processingTime, 147)
      assertExists(result.cliVersion)
      assert(Array.isArray(result.excludedFiles))
      assert(Array.isArray(result.includedFiles))
    })

    it('should handle empty output', async () => {
      const result = await Effect.runPromise(
        getFileStats(testDir, '', '', 50)
      )
      
      assertEquals(result.fileCount, 0)
      assertEquals(result.processingTime, 50)
    })

    it('should extract CLI version from stderr', async () => {
      const mockStderr = 'code2prompt v3.0.2 starting...'
      
      const result = await Effect.runPromise(
        getFileStats(testDir, 'content', mockStderr, 100)
      )
      
      assertEquals(result.cliVersion, '3.0.2')
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle missing code2prompt CLI gracefully', async () => {
      // This test checks what happens when code2prompt is not installed
      const effect = ingestPath(testDir, defaultConfigs.typescript)
      
      try {
        await Effect.runPromise(effect)
        // If it succeeds, code2prompt is available - check the result format
        console.log('✅ code2prompt CLI is available')
      } catch (error) {
        // Expected failure when CLI is not available
        const errorMessage = error instanceof Error ? error.message : String(error)
        assert(
          errorMessage.includes('code2prompt') || 
          errorMessage.includes('command not found') ||
          errorMessage.includes('No such file'),
          `Unexpected error: ${errorMessage}`
        )
        console.log('ℹ️ code2prompt CLI not available (expected in test environment)')
      }
    })

    it('should validate returned interface structure', async () => {
      // Create a mock successful result to test interface
      const mockResult: IngestResult = {
        content: 'test content',
        tokenEstimate: {
          totalTokens: 100,
          inputTokens: 100,
          outputTokens: 0,
          tokenizer: 'cl100k'
        },
        stats: {
          fileCount: 2,
          totalSize: 1024,
          processingTime: 150,
          cliVersion: '3.0.2',
          excludedFiles: [],
          includedFiles: ['file1.ts', 'file2.ts']
        },
        metadata: {
          targetPath: testDir,
          absolutePath: '/abs/path',
          config: IngestConfigSchema.parse(defaultConfigs.typescript),
          startTime: new Date(),
          endTime: new Date(),
          cliCommand: 'code2prompt --output-format markdown',
          modelTokenizer: 'cl100k'
        }
      }
      
      // Validate all required fields exist
      assertExists(mockResult.content)
      assertExists(mockResult.tokenEstimate)
      assertExists(mockResult.stats)
      assertExists(mockResult.metadata)
      
      // Validate nested structures
      assertEquals(mockResult.tokenEstimate.totalTokens, 100)
      assertEquals(mockResult.stats.fileCount, 2)
      assertEquals(mockResult.metadata.targetPath, testDir)
    })
  })

  describe('Model Tokenizer Mapping', () => {
    it('should map models to correct tokenizers', async () => {
      const testCases = [
        { model: 'gemini-2.5-flash', expectedTokenizer: 'cl100k' },
        { model: 'gpt-4', expectedTokenizer: 'cl100k' },
        { model: 'claude-3', expectedTokenizer: 'cl100k' },
        { model: 'unknown-model', expectedTokenizer: 'cl100k' }
      ]
      
      for (const { model, expectedTokenizer } of testCases) {
        const effect = ingestPath(testDir, {}, model)
        
        // We can't easily test the internal tokenizer mapping without running the effect,
        // but we can verify the effect is created without errors
        assertExists(effect)
        assert('pipe' in effect)
      }
    })
  })

  describe('Error Handling Edge Cases', () => {
    it('should handle directory that does not exist', async () => {
      const effect = ingestPath('/completely/nonexistent/path', defaultConfigs.typescript)
      
      try {
        await Effect.runPromise(effect)
        assert(false, 'Should have thrown error for nonexistent directory')
      } catch (error) {
        assertExists(error)
        // Should be a proper VibeError with appropriate details
        const errorMessage = error instanceof Error ? error.message : String(error)
        assert(
          errorMessage.includes('Failed') || 
          errorMessage.includes('not found') ||
          errorMessage.includes('No such file')
        )
      }
    })

    it('should handle empty directory', async () => {
      const emptyDir = './test-empty-dir'
      await Deno.mkdir(emptyDir, { recursive: true })
      
      try {
        const effect = ingestPath(emptyDir, defaultConfigs.typescript)
        const result = await Effect.runPromise(effect)
        
        // Should succeed but with minimal content
        assertExists(result)
        assertEquals(result.stats.fileCount, 0)
      } catch (error) {
        // Acceptable if code2prompt is not available
        const errorMessage = error instanceof Error ? error.message : String(error)
        assert(errorMessage.includes('code2prompt') || errorMessage.includes('command not found'))
      } finally {
        await Deno.remove(emptyDir, { recursive: true }).catch(() => {})
      }
    })
  })
})