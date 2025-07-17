/**
 * Core Configuration System Test Suite (KISS Version)
 * Tests .env file loading and programmatic updates
 * 
 * @tested_by tests/core/config.test.ts (Simplified .env loading, programmatic updates)
 */

import { assertEquals, assertExists } from '@std/assert'
import { describe, it, afterEach } from '@std/testing/bdd'

import { 
  loadConfig,
  updateConfig,
  getDefaultConfig
} from '../../src/infra/config.ts'

describe('Core Configuration System (KISS)', () => {
  afterEach(async () => {
    // Clean up test files
    try {
      await Deno.remove('/tmp/test.env')
    } catch {
      // Ignore if file doesn't exist
    }
  })

  describe('loadConfig() function', () => {
    it('should load configuration from .env file', async () => {
      const envContent = 'GOOGLE_API_KEY=test-key\nSURREAL_HOST=localhost\nLLM_TEMPERATURE=0.5'
      await Deno.writeTextFile('/tmp/test.env', envContent)
      
      const config = await loadConfig({ envFile: '/tmp/test.env' })
      
      assertEquals(config.llm.apiKey, 'test-key')
      assertEquals(config.storage.host, 'localhost')
      assertEquals(config.llm.temperature, 0.5)
      assertEquals(config.llm.model, 'gemini-2.5-flash') // Default value
    })

    it('should handle missing .env file gracefully', async () => {
      const config = await loadConfig({ 
        envFile: '/nonexistent/.env',
        requireApiKey: false 
      })
      
      // Should use defaults
      assertEquals(config.llm.model, 'gemini-2.5-flash')
      assertEquals(config.storage.host, '127.0.0.1')
    })

    it('should support programmatic overrides', async () => {
      await Deno.writeTextFile('/tmp/test.env', 'GOOGLE_API_KEY=test-key')
      
      const config = await loadConfig({ 
        envFile: '/tmp/test.env',
        overrides: { llm: { model: 'gemini-2.5-ultra' } }
      })
      
      assertEquals(config.llm.apiKey, 'test-key')
      assertEquals(config.llm.model, 'gemini-2.5-ultra') // Override
    })
  })

  describe('updateConfig() function', () => {
    it('should update configuration and save to .env', async () => {
      await Deno.writeTextFile('/tmp/test.env', 'GOOGLE_API_KEY=test-key\nSURREAL_HOST=localhost')
      
      const updated = await updateConfig({ 
        llm: { model: 'gemini-2.5-ultra' } 
      }, '/tmp/test.env')
      
      assertEquals(updated.llm.apiKey, 'test-key') // Preserved
      assertEquals(updated.llm.model, 'gemini-2.5-ultra') // Updated
      assertEquals(updated.storage.host, 'localhost') // Preserved
      
      // Verify .env file was updated
      const envContent = await Deno.readTextFile('/tmp/test.env')
      assertEquals(envContent.includes('GEMINI_CHAT_MODEL=gemini-2.5-ultra'), true)
      assertEquals(envContent.includes('GOOGLE_API_KEY=test-key'), true)
    })
  })

  describe('getDefaultConfig() function', () => {
    it('should return valid default configuration', () => {
      const config = getDefaultConfig()
      
      assertExists(config.llm)
      assertExists(config.storage)
      assertExists(config.treeSitter)
      assertExists(config.processing)
      assertExists(config.embedding)
      assertExists(config.logging)
      assertExists(config.workspace)
      
      assertEquals(config.llm.model, 'gemini-2.5-flash')
      assertEquals(config.storage.host, '127.0.0.1')
      assertEquals(config.processing.parallelLimit, 10)
    })
  })
})