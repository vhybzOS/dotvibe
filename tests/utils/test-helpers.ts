/**
 * Test Utilities and Helpers
 *
 * Shared utilities for comprehensive testing of infra/ast and infra/storage modules
 *
 * @tested_by tests/utils/test-helpers.test.ts
 */

import { assertEquals } from "@std/assert";
import Surreal from "surrealdb";
import type {
  CodeElementData,
  CodeElement,
  RelationshipData,
  DataFlowRelationshipData,
} from "../../src/infra/storage/types.ts";

// =============================================================================
// TEST DATABASE UTILITIES
// =============================================================================

/**
 * Create a test database instance with unique namespace
 */
export const createTestDatabase = async (
  testName: string
): Promise<Surreal> => {
  const db = new Surreal();

  // Use memory database for tests
  await db.connect("memory");

  // Use unique namespace and database for this test
  const namespace = `test_${testName}_${Date.now()}`;
  const database = "dotvibe_test";

  await db.use({ namespace, database });

  return db;
};

/**
 * Initialize test database schema
 */
export const initTestDatabaseSchema = async (db: Surreal): Promise<void> => {
  // Create code_elements table
  await db.query(`
    DEFINE TABLE code_elements SCHEMAFULL;
    DEFINE FIELD file_path ON TABLE code_elements TYPE string;
    DEFINE FIELD element_name ON TABLE code_elements TYPE string;
    DEFINE FIELD element_type ON TABLE code_elements TYPE string;
    DEFINE FIELD content ON TABLE code_elements TYPE string;
    DEFINE FIELD start_line ON TABLE code_elements TYPE int;
    DEFINE FIELD end_line ON TABLE code_elements TYPE int;
    DEFINE FIELD start_column ON TABLE code_elements TYPE option<int>;
    DEFINE FIELD end_column ON TABLE code_elements TYPE option<int>;
    DEFINE FIELD content_hash ON TABLE code_elements TYPE option<string>;
    DEFINE FIELD description ON TABLE code_elements TYPE option<string>;
    DEFINE FIELD metadata ON TABLE code_elements TYPE option<object>;
    DEFINE FIELD visibility ON TABLE code_elements TYPE option<string>;
    DEFINE FIELD exported ON TABLE code_elements TYPE option<bool>;
    DEFINE FIELD async ON TABLE code_elements TYPE option<bool>;
    DEFINE FIELD parameters ON TABLE code_elements TYPE option<array>;
    DEFINE FIELD return_type ON TABLE code_elements TYPE option<string>;
    
    DEFINE INDEX idx_code_elements_file_path ON TABLE code_elements COLUMNS file_path;
    DEFINE INDEX idx_code_elements_element_name ON TABLE code_elements COLUMNS element_name;
    DEFINE INDEX idx_code_elements_element_type ON TABLE code_elements COLUMNS element_type;
  `);

  // Create relationships table
  await db.query(`
    DEFINE TABLE relationships SCHEMAFULL;
    DEFINE FIELD from ON TABLE relationships TYPE string;
    DEFINE FIELD to ON TABLE relationships TYPE string;
    DEFINE FIELD relationship_type ON TABLE relationships TYPE string;
    DEFINE FIELD resolved ON TABLE relationships TYPE bool;
    DEFINE FIELD target_type ON TABLE relationships TYPE string;
    DEFINE FIELD context ON TABLE relationships TYPE option<object>;
    DEFINE FIELD semantic_description ON TABLE relationships TYPE option<string>;
    
    DEFINE INDEX idx_relationships_from ON TABLE relationships COLUMNS from;
    DEFINE INDEX idx_relationships_to ON TABLE relationships COLUMNS to;
    DEFINE INDEX idx_relationships_relationship_type ON TABLE relationships COLUMNS relationship_type;
  `);

  // Create dataflow_relationships table
  await db.query(`
    DEFINE TABLE dataflow_relationships SCHEMAFULL;
    DEFINE FIELD from ON TABLE dataflow_relationships TYPE string;
    DEFINE FIELD to ON TABLE dataflow_relationships TYPE string;
    DEFINE FIELD data_flow_type ON TABLE dataflow_relationships TYPE string;
    DEFINE FIELD pattern_type ON TABLE dataflow_relationships TYPE option<string>;
    DEFINE FIELD flow_context ON TABLE dataflow_relationships TYPE option<object>;
    DEFINE FIELD description ON TABLE dataflow_relationships TYPE option<string>;
    
    DEFINE INDEX idx_dataflow_relationships_from ON TABLE dataflow_relationships COLUMNS from;
    DEFINE INDEX idx_dataflow_relationships_to ON TABLE dataflow_relationships COLUMNS to;
    DEFINE INDEX idx_dataflow_relationships_data_flow_type ON TABLE dataflow_relationships COLUMNS data_flow_type;
  `);
};

/**
 * Cleanup test database
 */
export const cleanupTestDatabase = async (db: Surreal): Promise<void> => {
  await db.close();
};

// =============================================================================
// TEST FILE CREATORS
// =============================================================================

/**
 * Create a temporary test file with specified content
 */
export const createTestFile = (content: string, fileName: string): string => {
  const tempDir = "/tmp/dotvibe-tests";
  const filePath = `${tempDir}/${fileName}`;

  try {
    Deno.mkdirSync(tempDir, { recursive: true });
    Deno.writeTextFileSync(filePath, content);
    return filePath;
  } catch (error) {
    throw new Error(`Failed to create test file ${filePath}: ${error}`);
  }
};

/**
 * Create a temporary test directory structure
 */
export const createTestDirectory = (
  structure: Record<string, string>
): string => {
  const tempDir = `/tmp/dotvibe-tests/${Date.now()}`;

  try {
    Deno.mkdirSync(tempDir, { recursive: true });

    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = `${tempDir}/${filePath}`;
      const dir = fullPath.split("/").slice(0, -1).join("/");

      if (dir !== tempDir) {
        Deno.mkdirSync(dir, { recursive: true });
      }

      Deno.writeTextFileSync(fullPath, content);
    }

    return tempDir;
  } catch (error) {
    throw new Error(`Failed to create test directory ${tempDir}: ${error}`);
  }
};

/**
 * Cleanup test files and directories
 */
export const cleanupTestFiles = (path: string): void => {
  try {
    Deno.removeSync(path, { recursive: true });
  } catch (error) {
    console.warn(`Failed to cleanup test files at ${path}: ${error}`);
  }
};

// =============================================================================
// MOCK DATA GENERATORS
// =============================================================================

/**
 * Generate mock code elements for testing
 */
export const generateMockElements = (count: number): CodeElementData[] => {
  const elements: CodeElementData[] = [];

  for (let i = 0; i < count; i++) {
    elements.push({
      file_path: `/test/file${i}.ts`,
      element_name: `element${i}`,
      element_type:
        i % 3 === 0 ? "function" : i % 3 === 1 ? "class" : "variable",
      content: `// Mock element ${i}\nexport const element${i} = () => {}`,
      start_line: i * 10,
      end_line: i * 10 + 5,
      start_column: 0,
      end_column: 20,
      exported: i % 2 === 0,
      visibility: "public",
      async: i % 4 === 0,
      parameters: i % 2 === 0 ? [`param${i}`] : undefined,
      return_type: i % 3 === 0 ? "void" : undefined,
      content_hash: `hash_${i}`,
      description: `Mock element ${i}`,
      metadata: { generated: true, index: i },
    });
  }

  return elements;
};

/**
 * Generate mock relationships for testing
 */
export const generateMockRelationships = (
  elementCount: number
): RelationshipData[] => {
  const relationships: RelationshipData[] = [];

  for (let i = 0; i < elementCount - 1; i++) {
    relationships.push({
      from: `/test/file${i}.ts:element${i}`,
      to: `/test/file${i + 1}.ts:element${i + 1}`,
      relationship_type: "calls",
      resolved: true,
      target_type: "internal",
      context: { line: i * 10, column: 0 },
      semantic_description: `element${i} calls element${i + 1}`,
    });
  }

  return relationships;
};

/**
 * Generate mock data flow relationships for testing
 */
export const generateMockDataFlows = (
  elementCount: number
): DataFlowRelationshipData[] => {
  const dataFlows: DataFlowRelationshipData[] = [];

  for (let i = 0; i < elementCount - 1; i++) {
    dataFlows.push({
      from: `/test/file${i}.ts:element${i}`,
      to: `/test/file${i + 1}.ts:element${i + 1}`,
      flow_type: "assignment",
      flow_metadata: {
        pattern_type: "variable_assignment",
        flow_context: { line: i * 10, column: 0 },
        description: `Data flows from element${i} to element${i + 1}`,
      },
    });
  }

  return dataFlows;
};

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Assert that two code elements are equal
 */
export const assertElementsEqual = (
  actual: CodeElement[],
  expected: CodeElement[]
): void => {
  assertEquals(
    actual.length,
    expected.length,
    "Element arrays should have same length"
  );

  for (let i = 0; i < actual.length; i++) {
    const actualEl = actual[i]!;
    const expectedEl = expected[i]!;

    assertEquals(
      actualEl.file_path,
      expectedEl.file_path,
      `Element ${i} file_path should match`
    );
    assertEquals(
      actualEl.element_name,
      expectedEl.element_name,
      `Element ${i} element_name should match`
    );
    assertEquals(
      actualEl.element_type,
      expectedEl.element_type,
      `Element ${i} element_type should match`
    );
  }
};

/**
 * Assert that two relationship arrays are equal
 */
export const assertRelationshipsEqual = (
  actual: RelationshipData[],
  expected: RelationshipData[]
): void => {
  assertEquals(
    actual.length,
    expected.length,
    "Relationship arrays should have same length"
  );

  for (let i = 0; i < actual.length; i++) {
    const actualRel = actual[i]!;
    const expectedRel = expected[i]!;

    assertEquals(
      actualRel.from,
      expectedRel.from,
      `Relationship ${i} from should match`
    );
    assertEquals(
      actualRel.to,
      expectedRel.to,
      `Relationship ${i} to should match`
    );
    assertEquals(
      actualRel.relationship_type,
      expectedRel.relationship_type,
      `Relationship ${i} relationship_type should match`
    );
  }
};

// =============================================================================
// TIMING UTILITIES
// =============================================================================

/**
 * Measure execution time of an async function
 */
export const measureTime = async <T>(
  fn: () => Promise<T>
): Promise<{ result: T; timeMs: number }> => {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();

  return {
    result,
    timeMs: endTime - startTime,
  };
};

/**
 * Assert that execution time is within acceptable bounds
 */
export const assertExecutionTime = (
  timeMs: number,
  maxMs: number,
  operation: string
): void => {
  if (timeMs > maxMs) {
    throw new Error(
      `${operation} took ${timeMs.toFixed(2)}ms, expected under ${maxMs}ms`
    );
  }
};

// =============================================================================
// ERROR TESTING UTILITIES
// =============================================================================

/**
 * Assert that a promise rejects with a specific error type
 */
export const assertRejectsWithType = async <T>(
  fn: () => Promise<T>,
  errorType: string,
  message?: string
): Promise<void> => {
  try {
    await fn();
    throw new Error("Expected function to reject but it resolved");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Expected function to reject")) {
        throw error;
      }
      if (message && !error.message.includes(message)) {
        throw new Error(
          `Expected error message to contain "${message}", got: ${error.message}`
        );
      }
    }
  }
};
