# Default recipe lists available commands
default:
    @just --list


# Build everything
build: build-host build-extension

# Build the native host
build-host:
    cd host && cargo build --release

# Build extension for both browsers
build-extension: build-extension-firefox build-extension-chrome

# Build extension for Firefox
build-extension-firefox:
    cd extension && BROWSER=firefox pnpm build

# Build extension for Chrome
build-extension-chrome:
    cd extension && BROWSER=chrome pnpm build

# Install native messaging host for Firefox Browser (macOS)
install-macos-firefox: build-host build-extension
    #!/usr/bin/env bash
    set -euo pipefail

    # Get the absolute path to the binary
    BINARY_PATH="$(pwd)/host/target/release/tapestry-host"

    # Create the native messaging hosts directory if it doesn't exist
    HOSTS_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    mkdir -p "$HOSTS_DIR"

    # Copy and update the manifest
    sed "s|BINARY_PATH_PLACEHOLDER|$BINARY_PATH|" host/com.jtdowney.tapestry.firefox.json > "$HOSTS_DIR/com.jtdowney.tapestry.json"

    echo "Native messaging host installed for Firefox Browser"
    echo "Manifest: $HOSTS_DIR/com.jtdowney.tapestry.json"
    echo "Binary: $BINARY_PATH"

# Install native messaging host for Chrome (macOS)
install-macos-chrome: build-host build-extension
    #!/usr/bin/env bash
    set -euo pipefail

    # Get the absolute path to the binary
    BINARY_PATH="$(pwd)/host/target/release/tapestry-host"

    # Create the native messaging hosts directory if it doesn't exist
    HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    mkdir -p "$HOSTS_DIR"

    # Copy and update the manifest
    sed "s|BINARY_PATH_PLACEHOLDER|$BINARY_PATH|" extension/dist/native-hosts/chrome.json > "$HOSTS_DIR/com.jtdowney.tapestry.json"

    echo "Native messaging host installed for Chrome (macOS)"
    echo "Manifest: $HOSTS_DIR/com.jtdowney.tapestry.json"
    echo "Binary: $BINARY_PATH"

# Install native messaging host for Firefox (Linux)
install-linux-firefox: build-host build-extension
    #!/usr/bin/env bash
    set -euo pipefail

    # Get the absolute path to the binary
    BINARY_PATH="$(pwd)/host/target/release/tapestry-host"

    # Create the native messaging hosts directory if it doesn't exist
    HOSTS_DIR="$HOME/.mozilla/native-messaging-hosts"
    mkdir -p "$HOSTS_DIR"

    # Copy and update the manifest
    sed "s|BINARY_PATH_PLACEHOLDER|$BINARY_PATH|" extension/dist/native-hosts/firefox.json > "$HOSTS_DIR/com.jtdowney.tapestry.json"

    echo "Native messaging host installed for Firefox (Linux)"
    echo "Manifest: $HOSTS_DIR/com.jtdowney.tapestry.json"
    echo "Binary: $BINARY_PATH"

# Install native messaging host for Chrome (Linux)
install-linux-chrome: build-host build-extension
    #!/usr/bin/env bash
    set -euo pipefail

    # Get the absolute path to the binary
    BINARY_PATH="$(pwd)/host/target/release/tapestry-host"

    # Create the native messaging hosts directory if it doesn't exist
    HOSTS_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    mkdir -p "$HOSTS_DIR"

    # Copy and update the manifest
    sed "s|BINARY_PATH_PLACEHOLDER|$BINARY_PATH|" extension/dist/native-hosts/chrome.json > "$HOSTS_DIR/com.jtdowney.tapestry.json"

    echo "Native messaging host installed for Chrome (Linux)"
    echo "Manifest: $HOSTS_DIR/com.jtdowney.tapestry.json"
    echo "Binary: $BINARY_PATH"

# Install native messaging host for Firefox (Windows)
install-windows-firefox: build-host build-extension
    #!/usr/bin/env powershell
    $ErrorActionPreference = "Stop"

    # Get the absolute path to the binary
    $BINARY_PATH = "$(Get-Location)\host\target\release\tapestry-host.exe"

    # Create registry key for Firefox
    $REG_PATH = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.jtdowney.tapestry"

    # Create the registry key if it doesn't exist
    if (!(Test-Path $REG_PATH)) {
        New-Item -Path $REG_PATH -Force | Out-Null
    }

    # Create temporary manifest file with correct path
    $TEMP_MANIFEST = [System.IO.Path]::GetTempFileName()
    (Get-Content "extension\dist\native-hosts\firefox.json") -replace "BINARY_PATH_PLACEHOLDER", $BINARY_PATH | Set-Content $TEMP_MANIFEST

    # Set registry value to point to manifest
    Set-ItemProperty -Path $REG_PATH -Name "(Default)" -Value $TEMP_MANIFEST

    Write-Host "Native messaging host installed for Firefox (Windows)"
    Write-Host "Registry: $REG_PATH"
    Write-Host "Binary: $BINARY_PATH"

# Install native messaging host for Chrome (Windows)
install-windows-chrome: build-host build-extension
    #!/usr/bin/env powershell
    $ErrorActionPreference = "Stop"

    # Get the absolute path to the binary
    $BINARY_PATH = "$(Get-Location)\host\target\release\tapestry-host.exe"

    # Create registry key for Chrome
    $REG_PATH = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.jtdowney.tapestry"

    # Create the registry key if it doesn't exist
    if (!(Test-Path $REG_PATH)) {
        New-Item -Path $REG_PATH -Force | Out-Null
    }

    # Create temporary manifest file with correct path
    $TEMP_MANIFEST = [System.IO.Path]::GetTempFileName()
    (Get-Content "extension\dist\native-hosts\chrome.json") -replace "BINARY_PATH_PLACEHOLDER", $BINARY_PATH | Set-Content $TEMP_MANIFEST

    # Set registry value to point to manifest
    Set-ItemProperty -Path $REG_PATH -Name "(Default)" -Value $TEMP_MANIFEST

    Write-Host "Native messaging host installed for Chrome (Windows)"
    Write-Host "Registry: $REG_PATH"
    Write-Host "Binary: $BINARY_PATH"

# Install for all supported browsers (macOS)
install-macos-all: install-macos-firefox install-macos-chrome

# Install for all supported browsers (Linux)
install-linux-all: install-linux-firefox install-linux-chrome

# Install for all supported browsers (Windows)
install-windows-all: install-windows-firefox install-windows-chrome

# Quick install commands - for use with CI artifacts (macOS)
# These build only the native host and install it, assuming you downloaded the extension from CI
quick-install-macos-firefox: build-host install-macos-firefox

quick-install-macos-chrome: build-host install-macos-chrome

quick-install-macos-all: build-host install-macos-all

# Quick install commands - for use with CI artifacts (Linux)
# These build only the native host and install it, assuming you downloaded the extension from CI
quick-install-linux-firefox: build-host install-linux-firefox

quick-install-linux-chrome: build-host install-linux-chrome

quick-install-linux-all: build-host install-linux-all

# Quick install commands - for use with CI artifacts (Windows)
# These build only the native host and install it, assuming you downloaded the extension from CI
quick-install-windows-firefox: build-host install-windows-firefox

quick-install-windows-chrome: build-host install-windows-chrome

quick-install-windows-all: build-host install-windows-all

# Uninstall the native messaging host from all browsers (macOS)
uninstall-macos:
    rm -f "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.jtdowney.tapestry.json"
    rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.jtdowney.tapestry.json"
    echo "Native messaging host uninstalled from all browsers (macOS)"

# Uninstall the native messaging host from all browsers (Linux)
uninstall-linux:
    rm -f "$HOME/.mozilla/native-messaging-hosts/com.jtdowney.tapestry.json"
    rm -f "$HOME/.config/google-chrome/NativeMessagingHosts/com.jtdowney.tapestry.json"
    echo "Native messaging host uninstalled from all browsers (Linux)"

# Uninstall the native messaging host from all browsers (Windows)
uninstall-windows:
    #!/usr/bin/env powershell
    $ErrorActionPreference = "SilentlyContinue"

    # Remove Firefox registry key
    Remove-Item -Path "HKCU:\Software\Mozilla\NativeMessagingHosts\com.jtdowney.tapestry" -Force

    # Remove Chrome registry key
    Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.jtdowney.tapestry" -Force

    Write-Host "Native messaging host uninstalled from all browsers (Windows)"

# Run host tests
test-host:
    cd host && cargo test

# Run extension tests (if any)
test-extension:
    cd extension && pnpm test || echo "No tests configured for extension"

# Run all tests
test: test-host test-extension

# Development mode - build and watch host
dev-host:
    cd host && cargo watch -x run

# Development mode - build and watch extension (Firefox)
dev-extension:
    cd extension && BROWSER=firefox pnpm dev

# Development mode - build and watch extension for Firefox
dev-extension-firefox:
    cd extension && BROWSER=firefox pnpm dev

# Development mode - build and watch extension for Chrome
dev-extension-chrome:
    cd extension && BROWSER=chrome pnpm dev

# Format all code
fmt: fmt-host fmt-extension

# Format host code
fmt-host:
    cd host && cargo fmt

# Format extension code
fmt-extension:
    cd extension && pnpm format

# Run clippy on host
clippy:
    cd host && cargo clippy

# Lint extension code
lint-extension:
    cd extension && pnpm lint

# Fix extension linting issues
lint-extension-fix:
    cd extension && pnpm lint:fix

# Type check extension
check-extension:
    cd extension && pnpm check

# Run all linting/checking
check: clippy lint-extension check-extension

# Clean build artifacts only (preserves dependencies for faster iteration)
clean: clean-host clean-extension

# Clean host build artifacts
clean-host:
    cd host && rm -rf target

# Clean extension build artifacts
clean-extension:
    cd extension && rm -rf dist

# Clean everything including dependencies (slower but thorough)
clean-all: clean
    cd host && cargo clean
    cd extension && rm -rf node_modules

# Install dependencies
install-deps: install-deps-extension

# Install extension dependencies
install-deps-extension:
    cd extension && pnpm install

# Update dependencies for both host and extension
update-deps: update-deps-host update-deps-extension

# Update host dependencies
update-deps-host:
    cd host && cargo update

# Update extension dependencies
update-deps-extension:
    cd extension && pnpm update

# Show status of native messaging installation (macOS)
status-macos:
    #!/usr/bin/env bash
    echo "Native Messaging Host Status (macOS)"
    echo "===================================="
    echo ""

    # Check Firefox
    FIREFOX_MANIFEST="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.jtdowney.tapestry.json"
    if [ -f "$FIREFOX_MANIFEST" ]; then
        echo "✓ Firefox: Installed"
        echo "  Path: $FIREFOX_MANIFEST"
    else
        echo "✗ Firefox: Not installed"
        echo "  Run 'just install-macos-firefox' to install"
    fi

    echo ""

    # Check Chrome
    CHROME_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.jtdowney.tapestry.json"
    if [ -f "$CHROME_MANIFEST" ]; then
        echo "✓ Chrome: Installed"
        echo "  Path: $CHROME_MANIFEST"
    else
        echo "✗ Chrome: Not installed"
        echo "  Run 'just install-macos-chrome' to install"
    fi

    echo ""

    # Check if binary exists
    BINARY="$(pwd)/host/target/release/tapestry-host"
    if [ -f "$BINARY" ]; then
        echo "✓ Native host binary: Built"
        echo "  Path: $BINARY"
    else
        echo "✗ Native host binary: Not built"
        echo "  Run 'just build-host' to build"
    fi

    echo ""
    echo "Installation Guide:"
    echo "==================="
    echo ""
    echo "Method A - Quick Install (with CI artifacts):"
    echo "  1. Download extension from GitHub Actions"
    echo "  2. Load extension in your browser"
    echo "  3. Run: just quick-install-macos-all"
    echo ""
    echo "Method B - Build from source:"
    echo "  1. Run: just setup-macos"
    echo "  2. Load built extension from extension/dist/"

# Show status of native messaging installation (Linux)
status-linux:
    #!/usr/bin/env bash
    echo "Native Messaging Host Status (Linux)"
    echo "===================================="
    echo ""

    # Check Firefox
    FIREFOX_MANIFEST="$HOME/.mozilla/native-messaging-hosts/com.jtdowney.tapestry.json"
    if [ -f "$FIREFOX_MANIFEST" ]; then
        echo "✓ Firefox: Installed"
        echo "  Path: $FIREFOX_MANIFEST"
    else
        echo "✗ Firefox: Not installed"
        echo "  Run 'just install-linux-firefox' to install"
    fi

    echo ""

    # Check Chrome
    CHROME_MANIFEST="$HOME/.config/google-chrome/NativeMessagingHosts/com.jtdowney.tapestry.json"
    if [ -f "$CHROME_MANIFEST" ]; then
        echo "✓ Chrome: Installed"
        echo "  Path: $CHROME_MANIFEST"
    else
        echo "✗ Chrome: Not installed"
        echo "  Run 'just install-linux-chrome' to install"
    fi

    echo ""

    # Check if binary exists
    BINARY="$(pwd)/host/target/release/tapestry-host"
    if [ -f "$BINARY" ]; then
        echo "✓ Native host binary: Built"
        echo "  Path: $BINARY"
    else
        echo "✗ Native host binary: Not built"
        echo "  Run 'just build-host' to build"
    fi

    echo ""
    echo "Installation Guide:"
    echo "==================="
    echo ""
    echo "Method A - Quick Install (with CI artifacts):"
    echo "  1. Download extension from GitHub Actions"
    echo "  2. Load extension in your browser"
    echo "  3. Run: just quick-install-linux-all"
    echo ""
    echo "Method B - Build from source:"
    echo "  1. Run: just setup-linux"
    echo "  2. Load built extension from extension/dist/"

# Show status of native messaging installation (Windows)
status-windows:
    #!/usr/bin/env powershell
    Write-Host "Native Messaging Host Status (Windows)"
    Write-Host "======================================"
    Write-Host ""

    # Check Firefox registry
    $FIREFOX_REG = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.jtdowney.tapestry"
    if (Test-Path $FIREFOX_REG) {
        Write-Host "✓ Firefox: Installed"
        Write-Host "  Registry: $FIREFOX_REG"
    } else {
        Write-Host "✗ Firefox: Not installed"
        Write-Host "  Run 'just install-windows-firefox' to install"
    }

    Write-Host ""

    # Check Chrome registry
    $CHROME_REG = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.jtdowney.tapestry"
    if (Test-Path $CHROME_REG) {
        Write-Host "✓ Chrome: Installed"
        Write-Host "  Registry: $CHROME_REG"
    } else {
        Write-Host "✗ Chrome: Not installed"
        Write-Host "  Run 'just install-windows-chrome' to install"
    }

    Write-Host ""

    # Check if binary exists
    $BINARY = "$(Get-Location)\host\target\release\tapestry-host.exe"
    if (Test-Path $BINARY) {
        Write-Host "✓ Native host binary: Built"
        Write-Host "  Path: $BINARY"
    } else {
        Write-Host "✗ Native host binary: Not built"
        Write-Host "  Run 'just build-host' to build"
    }

    Write-Host ""
    Write-Host "Installation Guide:"
    Write-Host "==================="
    Write-Host ""
    Write-Host "Method A - Quick Install (with CI artifacts):"
    Write-Host "  1. Download extension from GitHub Actions"
    Write-Host "  2. Load extension in your browser"
    Write-Host "  3. Run: just quick-install-windows-all"
    Write-Host ""
    Write-Host "Method B - Build from source:"
    Write-Host "  1. Run: just setup-windows"
    Write-Host "  2. Load built extension from extension/dist/"

# Full setup - install deps, build, and install native host for all browsers (macOS)
setup-macos: install-deps build install-macos-all

# Full setup - install deps, build, and install native host for all browsers (Linux)
setup-linux: install-deps build install-linux-all

# Full setup - install deps, build, and install native host for all browsers (Windows)
setup-windows: install-deps build install-windows-all

# Create source code zip for Firefox add-on reviewers
zip-source:
    #!/usr/bin/env bash
    set -euo pipefail

    # Create timestamp for unique filename
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    ZIP_NAME="tapestry-source-${TIMESTAMP}.zip"

    echo "Creating source zip for Firefox add-on review..."

    # Use git archive to create zip respecting .gitignore files
    git archive --format=zip --output="$ZIP_NAME" HEAD

    echo "✓ Source zip created: $ZIP_NAME"
    echo "This zip contains all tracked source code for Firefox add-on review"
    echo "Git automatically excluded files from .gitignore (build artifacts, dependencies, etc.)"

# Release build and package
release: clean build
    echo "Release built successfully!"
    echo "Extension (Firefox): extension/dist/"
    echo "Native host: host/target/release/tapestry-host"
