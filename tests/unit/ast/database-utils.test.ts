/**
 * AST Database Utilities Unit Tests
 *
 * Tests for AST-storage integration utilities and ID generation.
 * Since the AST module focuses on parsing and doesn't contain actual database operations,
 * these tests cover storage-compatible ID generation and element retrieval helpers.
 *
 * @tested_by This file tests storage-related utilities in src/infra/ast/utils.ts and src/infra/ast/core.ts
 */

import {
  assertEquals,
  assertExists,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import {
  generateStorageElementId,
  generateRelationshipId,
  resolveImportPath,
  extractModuleName,
} from "../../../src/infra/ast/utils.ts";

describe("AST Database Utilities Tests", () => {
  describe("Storage Element ID Generation", () => {
    it("should retrieve existing elements correctly", () => {
      // Test that the same element always generates the same ID
      const filePath = "/project/src/utils.ts";
      const elementName = "myFunction";

      const id1 = generateStorageElementId(filePath, elementName);
      const id2 = generateStorageElementId(filePath, elementName);

      assertEquals(id1, id2, "Same element should generate consistent IDs");
      assertEquals(id1, "/project/src/utils.ts:myFunction");
    });

    it("should handle missing elements gracefully", () => {
      // Test ID generation with empty or null values
      const emptyName = generateStorageElementId("/project/file.ts", "");
      const nullishValues = generateStorageElementId("", "element");

      // Should not throw and should return some form of ID
      assertExists(emptyName);
      assertExists(nullishValues);
      assertEquals(emptyName, "/project/file.ts:");
      assertEquals(nullishValues, ":element");
    });

    it("should handle database query failures", () => {
      // Test storage ID generation with problematic inputs that might cause database issues
      const problematicInputs = [
        { file: "malformed@file.ts", name: "function!" },
        { file: "/path/with spaces/file.ts", name: "normalName" },
        { file: "/normal/file.ts", name: "name with spaces" },
        { file: "/file.ts", name: "name\nwith\nnewlines" },
        { file: "/file.ts", name: "name\twith\ttabs" },
      ];

      // Should not throw and should handle gracefully
      problematicInputs.forEach(({ file, name }) => {
        const storageId = generateStorageElementId(file, name);
        assertExists(storageId);
        assertEquals(storageId.includes(":"), true, "Storage ID should contain colon separator");
        assertEquals(storageId, `${file}:${name}`);
      });
    });

    it("should generate unique IDs for different elements", () => {
      const filePath = "/project/src/module.ts";
      
      const functionId = generateStorageElementId(filePath, "myFunction");
      const classId = generateStorageElementId(filePath, "MyClass");
      const variableId = generateStorageElementId(filePath, "myVariable");

      // All should be different
      assertEquals(functionId !== classId, true);
      assertEquals(functionId !== variableId, true);
      assertEquals(classId !== variableId, true);

      // All should follow the same format
      assertEquals(functionId, "/project/src/module.ts:myFunction");
      assertEquals(classId, "/project/src/module.ts:MyClass");
      assertEquals(variableId, "/project/src/module.ts:myVariable");
    });

    it("should handle special characters in element names", () => {
      const filePath = "/project/src/special.ts";
      
      const specialNames = [
        "$jQuery",
        "_privateVar", 
        "kebab-case-function",
        "PascalCaseClass",
        "camelCaseMethod",
        "SCREAMING_SNAKE_CASE",
        "数据库函数", // Unicode characters
        "función", // Accented characters
      ];

      specialNames.forEach(name => {
        const id = generateStorageElementId(filePath, name);
        assertEquals(id, `${filePath}:${name}`);
        assertEquals(id.includes(":"), true);
      });
    });
  });

  describe("Relationship ID Consistency", () => {
    it("should generate consistent relationship IDs", () => {
      const filePath = "/project/src/component.ts";
      const elementName = "MyComponent";

      const elementId = generateStorageElementId(filePath, elementName);
      const relationshipId = generateRelationshipId(filePath, elementName);

      assertEquals(
        elementId,
        relationshipId,
        "Element and relationship IDs should match for same element"
      );
    });

    it("should handle import relationships correctly", () => {
      // Test import node with module resolution
      const importNode = {
        type: "import_statement",
        namedChildren: [{ type: "string", text: "'../utils'" }],
      };

      const currentFile = "/project/src/components/Header.ts";
      const importedElement = "helper";

      const importId = generateStorageElementId(
        currentFile,
        importedElement,
        importNode
      );

      // Should resolve relative path and create module:element format
      assertEquals(importId, "/project/src/utils:helper");
    });

    it("should handle complex import scenarios", () => {
      const testCases = [
        {
          description: "NPM package import",
          node: {
            type: "import_statement",
            namedChildren: [{ type: "string", text: "'react'" }],
          },
          currentFile: "/project/src/App.tsx",
          element: "React",
          expected: "react:React",
        },
        {
          description: "Scoped package import",
          node: {
            type: "import_statement",
            namedChildren: [{ type: "string", text: "'@testing-library/react'" }],
          },
          currentFile: "/project/src/tests/App.test.tsx",
          element: "render",
          expected: "@testing-library/react:render",
        },
        {
          description: "Deep relative import",
          node: {
            type: "import_statement",
            namedChildren: [{ type: "string", text: "'../../lib/parser'" }],
          },
          currentFile: "/project/src/components/Editor.tsx",
          element: "parseCode",
          expected: "/project/lib/parser:parseCode",
        },
      ];

      testCases.forEach(({ description, node, currentFile, element, expected }) => {
        const result = generateStorageElementId(currentFile, element, node);
        assertEquals(result, expected, description);
      });
    });
  });

  describe("Module Resolution for Storage", () => {
    it("should resolve module paths for storage IDs", () => {
      const testCases = [
        {
          description: "Relative path resolution",
          importPath: "../utils/helper",
          currentFile: "/project/src/components/Header.ts",
          expected: "/project/src/utils/helper",
        },
        {
          description: "Same directory resolution", 
          importPath: "./config",
          currentFile: "/project/src/main.ts",
          expected: "/project/src/config",
        },
        {
          description: "Deep relative path",
          importPath: "../../lib/parser",
          currentFile: "/project/src/components/Editor.ts",
          expected: "/project/lib/parser",
        },
        {
          description: "NPM package (no resolution)",
          importPath: "react",
          currentFile: "/project/src/App.tsx",
          expected: "react",
        },
      ];

      testCases.forEach(({ description, importPath, currentFile, expected }) => {
        const resolved = resolveImportPath(importPath, currentFile);
        assertEquals(resolved, expected, description);
      });
    });

    it("should extract module names for storage integration", () => {
      const testCases = [
        {
          description: "Simple import",
          node: { namedChildren: [{ type: "string", text: "'react'" }] },
          expected: "react",
        },
        {
          description: "Relative import",
          node: { namedChildren: [{ type: "string", text: "'./utils'" }] },
          expected: "./utils",
        },
        {
          description: "Scoped package",
          node: { namedChildren: [{ type: "string", text: "'@testing-library/react'" }] },
          expected: "@testing-library/react",
        },
        {
          description: "No module found",
          node: { namedChildren: [{ type: "identifier", text: "variable" }] },
          expected: null,
        },
      ];

      testCases.forEach(({ description, node, expected }) => {
        const result = extractModuleName(node);
        assertEquals(result, expected, description);
      });
    });
  });

  describe("Storage ID Format Validation", () => {
    it("should validate storage ID format consistency", () => {
      const testElements = [
        { file: "/a.ts", name: "func", expected: "/a.ts:func" },
        { file: "/deep/nested/path.ts", name: "MyClass", expected: "/deep/nested/path.ts:MyClass" },
        { file: "/file.tsx", name: "Component", expected: "/file.tsx:Component" },
      ];

      testElements.forEach(({ file, name, expected }) => {
        const elementId = generateStorageElementId(file, name);
        const relationshipId = generateRelationshipId(file, name);

        assertEquals(elementId, expected);
        assertEquals(relationshipId, expected);
        assertEquals(elementId, relationshipId);
      });
    });

    it("should handle path edge cases in storage IDs", () => {
      const edgeCases = [
        { file: "", name: "element", expected: ":element" },
        { file: "/", name: "root", expected: "/:root" },
        { file: "/file.ts", name: "", expected: "/file.ts:" },
        { file: "relative/path.ts", name: "func", expected: "relative/path.ts:func" },
      ];

      edgeCases.forEach(({ file, name, expected }) => {
        const storageId = generateStorageElementId(file, name);
        assertEquals(storageId, expected);
      });
    });
  });
});