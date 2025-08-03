package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// isElevated checks if the current process is running with elevated privileges
func isElevated() bool {
	switch runtime.GOOS {
	case "windows":
		return isWindowsElevated()
	default: // Unix-like systems (Linux, macOS, etc.)
		return os.Geteuid() == 0
	}
}

// isWindowsElevated checks if running as Administrator on Windows
func isWindowsElevated() bool {
	// Use a heuristic: try to write to a system directory
	testPath := `C:\Windows\System32\.dotvibe-admin-test`
	file, err := os.Create(testPath)
	if err != nil {
		return false
	}
	file.Close()
	os.Remove(testPath)
	
	return true
}

// requiresElevation determines if elevation is needed for the given installation type
func requiresElevation(installType InstallationType) bool {
	switch installType {
	case SystemInstall:
		return !isElevated()
	case UserInstall:
		return false
	default:
		return false
	}
}

// showInstallationType displays the installation type that will be used
func showInstallationType(installType InstallationType) {
	fmt.Printf("\n🏠 Installation type: %s\n", installType)
	
	var location string
	var description string
	
	switch installType {
	case SystemInstall:
		location = getSystemBasePath()
		description = "Available to all users • Requires administrator/sudo privileges"
	case UserInstall:
		userBasePath, err := getUserBasePath()
		if err != nil {
			userBasePath = "~/.local/dotvibe"
		}
		location = userBasePath
		description = "Available only to current user • No special privileges required"
	}
	
	fmt.Printf("     Location: %s\n", location)
	fmt.Printf("     %s\n", description)
	
	// Show current privilege status
	if isElevated() {
		fmt.Println("ℹ️  Currently running with elevated privileges")
	} else {
		fmt.Println("ℹ️  Currently running with normal user privileges")
	}
}

// elevateIfNeeded checks if elevation is required and attempts to elevate if necessary
func elevateIfNeeded(installType InstallationType) error {
	if !requiresElevation(installType) {
		return nil // No elevation needed
	}
	
	fmt.Printf("🔐 Administrator privileges required for %s installation\n", installType)
	
	switch runtime.GOOS {
	case "windows":
		fmt.Println("📋 Please click 'Yes' when Windows prompts for administrator access...")
		return relaunchAsWindowsAdmin(os.Args)
	default: // Unix-like systems
		fmt.Println("🔑 Relaunching with sudo privileges...")
		return relaunchWithSudo(os.Args)
	}
}

// relaunchAsWindowsAdmin relaunches the installer with Windows UAC elevation
func relaunchAsWindowsAdmin(args []string) error {
	// Get the current executable path
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get current executable path: %w", err)
	}
	
	// Prepare arguments (skip the first one which is the executable name)
	var cmdArgs []string
	if len(args) > 1 {
		cmdArgs = args[1:]
	}
	
	// Use PowerShell to invoke UAC elevation
	psCommand := fmt.Sprintf("Start-Process -FilePath '%s'", executable)
	if len(cmdArgs) > 0 {
		psCommand += fmt.Sprintf(" -ArgumentList '%s'", strings.Join(cmdArgs, "','"))
	}
	psCommand += " -Verb RunAs -Wait"
	
	cmd := exec.Command("powershell", "-Command", psCommand)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	err = cmd.Run()
	if err != nil {
		return fmt.Errorf("failed to elevate privileges: %w", err)
	}
	
	// Exit the current process since we've launched the elevated version
	fmt.Println("✅ Elevated process launched successfully")
	os.Exit(0)
	return nil
}

// relaunchWithSudo relaunches the installer with sudo on Unix-like systems
func relaunchWithSudo(args []string) error {
	// Get the current executable path
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get current executable path: %w", err)
	}
	
	// Prepare sudo command
	sudoArgs := []string{executable}
	if len(args) > 1 {
		sudoArgs = append(sudoArgs, args[1:]...)
	}
	
	cmd := exec.Command("sudo", sudoArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	err = cmd.Run()
	if err != nil {
		return fmt.Errorf("failed to execute with sudo: %w", err)
	}
	
	// Exit the current process since we've launched the elevated version
	fmt.Println("✅ Elevated process completed successfully")
	os.Exit(0)
	return nil
}

// checkSudoAvailable checks if sudo is available on Unix-like systems
func checkSudoAvailable() bool {
	if runtime.GOOS == "windows" {
		return false
	}
	
	_, err := exec.LookPath("sudo")
	return err == nil
}

// validateElevationRequirements checks if elevation is possible for the current system
func validateElevationRequirements(installType InstallationType) error {
	if !requiresElevation(installType) {
		return nil // No elevation needed
	}
	
	switch runtime.GOOS {
	case "windows":
		// Windows should always support UAC elevation
		return nil
	default: // Unix-like systems
		if !checkSudoAvailable() {
			return fmt.Errorf("sudo is not available - cannot perform system installation")
		}
		return nil
	}
}

// getElevationInstructions returns user-friendly instructions for manual elevation
func getElevationInstructions(installType InstallationType) string {
	if !requiresElevation(installType) {
		return ""
	}
	
	executable, _ := os.Executable()
	if executable == "" {
		executable = "./install-dotvibe"
	}
	
	switch runtime.GOOS {
	case "windows":
		return fmt.Sprintf(`
To manually run with administrator privileges:
1. Open Command Prompt as Administrator
2. Navigate to the installer directory
3. Run: %s

Or right-click the installer and select "Run as administrator"
`, executable)
		
	default: // Unix-like systems
		return fmt.Sprintf(`
To manually run with elevated privileges:
sudo %s

Make sure you have sudo access on this system.
`, executable)
	}
}

// confirmElevation asks the user if they want to proceed with elevation
func confirmElevation(installType InstallationType) (bool, error) {
	if !requiresElevation(installType) {
		return true, nil // No confirmation needed
	}
	
	fmt.Printf("\n⚠️  %s installation requires elevated privileges.\n", installType)
	
	switch runtime.GOOS {
	case "windows":
		fmt.Println("This will trigger Windows UAC (User Account Control).")
	default:
		fmt.Println("This will require sudo access.")
	}
	
	fmt.Print("\nProceed with elevation? (y/N): ")
	
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return false, fmt.Errorf("failed to read input: %w", err)
	}
	
	input = strings.TrimSpace(strings.ToLower(input))
	return input == "y" || input == "yes", nil
}

// handleElevationWorkflow manages the complete elevation workflow
func handleElevationWorkflow(installType InstallationType, autoConfirm bool) error {
	// Check if elevation is needed
	if !requiresElevation(installType) {
		fmt.Printf("✅ Proceeding with %s installation (no elevation required)\n", installType)
		return nil
	}
	
	// Validate that elevation is possible
	if err := validateElevationRequirements(installType); err != nil {
		fmt.Printf("❌ Cannot proceed with %s installation: %v\n", installType, err)
		fmt.Println(getElevationInstructions(installType))
		return err
	}
	
	// Skip confirmation if auto-confirm is enabled (CLI flags used)
	if autoConfirm {
		fmt.Printf("🔐 %s installation requires elevated privileges - proceeding with elevation...\n", installType)
	} else {
		// Ask for user confirmation in interactive mode
		confirmed, err := confirmElevation(installType)
		if err != nil {
			return fmt.Errorf("failed to get user confirmation: %w", err)
		}
		
		if !confirmed {
			fmt.Println("❌ Installation cancelled by user")
			fmt.Println("\n💡 You can use --user flag for user installation instead")
			return fmt.Errorf("elevation declined by user")
		}
	}
	
	// Proceed with elevation
	return elevateIfNeeded(installType)
}