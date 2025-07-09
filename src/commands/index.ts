/**
 * Vibe Index Command - Scan and index files with embeddings
 * 
 * @tested_by tests/index.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createStorageError, type VibeError } from '../index.ts'
import { ensureWorkspaceReady } from '../workspace.ts'
import { connectToDatabase, insertVector, insertFileMetadata, updateWorkspaceStats } from '../database.ts'
import { scanFiles, type ScanOptions } from '../file-scanner.ts'
import { generateSingleEmbedding } from '../embeddings.ts'

// Index command options schema
export const IndexOptionsSchema = z.object({
  ext: z.array(z.string()).optional(),
  includeMarkdown: z.boolean().default(false),
  maxDepth: z.number().int().min(1).default(10),
  verbose: z.boolean().default(false),
  batchSize: z.number().int().min(1).default(5)
})

export type IndexOptions = z.infer<typeof IndexOptionsSchema>


/**
 * Process a single file: generate embedding and store in database
 */
const processFile = (
  db: any,
  filePath: string,
  content: string,
  language: string,
  size: number,
  modifiedAt: string,
  verbose: boolean
): Effect.Effect<void, VibeError> =>
  pipe(
    Effect.sync(() => {
      if (verbose) {
        console.log(`📄 Processing: ${filePath}`)
      }
    }),
    Effect.flatMap(() => generateSingleEmbedding(content)),
    Effect.flatMap(embeddingResult =>
      pipe(
        insertVector(db, {
          file_path: filePath,
          content: content,
          embedding: embeddingResult.embedding,
          created_at: embeddingResult.timestamp.toString()
        }),
        Effect.flatMap(() =>
          insertFileMetadata(db, {
            path: filePath,
            size: size,
            modified_at: modifiedAt,
            language: language
          })
        )
      )
    ),
    Effect.tap(() => Effect.sync(() => {
      if (verbose) {
        console.log(`✅ Indexed: ${filePath}`)
      }
    }))
  )

/**
 * Process files in batches to avoid overwhelming the API
 */
const processBatch = (
  db: any,
  files: Array<{
    path: string
    content: string
    language: string
    size: number
    modifiedAt: string
  }>,
  verbose: boolean
): Effect.Effect<void, VibeError> =>
  pipe(
    Effect.all(
      files.map(file =>
        processFile(db, file.path, file.content, file.language, file.size, file.modifiedAt, verbose)
      ),
      { concurrency: 1 } // Process sequentially to avoid rate limiting
    ),
    Effect.map(() => void 0)
  )

/**
 * Main index command implementation
 */
export const indexCommand = (
  targetPath: string,
  options: Partial<IndexOptions> = {}
): Effect.Effect<void, VibeError> => {
  const indexOptions = IndexOptionsSchema.parse(options)
  
  return pipe(
    ensureWorkspaceReady(),
    Effect.flatMap(() => {
      if (indexOptions.verbose) {
        console.log(`🔍 Scanning: ${targetPath}`)
      }
      
      const scanOptions: ScanOptions = {
        extensions: indexOptions.ext,
        includeMarkdown: indexOptions.includeMarkdown,
        maxDepth: indexOptions.maxDepth,
        maxFileSize: 1024 * 1024 // 1MB default
      }
      
      return scanFiles(targetPath, scanOptions)
    }),
    Effect.tap(files => Effect.sync(() => {
      const codeFiles = files.filter(f => f.content !== null && !f.isBinary)
      console.log(`📁 Found ${codeFiles.length} files to index`)
      
      if (indexOptions.verbose) {
        codeFiles.forEach(f => console.log(`  - ${f.path} (${f.language})`))
      }
    })),
    Effect.flatMap(files => {
      const codeFiles = files.filter(f => f.content !== null && !f.isBinary)
      
      if (codeFiles.length === 0) {
        console.log('ℹ️  No code files found to index')
        return Effect.succeed(void 0)
      }
      
      return pipe(
        connectToDatabase('.vibe/code.db'),
        Effect.flatMap(db => {
          // Group files into batches
          const batches: Array<Array<{
            path: string
            content: string
            language: string
            size: number
            modifiedAt: string
          }>> = []
          
          for (let i = 0; i < codeFiles.length; i += indexOptions.batchSize) {
            const batch = codeFiles.slice(i, i + indexOptions.batchSize).map(file => ({
              path: file.path,
              content: file.content!,
              language: file.language,
              size: file.size,
              modifiedAt: file.modifiedAt
            }))
            batches.push(batch)
          }
          
          // Process batches sequentially
          return pipe(
            Effect.all(
              batches.map((batch, index) =>
                pipe(
                  processBatch(db, batch, indexOptions.verbose),
                  Effect.tap(() => Effect.sync(() => {
                    const progress = Math.round(((index + 1) / batches.length) * 100)
                    console.log(`📊 Progress: ${progress}% (${(index + 1) * indexOptions.batchSize}/${codeFiles.length} files)`)
                  }))
                )
              ),
              { concurrency: 1 }
            ),
            Effect.flatMap(() => updateWorkspaceStats(db)),
            Effect.tap(() => Effect.tryPromise({
              try: () => db.close(),
              catch: (error) => createStorageError(error, 'database', 'Failed to close database')
            }).pipe(Effect.catchAll(() => Effect.succeed(void 0))))
          )
        })
      )
    }),
    Effect.tap(() => Effect.sync(() => {
      console.log('✅ Indexing complete!')
      console.log('💡 You can now search your code with: vibe query "your search"')
    }))
  )
}