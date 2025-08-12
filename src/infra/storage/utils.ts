/**
 * Storage System Utilities
 *
 * Utility functions for path resolution, data processing, and helper operations.
 *
 * @tested_by tests/core/storage-utils.test.ts
 */

import { createError } from "../errors.ts";
import type { DatabaseConnection, RelationshipData } from "./types.ts";

// Create subsystem-specific error creators
const configError = createError("configuration");

// =============================================================================
// PROJECT & PATH UTILITIES
// =============================================================================

/**
 * Find project root by searching up directory tree for .vibe folder
 */
export function findProjectRoot(startPath: string = Deno.cwd()): string {
  let currentPath = startPath;

  while (currentPath !== "/") {
    try {
      const vibeDir = `${currentPath}/.vibe`;
      const stat = Deno.statSync(vibeDir);
      if (stat.isDirectory) {
        return currentPath;
      }
    } catch {
      // Continue searching up
    }

    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }

  throw configError(
    "error",
    `No .vibe directory found in ${startPath} or any parent directory`,
    startPath
  );
}

/**
 * Resolve file path relative to project root
 */
export const resolveProjectPath = (
  filePath: string,
  projectPath: string
): string => {
  if (filePath.startsWith("/")) {
    return filePath;
  }
  return `${projectPath}/${filePath}`;
};

/**
 * Extract file path from element path for proper file attribution
 * Handles both internal (file:element) and external (module:element) paths
 */
export const extractFilePathFromElementPath = (elementPath: string): string => {
  const colonIndex = elementPath.lastIndexOf(":");
  return colonIndex === -1 ? elementPath : elementPath.substring(0, colonIndex);
};

// =============================================================================
// DATA PROCESSING UTILITIES
// =============================================================================

/**
 * Create current timestamp for SurrealDB
 */
export const now = (): Date => new Date();

/**
 * Generate content hash for element
 */
export const generateContentHash = (content: string): string => {
  // Simple hash function - in production, use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
};

/**
 * Classify relationship target as internal (our code) or external (libraries/builtins)
 */
export const classifyTarget = (
  targetPath: string,
  projectPath: string
): "internal" | "external" => {
  // Internal: Our own code (should be resolvable)
  if (targetPath.startsWith(projectPath)) {
    return "internal";
  }
  // External: Libraries, builtins, APIs (accept as-is)
  return "external";
};

/**
 * Process raw AST relationship data into enhanced relationship with resolution tracking
 */
export const processRelationship = (
  rawRelationship: import("../ast.ts").RelationshipData,
  projectPath: string
): RelationshipData => {
  const targetType = classifyTarget(rawRelationship.to, projectPath);

  return {
    from: rawRelationship.from,
    to: rawRelationship.to,
    relationship_type: rawRelationship.relationship_type,
    resolved: targetType === "external", // External targets are resolved by default
    target_type: targetType,
    context: rawRelationship.context as Record<string, any>,
    semantic_description: rawRelationship.semantic_description,
  };
};

// =============================================================================
// DATABASE UTILITIES
// =============================================================================

/**
 * Get existing element record by path - returns null if not found
 * This enforces that relationships only connect existing semantic elements
 */
export const getExistingElement = async (
  elementPath: string,
  db: DatabaseConnection
): Promise<any> => {
  const result = await db.query(
    `
    SELECT * FROM code_elements WHERE element_path = $elementPath LIMIT 1
  `,
    { elementPath }
  );

  return Array.isArray(result) &&
    result.length > 0 &&
    result[0] &&
    Array.isArray(result[0]) &&
    result[0].length > 0
    ? result[0][0]
    : null;
};

/**
 * Check if an element name looks like a semantic element worth creating a placeholder for
 * Filters out expressions, literals, and other non-semantic targets
 */
export const isSemanticElementName = (elementName: string): boolean => {
  // Skip obvious non-semantic patterns
  if (
    // Skip expressions and complex code
    elementName.includes("(") ||
    elementName.includes(")") ||
    elementName.includes("=>") ||
    elementName.includes("{") ||
    elementName.includes("}") ||
    elementName.includes("\n") ||
    // Skip literals and strings
    elementName.startsWith("'") ||
    elementName.startsWith('"') ||
    elementName.startsWith("`") ||
    elementName.includes("\\") ||
    // Skip template strings and complex expressions
    elementName.includes("${") ||
    elementName.includes("\\$") ||
    // Skip property access chains
    (elementName.includes(".") && elementName.split(".").length > 2) ||
    // Skip very short or very long names (likely generated)
    elementName.length < 2 ||
    elementName.length > 50
  ) {
    return false;
  }

  // Allow simple identifiers and property access
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.\w+)?$/.test(elementName);
};
