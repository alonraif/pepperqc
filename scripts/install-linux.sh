#!/bin/bash

# PepperQC Linux Installation Script
# Prerequisites: Docker and Git must be installed
# Usage: ./install-linux.sh [--telegram-token TOKEN] [--domain DOMAIN] [--email EMAIL]

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
            echo "PepperQC Linux Installation Script"
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

echo -e "${RED}🌶️  PepperQC Installation Script for Linux${NC}"
echo -e "${YELLOW}=================================================${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect Linux distribution
detect_distro() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "$ID"
    else
        echo "unknown"
    fi
}

echo -e "${GREEN}🔍 Checking prerequisites...${NC}"

# Check if running as root (not recommended for Docker)
if [[ $EUID -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  Running as root. Consider creating a regular user and adding to docker group.${NC}"
fi

# Check Docker
if ! command_exists docker; then
    echo -e "${RED}❌ Docker not found.${NC}"
    echo -e "${YELLOW}Install Docker with:${NC}"

    DISTRO=$(detect_distro)
    case $DISTRO in
        ubuntu|debian)
            echo "  sudo apt update && sudo apt install docker.io docker-compose -y"
            ;;
        centos|rhel|fedora)
            echo "  sudo yum install docker docker-compose -y"
            echo "  sudo systemctl start docker && sudo systemctl enable docker"
            ;;
        *)
            echo "  See: https://docs.docker.com/engine/install/"
            ;;
    esac
    exit 1
fi

# Check Docker Compose
if ! command_exists docker-compose; then
    echo -e "${RED}❌ Docker Compose not found.${NC}"
    echo -e "${YELLOW}Install Docker Compose with:${NC}"
    echo '  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose'
    echo '  sudo chmod +x /usr/local/bin/docker-compose'
    exit 1
fi

# Check Git
if ! command_exists git; then
    echo -e "${RED}❌ Git not found.${NC}"
    echo -e "${YELLOW}Install Git with:${NC}"

    DISTRO=$(detect_distro)
    case $DISTRO in
        ubuntu|debian)
            echo "  sudo apt update && sudo apt install git -y"
            ;;
        centos|rhel)
            echo "  sudo yum install git -y"
            ;;
        fedora)
            echo "  sudo dnf install git -y"
            ;;
        *)
            echo "  Use your distribution's package manager to install git"
            ;;
    esac
    exit 1
fi

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running.${NC}"
    echo -e "${YELLOW}Start Docker with:${NC}"
    echo "  sudo systemctl start docker"
    echo "  sudo systemctl enable docker  # Enable on boot"
    echo ""
    echo -e "${YELLOW}Add user to docker group:${NC}"
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker  # Or logout/login"
    exit 1
fi

# Check Docker permissions
if ! docker ps >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Docker permission issue. You may need to:${NC}"
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker"
    echo ""
    echo -e "${CYAN}Trying with sudo for now...${NC}"
    DOCKER_CMD="sudo docker"
    COMPOSE_CMD="sudo docker-compose"
else
    DOCKER_CMD="docker"
    COMPOSE_CMD="docker-compose"
fi

echo -e "${GREEN}✅ All prerequisites met!${NC}"

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

# Make sure we can write to uploads directory
mkdir -p uploads
chmod 755 uploads

# Build and start services
echo -e "${CYAN}🏗️  Building and starting PepperQC services...${NC}"
echo -e "${YELLOW}   This may take a few minutes on first run...${NC}"

if ! $COMPOSE_CMD up --build -d; then
    echo -e "${RED}❌ Failed to start services${NC}"
    echo -e "${YELLOW}Check logs with: $COMPOSE_CMD logs${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Services started successfully!${NC}"

# Wait for services to be ready
echo -e "${CYAN}⏳ Waiting for services to initialize...${NC}"
sleep 10

# Check service status
echo -e "${CYAN}🔍 Checking service status...${NC}"
$COMPOSE_CMD ps

echo -e "${GREEN}\n🎉 PepperQC Installation Complete!${NC}"
echo -e "${YELLOW}===================================${NC}"

echo -e "${CYAN}🌐 Access your PepperQC instance:${NC}"
echo -e "${WHITE}   Frontend: http://localhost:3000${NC}"
echo -e "${WHITE}   Backend:  http://localhost:5000${NC}"

if [[ -n "$DOMAIN" ]]; then
    echo -e "${WHITE}   Domain:   https://$DOMAIN ${YELLOW}(after DNS setup)${NC}"
fi

echo -e "${CYAN}\n📋 Useful Commands:${NC}"
echo -e "${WHITE}   View logs:    $COMPOSE_CMD logs -f${NC}"
echo -e "${WHITE}   Stop:         $COMPOSE_CMD down${NC}"
echo -e "${WHITE}   Restart:      $COMPOSE_CMD restart${NC}"
echo -e "${WHITE}   Update:       git pull && $COMPOSE_CMD up --build -d${NC}"

echo -e "${CYAN}\n🔧 Next Steps:${NC}"
echo -e "${WHITE}   1. Open http://localhost:3000 in your browser${NC}"
echo -e "${WHITE}   2. Go to Settings > Notifications to configure Telegram${NC}"
echo -e "${WHITE}   3. Upload a test video to verify everything works${NC}"

if [[ -z "$TELEGRAM_TOKEN" ]]; then
    echo -e "${WHITE}   4. Configure Telegram bot token in the web interface${NC}"
fi

echo -e "${GREEN}\n✅ Installation directory: $INSTALL_PATH${NC}"
echo -e "${CYAN}📖 Full documentation: https://github.com/alonraif/pepperqc/blob/main/README.md${NC}"

# Create desktop entry for systems with desktop environments
if command_exists xdg-user-dir && [[ -n "$DISPLAY" || -n "$WAYLAND_DISPLAY" ]]; then
    DESKTOP_DIR=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")
    if [[ -d "$DESKTOP_DIR" ]]; then
        cat > "$DESKTOP_DIR/PepperQC.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Link
Name=PepperQC
Comment=Video Quality Control Platform
URL=http://localhost:3000
Icon=applications-multimedia
EOF
        chmod +x "$DESKTOP_DIR/PepperQC.desktop"
        echo -e "${GREEN}🔗 Desktop shortcut created${NC}"
    fi
fi

echo -e "${RED}\nEnjoy using PepperQC! 🌶️${NC}"

# Optionally start browser
if command_exists xdg-open && [[ -n "$DISPLAY" || -n "$WAYLAND_DISPLAY" ]]; then
    read -p "Open PepperQC in browser now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open http://localhost:3000 >/dev/null 2>&1 &
    fi
fi