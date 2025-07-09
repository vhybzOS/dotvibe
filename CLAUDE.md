# dotvibe - Toolbox for Coding Agents

## 🎯 Project Overview

**dotvibe** is a toolbox for coding agents, providing them with superpowers through a collection of useful CLI tools. Our mission is to build practical utilities that enhance developer productivity and enable powerful agent workflows.

**First Tool**: `vibe query` - A context-aware code search that returns precise code snippets instead of loading entire files. Get 10 relevant lines instead of 1000-line files via intelligent pattern matching.

## 🔄 Core Protocols

### Protocol 1: Requirement Acquisition

**File: `prd.md`** - Product Requirements Document

**Purpose**: Structured requirement gathering and feature planning with user interaction.

**Workflow**:
1. **User Request**: User describes desired feature or improvement
2. **Requirement Extraction**: Break down request into structured requirements
3. **Back-and-forth Refinement**: Clarify requirements until implementation-ready
4. **Status Tracking**: planned → in-progress → completed

**Format**:
```markdown
## Feature: [Feature Name]
**Status**: [planned|in-progress|completed]
**Priority**: [high|medium|low]
**Created**: [timestamp]

### Description
[Clear description of what needs to be implemented]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Implementation Notes
[Technical approach, dependencies, considerations]

### User Stories
- As a [user], I want [functionality] so that [benefit]
```

### Protocol 2: Test Management

**File: `tests.md`** - Test Tracking Document

**Purpose**: Track test cases and @tested_by system for comprehensive coverage.

**Workflow**:
1. **Test Planning**: Map requirements from prd.md to test cases
2. **Test Implementation**: Create actual test files with @tested_by annotations
3. **Test Execution**: Track pass/fail status and coverage metrics
4. **Test Lifecycle**: created → implemented → passing → archived

**Format**:
```markdown
## Test: [Test Name]
**Status**: [created|implemented|passing|failing|archived]
**Priority**: [high|medium|low]
**Related Feature**: [Link to prd.md feature]

### Test Cases
- [ ] Test case 1
- [ ] Test case 2
- [ ] Test case 3

### @tested_by Coverage
```typescript
/**
 * @tested_by tests/query.test.ts (Natural language processing, context compression)
 * @tested_by tests/integration.test.ts (End-to-end query workflow)
 */
```

### Coverage Metrics
- Unit tests: [N/total]
- Integration tests: [N/total]
- Coverage percentage: [X%]
```

### Protocol 3: Feature Lifecycle Management

**Purpose**: Manage features from conception to completion with structured progression.

**Lifecycle States**:
1. **Planned**: Feature exists in prd.md with clear requirements
2. **In Progress**: Active development with tests.md tracking
3. **Completed**: Feature implemented, tests passing, ready for flush
4. **Released**: Feature flushed to CHANGELOG.md

**Commit Integration**:
- Structured commit messages referencing prd.md features
- Automatic status updates based on commit content
- Semantic versioning based on commit analysis
- Automatic version tagging for releases

**Semantic Versioning Rules**:
- **PATCH** (0.0.X): Bug fixes, minor improvements, documentation updates
- **MINOR** (0.X.0): New features, enhancements, backwards-compatible changes
- **MAJOR** (X.0.0): Breaking changes, API changes, architectural rewrites

**Commit Message Analysis**:
- `feat:` → MINOR version bump
- `fix:` → PATCH version bump
- `feat!:` or `BREAKING CHANGE:` → MAJOR version bump
- `docs:`, `test:`, `refactor:` → PATCH version bump

**Automated Release Workflow**:
1. Complete feature implementation
2. Verify all tests passing
3. **Auto-analyze commits** to determine version bump type
4. **Auto-update deno.json** with new version
5. Execute flush protocol with version information
6. **Auto-create git tag** with semantic version
7. **Auto-generate release notes** from changelog

### Protocol 4: Flush System (Multi-Stage Cleanup)

**Purpose**: Systematic cleanup and archival after feature completion.

**Stage 1 - Test Completion**:
- Delete completed test entries from tests.md
- Archive test files that are no longer needed
- Preserve @tested_by annotations in source code

**Stage 2 - Feature Completion**:
- Remove implemented features from prd.md
- Archive implementation notes and user stories
- Update feature status to completed

**Stage 3 - Automatic Versioning**:
- **Analyze git commits** since last release using conventional commit format
- **Calculate version bump** based on commit types (feat/fix/BREAKING CHANGE)
- **Update deno.json** with new semantic version
- **Create git tag** with new version (e.g., v1.2.3)

**Stage 4 - CHANGELOG.md Generation**:
- Create timestamped summary of completed features
- Generate bullet points for each implemented feature
- Include **auto-calculated version number** and release date
- **Group changes by type** (Added/Fixed/Changed/Removed)

**Stage 5 - System Cleanup**:
- Archive old CHANGELOG.md entries (keep last 3 versions)
- Reset prd.md and tests.md for next development cycle
- **Commit version bump** with message: `chore: release v{version}`
- **Push git tag** to trigger release automation

**CHANGELOG.md Format** (Auto-generated):
```markdown
# Changelog

## [1.2.3] - 2024-01-15

### Added
- Feature 1: Natural language query processing (feat: add query parser)
- Feature 2: Context compression algorithm (feat: implement compression)

### Fixed
- Bug fix: Memory leak in pattern matching (fix: resolve memory leak)
- Bug fix: CLI argument parsing edge case (fix: handle empty args)

### Changed
- Enhancement: Improved error messages (feat: better error handling)

### Technical
- Implemented Effect-TS async patterns
- Added Zod v4 schema validation
- Created tagged union error system

### Metrics
- 100x context compression achieved
- 95% test coverage maintained
- 0 memory leaks detected

**Release Notes**: Auto-generated from 5 commits (3 features, 2 fixes)
**Version Bump**: MINOR (1.2.2 → 1.2.3) - New features added
```

**Version Calculation Logic**:
```typescript
// Automatic version bump calculation
const analyzeCommits = (commits: Commit[]): VersionBump => {
  const hasBreaking = commits.some(c => c.message.includes('BREAKING CHANGE') || c.message.includes('!'))
  const hasFeature = commits.some(c => c.message.startsWith('feat:'))
  const hasFix = commits.some(c => c.message.startsWith('fix:'))
  
  if (hasBreaking) return 'MAJOR'
  if (hasFeature) return 'MINOR'
  if (hasFix) return 'PATCH'
  return 'PATCH' // Default for docs, tests, refactor
}
```

## 🔧 Development Standards

### Functional Programming Principles
```typescript
// ❌ Don't create classes
export class QueryProcessor { ... }

// ✅ Use functional patterns with Effect-TS
export const processQuery = (
  query: string,
  options: QueryOptions
): Effect.Effect<QueryResult, VibeError> => pipe(...)
```

### Effect-TS + Zod v4 Integration Patterns

#### Core Import Pattern
```typescript
import { Effect, pipe, Either } from 'effect'
import { z } from 'zod/v4'
```

#### Schema-First Development
```typescript
// 1. Define Zod schemas first
export const QueryOptionsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
  similarity: z.number().min(0).max(1).default(0.1),
  verbose: z.boolean().default(false)
})

// 2. Infer types from schemas
export type QueryOptions = z.infer<typeof QueryOptionsSchema>

// 3. Use schemas for validation in Effect chains
export const parseQueryOptions = (
  input: unknown
): Effect.Effect<QueryOptions, ValidationError> =>
  Effect.try({
    try: () => QueryOptionsSchema.parse(input),
    catch: (error) => createValidationError(error, 'Invalid query options')
  })
```

#### Tagged Union Error System with Zod
```typescript
// Define error schemas with Zod discriminated unions
export const ConfigurationErrorSchema = z.object({
  _tag: z.literal('ConfigurationError'),
  message: z.string(),
  details: z.string().optional()
})

export const EmbeddingErrorSchema = z.object({
  _tag: z.literal('EmbeddingError'),
  message: z.string(),
  text: z.string().optional()
})

export const VibeErrorSchema = z.discriminatedUnion('_tag', [
  ConfigurationErrorSchema,
  EmbeddingErrorSchema
])

// Infer types from schemas
export type ConfigurationError = z.infer<typeof ConfigurationErrorSchema>
export type EmbeddingError = z.infer<typeof EmbeddingErrorSchema>
export type VibeError = z.infer<typeof VibeErrorSchema>

// Create error constructors that work with exactOptionalPropertyTypes: true
export const createConfigurationError = (
  error: unknown,
  details?: string
): ConfigurationError => {
  const baseError = {
    _tag: 'ConfigurationError' as const,
    message: error instanceof Error ? error.message : String(error)
  }
  return details ? { ...baseError, details } : baseError
}
```

#### Critical TypeScript Compatibility
```typescript
// ❌ Wrong - fights exactOptionalPropertyTypes: true
export interface BadError {
  readonly _tag: 'BadError'
  readonly details?: string | undefined  // Type hack that breaks strict mode
}

// ✅ Correct - works with exactOptionalPropertyTypes: true
export const GoodErrorSchema = z.object({
  _tag: z.literal('GoodError'),
  details: z.string().optional()  // Zod handles optional properly
})

// ✅ Correct error constructor pattern
export const createGoodError = (message: string, details?: string): GoodError => {
  const baseError = { _tag: 'GoodError' as const, message }
  return details ? { ...baseError, details } : baseError
}
```

#### Effect-TS Async Patterns
```typescript
// ❌ Wrong - causes "Not a valid effect" error
const result = await someAsyncOperation()

// ✅ Correct - all async operations use Effect.tryPromise
export const safeAsyncOperation = (
  input: string
): Effect.Effect<ResultType, VibeError> =>
  Effect.tryPromise({
    try: () => someAsyncOperation(input),
    catch: (error) => createVibeError(error, 'Operation failed')
  })

// ✅ Correct - validation + async in Effect chain
export const validateAndProcess = (
  input: unknown
): Effect.Effect<ProcessedResult, VibeError> =>
  pipe(
    Effect.try({
      try: () => InputSchema.parse(input),
      catch: (error) => createValidationError(error, 'Invalid input')
    }),
    Effect.flatMap(validInput => processInput(validInput))
  )
```

#### Effect-TS v3 Either API (Critical)
```typescript
// ❌ Wrong - old Effect API that doesn't exist
if (Effect.isLeft(result)) {
  const error = result.left
}

// ✅ Correct - Effect v3 Either API
import { Either } from 'effect'

const result = await Effect.runPromise(Effect.either(someEffect))
if (Either.isLeft(result)) {
  const error = Either.getLeft(result)
  // Handle error
} else {
  const value = Either.getRight(result)
  // Handle success
}
```

#### File I/O with Validation
```typescript
// Schema for file content
export const ConfigFileSchema = z.object({
  version: z.string(),
  settings: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('text-embedding-004')
  })
})

// Read and validate JSON file
export const readConfigFile = (
  filePath: string
): Effect.Effect<ConfigFile, VibeError> =>
  pipe(
    Effect.tryPromise({
      try: () => Deno.readTextFile(filePath),
      catch: (error) => createStorageError(error, filePath)
    }),
    Effect.flatMap(content =>
      Effect.try({
        try: () => {
          const json = JSON.parse(content)
          return ConfigFileSchema.parse(json)
        },
        catch: (error) => createValidationError(error, `Invalid config file: ${filePath}`)
      })
    )
  )
```

#### CLI Argument Parsing Pattern
```typescript
// Schema for CLI arguments
export const CliArgsSchema = z.object({
  command: z.enum(['embed', 'query', 'help']),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  verbose: z.boolean().default(false)
})

// Parse and validate CLI arguments
export const parseCliArgs = (
  args: string[]
): Effect.Effect<CliArgs, ValidationError> => {
  const rawArgs = {
    command: args[0],
    query: args[1],
    limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]!) : undefined,
    verbose: args.includes('--verbose')
  }

  return Effect.try({
    try: () => CliArgsSchema.parse(rawArgs),
    catch: (error) => createValidationError(error, 'Invalid CLI arguments')
  })
}
```

#### Testing with Effect + Zod
```typescript
// Test Effect Either API correctly
import { Effect, Either } from 'effect'

it('should handle validation errors', async () => {
  const result = await Effect.runPromise(
    Effect.either(validateInput('invalid'))
  )
  
  assert(Either.isLeft(result))
  const error = Either.getLeft(result)
  assertEquals(error._tag, 'ValidationError')
})

// Test with proper array access for strict mode
it('should handle array results safely', async () => {
  const result = await Effect.runPromise(getResults())
  
  assertEquals(result.items.length, 2)
  if (result.items.length > 0) {
    const firstItem = result.items[0]!  // Safe with bounds check
    assertExists(firstItem)
  }
})
```

#### Key Learnings Summary

1. **Schema First**: Always define Zod schemas before TypeScript interfaces
2. **Effect Wrapping**: Wrap ALL async operations in `Effect.tryPromise`
3. **Either API**: Use `Either.isLeft()` and `Either.getLeft()` for Effect v3
4. **Optional Properties**: Use Zod `.optional()` instead of `| undefined` hacks
5. **Error Constructors**: Conditionally add optional properties to satisfy strict mode
6. **Validation Chains**: Combine validation and async operations in Effect pipes
7. **Array Access**: Use bounds checking or non-null assertions for `noUncheckedIndexedAccess`

#### Working with Strict TypeScript
```typescript
// ✅ These compiler options work with our patterns
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,    // Zod handles this
    "noUncheckedIndexedAccess": true,     // Use bounds checking
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### @tested_by System
```typescript
/**
 * Query command implementation
 * 
 * @tested_by tests/query.test.ts (Natural language processing, pattern matching)
 * @tested_by tests/integration.test.ts (End-to-end query workflow)
 * @tested_by tests/performance.test.ts (Context compression benchmarks)
 */
export const queryCommand = (
  query: string,
  options: QueryOptions
): Effect.Effect<QueryResult, VibeError> => {
  // Implementation
}
```

## 📊 Success Metrics

### Tool Quality
- **Performance**: Fast, responsive tools (<100ms response time)
- **Reliability**: Robust error handling and graceful degradation
- **Usability**: Intuitive CLI interfaces with helpful feedback

### Development Standards
- **Test Coverage**: 100% of exported functions
- **Integration Tests**: All user-facing workflows
- **Performance Tests**: Tool performance benchmarks

## 🚀 Development Workflow

### Feature Development Cycle
1. **Requirement Gathering**: User describes needs → prd.md
2. **Test Planning**: Map requirements to test cases → tests.md
3. **Implementation**: Build feature with @tested_by annotations
4. **Testing**: Verify all tests pass, update coverage
5. **Completion**: Feature ready for flush protocol
6. **Flush**: Multi-stage cleanup → CHANGELOG.md

### Daily Development
1. Check prd.md for current feature requirements
2. Review tests.md for test cases to implement
3. Write code with Effect-TS patterns
4. Add @tested_by annotations
5. Run tests and update coverage
6. Commit with structured messages

### Release Preparation
1. Complete all planned features in prd.md
2. Verify all tests in tests.md are passing
3. Update version in deno.json
4. Execute flush protocol
5. Generate CHANGELOG.md entry
6. Create release tag

## 🏗️ Project Structure

```
dotvibe/
├── CLAUDE.md           # This file - core protocols and guidance
├── prd.md              # Product requirements (active features)
├── tests.md            # Test tracking and @tested_by system
├── CHANGELOG.md        # Timestamped completed features
├── deno.json           # Project configuration
├── .gitignore          # Deno-specific patterns
├── src/
│   ├── query.ts        # vibe query tool implementation
│   ├── cli.ts          # Command line interface
│   └── types.ts        # Type definitions and schemas
└── tests/
    └── query.test.ts   # Test implementation
```

## ⚡ Key Commands

### **🚀 Production CLI Usage (ALWAYS USE THIS FOR TESTING & EXAMPLES)**
```bash
# **CRITICAL: Always use ./vibe executable for testing and user examples**
./vibe init                           # Initialize workspace (auto-starts SurrealDB server)
./vibe index src/                     # Index source code
./vibe query "async functions"        # Search code
./vibe help                          # Show help

# Example workflow
mkdir test-project && cd test-project
../vibe init                         # Auto-starts SurrealDB server on port 4243+
mkdir src
echo 'export async function test() {}' > src/app.ts
../vibe index src/                   # Index files with embeddings
../vibe query "async"                # Search code with semantic similarity
```

### **🔧 Development Commands**
```bash
# Type checking
deno task check

# Run tests
deno task test

# Lint code
deno task lint

# Format code
deno task fmt
```

### **📦 Build Commands**
```bash
# Build executable (if needed)
deno task build

# Development mode (NOT for users)
deno task dev
```

### **⚠️ CRITICAL EXECUTABLE USAGE NOTES:**
- **✅ Production/Testing**: `./vibe init` (ALWAYS USE THIS)
- **❌ Development Only**: `deno run --allow-all src/cli.ts init` (INTERNAL ONLY)
- **📁 File**: `/home/keyvan/.vibe/dotvibe/vibe` - **Simple bash script shortcut** (NO BUILD REQUIRED)
- **🔧 Script Content**: Just `#!/usr/bin/env bash` + `exec deno run --allow-all "$SCRIPT_DIR/src/cli.ts" "$@"`
- **💡 No Compilation**: It's a wrapper script, not a compiled executable - always up-to-date
- **🔄 Auto-Server**: `./vibe init` automatically starts SurrealDB server on available port (4243+)
- **🛡️ Process Management**: Server shuts down cleanly when CLI exits (Ctrl+C)

---

**Philosophy**: Every tool we build should give coding agents superpowers. Every protocol ensures systematic development from requirements to completion. Every feature contributes to the ultimate goal of creating a comprehensive toolbox for enhanced developer productivity.