/**
 * Storage System Index
 *
 * Main entry point for the storage system with clean, organized exports.
 *
 * @tested_by tests/core/storage-index.test.ts
 */

import {
  FindElementsOptions,
  GraphTraversalOptions,
  SearchOptions,
  DirectoryIndexOptions,
} from "./types.ts";

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type {
  DatabaseConnection,
  ElementType,
  RelationshipType,
  DataFlowType,
  CodeElementData,
  RelationshipData,
  DataFlowRelationshipData,
  CodeElement,
  IndexResult,
  FindElementsOptions,
  GraphTraversalOptions,
  SearchOptions,
  DirectoryIndexOptions,
  DirectoryIndexResult,
} from "./types.ts";

// =============================================================================
// CORE OPERATIONS
// =============================================================================

export {
  // Database management
  connectToDatabase,
  withProjectDatabase,
  initializeSchema,

  // File indexing
  indexFile,
  indexDirectory,

  // Graph traversal
  findElementCallers,
  findElementCallees,
  findFileDependencies,
  findFileDependents,

  // Search operations
  findElementsByName,
  findElementsByFile,
  searchElements,
} from "./core.ts";

// =============================================================================
// UTILITIES
// =============================================================================

export {
  // Path utilities
  findProjectRoot,
  resolveProjectPath,
  extractFilePathFromElementPath,

  // Data utilities
  now,
  generateContentHash,
  classifyTarget,
  processRelationship,

  // Database utilities
  getExistingElement,
  isSemanticElementName,
} from "./utils.ts";

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Simple storage interface for common operations
 */
export class Storage {
  constructor(private projectPath: string) {}

  // Schema operations
  async initSchema(verbose = false) {
    const { Effect } = await import("effect");
    const { initializeSchema } = await import("./core.ts");
    return Effect.runPromise(initializeSchema(this.projectPath, verbose));
  }

  // File operations
  async indexFile(filePath: string) {
    const { Effect } = await import("effect");
    const { indexFile } = await import("./core.ts");
    return Effect.runPromise(indexFile(filePath, this.projectPath));
  }

  // Graph traversal
  async findCallers(elementPath: string, options?: GraphTraversalOptions) {
    const { Effect } = await import("effect");
    const { findElementCallers } = await import("./core.ts");
    return Effect.runPromise(
      findElementCallers(elementPath, this.projectPath, options)
    );
  }

  async findCallees(elementPath: string, options?: GraphTraversalOptions) {
    const { Effect } = await import("effect");
    const { findElementCallees } = await import("./core.ts");
    return Effect.runPromise(
      findElementCallees(elementPath, this.projectPath, options)
    );
  }

  async findDependencies(filePath: string) {
    const { Effect } = await import("effect");
    const { findFileDependencies } = await import("./core.ts");
    return Effect.runPromise(findFileDependencies(filePath, this.projectPath));
  }

  async findDependents(filePath: string) {
    const { Effect } = await import("effect");
    const { findFileDependents } = await import("./core.ts");
    return Effect.runPromise(findFileDependents(filePath, this.projectPath));
  }

  // Search operations
  async findElements(namePattern: string, options?: FindElementsOptions) {
    const { Effect } = await import("effect");
    const { findElementsByName } = await import("./core.ts");
    return Effect.runPromise(
      findElementsByName(namePattern, this.projectPath, options)
    );
  }

  async findFileElements(filePath: string, options?: FindElementsOptions) {
    const { Effect } = await import("effect");
    const { findElementsByFile } = await import("./core.ts");
    return Effect.runPromise(
      findElementsByFile(filePath, this.projectPath, options)
    );
  }

  async search(query: string, options?: SearchOptions) {
    const { Effect } = await import("effect");
    const { searchElements } = await import("./core.ts");
    return Effect.runPromise(searchElements(query, this.projectPath, options));
  }

  // Directory operations
  async indexDirectory(dirPath: string, options?: DirectoryIndexOptions) {
    const { Effect } = await import("effect");
    const { indexDirectory } = await import("./core.ts");
    return Effect.runPromise(indexDirectory(dirPath, this.projectPath, options));
  }
}

/**
 * Create a storage instance for a project
 */
export async function createStorage(projectPath?: string): Promise<Storage> {
  if (!projectPath) {
    const { findProjectRoot } = await import("./utils.ts");
    projectPath = findProjectRoot();
  }
  return new Storage(projectPath);
}
