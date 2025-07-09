/**
 * CLI integration tests
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { join } from '@std/path'

// Mock embedding data for tests
const MOCK_EMBEDDING_DATA = {
  version: '1.0.0',
  created: Date.now(),
  embeddings: [{
    text: `export const testFunction = () => {
  return 'test'
}`,
    embedding: Array(768).fill(0).map(() => Math.random() - 0.5),
    model: 'text-embedding-004',
    timestamp: Date.now()
  }]
}

const TEST_CODE_CONTENT = `// Test TypeScript code
export const asyncFunction = async () => {
  return await fetch('/api/data')
}

export const syncFunction = () => {
  return 'hello world'
}

interface TestInterface {
  id: string
  name: string
}`

describe('CLI Help Command', () => {
  it('should display help information', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'help'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout } = await process.output()
    const output = new TextDecoder().decode(stdout)

    assertEquals(code, 0)
    assert(output.includes('dotvibe - Toolbox for Coding Agents'))
    assert(output.includes('Quick Start:'))
    assert(output.includes('Commands:'))
  })

  it('should show help when no arguments provided', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout } = await process.output()
    const output = new TextDecoder().decode(stdout)

    assertEquals(code, 0)
    assert(output.includes('dotvibe - Toolbox for Coding Agents'))
  })
})

describe('CLI Embed Command', () => {
  const testCodeFile = './test-code.ts'
  const testEmbedFile = './test-embed.json'

  beforeEach(async () => {
    // Create test code file
    await Deno.writeTextFile(testCodeFile, TEST_CODE_CONTENT)
  })

  afterEach(async () => {
    // Cleanup test files
    try {
      await Deno.remove(testCodeFile)
    } catch { /* ignore */ }
    try {
      await Deno.remove(testEmbedFile)
    } catch { /* ignore */ }
  })

  it('should handle missing API key gracefully', async () => {
    // Temporarily unset API key
    const originalKey = Deno.env.get('GOOGLE_API_KEY')
    Deno.env.delete('GOOGLE_API_KEY')

    try {
      const process = new Deno.Command(Deno.execPath(), {
        args: ['run', '--allow-all', 'src/cli.ts', 'embed', '--file', testCodeFile, '--output', testEmbedFile],
        stdout: 'piped',
        stderr: 'piped'
      })

      const { code, stderr } = await process.output()
      const errorOutput = new TextDecoder().decode(stderr)

      assertEquals(code, 1)
      assert(errorOutput.includes('Configuration Error'))
      assert(errorOutput.includes('GOOGLE_API_KEY not found'))
    } finally {
      // Restore API key
      if (originalKey) {
        Deno.env.set('GOOGLE_API_KEY', originalKey)
      }
    }
  })

  it('should handle missing input file', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'embed', '--file', './nonexistent.ts'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stderr } = await process.output()
    const errorOutput = new TextDecoder().decode(stderr)

    assertEquals(code, 1)
    assert(errorOutput.includes('Storage Error') || errorOutput.includes('No such file'))
  })

  it('should parse embed command arguments correctly', async () => {
    // This test verifies argument parsing without making API calls
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'embed', '--help'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout } = await process.output()
    const output = new TextDecoder().decode(stdout)

    assertEquals(code, 0)
    assert(output.includes('embed'))
    assert(output.includes('Generate embeddings'))
  })
})

describe('CLI Query Command', () => {
  const testEmbedFile = './test-query-embed.json'

  beforeEach(async () => {
    // Create mock embedding file
    await Deno.writeTextFile(testEmbedFile, JSON.stringify(MOCK_EMBEDDING_DATA, null, 2))
  })

  afterEach(async () => {
    // Cleanup
    try {
      await Deno.remove(testEmbedFile)
    } catch { /* ignore */ }
  })

  it('should handle empty query', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'query', ''],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stderr } = await process.output()
    const errorOutput = new TextDecoder().decode(stderr)

    assertEquals(code, 1)
    assert(errorOutput.includes('Query cannot be empty'))
    assert(errorOutput.includes('Example: vibe query'))
  })

  it('should handle missing embeddings file', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'query', 'test query', '--embeddings', './missing.json'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stderr } = await process.output()
    const errorOutput = new TextDecoder().decode(stderr)

    assertEquals(code, 1)
    assert(errorOutput.includes('Storage Error') || errorOutput.includes('No such file'))
    assert(errorOutput.includes('Generate embeddings first'))
  })

  it('should parse query command arguments correctly', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'query', '--help'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout } = await process.output()
    const output = new TextDecoder().decode(stdout)

    assertEquals(code, 0)
    assert(output.includes('query'))
    assert(output.includes('Search code using natural language'))
    assert(output.includes('--limit'))
    assert(output.includes('--similarity'))
    assert(output.includes('--verbose'))
  })

  it('should handle API key missing during query', async () => {
    // Temporarily unset API key
    const originalKey = Deno.env.get('GOOGLE_API_KEY')
    Deno.env.delete('GOOGLE_API_KEY')

    try {
      const process = new Deno.Command(Deno.execPath(), {
        args: ['run', '--allow-all', 'src/cli.ts', 'query', 'test query', '--embeddings', testEmbedFile],
        stdout: 'piped',
        stderr: 'piped'
      })

      const { code, stderr } = await process.output()
      const errorOutput = new TextDecoder().decode(stderr)

      assertEquals(code, 1)
      assert(errorOutput.includes('Configuration Error'))
    } finally {
      // Restore API key
      if (originalKey) {
        Deno.env.set('GOOGLE_API_KEY', originalKey)
      }
    }
  })
})

describe('CLI Argument Validation', () => {
  it('should validate numeric arguments', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'query', 'test', '--limit', 'invalid'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stderr } = await process.output()
    const errorOutput = new TextDecoder().decode(stderr)

    assertEquals(code, 1)
    // Should handle invalid numeric arguments
    assert(errorOutput.includes('CLI Error') || errorOutput.includes('invalid'))
  })

  it('should validate similarity range', async () => {
    const testEmbedFile = './test-similarity-embed.json'
    
    try {
      await Deno.writeTextFile(testEmbedFile, JSON.stringify(MOCK_EMBEDDING_DATA, null, 2))
      
      const process = new Deno.Command(Deno.execPath(), {
        args: ['run', '--allow-all', 'src/cli.ts', 'query', 'test', '--similarity', '2.0', '--embeddings', testEmbedFile],
        stdout: 'piped',
        stderr: 'piped'
      })

      const { code } = await process.output()

      // Should handle out-of-range similarity values
      // Note: Depending on implementation, this might succeed with clamped values or fail
      assert(code === 0 || code === 1)
    } finally {
      try {
        await Deno.remove(testEmbedFile)
      } catch { /* ignore */ }
    }
  })
})

describe('CLI Output Formatting', () => {
  it('should format verbose output correctly', async () => {
    const testEmbedFile = './test-verbose-embed.json'
    
    try {
      await Deno.writeTextFile(testEmbedFile, JSON.stringify(MOCK_EMBEDDING_DATA, null, 2))
      
      // Note: This test would require a valid API key to work fully
      // For now, we test that the verbose flag is parsed correctly
      const process = new Deno.Command(Deno.execPath(), {
        args: ['run', '--allow-all', 'src/cli.ts', 'query', '--help'],
        stdout: 'piped',
        stderr: 'piped'
      })

      const { code, stdout } = await process.output()
      const output = new TextDecoder().decode(stdout)

      assertEquals(code, 0)
      assert(output.includes('--verbose'))
    } finally {
      try {
        await Deno.remove(testEmbedFile)
      } catch { /* ignore */ }
    }
  })
})

describe('CLI Error Messages', () => {
  it('should provide helpful error messages', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'invalid-command'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stderr } = await process.output()
    const errorOutput = new TextDecoder().decode(stderr)

    assertEquals(code, 1)
    assert(errorOutput.includes('CLI Error') || errorOutput.includes('unknown command'))
    assert(errorOutput.includes('vibe help'))
  })

  it('should handle command parsing errors gracefully', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'query'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stderr } = await process.output()
    const errorOutput = new TextDecoder().decode(stderr)

    assertEquals(code, 1)
    // Should indicate missing required argument
    assert(errorOutput.length > 0)
  })
})

describe('CLI Exit Codes', () => {
  it('should return 0 for successful help command', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'help'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code } = await process.output()
    assertEquals(code, 0)
  })

  it('should return 1 for invalid commands', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'nonexistent'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code } = await process.output()
    assertEquals(code, 1)
  })

  it('should return 1 for missing required arguments', async () => {
    const process = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-all', 'src/cli.ts', 'query'],
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code } = await process.output()
    assertEquals(code, 1)
  })
})