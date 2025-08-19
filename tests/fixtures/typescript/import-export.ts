/**
 * Import/Export test fixture
 * Used for testing import/export relationship discovery
 */

// Default import
import Parser from 'web-tree-sitter'

// Named imports
import { Effect, pipe } from 'effect'
import { assertEquals, assertExists } from '@std/assert'

// Namespace import
import * as fs from 'node:fs'

// Type-only imports
import type { User, Repository } from './classes-interfaces.ts'
import type { CodeElement } from '../../src/infra/storage/types.ts'

// Relative imports
import { simpleFunction, asyncFunction } from './simple-functions.ts'
import { createTestDatabase, cleanupTestDatabase } from '../utils/test-helpers.ts'

// Dynamic import function
async function loadModule(moduleName: string) {
  const module = await import(`./modules/${moduleName}.ts`)
  return module
}

// Re-exports
export { simpleFunction as renamedFunction } from './simple-functions.ts'
export { UserService, type User } from './classes-interfaces.ts'
export * from './simple-functions.ts'
export * as Utils from '../utils/test-helpers.ts'

// Default export
export default class ImportExportExample {
  private parser: Parser | null = null
  
  async initialize(): Promise<void> {
    this.parser = new Parser()
  }
  
  process(data: User[]): CodeElement[] {
    return data.map(user => ({
      path: `user:${user.id}`,
      name: user.name,
      type: 'variable',
      filePath: 'users.ts'
    }))
  }
  
  async loadUserData(): Promise<User[]> {
    const result = await createTestDatabase('import-test')
    try {
      // Process data using imported functions
      const processed = simpleFunction('test')
      await asyncFunction(processed)
      
      return [
        {
          id: '1',
          name: processed,
          email: 'test@example.com'
        }
      ]
    } finally {
      await cleanupTestDatabase(result)
    }
  }
}

// Conditional export
if (typeof window !== 'undefined') {
  // Browser-specific export
  // @ts-ignore
  window.ImportExportExample = ImportExportExample
}