/**
 * Storage System CLI
 *
 * Command-line interface for testing and debugging storage operations.
 *
 * @tested_by tests/core/storage-cli.test.ts
 */

import { setCommandVerbose } from "../config.ts";
import { Storage, findProjectRoot } from "./index.ts";

/**
 * CLI command handler
 */
if (import.meta.main) {
  const args = Deno.args;
  const command = args[0];

  // Parse flags
  const projectPathArg = args.find((arg) => arg.startsWith("--project-path="));
  const projectPath = projectPathArg
    ? projectPathArg.split("=")[1]
    : findProjectRoot();

  if (!projectPath) {
    console.error("❌ Could not determine project path");
    Deno.exit(1);
  }

  const verboseFlag = args.includes("--verbose") || args.includes("-v");
  setCommandVerbose(verboseFlag);

  if (!command) {
    console.log(
      "Usage: deno run --allow-all src/infra/storage/cli.ts <command> [args] [options]"
    );
    console.log("Commands:");
    console.log(
      "  init-schema                    - Initialize database schema"
    );
    console.log(
      "  index-file <file>              - Index file to graph database"
    );
    console.log(
      "  find-callers <elementId>       - Find who calls this element"
    );
    console.log(
      "  find-callees <elementId>       - Find what this element calls"
    );
    console.log(
      "  find-dependencies <file>       - Find external dependencies"
    );
    console.log(
      "  find-dependents <file>         - Find files that depend on this file"
    );
    console.log(
      "  find-elements <pattern>        - Find elements by name pattern"
    );
    console.log("  find-file-elements <file>      - Find all elements in file");
    console.log(
      "  search <query>                 - Search elements by content"
    );
    console.log("");
    console.log("Options:");
    console.log("  --project-path=<path>          - Specify project root path");
    console.log("  --verbose, -v                  - Enable verbose output");
    Deno.exit(1);
  }

  const runCommand = async () => {
    const storage = new Storage(projectPath);
    
    try {
      switch (command) {
        case "init-schema": {
          await storage.initSchema(verboseFlag);
          console.log("✅ Database schema initialized successfully");
          break;
        }

        case "index-file": {
          const filePath = args[1];
          if (!filePath) {
            console.error("Usage: index-file <file>");
            Deno.exit(1);
          }

          const result = await storage.indexFile(filePath);
          console.log("📊 Index Result:");
          console.log(`   File: ${result.filePath}`);
          console.log(
            `   Elements: ${result.elementsAdded} added, ${result.elementsUpdated} updated, ${result.elementsRemoved} removed`
          );
          console.log(`   Relationships: ${result.relationshipsAdded}`);
          console.log(`   Data Flows: ${result.dataFlowsAdded}`);
          console.log(`   Processing Time: ${result.processingTime}ms`);
          if (result.errors.length > 0) {
            console.log(`   Errors: ${result.errors.length}`);
            result.errors.forEach((error) => console.log(`     - ${error}`));
          }
          break;
        }

        case "find-callers": {
          const elementId = args[1];
          if (!elementId) {
            console.error("Usage: find-callers <elementId>");
            Deno.exit(1);
          }

          const callers = await storage.findCallers(elementId);
          console.log(`📞 Found ${callers.length} callers for ${elementId}:`);
          for (const caller of callers) {
            console.log(
              `   ${caller.element_name} (${caller.element_type}) in ${caller.file_path}:${caller.start_line}`
            );
          }
          break;
        }

        case "find-callees": {
          const elementId = args[1];
          if (!elementId) {
            console.error("Usage: find-callees <elementId>");
            Deno.exit(1);
          }

          const callees = await storage.findCallees(elementId);
          console.log(`📱 Found ${callees.length} callees for ${elementId}:`);
          for (const callee of callees) {
            console.log(
              `   ${callee.element_name} (${callee.element_type}) in ${callee.file_path}:${callee.start_line}`
            );
          }
          break;
        }

        case "find-dependencies": {
          const filePath = args[1];
          if (!filePath) {
            console.error("Usage: find-dependencies <file>");
            Deno.exit(1);
          }

          const dependencies = await storage.findDependencies(filePath);
          console.log(
            `📦 Found ${dependencies.length} dependencies for ${filePath}:`
          );
          for (const dependency of dependencies) {
            console.log(`   ${dependency}`);
          }
          break;
        }

        case "find-dependents": {
          const filePath = args[1];
          if (!filePath) {
            console.error("Usage: find-dependents <file>");
            Deno.exit(1);
          }

          const dependents = await storage.findDependents(filePath);
          console.log(
            `🔗 Found ${dependents.length} dependents for ${filePath}:`
          );
          for (const dependent of dependents) {
            console.log(`   ${dependent}`);
          }
          break;
        }

        case "find-elements": {
          const pattern = args[1];
          if (!pattern) {
            console.error("Usage: find-elements <pattern>");
            Deno.exit(1);
          }

          const elements = await storage.findElements(pattern);
          console.log(
            `🔍 Found ${elements.length} elements matching ${pattern}:`
          );
          for (const element of elements) {
            console.log(
              `   ${element.element_name} (${element.element_type}) in ${element.file_path}:${element.start_line}`
            );
          }
          break;
        }

        case "find-file-elements": {
          const filePath = args[1];
          if (!filePath) {
            console.error("Usage: find-file-elements <file>");
            Deno.exit(1);
          }

          const elements = await storage.findFileElements(filePath);
          console.log(`📁 Found ${elements.length} elements in ${filePath}:`);
          for (const element of elements) {
            console.log(
              `   ${element.element_name} (${element.element_type}) ${element.start_line}:${element.end_line}`
            );
          }
          break;
        }

        case "search": {
          const query = args[1];
          if (!query) {
            console.error("Usage: search <query>");
            Deno.exit(1);
          }

          const elements = await storage.search(query);
          console.log(
            `🔍 Found ${elements.length} elements matching "${query}":`
          );
          for (const element of elements) {
            console.log(
              `   ${element.element_name} (${element.element_type}) in ${element.file_path}:${element.start_line}`
            );
          }
          break;
        }

        default: {
          console.error(`Unknown command: ${command}`);
          Deno.exit(1);
        }
      }
    } catch (error) {
      console.error(
        `❌ Error: ${error instanceof Error ? error.message : String(error)}`
      );
      Deno.exit(1);
    }
  };

  await runCommand();
}
