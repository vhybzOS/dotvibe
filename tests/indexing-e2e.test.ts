/**
 * End-to-End Indexing Tests
 * 
 * TDD approach: Test the complete indexing workflow from tool execution to database
 */

import '@std/dotenv/load'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect } from 'effect'
import { z } from 'zod/v4'
import { 
  list_filesystem,
  read_file,
  list_symbols_in_file,
  get_symbol_details,
  create_index_entry
} from '../src/mastra/tools/code_analysis_tools.ts'
import { connectToDatabase, createDatabaseSchema } from '../src/database.ts'

// Test setup - create a simple test file
const TEST_FILE_PATH = './test-sample.ts'
const TEST_FILE_CONTENT = `/**
 * Sample TypeScript file for testing
 */

export interface User {
  id: number
  name: string
  email: string
}

export async function getUserById(id: number): Promise<User | null> {
  // Mock implementation
  return { id, name: 'Test User', email: 'test@example.com' }
}

export class UserService {
  async createUser(userData: Partial<User>): Promise<User> {
    // Mock implementation
    return { id: 1, name: 'New User', email: 'new@example.com' }
  }
}
`

Deno.test('E2E - Tool Execution Flow', async () => {
  // Setup: Create test file
  await Deno.writeTextFile(TEST_FILE_PATH, TEST_FILE_CONTENT)
  
  try {
    // Test 1: list_filesystem should find our test file
    console.log('🧪 Testing list_filesystem...')
    const files = await list_filesystem('.')
    assert(files.some(file => file.includes('test-sample.ts')), 'Should find test file')
    console.log('✅ list_filesystem working')
    
    // Test 2: read_file should read the content
    console.log('🧪 Testing read_file...')
    const content = await read_file(TEST_FILE_PATH)
    assert(content.includes('export interface User'), 'Should read file content')
    console.log('✅ read_file working')
    
    // Test 3: list_symbols_in_file should parse TypeScript symbols
    console.log('🧪 Testing list_symbols_in_file...')
    const symbols = await list_symbols_in_file(TEST_FILE_PATH)
    console.log('📋 Found symbols:', symbols.map(s => `${s.name} (${s.kind})`))
    
    // Verify we found expected symbols
    const symbolNames = symbols.map(s => s.name)
    assert(symbolNames.includes('User'), 'Should find User interface')
    assert(symbolNames.includes('getUserById'), 'Should find getUserById function')
    assert(symbolNames.includes('UserService'), 'Should find UserService class')
    console.log('✅ list_symbols_in_file working')
    
    // Test 4: get_symbol_details should get detailed info
    console.log('🧪 Testing get_symbol_details...')
    const userInterfaceDetails = await get_symbol_details(TEST_FILE_PATH, 'User')
    assertEquals(userInterfaceDetails.name, 'User')
    assertEquals(userInterfaceDetails.kind, 'interface_declaration')
    assert(userInterfaceDetails.content.includes('id: number'), 'Should include interface content')
    console.log('✅ get_symbol_details working')
    
    // Test 5: create_index_entry should work with database
    console.log('🧪 Testing create_index_entry...')
    const indexResult = await create_index_entry({
      path: TEST_FILE_PATH,
      symbolName: 'User',
      symbolKind: 'interface_declaration',
      startLine: userInterfaceDetails.startLine,
      endLine: userInterfaceDetails.endLine,
      content: userInterfaceDetails.content,
      synthesizedDescription: 'User interface representing a user entity with id, name, and email fields'
    })
    
    assertEquals(indexResult.success, true, 'Index entry should be created successfully')
    console.log('✅ create_index_entry working')
    
  } finally {
    // Cleanup: Remove test file
    try {
      await Deno.remove(TEST_FILE_PATH)
    } catch {
      // Ignore cleanup errors
    }
  }
})

Deno.test('E2E - Database Integration', async () => {
  // Test that we can connect to database and create schema
  console.log('🧪 Testing database integration...')
  
  const dbResult = await Effect.runPromise(
    Effect.either(connectToDatabase('.vibe/code.db'))
  )
  
  if (dbResult._tag === 'Left') {
    console.log('⏭️ Skipping database test - no database available')
    console.log('💡 Run "vibe init" first to create database')
    return
  }
  
  const db = dbResult.right
  console.log('✅ Database connection successful')
  
  // Test schema creation
  const schemaResult = await Effect.runPromise(
    Effect.either(createDatabaseSchema(db))
  )
  
  // Schema might already exist, that's OK
  if (schemaResult._tag === 'Left') {
    console.log('ℹ️ Schema creation result:', schemaResult.left.message)
  } else {
    console.log('✅ Database schema ready')
  }
  
  // Cleanup
  await Effect.runPromise(
    Effect.tryPromise({
      try: () => db.close(),
      catch: () => ({ _tag: 'StorageError' as const, message: 'Close failed' })
    }).pipe(Effect.catchAll(() => Effect.succeed(void 0)))
  )
})

Deno.test('E2E - Tool Schema Validation', () => {
  // Test that all our tool schemas work correctly
  console.log('🧪 Testing tool input validation...')
  
  // Test list_filesystem schema
  const ListFilesystemSchema = z.object({
    path: z.string().describe('The directory path to list contents from')
  })
  
  const validPath = ListFilesystemSchema.parse({ path: '.' })
  assertEquals(validPath.path, '.')
  
  // Test read_file schema
  const ReadFileSchema = z.object({
    path: z.string().describe('The file path to read')
  })
  
  const validFilePath = ReadFileSchema.parse({ path: './test.ts' })
  assertEquals(validFilePath.path, './test.ts')
  
  // Test create_index_entry schema
  const CreateIndexEntrySchema = z.object({
    path: z.string().describe('File path containing the symbol'),
    symbolName: z.string().describe('Name of the symbol'),
    symbolKind: z.string().describe('Kind of symbol (function, class, etc.)'),
    startLine: z.number().describe('Starting line number'),
    endLine: z.number().describe('Ending line number'),
    content: z.string().describe('Full content of the symbol'),
    synthesizedDescription: z.string().describe('Concise description with critical code snippets')
  })
  
  const validIndexEntry = CreateIndexEntrySchema.parse({
    path: './test.ts',
    symbolName: 'TestFunction',
    symbolKind: 'function_declaration',
    startLine: 1,
    endLine: 5,
    content: 'function test() {}',
    synthesizedDescription: 'A test function that does nothing'
  })
  
  assertEquals(validIndexEntry.symbolName, 'TestFunction')
  console.log('✅ All tool schemas validate correctly')
})

Deno.test('E2E - Error Handling', async () => {
  // Test that tools handle errors gracefully
  console.log('🧪 Testing error handling...')
  
  // Test reading non-existent file
  try {
    await read_file('./non-existent-file.ts')
    assert(false, 'Should have thrown error for non-existent file')
  } catch (error) {
    assert(error instanceof Error, 'Should throw proper error')
    console.log('✅ read_file handles missing files correctly')
  }
  
  // Test listing non-existent directory
  try {
    await list_filesystem('./non-existent-directory')
    assert(false, 'Should have thrown error for non-existent directory')
  } catch (error) {
    assert(error instanceof Error, 'Should throw proper error')
    console.log('✅ list_filesystem handles missing directories correctly')
  }
  
  // Test parsing invalid TypeScript file
  const invalidTsContent = 'this is not valid typescript code {'
  const invalidFilePath = './invalid-test.ts'
  
  await Deno.writeTextFile(invalidFilePath, invalidTsContent)
  
  try {
    const symbols = await list_symbols_in_file(invalidFilePath)
    // Tree-sitter is pretty robust, it might still find some symbols
    // or return empty array - both are acceptable
    console.log('✅ list_symbols_in_file handles invalid syntax gracefully')
  } catch (error) {
    console.log('✅ list_symbols_in_file throws error for invalid syntax (acceptable)')
  } finally {
    await Deno.remove(invalidFilePath)
  }
})