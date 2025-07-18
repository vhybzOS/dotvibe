package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDetectPlatform(t *testing.T) {
	tests := []struct {
		name     string
		expected struct {
			goos     string
			goarch   string
			filename string
		}
	}{
		{
			name: "current platform",
			expected: struct {
				goos     string
				goarch   string
				filename string
			}{
				goos:     runtime.GOOS,
				goarch:   runtime.GOARCH,
				filename: getExpectedFilename(runtime.GOOS),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			goos, goarch, filename := detectPlatform()

			if goos != tt.expected.goos {
				t.Errorf("detectPlatform() goos = %v, want %v", goos, tt.expected.goos)
			}
			if goarch != tt.expected.goarch {
				t.Errorf("detectPlatform() goarch = %v, want %v", goarch, tt.expected.goarch)
			}
			if filename != tt.expected.filename {
				t.Errorf("detectPlatform() filename = %v, want %v", filename, tt.expected.filename)
			}
		})
	}
}

func getExpectedFilename(goos string) string {
	if goos == "windows" {
		return "vibe.exe"
	}
	return "vibe"
}

func TestGetInstallPath(t *testing.T) {
	tests := []struct {
		name     string
		goos     string
		expected string
	}{
		{
			name:     "linux",
			goos:     "linux",
			expected: filepath.Join(os.Getenv("HOME"), ".local", "bin"),
		},
		{
			name:     "darwin",
			goos:     "darwin",
			expected: filepath.Join(os.Getenv("HOME"), ".local", "bin"),
		},
		{
			name:     "windows",
			goos:     "windows",
			expected: filepath.Join(os.Getenv("USERPROFILE"), ".local", "bin"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Save original GOOS
			originalGOOS := runtime.GOOS

			// Mock runtime.GOOS for testing
			// Note: We can't actually change runtime.GOOS, so we'll test the logic directly
			result := getInstallPathForOS(tt.goos)

			// For windows test, check if it contains the expected pattern
			if tt.goos == "windows" {
				if !strings.Contains(result, ".local") || !strings.Contains(result, "bin") {
					t.Errorf("getInstallPathForOS(%s) = %v, want path containing .local/bin", tt.goos, result)
				}
			} else {
				if result != tt.expected {
					t.Errorf("getInstallPathForOS(%s) = %v, want %v", tt.goos, result, tt.expected)
				}
			}

			_ = originalGOOS // Suppress unused variable warning
		})
	}
}

func TestBuildDownloadURL(t *testing.T) {
	tests := []struct {
		name     string
		goos     string
		goarch   string
		version  string
		expected string
	}{
		{
			name:     "linux amd64",
			goos:     "linux",
			goarch:   "amd64",
			version:  "v1.0.0",
			expected: "https://github.com/vhybzOS/.vibe/releases/download/v1.0.0/vibe-v1.0.0-linux-x86_64",
		},
		{
			name:     "windows amd64",
			goos:     "windows",
			goarch:   "amd64",
			version:  "v1.0.0",
			expected: "https://github.com/vhybzOS/.vibe/releases/download/v1.0.0/vibe-v1.0.0-windows-x86_64.exe",
		},
		{
			name:     "darwin amd64",
			goos:     "darwin",
			goarch:   "amd64",
			version:  "v1.0.0",
			expected: "https://github.com/vhybzOS/.vibe/releases/download/v1.0.0/vibe-v1.0.0-macos-x86_64",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildDownloadURL(tt.goos, tt.goarch, tt.version)
			if result != tt.expected {
				t.Errorf("buildDownloadURL(%s, %s, %s) = %v, want %v", tt.goos, tt.goarch, tt.version, result, tt.expected)
			}
		})
	}
}

func TestValidateInstallPath(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		wantErr bool
	}{
		{
			name:    "valid path",
			path:    "/usr/local/bin",
			wantErr: false,
		},
		{
			name:    "empty path",
			path:    "",
			wantErr: true,
		},
		{
			name:    "relative path",
			path:    "local/bin",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateInstallPath(tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateInstallPath(%s) error = %v, wantErr %v", tt.path, err, tt.wantErr)
			}
		})
	}
}

func TestGetLatestVersion(t *testing.T) {
	t.Run("fallback version", func(t *testing.T) {
		// Test that function returns a fallback version (should be v0.7.6)
		version, err := getLatestVersion()
		if err != nil {
			t.Errorf("Expected no error, got: %v", err)
		}
		if version == "" {
			t.Error("Expected version to be non-empty")
		}
		// Should either get the latest from API or fallback to v0.7.6
		if !strings.HasPrefix(version, "v") {
			t.Errorf("Expected version to start with 'v', got: %s", version)
		}
	})
}

func TestDownloadProgress(t *testing.T) {
	// Test progress tracking during download
	t.Run("progress tracking", func(t *testing.T) {
		// Test that ProgressWriter can be created and used
		var buf strings.Builder
		progress := &ProgressWriter{
			Writer:  &buf,
			total:   100,
			written: 0,
		}

		// Write some data
		data := []byte("test data")
		n, err := progress.Write(data)

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		if n != len(data) {
			t.Errorf("Expected %d bytes written, got %d", len(data), n)
		}
		if progress.written != int64(len(data)) {
			t.Errorf("Expected written = %d, got %d", len(data), progress.written)
		}
	})
}

// ProgressWriter is now implemented in main.go

func TestInstallationWorkflow(t *testing.T) {
	// Integration test for the full installation workflow
	t.Run("mock installation flow", func(t *testing.T) {
		// 1. Detect platform
		goos, goarch, filename := detectPlatform()
		if goos == "" || goarch == "" || filename == "" {
			t.Error("Platform detection failed")
		}

		// 2. Build download URL (with mock version)
		url := buildDownloadURL(goos, goarch, "v1.0.0")
		if url == "" {
			t.Error("URL building failed")
		}

		// Verify URL format
		expectedPattern := "https://github.com/vhybzOS/.vibe/releases/download/v1.0.0/vibe-v1.0.0"
		if !strings.Contains(url, expectedPattern) {
			t.Errorf("URL doesn't contain expected pattern: %s", expectedPattern)
		}

		// 3. Get install path
		installPath := getInstallPathForOS(goos)
		if installPath == "" {
			t.Error("Install path detection failed")
		}

		// 4. Validate install path
		err := validateInstallPath(installPath)
		if err != nil {
			t.Errorf("Install path validation failed: %v", err)
		}

		t.Logf("Mock installation flow completed:")
		t.Logf("  Platform: %s/%s", goos, goarch)
		t.Logf("  Binary: %s", filename)
		t.Logf("  URL: %s", url)
		t.Logf("  Install path: %s", installPath)
	})
}

// TestEdgeCases covers error handling and edge cases
func TestEdgeCases(t *testing.T) {
	t.Run("unsupported architecture", func(t *testing.T) {
		// Test with unsupported architecture
		url := buildDownloadURL("linux", "unsupported", "v1.0.0")
		expected := "https://github.com/vhybzOS/.vibe/releases/download/v1.0.0/vibe-v1.0.0-linux-unsupported"
		if url != expected {
			t.Errorf("Expected fallback architecture handling, got: %s", url)
		}
	})

	t.Run("empty install path validation", func(t *testing.T) {
		err := validateInstallPath("")
		if err == nil {
			t.Error("Expected error for empty install path")
		}
		if !strings.Contains(err.Error(), "cannot be empty") {
			t.Errorf("Expected 'cannot be empty' error, got: %v", err)
		}
	})

	t.Run("relative install path validation", func(t *testing.T) {
		err := validateInstallPath("relative/path")
		if err == nil {
			t.Error("Expected error for relative install path")
		}
		if !strings.Contains(err.Error(), "must be absolute") {
			t.Errorf("Expected 'must be absolute' error, got: %v", err)
		}
	})

	t.Run("progress writer with unknown total", func(t *testing.T) {
		var buf strings.Builder
		progress := &ProgressWriter{
			Writer:  &buf,
			total:   0, // Unknown total size
			written: 0,
		}

		data := []byte("test data")
		n, err := progress.Write(data)

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		if n != len(data) {
			t.Errorf("Expected %d bytes written, got %d", len(data), n)
		}
		// Should still track bytes written even with unknown total
		if progress.written != int64(len(data)) {
			t.Errorf("Expected written = %d, got %d", len(data), progress.written)
		}
	})

	t.Run("platform detection edge cases", func(t *testing.T) {
		// Test that we get consistent results
		goos1, goarch1, filename1 := detectPlatform()
		goos2, goarch2, filename2 := detectPlatform()

		if goos1 != goos2 || goarch1 != goarch2 || filename1 != filename2 {
			t.Error("Platform detection should be consistent across calls")
		}

		// Test filename extension logic
		if strings.Contains(filename1, ".") && !strings.HasSuffix(filename1, ".exe") {
			t.Error("Only .exe extension should be present in filenames")
		}
	})
}

// TestCrossPlatformBehavior verifies platform-specific logic
func TestCrossPlatformBehavior(t *testing.T) {
	platforms := []struct {
		goos   string
		goarch string
	}{
		{"linux", "amd64"},
		{"linux", "arm64"},
		{"darwin", "amd64"},
		{"darwin", "arm64"},
		{"windows", "amd64"},
	}

	for _, platform := range platforms {
		t.Run(fmt.Sprintf("%s_%s", platform.goos, platform.goarch), func(t *testing.T) {
			// Test URL building
			url := buildDownloadURL(platform.goos, platform.goarch, "v1.0.0")

			// Verify URL structure
			if !strings.Contains(url, "github.com/vhybzOS/.vibe/releases") {
				t.Errorf("Invalid URL structure: %s", url)
			}

			// Verify platform mapping
			if platform.goos == "darwin" && !strings.Contains(url, "macos") {
				t.Errorf("Expected 'macos' in URL for darwin, got: %s", url)
			}

			if platform.goarch == "amd64" && !strings.Contains(url, "x86_64") {
				t.Errorf("Expected 'x86_64' in URL for amd64, got: %s", url)
			}

			// Verify Windows executable extension
			if platform.goos == "windows" && !strings.HasSuffix(url, ".exe") {
				t.Errorf("Expected .exe extension for Windows, got: %s", url)
			}

			// Test install path generation
			installPath := getInstallPathForOS(platform.goos)
			if installPath == "" {
				t.Errorf("Install path should not be empty for %s", platform.goos)
			}

			// Verify install path structure
			if !strings.Contains(installPath, "bin") {
				t.Errorf("Install path should contain 'bin', got: %s", installPath)
			}
		})
	}
}
