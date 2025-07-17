/**
 * Enhanced AST Analyzer Test Suite (TDD)
 * Tests enhanced AST processing with relationship discovery and data flow analysis
 * 
 * @tests src/infra/ast-analyzer.ts (Enhanced parsing, relationships, data flow)
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { Effect } from 'effect'

import { 
  withTreeSitterParser,
  parseFileWithRelationships,
  discoverRelationships,
  analyzeDataFlow,
  detectBlocks,
  extractImportExportRelationships,
  type FileParseResult,
  type ParsedElement,
  type Relationship,
  type DataFlowRelationship,
  type BlockStructure,
  type RelationshipType,
  type DataFlowType
} from '../../src/infra/ast-analyzer.ts'

describe('Enhanced AST Analyzer (TDD)', () => {
  const testTypeScriptCode = `
import { User, UserResult } from './types'
import { validateEmail } from './validation'

export interface ProcessingConfig {
  enableValidation: boolean
  maxRetries: number
}

export class UserProcessor {
  private config: ProcessingConfig

  constructor(config: ProcessingConfig) {
    this.config = config
  }

  async processUser(user: User): Promise<UserResult> {
    if (this.config.enableValidation) {
      const isValid = await validateEmail(user.email)
      if (!isValid) {
        throw new Error('Invalid email')
      }
    }
    
    return {
      id: user.id,
      processed: true,
      timestamp: new Date().toISOString()
    }
  }

  private logProcessing(userId: string): void {
    console.log(\`Processing user: \${userId}\`)
  }
}

export function createUserProcessor(config: ProcessingConfig): UserProcessor {
  return new UserProcessor(config)
}

const defaultConfig: ProcessingConfig = {
  enableValidation: true,
  maxRetries: 3
}
`

  describe('Higher-Order Function for Parser Operations', () => {
    it('should provide withTreeSitterParser HOF for parser operations', async () => {
      const result = await Effect.runPromise(
        withTreeSitterParser('typescript', async (parser) => {
          const tree = parser.parse(testTypeScriptCode)
          return tree !== null
        })
      )
      
      assertEquals(result, true)
    })

    it('should cache parser instances for performance', async () => {
      const startTime = Date.now()
      
      // First parse
      await Effect.runPromise(
        withTreeSitterParser('typescript', async (parser) => {
          parser.parse(testTypeScriptCode)
        })
      )
      
      // Second parse (should use cached parser)
      await Effect.runPromise(
        withTreeSitterParser('typescript', async (parser) => {
          parser.parse(testTypeScriptCode)
        })
      )
      
      const endTime = Date.now()
      
      // Second parse should be faster due to caching
      assertEquals(endTime - startTime < 1000, true)
    })
  })

  describe('Enhanced File Parsing with Relationships', () => {
    it('should parse file and extract elements with relationships', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      assertExists(parseResult)
      assertEquals(parseResult.filePath, '<string>')
      assertEquals(parseResult.elements.length > 0, true)
      assertEquals(parseResult.relationships.length > 0, true)
      assertEquals(parseResult.imports.length > 0, true)
      assertEquals(parseResult.exports.length > 0, true)
      
      // Verify specific elements
      const elements = parseResult.elements
      const interfaceElement = elements.find(e => e.element_name === 'ProcessingConfig')
      const classElement = elements.find(e => e.element_name === 'UserProcessor')
      const methodElement = elements.find(e => e.element_name === 'processUser')
      
      assertExists(interfaceElement)
      assertEquals(interfaceElement.element_type, 'interface')
      assertEquals(interfaceElement.exported, true)
      
      assertExists(classElement)
      assertEquals(classElement.element_type, 'class')
      assertEquals(classElement.exported, true)
      
      assertExists(methodElement)
      assertEquals(methodElement.element_type, 'method')
      assertEquals(methodElement.async, true)
    })

    it('should extract imports and exports correctly', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      // Check imports
      const imports = parseResult.imports
      assertEquals(imports.length >= 2, true)
      
      const typesImport = imports.find(i => i.source === './types')
      assertExists(typesImport)
      assertEquals(typesImport.specifiers.includes('User'), true)
      assertEquals(typesImport.specifiers.includes('UserResult'), true)
      assertEquals(typesImport.type, 'named')
      
      const validationImport = imports.find(i => i.source === './validation')
      assertExists(validationImport)
      assertEquals(validationImport.specifiers.includes('validateEmail'), true)
      
      // Check exports
      const exports = parseResult.exports
      assertEquals(exports.length >= 3, true)
      
      const exportNames = exports.map(e => e.name)
      assertEquals(exportNames.includes('ProcessingConfig'), true)
      assertEquals(exportNames.includes('UserProcessor'), true)
      assertEquals(exportNames.includes('createUserProcessor'), true)
    })
  })

  describe('Relationship Discovery', () => {
    it('should discover function call relationships', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      )
      
      const callRelationships = relationships.filter(r => r.relationship_type === 'calls')
      assertEquals(callRelationships.length > 0, true)
      
      // Should find processUser -> validateEmail call
      const validateEmailCall = callRelationships.find(r => 
        r.to === 'validateEmail' && r.from === 'processUser'
      )
      assertExists(validateEmailCall)
      assertEquals(validateEmailCall.relationship_type, 'calls')
      assertEquals(validateEmailCall.context.conditional, true)
      assertEquals(validateEmailCall.context.parameters_passed.includes('user.email'), true)
    })

    it('should discover import relationships', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      )
      
      const importRelationships = relationships.filter(r => r.relationship_type === 'imports')
      assertEquals(importRelationships.length >= 2, true)
      
      // Should find imports from './types' and './validation'
      const typesImport = importRelationships.find(r => r.to === './types')
      assertExists(typesImport)
      assertEquals(typesImport.context.specifiers.includes('User'), true)
      assertEquals(typesImport.context.specifiers.includes('UserResult'), true)
    })

    it('should discover class inheritance relationships', async () => {
      const classCode = `
import { BaseProcessor } from './base'

export class UserProcessor extends BaseProcessor {
  process() {
    return super.process()
  }
}

export class AdminProcessor extends UserProcessor {
  adminProcess() {
    return this.process()
  }
}
`
      
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(classCode, 'typescript')
      )
      
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      )
      
      const extendsRelationships = relationships.filter(r => r.relationship_type === 'extends')
      assertEquals(extendsRelationships.length >= 2, true)
      
      // Should find UserProcessor extends BaseProcessor
      const userExtendsBase = extendsRelationships.find(r => 
        r.from === 'UserProcessor' && r.to === 'BaseProcessor'
      )
      assertExists(userExtendsBase)
      
      // Should find AdminProcessor extends UserProcessor
      const adminExtendsUser = extendsRelationships.find(r => 
        r.from === 'AdminProcessor' && r.to === 'UserProcessor'
      )
      assertExists(adminExtendsUser)
    })

    it('should discover interface implementation relationships', async () => {
      const interfaceCode = `
interface Processor {
  process(): Promise<void>
}

interface Logger {
  log(message: string): void
}

export class UserProcessor implements Processor, Logger {
  async process(): Promise<void> {
    this.log('Processing...')
  }
  
  log(message: string): void {
    console.log(message)
  }
}
`
      
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(interfaceCode, 'typescript')
      )
      
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      )
      
      const implementsRelationships = relationships.filter(r => r.relationship_type === 'implements')
      assertEquals(implementsRelationships.length >= 2, true)
      
      // Should find UserProcessor implements Processor
      const implementsProcessor = implementsRelationships.find(r => 
        r.from === 'UserProcessor' && r.to === 'Processor'
      )
      assertExists(implementsProcessor)
      
      // Should find UserProcessor implements Logger
      const implementsLogger = implementsRelationships.find(r => 
        r.from === 'UserProcessor' && r.to === 'Logger'
      )
      assertExists(implementsLogger)
    })
  })

  describe('Data Flow Analysis', () => {
    it('should analyze parameter input data flow', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(parseResult)
      )
      
      const parameterFlows = dataFlows.filter(df => df.flow_type === 'parameter_input')
      assertEquals(parameterFlows.length > 0, true)
      
      // Should find user parameter flowing into processUser
      const userParamFlow = parameterFlows.find(df => 
        df.to === 'processUser' && df.type_annotation === 'User'
      )
      assertExists(userParamFlow)
      assertEquals(userParamFlow.flow_metadata.parameter_name, 'user')
      assertEquals(userParamFlow.flow_metadata.parameter_position, 0)
    })

    it('should analyze return output data flow', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(parseResult)
      )
      
      const returnFlows = dataFlows.filter(df => df.flow_type === 'return_output')
      assertEquals(returnFlows.length > 0, true)
      
      // Should find UserResult flowing out of processUser
      const userResultFlow = returnFlows.find(df => 
        df.from === 'processUser' && df.type_annotation === 'Promise<UserResult>'
      )
      assertExists(userResultFlow)
    })

    it('should analyze property access data flow', async () => {
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(testTypeScriptCode, 'typescript')
      )
      
      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(parseResult)
      )
      
      const propertyFlows = dataFlows.filter(df => df.flow_type === 'property_access')
      assertEquals(propertyFlows.length > 0, true)
      
      // Should find user.email property access
      const emailAccessFlow = propertyFlows.find(df => 
        df.flow_metadata.property_path === 'email'
      )
      assertExists(emailAccessFlow)
      
      // Should find this.config property access
      const configAccessFlow = propertyFlows.find(df => 
        df.flow_metadata.property_path === 'config'
      )
      assertExists(configAccessFlow)
    })

    it('should analyze variable assignment data flow', async () => {
      const assignmentCode = `
function processData() {
  const user = getUserData()
  const result = processUser(user)
  const final = transformResult(result)
  return final
}
`
      
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(assignmentCode, 'typescript')
      )
      
      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(parseResult)
      )
      
      const assignmentFlows = dataFlows.filter(df => df.flow_type === 'assignment')
      assertEquals(assignmentFlows.length >= 3, true)
      
      // Should find getUserData() -> user assignment
      const userAssignment = assignmentFlows.find(df => 
        df.flow_metadata.variable_name === 'user'
      )
      assertExists(userAssignment)
      
      // Should find processUser(user) -> result assignment
      const resultAssignment = assignmentFlows.find(df => 
        df.flow_metadata.variable_name === 'result'
      )
      assertExists(resultAssignment)
    })

    it('should analyze data transformation chains', async () => {
      const transformationCode = `
function processUserData(rawUser: RawUser): ProcessedUser {
  const validated = validateUser(rawUser)
  const normalized = normalizeUser(validated)
  const enriched = enrichUser(normalized)
  return enriched
}
`
      
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(transformationCode, 'typescript')
      )
      
      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(parseResult)
      )
      
      const transformationFlows = dataFlows.filter(df => df.flow_type === 'transformation')
      assertEquals(transformationFlows.length >= 3, true)
      
      // Should track the transformation chain
      const transformationChain = transformationFlows.sort((a, b) => 
        a.flow_metadata.step_order - b.flow_metadata.step_order
      )
      
      assertEquals(transformationChain[0].flow_metadata.data_shape_before, 'RawUser')
      assertEquals(transformationChain[0].flow_metadata.data_shape_after, 'ValidatedUser')
      assertEquals(transformationChain[1].flow_metadata.data_shape_before, 'ValidatedUser')
      assertEquals(transformationChain[1].flow_metadata.data_shape_after, 'NormalizedUser')
    })
  })

  describe('Block Detection', () => {
    it('should detect human-readable code blocks separated by whitespace', async () => {
      const blockCode = `
// Configuration block
const config = {
  api: 'https://api.example.com',
  timeout: 5000
}

// Helper functions block
function validateInput(input: string): boolean {
  return input.length > 0
}

function formatOutput(data: any): string {
  return JSON.stringify(data, null, 2)
}


// Main processing block
export class DataProcessor {
  constructor(private config: Config) {}
  
  async process(input: string): Promise<string> {
    if (!validateInput(input)) {
      throw new Error('Invalid input')
    }
    
    const result = await this.processData(input)
    return formatOutput(result)
  }
}
`
      
      const blocks = await Effect.runPromise(detectBlocks(blockCode))
      
      assertEquals(blocks.length >= 3, true)
      
      // Should find configuration block
      const configBlock = blocks.find(b => 
        b.type === 'code' && b.content.includes('const config')
      )
      assertExists(configBlock)
      
      // Should find helper functions block
      const helperBlock = blocks.find(b => 
        b.type === 'code' && b.content.includes('validateInput')
      )
      assertExists(helperBlock)
      
      // Should find main processing block
      const mainBlock = blocks.find(b => 
        b.type === 'code' && b.content.includes('export class DataProcessor')
      )
      assertExists(mainBlock)
      
      // Should detect whitespace separators
      const whitespaceBlocks = blocks.filter(b => b.type === 'whitespace')
      assertEquals(whitespaceBlocks.length >= 2, true)
    })

    it('should detect comment blocks', async () => {
      const commentCode = `
/**
 * Main application entry point
 * Handles user authentication and data processing
 */
export function main() {
  return 'Hello World'
}

/*
 * Configuration constants
 */
const API_URL = 'https://api.example.com'
const TIMEOUT = 5000

// Single line comment
const DEBUG = true
`
      
      const blocks = await Effect.runPromise(detectBlocks(commentCode))
      
      const commentBlocks = blocks.filter(b => b.type === 'comment')
      assertEquals(commentBlocks.length >= 3, true)
      
      // Should find JSDoc block
      const jsdocBlock = commentBlocks.find(b => 
        b.content.includes('Main application entry point')
      )
      assertExists(jsdocBlock)
      
      // Should find multiline comment block
      const multilineBlock = commentBlocks.find(b => 
        b.content.includes('Configuration constants')
      )
      assertExists(multilineBlock)
      
      // Should find single line comment
      const singleLineBlock = commentBlocks.find(b => 
        b.content.includes('Single line comment')
      )
      assertExists(singleLineBlock)
    })
  })

  describe('Import/Export Relationship Analysis', () => {
    it('should extract detailed import/export relationships', async () => {
      const importExportCode = `
import React, { useState, useEffect } from 'react'
import { User } from './types'
import * as utils from './utils'
import './styles.css'

export default function UserComponent() {
  return <div>User</div>
}

export { User } from './types'
export * from './helpers'
export const API_URL = 'https://api.example.com'
`
      
      const relationships = await Effect.runPromise(
        extractImportExportRelationships(importExportCode, 'typescript')
      )
      
      const importRels = relationships.filter(r => r.relationship_type === 'imports')
      const exportRels = relationships.filter(r => r.relationship_type === 'exports')
      
      assertEquals(importRels.length >= 4, true)
      assertEquals(exportRels.length >= 3, true)
      
      // Default import
      const reactImport = importRels.find(r => 
        r.to === 'react' && r.context.import_type === 'default'
      )
      assertExists(reactImport)
      
      // Named imports
      const namedImport = importRels.find(r => 
        r.to === 'react' && r.context.import_type === 'named'
      )
      assertExists(namedImport)
      assertEquals(namedImport.context.specifiers.includes('useState'), true)
      assertEquals(namedImport.context.specifiers.includes('useEffect'), true)
      
      // Namespace import
      const namespaceImport = importRels.find(r => 
        r.to === './utils' && r.context.import_type === 'namespace'
      )
      assertExists(namespaceImport)
      assertEquals(namespaceImport.context.alias, 'utils')
      
      // Re-export
      const reExport = exportRels.find(r => 
        r.context.export_type === 'named' && r.context.source === './types'
      )
      assertExists(reExport)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid TypeScript code gracefully', async () => {
      const invalidCode = `
      function invalidFunction( {
        return "missing closing parenthesis"
      }
      
      const invalidObject = {
        property: "missing closing brace"
      `
      
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(invalidCode, 'typescript')
      )
      
      // Should still return a result, but with errors
      assertExists(parseResult)
      assertEquals(parseResult.errors.length > 0, true)
      // Should still extract some valid elements
      assertEquals(parseResult.elements.length >= 0, true)
    })

    it('should handle unsupported language gracefully', async () => {
      await assertRejects(
        () => Effect.runPromise(
          parseFileWithRelationships('some code', 'unsupported_language')
        ),
        Error,
        'Unsupported language'
      )
    })
  })

  describe('Performance Optimization', () => {
    it('should parse large files efficiently', async () => {
      // Generate a large TypeScript file
      const largeCode = Array.from({ length: 1000 }, (_, i) => `
        export function function${i}(param${i}: string): string {
          return processData${i}(param${i})
        }
        
        function processData${i}(data: string): string {
          return data.toUpperCase()
        }
      `).join('\n')
      
      const startTime = Date.now()
      const parseResult = await Effect.runPromise(
        parseFileWithRelationships(largeCode, 'typescript')
      )
      const endTime = Date.now()
      
      // Should complete within reasonable time (< 5 seconds)
      assertEquals(endTime - startTime < 5000, true)
      
      // Should find all functions
      assertEquals(parseResult.elements.length >= 2000, true)
      
      // Should find relationships
      assertEquals(parseResult.relationships.length >= 1000, true)
    })
  })
})