/**
 * Agent Models Test Suite
 * Tests configuration loading and tokenizer mapping functions
 * 
 * @tested_by tests/agent/models.test.ts (Configuration loading, tokenizer mapping)
 */

import { assertEquals, assertExists, assertThrows } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'

// Note: These imports will be created as part of TDD implementation
import { 
  loadAgentConfig, 
  mapModelToCode2promptTokenizer,
  getDefaultTokenizerMappings,
  validateAgentConfig
} from '../../src/agent/models.ts'
import type { AgentConfig, TokenizerMapping } from '../../src/agent/types.ts'

describe('Agent Models', () => {
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Save original environment variables
    originalEnv = {
      GOOGLE_API_KEY: Deno.env.get('GOOGLE_API_KEY'),
      GEMINI_CHAT_MODEL: Deno.env.get('GEMINI_CHAT_MODEL'),
      GEMINI_EMBEDDING_MODEL: Deno.env.get('GEMINI_EMBEDDING_MODEL')
    }
  })

  afterEach(() => {
    // Restore original environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        Deno.env.delete(key)
      } else {
        Deno.env.set(key, value)
      }
    }
  })

  describe('loadAgentConfig()', () => {
    it('should load configuration from environment variables', () => {
      // Set test environment variables
      Deno.env.set('GOOGLE_API_KEY', 'test-api-key-123')
      Deno.env.set('GEMINI_CHAT_MODEL', 'gemini-2.5-flash')
      
      const config = loadAgentConfig()
      
      assertEquals(config.apiKey, 'test-api-key-123')
      assertEquals(config.model, 'gemini-2.5-flash')
      assertEquals(config.enableFunctionCalling, true)
      assertExists(config.maxTokens)
    })

    it('should use default values when environment variables are missing', () => {
      // Clear environment variables
      Deno.env.delete('GOOGLE_API_KEY')
      Deno.env.delete('GEMINI_CHAT_MODEL')
      
      const config = loadAgentConfig()
      
      assertEquals(config.model, 'gemini-2.5-flash') // Default model
      assertEquals(config.maxTokens, 1000000) // Default max tokens
      assertEquals(config.enableFunctionCalling, true)
    })

    it('should throw error when API key is missing', () => {
      Deno.env.delete('GOOGLE_API_KEY')
      
      assertThrows(
        () => loadAgentConfig({ requireApiKey: true }),
        Error,
        'GOOGLE_API_KEY environment variable is required'
      )
    })

    it('should accept override options', () => {
      Deno.env.set('GOOGLE_API_KEY', 'test-key')
      
      const config = loadAgentConfig({
        model: 'custom-model',
        maxTokens: 500000,
        temperature: 0.9,
        verbose: true
      })
      
      assertEquals(config.model, 'custom-model')
      assertEquals(config.maxTokens, 500000)
      assertEquals(config.temperature, 0.9)
      assertEquals(config.verbose, true)
    })
  })

  describe('mapModelToCode2promptTokenizer()', () => {
    it('should map gemini models to cl100k tokenizer', () => {
      assertEquals(mapModelToCode2promptTokenizer('gemini-2.5-flash'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('gemini-1.5-pro'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('gemini-pro'), 'cl100k')
    })

    it('should map GPT models to appropriate tokenizers', () => {
      assertEquals(mapModelToCode2promptTokenizer('gpt-4'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('gpt-3.5-turbo'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('gpt-4o'), 'cl100k')
    })

    it('should map Claude models to cl100k tokenizer', () => {
      assertEquals(mapModelToCode2promptTokenizer('claude-3-haiku'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('claude-3-sonnet'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('claude-3-opus'), 'cl100k')
    })

    it('should default to cl100k for unknown models', () => {
      assertEquals(mapModelToCode2promptTokenizer('unknown-model'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('custom-model-123'), 'cl100k')
    })

    it('should handle model names with version suffixes', () => {
      assertEquals(mapModelToCode2promptTokenizer('gemini-2.5-flash-001'), 'cl100k')
      assertEquals(mapModelToCode2promptTokenizer('gpt-4-0125-preview'), 'cl100k')
    })
  })

  describe('getDefaultTokenizerMappings()', () => {
    it('should return array of tokenizer mappings', () => {
      const mappings = getDefaultTokenizerMappings()
      
      assertEquals(Array.isArray(mappings), true)
      assertEquals(mappings.length > 0, true)
      
      // Check structure of mappings
      mappings.forEach(mapping => {
        assertExists(mapping.modelPattern)
        assertExists(mapping.tokenizer)
        assertEquals(typeof mapping.modelPattern, 'string')
        assertEquals(typeof mapping.tokenizer, 'string')
      })
    })

    it('should include gemini model mappings', () => {
      const mappings = getDefaultTokenizerMappings()
      
      const geminiMapping = mappings.find(m => m.modelPattern.includes('gemini'))
      assertExists(geminiMapping, 'Should include gemini model mapping')
      assertEquals(geminiMapping.tokenizer, 'cl100k')
    })

    it('should include gpt model mappings', () => {
      const mappings = getDefaultTokenizerMappings()
      
      const gptMapping = mappings.find(m => m.modelPattern.includes('gpt'))
      assertExists(gptMapping, 'Should include GPT model mapping')
      assertEquals(gptMapping.tokenizer, 'cl100k')
    })
  })

  describe('validateAgentConfig()', () => {
    it('should validate valid configuration', () => {
      const validConfig: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-key',
        enableFunctionCalling: true,
        temperature: 0.7,
        verbose: false
      }
      
      const result = validateAgentConfig(validConfig)
      assertEquals(result.success, true)
      assertEquals(result.data, validConfig)
    })

    it('should reject invalid model names', () => {
      const invalidConfig: AgentConfig = {
        model: '', // Empty model name
        maxTokens: 1000000,
        apiKey: 'test-key',
        enableFunctionCalling: true
      }
      
      const result = validateAgentConfig(invalidConfig)
      assertEquals(result.success, false)
      assertExists(result.error)
    })

    it('should reject invalid token limits', () => {
      const invalidConfig: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: -1, // Negative tokens
        apiKey: 'test-key',
        enableFunctionCalling: true
      }
      
      const result = validateAgentConfig(invalidConfig)
      assertEquals(result.success, false)
      assertExists(result.error)
    })

    it('should reject invalid temperature values', () => {
      const invalidConfig: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-key',
        enableFunctionCalling: true,
        temperature: 2.0 // Too high
      }
      
      const result = validateAgentConfig(invalidConfig)
      assertEquals(result.success, false)
      assertExists(result.error)
    })

    it('should accept optional fields as undefined', () => {
      const minimalConfig: AgentConfig = {
        model: 'gemini-2.5-flash',
        maxTokens: 1000000,
        apiKey: 'test-key',
        enableFunctionCalling: true
        // temperature and verbose omitted
      }
      
      const result = validateAgentConfig(minimalConfig)
      assertEquals(result.success, true)
      assertEquals(result.data, minimalConfig)
    })
  })

  describe('Environment Variable Integration', () => {
    it('should handle GEMINI_EMBEDDING_MODEL separately from chat model', () => {
      Deno.env.set('GOOGLE_API_KEY', 'test-key')
      Deno.env.set('GEMINI_CHAT_MODEL', 'gemini-2.5-flash')
      Deno.env.set('GEMINI_EMBEDDING_MODEL', 'text-embedding-004')
      
      const config = loadAgentConfig()
      
      // Chat config should use GEMINI_CHAT_MODEL
      assertEquals(config.model, 'gemini-2.5-flash')
      
      // Should be able to access embedding model separately
      assertEquals(Deno.env.get('GEMINI_EMBEDDING_MODEL'), 'text-embedding-004')
    })

    it('should provide helpful error messages for missing configuration', () => {
      Deno.env.delete('GOOGLE_API_KEY')
      Deno.env.delete('GEMINI_CHAT_MODEL')
      
      assertThrows(
        () => loadAgentConfig({ requireApiKey: true }),
        Error,
        'GOOGLE_API_KEY'
      )
    })
  })
})