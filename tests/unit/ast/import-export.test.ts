/**
 * AST Import/Export Handling Unit Tests
 *
 * Tests for module relationship parsing and resolution.
 * Covers import/export syntax parsing, module name extraction,
 * relative vs absolute path resolution, and edge cases.
 *
 * @tested_by This file tests src/infra/ast/utils.ts import/export handling functions
 */

import {
  assertEquals,
  assertExists,
  assertArrayIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import {
  extractModuleName,
  extractImportNames,
  resolveImportPath,
  generateStorageElementId,
  generateRelationshipId,
} from "../../../src/infra/ast/utils.ts";

describe("AST Import/Export Handling Tests", () => {
  describe("Module Name Extraction", () => {
    it("should extract module names from various import styles", () => {
      // Test default import
      const defaultImport = {
        namedChildren: [
          { type: "import_clause", text: "Parser" },
          { type: "string", text: "'web-tree-sitter'" },
        ],
      };

      // Test named import
      const namedImport = {
        namedChildren: [
          { type: "import_clause", text: "{ Parser, Language }" },
          { type: "string", text: '"@std/testing"' },
        ],
      };

      // Test namespace import
      const namespaceImport = {
        namedChildren: [
          { type: "import_clause", text: "* as fs" },
          { type: "string", text: "'node:fs'" },
        ],
      };

      // Test side-effect import
      const sideEffectImport = {
        namedChildren: [{ type: "string", text: "'./side-effects.js'" }],
      };

      assertEquals(extractModuleName(defaultImport), "web-tree-sitter");
      assertEquals(extractModuleName(namedImport), "@std/testing");
      assertEquals(extractModuleName(namespaceImport), "node:fs");
      assertEquals(extractModuleName(sideEffectImport), "./side-effects.js");
    });

    it("should handle missing or malformed module paths", () => {
      // Test import without string literal
      const noStringNode = {
        namedChildren: [
          { type: "import_clause", text: "Parser" },
          { type: "identifier", text: "someVariable" },
        ],
      };

      // Test import with no children
      const noChildren = {
        namedChildren: undefined,
      };

      // Test empty children array
      const emptyChildren = {
        namedChildren: [],
      };

      assertEquals(extractModuleName(noStringNode), null);
      assertEquals(extractModuleName(noChildren), null);
      assertEquals(extractModuleName(emptyChildren), null);
    });

    it("should clean quotes from module names", () => {
      const singleQuotes = {
        namedChildren: [{ type: "string", text: "'react'" }],
      };

      const doubleQuotes = {
        namedChildren: [{ type: "string", text: '"lodash"' }],
      };

      const backticks = {
        namedChildren: [{ type: "string", text: "`template-literal`" }],
      };

      assertEquals(extractModuleName(singleQuotes), "react");
      assertEquals(extractModuleName(doubleQuotes), "lodash");
      // extractModuleName only removes single and double quotes, not backticks
      assertEquals(extractModuleName(backticks), "`template-literal`");
    });
  });

  describe("Import Names Extraction", () => {
    it("should extract default import names", () => {
      const defaultImportNode = {
        namedChildren: [
          {
            type: "import_clause",
            namedChildren: [{ type: "identifier", text: "Parser" }],
          },
        ],
      };

      const names = extractImportNames(defaultImportNode);
      assertArrayIncludes(names, ["Parser"]);
    });

    it("should extract named import names", () => {
      const namedImportNode = {
        namedChildren: [
          {
            type: "import_clause",
            namedChildren: [
              {
                type: "named_imports",
                namedChildren: [
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "Parser" }],
                  },
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "Language" }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const names = extractImportNames(namedImportNode);
      assertArrayIncludes(names, ["Parser", "Language"]);
      assertEquals(names.length, 2);
    });

    it("should extract namespace import names", () => {
      const namespaceImportNode = {
        namedChildren: [
          {
            type: "import_clause",
            namedChildren: [
              {
                type: "namespace_import",
                namedChildren: [{ type: "identifier", text: "fs" }],
              },
            ],
          },
        ],
      };

      const names = extractImportNames(namespaceImportNode);
      assertArrayIncludes(names, ["fs"]);
    });

    it("should handle mixed import styles", () => {
      const mixedImportNode = {
        namedChildren: [
          {
            type: "import_clause",
            namedChildren: [
              { type: "identifier", text: "React" }, // default
              {
                type: "named_imports",
                namedChildren: [
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "useState" }],
                  },
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "useEffect" }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const names = extractImportNames(mixedImportNode);
      assertArrayIncludes(names, ["React", "useState", "useEffect"]);
      assertEquals(names.length, 3);
    });

    it("should handle malformed import structures", () => {
      const malformedNode = {
        namedChildren: [
          { type: "string", text: "'module'" }, // no import_clause
        ],
      };

      const emptyNode = {
        namedChildren: [],
      };

      assertEquals(extractImportNames(malformedNode).length, 0);
      assertEquals(extractImportNames(emptyNode).length, 0);
    });
  });

  describe("Import Path Resolution", () => {
    it("should handle relative import resolution", () => {
      // Test same directory (./)
      const sameDirResult = resolveImportPath(
        "./helper",
        "/project/src/utils/main.ts"
      );
      assertEquals(sameDirResult, "/project/src/utils/helper");

      // Test parent directory (../)
      const parentDirResult = resolveImportPath(
        "../config",
        "/project/src/utils/main.ts"
      );
      assertEquals(parentDirResult, "/project/src/config");

      // Test multiple parent directories
      const multiParentResult = resolveImportPath(
        "../../lib/parser",
        "/project/src/utils/main.ts"
      );
      assertEquals(multiParentResult, "/project/lib/parser");
    });

    it("should handle absolute import paths", () => {
      const absolutePath = "/absolute/path/to/module";
      const result = resolveImportPath(absolutePath, "/any/current/file.ts");
      assertEquals(result, absolutePath);
    });

    it("should handle non-relative module names", () => {
      // Test npm package
      const npmPackage = resolveImportPath(
        "react",
        "/project/src/component.ts"
      );
      assertEquals(npmPackage, "react");

      // Test scoped package
      const scopedPackage = resolveImportPath(
        "@std/testing",
        "/project/tests/test.ts"
      );
      assertEquals(scopedPackage, "@std/testing");

      // Test node built-in
      const nodeBuiltin = resolveImportPath(
        "node:fs",
        "/project/src/file.ts"
      );
      assertEquals(nodeBuiltin, "node:fs");
    });

    it("should handle complex relative paths", () => {
      // Test current directory reference
      const currentDir = resolveImportPath(
        "./src/./utils/helper",
        "/project/main.ts"
      );
      assertEquals(currentDir, "/project/src/utils/helper");

      // Test mixed relative navigation
      const mixedPath = resolveImportPath(
        "../src/../lib/parser",
        "/project/tests/test.ts"
      );
      assertEquals(mixedPath, "/project/lib/parser");
    });

    it("should handle edge cases in path resolution", () => {
      // Test empty path
      const emptyPath = resolveImportPath("", "/project/src/main.ts");
      assertEquals(emptyPath, "");

      // Test root directory navigation
      const rootNavigation = resolveImportPath(
        "../../../config",
        "/a/b/c/file.ts"
      );
      assertEquals(rootNavigation, "/config");

      // Test excessive parent navigation (should not break)
      const excessiveParents = resolveImportPath(
        "../../../../config",
        "/a/b/file.ts"
      );
      assertEquals(excessiveParents, "config");
    });
  });

  describe("Storage Element ID Generation", () => {
    it("should generate IDs for regular elements", () => {
      const regularElementId = generateStorageElementId(
        "/project/src/utils.ts",
        "myFunction"
      );
      assertEquals(regularElementId, "/project/src/utils.ts:myFunction");
    });

    it("should handle import statement IDs with module resolution", () => {
      // Mock import statement node
      const importNode = {
        type: "import_statement",
        namedChildren: [{ type: "string", text: "'../config'" }],
      };

      const importElementId = generateStorageElementId(
        "/project/src/main.ts",
        "CONFIG_VALUE",
        importNode
      );

      // Should resolve relative path and use module:element format
      assertEquals(importElementId, "/project/config:CONFIG_VALUE");
    });

    it("should handle import statements with npm packages", () => {
      const npmImportNode = {
        type: "import_statement",
        namedChildren: [{ type: "string", text: "'react'" }],
      };

      const npmElementId = generateStorageElementId(
        "/project/src/component.ts",
        "React",
        npmImportNode
      );

      assertEquals(npmElementId, "react:React");
    });

    it("should handle malformed import statements", () => {
      const malformedImportNode = {
        type: "import_statement",
        namedChildren: [], // no string literal
      };

      const fallbackId = generateStorageElementId(
        "/project/src/main.ts",
        "element",
        malformedImportNode
      );

      // Should fall back to regular file:element format
      assertEquals(fallbackId, "/project/src/main.ts:element");
    });
  });

  describe("Relationship ID Generation", () => {
    it("should generate consistent relationship IDs", () => {
      const relationshipId = generateRelationshipId(
        "/project/src/utils.ts",
        "helper"
      );
      assertEquals(relationshipId, "/project/src/utils.ts:helper");
    });

    it("should match element ID format", () => {
      const filePath = "/project/src/component.ts";
      const elementName = "MyComponent";

      const elementId = generateStorageElementId(filePath, elementName);
      const relationshipId = generateRelationshipId(filePath, elementName);

      assertEquals(elementId, relationshipId);
    });
  });

  describe("Edge Cases in Data Processing", () => {
    it("should handle unusual import syntax", () => {
      // Dynamic import (should return null for module name)
      const dynamicImport = {
        namedChildren: [
          { type: "call_expression", text: "import('./module')" },
        ],
      };

      assertEquals(extractModuleName(dynamicImport), null);
    });

    it("should handle special characters in paths", () => {
      const specialCharsPath = resolveImportPath(
        "./special-chars_file.module",
        "/project/src/main.ts"
      );
      assertEquals(specialCharsPath, "/project/src/special-chars_file.module");

      const unicodePath = resolveImportPath(
        "./测试模块",
        "/project/src/main.ts"
      );
      assertEquals(unicodePath, "/project/src/测试模块");
    });

    it("should handle long import paths", () => {
      const longPath = "./very/deeply/nested/directory/structure/module";
      const resolvedLongPath = resolveImportPath(
        longPath,
        "/project/src/main.ts"
      );
      assertEquals(
        resolvedLongPath,
        "/project/src/very/deeply/nested/directory/structure/module"
      );
    });

    it("should handle import names with special characters", () => {
      const specialNameImport = {
        namedChildren: [
          {
            type: "import_clause",
            namedChildren: [
              {
                type: "named_imports",
                namedChildren: [
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "$special_name" }],
                  },
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "_privateVar" }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const names = extractImportNames(specialNameImport);
      assertArrayIncludes(names, ["$special_name", "_privateVar"]);
    });

    it("should handle empty or whitespace-only import names", () => {
      const emptyNameImport = {
        namedChildren: [
          {
            type: "import_clause",
            namedChildren: [
              {
                type: "named_imports",
                namedChildren: [
                  {
                    type: "import_specifier",
                    namedChildren: [{ type: "identifier", text: "" }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const names = extractImportNames(emptyNameImport);
      // Should handle empty names gracefully
      assertExists(names);
      assertEquals(Array.isArray(names), true);
    });
  });
});