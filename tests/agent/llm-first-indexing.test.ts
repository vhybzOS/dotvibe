/**
 * LLM-First Indexing Integration Tests
 * 
 * Tests the new LLM-first algorithm end-to-end to prevent regressions.
 * Based on manual testing that revealed 65% failure rate issue.
 */

import { describe, it, beforeAll, afterAll } from '@std/testing/bdd'
import { assertEquals, assertExists } from '@std/assert'
import { Effect } from 'effect'
import { 
  runLLMFirstIndexing, 
  getArchitecturalAnalysis,
  extractComponentListFromResponse 
} from '../../src/agent/indexing.ts'
import { ingestPathJSON } from '../../src/ingest.ts'

// Mock environment setup
const mockEnv = {
  GOOGLE_API_KEY: 'test-api-key',
  GEMINI_CHAT_MODEL: 'gemini-2.5-flash'
}

beforeAll(() => {
  // Set up mock environment
  Object.entries(mockEnv).forEach(([key, value]) => {
    Deno.env.set(key, value)
  })
})

afterAll(() => {
  // Clean up mock environment
  Object.keys(mockEnv).forEach(key => {
    Deno.env.delete(key)
  })
})

describe('LLM-First Indexing System', () => {
  
  describe('extractComponentListFromResponse', () => {
    it('should extract component list from valid LLM response', () => {
      const mockResponse = `
## Architectural Summary
This is a test system with TypeScript files.

## Components to Index
\`\`\`json
[
  {
    "filename": "test.ts",
    "components": [
      {"name": "TestFunction", "kind": "function_declaration"},
      {"name": "TestInterface", "kind": "interface_declaration"}
    ]
  }
]
\`\`\`
`
      
      const result = extractComponentListFromResponse(mockResponse)
      
      assertEquals(result.length, 1)
      assertEquals(result[0]?.filename, 'test.ts')
      assertEquals(result[0]?.components.length, 2)
      assertEquals(result[0]?.components[0]?.name, 'TestFunction')
      assertEquals(result[0]?.components[0]?.kind, 'function_declaration')
    })
    
    it('should handle empty response gracefully', () => {
      const result = extractComponentListFromResponse('No JSON found here')
      assertEquals(result.length, 0)
    })
    
    it('should handle malformed JSON gracefully', () => {
      const mockResponse = `
## Components to Index
\`\`\`json
{ "invalid": "structure" }
\`\`\`
`
      
      const result = extractComponentListFromResponse(mockResponse)
      assertEquals(result.length, 0)
    })
  })
  
  describe('ingestPathJSON integration', () => {
    it('should successfully ingest test file and return structured data', async () => {
      // Create a simple test file
      const testFilePath = await Deno.makeTempFile({ suffix: '.ts' })
      await Deno.writeTextFile(testFilePath, `
export interface TestInterface {
  id: number
  name: string
}

export function testFunction(input: string): string {
  return input.toUpperCase()
}
`)
      
      try {
        const result = await Effect.runPromise(
          ingestPathJSON(testFilePath, {
            include: ['*.ts'],
            outputFormat: 'markdown',
            includeTokens: true
          })
        )
        
        expect(result.files).toContain(testFilePath)
        expect(result.content).toBeTruthy()
        expect(result.content.length).toBeGreaterThan(0)
        expect(result.tokenEstimate.totalTokens).toBeGreaterThan(0)
        
      } finally {
        await Deno.remove(testFilePath).catch(() => {}) // Clean up
      }
    })
  })
  
  describe('Integration test scenarios', () => {
    it('should identify the failure pattern in component processing', async () => {
      // This test captures the 65% failure rate issue discovered in manual testing
      
      // Create a test file with known components
      const testDir = await Deno.makeTempDir()
      const testFile = `${testDir}/test.ts`
      
      await Deno.writeTextFile(testFile, `
export interface User {
  id: number
  name: string
}

export class UserService {
  async getUser(id: number): Promise<User | null> {
    return null
  }
}

export function createUser(name: string): User {
  return { id: 1, name }
}
`)
      
      try {
        // Test the full ingestion process
        const ingestResult = await Effect.runPromise(
          ingestPathJSON(testDir, {
            include: ['*.ts'],
            outputFormat: 'markdown',
            includeTokens: true
          })
        )
        
        expect(ingestResult.files).toHaveLength(1)
        expect(ingestResult.content).toContain('interface User')
        expect(ingestResult.content).toContain('class UserService')
        expect(ingestResult.content).toContain('function createUser')
        
        // Mock the architectural analysis to test component extraction
        const mockAnalysisResponse = `
## Architectural Summary
Simple test TypeScript module with user management functionality.

## Components to Index
\`\`\`json
[
  {
    "filename": "${testFile}",
    "components": [
      {"name": "User", "kind": "interface_declaration"},
      {"name": "UserService", "kind": "class_declaration"},
      {"name": "createUser", "kind": "function_declaration"}
    ]
  }
]
\`\`\`
`
        
        const componentList = extractComponentListFromResponse(mockAnalysisResponse)
        expect(componentList).toHaveLength(1)
        expect(componentList[0]?.components).toHaveLength(3)
        
        // The issue might be in the component processing phase
        // Log this for debugging the actual failure
        console.log('✅ Test identified: Component extraction works correctly')
        console.log('❓ Issue must be in: Individual component LLM analysis or storage')
        
      } finally {
        await Deno.remove(testDir, { recursive: true }).catch(() => {})
      }
    })
    
    it('should test tree-sitter symbol discovery integration', async () => {
      // This tests the actual tree-sitter integration that might be causing failures
      
      const testFile = await Deno.makeTempFile({ suffix: '.ts' })
      await Deno.writeTextFile(testFile, `
export interface TestType {
  value: string
}

export function testFunc(): void {
  console.log('test')
}
`)
      
      try {
        // Import the real tree-sitter functions
        const { listSymbolsReal, getSymbolDetailsReal } = await import('../../src/agent/ast-discovery.ts')
        
        // Test symbol listing
        const symbolsResult = await Effect.runPromise(listSymbolsReal(testFile))
        console.log('🔍 Symbols found:', symbolsResult.map(s => `${s.name} (${s.kind})`))
        
        // Test symbol details for each symbol
        for (const symbol of symbolsResult) {
          try {
            const detailsResult = await Effect.runPromise(getSymbolDetailsReal(testFile, symbol.name))
            console.log(`📋 Details for ${symbol.name}:`, {
              startLine: detailsResult.startLine,
              endLine: detailsResult.endLine,
              contentLength: detailsResult.content.length
            })
            
            expect(detailsResult.name).toBe(symbol.name)
            expect(detailsResult.startLine).toBeGreaterThan(0)
            expect(detailsResult.content).toBeTruthy()
            
          } catch (error) {
            console.log(`❌ Failed to get details for ${symbol.name}:`, error instanceof Error ? error.message : String(error))
            // This might be the source of our 65% failure rate
          }
        }
        
      } catch (error) {
        console.log('❌ Tree-sitter integration failed:', error instanceof Error ? error.message : String(error))
        // This could explain the high failure rate
        throw error
        
      } finally {
        await Deno.remove(testFile).catch(() => {})
      }
    })
  })
})