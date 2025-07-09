# 🚀 SurrealDB + JavaScript SDK Demo

## Step 1: Start SurrealDB Server

Open **Terminal 1** and run:
```bash
cd /home/keyvan/.vibe/dotvibe
mkdir -p test-demo/.vibe
cd test-demo

# Start SurrealDB server with file database
surreal start \
  --log warn \
  --user root \
  --pass root \
  --bind 127.0.0.1:8000 \
  "file://$(pwd)/.vibe/code.db"
```

You should see:
```
[INFO] Starting SurrealDB...
[INFO] Started web server on 127.0.0.1:8000
```

## Step 2: Test CLI (in another terminal)

Open **Terminal 2** and run:
```bash
cd /home/keyvan/.vibe/dotvibe/test-demo

# Test CLI help
deno run --allow-all --no-check ../src/cli.ts --help

# Initialize workspace
deno run --allow-all --no-check ../src/cli.ts init

# Create sample code
mkdir -p src
echo 'export async function authenticateUser(email: string) {
  console.log("Authenticating user:", email)
  return { success: true, user: { email } }
}' > src/auth.ts

# Index the code
deno run --allow-all --no-check ../src/cli.ts index src/

# Query the code
deno run --allow-all --no-check ../src/cli.ts query "async functions"
```

## Expected Flow:

1. **Server starts** → File database created at `.vibe/code.db`
2. **CLI init** → Connects to server, creates schema
3. **CLI index** → Scans files, generates embeddings, stores in SurrealDB
4. **CLI query** → Searches vectors using cosine similarity

## Architecture:

```
┌─────────────────┐    HTTP/RPC    ┌─────────────────┐
│  Vibe CLI       │ ──────────────> │  SurrealDB      │
│  (JavaScript)   │                │  Server         │
└─────────────────┘                └─────────────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │  File Database  │
                                   │  .vibe/code.db  │
                                   └─────────────────┘
```

**Benefits:**
- ✅ **File persistence**: Data survives restarts
- ✅ **Full SurrealDB features**: Vector similarity, complex queries
- ✅ **Standard architecture**: Server-client model
- ✅ **Your installed binary**: Uses your SurrealDB installation