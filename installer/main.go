package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

var version = "dev" // Set by ldflags during build

// BinaryInfo holds information about a binary to download
type BinaryInfo struct {
	Name     string
	Version  string
	URL      string
	Checksum string
	Path     string
}

// detectPlatform returns the current platform information
func detectPlatform() (goos, goarch string) {
	return runtime.GOOS, runtime.GOARCH
}

// buildVibeDownloadURL constructs the GitHub releases download URL for vibe binary
func buildVibeDownloadURL(goos, goarch, version string) string {
	baseURL := "https://github.com/vhybzOS/dotvibe/releases/download"

	// Map Go arch names to release asset names
	var archName string
	switch goarch {
	case "amd64":
		archName = "x86_64"
	case "arm64":
			archName = "arm64"
	default:
		archName = goarch
	}

	// Map Go OS names to release asset names
	var osName string
	switch goos {
	case "darwin":
		osName = "darwin"
	default:
		osName = goos
	}

	var filename string
	if goos == "windows" {
		filename = fmt.Sprintf("vibe-%s-%s-%s.exe", version, osName, archName)
	} else {
		filename = fmt.Sprintf("vibe-%s-%s-%s", version, osName, archName)
	}

	return fmt.Sprintf("%s/%s/%s", baseURL, version, filename)
}

// buildSurrealDBDownloadURL constructs download URL for SurrealDB binary
func buildSurrealDBDownloadURL(goos, goarch, version string) string {
	baseURL := "https://github.com/surrealdb/surrealdb/releases/download"

	// Map architectures
	var archName string
	switch goarch {
	case "amd64":
		archName = "amd64"
	case "arm64":
		archName = "arm64"
	default:
		archName = goarch
	}

	// Map OS names and build filename (SurrealDB releases are in .tgz format)
	var filename string
	switch goos {
	case "windows":
		filename = fmt.Sprintf("surreal-%s.windows-%s.tgz", version, archName)
	case "darwin":
		filename = fmt.Sprintf("surreal-%s.darwin-%s.tgz", version, archName)
	case "linux":
		filename = fmt.Sprintf("surreal-%s.linux-%s.tgz", version, archName)
	default:
		filename = fmt.Sprintf("surreal-%s.%s-%s.tgz", version, goos, archName)
	}

	return fmt.Sprintf("%s/%s/%s", baseURL, version, filename)
}

// buildCode2PromptDownloadURL constructs download URL for code2prompt binary
func buildCode2PromptDownloadURL(goos, goarch, version string) string {
	baseURL := "https://github.com/mufeedvh/code2prompt/releases/download"

	// Map architectures
	var archName string
	switch goarch {
	case "amd64":
		archName = "x86_64"
	case "arm64":
		archName = "aarch64"
	default:
		archName = goarch
	}

	// Build filename based on OS
	var filename string
	switch goos {
	case "windows":
		filename = fmt.Sprintf("code2prompt-%s-pc-windows-msvc.exe", archName)
	case "darwin":
		filename = fmt.Sprintf("code2prompt-%s-apple-darwin", archName)
	case "linux":
		filename = fmt.Sprintf("code2prompt-%s-unknown-linux-gnu", archName)
	default:
		return "" // Unsupported platform
	}

	return fmt.Sprintf("%s/%s/%s", baseURL, version, filename)
}

// calculateSHA256 calculates the SHA256 checksum of a file
func calculateSHA256(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", fmt.Errorf("failed to calculate hash: %w", err)
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// validateChecksum validates a file against its expected SHA256 checksum
func validateChecksum(filePath, expectedChecksum string) error {
	if expectedChecksum == "" {
		fmt.Printf("⚠️  No checksum provided for %s - skipping validation\n", filepath.Base(filePath))
		return nil
	}

	actualChecksum, err := calculateSHA256(filePath)
	if err != nil {
		return fmt.Errorf("failed to calculate checksum: %w", err)
	}

	if actualChecksum != expectedChecksum {
		return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", filepath.Base(filePath), expectedChecksum, actualChecksum)
	}

	fmt.Printf("✅ Checksum verified for %s\n", filepath.Base(filePath))
	return nil
}

// GitHubRelease represents a GitHub release response
type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
}

// getLatestVersion gets the latest release version from GitHub API
func getLatestVersion() (string, error) {
	url := "https://api.github.com/repos/vhybzOS/dotvibe/releases/latest"

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		// Fallback to hardcoded version if API fails  
		fmt.Printf("⚠️  GitHub API unavailable, using fallback version\n")
		return "v0.4.0", nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Fallback to hardcoded version if API returns error
		fmt.Printf("⚠️  GitHub API error (%d), using fallback version\n", resp.StatusCode)
		return "v0.4.0", nil
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		// Fallback to hardcoded version if JSON decode fails
		fmt.Printf("⚠️  Failed to parse GitHub API response, using fallback version\n")
		return "v0.4.0", nil
	}

	return release.TagName, nil
}

// ProgressWriter wraps an io.Writer to track download progress
type ProgressWriter struct {
	io.Writer
	total   int64
	written int64
}

func (pw *ProgressWriter) Write(p []byte) (int, error) {
	n, err := pw.Writer.Write(p)
	if err != nil {
		return n, err
	}

	pw.written += int64(n)

	// Simple progress display
	if pw.total > 0 {
		percent := float64(pw.written) / float64(pw.total) * 100
		fmt.Printf("\r📥 Downloading... %.1f%% (%d/%d bytes)", percent, pw.written, pw.total)
	} else {
		fmt.Printf("\r📥 Downloading... %d bytes", pw.written)
	}

	return n, err
}

// downloadBinary downloads the vibe binary from GitHub releases with progress
func downloadBinary(url, destPath string) error {
	fmt.Printf("🔗 Downloading from: %s\n", url)

	// Create the destination file
	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer out.Close()

	// Make HTTP request
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("failed to download binary: %w", err)
	}
	defer resp.Body.Close()

	// Check if download was successful
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d %s", resp.StatusCode, resp.Status)
	}

	// Create progress writer
	progressWriter := &ProgressWriter{
		Writer: out,
		total:  resp.ContentLength,
	}

	// Copy with progress
	_, err = io.Copy(progressWriter, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save binary: %w", err)
	}

	fmt.Printf("\n✅ Download complete!\n")
	return nil
}

// installBinary downloads and installs a binary with checksum validation
func installBinary(binary BinaryInfo) error {
	fmt.Printf("📦 Installing %s %s...\n", binary.Name, binary.Version)

	// Determine if this is a .tgz file (SurrealDB case)
	isTgz := filepath.Ext(binary.URL) == ".tgz"
	
	// Download to temporary file
	var tempPath string
	if isTgz {
		tempPath = filepath.Join(os.TempDir(), fmt.Sprintf("%s.tgz", binary.Name))
	} else {
		tempPath = filepath.Join(os.TempDir(), filepath.Base(binary.Path))
	}
	
	err := downloadBinary(binary.URL, tempPath)
	if err != nil {
		return fmt.Errorf("failed to download %s: %w", binary.Name, err)
	}

	// Validate checksum if provided
	if err := validateChecksum(tempPath, binary.Checksum); err != nil {
		os.Remove(tempPath) // Clean up on validation failure
		return fmt.Errorf("checksum validation failed for %s: %w", binary.Name, err)
	}

	// Ensure destination directory exists
	destDir := filepath.Dir(binary.Path)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	// Handle .tgz extraction or regular binary installation
	if isTgz {
		// Extract .tgz file and get the binary
		err = extractTgzBinary(tempPath, binary.Path, binary.Name)
		os.Remove(tempPath) // Clean up downloaded .tgz
		if err != nil {
			return fmt.Errorf("failed to extract %s from tgz: %w", binary.Name, err)
		}
	} else {
		// Regular binary installation
		if err := os.Rename(tempPath, binary.Path); err != nil {
			// If rename fails, try copy and delete
			if copyErr := copyFile(tempPath, binary.Path); copyErr != nil {
				os.Remove(tempPath)
				return fmt.Errorf("failed to install binary: %w", copyErr)
			}
			os.Remove(tempPath)
		}
	}

	// Make executable (Unix only)
	if runtime.GOOS != "windows" {
		if err := os.Chmod(binary.Path, 0755); err != nil {
			return fmt.Errorf("failed to make binary executable: %w", err)
		}
	}

	fmt.Printf("✅ %s installed successfully!\n", binary.Name)
	return nil
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, sourceFile); err != nil {
		return err
	}

	// Copy permissions
	sourceInfo, err := os.Stat(src)
	if err != nil {
		return err
	}

	return os.Chmod(dst, sourceInfo.Mode())
}

// extractTgzBinary extracts a binary from a .tgz file
func extractTgzBinary(tgzPath, destPath, binaryName string) error {
	// Open the .tgz file
	file, err := os.Open(tgzPath)
	if err != nil {
		return fmt.Errorf("failed to open tgz file: %w", err)
	}
	defer file.Close()

	// Create gzip reader
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzipReader.Close()

	// Create tar reader
	tarReader := tar.NewReader(gzipReader)

	// Look for the binary file in the tar archive
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break // End of archive
		}
		if err != nil {
			return fmt.Errorf("failed to read tar header: %w", err)
		}

		// Check if this is the binary we're looking for
		if header.Typeflag == tar.TypeReg && filepath.Base(header.Name) == binaryName {
			// Create the destination file
			destFile, err := os.Create(destPath)
			if err != nil {
				return fmt.Errorf("failed to create destination file: %w", err)
			}
			defer destFile.Close()

			// Copy the binary from tar to destination
			if _, err := io.Copy(destFile, tarReader); err != nil {
				return fmt.Errorf("failed to extract binary: %w", err)
			}

			return nil // Success
		}
	}

	return fmt.Errorf("binary '%s' not found in tgz archive", binaryName)
}

// verifyInstallation checks that all binaries are installed correctly
func verifyInstallation(binaries []BinaryInfo) error {
	fmt.Printf("🔍 Verifying installation...\n")

	for _, binary := range binaries {
		// Check if file exists
		if _, err := os.Stat(binary.Path); os.IsNotExist(err) {
			return fmt.Errorf("%s binary not found at: %s", binary.Name, binary.Path)
		}

		// Check if file is executable (Unix only)
		if runtime.GOOS != "windows" {
			info, err := os.Stat(binary.Path)
			if err != nil {
				return fmt.Errorf("failed to stat %s binary: %w", binary.Name, err)
			}

			mode := info.Mode()
			if mode&0111 == 0 {
				return fmt.Errorf("%s binary is not executable: %s", binary.Name, binary.Path)
			}
		}

		fmt.Printf("✅ %s verified\n", binary.Name)
	}

	fmt.Printf("✅ All installations verified!\n")
	return nil
}

// downloadTreeSitterWASM downloads the tree-sitter WASM files
func downloadTreeSitterWASM(dataDir string) error {
	fmt.Printf("📥 Downloading tree-sitter WASM files...\n")

	// Tree-sitter WASM files to download
	wasmFiles := []struct {
		name string
		url  string
	}{
		{
			name: "tree-sitter.wasm",
			url:  "https://github.com/tree-sitter/tree-sitter/releases/download/v0.20.8/tree-sitter.wasm",
		},
		{
			name: "tree-sitter-typescript.wasm",
			url:  "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.20.3/tree-sitter-typescript.wasm",
		},
	}

	for _, wasmFile := range wasmFiles {
		destPath := filepath.Join(dataDir, wasmFile.name)
		err := downloadBinary(wasmFile.url, destPath)
		if err != nil {
			fmt.Printf("⚠️  Failed to download %s: %v\n", wasmFile.name, err)
			continue // Continue with other files
		}
		fmt.Printf("✅ %s downloaded\n", wasmFile.name)
	}

	return nil
}

// getBinaryVersions returns the latest versions for all required binaries
func getBinaryVersions() (vibeVersion, surrealVersion, code2promptVersion string, err error) {
	// Get vibe version (this is the main version we're installing)
	vibeVersion, err = getLatestVersion()
	if err != nil {
		return "", "", "", fmt.Errorf("failed to get vibe version: %w", err)
	}

	// For now, use hardcoded versions for dependencies
	// TODO: Implement API calls to get latest versions
	surrealVersion = "v2.3.5"
	code2promptVersion = "v3.0.2"

	return vibeVersion, surrealVersion, code2promptVersion, nil
}

func main() {
	// Parse command line flags
	var (
		globalFlag = flag.Bool("global", false, "Install system-wide (requires admin/sudo privileges)")
		userFlag   = flag.Bool("user", false, "Install for current user only")
		helpFlag   = flag.Bool("help", false, "Show usage information")
		versionFlag = flag.Bool("version", false, "Show installer version")
	)
	flag.Parse()

	// Handle version flag
	if *versionFlag {
		fmt.Printf("dotvibe installer %s\n", version)
		os.Exit(0)
	}

	// Handle help flag
	if *helpFlag {
		showUsage()
		os.Exit(0)
	}

	fmt.Printf("🚀 Installing dotvibe %s...\n", version)

	// 1. Detect platform
	goos, goarch := detectPlatform()
	fmt.Printf("📱 Platform: %s/%s\n", goos, goarch)

	// 2. Determine installation type from flags
	installType, err := getInstallationTypeFromFlags(*globalFlag, *userFlag)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		showUsage()
		os.Exit(1)
	}

	// 3. Show installation type
	showInstallationType(installType)

	// 4. Handle elevation if needed
	// Auto-confirm elevation if explicit CLI flags were used
	autoConfirm := *globalFlag || *userFlag
	err = handleElevationWorkflow(installType, autoConfirm)
	if err != nil {
		fmt.Printf("❌ Elevation failed: %v\n", err)
		os.Exit(1)
	}

	// 5. Get latest versions
	vibeVersion, surrealVersion, code2promptVersion, err := getBinaryVersions()
	if err != nil {
		fmt.Printf("❌ Failed to get versions: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("📦 Versions: vibe=%s surreal=%s code2prompt=%s\n", vibeVersion, surrealVersion, code2promptVersion)

	// 6. Create path configuration
	pathConfig, err := NewPathConfig(installType, vibeVersion)
	if err != nil {
		fmt.Printf("❌ Failed to create path config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("📁 Installation: %s\n", pathConfig.String())

	// 7. Validate and create directories
	err = pathConfig.Validate()
	if err != nil {
		fmt.Printf("❌ Path validation failed: %v\n", err)
		os.Exit(1)
	}

	err = pathConfig.CreateDirectories()
	if err != nil {
		fmt.Printf("❌ Failed to create directories: %v\n", err)
		os.Exit(1)
	}

	// 8. Prepare binary downloads
	binaries := []BinaryInfo{
		{
			Name:    "vibe",
			Version: vibeVersion,
			URL:     buildVibeDownloadURL(goos, goarch, vibeVersion),
			Path:    pathConfig.GetBinaryDestination(),
		},
		{
			Name:    "surreal",
			Version: surrealVersion,
			URL:     buildSurrealDBDownloadURL(goos, goarch, surrealVersion),
			Path:    filepath.Join(pathConfig.BinDir, getSurrealExecutableName()),
		},
		{
			Name:    "code2prompt",
			Version: code2promptVersion,
			URL:     buildCode2PromptDownloadURL(goos, goarch, code2promptVersion),
			Path:    filepath.Join(pathConfig.BinDir, getCode2PromptExecutableName()),
		},
	}

	// 9. Download and install all binaries
	fmt.Printf("\n📥 Downloading binaries...\n")
	for _, binary := range binaries {
		if binary.URL == "" {
			fmt.Printf("⚠️  Skipping %s - unsupported platform\n", binary.Name)
			continue
		}

		err = installBinary(binary)
		if err != nil {
			fmt.Printf("❌ Failed to install %s: %v\n", binary.Name, err)
			os.Exit(1)
		}
	}

	// 10. Download tree-sitter WASM files
	err = downloadTreeSitterWASM(pathConfig.GetDataDirectory())
	if err != nil {
		fmt.Printf("⚠️  Failed to download WASM files: %v\n", err)
		// Don't exit - WASM files are optional
	}

	// 11. Verify installation
	err = verifyInstallation(binaries)
	if err != nil {
		fmt.Printf("❌ Installation verification failed: %v\n", err)
		os.Exit(1)
	}

	// 12. Create symlink for easy access
	err = pathConfig.CreateSymlink()
	if err != nil {
		fmt.Printf("⚠️  Failed to create symlink: %v\n", err)
		// Don't exit - symlink is optional
	}

	// 13. Display success message
	fmt.Printf("\n✅ Installation complete!\n")
	fmt.Printf("🎉 Try: vibe --version\n")
	fmt.Printf("\n📦 Installed components:\n")
	for _, binary := range binaries {
		if binary.URL != "" {
			fmt.Printf("   • %s: %s\n", binary.Name, binary.Version)
		}
	}
	fmt.Printf("\n📁 Installation directory: %s\n", pathConfig.BaseDir)
	fmt.Printf("🔧 Add to PATH: %s\n", pathConfig.GetPathForBinary())

	if pathConfig.IsSystemInstall() {
		fmt.Printf("\n📝 Note: System-wide installation completed. All users can now use 'vibe'.\n")
	} else {
		fmt.Printf("\n📝 Note: User installation completed. Only current user can use 'vibe'.\n")
		fmt.Printf("💡 Tip: Use --global flag for system-wide installation next time.\n")
	}

}

// getSurrealExecutableName returns the correct executable name for SurrealDB
func getSurrealExecutableName() string {
	if runtime.GOOS == "windows" {
		return "surreal.exe"
	}
	return "surreal"
}

// getCode2PromptExecutableName returns the correct executable name for code2prompt
func getCode2PromptExecutableName() string {
	if runtime.GOOS == "windows" {
		return "code2prompt.exe"
	}
	return "code2prompt"
}

// getInstallationTypeFromFlags determines installation type from command line flags
func getInstallationTypeFromFlags(globalFlag, userFlag bool) (InstallationType, error) {
	// Both flags specified
	if globalFlag && userFlag {
		return "", fmt.Errorf("cannot specify both --global and --user flags")
	}

	// Global flag specified
	if globalFlag {
		return SystemInstall, nil
	}

	// User flag specified
	if userFlag {
		return UserInstall, nil
	}

	// No flags specified - default to user installation
	return UserInstall, nil
}

// showUsage displays usage information
func showUsage() {
	fmt.Printf(`dotvibe installer %s

USAGE:
    ./install-dotvibe [FLAGS]

FLAGS:
    --global    Install system-wide (requires admin/sudo privileges)
                Location: /usr/local/dotvibe/{version}/ (Unix) or C:\\Program Files\\dotvibe\\{version}\\ (Windows)
                
    --user      Install for current user only (default)
                Location: ~/.local/dotvibe/{version}/ (Unix) or %%USERPROFILE%%\\.local\\dotvibe\\{version}\\ (Windows)
                
    --version   Show installer version
    --help      Show this help message

EXAMPLES:
    ./install-dotvibe              # Install for current user (default)
    ./install-dotvibe --user       # Install for current user (explicit)
    ./install-dotvibe --global     # Install system-wide (requires elevation)
    
NOTE:
    System-wide installation (--global) requires administrator privileges:
    • Windows: Run as Administrator or accept UAC prompt
    • Unix/Linux/macOS: Run with sudo or accept sudo prompt

`, version)
}
