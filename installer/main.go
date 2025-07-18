package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

var version = "dev" // Set by ldflags during build

// detectPlatform returns the current platform information
func detectPlatform() (goos, goarch, filename string) {
	goos = runtime.GOOS
	goarch = runtime.GOARCH
	if goos == "windows" {
		filename = "vibe.exe"
	} else {
		filename = "vibe"
	}
	return
}

// getInstallPath returns the install path for the current OS
func getInstallPath() string {
	return getInstallPathForOS(runtime.GOOS)
}

// getInstallPathForOS returns the install path for a specific OS (for testing)
func getInstallPathForOS(goos string) string {
	switch goos {
	case "windows":
		userProfile := os.Getenv("USERPROFILE")
		if userProfile == "" {
			return filepath.Join("C:", "Users", "Default", ".local", "bin")
		}
		return filepath.Join(userProfile, ".local", "bin")
	default:
		// Use user directory for safer testing - can be changed to /usr/local/bin for production
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "/usr/local/bin" // fallback
		}
		return filepath.Join(homeDir, ".local", "bin")
	}
}

// buildDownloadURL constructs the GitHub releases download URL
func buildDownloadURL(goos, goarch, version string) string {
	baseURL := "https://github.com/vhybzOS/.vibe/releases/download"

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
		osName = "macos"
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

// validateInstallPath checks if the install path is valid
func validateInstallPath(path string) error {
	if path == "" {
		return fmt.Errorf("install path cannot be empty")
	}

	if !filepath.IsAbs(path) {
		return fmt.Errorf("install path must be absolute: %s", path)
	}

	return nil
}

// GitHubRelease represents a GitHub release response
type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
}

// getLatestVersion gets the latest release version from GitHub API
func getLatestVersion() (string, error) {
	url := "https://api.github.com/repos/vhybzOS/.vibe/releases/latest"

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		// Fallback to hardcoded version if API fails  
		fmt.Printf("⚠️  GitHub API unavailable, using fallback version\n")
		return "v0.7.27", nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Fallback to hardcoded version if API returns error
		fmt.Printf("⚠️  GitHub API error (%d), using fallback version\n", resp.StatusCode)
		return "v0.7.27", nil
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		// Fallback to hardcoded version if JSON decode fails
		fmt.Printf("⚠️  Failed to parse GitHub API response, using fallback version\n")
		return "v0.7.27", nil
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

// installBinary places the downloaded binary in the install location
func installBinary(srcPath, destPath string) error {
	fmt.Printf("📦 Installing binary to: %s\n", destPath)

	// Open source file
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer src.Close()

	// Create destination file
	dst, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer dst.Close()

	// Copy file
	_, err = io.Copy(dst, src)
	if err != nil {
		return fmt.Errorf("failed to copy binary: %w", err)
	}

	// Make executable (Unix only)
	if runtime.GOOS != "windows" {
		err = os.Chmod(destPath, 0755)
		if err != nil {
			return fmt.Errorf("failed to make binary executable: %w", err)
		}
	}

	// Clean up temporary file
	os.Remove(srcPath)

	fmt.Printf("✅ Binary installed successfully!\n")
	return nil
}

// verifyInstallation checks that the installation was successful
func verifyInstallation(binaryPath string) error {
	fmt.Printf("🔍 Verifying installation...\n")

	// Check if file exists
	if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
		return fmt.Errorf("binary not found at: %s", binaryPath)
	}

	// Check if file is executable (Unix only)
	if runtime.GOOS != "windows" {
		info, err := os.Stat(binaryPath)
		if err != nil {
			return fmt.Errorf("failed to stat binary: %w", err)
		}

		mode := info.Mode()
		if mode&0111 == 0 {
			return fmt.Errorf("binary is not executable: %s", binaryPath)
		}
	}

	fmt.Printf("✅ Installation verified!\n")
	return nil
}

func main() {
	fmt.Printf("🚀 Installing .vibe %s...\n", version)

	// 1. Detect platform
	goos, goarch, filename := detectPlatform()
	fmt.Printf("📱 Platform: %s/%s\n", goos, goarch)

	// 2. Get latest version
	latestVersion, err := getLatestVersion()
	if err != nil {
		fmt.Printf("❌ Failed to get latest version: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("📦 Latest version: %s\n", latestVersion)

	// 3. Build download URL
	downloadURL := buildDownloadURL(goos, goarch, latestVersion)
	fmt.Printf("🔗 Download URL: %s\n", downloadURL)

	// 4. Get install path
	installPath := getInstallPath()
	err = validateInstallPath(installPath)
	if err != nil {
		fmt.Printf("❌ Invalid install path: %v\n", err)
		os.Exit(1)
	}

	// Ensure install directory exists
	err = os.MkdirAll(installPath, 0755)
	if err != nil {
		fmt.Printf("❌ Failed to create install directory: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("📁 Install directory: %s\n", installPath)

	// 5. Install all dependencies (Rust + cargo packages + WASM file)
	fmt.Printf("🔧 Installing dependencies...\n")
	err = installAllModules(installPath)
	if err != nil {
		fmt.Printf("❌ Dependency installation failed: %v\n", err)
		os.Exit(1)
	}

	// 6. Download main binary
	tempPath := filepath.Join(os.TempDir(), filename)
	err = downloadBinary(downloadURL, tempPath)
	if err != nil {
		fmt.Printf("❌ Download failed: %v\n", err)
		os.Exit(1)
	}

	// 7. Install main binary
	finalPath := filepath.Join(installPath, filename)
	err = installBinary(tempPath, finalPath)
	if err != nil {
		fmt.Printf("❌ Installation failed: %v\n", err)
		os.Exit(1)
	}

	// 8. Verify all installations
	err = verifyInstallation(finalPath)
	if err != nil {
		fmt.Printf("❌ Binary verification failed: %v\n", err)
		os.Exit(1)
	}

	err = verifyAllModules()
	if err != nil {
		fmt.Printf("❌ Module verification failed: %v\n", err)
		os.Exit(1)
	}

	// 9. Display success message with version info
	fmt.Printf("✅ Installation complete!\n")
	fmt.Printf("🎉 Try: %s --version\n", strings.TrimSuffix(filename, ".exe"))
	
	fmt.Printf("\n📦 Installed components:\n")
	versions := getVersionInfo()
	for component, version := range versions {
		fmt.Printf("   • %s: v%s\n", component, version)
	}
}
