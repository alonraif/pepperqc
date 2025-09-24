# PepperQC Installation Scripts

These scripts automate the PepperQC installation process after Docker and Git are installed.

## Quick Install

### Universal Installer (macOS/Linux)
```bash
git clone https://github.com/alonraif/pepperqc.git
cd pepperqc/scripts
./install.sh
```

### Windows
```powershell
git clone https://github.com/alonraif/pepperqc.git
cd pepperqc/scripts
PowerShell -ExecutionPolicy Bypass -File install-windows.ps1
```

## Platform-Specific Scripts

### 🪟 Windows (`install-windows.ps1`)
**Prerequisites:** Docker Desktop, Git for Windows
```powershell
# Basic installation
PowerShell -ExecutionPolicy Bypass -File install-windows.ps1

# With optional parameters
PowerShell -ExecutionPolicy Bypass -File install-windows.ps1 -TelegramToken "YOUR_TOKEN" -Domain "pepperqc.example.com" -Email "admin@example.com"
```

### 🐧 Linux (`install-linux.sh`)
**Prerequisites:** Docker, Docker Compose, Git
```bash
# Basic installation
./install-linux.sh

# With optional parameters
./install-linux.sh --telegram-token "YOUR_TOKEN" --domain "pepperqc.example.com" --email "admin@example.com"

# Custom installation path
./install-linux.sh --install-path "/opt/pepperqc"
```

### 🍎 macOS (`install-macos.sh`)
**Prerequisites:** Docker Desktop, Xcode Command Line Tools
```bash
# Basic installation
./install-macos.sh

# With optional parameters
./install-macos.sh --telegram-token "YOUR_TOKEN" --domain "pepperqc.example.com" --email "admin@example.com"
```

## What the Scripts Do

1. **Verify Prerequisites**
   - Check Docker/Docker Compose installation
   - Verify Git is available
   - Ensure Docker daemon is running

2. **Clone Repository**
   - Download latest PepperQC source code
   - Set up installation directory

3. **Configure Environment**
   - Create `.env` file with database settings
   - Add optional Telegram/SSL configuration
   - Set proper file permissions

4. **Build and Start Services**
   - Build Docker containers
   - Start all services with docker-compose
   - Wait for initialization

5. **Create Shortcuts**
   - Desktop shortcuts (where applicable)
   - Shell aliases for easy management
   - Dock/Start Menu entries

## Script Features

### ✅ Error Handling
- Comprehensive prerequisite checking
- Graceful failure with helpful error messages
- Rollback capability for failed installations

### ✅ User Experience
- Colorized output for better readability
- Progress indicators and status updates
- Interactive prompts where appropriate
- Desktop integration (shortcuts, aliases)

### ✅ Customization
- Optional Telegram bot token configuration
- SSL/HTTPS setup with Let's Encrypt
- Custom installation paths
- Environment variable overrides

### ✅ Platform Optimization
- **Windows**: PowerShell with Admin detection
- **Linux**: Distribution-specific package managers
- **macOS**: Homebrew integration, Dock shortcuts

## After Installation

The scripts will provide:
- **Access URLs**: Frontend (port 3000), Backend (port 5000)
- **Management commands**: Start, stop, logs, update
- **Next steps**: Configuration and testing guidance

### Useful Commands Created
```bash
# Linux/macOS aliases (if shell profile detected)
pepperqc-start    # Start all services
pepperqc-stop     # Stop all services
pepperqc-logs     # View service logs
pepperqc-update   # Update to latest version

# Manual commands (all platforms)
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker-compose logs -f        # View logs
git pull && docker-compose up --build -d  # Update
```

## Troubleshooting

### Permission Issues (Linux)
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Docker Not Running
- **Windows/macOS**: Start Docker Desktop
- **Linux**: `sudo systemctl start docker`

### Port Conflicts
Modify `docker-compose.yml` to use different ports if 3000, 5000, or 5432 are in use.

### Memory Issues
Ensure Docker has at least 4GB RAM allocated (8GB recommended for heavy processing).

## Manual Installation

If you prefer manual installation, see the [main README.md](../README.md) for detailed step-by-step instructions.