/**
 * AST Element Extraction Unit Tests
 *
 * Tests for AST node-to-element conversion and filtering.
 * Covers element identification, node type mapping, name extraction,
 * and filtering of internal/temporary elements.
 *
 * @tested_by This file tests src/infra/ast/utils.ts element extraction functions
 */

import {
  assertEquals,
  assertExists,
  assertArrayIncludes,
} from "@std/assert";
import { describe, it, beforeEach } from "@std/testing/bdd";

import {
  shouldExtractElement,
  isTopLevelDeclaration,
  mapNodeTypeToElementType,
  extractNameFromChildren,
  extractVisibility,
  isExported,
  isAsync,
  extractParameters,
  extractReturnType,
  generateSearchPhrases,
} from "../../../src/infra/ast/utils.ts";

describe("AST Element Extraction Tests", () => {
  describe("Element Identification", () => {
    it("should identify extractable elements correctly", () => {
      // Test various node types that should be extracted
      const extractableNodes = [
        { type: "function_declaration" },
        { type: "method_definition" },
        { type: "class_declaration" },
        { type: "interface_declaration" },
        { type: "type_alias_declaration" },
        { type: "enum_declaration" },
        { type: "import_statement" },
        { type: "export_statement" },
      ];

      extractableNodes.forEach((node) => {
        assertEquals(
          shouldExtractElement(node),
          true,
          `${node.type} should be extractable`
        );
      });
    });

    it("should skip internal/temporary elements", () => {
      // Test node types that should NOT be extracted
      const internalNodes = [
        { type: "identifier" },
        { type: "literal" },
        { type: "binary_expression" },
        { type: "call_expression" },
        { type: "property_identifier" },
        { type: "comment" },
        { type: "whitespace" },
        { type: "punctuation" },
      ];

      internalNodes.forEach((node) => {
        assertEquals(
          shouldExtractElement(node),
          false,
          `${node.type} should not be extractable`
        );
      });
    });

    it("should handle top-level vs nested declarations", () => {
      // Mock top-level variable declaration (no function parent)
      const topLevelVariable = {
        type: "variable_declaration",
        parent: {
          type: "program", // Top-level
          parent: null,
        },
      };

      // Mock nested variable declaration (inside function)
      const nestedVariable = {
        type: "variable_declaration",
        parent: {
          type: "function_declaration", // Inside function
          parent: {
            type: "program",
            parent: null,
          },
        },
      };

      assertEquals(
        shouldExtractElement(topLevelVariable),
        true,
        "Top-level variables should be extractable"
      );
      assertEquals(
        shouldExtractElement(nestedVariable),
        false,
        "Nested variables should not be extractable"
      );
    });

    it("should correctly identify top-level declarations", () => {
      // Test top-level node (no function/method parents)
      const topLevelNode = {
        parent: {
          type: "program",
          parent: null,
        },
      };

      // Test nested node (inside function)
      const nestedNode = {
        parent: {
          type: "function_declaration",
          parent: {
            type: "program",
            parent: null,
          },
        },
      };

      // Test deeply nested node (inside method inside class)
      const deeplyNestedNode = {
        parent: {
          type: "method_definition",
          parent: {
            type: "class_declaration",
            parent: {
              type: "program",
              parent: null,
            },
          },
        },
      };

      assertEquals(isTopLevelDeclaration(topLevelNode), true);
      assertEquals(isTopLevelDeclaration(nestedNode), false);
      assertEquals(isTopLevelDeclaration(deeplyNestedNode), false);
    });
  });

  describe("Node Type Mapping", () => {
    it("should map all node types to element types", () => {
      const nodeTypeMappings = [
        // Top-level declarations
        { nodeType: "function_declaration", elementType: "function" },
        { nodeType: "method_definition", elementType: "method" },
        { nodeType: "class_declaration", elementType: "class" },
        { nodeType: "interface_declaration", elementType: "interface" },
        { nodeType: "type_alias_declaration", elementType: "type" },
        { nodeType: "enum_declaration", elementType: "enum" },
        { nodeType: "variable_declaration", elementType: "variable" },
        { nodeType: "lexical_declaration", elementType: "variable" },
        { nodeType: "import_statement", elementType: "import" },
        { nodeType: "export_statement", elementType: "export" },

        // Expressions and statements
        { nodeType: "expression_statement", elementType: "expression" },
        { nodeType: "call_expression", elementType: "call" },
        { nodeType: "assignment_expression", elementType: "assignment" },
        { nodeType: "conditional_expression", elementType: "conditional" },
        { nodeType: "arrow_function", elementType: "function" },

        // Literals
        { nodeType: "string", elementType: "literal" },
        { nodeType: "number", elementType: "literal" },
        { nodeType: "boolean", elementType: "literal" },

        // Properties
        { nodeType: "property_identifier", elementType: "property" },
        { nodeType: "member_expression", elementType: "property" },
      ];

      nodeTypeMappings.forEach(({ nodeType, elementType }) => {
        assertEquals(
          mapNodeTypeToElementType(nodeType),
          elementType,
          `${nodeType} should map to ${elementType}`
        );
      });
    });

    it("should default to 'expression' for unknown node types", () => {
      const unknownTypes = [
        "unknown_node_type",
        "custom_syntax",
        "future_feature",
      ];

      unknownTypes.forEach((nodeType) => {
        assertEquals(mapNodeTypeToElementType(nodeType), "expression");
      });
    });
  });

  describe("Name Extraction", () => {
    it("should extract names from various node structures", () => {
      // Test identifier child
      const nodeWithIdentifier = {
        namedChildren: [
          { type: "identifier", text: "myFunction" },
          { type: "formal_parameters", text: "()" },
        ],
      };

      // Test type_identifier child
      const nodeWithTypeIdentifier = {
        namedChildren: [
          { type: "type_identifier", text: "MyClass" },
          { type: "class_body", text: "{}" },
        ],
      };

      // Test property_identifier child
      const nodeWithPropertyIdentifier = {
        namedChildren: [
          { type: "property_identifier", text: "myProperty" },
        ],
      };

      assertEquals(extractNameFromChildren(nodeWithIdentifier), "myFunction");
      assertEquals(extractNameFromChildren(nodeWithTypeIdentifier), "MyClass");
      assertEquals(
        extractNameFromChildren(nodeWithPropertyIdentifier),
        "myProperty"
      );
    });

    it("should handle missing or malformed names", () => {
      // Test node with no named children
      const nodeWithoutChildren = {
        namedChildren: undefined,
      };

      // Test node with children but no name-bearing children
      const nodeWithoutNameChildren = {
        namedChildren: [
          { type: "literal", text: "123" },
          { type: "punctuation", text: ";" },
        ],
      };

      // Test empty children array
      const nodeWithEmptyChildren = {
        namedChildren: [],
      };

      assertEquals(extractNameFromChildren(nodeWithoutChildren), null);
      assertEquals(extractNameFromChildren(nodeWithoutNameChildren), null);
      assertEquals(extractNameFromChildren(nodeWithEmptyChildren), null);
    });

    it("should prioritize first name-bearing child", () => {
      const nodeWithMultipleNames = {
        namedChildren: [
          { type: "identifier", text: "firstName" },
          { type: "identifier", text: "secondName" },
          { type: "type_identifier", text: "thirdName" },
        ],
      };

      assertEquals(
        extractNameFromChildren(nodeWithMultipleNames),
        "firstName"
      );
    });
  });

  describe("Element Property Extraction", () => {
    it("should extract visibility correctly", () => {
      const publicNode = { text: "public function test() {}" };
      const privateNode = { text: "private method() {}" };
      const protectedNode = { text: "protected getValue() {}" };
      const defaultNode = { text: "function defaultVisibility() {}" };

      assertEquals(extractVisibility(publicNode), "public");
      assertEquals(extractVisibility(privateNode), "private");
      assertEquals(extractVisibility(protectedNode), "protected");
      assertEquals(extractVisibility(defaultNode), "public"); // defaults to public
    });

    it("should detect exported elements", () => {
      const exportedFunction = {
        text: "export function test() {}",
        parent: null,
      };

      const exportStatement = {
        text: "function test() {}",
        parent: { type: "export_statement" },
      };

      const regularFunction = {
        text: "function test() {}",
        parent: { type: "program" },
      };

      assertEquals(isExported(exportedFunction), true);
      assertEquals(isExported(exportStatement), true);
      assertEquals(isExported(regularFunction), false);
    });

    it("should detect async elements", () => {
      const asyncFunction = { text: "async function fetchData() {}" };
      const syncFunction = { text: "function syncFunction() {}" };
      const asyncMethod = { text: "async getData() { return data; }" };

      assertEquals(isAsync(asyncFunction), true);
      assertEquals(isAsync(syncFunction), false);
      assertEquals(isAsync(asyncMethod), true);
    });

    it("should extract parameters from function nodes", () => {
      // Mock function node with parameters
      const functionWithParams = {
        type: "function_declaration",
        namedChildren: [
          { type: "identifier", text: "myFunction" },
          {
            type: "formal_parameters",
            namedChildren: [
              { type: "identifier", text: "param1" },
              { type: "required_parameter", text: "param2: string" },
            ],
          },
        ],
      };

      // Mock function without parameters
      const functionWithoutParams = {
        type: "function_declaration",
        namedChildren: [
          { type: "identifier", text: "myFunction" },
          {
            type: "formal_parameters",
            namedChildren: [],
          },
        ],
      };

      // Non-function node
      const variableNode = {
        type: "variable_declaration",
        namedChildren: [],
      };

      const params1 = extractParameters(functionWithParams);
      const params2 = extractParameters(functionWithoutParams);
      const params3 = extractParameters(variableNode);

      assertExists(params1);
      assertEquals(params1.length, 2);
      assertArrayIncludes(params1, ["param1", "param2: string"]);

      assertEquals(params2, undefined);
      assertEquals(params3, undefined);
    });

    it("should extract return types from function nodes", () => {
      // Mock function with return type
      const functionWithReturnType = {
        type: "function_declaration",
        namedChildren: [
          { type: "identifier", text: "myFunction" },
          { type: "formal_parameters", text: "()" },
          { type: "type_annotation", text: ": Promise<string>" },
        ],
      };

      // Mock function without return type
      const functionWithoutReturnType = {
        type: "function_declaration",
        namedChildren: [
          { type: "identifier", text: "myFunction" },
          { type: "formal_parameters", text: "()" },
        ],
      };

      // Non-function node
      const variableNode = {
        type: "variable_declaration",
      };

      assertEquals(
        extractReturnType(functionWithReturnType),
        "Promise<string>"
      );
      assertEquals(extractReturnType(functionWithoutReturnType), undefined);
      assertEquals(extractReturnType(variableNode), undefined);
    });
  });

  describe("Search Phrase Generation", () => {
    it("should generate basic search phrases", () => {
      const phrases = generateSearchPhrases("testFunction", "function", "");

      assertArrayIncludes(phrases, ["testFunction", "function testFunction"]);
    });

    it("should include contextual phrases based on content", () => {
      const asyncContent = "async function testFunction() {}";
      const exportContent = "export class TestClass {}";
      const privateContent = "private method() {}";

      const asyncPhrases = generateSearchPhrases(
        "testFunction",
        "function",
        asyncContent
      );
      const exportPhrases = generateSearchPhrases(
        "TestClass",
        "class",
        exportContent
      );
      const privatePhrases = generateSearchPhrases(
        "method",
        "method",
        privateContent
      );

      assertArrayIncludes(asyncPhrases, ["async testFunction"]);
      assertArrayIncludes(exportPhrases, ["export TestClass"]);
      assertArrayIncludes(privatePhrases, ["private method"]);
    });

    it("should add domain-specific phrases", () => {
      const testFunctionPhrases = generateSearchPhrases(
        "validateEmail",
        "function",
        ""
      );
      const authFunctionPhrases = generateSearchPhrases(
        "authenticateUser",
        "function",
        ""
      );
      const configPhrases = generateSearchPhrases("appConfig", "variable", "");

      assertArrayIncludes(testFunctionPhrases, ["validation"]);
      assertArrayIncludes(authFunctionPhrases, ["authentication"]);
      assertArrayIncludes(configPhrases, ["configuration"]);
    });

    it("should handle empty or minimal content", () => {
      const phrases = generateSearchPhrases("element", "variable", "");

      // Should always include at least the name and type
      assertArrayIncludes(phrases, ["element", "variable element"]);
      assertEquals(phrases.length >= 2, true);
    });
  });
});