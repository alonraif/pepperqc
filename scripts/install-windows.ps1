# PepperQC Windows Installation Script
# Prerequisites: Docker Desktop and Git for Windows must be installed
# Run this script in PowerShell as Administrator

param(
    [string]$TelegramToken = "",
    [string]$Domain = "",
    [string]$Email = ""
)

Write-Host "🌶️  PepperQC Installation Script for Windows" -ForegroundColor Red
Write-Host "=================================================" -ForegroundColor Yellow

# Check if running as Administrator
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "❌ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Function to check if a command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

Write-Host "🔍 Checking prerequisites..." -ForegroundColor Green

# Check Docker
if (-not (Test-Command "docker")) {
    Write-Host "❌ Docker not found. Please install Docker Desktop:" -ForegroundColor Red
    Write-Host "   https://docs.docker.com/desktop/windows/install/" -ForegroundColor Yellow
    exit 1
}

# Check Docker Compose
if (-not (Test-Command "docker-compose")) {
    Write-Host "❌ Docker Compose not found. Please ensure Docker Desktop is properly installed." -ForegroundColor Red
    exit 1
}

# Check Git
if (-not (Test-Command "git")) {
    Write-Host "❌ Git not found. Please install Git for Windows:" -ForegroundColor Red
    Write-Host "   https://gitforwindows.org/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
try {
    docker version | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host "✅ All prerequisites met!" -ForegroundColor Green

# Create installation directory
$installPath = "$env:USERPROFILE\PepperQC"
Write-Host "📁 Installing to: $installPath" -ForegroundColor Cyan

if (Test-Path $installPath) {
    $response = Read-Host "Directory already exists. Remove it? (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        Remove-Item $installPath -Recurse -Force
        Write-Host "🗑️  Removed existing directory" -ForegroundColor Yellow
    } else {
        Write-Host "📁 Using existing directory" -ForegroundColor Yellow
    }
}

# Clone repository
Write-Host "⬇️  Cloning PepperQC repository..." -ForegroundColor Cyan
try {
    git clone https://github.com/alonraif/pepperqc.git $installPath
    if ($LASTEXITCODE -ne 0) { throw "Git clone failed" }
    Write-Host "✅ Repository cloned successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to clone repository: $_" -ForegroundColor Red
    exit 1
}

Set-Location $installPath

# Create .env file
Write-Host "⚙️  Creating configuration..." -ForegroundColor Cyan
$envContent = @"
# Database Configuration
POSTGRES_USER=pepper
POSTGRES_PASSWORD=pepper
POSTGRES_DB=pepperqc
DATABASE_URL=postgresql+psycopg2://pepper:pepper@db:5432/pepperqc

"@

# Add optional configurations if provided
if ($TelegramToken) {
    $envContent += "# Telegram Configuration`nTELEGRAM_BOT_TOKEN=$TelegramToken`n`n"
    Write-Host "📱 Telegram token configured" -ForegroundColor Green
}

if ($Domain -and $Email) {
    $envContent += "# SSL Configuration`nSSL_HOSTNAME=$Domain`nSSL_EMAIL=$Email`n"
    Write-Host "🔒 SSL configuration added" -ForegroundColor Green
}

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Host "✅ Configuration file created" -ForegroundColor Green

# Build and start services
Write-Host "🏗️  Building and starting PepperQC services..." -ForegroundColor Cyan
Write-Host "   This may take a few minutes on first run..." -ForegroundColor Yellow

try {
    docker-compose up --build -d
    if ($LASTEXITCODE -ne 0) { throw "Docker compose failed" }
    Write-Host "✅ Services started successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to start services: $_" -ForegroundColor Red
    Write-Host "Check logs with: docker-compose logs" -ForegroundColor Yellow
    exit 1
}

# Wait for services to be ready
Write-Host "⏳ Waiting for services to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Check if services are running
$services = docker-compose ps --services
$runningServices = docker-compose ps --filter "status=running" --services

Write-Host "`n🎉 PepperQC Installation Complete!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Yellow

Write-Host "🌐 Access your PepperQC instance:" -ForegroundColor Cyan
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "   Backend:  http://localhost:5000" -ForegroundColor White

if ($Domain) {
    Write-Host "   Domain:   https://$Domain (after DNS setup)" -ForegroundColor White
}

Write-Host "`n📋 Useful Commands:" -ForegroundColor Cyan
Write-Host "   View logs:    docker-compose logs -f" -ForegroundColor White
Write-Host "   Stop:         docker-compose down" -ForegroundColor White
Write-Host "   Restart:      docker-compose restart" -ForegroundColor White
Write-Host "   Update:       git pull && docker-compose up --build -d" -ForegroundColor White

Write-Host "`n🔧 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "   2. Go to Settings > Notifications to configure Telegram" -ForegroundColor White
Write-Host "   3. Upload a test video to verify everything works" -ForegroundColor White

if (-not $TelegramToken) {
    Write-Host "   4. Configure Telegram bot token in the web interface" -ForegroundColor White
}

Write-Host "`n✅ Installation directory: $installPath" -ForegroundColor Green
Write-Host "📖 Full documentation: https://github.com/alonraif/pepperqc/blob/main/README.md" -ForegroundColor Cyan

# Create desktop shortcut
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktopPath\PepperQC.url"
$shortcutContent = @"
[InternetShortcut]
URL=http://localhost:3000
"@
$shortcutContent | Out-File -FilePath $shortcutPath -Encoding ASCII
Write-Host "🔗 Desktop shortcut created" -ForegroundColor Green

Write-Host "`nEnjoy using PepperQC! 🌶️" -ForegroundColor Red