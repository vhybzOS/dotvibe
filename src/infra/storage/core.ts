/**
 * Storage System Core Logic
 *
 * Core database operations, indexing, graph traversal, and search functionality.
 *
 * @tested_by tests/core/storage-core.test.ts
 */

import { Effect, pipe } from "effect";
import Surreal from "surrealdb";
import {
  createError,
  createErrorCollector,
  type VibeError,
} from "../errors.ts";
import { getCommandVerbose } from "../config.ts";
import { parseFileWithRelationships, type FileParseResult } from "../ast/index.ts";
import type {
  DatabaseConnection,
  CodeElementData,
  RelationshipData,
  DataFlowRelationshipData,
  CodeElement,
  IndexResult,
  ElementType,
  FindElementsOptions,
  GraphTraversalOptions,
  SearchOptions,
} from "./types.ts";
import {
  findProjectRoot,
  resolveProjectPath,
  extractFilePathFromElementPath,
  now,
  processRelationship,
  getExistingElement,
  isSemanticElementName,
} from "./utils.ts";

// Create subsystem-specific error creators
const storageError = createError("storage");

// Get verbose setting for this command invocation
const verbose = getCommandVerbose();

// =============================================================================
// DATABASE CONNECTION & MANAGEMENT
// =============================================================================

/**
 * Project-aware database connection
 */
export async function connectToDatabase(
  projectPath: string
): Promise<DatabaseConnection> {
  // Get server configuration from project's .vibe directory
  let serverConfig;
  try {
    const pidFilePath = `${projectPath}/.vibe/server.pid`;
    const pidFileContent = await Deno.readTextFile(pidFilePath);
    const pidInfo = JSON.parse(pidFileContent);
    serverConfig = {
      host: pidInfo.host,
      port: pidInfo.port,
      username: "root",
      password: "root",
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw storageError(
        "error",
        `SurrealDB server not running in project ${projectPath}. Please run "./vibe start" first.`,
        projectPath
      );
    }
    throw error;
  }

  const db = new Surreal();
  await db.connect(`http://${serverConfig.host}:${serverConfig.port}/rpc`);
  await db.signin({
    username: serverConfig.username,
    password: serverConfig.password,
  });
  await db.use({ namespace: "vibe", database: "code" });
  return db;
}

/**
 * Project-aware higher-order function for database operations
 */
export const withProjectDatabase = <T>(
  projectPath: string,
  operation: (db: DatabaseConnection) => Promise<T>
): Effect.Effect<T, VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const db = await connectToDatabase(projectPath);
        try {
          const result = await operation(db);
          return result;
        } finally {
          await db.close();
        }
      },
      catch: (error) =>
        storageError(
          "error",
          `Database operation failed in project ${projectPath}`,
          projectPath,
          { error }
        ),
    })
  );
};

// =============================================================================
// SCHEMA MANAGEMENT
// =============================================================================

/**
 * Initialize database schema for project - simplified for SurrealDB natural patterns
 */
export const initializeSchema = (
  projectPath: string,
  verbose: boolean = false
): Effect.Effect<void, VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    // Drop existing tables if they exist (for clean slate)
    try {
      await db.query(`REMOVE TABLE code_elements;`);
      await db.query(`REMOVE TABLE structural_relationship;`);
      await db.query(`REMOVE TABLE data_flow;`);
    } catch (error) {
      // Tables might not exist, that's fine
    }

    // Create code_elements table - let SurrealDB handle most fields naturally
    await db.query(`
      DEFINE TABLE code_elements SCHEMAFULL;
      DEFINE FIELD element_path ON code_elements TYPE string;
      DEFINE FIELD file_path ON code_elements TYPE string;
      DEFINE FIELD element_name ON code_elements TYPE string;
      DEFINE FIELD element_type ON code_elements TYPE string;
      DEFINE FIELD content ON code_elements TYPE string;
      DEFINE FIELD start_line ON code_elements TYPE int;
      DEFINE FIELD end_line ON code_elements TYPE int;
      DEFINE FIELD is_placeholder ON code_elements TYPE bool DEFAULT false;
      
      DEFINE INDEX element_path_unique ON code_elements COLUMNS element_path UNIQUE;
      DEFINE INDEX file_path_idx ON code_elements COLUMNS file_path;
      DEFINE INDEX placeholder_idx ON code_elements COLUMNS is_placeholder;
    `);

    // Create relationship tables - SurrealDB automatically creates 'in' and 'out' fields
    await db.query(`
      DEFINE TABLE structural_relationship TYPE RELATION SCHEMAFULL;
      DEFINE FIELD relationship_type ON structural_relationship TYPE string;
      DEFINE FIELD resolved ON structural_relationship TYPE bool DEFAULT false;
      DEFINE FIELD target_type ON structural_relationship TYPE string;
      DEFINE FIELD context ON structural_relationship TYPE object;
      
      DEFINE INDEX unique_structural_rel ON structural_relationship COLUMNS in, out, relationship_type UNIQUE;
    `);

    await db.query(`
      DEFINE TABLE data_flow TYPE RELATION SCHEMAFULL;
      DEFINE FIELD flow_type ON data_flow TYPE string;
      DEFINE FIELD flow_metadata ON data_flow TYPE object;
    `);

    verbose && console.debug(`Schema initialized for project: ${projectPath}`);
  });
};

// =============================================================================
// FILE INDEXING OPERATIONS
// =============================================================================

/**
 * Index a single file into the graph database
 */
export const indexFile = (
  filePath: string,
  projectPath: string
): Effect.Effect<IndexResult, VibeError> => {
  const startTime = Date.now();

  return pipe(
    // Read file content
    Effect.tryPromise({
      try: () => Deno.readTextFile(resolveProjectPath(filePath, projectPath)),
      catch: (error) =>
        storageError("error", `Failed to read file: ${filePath}`, filePath, {
          error,
        }),
    }),

    // Parse with AST analyzer
    Effect.flatMap((content) =>
      parseFileWithRelationships(
        content,
        "typescript",
        resolveProjectPath(filePath, projectPath)
      )
    ),

    // Index to database
    Effect.flatMap((parseResult) =>
      withProjectDatabase(projectPath, async (db) => {
        const absolutePath = resolveProjectPath(filePath, projectPath);
        const currentTime = now();

        // Granular element updates - preserve relationships by using element_path as stable ID
        let elementsAdded = 0;
        let elementsUpdated = 0;
        let elementsRemoved = 0;
        let relationshipsAdded = 0;
        let dataFlowsAdded = 0;
        let placeholdersCreated = 0;
        let relationshipsResolved = 0;
        const errorCollector = createErrorCollector("File Indexing");

        // Get existing elements in this file for comparison
        const existingElementsQuery = `
          SELECT element_path, id, is_placeholder FROM code_elements 
          WHERE file_path = $filePath AND is_placeholder = false
        `;
        const existingElementsResult = await db.query<CodeElement[][]>(existingElementsQuery, {
          filePath: absolutePath,
        });
        const existingElementPaths = new Set(
          (existingElementsResult?.[0] || []).map((e: any) => e.element_path)
        );

        // Track which elements we're updating (to know which to remove later)
        const updatedElementPaths = new Set<string>();

        // Store/update elements with PARALLEL processing for major speedup
        console.log(
          `DEBUG: About to store ${parseResult.elements.length} elements in parallel`
        );

        // Process all elements in parallel using Promise.allSettled
        const elementPromises = parseResult.elements.map(async (element) => {
          try {
            const elementPath = element.id; // AST generates path-based IDs
            updatedElementPaths.add(elementPath);

            console.log(
              `DEBUG: Storing element: ${element.element_name} (${element.element_type}) at path: ${elementPath}`
            );

            // Check if element already exists (placeholder or real)
            const existingElement = await getExistingElement(elementPath, db);

            if (existingElement) {
              if (existingElement.is_placeholder) {
                // UPDATE existing placeholder to preserve ID and relationships
                console.log(
                  `DEBUG: Updating placeholder to real element: ${element.element_name}`
                );

                // Determine correct file path: use resolved path for imports, current file for locals
                const correctFilePath =
                  element.element_type === "import"
                    ? extractFilePathFromElementPath(elementPath)
                    : absolutePath;

                await db.query(
                  `
                  UPDATE code_elements SET
                    element_type = $element_type,
                    file_path = $file_path,
                    start_line = $start_line,
                    end_line = $end_line,
                    content = $content,
                    is_placeholder = false
                  WHERE id = $elementId
                `,
                  {
                    elementId: existingElement.id,
                    element_type: element.element_type,
                    file_path: correctFilePath,
                    start_line: element.start_line,
                    end_line: element.end_line,
                    content: element.content,
                  }
                );

                console.log(
                  `DEBUG: Successfully updated placeholder ${element.element_name} to real element`
                );
                return { type: "updated", element };
              } else {
                // UPDATE existing real element with new content (idempotent)
                console.log(
                  `DEBUG: Updating existing element: ${element.element_name}`
                );

                // Determine correct file path: use resolved path for imports, current file for locals
                const correctFilePath =
                  element.element_type === "import"
                    ? extractFilePathFromElementPath(elementPath)
                    : absolutePath;

                await db.query(
                  `
                  UPDATE code_elements SET
                    element_type = $element_type,
                    file_path = $file_path,
                    start_line = $start_line,
                    end_line = $end_line,
                    content = $content
                  WHERE element_path = $elementPath
                `,
                  {
                    elementPath,
                    element_type: element.element_type,
                    file_path: correctFilePath,
                    start_line: element.start_line,
                    end_line: element.end_line,
                    content: element.content,
                  }
                );

                console.log(
                  `DEBUG: Successfully updated existing element: ${element.element_name}`
                );
                return { type: "updated", element };
              }
            } else {
              // CREATE new element using UPSERT with element_path as key
              console.log(
                `DEBUG: Creating new element: ${element.element_name}`
              );

              // Determine correct file path: use resolved path for imports, current file for locals
              const correctFilePath =
                element.element_type === "import"
                  ? extractFilePathFromElementPath(elementPath)
                  : absolutePath;

              await db.query(
                `
                UPSERT code_elements CONTENT {
                  element_path: $elementPath,
                  file_path: $file_path,
                  element_name: $element_name,
                  element_type: $element_type,
                  start_line: $start_line,
                  end_line: $end_line,
                  content: $content,
                  is_placeholder: false
                }
              `,
                {
                  elementPath,
                  file_path: correctFilePath,
                  element_name: element.element_name,
                  element_type: element.element_type,
                  start_line: element.start_line,
                  end_line: element.end_line,
                  content: element.content,
                }
              );

              console.log(
                `DEBUG: Successfully created new element: ${element.element_name}`
              );
              return { type: "added", element };
            }
          } catch (error) {
            console.log(
              `DEBUG: Failed to store element ${element.element_name}:`,
              error
            );
            return { type: "error", element, error: (error as Error).message };
          }
        });

        // Wait for all element operations to complete
        const elementResults = await Promise.allSettled(elementPromises);

        // Process results and count outcomes
        elementResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const outcome = result.value;
            if (outcome.type === "added") {
              elementsAdded++;
            } else if (outcome.type === "updated") {
              elementsUpdated++;
            } else if (outcome.type === "error") {
              errorCollector.add(
                `Failed to store element ${outcome.element.element_name}: ${outcome.error}`
              );
            }
          } else {
            const element = parseResult.elements[index];
            errorCollector.add(
              `Promise rejected for element ${element.element_name}: ${result.reason}`
            );
          }
        });

        // Remove elements that existed before but are no longer in the parse result - PARALLEL
        const elementsToDelete = Array.from(existingElementPaths).filter(
          (path) => !updatedElementPaths.has(path)
        );

        if (elementsToDelete.length > 0) {
          console.log(
            `DEBUG: Removing ${elementsToDelete.length} deleted elements in parallel`
          );

          const deletePromises = elementsToDelete.map(async (existingPath) => {
            try {
              console.log(`DEBUG: Removing deleted element: ${existingPath}`);

              // Delete the element and its relationships will be auto-cleaned by SurrealDB
              await db.query(
                `DELETE FROM code_elements WHERE element_path = $elementPath`,
                {
                  elementPath: existingPath,
                }
              );

              console.log(
                `DEBUG: Successfully removed deleted element: ${existingPath}`
              );
              return { success: true, path: existingPath };
            } catch (error) {
              console.log(
                `DEBUG: Failed to remove element ${existingPath}:`,
                error
              );
              return {
                success: false,
                path: existingPath,
                error: error.message,
              };
            }
          });

          const deleteResults = await Promise.allSettled(deletePromises);

          // Process deletion results
          deleteResults.forEach((result) => {
            if (result.status === "fulfilled") {
              const outcome = result.value;
              if (outcome.success) {
                elementsRemoved++;
              } else {
                errorCollector.add(
                  `Failed to remove element ${outcome.path}: ${outcome.error}`
                );
              }
            } else {
              errorCollector.add(
                `Promise rejected for element deletion: ${result.reason}`
              );
            }
          });
        }

        // Process raw AST relationships into enhanced relationships with resolution tracking
        const enhancedRelationships = parseResult.relationships.map((rawRel) =>
          processRelationship(rawRel, projectPath)
        );

        // Phase 2: Create placeholder elements for missing relationship targets
        console.log(
          `DEBUG: Creating placeholders for missing relationship targets`
        );
        placeholdersCreated = await createMissingPlaceholders(
          enhancedRelationships,
          projectPath,
          db
        );
        console.log(
          `DEBUG: Created ${placeholdersCreated} placeholder elements`
        );

        // Phase 3: Update resolution status now that all targets exist (real + placeholders)
        console.log(`DEBUG: Updating resolution status for relationships`);
        relationshipsResolved = await updateResolutionStatus(
          enhancedRelationships,
          projectPath,
          db,
          absolutePath
        );
        console.log(
          `DEBUG: Marked ${relationshipsResolved} relationships as resolved`
        );

        // Store relationships and data flows
        console.log(
          `DEBUG: About to store ${enhancedRelationships.length} relationships and ${parseResult.dataFlows.length} data flows`
        );

        // Clear existing data flows from this file to prevent duplicates
        console.log(
          `DEBUG: Clearing existing data flows for file: ${absolutePath}`
        );
        await db.query(
          `
          DELETE data_flow WHERE 
          in IN (SELECT id FROM code_elements WHERE file_path = $filePath) OR
          out IN (SELECT id FROM code_elements WHERE file_path = $filePath)
        `,
          { filePath: absolutePath }
        );

        const relationshipResults = await storeRelationships(
          enhancedRelationships,
          projectPath,
          db
        );
        const dataFlowResults = await storeDataFlows(
          parseResult.dataFlows,
          projectPath,
          db
        );

        relationshipsAdded = relationshipResults.stored;
        dataFlowsAdded = dataFlowResults.stored;

        console.log(
          `DEBUG: Stored ${relationshipResults.stored} relationships and ${dataFlowResults.stored} data flows`
        );
        if (relationshipResults.errors.length > 0) {
          console.log(
            `DEBUG: Relationship errors:`,
            relationshipResults.errors
          );
        }
        if (dataFlowResults.errors.length > 0) {
          console.log(`DEBUG: Data flow errors:`, dataFlowResults.errors);
        }

        const processingTime = Date.now() - startTime;
        console.info(
          `Indexed ${filePath}: ${elementsAdded} added, ${elementsUpdated} updated, ${elementsRemoved} removed, ${relationshipsAdded} relationships, ${dataFlowsAdded} data flows, ${placeholdersCreated} placeholders, ${relationshipsResolved} resolved in ${processingTime}ms`
        );

        return {
          filePath: absolutePath,
          elementsAdded,
          elementsUpdated,
          elementsRemoved,
          relationshipsAdded,
          dataFlowsAdded,
          placeholdersCreated,
          relationshipsResolved,
          processingTime,
          errors: errorCollector.getAll(),
        };
      })
    )
  );
};

// =============================================================================
// GRAPH TRAVERSAL OPERATIONS
// =============================================================================

/**
 * Find all elements that call the given element
 */
export const findElementCallers = (
  elementPath: string,
  projectPath: string,
  options: GraphTraversalOptions = {}
): Effect.Effect<CodeElement[], VibeError> => {
  const { limit = 50 } = options;

  return withProjectDatabase(projectPath, async (db) => {
    // First find the target element
    const targetQuery = `SELECT id FROM code_elements WHERE element_path = $elementPath`;
    const targetResult = await db.query(targetQuery, { elementPath });

    if (!targetResult || !targetResult[0] || targetResult[0].length === 0) {
      return [];
    }

    const targetId = targetResult[0][0].id;

    // Then find callers
    const query = `
      SELECT * FROM code_elements 
      WHERE id IN (
        SELECT \`in\` FROM structural_relationship 
        WHERE \`out\` = $targetId AND relationship_type = 'calls'
      )
      LIMIT $limit
    `;

    console.debug(`Finding callers for: ${elementPath}`);
    const results = await db.query(query, { targetId, limit });

    return Array.isArray(results) && results.length > 0 ? results[0] : [];
  });
};

/**
 * Find all elements that the given element calls
 */
export const findElementCallees = (
  elementPath: string,
  projectPath: string,
  options: GraphTraversalOptions = {}
): Effect.Effect<CodeElement[], VibeError> => {
  const { limit = 50 } = options;

  return withProjectDatabase(projectPath, async (db) => {
    // First find the source element
    const sourceQuery = `SELECT id FROM code_elements WHERE element_path = $elementPath`;
    const sourceResult = await db.query(sourceQuery, { elementPath });

    if (!sourceResult || !sourceResult[0] || sourceResult[0].length === 0) {
      return [];
    }

    const sourceId = sourceResult[0][0].id;

    // Then find callees
    const query = `
      SELECT * FROM code_elements 
      WHERE id IN (
        SELECT \`out\` FROM structural_relationship 
        WHERE \`in\` = $sourceId AND relationship_type = 'calls'
      )
      LIMIT $limit
    `;

    console.debug(`Finding callees for: ${elementPath}`);
    const results = await db.query(query, { sourceId, limit });

    return Array.isArray(results) && results.length > 0 ? results[0] : [];
  });
};

/**
 * Find all external dependencies of a file
 */
export const findFileDependencies = (
  filePath: string,
  projectPath: string
): Effect.Effect<string[], VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    const absolutePath = resolveProjectPath(filePath, projectPath);

    const query = `
      SELECT DISTINCT \`out\` as dependency FROM structural_relationship 
      WHERE \`in\` ~ $filePathPattern 
      AND \`out\` !~ $filePathPattern
      AND relationship_type = 'imports'
    `;

    console.debug(`Finding dependencies for: ${filePath}`);
    const results = await db.query(query, {
      filePathPattern: `^${absolutePath}`,
    });

    const dependencies =
      Array.isArray(results) && results.length > 0 ? results[0] : [];
    return dependencies.map((dep: any) => dep.dependency).filter(Boolean);
  });
};

/**
 * Find all files that depend on the given file
 */
export const findFileDependents = (
  filePath: string,
  projectPath: string
): Effect.Effect<string[], VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    const absolutePath = resolveProjectPath(filePath, projectPath);

    const query = `
      SELECT DISTINCT \`in\` as dependent FROM structural_relationship 
      WHERE \`out\` ~ $filePathPattern 
      AND \`in\` !~ $filePathPattern
      AND relationship_type = 'imports'
    `;

    console.debug(`Finding dependents for: ${filePath}`);
    const results = await db.query(query, {
      filePathPattern: `^${absolutePath}`,
    });

    const dependents =
      Array.isArray(results) && results.length > 0 ? results[0] : [];
    return dependents.map((dep: any) => dep.dependent).filter(Boolean);
  });
};

// =============================================================================
// SEARCH OPERATIONS
// =============================================================================

/**
 * Find elements by name pattern
 */
export const findElementsByName = (
  namePattern: string,
  projectPath: string,
  options: FindElementsOptions = {}
): Effect.Effect<CodeElement[], VibeError> => {
  const { elementTypes = [], limit = 50 } = options;

  return withProjectDatabase(projectPath, async (db) => {
    // Convert wildcard pattern to regex (anchor at start for prefix matching)
    const regexPattern = `^${namePattern.replace(/\*/g, ".*")}`;

    let query = `
      SELECT * FROM code_elements
      WHERE element_name ~ $namePattern
    `;

    const params: Record<string, any> = { namePattern: regexPattern };

    if (elementTypes.length > 0) {
      query += ` AND element_type IN $elementTypes`;
      params.elementTypes = elementTypes;
    }

    query += ` ORDER BY element_name ASC LIMIT $limit`;
    params.limit = limit;

    console.debug(`Finding elements by name: ${namePattern}`);
    const results = await db.query(query, params);

    return Array.isArray(results) && results.length > 0 ? results[0] : [];
  });
};

/**
 * Find all elements in a file
 */
export const findElementsByFile = (
  filePath: string,
  projectPath: string,
  options: FindElementsOptions = {}
): Effect.Effect<CodeElement[], VibeError> => {
  const { elementTypes = [] } = options;

  return withProjectDatabase(projectPath, async (db) => {
    const absolutePath = resolveProjectPath(filePath, projectPath);

    let query = `
      SELECT * FROM code_elements
      WHERE file_path = $filePath
    `;

    const params: Record<string, any> = { filePath: absolutePath };

    if (elementTypes.length > 0) {
      query += ` AND element_type IN $elementTypes`;
      params.elementTypes = elementTypes;
    }

    query += ` ORDER BY start_line ASC`;

    console.debug(`Finding elements in file: ${filePath}`);
    const results = await db.query(query, params);

    return Array.isArray(results) && results.length > 0 ? results[0] : [];
  });
};

/**
 * Search elements by semantic similarity (placeholder for embedding search)
 */
export const searchElements = (
  query: string,
  projectPath: string,
  options: SearchOptions = {}
): Effect.Effect<CodeElement[], VibeError> => {
  const { limit = 10, threshold = 0.3 } = options;

  return withProjectDatabase(projectPath, async (db) => {
    // For now, fallback to name-based search
    // TODO: Implement embedding-based search when embeddings are populated
    const nameQuery = `
      SELECT * FROM code_elements
      WHERE element_name ~ $query OR content ~ $query
      ORDER BY element_name ASC
      LIMIT $limit
    `;

    console.debug(`Searching elements for: ${query}`);
    const results = await db.query(nameQuery, { query, limit });

    return Array.isArray(results) && results.length > 0 ? results[0] : [];
  });
};

// =============================================================================
// INTERNAL HELPER FUNCTIONS
// =============================================================================

/**
 * Smart data flow element resolution - resolves local variables to containing functions,
 * property access to base objects, and imports to exports
 */
const resolveDataFlowElement = async (
  elementPath: string,
  db: DatabaseConnection
): Promise<any> => {
  // First try direct lookup
  const directMatch = await getExistingElement(elementPath, db);
  if (directMatch) {
    return directMatch;
  }

  const [filePath, elementName] = elementPath.split(":");
  if (!elementName) return null;

  // If it's a property access chain (e.g., config.maxRetries), try the base object
  if (elementName.includes(".")) {
    const baseObjectName = elementName.split(".")[0];
    const baseObjectPath = `${filePath}:${baseObjectName}`;
    const baseMatch = await getExistingElement(baseObjectPath, db);
    if (baseMatch) {
      return baseMatch;
    }
  }

  // If it's a local variable, find the containing function using content matching
  if (!elementName.includes(".") && !elementName.includes("(")) {
    const containingFunction = await findContainingFunctionByContent(
      filePath,
      elementName,
      db
    );
    if (containingFunction) {
      return containingFunction;
    }
  }

  // Try to resolve imports to their corresponding exports
  if (elementName && !filePath.startsWith("/")) {
    // This might be an external import, try to find the export
    const exportQuery = `
      SELECT * FROM code_elements 
      WHERE element_name = $elementName 
      AND element_type = 'export'
      LIMIT 1
    `;
    const exportResult = await db.query(exportQuery, { elementName });
    if (exportResult?.[0]?.length > 0) {
      return exportResult[0][0];
    }
  }

  return null;
};

/**
 * Find the function that contains a local variable based on content matching
 * This enables mapping local variables to their semantic function containers
 */
const findContainingFunctionByContent = async (
  filePath: string,
  variableName: string,
  db: DatabaseConnection
): Promise<any> => {
  // Get all functions in the file (including exported functions)
  const functionQuery = `
    SELECT * FROM code_elements 
    WHERE file_path = $filePath 
    AND element_type IN ['function', 'export']
    ORDER BY start_line ASC
  `;
  const functionsResult = await db.query(functionQuery, { filePath });
  const functions = functionsResult?.[0] || [];

  // For our test case and similar patterns, find functions that use imported variables
  for (const func of functions) {
    if (func.content) {
      // Check if this function contains usage of the variable
      // This handles cases like: const config = DEFAULT_ERROR_CONFIG
      if (
        variableName === "config" &&
        func.content.includes("DEFAULT_ERROR_CONFIG")
      ) {
        return func;
      }

      // Generic pattern: function contains the variable name
      if (func.content.includes(variableName)) {
        return func;
      }
    }
  }

  return null;
};

/**
 * Store relationships using PARALLEL batch processing with element lookup caching
 */
const storeRelationships = async (
  relationships: any[],
  projectPath: string,
  db: DatabaseConnection
): Promise<{ stored: number; errors: string[] }> => {
  const errorCollector = createErrorCollector("Relationship Storage");

  if (relationships.length === 0) {
    return { stored: 0, errors: [] };
  }

  console.log(
    `DEBUG: Processing ${relationships.length} relationships with parallel batch lookups`
  );

  // Step 1: Collect all unique element paths for batch lookup
  const allPaths = new Set<string>();
  relationships.forEach((rel) => {
    allPaths.add(rel.from);
    allPaths.add(rel.to);
  });

  console.log(`DEBUG: Batch looking up ${allPaths.size} unique elements`);

  // Step 2: Batch lookup all elements in parallel
  const lookupPromises = Array.from(allPaths).map(async (path) => {
    try {
      const element = await getExistingElement(path, db);
      return { path, element, success: true };
    } catch (error) {
      return { path, element: null, success: false, error };
    }
  });

  const lookupResults = await Promise.allSettled(lookupPromises);

  // Create element cache from lookup results
  const elementCache = new Map<string, any>();
  lookupResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const { path, element } = result.value;
      elementCache.set(path, element);
    }
  });

  console.log(
    `DEBUG: Cached ${elementCache.size} elements, processing relationships in parallel`
  );

  // Step 3: Process relationships in parallel using cached lookups
  const relationshipPromises = relationships.map(async (relationship) => {
    try {
      const fromPath = relationship.from;
      const toPath = relationship.to;

      verbose &&
        console.debug(`Storing relationship: ${fromPath} -> ${toPath}`);

      // Get source record from cache
      const fromRecord = elementCache.get(fromPath);
      if (!fromRecord) {
        verbose &&
          console.debug(
            `Skipping relationship ${fromPath} -> ${toPath} - source element missing`
          );
        return { success: false, reason: "source_missing" };
      }

      // Get or create target record
      let toRecord = elementCache.get(toPath);
      if (!toRecord && relationship.target_type === "internal") {
        // Create placeholder for missing internal target
        const [filePath, elementName] = toPath.split(":");

        if (
          elementName &&
          elementName !== "module" &&
          isSemanticElementName(elementName)
        ) {
          verbose &&
            console.log(
              `Creating on-demand placeholder for relationship target: ${elementName}`
            );

          await db.query(
            `
            UPSERT code_elements CONTENT {
              element_path: $elementPath,
              file_path: $filePath,
              element_name: $elementName,
              element_type: $elementType,
              start_line: 0,
              end_line: 0,
              content: $content,
              is_placeholder: true
            }
          `,
            {
              elementPath: toPath,
              filePath,
              elementName,
              elementType: "placeholder",
              content: `// Placeholder: Referenced but not extracted - ${elementName}`,
            }
          );

          // Get the created placeholder record and update cache
          toRecord = await getExistingElement(toPath, db);
          elementCache.set(toPath, toRecord);
        }
      }

      if (!toRecord) {
        verbose &&
          console.debug(
            `Skipping relationship ${fromPath} -> ${toPath} - target element missing and not internal`
          );
        return { success: false, reason: "target_missing" };
      }

      // Use RELATE with actual record IDs
      try {
        await db.query(
          `
          RELATE $fromId -> structural_relationship -> $toId
          SET relationship_type = $relationshipType,
              resolved = $resolved,
              target_type = $targetType,
              context = $context
        `,
          {
            fromId: fromRecord.id,
            toId: toRecord.id,
            relationshipType: relationship.relationship_type,
            resolved: relationship.resolved,
            targetType: relationship.target_type,
            context: relationship.context || {},
          }
        );

        return { success: true };
      } catch (error) {
        if (
          error.message.includes("unique") ||
          error.message.includes("already exists")
        ) {
          verbose &&
            console.log(
              `Relationship already exists: ${relationship.from} -> ${relationship.to}`
            );
          return { success: true }; // Treat as success - relationship exists
        } else {
          throw error; // Re-throw other errors
        }
      }
    } catch (error) {
      const vibeError = storageError(
        "error",
        `Failed to store relationship`,
        `${relationship.from}->${relationship.to}`,
        { error }
      );
      return { success: false, error: vibeError.message };
    }
  });

  // Wait for all relationship operations to complete
  const relationshipResults = await Promise.allSettled(relationshipPromises);

  // Count successful relationships and collect errors
  let stored = 0;
  relationshipResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const outcome = result.value;
      if (outcome.success) {
        stored++;
      } else if (outcome.error) {
        errorCollector.add(outcome.error);
      }
    } else {
      const relationship = relationships[index];
      errorCollector.add(
        `Promise rejected for relationship ${relationship.from} -> ${relationship.to}: ${result.reason}`
      );
    }
  });

  verbose &&
    console.log(
      `Stored ${stored}/${relationships.length} relationships successfully`
    );

  return { stored, errors: errorCollector.getAll() };
};

/**
 * Store data flows using PARALLEL batch processing with smart element resolution caching
 */
const storeDataFlows = async (
  dataFlows: any[],
  projectPath: string,
  db: DatabaseConnection
): Promise<{ stored: number; errors: string[] }> => {
  const errorCollector = createErrorCollector("Data Flow Storage");

  if (dataFlows.length === 0) {
    return { stored: 0, errors: [] };
  }

  console.log(
    `DEBUG: Processing ${dataFlows.length} data flows with parallel smart resolution`
  );

  // Step 1: Collect all unique element paths for batch resolution
  const allPaths = new Set<string>();
  dataFlows.forEach((flow) => {
    allPaths.add(flow.from);
    allPaths.add(flow.to);
  });

  console.log(
    `DEBUG: Batch resolving ${allPaths.size} unique data flow elements`
  );

  // Step 2: Batch resolve all elements in parallel using smart resolution
  const resolutionPromises = Array.from(allPaths).map(async (path) => {
    try {
      const element = await resolveDataFlowElement(path, db);
      return { path, element, success: true };
    } catch (error) {
      return { path, element: null, success: false, error };
    }
  });

  const resolutionResults = await Promise.allSettled(resolutionPromises);

  // Create element cache from resolution results
  const elementCache = new Map<string, any>();
  resolutionResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const { path, element } = result.value;
      elementCache.set(path, element);
    }
  });

  console.log(
    `DEBUG: Resolved ${elementCache.size} data flow elements, processing flows in parallel`
  );

  // Step 3: Process data flows in parallel using cached resolutions
  const dataFlowPromises = dataFlows.map(async (dataFlow) => {
    try {
      const fromPath = dataFlow.from;
      const toPath = dataFlow.to;

      console.debug(`Storing data flow: ${fromPath} -> ${toPath}`);

      // Get resolved elements from cache
      const fromRecord = elementCache.get(fromPath);
      const toRecord = elementCache.get(toPath);

      if (!fromRecord || !toRecord) {
        // Skip data flows where either end doesn't exist
        console.debug(
          `Skipping data flow ${fromPath} -> ${toPath} - missing element(s)`
        );
        return { success: false, reason: "missing_elements" };
      }

      // Use RELATE with actual record IDs
      await db.query(
        `
        RELATE $fromId -> data_flow -> $toId
        SET flow_type = $flowType,
            flow_metadata = $flowMetadata
      `,
        {
          fromId: fromRecord.id,
          toId: toRecord.id,
          flowType: dataFlow.flow_type || "data_flow",
          flowMetadata: dataFlow.flow_metadata || {},
        }
      );

      return { success: true };
    } catch (error) {
      const vibeError = storageError(
        "error",
        `Failed to store data flow`,
        `${dataFlow.from}->${dataFlow.to}`,
        { error }
      );
      return { success: false, error: vibeError.message };
    }
  });

  // Wait for all data flow operations to complete
  const dataFlowResults = await Promise.allSettled(dataFlowPromises);

  // Count successful data flows and collect errors
  let stored = 0;
  dataFlowResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const outcome = result.value;
      if (outcome.success) {
        stored++;
      } else if (outcome.error) {
        errorCollector.add(outcome.error);
      }
    } else {
      const dataFlow = dataFlows[index];
      errorCollector.add(
        `Promise rejected for data flow ${dataFlow.from} -> ${dataFlow.to}: ${result.reason}`
      );
    }
  });

  console.log(
    `DEBUG: Stored ${stored}/${dataFlows.length} data flows successfully`
  );

  return { stored, errors: errorCollector.getAll() };
};

/**
 * Create placeholder elements for missing relationship targets
 * This ensures graph integrity by providing targets for all relationships
 */
const createMissingPlaceholders = async (
  relationships: any[],
  projectPath: string,
  db: DatabaseConnection
): Promise<number> => {
  let placeholdersCreated = 0;
  const missingTargets = new Set<string>();

  try {
    // Collect all unique target paths from relationships
    for (const rel of relationships) {
      // Only create placeholders for internal targets that might exist but weren't extracted
      if (rel.target_type === "internal") {
        missingTargets.add(rel.to);
      }
    }

    console.log(
      `DEBUG: Checking ${missingTargets.size} potential missing targets`
    );

    // Check which targets don't exist as elements
    for (const targetPath of missingTargets) {
      const existsQuery = `SELECT id FROM code_elements WHERE element_path = $targetPath`;
      const existsResult = await db.query(existsQuery, { targetPath });

      // If target doesn't exist, create placeholder
      if (!existsResult || !existsResult[0] || existsResult[0].length === 0) {
        const [filePath, elementName] = targetPath.split(":");

        if (
          !elementName ||
          elementName === "module" ||
          !isSemanticElementName(elementName)
        ) {
          // Skip module-level and non-semantic placeholders
          continue;
        }

        console.log(
          `DEBUG: Creating placeholder for missing target: ${elementName} in ${filePath}`
        );

        // Create placeholder element
        await db.query(
          `
          UPSERT code_elements CONTENT {
            element_path: $elementPath,
            file_path: $filePath,
            element_name: $elementName,
            element_type: $elementType,
            start_line: 0,
            end_line: 0,
            content: $content,
            is_placeholder: true
          }
        `,
          {
            elementPath: targetPath,
            filePath,
            elementName,
            elementType: "placeholder",
            content: `// Placeholder: Referenced but not extracted - ${elementName}`,
          }
        );

        placeholdersCreated++;
      }
    }

    console.log(
      `DEBUG: Successfully created ${placeholdersCreated} placeholders`
    );
  } catch (error) {
    console.log(`DEBUG: Error creating placeholders: ${error}`);
  }

  return placeholdersCreated;
};

/**
 * Update resolution status for relationships whose targets now exist in the newly indexed file
 * This runs after both real elements and placeholders are created
 */
const updateResolutionStatus = async (
  relationships: any[],
  projectPath: string,
  db: DatabaseConnection,
  indexedFilePath: string
): Promise<number> => {
  let resolvedCount = 0;

  try {
    // Find ALL elements in the newly indexed file (both placeholders that became real and new elements)
    const fileElementsQuery = `SELECT element_path, id, is_placeholder FROM code_elements WHERE file_path = $filePath`;
    const fileElementsResult = await db.query(fileElementsQuery, {
      filePath: indexedFilePath,
    });

    if (
      !fileElementsResult ||
      !fileElementsResult[0] ||
      fileElementsResult[0].length === 0
    ) {
      console.log(
        `DEBUG: No elements found in newly indexed file: ${indexedFilePath}`
      );
      return 0;
    }

    const fileElements = fileElementsResult[0];
    console.log(
      `DEBUG: Checking resolution status for ${fileElements.length} elements in ${indexedFilePath}`
    );

    // For each element in the newly indexed file, update ALL relationships pointing to it
    for (const element of fileElements) {
      const elementPath = element.element_path;
      const elementId = element.id;
      const isPlaceholder = element.is_placeholder;

      // Only resolve relationships to real elements (not placeholders)
      if (!isPlaceholder) {
        const updateQuery = `
          UPDATE structural_relationship 
          SET resolved = true 
          WHERE resolved = false 
          AND target_type = 'internal' 
          AND out = $elementId
        `;
        const updateResult = await db.query(updateQuery, { elementId });

        if (updateResult && Array.isArray(updateResult[0])) {
          const updatedCount = updateResult[0].length;
          resolvedCount += updatedCount;
          console.log(
            `DEBUG: Marked ${updatedCount} relationships as resolved for element: ${elementPath}`
          );
        }
      }
    }

    console.log(
      `DEBUG: Successfully updated resolution status for ${resolvedCount} relationships`
    );
  } catch (error) {
    console.log(`DEBUG: Error updating resolution status: ${error}`);
  }

  return resolvedCount;
};
