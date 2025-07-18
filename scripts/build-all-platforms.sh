#!/bin/bash
set -e

# Cross-platform build script for dotvibe
# Builds self-contained executables with bundled WASM files

echo "🚀 Building dotvibe for all platforms..."

# Get version from deno.json
VERSION=$(cat deno.json | jq -r '.version')
echo "📦 Version: v${VERSION}"

# Create build directory
mkdir -p build

# Build for Linux x86_64
echo "🐧 Building Linux x86_64..."
deno compile --allow-all --include data/ --target x86_64-unknown-linux-gnu --output "build/vibe-v${VERSION}-linux-x86_64" src/cli.ts

# Build for macOS x86_64
echo "🍎 Building macOS x86_64..."
deno compile --allow-all --include data/ --target x86_64-apple-darwin --output "build/vibe-v${VERSION}-darwin-x86_64" src/cli.ts

# Build for macOS ARM64
echo "🍎 Building macOS ARM64..."
deno compile --allow-all --include data/ --target aarch64-apple-darwin --output "build/vibe-v${VERSION}-darwin-arm64" src/cli.ts

# Build for Windows x86_64
echo "🪟 Building Windows x86_64..."
deno compile --allow-all --include data/ --target x86_64-pc-windows-msvc --output "build/vibe-v${VERSION}-windows-x86_64.exe" src/cli.ts

echo "✅ Cross-platform builds complete!"
echo "📁 Build artifacts:"
ls -la build/vibe-v${VERSION}-*