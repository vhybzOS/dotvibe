/**
 * Large file generator for testing
 * Generates files >1MB to test parser performance
 */

import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Generate a large TypeScript file for performance testing
 */
export function generateLargeFile(targetSizeKB: number = 1024): string {
  const baseTemplate = readFileSync(new URL('./large-file.ts', import.meta.url), 'utf-8')
  const targetPath = '/tmp/dotvibe-large-test-file.ts'
  
  let content = baseTemplate + '\n\n'
  let currentSizeKB = content.length / 1024
  let classIndex = 0
  
  while (currentSizeKB < targetSizeKB) {
    const className = `GeneratedTestClass${classIndex}`
    const classContent = generateTestClass(className, classIndex)
    
    content += classContent + '\n\n'
    currentSizeKB = content.length / 1024
    classIndex++
    
    // Add some variety every 100 classes
    if (classIndex % 100 === 0) {
      content += generateTestInterface(`GeneratedInterface${classIndex}`) + '\n\n'
      content += generateTestEnum(`GeneratedEnum${classIndex}`) + '\n\n'
      content += generateComplexFunction(`complexFunction${classIndex}`) + '\n\n'
    }
  }
  
  // Add final export statement
  content += `\n// Total generated classes: ${classIndex}\n`
  content += `// File size: ~${Math.round(currentSizeKB)}KB\n`
  content += `export const GENERATED_CLASSES_COUNT = ${classIndex}\n`
  
  writeFileSync(targetPath, content)
  console.log(`Generated large file: ${targetPath} (${Math.round(currentSizeKB)}KB, ${classIndex} classes)`)
  
  return targetPath
}

function generateTestClass(className: string, index: number): string {
  return `export class ${className} extends BaseTestClass {
  private value${index}: number = ${index}
  private items${index}: string[] = []
  
  constructor() {
    super('${className.toLowerCase()}', '${className}')
  }
  
  getValue${index}(): number {
    return this.value${index}
  }
  
  setValue${index}(value: number): void {
    this.value${index} = value
  }
  
  addItem${index}(item: string): void {
    this.items${index}.push(item)
  }
  
  getItems${index}(): string[] {
    return [...this.items${index}]
  }
  
  process${index}(data: any[]): any[] {
    return data.map((item, idx) => ({
      ...item,
      index: idx,
      className: '${className}',
      processed: true,
      timestamp: new Date().toISOString()
    }))
  }
  
  async asyncMethod${index}(delay: number = 100): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, delay))
    return \`Async result from \${this.getName()} after \${delay}ms\`
  }
  
  static create${index}(): ${className} {
    return new ${className}()
  }
  
  static factory${index}(config: { value?: number, items?: string[] } = {}): ${className} {
    const instance = new ${className}()
    if (config.value !== undefined) {
      instance.setValue${index}(config.value)
    }
    if (config.items) {
      config.items.forEach(item => instance.addItem${index}(item))
    }
    return instance
  }
}`
}

function generateTestInterface(interfaceName: string): string {
  return `export interface ${interfaceName} {
  id: string
  name: string
  value: number
  items: string[]
  metadata: {
    created: Date
    modified: Date
    version: number
  }
  
  process(data: any[]): Promise<any[]>
  validate(): boolean
  serialize(): string
  deserialize(data: string): void
}`
}

function generateTestEnum(enumName: string): string {
  return `export enum ${enumName} {
  OPTION_A = 'option_a',
  OPTION_B = 'option_b',
  OPTION_C = 'option_c',
  OPTION_D = 'option_d',
  OPTION_E = 'option_e'
}`
}

function generateComplexFunction(functionName: string): string {
  return `export function ${functionName}<T extends Record<string, any>>(
  items: T[],
  options: {
    filter?: (item: T) => boolean
    transform?: (item: T) => T
    sort?: (a: T, b: T) => number
    limit?: number
  } = {}
): T[] {
  let result = [...items]
  
  if (options.filter) {
    result = result.filter(options.filter)
  }
  
  if (options.transform) {
    result = result.map(options.transform)
  }
  
  if (options.sort) {
    result.sort(options.sort)
  }
  
  if (options.limit) {
    result = result.slice(0, options.limit)
  }
  
  return result
}`
}

// Generate a 1MB test file if run directly
if (import.meta.main) {
  generateLargeFile(1024) // 1MB
}