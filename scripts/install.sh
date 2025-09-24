#!/bin/bash

# PepperQC Universal Installation Script
# Automatically detects platform and runs appropriate installer

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${RED}🌶️  PepperQC Universal Installer${NC}"
echo -e "${YELLOW}=================================${NC}"

# Detect operating system
detect_os() {
    case "$(uname -s)" in
        Darwin)
            echo "macos"
            ;;
        Linux)
            echo "linux"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

OS=$(detect_os)

case $OS in
    macos)
        echo -e "${GREEN}🍎 Detected macOS${NC}"
        SCRIPT="install-macos.sh"
        ;;
    linux)
        echo -e "${GREEN}🐧 Detected Linux${NC}"
        SCRIPT="install-linux.sh"
        ;;
    windows)
        echo -e "${GREEN}🪟 Detected Windows${NC}"
        echo -e "${YELLOW}For Windows, please run the PowerShell script:${NC}"
        echo -e "${CYAN}   PowerShell -ExecutionPolicy Bypass -File scripts/install-windows.ps1${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Unsupported operating system: $(uname -s)${NC}"
        echo -e "${YELLOW}Supported platforms: macOS, Linux, Windows${NC}"
        exit 1
        ;;
esac

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/$SCRIPT" ]]; then
    echo -e "${RED}❌ Platform-specific script not found: $SCRIPT${NC}"
    echo -e "${YELLOW}Please download the complete PepperQC repository.${NC}"
    exit 1
fi

echo -e "${CYAN}🚀 Running $SCRIPT...${NC}"
echo

# Forward all arguments to platform-specific script
exec "$SCRIPT_DIR/$SCRIPT" "$@"