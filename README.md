# dotvibe

Stop pasting your codebase into Claude Code every session.

## The Problem

Your AI coding agent just asked you to explain your authentication middleware. Again. This is the fourth time this week you've had to paste the same code because the agent forgot your patterns from the previous conversation.

You're spending more time managing AI context than actually coding.

## What This Does

dotvibe gives coding agents persistent memory of your codebase architecture. Instead of re-explaining your patterns every session, agents query dotvibe to understand your existing code before generating new code.

**Technical approach:**
- Semantic indexing via tree-sitter AST + LLM analysis  
- Relationship graphs stored in SurrealDB with vector embeddings
- Query interface that agents use to understand existing patterns

## Agent Integration

**Before dotvibe:**
```
You: "Add error handling to the API endpoint"
Agent: "Can you show me how you handle errors in this codebase?"
You: *pastes 47 lines of error handling code*
Agent: *generates generic try/catch that doesn't match your patterns*
```

**With dotvibe:**
```typescript
// Agent queries your codebase understanding
const errorPatterns = await vibeQuery("error handling in API routes")
const authPatterns = await vibeQuery("authentication middleware patterns") 

// Agent generates code that matches YOUR patterns
```

**Real output example:**
```bash
$ vibe query "authentication middleware patterns"

📁 src/middleware/auth.ts:15-28
export const withAuth = (requiredRole?: Role) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization)
    if (!token) return res.status(401).json({ error: 'No token provided' })
    
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(payload.sub)
      if (requiredRole && !hasRole(req.user, requiredRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' })
      }
      next()
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}
```

Now your agent knows to use `withAuth(Role.ADMIN)` instead of generating generic middleware.

## Installation

```bash
# Download installer for your platform  
curl -L https://github.com/vhybzOS/dotvibe/releases/latest/download/install-dotvibe-linux-x86_64 -o install-dotvibe
chmod +x install-dotvibe && ./install-dotvibe

# Index your codebase (one-time setup)
vibe index src/

# Query from your agent or directly
vibe query "database connection patterns"
vibe query "how validation errors are handled"
vibe query "async functions with retry logic"
```

## How Agents Use This

Instead of context management hell, agents can query specific patterns:

```typescript
// Before writing new auth code
const authPatterns = await vibeQuery("existing authentication patterns")

// Before handling errors  
const errorHandling = await vibeQuery("error handling conventions in this codebase")

// Before database operations
const dbPatterns = await vibeQuery("database connection and query patterns")
```

The agent sees your actual implementation patterns and follows them instead of generating generic placeholder code.

## Architecture

**Stack:**
- **Runtime**: Deno/TypeScript 
- **Parsing**: Tree-sitter for AST analysis
- **Storage**: SurrealDB for graph relationships + vector search
- **Embeddings**: Google Gemini for semantic understanding
- **Patterns**: Effect-TS functional composition

**How it works:**
1. `vibe index` analyzes your codebase with tree-sitter + LLM
2. Extracts functions, classes, patterns, and their relationships  
3. Stores semantic descriptions with vector embeddings in SurrealDB
4. `vibe query` returns relevant code snippets with context

**Data flow:**
```
Your Code → Tree-sitter AST → LLM Analysis → Semantic Descriptions → Vector Embeddings → SurrealDB → Query Interface → Agent
```

## Commands

```bash
vibe init                    # Initialize workspace  
vibe index <path>           # Index codebase for semantic search
vibe query "<question>"     # Find relevant code patterns
vibe start                  # Start SurrealDB server
vibe stop                   # Stop SurrealDB server  
vibe status                 # Show workspace status
```

## Query Examples

**Natural language queries that return precise code:**

```bash
# Find authentication patterns
vibe query "how authentication is implemented"

# Understand error handling  
vibe query "error handling patterns in API routes"

# See database patterns
vibe query "database connection and transaction patterns"

# Find async patterns
vibe query "async functions with error handling"

# Understand validation
vibe query "request validation middleware"
```

Each query returns the actual code from your codebase with file paths and line numbers.

## Development

**Requirements:**
- Deno 2.4+
- SurrealDB (auto-installed by installer)

**Local development:**
```bash
git clone https://github.com/vhybzOS/dotvibe.git
cd dotvibe
deno task dev                # Run locally
deno task test              # Run tests
deno task build             # Build binary
```

**Architecture principles:**
- Functional programming (no classes)
- Effect-TS for async composition  
- Zod v4 for schema validation
- Test-driven development

## The Result

Your coding agent becomes context-aware. Instead of:
- "Can you show me your error handling patterns?"
- "How do you structure your middleware?"
- "What's your authentication flow?"

Your agent just queries dotvibe and generates code that fits your existing architecture.

**No more context management. No more re-explaining your codebase. No more generic placeholder code.**

---

Built for developers who are tired of babysitting AI coding agents.