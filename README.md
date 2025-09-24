# PepperQC 🌶️

PepperQC is a media quality-control platform that automates video analysis, generates visual reports, and keeps stakeholders informed through real-time notifications. The stack combines a Flask API, Celery background workers, a PostgreSQL database, and a React front end. Test submissions are processed with QCTools/FFmpeg detectors, and the results feed a review dashboard as well as Telegram alerts.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [System Requirements](#system-requirements)
- [Quick Start](#quick-start)
- [Installation](#installation)
  - [Windows](#-windows-1011)
  - [Linux](#-linux-ubuntudebiancentosrhel)
  - [macOS](#-macos)
- [Environment Configuration](#environment-configuration)
- [Starting PepperQC](#starting-pepperqc)
- [Auto-Start on System Boot](#auto-start-on-system-boot)
- [Verifying Installation](#verifying-installation)
- [Troubleshooting](#troubleshooting)
- [Updating PepperQC](#updating-pepperqc)
- [Usage](#usage)
- [API Reference](#manual-api-requests)
- [Development](#frontend-build)
- [Testing](#running-tests)
- [Deployment](#deployment-notes)
- [License](#license)

## System Requirements

### Minimum Requirements
- **RAM:** 4GB (8GB recommended for heavy media processing)
- **Storage:** 10GB free space (more for media uploads)
- **CPU:** 2 cores (4+ cores recommended)
- **Network:** Internet connection for Telegram notifications and SSL certificates

### Supported Platforms
- ✅ **Windows 10/11** (with WSL 2)
- ✅ **macOS 10.15+** (Intel and Apple Silicon)
- ✅ **Linux** (Ubuntu 18.04+, Debian 10+, CentOS 7+, RHEL 7+, Fedora 30+)

## Features

- **Automated QC pipeline** – Upload media for analysis via the dashboard or API; Celery workers handle QCTools + FFmpeg processing.
- **Severity-aware reporting** – Generated PDF reports summarize findings with screenshots and severity breakdowns.
- **Telegram notifications** – Configurable recipients receive alerts on job submission, success (with PDF attachments), or failure (with error context).
- **Preset management** – Define, update, and mark default analysis presets from the UI.
- **Review dashboard** – Monitor job progress, drill into findings, and download reports in the browser.

## Architecture

| Component | Description |
|-----------|-------------|
| `backend/` | Flask REST API, SQLAlchemy models, Celery tasks, Telegram integration helpers. |
| `backend/uploads/` | Persistent volume for uploaded media and generated reports. |
| `worker` | Celery worker container processing QC tasks and dispatching Telegram messages. |
| `frontend/` | React single-page app served via Nginx in production. |
| `redis` | Message broker + result backend for Celery. |
| `db` | PostgreSQL database storing jobs, presets, and Telegram recipients. |

## Quick Start

**Already have Docker installed?** Get PepperQC running in under 5 minutes:

```bash
# Clone the repository
git clone https://github.com/your-username/pepperqc.git
cd pepperqc

# Create environment file
cat > .env << EOF
POSTGRES_USER=pepper
POSTGRES_PASSWORD=pepper
POSTGRES_DB=pepperqc
DATABASE_URL=postgresql+psycopg2://pepper:pepper@db:5432/pepperqc
EOF

# Build and run
docker-compose up --build

# Access at http://localhost:3000
```

**Need to install Docker?** Follow the detailed installation guide below.

---

## Installation

### Prerequisites

Choose your platform and follow the installation guide below:

#### 🪟 Windows (10/11)

**Required Software:**
- [Docker Desktop for Windows](https://docs.docker.com/desktop/windows/install/)
- [Git for Windows](https://gitforwindows.org/)
- [Visual Studio Code](https://code.visualstudio.com/) (recommended)

**Installation Steps:**

1. **Install Docker Desktop:**
   ```cmd
   # Download and install from https://docs.docker.com/desktop/windows/install/
   # Ensure WSL 2 backend is enabled (default)
   # Restart your computer after installation
   ```

2. **Install Git:**
   ```cmd
   # Download and install from https://gitforwindows.org/
   # Use default settings during installation
   ```

3. **Clone the repository:**
   ```cmd
   git clone https://github.com/your-username/pepperqc.git
   cd pepperqc
   ```

4. **Set up environment variables:**
   ```cmd
   # Create .env file
   copy nul .env
   # Open .env in notepad and add the configuration below
   notepad .env
   ```

5. **Start Docker Desktop** and ensure it's running (check system tray)

6. **Run PepperQC:**
   ```cmd
   docker-compose up --build
   ```

**Windows-Specific Notes:**
- Ensure Hyper-V is enabled in Windows Features
- If using WSL 2, allocate sufficient memory (4GB+ recommended)
- Windows Defender may require Docker path exclusions for better performance

---

#### 🐧 Linux (Ubuntu/Debian/CentOS/RHEL)

**Required Software:**
- Docker Engine
- Docker Compose
- Git

**Ubuntu/Debian Installation:**

1. **Update package index:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Install Git:**
   ```bash
   sudo apt install git -y
   ```

3. **Install Docker:**
   ```bash
   # Add Docker's official GPG key
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

   # Add Docker repository
   echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

   # Install Docker Engine
   sudo apt update
   sudo apt install docker-ce docker-ce-cli containerd.io -y

   # Add user to docker group (logout/login required)
   sudo usermod -aG docker $USER
   newgrp docker
   ```

4. **Install Docker Compose:**
   ```bash
   # Download and install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose

   # Verify installation
   docker-compose --version
   ```

5. **Clone and setup:**
   ```bash
   git clone https://github.com/your-username/pepperqc.git
   cd pepperqc
   ```

**CentOS/RHEL/Fedora Installation:**

```bash
# Install Git
sudo yum install git -y  # CentOS 7
sudo dnf install git -y  # CentOS 8+ / Fedora

# Install Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io -y

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Docker Compose (same as Ubuntu)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

---

#### 🍎 macOS

**Required Software:**
- [Docker Desktop for Mac](https://docs.docker.com/desktop/mac/install/)
- [Homebrew](https://brew.sh/) (recommended package manager)
- Git (included with Xcode Command Line Tools)

**Installation Steps:**

1. **Install Xcode Command Line Tools:**
   ```bash
   xcode-select --install
   ```

2. **Install Homebrew (optional but recommended):**
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. **Install Docker Desktop:**
   ```bash
   # Option 1: Download from https://docs.docker.com/desktop/mac/install/
   # Option 2: Using Homebrew
   brew install --cask docker

   # Launch Docker Desktop from Applications folder
   open /Applications/Docker.app
   ```

4. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/pepperqc.git
   cd pepperqc
   ```

5. **Alternative: Install via Homebrew:**
   ```bash
   # If you prefer installing Docker via Homebrew
   brew install docker docker-compose

   # Note: You'll still need Docker Desktop or colima for the Docker daemon
   brew install colima
   colima start
   ```

---

### Environment Configuration

Create a `.env` file in the repository root with the following configuration:

```bash
# Database Configuration
POSTGRES_USER=pepper
POSTGRES_PASSWORD=pepper
POSTGRES_DB=pepperqc
DATABASE_URL=postgresql+psycopg2://pepper:pepper@db:5432/pepperqc

# Optional: Telegram Integration
# TELEGRAM_BOT_TOKEN=123456789:ABCDEF...
# TELEGRAM_API_BASE=https://api.telegram.org

# Optional: SSL Configuration (for production)
# SSL_HOSTNAME=pepperqc.yourdomain.com
# SSL_EMAIL=admin@yourdomain.com
```

### Starting PepperQC

1. **Ensure Docker is running** on your system

2. **Build and start all services:**
   ```bash
   # Build and start in foreground (recommended for first run)
   docker-compose up --build

   # Or run in background
   docker-compose up --build -d
   ```

3. **Access the application:**
   - **Frontend (React):** http://localhost:3000
   - **Backend API:** http://localhost:5000
   - **PostgreSQL:** localhost:5432

4. **Stop the application:**
   ```bash
   # Stop all services
   docker-compose down

   # Stop and remove volumes (reset data)
   docker-compose down -v
   ```

### Auto-Start on System Boot

To automatically start PepperQC when your computer boots:

**Windows:**
- Docker Desktop can be set to start with Windows in its settings
- Services will auto-start due to `restart: unless-stopped` policy

**Linux (systemd):**
```bash
# Enable Docker service to start on boot
sudo systemctl enable docker

# Services will auto-start due to restart policies
```

**macOS:**
- Docker Desktop can be set to start at login in its preferences
- Services will auto-start due to `restart: unless-stopped` policy

### Verifying Installation

1. **Check service status:**
   ```bash
   docker-compose ps
   ```

2. **View logs:**
   ```bash
   # All services
   docker-compose logs -f

   # Specific service
   docker-compose logs -f backend
   ```

3. **Test the installation:**
   - Open http://localhost:3000
   - Upload a small video file
   - Check that the job appears in the dashboard
   - Monitor worker logs for processing updates

### Troubleshooting

**Common Issues:**

- **Port conflicts:** If ports 3000, 5000, or 5432 are in use, modify the port mappings in `docker-compose.yml`
- **Permission errors (Linux):** Ensure your user is in the docker group: `sudo usermod -aG docker $USER`
- **Memory issues:** Allocate at least 4GB RAM to Docker
- **Windows WSL issues:** Ensure WSL 2 integration is enabled in Docker Desktop settings
- **macOS performance:** Consider increasing Docker Desktop resource limits in preferences

**Getting Help:**
- Check Docker logs: `docker-compose logs`
- Verify Docker installation: `docker --version && docker-compose --version`
- Ensure all required ports are available: `netstat -tulpn | grep -E ':(3000|5000|5432)'`

### Updating PepperQC

To update to the latest version:

```bash
# Stop the application
docker-compose down

# Pull latest changes
git pull origin main

# Rebuild and restart (this preserves your data)
docker-compose up --build -d

# Optional: Clean up old Docker images
docker system prune -f
```

**Note:** Database data and uploaded files are preserved in Docker volumes during updates.

---

## Usage

### Managing Telegram Recipients

1. Navigate to **Telegram** in the top navigation.
2. Paste the bot token (issued by Telegram’s `@BotFather`) and click **Save Token**. The token is stored in the database and can be updated or removed at any time from this screen.
3. Add users or groups by their numeric chat ID (users must message the bot first; groups must invite the bot).
4. Use **Send Test Message** to verify delivery; success updates the “Last Tested” timestamp.

Runtime behavior:

- Job submission → instant message summarizing filename/preset.
- Job success → summary with counts + PDF attachment (deferred review link).
- Job failure/cancellation → alert including stored error message.

### Manual API Requests

The API is documented informally below. Use `curl`/Postman for quick checks:

```bash
# List telegram recipients
curl http://localhost:5000/api/telegram/recipients

# Trigger a test message for a specific recipient
curl -X POST http://localhost:5000/api/telegram/recipients/1/test
```

See `backend/main.py` for full endpoint definitions.

## Frontend Build

During development the React app runs through Docker. For local builds without Docker:

```bash
cd frontend
npm install
npm start
```

Set `REACT_APP_API_BASE_URL=http://localhost:5000` if you start it outside Compose.

## Running Tests

Automated tests are not yet bundled. Suggested smoke checks:

1. Upload a small media file via the dashboard and confirm it appears in the job table.
2. Watch worker logs (`docker compose logs -f worker`) for QC progress + Telegram delivery messages.
3. Verify Telegram recipients receive submission/completion notifications.

## Repository Structure

```
backend/
  app/
  uploads/
  main.py
  telegram_service.py
frontend/
  src/
QCTools/
docker-compose.yml
README.md
```

`QCTools/` embeds upstream QCTools sources for reference; the runtime uses CLI binaries baked into the container image.

## Deployment Notes

- Use persistent volumes/buckets for `backend/uploads` when deploying to production.
- Manage secrets (Telegram token, database credentials) in your orchestration platform (e.g., Docker secrets, Kubernetes secrets).
- Ensure outbound access from worker nodes to `https://api.telegram.org` (or your specified base).

## License

The repository bundles third-party projects (QCTools uses GPL; see `QCTools/License.html`). Core PepperQC source currently carries no explicit license—add one before distribution if required.
