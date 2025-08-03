package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// InstallationType represents the type of installation
type InstallationType string

const (
	SystemInstall InstallationType = "system"
	UserInstall   InstallationType = "user"
)

// PathConfig holds all path-related configuration
type PathConfig struct {
	Type        InstallationType
	Version     string
	BaseDir     string
	BinDir      string
	DataDir     string
	VibeExe     string
	ConfigFile  string
}

// getSystemBasePath returns the system-wide base path for the current OS
func getSystemBasePath() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join("C:", "Program Files", "dotvibe")
	default: // Unix-like systems (Linux, macOS, etc.)
		return "/usr/local/dotvibe"
	}
}

// getUserBasePath returns the user-specific base path for the current OS
func getUserBasePath() (string, error) {
	var baseDir string
	
	switch runtime.GOOS {
	case "windows":
		userProfile := os.Getenv("USERPROFILE")
		if userProfile == "" {
			return "", fmt.Errorf("USERPROFILE environment variable not set")
		}
		baseDir = filepath.Join(userProfile, ".local", "dotvibe")
	default: // Unix-like systems
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get user home directory: %w", err)
		}
		baseDir = filepath.Join(homeDir, ".local", "dotvibe")
	}
	
	return baseDir, nil
}

// NewPathConfig creates a new PathConfig for the specified installation type and version
func NewPathConfig(installType InstallationType, version string) (*PathConfig, error) {
	if version == "" {
		return nil, fmt.Errorf("version cannot be empty")
	}
	
	// Normalize version (remove 'v' prefix if present)
	version = strings.TrimPrefix(version, "v")
	
	var baseDir string
	var err error
	
	switch installType {
	case SystemInstall:
		baseDir = getSystemBasePath()
	case UserInstall:
		baseDir, err = getUserBasePath()
		if err != nil {
			return nil, fmt.Errorf("failed to get user base path: %w", err)
		}
	default:
		return nil, fmt.Errorf("invalid installation type: %s", installType)
	}
	
	// Create versioned directory structure
	versionedDir := filepath.Join(baseDir, version)
	binDir := filepath.Join(versionedDir, "bin")
	dataDir := filepath.Join(versionedDir, "data")
	
	// Determine executable name
	vibeExe := "vibe"
	if runtime.GOOS == "windows" {
		vibeExe = "vibe.exe"
	}
	
	config := &PathConfig{
		Type:       installType,
		Version:    version,
		BaseDir:    versionedDir,
		BinDir:     binDir,
		DataDir:    dataDir,
		VibeExe:    filepath.Join(binDir, vibeExe),
		ConfigFile: filepath.Join(versionedDir, "config.json"),
	}
	
	return config, nil
}

// CreateDirectories creates all necessary directories for the installation
func (pc *PathConfig) CreateDirectories() error {
	directories := []string{
		pc.BaseDir,
		pc.BinDir,
		pc.DataDir,
	}
	
	for _, dir := range directories {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}
	
	return nil
}

// Validate checks if the path configuration is valid and accessible
func (pc *PathConfig) Validate() error {
	// Check if base directory is absolute
	if !filepath.IsAbs(pc.BaseDir) {
		return fmt.Errorf("base directory must be absolute: %s", pc.BaseDir)
	}
	
	// For system installs, check if we can write to the system directory
	if pc.Type == SystemInstall {
		// Find the closest existing parent directory to test write access
		var testDir string
		switch runtime.GOOS {
		case "windows":
			testDir = "C:\\Program Files"
		default: // Unix-like systems
			testDir = "/usr/local"
		}
		
		testFile := filepath.Join(testDir, ".dotvibe-install-test")
		
		file, err := os.Create(testFile)
		if err != nil {
			return fmt.Errorf("insufficient permissions for system installation at %s: %w", testDir, err)
		}
		file.Close()
		os.Remove(testFile) // Clean up
	}
	
	return nil
}

// GetBinaryDestination returns the full path where the vibe binary should be installed
func (pc *PathConfig) GetBinaryDestination() string {
	return pc.VibeExe
}

// GetDataDirectory returns the data directory path
func (pc *PathConfig) GetDataDirectory() string {
	return pc.DataDir
}

// GetConfigFile returns the config file path
func (pc *PathConfig) GetConfigFile() string {
	return pc.ConfigFile
}

// IsSystemInstall returns true if this is a system-wide installation
func (pc *PathConfig) IsSystemInstall() bool {
	return pc.Type == SystemInstall
}

// GetPathForBinary returns the directory that should be added to PATH
func (pc *PathConfig) GetPathForBinary() string {
	return pc.BinDir
}

// String returns a human-readable description of the path configuration
func (pc *PathConfig) String() string {
	installTypeStr := "user"
	if pc.Type == SystemInstall {
		installTypeStr = "system"
	}
	
	return fmt.Sprintf("%s installation (v%s) at %s", installTypeStr, pc.Version, pc.BaseDir)
}

// GetAllVersions returns all installed versions for the given installation type
func GetAllVersions(installType InstallationType) ([]string, error) {
	var baseDir string
	var err error
	
	switch installType {
	case SystemInstall:
		baseDir = getSystemBasePath()
	case UserInstall:
		baseDir, err = getUserBasePath()
		if err != nil {
			return nil, fmt.Errorf("failed to get user base path: %w", err)
		}
	default:
		return nil, fmt.Errorf("invalid installation type: %s", installType)
	}
	
	// Check if base directory exists
	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		return []string{}, nil // No versions installed
	}
	
	// Read directory contents
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory %s: %w", baseDir, err)
	}
	
	var versions []string
	for _, entry := range entries {
		if entry.IsDir() {
			// Basic version validation (should be semver-like)
			name := entry.Name()
			if isValidVersion(name) {
				versions = append(versions, name)
			}
		}
	}
	
	return versions, nil
}

// isValidVersion performs basic validation to ensure the directory name looks like a version
func isValidVersion(version string) bool {
	// Basic validation: should contain digits and dots, optionally starting with 'v'
	if len(version) == 0 {
		return false
	}
	
	// Remove 'v' prefix if present
	version = strings.TrimPrefix(version, "v")
	
	// Should contain at least one digit and one dot
	hasDigit := false
	hasDot := false
	
	for _, char := range version {
		if char >= '0' && char <= '9' {
			hasDigit = true
		} else if char == '.' {
			hasDot = true
		} else if char != '-' && char != '+' {
			// Allow hyphens and plus signs for pre-release/build metadata
			return false
		}
	}
	
	return hasDigit && hasDot
}

// CleanupVersion removes a specific version installation
func CleanupVersion(installType InstallationType, version string) error {
	config, err := NewPathConfig(installType, version)
	if err != nil {
		return fmt.Errorf("failed to create path config: %w", err)
	}
	
	// Check if the version directory exists
	if _, err := os.Stat(config.BaseDir); os.IsNotExist(err) {
		return fmt.Errorf("version %s is not installed", version)
	}
	
	// Remove the entire version directory
	if err := os.RemoveAll(config.BaseDir); err != nil {
		return fmt.Errorf("failed to remove version directory %s: %w", config.BaseDir, err)
	}
	
	return nil
}

// GetSymlinkPath returns the path where the symlink should be created for easy access
func (pc *PathConfig) GetSymlinkPath() string {
	switch pc.Type {
	case SystemInstall:
		if runtime.GOOS == "windows" {
			return filepath.Join("C:", "Program Files", "dotvibe", "vibe.exe")
		}
		return "/usr/local/bin/vibe"
	case UserInstall:
		if runtime.GOOS == "windows" {
			userProfile := os.Getenv("USERPROFILE")
			return filepath.Join(userProfile, ".local", "bin", "vibe.exe")
		}
		homeDir, _ := os.UserHomeDir()
		return filepath.Join(homeDir, ".local", "bin", "vibe")
	}
	return ""
}

// CreateSymlink creates a symlink to the installed binary for easy access
func (pc *PathConfig) CreateSymlink() error {
	symlinkPath := pc.GetSymlinkPath()
	if symlinkPath == "" {
		return fmt.Errorf("cannot determine symlink path")
	}
	
	// Ensure the symlink directory exists
	symlinkDir := filepath.Dir(symlinkPath)
	if err := os.MkdirAll(symlinkDir, 0755); err != nil {
		return fmt.Errorf("failed to create symlink directory %s: %w", symlinkDir, err)
	}
	
	// Remove existing symlink if it exists
	if _, err := os.Lstat(symlinkPath); err == nil {
		if err := os.Remove(symlinkPath); err != nil {
			return fmt.Errorf("failed to remove existing symlink %s: %w", symlinkPath, err)
		}
	}
	
	// Create the symlink
	if runtime.GOOS == "windows" {
		// On Windows, we can't easily create symlinks without admin privileges
		// so we'll copy the binary instead
		return copyFileForSymlink(pc.VibeExe, symlinkPath)
	} else {
		// On Unix systems, create a proper symlink
		if err := os.Symlink(pc.VibeExe, symlinkPath); err != nil {
			return fmt.Errorf("failed to create symlink from %s to %s: %w", pc.VibeExe, symlinkPath, err)
		}
	}
	
	return nil
}

// copyFileForSymlink copies a file from src to dst (used for Windows "symlink" simulation)
func copyFileForSymlink(src, dst string) error {
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
	
	if _, err := sourceFile.WriteTo(destFile); err != nil {
		return err
	}
	
	// Copy permissions
	sourceInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	
	return os.Chmod(dst, sourceInfo.Mode())
}

// UpdatePATH adds the symlink directory to the user's PATH in shell profiles
func (pc *PathConfig) UpdatePATH() error {
	// Only update PATH for user installations, system installations use /usr/local/bin (already in PATH)
	if pc.Type == SystemInstall {
		return nil // System installs don't need PATH updates
	}
	
	symlinkDir := filepath.Dir(pc.GetSymlinkPath())
	
	// Get user's home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get user home directory: %w", err)
	}
	
	// Shell profile files to update
	profiles := []string{
		filepath.Join(homeDir, ".bashrc"),
		filepath.Join(homeDir, ".zshrc"),
		filepath.Join(homeDir, ".profile"),
	}
	
	// PATH export line to add
	pathLine := fmt.Sprintf("export PATH=\"%s:$PATH\"", symlinkDir)
	pathComment := "# Added by dotvibe installer"
	
	for _, profile := range profiles {
		if err := addToShellProfile(profile, pathLine, pathComment); err != nil {
			// Don't fail installation if we can't update a profile
			fmt.Printf("⚠️  Failed to update %s: %v\n", filepath.Base(profile), err)
			continue
		}
		fmt.Printf("✅ Updated %s\n", filepath.Base(profile))
	}
	
	fmt.Printf("📝 Added %s to PATH in shell profiles\n", symlinkDir)
	fmt.Printf("💡 Restart your shell or run: source ~/.bashrc (or ~/.zshrc)\n")
	
	return nil
}

// addToShellProfile adds a PATH export line to a shell profile if it doesn't already exist
func addToShellProfile(profilePath, pathLine, comment string) error {
	// Check if profile exists
	var existingContent []byte
	var err error
	
	if _, err := os.Stat(profilePath); err == nil {
		existingContent, err = os.ReadFile(profilePath)
		if err != nil {
			return fmt.Errorf("failed to read profile: %w", err)
		}
		
		// Check if PATH line already exists
		if strings.Contains(string(existingContent), pathLine) {
			return nil // Already exists, nothing to do
		}
	}
	
	// Open file for appending (create if it doesn't exist)
	file, err := os.OpenFile(profilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open profile for writing: %w", err)
	}
	defer file.Close()
	
	// Add newline if file exists and doesn't end with newline
	if len(existingContent) > 0 && !strings.HasSuffix(string(existingContent), "\n") {
		if _, err := file.WriteString("\n"); err != nil {
			return fmt.Errorf("failed to write newline: %w", err)
		}
	}
	
	// Write the PATH update
	pathUpdate := fmt.Sprintf("\n%s\n%s\n", comment, pathLine)
	if _, err := file.WriteString(pathUpdate); err != nil {
		return fmt.Errorf("failed to write PATH update: %w", err)
	}
	
	return nil
}