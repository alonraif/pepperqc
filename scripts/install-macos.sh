#!/bin/bash

# PepperQC macOS Installation Script
# Prerequisites: Docker Desktop and Git (Xcode Command Line Tools) must be installed
# Usage: ./install-macos.sh [--telegram-token TOKEN] [--domain DOMAIN] [--email EMAIL]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Default values
TELEGRAM_TOKEN=""
DOMAIN=""
EMAIL=""
INSTALL_PATH="$HOME/PepperQC"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --telegram-token)
            TELEGRAM_TOKEN="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --install-path)
            INSTALL_PATH="$2"
            shift 2
            ;;
        -h|--help)
            echo "PepperQC macOS Installation Script"
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --telegram-token TOKEN   Telegram bot token"
            echo "  --domain DOMAIN          Domain for SSL certificate"
            echo "  --email EMAIL            Email for SSL certificate"
            echo "  --install-path PATH      Installation directory (default: ~/PepperQC)"
            echo "  -h, --help               Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${RED}🌶️  PepperQC Installation Script for macOS${NC}"
echo -e "${YELLOW}===============================================${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${GREEN}🔍 Checking prerequisites...${NC}"

# Check Xcode Command Line Tools
if ! command_exists git; then
    echo -e "${RED}❌ Xcode Command Line Tools not found.${NC}"
    echo -e "${YELLOW}Install with:${NC}"
    echo "  xcode-select --install"
    exit 1
fi

# Check Docker
if ! command_exists docker; then
    echo -e "${RED}❌ Docker not found.${NC}"
    echo -e "${YELLOW}Install Docker Desktop:${NC}"
    echo "  1. Download from: https://docs.docker.com/desktop/mac/install/"
    echo "  2. Or using Homebrew: brew install --cask docker"
    exit 1
fi

# Check Docker Compose
if ! command_exists docker-compose; then
    echo -e "${RED}❌ Docker Compose not found.${NC}"
    echo -e "${YELLOW}Docker Compose should be included with Docker Desktop.${NC}"
    echo -e "${YELLOW}If missing, install with:${NC}"
    echo "  brew install docker-compose"
    exit 1
fi

# Check if Docker Desktop is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Docker Desktop is not running.${NC}"
    echo -e "${CYAN}Starting Docker Desktop...${NC}"

    # Try to start Docker Desktop
    if [[ -d "/Applications/Docker.app" ]]; then
        open /Applications/Docker.app
        echo -e "${YELLOW}Waiting for Docker Desktop to start...${NC}"

        # Wait for Docker to be ready (max 60 seconds)
        for i in {1..60}; do
            if docker info >/dev/null 2>&1; then
                break
            fi
            echo -n "."
            sleep 1
        done
        echo

        if ! docker info >/dev/null 2>&1; then
            echo -e "${RED}❌ Docker Desktop failed to start.${NC}"
            echo -e "${YELLOW}Please start Docker Desktop manually and run this script again.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Docker Desktop not found in Applications folder.${NC}"
        echo -e "${YELLOW}Please install Docker Desktop and run this script again.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ All prerequisites met!${NC}"

# Check if Homebrew is available (optional)
HOMEBREW_AVAILABLE=false
if command_exists brew; then
    HOMEBREW_AVAILABLE=true
    echo -e "${GREEN}✅ Homebrew detected${NC}"
fi

# Create installation directory
echo -e "${CYAN}📁 Installing to: $INSTALL_PATH${NC}"

if [[ -d "$INSTALL_PATH" ]]; then
    echo -e "${YELLOW}Directory already exists.${NC}"
    read -p "Remove it and reinstall? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_PATH"
        echo -e "${YELLOW}🗑️  Removed existing directory${NC}"
    else
        echo -e "${YELLOW}📁 Using existing directory${NC}"
    fi
fi

# Clone repository
echo -e "${CYAN}⬇️  Cloning PepperQC repository...${NC}"
if ! git clone https://github.com/alonraif/pepperqc.git "$INSTALL_PATH"; then
    echo -e "${RED}❌ Failed to clone repository${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Repository cloned successfully${NC}"

cd "$INSTALL_PATH"

# Create .env file
echo -e "${CYAN}⚙️  Creating configuration...${NC}"
cat > .env << EOF
# Database Configuration
POSTGRES_USER=pepper
POSTGRES_PASSWORD=pepper
POSTGRES_DB=pepperqc
DATABASE_URL=postgresql+psycopg2://pepper:pepper@db:5432/pepperqc

EOF

# Add optional configurations
if [[ -n "$TELEGRAM_TOKEN" ]]; then
    echo "# Telegram Configuration" >> .env
    echo "TELEGRAM_BOT_TOKEN=$TELEGRAM_TOKEN" >> .env
    echo "" >> .env
    echo -e "${GREEN}📱 Telegram token configured${NC}"
fi

if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
    echo "# SSL Configuration" >> .env
    echo "SSL_HOSTNAME=$DOMAIN" >> .env
    echo "SSL_EMAIL=$EMAIL" >> .env
    echo -e "${GREEN}🔒 SSL configuration added${NC}"
fi

echo -e "${GREEN}✅ Configuration file created${NC}"

# Ensure uploads directory exists with proper permissions
mkdir -p uploads
chmod 755 uploads

# Build and start services
echo -e "${CYAN}🏗️  Building and starting PepperQC services...${NC}"
echo -e "${YELLOW}   This may take a few minutes on first run...${NC}"

if ! docker-compose up --build -d; then
    echo -e "${RED}❌ Failed to start services${NC}"
    echo -e "${YELLOW}Check logs with: docker-compose logs${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Services started successfully!${NC}"

# Wait for services to be ready
echo -e "${CYAN}⏳ Waiting for services to initialize...${NC}"
sleep 10

# Check service status
echo -e "${CYAN}🔍 Checking service status...${NC}"
docker-compose ps

echo -e "${GREEN}\n🎉 PepperQC Installation Complete!${NC}"
echo -e "${YELLOW}===================================${NC}"

echo -e "${CYAN}🌐 Access your PepperQC instance:${NC}"
echo -e "${WHITE}   Frontend: http://localhost:3000${NC}"
echo -e "${WHITE}   Backend:  http://localhost:5000${NC}"

if [[ -n "$DOMAIN" ]]; then
    echo -e "${WHITE}   Domain:   https://$DOMAIN ${YELLOW}(after DNS setup)${NC}"
fi

echo -e "${CYAN}\n📋 Useful Commands:${NC}"
echo -e "${WHITE}   View logs:    docker-compose logs -f${NC}"
echo -e "${WHITE}   Stop:         docker-compose down${NC}"
echo -e "${WHITE}   Restart:      docker-compose restart${NC}"
echo -e "${WHITE}   Update:       git pull && docker-compose up --build -d${NC}"

echo -e "${CYAN}\n🔧 Next Steps:${NC}"
echo -e "${WHITE}   1. Open http://localhost:3000 in your browser${NC}"
echo -e "${WHITE}   2. Go to Settings > Notifications to configure Telegram${NC}"
echo -e "${WHITE}   3. Upload a test video to verify everything works${NC}"

if [[ -z "$TELEGRAM_TOKEN" ]]; then
    echo -e "${WHITE}   4. Configure Telegram bot token in the web interface${NC}"
fi

echo -e "${GREEN}\n✅ Installation directory: $INSTALL_PATH${NC}"
echo -e "${CYAN}📖 Full documentation: https://github.com/alonraif/pepperqc/blob/main/README.md${NC}"

# Create alias for easy access
echo -e "${CYAN}\n🔗 Creating convenience shortcuts...${NC}"

# Add to shell profile if possible
SHELL_PROFILE=""
if [[ -f "$HOME/.zshrc" ]]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bash_profile" ]]; then
    SHELL_PROFILE="$HOME/.bash_profile"
elif [[ -f "$HOME/.bashrc" ]]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
    echo "" >> "$SHELL_PROFILE"
    echo "# PepperQC shortcuts" >> "$SHELL_PROFILE"
    echo "alias pepperqc-start='cd \"$INSTALL_PATH\" && docker-compose up -d'" >> "$SHELL_PROFILE"
    echo "alias pepperqc-stop='cd \"$INSTALL_PATH\" && docker-compose down'" >> "$SHELL_PROFILE"
    echo "alias pepperqc-logs='cd \"$INSTALL_PATH\" && docker-compose logs -f'" >> "$SHELL_PROFILE"
    echo "alias pepperqc-update='cd \"$INSTALL_PATH\" && git pull && docker-compose up --build -d'" >> "$SHELL_PROFILE"
    echo -e "${GREEN}✅ Shell aliases added to $SHELL_PROFILE${NC}"
    echo -e "${YELLOW}   Run 'source $SHELL_PROFILE' or restart terminal to use:${NC}"
    echo -e "${WHITE}   pepperqc-start, pepperqc-stop, pepperqc-logs, pepperqc-update${NC}"
fi

# Create Dock shortcut on macOS
if command_exists osascript; then
    # Create a simple app bundle for the Dock
    APP_PATH="$HOME/Applications/PepperQC.app"
    mkdir -p "$APP_PATH/Contents/MacOS"
    mkdir -p "$APP_PATH/Contents/Resources"

    # Create Info.plist
    cat > "$APP_PATH/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>PepperQC</string>
    <key>CFBundleIdentifier</key>
    <string>com.pepperqc.app</string>
    <key>CFBundleName</key>
    <string>PepperQC</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
</dict>
</plist>
EOF

    # Create launcher script
    cat > "$APP_PATH/Contents/MacOS/PepperQC" << EOF
#!/bin/bash
open http://localhost:3000
EOF
    chmod +x "$APP_PATH/Contents/MacOS/PepperQC"

    echo -e "${GREEN}🚀 App shortcut created in ~/Applications${NC}"
fi

echo -e "${RED}\nEnjoy using PepperQC! 🌶️${NC}"

# Optionally open browser
read -p "Open PepperQC in browser now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open http://localhost:3000
fi