#!/bin/bash

# Start SurrealDB server with file database
# Usage: ./start-surreal.sh [database-path]

DB_PATH=${1:-".vibe/code.db"}
ABS_PATH=$(realpath "$DB_PATH")

echo "🚀 Starting SurrealDB server..."
echo "📁 Database path: $ABS_PATH"
echo "🌐 Server will be available at: http://127.0.0.1:8000"
echo ""
echo "To stop the server, press Ctrl+C"
echo ""

# Start SurrealDB server
surreal start \
  --log trace \
  --user root \
  --pass root \
  --bind 127.0.0.1:8000 \
  "file://$ABS_PATH"