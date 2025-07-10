/**
 * SurrealDB Integration for Vector Storage
 * 
 * @tested_by tests/database.test.ts
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import Surreal from 'surrealdb'
import { createStorageError, type VibeError } from './index.ts'
import { ensureSurrealServer, type ServerConfig } from './surreal-server.ts'

// Database schemas
export const VectorRecordSchema = z.object({
  file_path: z.string(),
  content: z.string(),
  embedding: z.array(z.number()),
  created_at: z.string()
})

export const FileMetadataSchema = z.object({
  path: z.string(),
  size: z.number(),
  modified_at: z.string(),
  language: z.string()
})

export const SearchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.1)
})

export const SearchResultSchema = z.object({
  file_path: z.string(),
  content: z.string(),
  similarity: z.number(),
  created_at: z.string()
})

export type VectorRecord = z.infer<typeof VectorRecordSchema>
export type FileMetadata = z.infer<typeof FileMetadataSchema>
export type SearchOptions = z.infer<typeof SearchOptionsSchema>
export type SearchResult = z.infer<typeof SearchResultSchema>

// Database connection type
export type DatabaseConnection = Surreal

/**
 * Simple database connection for toolbox usage
 */
export async function connectToDatabase(): Promise<DatabaseConnection> {
  // Get dynamic server configuration
  let serverConfig
  try {
    const pidFileContent = await Deno.readTextFile('.vibe/server.pid')
    const pidInfo = JSON.parse(pidFileContent)
    serverConfig = {
      host: pidInfo.host,
      port: pidInfo.port,
      username: 'root',
      password: 'root'
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error('SurrealDB server not running. Please run "./vibe start" first.')
    }
    throw error
  }
  
  const db = new Surreal()
  await db.connect(`http://${serverConfig.host}:${serverConfig.port}/rpc`)
  await db.signin({ username: serverConfig.username, password: serverConfig.password })
  await db.use({ namespace: 'vibe', database: 'code' })
  return db
}

/**
 * Connect to SurrealDB server (automatically starts server if needed) - Effect version
 */
export const connectToDatabaseEffect = (dbPath: string): Effect.Effect<DatabaseConnection, VibeError> =>
  pipe(
    // Ensure SurrealDB server is running (start if needed)
    ensureSurrealServer(dbPath),
    Effect.flatMap(config =>
      Effect.tryPromise({
        try: async () => {
          const db = new Surreal()
          
          // Connect to the server
          await db.connect(`http://${config.host}:${config.port}/rpc`)
          
          // Authenticate with the server
          await db.signin({ username: config.username, password: config.password })
          
          // Use specific namespace and database
          await db.use({ namespace: 'vibe', database: 'code' })
          
          return db
        },
        catch: (error) => createStorageError(error, dbPath, 'Failed to connect to SurrealDB server')
      })
    )
  )

/**
 * Create database schema for vectors and metadata
 */
export const createDatabaseSchema = (db: DatabaseConnection): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      // Create code_symbols table
      await db.query(`
        DEFINE TABLE code_symbols SCHEMAFULL;
        DEFINE FIELD id ON code_symbols TYPE string;
        DEFINE FIELD file_path ON code_symbols TYPE string;
        DEFINE FIELD symbol_name ON code_symbols TYPE string;
        DEFINE FIELD symbol_kind ON code_symbols TYPE string;
        DEFINE FIELD start_line ON code_symbols TYPE number;
        DEFINE FIELD end_line ON code_symbols TYPE number;
        DEFINE FIELD content_hash ON code_symbols TYPE string;
        DEFINE FIELD description ON code_symbols TYPE string;
        DEFINE FIELD code ON code_symbols TYPE string;
        DEFINE FIELD lines ON code_symbols TYPE array<number>;
        DEFINE FIELD embedding ON code_symbols TYPE array<float>;
        DEFINE INDEX symbols_path_idx ON code_symbols FIELDS file_path;
        DEFINE INDEX symbols_name_idx ON code_symbols FIELDS symbol_name;
      `)
      
      // Create file metadata table
      await db.query(`
        DEFINE TABLE file_metadata SCHEMAFULL;
        DEFINE FIELD path ON file_metadata TYPE string;
        DEFINE FIELD size ON file_metadata TYPE number;
        DEFINE FIELD modified_at ON file_metadata TYPE datetime;
        DEFINE FIELD language ON file_metadata TYPE string;
        DEFINE INDEX metadata_path_idx ON file_metadata FIELDS path UNIQUE;
      `)
      
      // Create workspace info table
      await db.query(`
        DEFINE TABLE workspace_info SCHEMAFULL;
        DEFINE FIELD id ON workspace_info TYPE string;
        DEFINE FIELD created_at ON workspace_info TYPE datetime;
        DEFINE FIELD last_indexed ON workspace_info TYPE option<datetime>;
        DEFINE FIELD total_files ON workspace_info TYPE number;
        DEFINE FIELD total_vectors ON workspace_info TYPE number;
      `)
      
      // Initialize workspace info record
      await db.query(`
        CREATE workspace_info:main SET
          id = 'main',
          created_at = time::now(),
          last_indexed = NONE,
          total_files = 0,
          total_vectors = 0;
      `)
    },
    catch: (error) => createStorageError(error, 'schema', 'Failed to create database schema')
  })

/**
 * Insert vector record into database
 */
export const insertVector = (
  db: DatabaseConnection, 
  vector: VectorRecord
): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      await db.query(`
        CREATE vectors SET
          file_path = $file_path,
          content = $content,
          embedding = $embedding,
          created_at = time::now();
      `, {
        file_path: vector.file_path,
        content: vector.content,
        embedding: vector.embedding
      })
    },
    catch: (error) => createStorageError(error, vector.file_path, 'Failed to insert vector')
  })

/**
 * Insert file metadata into database
 */
export const insertFileMetadata = (
  db: DatabaseConnection,
  metadata: FileMetadata
): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      await db.query(`
        UPSERT file_metadata:⟨$path⟩ SET
          path = $path,
          size = $size,
          modified_at = <datetime>$modified_at,
          language = $language;
      `, {
        path: metadata.path,
        size: metadata.size,
        modified_at: metadata.modified_at,
        language: metadata.language
      })
    },
    catch: (error) => createStorageError(error, metadata.path, 'Failed to insert file metadata')
  })

/**
 * Search vectors using cosine similarity (legacy)
 */
export const searchVectors = (
  db: DatabaseConnection,
  queryVector: number[],
  options: SearchOptions
): Effect.Effect<SearchResult[], VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const result = await db.query(`
        SELECT 
          file_path,
          content,
          vector::similarity::cosine(embedding, $query_vector) AS similarity,
          created_at
        FROM vectors
        WHERE vector::similarity::cosine(embedding, $query_vector) >= $threshold
        ORDER BY similarity DESC
        LIMIT $limit;
      `, {
        query_vector: queryVector,
        threshold: options.threshold,
        limit: options.limit
      })
      
      // Extract results from SurrealDB response format
      const vectors = Array.isArray(result) && result.length > 0 ? result[0] : []
      
      return Array.isArray(vectors) ? vectors.map(v => ({
        file_path: v.file_path,
        content: v.content,
        similarity: v.similarity,
        created_at: v.created_at
      })) : []
    },
    catch: (error) => createStorageError(error, 'search', 'Failed to search vectors')
  })

/**
 * Search code symbols using semantic similarity on descriptions and embeddings
 */
export const searchCodeSymbols = (
  db: DatabaseConnection,
  queryVector: number[],
  options: SearchOptions
): Effect.Effect<SearchResult[], VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const result = await db.query(`
        SELECT 
          file_path,
          symbol_name,
          symbol_kind,
          description,
          code,
          lines,
          vector::similarity::cosine(embedding, $query_vector) AS similarity,
          start_line,
          end_line
        FROM code_symbols
        WHERE vector::similarity::cosine(embedding, $query_vector) >= $threshold
        ORDER BY similarity DESC
        LIMIT $limit;
      `, {
        query_vector: queryVector,
        threshold: options.threshold,
        limit: options.limit
      })
      
      // Extract results from SurrealDB response format
      const symbols = Array.isArray(result) && result.length > 0 ? result[0] : []
      
      return Array.isArray(symbols) ? symbols.map(s => ({
        file_path: s.file_path,
        content: `${s.symbol_name} (${s.symbol_kind}): ${s.description}`,
        similarity: s.similarity,
        created_at: new Date().toISOString(), // Use current time since this is a symbol result
        symbol_name: s.symbol_name,
        symbol_kind: s.symbol_kind,
        start_line: s.start_line,
        end_line: s.end_line,
        code: s.code,
        lines: s.lines
      })) : []
    },
    catch: (error) => createStorageError(error, 'search', 'Failed to search code symbols')
  })

/**
 * Get workspace statistics
 */
export const getWorkspaceStats = (
  db: DatabaseConnection
): Effect.Effect<{ totalFiles: number; totalVectors: number }, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      const [fileCount, vectorCount] = await Promise.all([
        db.query('SELECT count() AS count FROM file_metadata GROUP ALL;'),
        db.query('SELECT count() AS count FROM vectors GROUP ALL;')
      ])
      
      return {
        totalFiles: (Array.isArray(fileCount) && fileCount.length > 0 && Array.isArray(fileCount[0]) && fileCount[0].length > 0) ? fileCount[0][0]?.count || 0 : 0,
        totalVectors: (Array.isArray(vectorCount) && vectorCount.length > 0 && Array.isArray(vectorCount[0]) && vectorCount[0].length > 0) ? vectorCount[0][0]?.count || 0 : 0
      }
    },
    catch: (error) => createStorageError(error, 'stats', 'Failed to get workspace stats')
  })

/**
 * Update workspace statistics
 */
export const updateWorkspaceStats = (
  db: DatabaseConnection
): Effect.Effect<void, VibeError> =>
  pipe(
    getWorkspaceStats(db),
    Effect.flatMap(stats =>
      Effect.tryPromise({
        try: async () => {
          await db.query(`
            UPDATE workspace_info:main SET
              last_indexed = time::now(),
              total_files = $total_files,
              total_vectors = $total_vectors;
          `, {
            total_files: stats.totalFiles,
            total_vectors: stats.totalVectors
          })
        },
        catch: (error) => createStorageError(error, 'workspace_info', 'Failed to update workspace stats')
      })
    )
  )

/**
 * Clear all vectors (for re-indexing)
 */
export const clearVectors = (
  db: DatabaseConnection
): Effect.Effect<void, VibeError> =>
  Effect.tryPromise({
    try: async () => {
      await db.query('DELETE vectors;')
      await db.query('DELETE file_metadata;')
    },
    catch: (error) => createStorageError(error, 'clear', 'Failed to clear vectors')
  })