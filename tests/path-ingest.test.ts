/**
 * Path Ingest Module Tests
 * 
 * Tests the file combination functionality for LLM context preparation
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { PathIngest, ingestPath, IngestConfigSchema, defaultConfigs } from '../src/path-ingest.ts'
import { join, resolve } from '@std/path'

// Test directory setup
const testDir = './test-ingest-temp'

describe('PathIngest Module', () => {
  beforeEach(async () => {
    // Create test directory structure
    await Deno.mkdir(testDir, { recursive: true })
    await Deno.mkdir(join(testDir, 'src'), { recursive: true })
    await Deno.mkdir(join(testDir, 'docs'), { recursive: true })
    
    // Create test files
    await Deno.writeTextFile(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0'
    }, null, 2))
    
    await Deno.writeTextFile(join(testDir, 'src/index.ts'), `
export function hello() {
  return 'Hello, World!'
}

export interface User {
  id: number
  name: string
}
`.trim())
    
    await Deno.writeTextFile(join(testDir, 'src/utils.ts'), `
export function add(a: number, b: number): number {
  return a + b
}
`.trim())
    
    await Deno.writeTextFile(join(testDir, 'docs/README.md'), `
# Test Project

This is a test project for path ingest functionality.
`.trim())
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await Deno.remove(testDir, { recursive: true })
    } catch {
      // Ignore errors if directory doesn't exist
    }
  })

  it('should create PathIngest instance with default config', () => {
    const ingest = new PathIngest(testDir)
    assertExists(ingest)
  })

  it('should validate config schema', () => {
    const validConfig = {
      fileGlobs: ['**/*.ts'],
      excludeGlobs: ['**/node_modules/**'],
      includeDirectoryTree: true
    }
    
    const result = IngestConfigSchema.parse(validConfig)
    assertEquals(result.fileGlobs, ['**/*.ts'])
    assertEquals(result.includeDirectoryTree, true)
  })

  it('should ingest files and generate combined output', async () => {
    const config = {
      fileGlobs: ['**/*.ts', '**/*.json'],
      excludeGlobs: []
    }
    
    const result = await ingestPath(testDir, config)
    
    assertExists(result.content)
    assertExists(result.stats)
    
    // Should include directory structure
    assert(result.content.includes('Directory structure:'))
    assert(result.content.includes('└── test-ingest-temp/'))
    
    // Should include file separators and content
    assert(result.content.includes('FILE: package.json'))
    assert(result.content.includes('FILE: src/index.ts'))
    assert(result.content.includes('FILE: src/utils.ts'))
    
    // Should include actual file content
    assert(result.content.includes('export function hello()'))
    assert(result.content.includes('export function add('))
    assert(result.content.includes('"name": "test-project"'))
  })

  it('should filter files based on globs', async () => {
    const config = {
      fileGlobs: ['**/*.ts'], // Only TypeScript files
      excludeGlobs: []
    }
    
    const result = await ingestPath(testDir, config)
    
    // Should include TypeScript files
    assert(result.content.includes('FILE: src/index.ts'))
    assert(result.content.includes('FILE: src/utils.ts'))
    
    // Should not include other files
    assert(!result.content.includes('FILE: package.json'))
    assert(!result.content.includes('FILE: docs/README.md'))
  })

  it('should exclude files based on exclude globs', async () => {
    const config = {
      fileGlobs: ['**/*'],
      excludeGlobs: ['**/src/**'] // Exclude src directory
    }
    
    const result = await ingestPath(testDir, config)
    
    // Should include root files
    assert(result.content.includes('FILE: package.json'))
    
    // Should not include src files
    assert(!result.content.includes('FILE: src/index.ts'))
    assert(!result.content.includes('FILE: src/utils.ts'))
  })

  it('should provide accurate statistics', async () => {
    const config = {
      fileGlobs: ['**/*.ts'],
      excludeGlobs: []
    }
    
    const result = await ingestPath(testDir, config)
    
    assertEquals(result.stats.fileCount, 2) // index.ts and utils.ts
    assert(result.stats.totalSize > 0)
    assert(result.stats.totalLines > 0)
    assert(result.stats.averageFileSize > 0)
    assertEquals(result.stats.rootPath, resolve(testDir))
  })

  it('should handle different encoding types', async () => {
    // Create file with UTF-8 BOM
    const bomFile = join(testDir, 'bom-test.txt')
    const bomBytes = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('Hello BOM')])
    await Deno.writeFile(bomFile, bomBytes)
    
    const config = {
      fileGlobs: ['**/*.txt'],
      excludeGlobs: []
    }
    
    const result = await ingestPath(testDir, config)
    
    assert(result.content.includes('Hello BOM'))
    assert(!result.content.includes('\uFEFF')) // BOM should be stripped
  })

  it('should use default configurations correctly', () => {
    // Test typescript default config
    const tsConfig = defaultConfigs.typescript
    assertEquals(tsConfig.fileGlobs, ['**/*.{ts,tsx,js,jsx}'])
    assert(tsConfig.excludeGlobs!.includes('**/node_modules/**'))
    
    // Test docs default config
    const docsConfig = defaultConfigs.docs
    assertEquals(docsConfig.fileGlobs, ['**/*.{md,mdx,txt,rst}'])
  })

  it('should handle cross-platform paths', async () => {
    const config = {
      fileGlobs: ['**/*.ts'],
      normalizeLineEndings: true
    }
    
    // Create file with Windows line endings
    const winFile = join(testDir, 'windows.ts')
    await Deno.writeTextFile(winFile, 'line1\r\nline2\r\nline3')
    
    const result = await ingestPath(testDir, config)
    
    // Should normalize to Unix line endings
    assert(result.content.includes('line1\nline2\nline3'))
    assert(!result.content.includes('\r\n'))
  })

  it('should generate proper directory tree', async () => {
    const result = await ingestPath(testDir, { includeDirectoryTree: true })
    
    const content = result.content
    
    // Should have proper tree structure
    assert(content.includes('Directory structure:'))
    assert(content.includes('└── test-ingest-temp/'))
    assert(content.includes('├── docs/') || content.includes('└── docs/'))
    assert(content.includes('├── src/') || content.includes('└── src/'))
    
    // Should show files in directories
    assert(content.includes('index.ts'))
    assert(content.includes('utils.ts'))
    assert(content.includes('README.md'))
  })

  it('should skip files that are too large', async () => {
    const config = {
      fileGlobs: ['**/*.txt'],
      maxFileSize: 10 // Very small limit
    }
    
    // Create a large file
    const largeContent = 'x'.repeat(100) // Larger than 10 bytes
    await Deno.writeTextFile(join(testDir, 'large.txt'), largeContent)
    
    const result = await ingestPath(testDir, config)
    
    // Should not include the large file
    assert(!result.content.includes('FILE: large.txt'))
    assertEquals(result.stats.fileCount, 0)
  })
})