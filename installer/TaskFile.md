# TaskFile Development Guide for .vibe Go Installer

## Overview

This document provides comprehensive guidance for using [Task](https://taskfile.dev) (TaskFile) as the build automation tool for the .vibe Go installer implementation. TaskFile replaces traditional Makefiles with a modern, YAML-based task runner optimized for Go development workflows.

## Why TaskFile Over Makefiles

**Key Advantages:**

- **YAML Configuration**: More readable and maintainable than Make syntax
- **Cross-Platform**: Native support for Windows, macOS, and Linux without shell compatibility issues
- **Go-Native**: Built-in Go toolchain integration with excellent performance
- **Variable System**: Powerful templating with environment variables and task outputs
- **Dependency Management**: Clear task dependencies with parallel execution
- **File Watching**: Built-in file watching for development workflows

## Cold Start Setup

### 1. Install Task

```bash
# Linux/macOS via script
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin

# Via Go (if you have Go installed)
go install github.com/go-task/task/v3/cmd/task@latest

# Verify installation
task --version
```

### 2. Basic Project Structure

The installer directory structure with TaskFile integration:

```
installer/
├── Taskfile.yml              # Main task definitions
├── go.mod                    # Go module
├── go.sum                    # Go dependencies
├── .env                      # Environment variables (optional)
├── .taskrc.yml              # Task-specific configuration (optional)
├── cmd/
│   └── vibe-installer/
│       └── main.go
├── internal/
│   ├── platform/
│   ├── installer/
│   ├── service/
│   ├── ui/
│   └── packager/
├── assets/                   # Embedded resources
├── test/                     # Test files
└── build/                    # Build artifacts (gitignored)
```

## Essential Taskfile.yml Structure

### Complete Starter Template

```yaml
# Taskfile.yml
version: '3'

# Global variables available to all tasks
vars:
  APP_NAME: vibe-installer
  VERSION:
    sh: git describe --tags --always --dirty
  BUILD_TIME:
    sh: date -u '+%Y-%m-%d_%H:%M:%S'
  GO_VERSION:
    sh: go version | cut -d' ' -f3

  # Build configuration
  CGO_ENABLED: 0
  LDFLAGS: >-
    -w -s
    -X main.version={{.VERSION}}
    -X main.buildTime={{.BUILD_TIME}}
    -X main.goVersion={{.GO_VERSION}}

  # Platform targets
  PLATFORMS: >-
    linux/amd64
    linux/arm64
    darwin/amd64
    darwin/arm64
    windows/amd64

  # Directories
  BUILD_DIR: ./build
  DIST_DIR: ./dist
  ASSETS_DIR: ./assets
  TEST_COVERAGE_DIR: ./coverage

# Environment variables
env:
  CGO_ENABLED: '{{.CGO_ENABLED}}'
  GO111MODULE: on

# Global task settings
set:
  - errexit
  - pipefail
  - nounset

# Dotenv files to load
dotenv: ['.env']

# Task definitions
tasks:
  # === DEVELOPMENT TASKS ===
  default:
    desc: Show available tasks
    cmds:
      - task --list
    silent: true

  dev:
    desc: Start development with file watching
    deps: [clean, test:unit]
    cmds:
      - task: build:dev
      - task: watch

  watch:
    desc: Watch files and rebuild on changes
    watch: true
    sources:
      - '**/*.go'
      - 'go.mod'
      - 'go.sum'
      - 'assets/**/*'
    cmds:
      - task: test:unit
      - task: build:dev
    silent: true

  run:
    desc: Run the installer locally
    deps: [build:dev]
    cmds:
      - '{{.BUILD_DIR}}/{{.APP_NAME}}'

  # === BUILD TASKS ===

  build:
    desc: Build for current platform
    aliases: [b]
    deps: [clean, mod:tidy]
    generates:
      - '{{.BUILD_DIR}}/{{.APP_NAME}}{{exeExt}}'
    sources:
      - '**/*.go'
      - 'go.mod'
      - 'go.sum'
      - 'assets/**/*'
    cmds:
      - cmd: mkdir -p {{.BUILD_DIR}}
        silent: true
      - go build
        -ldflags "{{.LDFLAGS}}"
        -o {{.BUILD_DIR}}/{{.APP_NAME}}{{exeExt}}
        ./cmd/vibe-installer

  build:dev:
    desc: Build for development (faster, no optimizations)
    generates:
      - '{{.BUILD_DIR}}/{{.APP_NAME}}{{exeExt}}'
    sources:
      - '**/*.go'
      - 'go.mod'
      - 'go.sum'
    cmds:
      - cmd: mkdir -p {{.BUILD_DIR}}
        silent: true
      - go build
        -o {{.BUILD_DIR}}/{{.APP_NAME}}{{exeExt}}
        ./cmd/vibe-installer

  build:all:
    desc: Cross-compile for all platforms
    deps: [clean, mod:tidy, test:unit]
    cmds:
      - cmd: mkdir -p {{.DIST_DIR}}
        silent: true
      - for: { var: PLATFORMS, split: '\n' }
        cmd: |
          export GOOS={{splitList "/" .ITEM | first}}
          export GOARCH={{splitList "/" .ITEM | last}}
          echo "Building ${GOOS}/${GOARCH}..."
          go build \
            -ldflags "{{.LDFLAGS}}" \
            -o {{.DIST_DIR}}/{{.APP_NAME}}-${GOOS}-${GOARCH}{{if eq .GOOS "windows"}}.exe{{end}} \
            ./cmd/vibe-installer

  build:embed:
    desc: Build with embedded vibe binaries
    deps: [assets:prepare]
    vars:
      VIBE_BINARIES_PATH: '{{.ASSETS_DIR}}/binaries'
    preconditions:
      - test -d {{.VIBE_BINARIES_PATH}}
      - test -f {{.VIBE_BINARIES_PATH}}/linux-amd64/vibe
      - test -f {{.VIBE_BINARIES_PATH}}/windows-amd64/vibe.exe
    cmds:
      - go build
        -ldflags "{{.LDFLAGS}}"
        -tags embed
        -o {{.BUILD_DIR}}/{{.APP_NAME}}-embedded{{exeExt}}
        ./cmd/vibe-installer

  # === TESTING TASKS ===

  test:
    desc: Run all tests
    deps: [test:unit, test:integration, test:coverage]

  test:unit:
    desc: Run unit tests
    aliases: [tu]
    sources:
      - '**/*.go'
      - '!**/*_integration_test.go'
    cmds:
      - go test -v -race -short ./...

  test:integration:
    desc: Run integration tests
    aliases: [ti]
    deps: [build:dev]
    preconditions:
      - test -f {{.BUILD_DIR}}/{{.APP_NAME}}{{exeExt}}
    cmds:
      - go test -v -race -tags integration ./test/integration/...

  test:coverage:
    desc: Generate test coverage report
    aliases: [tc]
    generates:
      - '{{.TEST_COVERAGE_DIR}}/coverage.out'
      - '{{.TEST_COVERAGE_DIR}}/coverage.html'
    cmds:
      - cmd: mkdir -p {{.TEST_COVERAGE_DIR}}
        silent: true
      - go test -coverprofile={{.TEST_COVERAGE_DIR}}/coverage.out ./...
      - go tool cover -html={{.TEST_COVERAGE_DIR}}/coverage.out -o {{.TEST_COVERAGE_DIR}}/coverage.html
      - go tool cover -func={{.TEST_COVERAGE_DIR}}/coverage.out

  test:watch:
    desc: Run tests continuously on file changes
    watch: true
    sources:
      - '**/*.go'
    cmds:
      - task: test:unit
    silent: true

  # === QUALITY TASKS ===

  lint:
    desc: Run golangci-lint
    cmds:
      - golangci-lint run ./...

  lint:fix:
    desc: Run golangci-lint with auto-fix
    cmds:
      - golangci-lint run --fix ./...

  fmt:
    desc: Format Go code
    cmds:
      - go fmt ./...
      - goimports -w .

  vet:
    desc: Run go vet
    cmds:
      - go vet ./...

  sec:
    desc: Run security analysis with gosec
    cmds:
      - gosec ./...

  quality:
    desc: Run all quality checks
    deps: [fmt, vet, lint, sec, test:unit]

  # === DEPENDENCY MANAGEMENT ===

  mod:tidy:
    desc: Tidy Go modules
    sources:
      - go.mod
      - go.sum
    cmds:
      - go mod tidy

  mod:verify:
    desc: Verify Go modules
    cmds:
      - go mod verify

  mod:download:
    desc: Download Go modules
    cmds:
      - go mod download

  deps:update:
    desc: Update all dependencies
    cmds:
      - go get -u ./...
      - task: mod:tidy

  deps:graph:
    desc: Show dependency graph
    cmds:
      - go mod graph

  # === ASSET MANAGEMENT ===

  assets:prepare:
    desc: Prepare embedded assets
    deps: [assets:fetch-binaries, assets:prepare-templates]

  assets:fetch-binaries:
    desc: Fetch vibe binaries for embedding
    vars:
      VIBE_VERSION:
        sh: git -C .. describe --tags --always
      BINARIES_DIR: '{{.ASSETS_DIR}}/binaries'
    cmds:
      - cmd: mkdir -p {{.BINARIES_DIR}}
        silent: true
      - cmd: |
          echo "Fetching vibe binaries version {{.VIBE_VERSION}}..."
          # Copy from parent project's build
          for platform in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64; do
            mkdir -p {{.BINARIES_DIR}}/${platform}
            if [[ "${platform}" == "windows-amd64" ]]; then
              cp ../build/vibe-${platform}.exe {{.BINARIES_DIR}}/${platform}/vibe.exe
            else
              cp ../build/vibe-${platform} {{.BINARIES_DIR}}/${platform}/vibe
            fi
          done

  assets:prepare-templates:
    desc: Validate and prepare service templates
    vars:
      TEMPLATES_DIR: '{{.ASSETS_DIR}}/templates'
    cmds:
      - cmd: |
          echo "Validating service templates..."
          # Validate systemd template
          if ! systemd-analyze verify {{.TEMPLATES_DIR}}/systemd/vibe.service 2>/dev/null; then
            echo "Warning: systemd template validation failed"
          fi

          # Validate launchd template
          if command -v plutil >/dev/null; then
            plutil -lint {{.TEMPLATES_DIR}}/launchd/dev.dotvibe.daemon.plist
          fi

  assets:clean:
    desc: Clean generated assets
    cmds:
      - rm -rf {{.ASSETS_DIR}}/binaries

  # === RELEASE TASKS ===

  release:prepare:
    desc: Prepare release artifacts
    deps: [clean, quality, test, build:all]
    cmds:
      - task: release:checksums
      - task: release:archive

  release:checksums:
    desc: Generate checksums for release binaries
    deps: [build:all]
    generates:
      - '{{.DIST_DIR}}/checksums.txt'
    cmds:
      - cmd: cd {{.DIST_DIR}} && sha256sum * > checksums.txt

  release:archive:
    desc: Create release archives
    deps: [build:all]
    cmds:
      - for: { var: PLATFORMS, split: '\n' }
        cmd: |
          GOOS={{splitList "/" .ITEM | first}}
          GOARCH={{splitList "/" .ITEM | last}}
          ARCHIVE_NAME="{{.APP_NAME}}-{{.VERSION}}-${GOOS}-${GOARCH}"

          if [[ "${GOOS}" == "windows" ]]; then
            zip -j {{.DIST_DIR}}/${ARCHIVE_NAME}.zip {{.DIST_DIR}}/{{.APP_NAME}}-${GOOS}-${GOARCH}.exe
          else
            tar -czf {{.DIST_DIR}}/${ARCHIVE_NAME}.tar.gz -C {{.DIST_DIR}} {{.APP_NAME}}-${GOOS}-${GOARCH}
          fi

  # === UTILITY TASKS ===

  clean:
    desc: Clean build artifacts
    cmds:
      - rm -rf {{.BUILD_DIR}}
      - rm -rf {{.DIST_DIR}}
      - rm -rf {{.TEST_COVERAGE_DIR}}

  info:
    desc: Show build information
    cmds:
      - cmd: |
          echo "App Name: {{.APP_NAME}}"
          echo "Version: {{.VERSION}}"
          echo "Build Time: {{.BUILD_TIME}}"
          echo "Go Version: {{.GO_VERSION}}"
          echo "Platforms: {{.PLATFORMS}}"
        silent: true

  doctor:
    desc: Check development environment
    cmds:
      - cmd: |
          echo "=== Environment Check ==="
          echo "Go version: $(go version)"
          echo "Task version: $(task --version)"

          echo -e "\n=== Required Tools ==="
          for tool in golangci-lint gosec goimports; do
            if command -v $tool >/dev/null; then
              echo "✅ $tool: $(command -v $tool)"
            else
              echo "❌ $tool: not found"
            fi
          done

          echo -e "\n=== Project Status ==="
          echo "Module: $(go list -m)"
          echo "Dependencies: $(go list -m all | wc -l) modules"
          echo "Build directory: {{.BUILD_DIR}}"
          echo "Assets directory: {{.ASSETS_DIR}}"
        silent: true

  # === CI/CD TASKS ===

  ci:test:
    desc: CI test pipeline
    cmds:
      - task: mod:verify
      - task: quality
      - task: test:coverage

  ci:build:
    desc: CI build pipeline
    deps: [ci:test]
    cmds:
      - task: build:all
      - task: release:checksums

  # === PLATFORM-SPECIFIC TASKS ===

  install:local:
    desc: Install to local system (Linux only)
    deps: [build]
    preconditions:
      - sh: test "{{OS}}" = "linux"
        msg: 'Local install only supported on Linux'
    cmds:
      - sudo cp {{.BUILD_DIR}}/{{.APP_NAME}} /usr/local/bin/
      - echo "Installed to /usr/local/bin/{{.APP_NAME}}"

  uninstall:local:
    desc: Uninstall from local system (Linux only)
    preconditions:
      - sh: test "{{OS}}" = "linux"
        msg: 'Local uninstall only supported on Linux'
    cmds:
      - sudo rm -f /usr/local/bin/{{.APP_NAME}}
      - echo "Removed from /usr/local/bin/{{.APP_NAME}}"
```

## Key TaskFile Features for Go Development

### 1. Variables and Templating

```yaml
vars:
  VERSION:
    sh: git describe --tags --always --dirty # Dynamic variable from command
  BUILD_TIME:
    sh: date -u '+%Y-%m-%d_%H:%M:%S'
  STATIC_VAR: 'hello world' # Static variable

  # Complex LDFLAGS with variable interpolation
  LDFLAGS: >-
    -w -s
    -X main.version={{.VERSION}}
    -X main.buildTime={{.BUILD_TIME}}

# Using variables in tasks
tasks:
  build:
    cmds:
      - go build -ldflags "{{.LDFLAGS}}" -o app
```

### 2. File Watching and Dependencies

```yaml
tasks:
  watch:
    desc: Watch for changes and rebuild
    watch: true
    sources:
      - '**/*.go'
      - 'go.mod'
      - 'assets/**/*'
    cmds:
      - task: test:unit
      - task: build:dev

  build:
    desc: Build binary
    sources:
      - '**/*.go'
      - 'go.mod'
    generates:
      - './build/app'
    cmds:
      - go build -o ./build/app
```

### 3. Cross-Platform Loops

```yaml
vars:
  PLATFORMS: |
    linux/amd64
    linux/arm64
    darwin/amd64
    darwin/arm64
    windows/amd64

tasks:
  build:all:
    cmds:
      - for: { var: PLATFORMS, split: '\n' }
        cmd: |
          export GOOS={{splitList "/" .ITEM | first}}
          export GOARCH={{splitList "/" .ITEM | last}}
          go build -o dist/app-${GOOS}-${GOARCH}{{if eq .GOOS "windows"}}.exe{{end}}
```

### 4. Conditional Execution

```yaml
tasks:
  test:integration:
    deps: [build]
    preconditions:
      - test -f ./build/app
      - sh: which docker
        msg: 'Docker is required for integration tests'
    cmds:
      - docker-compose up -d
      - go test -tags integration ./...
      - defer: docker-compose down
```

### 5. Environment Configuration

```yaml
# .taskrc.yml - Project-specific configuration
env:
  CGO_ENABLED: 0
  GOOS: linux

# .env - Environment variables
DEBUG=true
LOG_LEVEL=info
```

## Development Workflow Examples

### Daily Development

```bash
# Start development environment
task dev

# Run specific tests
task test:unit
task test:integration

# Check code quality
task quality

# Build and run
task build && task run

# Watch for changes
task watch
```

### Release Workflow

```bash
# Prepare release
task release:prepare

# Check what will be built
task info

# Build for all platforms
task build:all

# Generate checksums
task release:checksums

# Create archives
task release:archive
```

### CI/CD Integration

```bash
# In GitHub Actions
- name: Run CI tests
  run: task ci:test

- name: Build artifacts
  run: task ci:build
```

## Advanced Features

### 1. Include External Taskfiles

```yaml
# Taskfile.yml
version: '3'

includes:
  docker: ./taskfiles/Docker.yml
  test: ./taskfiles/Testing.yml

# Use with: task docker:build, task test:unit
```

### 2. Matrix Builds

```yaml
tasks:
  test:matrix:
    matrix:
      GO_VERSION: [1.21, 1.22, 1.23]
      OS: [ubuntu-latest, windows-latest, macos-latest]
    cmds:
      - echo "Testing Go {{.GO_VERSION}} on {{.OS}}"
      - go test ./...
```

### 3. Silent and Interactive Tasks

```yaml
tasks:
  setup:
    desc: Interactive project setup
    interactive: true
    cmds:
      - read -p "Enter project name: " name && echo $name > .project-name

  clean:
    desc: Clean build artifacts
    silent: true
    cmds:
      - rm -rf build/
      - rm -rf dist/
```

## Best Practices

### 1. Task Organization

- **Group related tasks**: Use consistent prefixes (`test:`, `build:`, `release:`)
- **Use aliases**: Provide short aliases for frequently used tasks
- **Clear descriptions**: Every task should have a helpful description
- **Dependencies**: Use `deps` for prerequisite tasks

### 2. File Management

- **Sources and generates**: Specify file dependencies for optimal caching
- **Preconditions**: Validate environment before running tasks
- **Clean tasks**: Provide cleanup tasks for build artifacts

### 3. Cross-Platform Support

- **Use TaskFile functions**: `{{OS}}`, `{{ARCH}}`, `{{exeExt}}`
- **Conditional logic**: Use preconditions for platform-specific tasks
- **Path handling**: Use `joinPath` for cross-platform paths

### 4. Error Handling

```yaml
set:
  - errexit # Exit on command failure
  - pipefail # Fail on pipe errors
  - nounset # Fail on undefined variables

tasks:
  risky-task:
    ignore_error: true # Continue on failure
    cmds:
      - might-fail-command
```

## Integration with Go Tools

### 1. Go Module Management

```yaml
tasks:
  mod:tidy:
    sources: [go.mod, go.sum]
    cmds:
      - go mod tidy

  mod:check:
    cmds:
      - go mod verify
      - go mod download
```

### 2. Code Quality Tools

```yaml
tasks:
  lint:
    cmds:
      - golangci-lint run ./...

  security:
    cmds:
      - gosec ./...

  format:
    cmds:
      - gofmt -w .
      - goimports -w .
```

### 3. Testing Integration

```yaml
tasks:
  test:coverage:
    generates: [coverage.out, coverage.html]
    cmds:
      - go test -coverprofile=coverage.out ./...
      - go tool cover -html=coverage.out -o coverage.html
```

## Troubleshooting

### Common Issues

1. **Task not found**: Check task name spelling and use `task --list`
2. **File watching not working**: Ensure sources are correctly specified
3. **Variables not expanding**: Check YAML syntax and variable names
4. **Cross-platform issues**: Use TaskFile built-in functions

### Debug Mode

```bash
# Verbose output
task --verbose build

# Dry run (show what would be executed)
task --dry build

# List all tasks
task --list-all
```

This comprehensive TaskFile setup provides a robust foundation for Go installer development, replacing traditional Makefiles with a more maintainable and feature-rich build system.
