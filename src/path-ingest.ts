/**
 * Path Ingest Module - Deno-native file combination utility
 * Replicates combine-files functionality for LLM context preparation
 * 
 * @tested_by tests/path-ingest.test.ts
 */

import { z } from 'zod/v4'
import { join, resolve, relative, extname, basename, dirname, isAbsolute } from '@std/path'

// Configuration schema
export const IngestConfigSchema = z.object({
  // File selection
  fileGlobs: z.array(z.string()).default(['**/*.{ts,js,tsx,jsx,md,json,yml,yaml}']),
  excludeGlobs: z.array(z.string()).default([
    '**/node_modules/**',
    '**/build/**',
    '**/dist/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.min.css'
  ]),
  
  // Output formatting
  includeDirectoryTree: z.boolean().default(true),
  fileSeparator: z.string().default('---- {filename} ----'),
  directoryTreeHeader: z.string().default('Directory structure:'),
  
  // File processing
  maxFileSize: z.number().default(1024 * 1024), // 1MB default
  encoding: z.enum(['utf8', 'utf16le', 'ascii']).default('utf8'),
  
  // Cross-platform
  normalizeLineEndings: z.boolean().default(true),
})

export type IngestConfig = z.infer<typeof IngestConfigSchema>

// File information interface
export interface FileInfo {
  path: string
  relativePath: string
  size: number
  content: string
  encoding: string
  lineCount: number
}

// Directory tree node
export interface TreeNode {
  name: string
  type: 'file' | 'directory'
  children: TreeNode[] | undefined
  path: string
}

/**
 * Main path ingest class
 */
export class PathIngest {
  private config: IngestConfig
  private rootPath: string
  private files: FileInfo[] = []

  constructor(rootPath: string, config: Partial<IngestConfig> = {}) {
    this.rootPath = resolve(rootPath)
    this.config = IngestConfigSchema.parse(config)
  }

  /**
   * Generate combined string from path
   */
  async ingest(): Promise<string> {
    // Collect all files
    await this.collectFiles()
    
    // Sort files by path for consistent output
    this.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    
    const sections: string[] = []
    
    // Add directory tree if requested
    if (this.config.includeDirectoryTree) {
      const tree = await this.generateDirectoryTree()
      sections.push(this.config.directoryTreeHeader)
      sections.push(this.formatDirectoryTree(tree))
      sections.push('')
    }
    
    // Add file contents
    for (const file of this.files) {
      const separator = this.config.fileSeparator.replace('{filename}', file.relativePath)
      sections.push('='.repeat(separator.length))
      sections.push(`FILE: ${file.relativePath}`)
      sections.push('='.repeat(separator.length))
      sections.push(file.content)
      sections.push('')
    }
    
    return sections.join('\n')
  }

  /**
   * Get file statistics
   */
  getStats() {
    const totalSize = this.files.reduce((sum, file) => sum + file.size, 0)
    const totalLines = this.files.reduce((sum, file) => sum + file.lineCount, 0)
    
    return {
      fileCount: this.files.length,
      totalSize,
      totalLines,
      averageFileSize: Math.round(totalSize / this.files.length),
      rootPath: this.rootPath
    }
  }

  /**
   * Collect all files matching patterns
   */
  private async collectFiles(): Promise<void> {
    const entries = await this.walkDirectory(this.rootPath)
    
    for (const entry of entries) {
      if (entry.isFile && this.shouldIncludeFile(entry.name)) {
        try {
          const fileInfo = await this.processFile(entry.name)
          if (fileInfo) {
            this.files.push(fileInfo)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.warn(`Failed to process file ${entry.name}: ${errorMessage}`)
        }
      }
    }
  }

  /**
   * Recursively walk directory
   */
  private async walkDirectory(path: string): Promise<Deno.DirEntry[]> {
    const entries: Deno.DirEntry[] = []
    
    try {
      for await (const entry of Deno.readDir(path)) {
        const fullPath = join(path, entry.name)
        
        if (entry.isDirectory && !this.shouldExcludeDirectory(entry.name)) {
          entries.push({ ...entry, name: fullPath })
          const subEntries = await this.walkDirectory(fullPath)
          entries.push(...subEntries)
        } else if (entry.isFile) {
          entries.push({ ...entry, name: fullPath })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to read directory ${path}: ${errorMessage}`)
    }
    
    return entries
  }

  /**
   * Check if file should be included based on globs
   */
  private shouldIncludeFile(filePath: string): boolean {
    const relativePath = relative(this.rootPath, filePath)
    
    // Check exclude patterns first
    for (const excludeGlob of this.config.excludeGlobs) {
      if (this.matchesGlob(relativePath, excludeGlob)) {
        return false
      }
    }
    
    // Check include patterns
    for (const includeGlob of this.config.fileGlobs) {
      if (this.matchesGlob(relativePath, includeGlob)) {
        return true
      }
    }
    
    return false
  }

  /**
   * Check if directory should be excluded
   */
  private shouldExcludeDirectory(dirName: string): boolean {
    const excludePatterns = [
      'node_modules', '.git', 'build', 'dist', 'coverage',
      '.next', '.nuxt', '.vscode', '.idea'
    ]
    
    return excludePatterns.includes(basename(dirName))
  }

  /**
   * Simple glob matching (basic implementation)
   */
  private matchesGlob(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.')         // Escape dots first
      .replace(/\*\*/g, '___DOUBLESTAR___')  // Temporarily replace ** to avoid conflicts
      .replace(/\*/g, '[^/]*')       // * matches any filename chars (no path separators)
      .replace(/___DOUBLESTAR___/g, '.*')  // ** matches any path including separators
      .replace(/\{([^}]+)\}/g, '($1)') // {ts,js} becomes (ts|js)
      .replace(/,/g, '|')            // comma separation in groups
    
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(path)
  }

  /**
   * Process individual file
   */
  private async processFile(filePath: string): Promise<FileInfo | null> {
    try {
      const stat = await Deno.stat(filePath)
      
      // Skip files that are too large
      if (stat.size > this.config.maxFileSize) {
        console.warn(`Skipping large file: ${filePath} (${stat.size} bytes)`)
        return null
      }
      
      // Read file with encoding detection
      const { content, encoding } = await this.readFileWithEncoding(filePath)
      
      // Normalize line endings if requested
      const normalizedContent = this.config.normalizeLineEndings 
        ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        : content
      
      const lineCount = normalizedContent.split('\n').length
      
      return {
        path: filePath,
        relativePath: relative(this.rootPath, filePath),
        size: stat.size,
        content: normalizedContent,
        encoding,
        lineCount
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to process file ${filePath}: ${errorMessage}`)
      return null
    }
  }

  /**
   * Read file with encoding detection
   */
  private async readFileWithEncoding(filePath: string): Promise<{ content: string, encoding: string }> {
    const bytes = await Deno.readFile(filePath)
    
    // Detect encoding based on BOM
    let encoding: string = this.config.encoding
    let startOffset = 0
    
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      encoding = 'utf8'
      startOffset = 3 // Skip UTF-8 BOM
    } else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      encoding = 'utf16le'
      startOffset = 2 // Skip UTF-16 BOM
    }
    
    const content = new TextDecoder(encoding).decode(bytes.slice(startOffset))
    
    return { content, encoding }
  }

  /**
   * Generate directory tree structure
   */
  private async generateDirectoryTree(): Promise<TreeNode> {
    const root: TreeNode = {
      name: basename(this.rootPath),
      type: 'directory',
      children: [],
      path: this.rootPath
    }
    
    // Build tree from collected files
    for (const file of this.files) {
      this.addFileToTree(root, file.relativePath)
    }
    
    return root
  }

  /**
   * Add file to directory tree
   */
  private addFileToTree(root: TreeNode, filePath: string): void {
    const parts = filePath.split(/[/\\]/).filter(part => part.length > 0)
    let current = root
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isFile = i === parts.length - 1
      
      if (!current.children) {
        current.children = []
      }
      
      let child = current.children.find(c => c.name === part)
      
      if (!child) {
        child = {
          name: part,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : [],
          path: join(current.path, part)
        } as TreeNode
        current.children.push(child)
      }
      
      if (child) {
        current = child
      }
    }
  }

  /**
   * Format directory tree as string
   */
  private formatDirectoryTree(node: TreeNode, prefix: string = '', isLast: boolean = true): string {
    const lines: string[] = []
    
    if (prefix === '') {
      lines.push(`└── ${node.name}/`)
    } else {
      const connector = isLast ? '└── ' : '├── '
      const icon = node.type === 'directory' ? '/' : ''
      lines.push(`${prefix}${connector}${node.name}${icon}`)
    }
    
    if (node.children && node.children.length > 0) {
      // Sort children: directories first, then files
      const sorted = [...node.children].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      
      for (let i = 0; i < sorted.length; i++) {
        const child = sorted[i]!
        const isChildLast = i === sorted.length - 1
        const childPrefix = prefix === '' ? '    ' : prefix + (isLast ? '    ' : '│   ')
        
        lines.push(this.formatDirectoryTree(child, childPrefix, isChildLast))
      }
    }
    
    return lines.join('\n')
  }
}

/**
 * Convenience function for quick ingestion
 */
export async function ingestPath(
  path: string, 
  config: Partial<IngestConfig> = {}
): Promise<{ content: string, stats: any }> {
  const ingest = new PathIngest(path, config)
  const content = await ingest.ingest()
  const stats = ingest.getStats()
  
  return { content, stats }
}

/**
 * Export default configuration for common use cases
 */
export const defaultConfigs = {
  typescript: {
    fileGlobs: ['**/*.{ts,tsx,js,jsx}'],
    excludeGlobs: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/*.min.js']
  },
  
  web: {
    fileGlobs: ['**/*.{ts,tsx,js,jsx,html,css,scss,sass,vue,svelte}'],
    excludeGlobs: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/*.min.*']
  },
  
  docs: {
    fileGlobs: ['**/*.{md,mdx,txt,rst}'],
    excludeGlobs: ['**/node_modules/**', '**/build/**']
  },
  
  config: {
    fileGlobs: ['**/*.{json,yml,yaml,toml,ini,env}'],
    excludeGlobs: ['**/node_modules/**', '**/build/**']
  }
}