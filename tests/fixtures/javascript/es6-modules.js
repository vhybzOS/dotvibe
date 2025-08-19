/**
 * ES6 modules test fixture
 * Used for testing JavaScript parsing and module relationships
 */

// ES6 imports
import { readFile } from 'fs/promises'
import path from 'path'

// Default export function
export default function processFile(filePath) {
  return readFile(filePath, 'utf8')
}

// Named exports
export const CONFIG = {
  timeout: 5000,
  retries: 3,
  debug: false
}

export function validatePath(inputPath) {
  return path.isAbsolute(inputPath) && inputPath.length > 0
}

export async function readFileContent(filePath) {
  if (!validatePath(filePath)) {
    throw new Error('Invalid file path')
  }
  
  try {
    const content = await readFile(filePath, 'utf8')
    return content
  } catch (error) {
    console.error(`Failed to read file: ${error.message}`)
    throw error
  }
}

// Arrow function export
export const parseJson = (content) => {
  try {
    return JSON.parse(content)
  } catch (error) {
    return null
  }
}

// Class export
export class FileProcessor {
  constructor(options = {}) {
    this.options = { ...CONFIG, ...options }
  }
  
  async process(filePath) {
    const content = await readFileContent(filePath)
    const parsed = parseJson(content)
    
    if (!parsed && this.options.debug) {
      console.warn('Failed to parse JSON content')
    }
    
    return parsed
  }
  
  static create(options) {
    return new FileProcessor(options)
  }
}