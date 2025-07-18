package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// Version constants - all dependencies locked for reproducible builds
const (
	CODE2PROMPT_VERSION    = "3.0.2"
	SURREALDB_VERSION      = "2.3.5"
	TREE_SITTER_TS_VERSION = "0.23.2"

	TREE_SITTER_WASM_URL = "https://unpkg.com/tree-sitter-typescript@" + TREE_SITTER_TS_VERSION + "/tree-sitter-typescript.wasm"
)

// checkRustInstallation verifies if Rust and Cargo are installed
func checkRustInstallation() bool {
	fmt.Printf("🔍 Checking Rust installation...\n")

	cmd := exec.Command("cargo", "--version")
	if err := cmd.Run(); err != nil {
		fmt.Printf("❌ Rust/Cargo not found\n")
		return false
	}

	fmt.Printf("✅ Rust/Cargo is installed\n")
	return true
}

// installRustToolchain installs Rust using rustup
func installRustToolchain() error {
	fmt.Printf("🦀 Installing Rust toolchain...\n")

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		// Windows: Download and run rustup-init.exe
		cmd = exec.Command("powershell", "-Command", 
			"Invoke-WebRequest -Uri https://win.rustup.rs -OutFile rustup-init.exe; ./rustup-init.exe -y; Remove-Item rustup-init.exe")
	} else {
		// Unix-like: Use curl | sh pattern
		cmd = exec.Command("sh", "-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y")
	}

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to install Rust: %w", err)
	}

	// Add Cargo to PATH for current session
	if runtime.GOOS != "windows" {
		os.Setenv("PATH", os.Getenv("HOME")+"/.cargo/bin:"+os.Getenv("PATH"))
	}

	fmt.Printf("✅ Rust toolchain installed!\n")
	return nil
}

// installCargoPackage installs a specific cargo package with version
func installCargoPackage(packageName, version string) error {
	fmt.Printf("📦 Installing %s v%s...\n", packageName, version)

	cmd := exec.Command("cargo", "install", packageName, "--version", version)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to install %s: %w", packageName, err)
	}

	fmt.Printf("✅ %s v%s installed!\n", packageName, version)
	return nil
}

// downloadWasmFile downloads the tree-sitter WASM file to data directory
func downloadWasmFile(installPath string) error {
	fmt.Printf("📥 Downloading tree-sitter-typescript WASM file...\n")

	// Create data directory alongside the executable
	dataDir := filepath.Join(installPath, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	wasmPath := filepath.Join(dataDir, "tree-sitter-typescript.wasm")

	// Download WASM file
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(TREE_SITTER_WASM_URL)
	if err != nil {
		return fmt.Errorf("failed to download WASM file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d %s", resp.StatusCode, resp.Status)
	}

	// Create WASM file
	out, err := os.Create(wasmPath)
	if err != nil {
		return fmt.Errorf("failed to create WASM file: %w", err)
	}
	defer out.Close()

	// Copy with progress
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save WASM file: %w", err)
	}

	fmt.Printf("✅ WASM file downloaded to: %s\n", wasmPath)
	return nil
}

// installAllModules installs all required dependencies
func installAllModules(installPath string) error {
	fmt.Printf("🔧 Installing all dependencies...\n")

	// 1. Check/Install Rust
	if !checkRustInstallation() {
		if err := installRustToolchain(); err != nil {
			return err
		}
		
		// Verify installation worked
		if !checkRustInstallation() {
			return fmt.Errorf("Rust installation verification failed")
		}
	}

	// 2. Install cargo packages
	packages := map[string]string{
		"code2prompt": CODE2PROMPT_VERSION,
		"surrealdb":   SURREALDB_VERSION,
	}

	for packageName, version := range packages {
		if err := installCargoPackage(packageName, version); err != nil {
			return err
		}
	}

	// 3. Download WASM file
	if err := downloadWasmFile(installPath); err != nil {
		return err
	}

	return nil
}

// verifyAllModules checks that all dependencies are working
func verifyAllModules() error {
	fmt.Printf("🔍 Verifying all dependencies...\n")

	// Test cargo packages
	packages := []string{"code2prompt", "surreal"}
	for _, pkg := range packages {
		cmd := exec.Command(pkg, "--version")
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("verification failed for %s: %w", pkg, err)
		}
		fmt.Printf("✅ %s is working\n", pkg)
	}

	fmt.Printf("✅ All dependencies verified!\n")
	return nil
}

// getVersionInfo returns version information for all dependencies
func getVersionInfo() map[string]string {
	return map[string]string{
		"code2prompt":              CODE2PROMPT_VERSION,
		"surrealdb":                SURREALDB_VERSION,
		"tree-sitter-typescript":   TREE_SITTER_TS_VERSION,
	}
}