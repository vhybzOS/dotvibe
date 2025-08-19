/**
 * AST Path Resolution Unit Tests
 *
 * Tests for WASM file path resolution and installation handling.
 * Covers development mode, compiled mode, user/system installations,
 * npm cache fallback, and error scenarios.
 *
 * @tested_by This file tests src/infra/ast/utils.ts path resolution functions
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";

import {
  resolveWasmPath,
  detectLanguage,
  LANGUAGE_CONFIGS,
} from "../../../src/infra/ast/utils.ts";

describe("AST Path Resolution Tests", () => {
  let originalImportMetaUrl: string;
  let originalHomeEnv: string | undefined;
  let mockFileSystem: Map<string, boolean>;

  beforeEach(() => {
    // Store original values
    originalImportMetaUrl = import.meta.url;
    originalHomeEnv = Deno.env.get("HOME");

    // Initialize mock file system
    mockFileSystem = new Map();

    // Mock Deno.stat to use our mock file system
    const originalStat = Deno.stat;
    (Deno as any).stat = async (path: string) => {
      if (mockFileSystem.get(path)) {
        return { isFile: true, isDirectory: false };
      }
      throw new Error(`ENOENT: no such file or directory '${path}'`);
    };

    // Mock Deno.readDir for version detection
    const originalReadDir = Deno.readDir;
    (Deno as any).readDir = async function* (path: string) {
      if (path.includes("/.local/dotvibe")) {
        yield { name: "0.4.3", isDirectory: true };
        yield { name: "0.4.5", isDirectory: true };
        yield { name: "0.4.4", isDirectory: true };
      } else if (path.includes("/usr/local/dotvibe")) {
        yield { name: "0.4.2", isDirectory: true };
        yield { name: "0.4.5", isDirectory: true };
      } else if (path.includes("tree-sitter-typescript")) {
        yield { name: "0.23.1", isDirectory: true };
        yield { name: "0.23.2", isDirectory: true };
      }
    };
  });

  afterEach(() => {
    // Restore original functions
    const originalStat = Deno.stat;
    const originalReadDir = Deno.readDir;

    // Restore environment
    if (originalHomeEnv) {
      Deno.env.set("HOME", originalHomeEnv);
    } else {
      Deno.env.delete("HOME");
    }
  });

  describe("Development Mode Path Resolution", () => {
    beforeEach(() => {
      // Mock development mode (file:// URL)
      Object.defineProperty(import.meta, "url", {
        value: "file:///Users/test/dotvibe/src/cli.ts",
        configurable: true,
      });
    });

    it("should resolve WASM path in development mode", async () => {
      // Setup: Mock WASM file in relative path
      mockFileSystem.set("./data/tree-sitter-typescript.wasm", true);

      const result = await resolveWasmPath("typescript");

      assertEquals(result, "./data/tree-sitter-typescript.wasm");
    });

    it("should try multiple relative paths in development", async () => {
      // Setup: Mock WASM file in parent directory
      mockFileSystem.set("../data/tree-sitter-typescript.wasm", true);

      const result = await resolveWasmPath("typescript");

      assertEquals(result, "../data/tree-sitter-typescript.wasm");
    });

    it("should try npm cache as fallback", async () => {
      // Setup: Set HOME environment and mock npm cache structure
      Deno.env.set("HOME", "/Users/test");
      const npmCachePath =
        "/Users/test/.cache/deno/npm/registry.npmjs.org/tree-sitter-typescript/0.23.2/tree-sitter-typescript.wasm";
      mockFileSystem.set(npmCachePath, true);

      const result = await resolveWasmPath("typescript");

      assertEquals(result, npmCachePath);
    });
  });

  describe("Compiled Mode Path Resolution", () => {
    it("should resolve WASM path in compiled mode", async () => {
      // Setup: Mock WASM file in relative path 
      mockFileSystem.set("./data/tree-sitter-typescript.wasm", true);

      const result = await resolveWasmPath("typescript", true); // Force compiled mode

      assertEquals(result, "./data/tree-sitter-typescript.wasm");
    });

    it("should not try user/system installations or npm cache in compiled mode", async () => {
      // Setup: No relative paths available, only user installation and npm cache
      Deno.env.set("HOME", "/Users/test");
      const userPath = "/Users/test/.local/dotvibe/0.4.5/data/tree-sitter-typescript.wasm";
      const npmCachePath =
        "/Users/test/.cache/deno/npm/registry.npmjs.org/tree-sitter-typescript/0.23.2/tree-sitter-typescript.wasm";
      
      mockFileSystem.set(userPath, true);
      mockFileSystem.set(npmCachePath, true);

      // Should throw error instead of finding user installation or npm cache
      await assertRejects(
        () => resolveWasmPath("typescript", true), // Force compiled mode
        Error,
        "Failed to find WASM file for typescript"
      );
    });
  });

  describe("User Installation Paths", () => {
    it("should handle user installation paths", async () => {
      // Setup: Mock user installation with latest version
      Deno.env.set("HOME", "/Users/test");
      const userPath =
        "/Users/test/.local/dotvibe/0.4.5/data/tree-sitter-typescript.wasm";
      mockFileSystem.set(userPath, true);

      const result = await resolveWasmPath("typescript");

      assertEquals(result, userPath);
    });

    it("should find latest version correctly", async () => {
      // Setup: Mock multiple versions, should pick latest (0.4.5)
      Deno.env.set("HOME", "/Users/test");
      const latestPath =
        "/Users/test/.local/dotvibe/0.4.5/data/tree-sitter-typescript.wasm";
      const olderPath =
        "/Users/test/.local/dotvibe/0.4.3/data/tree-sitter-typescript.wasm";

      mockFileSystem.set(latestPath, true);
      mockFileSystem.set(olderPath, true);

      const result = await resolveWasmPath("typescript");

      assertEquals(result, latestPath);
    });
  });

  describe("System Installation Paths", () => {
    it("should handle system installation paths", async () => {
      // Setup: Mock system installation
      const systemPath =
        "/usr/local/dotvibe/0.4.5/data/tree-sitter-typescript.wasm";
      mockFileSystem.set(systemPath, true);

      const result = await resolveWasmPath("typescript");

      assertEquals(result, systemPath);
    });

    it("should prefer user installation over system", async () => {
      // Setup: Mock both user and system installations
      Deno.env.set("HOME", "/Users/test");
      const userPath =
        "/Users/test/.local/dotvibe/0.4.5/data/tree-sitter-typescript.wasm";
      const systemPath =
        "/usr/local/dotvibe/0.4.5/data/tree-sitter-typescript.wasm";

      mockFileSystem.set(userPath, true);
      mockFileSystem.set(systemPath, true);

      const result = await resolveWasmPath("typescript");

      // Should prefer user installation
      assertEquals(result, userPath);
    });
  });

  describe("Error Handling", () => {
    it("should throw meaningful error when WASM not found", async () => {
      // Setup: No WASM files available anywhere

      await assertRejects(
        () => resolveWasmPath("typescript"),
        Error,
        "Failed to find WASM file for typescript"
      );
    });

    it("should include installation instructions in error", async () => {
      try {
        await resolveWasmPath("typescript");
      } catch (error) {
        assertEquals(
          (error as Error).message.includes(
            "curl -fsSL https://dotvibe.dev | sh"
          ),
          true,
          "Error should include installation instructions"
        );
      }
    });

    it("should handle permission errors", async () => {
      // Mock permission error by making Deno.stat throw specific error
      const originalStat = Deno.stat;
      (Deno as any).stat = async () => {
        throw new Error("EACCES: permission denied");
      };

      await assertRejects(
        () => resolveWasmPath("typescript"),
        Error,
        "Failed to find WASM file"
      );
    });

    it("should handle unsupported language", async () => {
      await assertRejects(
        () => resolveWasmPath("invalid-language"),
        Error,
        "Unsupported language: invalid-language"
      );
    });
  });

  describe("Language Detection", () => {
    it("should detect TypeScript files", () => {
      assertEquals(detectLanguage("test.ts"), "typescript");
      assertEquals(detectLanguage("test.tsx"), "typescript");
    });

    it("should detect JavaScript files", () => {
      assertEquals(detectLanguage("test.js"), "typescript");
      assertEquals(detectLanguage("test.jsx"), "typescript");
    });

    it("should default to typescript for unknown extensions", () => {
      assertEquals(detectLanguage("test.py"), "typescript");
      assertEquals(detectLanguage("test.unknown"), "typescript");
    });

    it("should handle files without extensions", () => {
      assertEquals(detectLanguage("Makefile"), "typescript");
      assertEquals(detectLanguage("README"), "typescript");
    });
  });

  describe("Language Configuration", () => {
    it("should have typescript configuration", () => {
      assertExists(LANGUAGE_CONFIGS.typescript);
      assertEquals(LANGUAGE_CONFIGS.typescript.name, "typescript");
      assertEquals(
        LANGUAGE_CONFIGS.typescript.wasmFile,
        "tree-sitter-typescript.wasm"
      );
    });

    it("should support multiple file extensions", () => {
      const config = LANGUAGE_CONFIGS.typescript;
      if (!config) throw new Error("Language config not found for typescript");
      assertEquals(config.extensions.includes(".ts"), true);
      assertEquals(config.extensions.includes(".tsx"), true);
      assertEquals(config.extensions.includes(".js"), true);
      assertEquals(config.extensions.includes(".jsx"), true);
    });

    it("should have required query patterns", () => {
      const config = LANGUAGE_CONFIGS.typescript;
      if (!config) throw new Error("Language config not found for typescript");
      assertExists(config.queries.symbols);
      assertExists(config.queries.imports);
      assertExists(config.queries.exports);
      assertExists(config.queries.comments);
      assertExists(config.queries.dataflow);
    });
  });
});
