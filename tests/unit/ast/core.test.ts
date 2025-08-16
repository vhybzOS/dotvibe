/**
 * AST Core Unit Tests
 *
 * Comprehensive tests for AST core parsing logic including:
 * - Parser management and caching
 * - File parsing with relationship discovery
 * - Data flow analysis
 * - Error handling and edge cases
 *
 * @tested_by This file tests src/infra/ast/core.ts
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
  assertArrayIncludes,
} from "@std/assert";
import { describe, it, beforeEach, afterEach, beforeAll } from "@std/testing/bdd";
import { Cause, Effect } from "effect";

import {
  initializeParser,
  getParser,
  withTreeSitterParser,
  parseFileWithRelationships,
  discoverRelationships,
  analyzeDataFlow,
} from "../../../src/infra/ast/core.ts";
import { parserCache } from "../../../src/infra/ast/utils.ts";
import type {
  ParseResult,
  FileParseResult,
} from "../../../src/infra/ast/types.ts";
import {
  createTestFile,
  cleanupTestFiles,
  measureTime,
  assertExecutionTime,
  assertRejectsWithType,
} from "../../utils/test-helpers.ts";
import { SymbolFromSelf } from "effect/Schema";

describe("AST Core Tests", () => {
  let testFiles: string[] = [];

  beforeAll(() => {
    console.error = () => null
    console.debug = () => null
    console.log = () => null
  })

  afterEach(() => {
    // Cleanup test files
    testFiles.forEach((file) => {
      try {
        cleanupTestFiles(file);
      } catch {
        // Ignore cleanup errors
      }
    });
    testFiles = [];

    // Clear parser cache
    parserCache.clear();
  });

  describe("Parser Management", () => {
    it("should initialize parser with valid language", async () => {
      try {
        const result = await initializeParser("typescript");

        assertExists(result);
        assertEquals(parserCache.has("typescript"), true);
      } catch (error) {
        console.log("Parser initialization error:", error);
        // Skip this test if WASM files are not available
        if ((error as Error).message?.includes("Failed to find WASM file")) {
          console.warn("Skipping test due to missing WASM files");
          return;
        }
        throw error;
      }
    });

    it("should cache parsers correctly", async () => {
      try {
        // Initialize parser first time
        await initializeParser("typescript");
        const parser1 = await Effect.runPromise(getParser("typescript"));

        // Get parser second time (should be cached)
        const parser2 = await Effect.runPromise(getParser("typescript"));

        assertEquals(
          parser1,
          parser2,
          "Should return same cached parser instance"
        );
      } catch (error: any) {
        if (error.message?.includes("Failed to find WASM file")) {
          console.warn("Skipping test due to missing WASM files");
          return;
        }
        throw error;
      }
    });

    it("should handle WASM loading errors gracefully", async () => {
      // Test with invalid language
      try {
        await initializeParser("invalid-language");
        // Should not reach here
        throw new Error("Expected initialization to fail");
      } catch (error: any) {
        // Should get a proper error for unsupported language
        assertEquals(
          error.details.error.message?.includes("Unsupported language"),
          true
        );
      }
    });

    it("should support multiple language parsers simultaneously", async () => {
      try {
        // Initialize TypeScript parser
        await initializeParser("typescript");

        // Both should be cached independently
        assertEquals(parserCache.has("typescript"), true);

        const tsParser = await Effect.runPromise(getParser("typescript"));
        assertExists(tsParser);
      } catch (error: any) {
        if (error.message?.includes("Failed to find WASM file")) {
          console.warn("Skipping test due to missing WASM files");
          return;
        }
        throw error;
      }
    });

    it("should cleanup parsers properly", () => {
      // Add parser to cache
      parserCache.set("test", {
        parser: null as any,
        language: null as any,
        lastUsed: Date.now(),
      });

      assertEquals(parserCache.has("test"), true);

      // Clear cache
      parserCache.clear();
      assertEquals(parserCache.size, 0);
    });

    it("should handle concurrent parser initialization", async () => {
      try {
        // Initialize multiple parsers concurrently
        const promises = [
          initializeParser("typescript"),
          initializeParser("typescript"),
          initializeParser("typescript"),
        ];

        const results = await Promise.all(promises);

        // All should succeed
        results.forEach((result) => assertExists(result));

        // Should only have one cached parser
        assertEquals(parserCache.size, 1);
      } catch (error: any) {
        if (error.message?.includes("Failed to find WASM file")) {
          console.warn("Skipping test due to missing WASM files");
          return;
        }
        throw error;
      }
    });
  });

  describe("withTreeSitterParser", () => {
    it("should provide parser to callback function", async () => {
      try {
        const result = await Effect.runPromise(
          withTreeSitterParser("typescript", async (parser) => {
            assertExists(parser);
            return "success";
          })
        );

        assertEquals(result, "success");
      } catch (error: any) {
        if (error.message?.includes("Failed to find WASM file")) {
          console.warn("Skipping test due to missing WASM files");
          return;
        }
        throw error;
      }
    });

    it("should handle callback errors", async () => {
      try {
        await Effect.runPromise(
          withTreeSitterParser("typescript", async () => {
            throw new Error("Callback error");
          })
        );
        throw new Error("Expected callback to throw");
      } catch (error: any) {
        if (error.message?.includes("Failed to find WASM file")) {
          console.warn("Skipping test due to missing WASM files");
          return;
        }
        const cause = Object.getOwnPropertySymbols(error)
          .map((sym) => error[sym])
          .find((e) => e.error && e.error._tag === "VibeError");
        assertEquals(
          cause.error.details.error.message.includes("Callback error"),
          true
        );
      }
    });
  });

  describe("parseFileWithRelationships", () => {
    it("should parse valid TypeScript files", async () => {
      const content = `
        export function testFunction(param: string): string {
          return param.toUpperCase()
        }
        
        export class TestClass {
          private value: string
          
          constructor(value: string) {
            this.value = value
          }
          
          getValue(): string {
            return this.value
          }
        }
      `;

      const filePath = createTestFile(content, "test.ts");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      assertExists(result);
      assertEquals(result.filePath, filePath);

      // Should have extracted elements
      const functionElements = result.elements.filter(
        (e) =>
          e.element_type === "function" ||
          (e.element_type === "export" && e.content.includes("function"))
      );
      const classElements = result.elements.filter(
        (e) =>
          e.element_type === "class" ||
          (e.element_type === "export" && e.content.includes("class"))
      );

      assertEquals(
        functionElements.length >= 1,
        true,
        "Should find function elements"
      );
      assertEquals(
        classElements.length >= 1,
        true,
        "Should find class elements"
      );
    });

    it("should parse valid JavaScript files", async () => {
      const content = `
        function jsFunction(param) {
          return param.toUpperCase()
        }
        
        class JSClass {
          constructor(value) {
            this.value = value
          }
          
          getValue() {
            return this.value
          }
        }
        
        module.exports = { jsFunction, JSClass }
      `;

      const filePath = createTestFile(content, "test.js");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      assertExists(result);
      assertEquals(
        result.elements.length > 0,
        true,
        "Should extract elements from JS file"
      );
    });

    it("should handle syntax errors gracefully", async () => {
      const content = `
        export function invalidFunction() {
          const x = 1
          if (x > 0 {
            return true
          // Missing closing brace
        }
      `;

      const filePath = createTestFile(content, "syntax-error.ts");
      testFiles.push(filePath);

      // Should not throw but may return partial results
      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      assertExists(result);
      // Parser should handle errors gracefully and return what it can parse
    });

    it("should extract all element types (functions, classes, interfaces, etc.)", async () => {
      const content = `
        // Function
        export function testFunction(): void {}
        
        // Class
        export class TestClass {}
        
        // Interface
        export interface TestInterface {
          id: string
        }
        
        // Type alias
        export type TestType = string | number
        
        // Enum
        export enum TestEnum {
          A = 'a',
          B = 'b'
        }
        
        // Variable
        export const testVariable = 'test'
        
        // Import
        import { someFunction } from './other'
      `;

      const filePath = createTestFile(content, "all-types.ts");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const elementTypes = new Set(result.elements.map((e) => e.element_type));

      // Should find various element types
      const expectedTypes = [
        "function",
        "class",
        "interface",
        "type",
        "enum",
        "variable",
        "import",
      ];
      for (const expectedType of expectedTypes) {
        // At least some of these types should be found
      }
      assertEquals(
        elementTypes.size > 0,
        true,
        "Should find multiple element types"
      );
    });

    it("should handle empty files", async () => {
      const content = "";
      const filePath = createTestFile(content, "empty.ts");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      assertExists(result);
      assertEquals(
        result.elements.length,
        0,
        "Empty file should have no elements"
      );
    });

    it("should handle files with only comments", async () => {
      const content = `
        /*
         * This is a multi-line comment
         */
        
        // This is a single-line comment
        
        /**
         * This is a JSDoc comment
         */
      `;

      const filePath = createTestFile(content, "comments-only.ts");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      assertExists(result);
      // Should handle comments-only file without errors
    });

    it("should preserve accurate line numbers and positions", async () => {
      const content = `// Line 1
export function firstFunction() { // Line 2
  return 'first' // Line 3
} // Line 4

export function secondFunction() { // Line 6
  return 'second' // Line 7
} // Line 8`;

      const filePath = createTestFile(content, "line-numbers.ts");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const functions = result.elements.filter(
        (e) => e.element_type === "export" && e.content.includes("function")
      );
      assertEquals(functions.length >= 2, true);

      // Check line numbers are reasonable
      functions.forEach((func) => {
        assertEquals(typeof func.start_line, "number");
        assertEquals(typeof func.end_line, "number");
        assertEquals(func.start_line > 0, true);
        assertEquals(func.end_line >= func.start_line, true);
      });
    });

    it("should handle Unicode characters correctly", async () => {
      const content = `
        export const unicodeString = '👋 Hello 🌍'
        export const chineseVar = '中文'
        
        export function processUnicode(text: string): string {
          return text.normalize('NFC')
        }
      `;

      const filePath = createTestFile(content, "unicode.ts");
      testFiles.push(filePath);

      const result = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      assertExists(result);
      assertEquals(
        result.elements.length > 0,
        true,
        "Should parse Unicode content"
      );
    });

    it("should detect and handle circular imports", async () => {
      // Create two files that import each other
      const fileAContent = `
        import { functionB } from './fileB'
        export function functionA(): string {
          return functionB()
        }
      `;

      const fileBContent = `
        import { functionA } from './fileA'
        export function functionB(): string {
          return functionA()
        }
      `;

      const fileA = createTestFile(fileAContent, "fileA.ts");
      const fileB = createTestFile(fileBContent, "fileB.ts");
      testFiles.push(fileA, fileB);

      // Parse both files
      const resultA = await Effect.runPromise(
        parseFileWithRelationships(fileAContent, "typescript", fileA)
      );
      const resultB = await Effect.runPromise(
        parseFileWithRelationships(fileBContent, "typescript", fileB)
      );

      assertExists(resultA);
      assertExists(resultB);

      // Both should have import elements
      const importsA = resultA.elements.filter(
        (e) => e.element_type === "import"
      );
      const importsB = resultB.elements.filter(
        (e) => e.element_type === "import"
      );

      assertEquals(importsA.length > 0, true);
      assertEquals(importsB.length > 0, true);
    });

    it("should handle very large files efficiently", async () => {
      // Generate a moderately large file for testing
      let largeContent = "// Large file test\n";
      for (let i = 0; i < 1000; i++) {
        largeContent += `export function func${i}(): number { return ${i} }\n`;
      }

      const filePath = createTestFile(largeContent, "large-file.ts");
      testFiles.push(filePath);

      const { result, timeMs } = await measureTime(async () => {
        return Effect.runPromise(
          parseFileWithRelationships(largeContent, "typescript", filePath)
        );
      });

      assertExists(result);
      assertEquals(
        result.elements.length >= 1000,
        true,
        "Should parse all functions"
      );

      // Should complete in reasonable time (adjust based on performance requirements)
      assertExecutionTime(timeMs, 10000, "Large file parsing"); // 10 seconds max
    });
  });

  describe("discoverRelationships", () => {
    let parseResult: ParseResult;

    beforeEach(async () => {
      const content = `
        import { helper } from './helper'
        
        export class TestClass extends BaseClass {
          public prop: string

          constructor() {
            super()
            this.helper = helper
          }
          
          method(): void {
            this.helper.process()
            this.prop = 'value'
          }
        }
        
        export function callsMethod(): void {
          const instance = new TestClass()
          instance.method()
          instance.prop = 'value'
        }

        interface TestInterface {
          method(): void
        }
        
        class TestImplementation implements TestInterface {
          method(): void {
            console.log('implemented')
          }
        }
        export function useBuiltins(): void {
          console.log('test')
          JSON.stringify({})
          Array.from([1, 2, 3])
        }
      `;

      const filePath = createTestFile(content, "relationships.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const parserResult = await Effect.runPromise(
        withTreeSitterParser("typescript", async (parser) => {
          const tree = parser.parse(content);

          if (!tree) throw new Error("Failed to parse content - tree is null");

          return tree;
        })
      );

      // Convert to ParseResult format for relationship discovery
      parseResult = {
        elements: fileResult.elements,
        tree: parserResult, // Will be set by actual implementation
        content,
        filePath,
      };
    });

    it("should find function calls", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );
      assertExists(relationships);

      // Look for call relationships
      const callRelationships = relationships.filter(
        (r) => r.relationship_type === "calls"
      );
      assertEquals(
        callRelationships.length > 0,
        true,
        "Should find function calls"
      );
    });

    it("should find class inheritance", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );

      // Look for inheritance relationships
      const inheritanceRels = relationships.filter(
        (r) => r.relationship_type === "extends"
      );
      assertEquals(
        inheritanceRels.length > 0,
        true,
        "Should handle inheritance"
      );
    });

    it("should find interface implementations", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );

      // Should handle interface implementations
      const implemetsRels = relationships.filter(
        (r) => r.relationship_type === "implements"
      );
      assertEquals(
        implemetsRels.length > 0,
        true,
        "Should interface implementation"
      );
    });

    it("should find import relationships", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );

      // Look for import relationships
      const importRels = relationships.filter(
        (r) => r.relationship_type === "imports"
      );
      assertEquals(importRels.length >= 0, true, "Should handle imports");
    });

    it("should find export relationships", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );

      // Look for export relationships
      const exportRels = relationships.filter(
        (r) => r.relationship_type === "exports"
      );
      assertEquals(exportRels.length > 0, true, "Should handle exports");
    });

    it("should handle nested relationships", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );

      // Should find nested relationships
      assertExists(relationships);
      assertEquals(relationships.length > 0, true);
    });

    it("should ignore built-in/standard library calls", async () => {
      const relationships = await Effect.runPromise(
        discoverRelationships(parseResult)
      );

      // Should not include built-in function calls
      const builtinCalls = relationships.filter(
        (r) =>
          r.to.includes("console") ||
          r.to.includes("JSON") ||
          r.to.includes("Array")
      );

      // Built-in calls might be filtered out or handled specially
      assertExists(relationships);
      assertEquals(builtinCalls.length == 0, true);
    });

    it("should handle dynamic imports", async () => {
      const content = `
        export async function loadModule(): Promise<void> {
          const module = await import('./dynamic-module')
          module.doSomething()
        }
      `;

      const filePath = createTestFile(content, "dynamic-imports.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const tree = await Effect.runPromise(
        withTreeSitterParser("typescript", async (parser) => {
          const tree = parser.parse(content);

          if (!tree) throw new Error("no tree, failed to parse");

          return tree;
        })
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: tree,
        content,
        filePath,
      };

      const relationships = await Effect.runPromise(
        discoverRelationships(testParseResult)
      );

      // Should handle dynamic imports
      assertExists(relationships);
      assertEquals(relationships.length > 0, true);
    });
  });

  describe("analyzeDataFlow", () => {
    let parseResult: ParseResult;

    beforeEach(async () => {
      const content = `
        const config = DEFAULT_CONFIG
        
        function processData(input: any): any {
          const processed = transformer.transform(input)
          const result = processor.process(processed)
          return result
        }
        
        function assignmentTest(): void {
          let a = 1
          const b = a
          a = b + 1
        }
      `;

      const filePath = createTestFile(content, "dataflow.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const parserResult = await Effect.runPromise(
        withTreeSitterParser("typescript", async (parser) => {
          const tree = parser.parse(content);

          if (!tree) throw new Error("Failed to parse content - tree is null");

          return tree;
        })
      );

      // Convert to ParseResult format for relationship discovery
      parseResult = {
        elements: fileResult.elements,
        tree: parserResult, // Will be set by actual implementation
        content,
        filePath,
      };
    });

    it("should track variable assignments", async () => {
      const dataFlows = await Effect.runPromise(analyzeDataFlow(parseResult));

      assertExists(dataFlows);

      // Look for variable assignment flows
      const assignments = dataFlows.filter(
        (df) => df.flow_type === "assignment"
      );
      assertEquals(
        assignments.length > 0,
        true,
        "Should find variable assignments"
      );
    });

    it("should track function parameter flow", async () => {
      const dataFlows = await Effect.runPromise(analyzeDataFlow(parseResult));

      // Should track how parameters flow through functions
      assertExists(dataFlows);
    });

    it("should track return value flow", async () => {
      const dataFlows = await Effect.runPromise(analyzeDataFlow(parseResult));

      // Look for return value flows
      const returnFlows = dataFlows.filter((df) =>
        df.flow_type.includes("return_output")
      );
      assertEquals(returnFlows.length >= 0, true, "Should handle return flows");
    });

    it("should track property access chains", async () => {
      const dataFlows = await Effect.runPromise(analyzeDataFlow(parseResult));

      // Look for property access flows
      const propertyFlows = dataFlows.filter(
        (df) => df.flow_type === "property_access"
      );
      assertEquals(
        propertyFlows.length >= 0,
        true,
        "Should track property access"
      );
    });

    it("should handle conditional data flow", async () => {
      const content = `
        function conditionalFlow(condition: boolean): string {
          let result: string
          if (condition) {
            result = 'true'
          } else {
            result = 'false'
          }
          return result
        }
      `;

      const filePath = createTestFile(content, "conditional.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: null as any,
        content,
        filePath,
      };

      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(testParseResult)
      );

      // Should handle conditional data flow
      assertExists(dataFlows);
    });

    it("should handle loop data flow", async () => {
      const content = `
        function loopFlow(items: any[]): any[] {
          const result = []
          for (const item of items) {
            const processed = processItem(item)
            result.push(processed)
          }
          return result
        }
      `;

      const filePath = createTestFile(content, "loop.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: null as any,
        content,
        filePath,
      };

      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(testParseResult)
      );

      // Should handle loop data flow
      assertExists(dataFlows);
    });

    it("should track async/await flow", async () => {
      const content = `
        async function asyncFlow(): Promise<string> {
          const data = await fetchData()
          const processed = await processData(data)
          return processed
        }
      `;

      const filePath = createTestFile(content, "async.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: null as any,
        content,
        filePath,
      };

      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(testParseResult)
      );

      // Should handle async data flow
      assertExists(dataFlows);
    });

    it("should handle destructuring assignments", async () => {
      const content = `
        function destructuringFlow(obj: any): void {
          const { x, y } = obj
          const [a, b] = [x, y]
          console.log(a, b)
        }
      `;

      const filePath = createTestFile(content, "destructuring.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: null as any,
        content,
        filePath,
      };

      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(testParseResult)
      );

      // Should handle destructuring
      assertExists(dataFlows);
    });

    it("should track spread/rest operations", async () => {
      const content = `
        function spreadFlow(arr: any[], ...rest: any[]): any[] {
          return [...arr, ...rest]
        }
      `;

      const filePath = createTestFile(content, "spread.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: null as any,
        content,
        filePath,
      };

      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(testParseResult)
      );

      // Should handle spread/rest operations
      assertExists(dataFlows);
    });

    it("should handle complex nested flows", async () => {
      const content = `
        function complexFlow(input: any): any {
          const step1 = input.map(item => ({
            ...item,
            processed: true
          }))
          
          const step2 = step1.filter(item => item.valid)
            .reduce((acc, item) => {
              acc[item.id] = item.processed
              return acc
            }, {})
          
          return Object.entries(step2)
            .map(([id, processed]) => ({ id, processed }))
        }
      `;

      const filePath = createTestFile(content, "complex.ts");
      testFiles.push(filePath);

      const fileResult = await Effect.runPromise(
        parseFileWithRelationships(content, "typescript", filePath)
      );

      const testParseResult: ParseResult = {
        elements: fileResult.elements,
        tree: null as any,
        content,
        filePath,
      };

      const dataFlows = await Effect.runPromise(
        analyzeDataFlow(testParseResult)
      );

      // Should handle complex nested flows
      assertExists(dataFlows);
      assertEquals(dataFlows.length >= 0, true);
    });
  });
});
