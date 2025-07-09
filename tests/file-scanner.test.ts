/**
 * Tests for file scanning logic
 * 
 * @tested_by src/file-scanner.ts
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertExists, assert } from '@std/assert'
import { Effect } from 'effect'
import { 
  scanFiles, 
  isCodeFile, 
  shouldIgnoreFile,
  type ScanOptions,
  type ScannedFile
} from '../src/file-scanner.ts'

const TEST_DIR = './test-scan-workspace'

describe('File Scanner', () => {
  beforeEach(async () => {
    // Clean up any existing test directory
    try {
      await Deno.remove(TEST_DIR, { recursive: true })
    } catch {
      // Directory doesn't exist, which is fine
    }
    
    // Create test directory structure
    await Deno.mkdir(TEST_DIR, { recursive: true })
    Deno.chdir(TEST_DIR)
    
    // Create diverse file structure
    await Deno.mkdir('src/components', { recursive: true })
    await Deno.mkdir('src/utils', { recursive: true })
    await Deno.mkdir('tests', { recursive: true })
    await Deno.mkdir('node_modules/react', { recursive: true })
    await Deno.mkdir('.git/objects', { recursive: true })
    await Deno.mkdir('build', { recursive: true })
    await Deno.mkdir('docs', { recursive: true })
    
    // TypeScript files
    await Deno.writeTextFile('src/app.ts', 'export const app = "hello"')
    await Deno.writeTextFile('src/components/Button.tsx', 'export const Button = () => <div>Button</div>')
    await Deno.writeTextFile('src/utils/helpers.ts', 'export function helper() {}')
    
    // JavaScript files
    await Deno.writeTextFile('src/legacy.js', 'function legacy() {}')
    await Deno.writeTextFile('src/components/Modal.jsx', 'export const Modal = () => <div>Modal</div>')
    
    // Other language files
    await Deno.writeTextFile('src/algorithm.py', 'def algorithm(): pass')
    await Deno.writeTextFile('src/config.rs', 'fn main() {}')
    await Deno.writeTextFile('src/server.go', 'func main() {}')
    
    // Test files
    await Deno.writeTextFile('tests/app.test.ts', 'import { app } from "../src/app"')
    await Deno.writeTextFile('tests/button.spec.js', 'describe("button", () => {})')
    
    // Non-code files
    await Deno.writeTextFile('package.json', '{"name": "test"}')
    await Deno.writeTextFile('README.md', '# Test Project')
    await Deno.writeTextFile('docs/guide.md', '# Guide')
    await Deno.writeTextFile('.gitignore', 'node_modules/')
    await Deno.writeTextFile('Dockerfile', 'FROM node:18')
    
    // Files to ignore
    await Deno.writeTextFile('node_modules/react/index.js', 'module.exports = React')
    await Deno.writeTextFile('.git/config', '[core]')
    await Deno.writeTextFile('build/app.js', 'compiled code')
    
    // Binary-like files
    const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    await Deno.writeFile('src/image.png', binaryContent)
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

  it('should identify code files correctly', () => {
    assert(isCodeFile('app.ts'), 'TypeScript files should be code files')
    assert(isCodeFile('component.tsx'), 'TSX files should be code files')
    assert(isCodeFile('script.js'), 'JavaScript files should be code files')
    assert(isCodeFile('component.jsx'), 'JSX files should be code files')
    assert(isCodeFile('main.py'), 'Python files should be code files')
    assert(isCodeFile('main.rs'), 'Rust files should be code files')
    assert(isCodeFile('main.go'), 'Go files should be code files')
    assert(isCodeFile('Main.java'), 'Java files should be code files')
    assert(isCodeFile('main.cpp'), 'C++ files should be code files')
    assert(isCodeFile('header.h'), 'Header files should be code files')
    
    assert(!isCodeFile('README.md'), 'Markdown files should not be code files by default')
    assert(!isCodeFile('package.json'), 'JSON files should not be code files by default')
    assert(!isCodeFile('style.css'), 'CSS files should not be code files by default')
    assert(!isCodeFile('image.png'), 'Image files should not be code files')
  })

  it('should identify files to ignore', () => {
    assert(shouldIgnoreFile('node_modules/react/index.js'), 'Should ignore node_modules')
    assert(shouldIgnoreFile('.git/config'), 'Should ignore .git directory')
    assert(shouldIgnoreFile('build/app.js'), 'Should ignore build directory')
    assert(shouldIgnoreFile('dist/bundle.js'), 'Should ignore dist directory')
    assert(shouldIgnoreFile('target/debug/main'), 'Should ignore target directory')
    assert(shouldIgnoreFile('.DS_Store'), 'Should ignore system files')
    
    assert(!shouldIgnoreFile('src/app.ts'), 'Should not ignore source files')
    assert(!shouldIgnoreFile('tests/app.test.ts'), 'Should not ignore test files')
  })

  it('should scan files with default options', async () => {
    const program = scanFiles('src/')
    const files = await Effect.runPromise(program)
    
    // Should find code files
    const filePaths = files.map(f => f.path)
    assert(filePaths.includes('src/app.ts'), 'Should find TypeScript files')
    assert(filePaths.includes('src/components/Button.tsx'), 'Should find TSX files')
    assert(filePaths.includes('src/legacy.js'), 'Should find JavaScript files')
    assert(filePaths.includes('src/components/Modal.jsx'), 'Should find JSX files')
    assert(filePaths.includes('src/algorithm.py'), 'Should find Python files')
    
    // Should not find non-code files
    assert(!filePaths.includes('src/image.png'), 'Should not find binary files')
    
    // Should include content for text files
    const tsFile = files.find(f => f.path === 'src/app.ts')
    assertExists(tsFile?.content, 'Should include file content')
    assert(tsFile!.content.includes('export const app'), 'Should have correct content')
  })

  it('should scan files with specific extensions', async () => {
    const options: ScanOptions = { 
      extensions: ['.ts', '.tsx'],
      includeMarkdown: false,
      maxDepth: 10,
      maxFileSize: 1024 * 1024
    }
    const program = scanFiles('src/', options)
    const files = await Effect.runPromise(program)
    
    const filePaths = files.map(f => f.path)
    assert(filePaths.includes('src/app.ts'), 'Should find .ts files')
    assert(filePaths.includes('src/components/Button.tsx'), 'Should find .tsx files')
    assert(!filePaths.includes('src/legacy.js'), 'Should not find .js files')
    assert(!filePaths.includes('src/algorithm.py'), 'Should not find .py files')
  })

  it('should include markdown files when specified', async () => {
    const options: ScanOptions = { 
      includeMarkdown: true,
      maxDepth: 10,
      maxFileSize: 1024 * 1024
    }
    const program = scanFiles('.', options)
    const files = await Effect.runPromise(program)
    
    const filePaths = files.map(f => f.path)
    assert(filePaths.includes('README.md'), 'Should find markdown files when included')
    assert(filePaths.includes('docs/guide.md'), 'Should find nested markdown files')
  })

  it('should respect ignore patterns', async () => {
    const program = scanFiles('.') // Scan entire directory
    const files = await Effect.runPromise(program)
    
    const filePaths = files.map(f => f.path)
    assert(!filePaths.some(p => p.startsWith('node_modules/')), 'Should ignore node_modules')
    assert(!filePaths.some(p => p.startsWith('.git/')), 'Should ignore .git')
    assert(!filePaths.some(p => p.startsWith('build/')), 'Should ignore build directory')
  })

  it('should scan recursively by default', async () => {
    const program = scanFiles('src/')
    const files = await Effect.runPromise(program)
    
    const filePaths = files.map(f => f.path)
    assert(filePaths.includes('src/components/Button.tsx'), 'Should find nested files')
    assert(filePaths.includes('src/utils/helpers.ts'), 'Should find deeply nested files')
  })

  it('should respect max depth option', async () => {
    const options: ScanOptions = { 
      maxDepth: 1,
      includeMarkdown: false,
      maxFileSize: 1024 * 1024
    }
    const program = scanFiles('src/', options)
    const files = await Effect.runPromise(program)
    
    const filePaths = files.map(f => f.path)
    assert(filePaths.includes('src/app.ts'), 'Should find files at depth 1')
    assert(!filePaths.includes('src/components/Button.tsx'), 'Should not find files beyond max depth')
  })

  it('should handle single file paths', async () => {
    const program = scanFiles('src/app.ts')
    const files = await Effect.runPromise(program)
    
    assertEquals(files.length, 1, 'Should return single file')
    assertEquals(files[0]!.path, 'src/app.ts', 'Should return correct file')
    assertExists(files[0]!.content, 'Should include file content')
  })

  it('should detect binary files and skip content', async () => {
    // Create a proper binary file that won't be filtered by isCodeFile
    await Deno.writeTextFile('src/data.bin', '') // Create empty file first
    const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE])
    await Deno.writeFile('src/data.bin', binaryContent)
    
    const options: ScanOptions = { 
      extensions: ['.bin'],
      includeMarkdown: false,
      maxDepth: 10,
      maxFileSize: 1024 * 1024
    } // Force include binary extension
    const program = scanFiles('src/data.bin', options)
    const files = await Effect.runPromise(program)
    
    if (files.length > 0) {
      const binaryFile = files[0]!
      assertEquals(binaryFile.content, null, 'Binary files should have null content')
      assertEquals(binaryFile.isBinary, true, 'Should mark file as binary')
    }
  })
})