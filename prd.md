# Product Requirements Document

## Feature: Phase 2 - LLM Indexing Orchestrator & Basic Conversation
**Status**: planned
**Priority**: high
**Created**: 2025-07-10

### Description
Implement the core LLM conversation mechanism that enables Gemini to use our Phase 1 toolbox. Build an `IndexingOrchestrator` that manages conversational sessions with the Gemini Function Calling API, allowing the LLM to request and execute local tools from our `ToolRegistry`. This phase focuses on the basic conversation loop rather than advanced indexing features.

### Acceptance Criteria
- [ ] Create Gemini tool declarations bridge using `z.toJSONSchema()`
- [ ] Implement `IndexingOrchestrator` with conversation loop
- [ ] Enable Gemini Function Calling API integration
- [ ] Successfully demonstrate LLM → Tool Call → Response cycle
- [ ] Update `vibe index` command to use orchestrator
- [ ] Remove debug runner (replaced by orchestrator)
- [ ] Achieve at least 2-3 conversation turns with tool calls

### Critical Success Indicator
```bash
$ vibe index .
🤖 LLM => Tool Call: list_filesystem({"path":"."})
🔧 Executing: list_filesystem with args: {"path":"."}
📤 Sending results back to LLM...
🤖 LLM => Tool Call: read_file({"path":"deno.json"})
```

### Implementation Notes
**Technical Approach**:
- Use `@google/genai` SDK with `gemini-2.5-flash` model
- Bridge Zod schemas to `FunctionDeclaration` format using `z.toJSONSchema()`
- Implement conversational loop with `model.startChat()`
- Leverage existing `executeTool()` function from Phase 1
- Use Effect-TS patterns for error handling

**Architecture Components**:
1. **Tool Registry Bridge** (`src/tool-registry.ts`):
   - `getGeminiToolDeclarations(): FunctionDeclaration[]`
   - Include ALL tools (no filtering), including mock `create_index_entry`
   - Generically strip `$schema` property from `z.toJSONSchema()` output

2. **Indexing Orchestrator** (`src/indexing-orchestrator.ts`):
   - `runGuidedExploration(rootPath: string, verbose?: boolean)`
   - Conversation loop with hardcoded `MAX_ITERATIONS = 20`
   - In-memory conversation state only
   - Retry mechanism: 3 attempts with exponential backoff (2s, 4s, 8s)

3. **Updated Index Command** (`src/commands/index.ts`):
   - **Complete replacement** of existing file scanning logic
   - Support `--verbose` flag for detailed logging
   - Ignore legacy options (`--ext`, `--include-markdown`) for this phase
   - Effect-TS error handling

**Error Handling Specifications**:
- **Tool Execution Failures**: Report error to LLM as `functionResponse`, allow LLM to handle gracefully
- **API Failures**: Implement retry with exponential backoff, terminate after 3 failed attempts
- **No termination on tool errors**: Let LLM decide next steps

**Logging Strategy**:
- **Default Mode**: Major status updates only ("Starting indexing...", "Indexing complete.")
- **Verbose Mode** (`--verbose`): Turn-by-turn conversation logging with prefixes:
  - `🤖 LLM =>` for LLM tool calls
  - `🛠️ Tool <=` for tool execution
  - `📤 Sending results back to LLM...`
- Use `console.log` (no complex logging system needed)

**System Instruction**:
```
You are an expert programmer and system architect. Your goal is to deeply understand this codebase. I have provided you with a set of tools to explore the filesystem and the code's structure. Your task is to reason step-by-step, form a hypothesis about the project, and explore it until you understand the purpose of each major symbol. When you fully understand a symbol, you will call the create_index_entry tool. Begin by listing the contents of the root directory to get an overview.
```

**Stopping Conditions**:
1. Hard `MAX_ITERATIONS` limit reached (safety)
2. LLM responds with text message instead of `functionCall` (natural completion)

**Dependencies**:
- Phase 1 Code Analysis Toolbox ✅ (completed)
- `@google/genai` SDK ✅ (already installed) 
- Gemini Function Calling API
- Environment: `GOOGLE_API_KEY`

### User Stories
- As a developer, I want to run `vibe index .` and see the LLM intelligently explore my codebase
- As a developer, I want to see transparent tool calls so I understand what the LLM is doing
- As a developer, I want the system to safely handle conversation limits and exit cleanly
- As a developer, I want the LLM to build understanding of my code structure step-by-step