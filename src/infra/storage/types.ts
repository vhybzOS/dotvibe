/**
 * Storage System Types & Interfaces
 *
 * Core data types and interfaces for the atomic graph storage system.
 *
 * @tested_by tests/core/storage-types.test.ts
 */

import type Surreal from "surrealdb";

// =============================================================================
// DATABASE TYPES
// =============================================================================

/**
 * Database connection type
 */
export type DatabaseConnection = Surreal;

// =============================================================================
// CORE DATA TYPES
// =============================================================================

/**
 * Core data types from data_specs.md
 */
export type ElementType =
  | "function"
  | "class"
  | "interface"
  | "variable"
  | "import"
  | "export"
  | "method"
  | "field"
  | "type"
  | "enum"
  | "block";
export type RelationshipType =
  | "calls"
  | "imports"
  | "extends"
  | "implements"
  | "contains"
  | "exports"
  | "uses";
export type DataFlowType =
  | "parameter_input"
  | "return_output"
  | "argument_passing"
  | "assignment"
  | "property_access"
  | "transformation"
  | "side_effect";

// =============================================================================
// STORAGE INTERFACES
// =============================================================================

/**
 * Code element data structure
 */
export interface CodeElementData {
  file_path: string;
  element_name: string;
  element_type: ElementType;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  content: string;
  content_hash?: string;
  description?: string;
  metadata?: Record<string, any>;
  visibility?: "public" | "private" | "protected";
  exported?: boolean;
  async?: boolean;
  parameters?: string[];
  return_type?: string;
}

/**
 * Enhanced relationship data structure with resolution tracking
 */
export interface RelationshipData {
  from: string;
  to: string;
  relationship_type: RelationshipType;
  resolved: boolean; // Is target confirmed to exist in our codebase?
  target_type: "internal" | "external"; // Classification of target
  context?: Record<string, any>;
  semantic_description?: string;
}

/**
 * Data flow relationship data structure
 */
export interface DataFlowRelationshipData {
  from: string;
  to: string;
  flow_type: DataFlowType;
  type_annotation?: string;
  flow_metadata?: Record<string, any>;
}

/**
 * Code element with database metadata
 */
export interface CodeElement extends CodeElementData {
  id: string;
  content_embedding?: number[]; // Optional - added by embeddings module
  semantic_embedding?: number[]; // Optional - added by embeddings module
  created_at: Date;
  updated_at: Date;
}

/**
 * Index operation result
 */
export interface IndexResult {
  filePath: string;
  elementsAdded: number;
  elementsUpdated: number;
  elementsRemoved: number;
  relationshipsAdded: number;
  dataFlowsAdded: number;
  placeholdersCreated: number;
  relationshipsResolved: number;
  processingTime: number;
  errors: string[];
}

// =============================================================================
// OPERATION OPTIONS
// =============================================================================

/**
 * Options for element search operations
 */
export interface FindElementsOptions {
  elementTypes?: ElementType[];
  limit?: number;
}

/**
 * Options for graph traversal operations
 */
export interface GraphTraversalOptions {
  limit?: number;
}

/**
 * Options for search operations
 */
export interface SearchOptions {
  limit?: number;
  threshold?: number;
}
