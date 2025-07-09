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

### Effect-TS Async Patterns
```typescript
// ❌ Wrong - causes "Not a valid effect" error
const result = await someAsyncOperation()

// ✅ Correct - all async operations use Effect.tryPromise
const result = Effect.tryPromise({
  try: () => someAsyncOperation(),
  catch: (error) => createVibeError(error, 'Operation failed')
})
```

### Zod v4 Schema Validation
```typescript
import { z } from 'zod/v4'

export const QueryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  pattern: z.string().min(1),
  complexity: z.enum(['low', 'medium', 'high']).default('medium')
})

export type QueryOptions = z.infer<typeof QueryOptionsSchema>
```

### Tagged Union Error System
```typescript
export interface QueryError {
  readonly _tag: 'QueryError'
  readonly message: string
  readonly query?: string
}

export interface PatternError {
  readonly _tag: 'PatternError'
  readonly message: string
  readonly pattern?: string
}

export type VibeError = QueryError | PatternError

export const createQueryError = (
  error: unknown,
  query?: string
): QueryError => ({
  _tag: 'QueryError',
  message: error instanceof Error ? error.message : String(error),
  query
})
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

### Development
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

### Build
```bash
# Build executable
deno task build

# Run locally
deno task dev
```

---

**Philosophy**: Every tool we build should give coding agents superpowers. Every protocol ensures systematic development from requirements to completion. Every feature contributes to the ultimate goal of creating a comprehensive toolbox for enhanced developer productivity.