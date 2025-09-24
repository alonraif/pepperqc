# PepperQC

PepperQC is a media quality-control platform that automates video analysis, generates visual reports, and keeps stakeholders informed through real-time notifications. The stack combines a Flask API, Celery background workers, a PostgreSQL database, and a React front end. Test submissions are processed with QCTools/FFmpeg detectors, and the results feed a review dashboard as well as Telegram alerts.

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

## Prerequisites

- Docker and Docker Compose (for the default workflow)
- Git LFS if you intend to pull large media assets (not required for source)

## Environment Variables

Create a `.env` file in the repository root (already git-ignored). Required entries:

```
POSTGRES_USER=pepper
POSTGRES_PASSWORD=pepper
POSTGRES_DB=pepperqc
DATABASE_URL=postgresql+psycopg2://pepper:pepper@db:5432/pepperqc
TELEGRAM_BOT_TOKEN=123456789:ABCDEF...
# Optional overrides
# TELEGRAM_API_BASE=https://your-proxy.example.com
```

> **Note:** The Telegram bot token is environment-only. Generate it via Telegram’s `@BotFather`, add it to `.env`, and restart the backend + worker containers.

## Getting Started

```bash
docker compose up --build
```

Services exposed:

- Frontend (React) – `http://localhost:3000`
- Backend API – `http://localhost:5000`
- PostgreSQL – `localhost:5432`

Hot reloading is enabled for both backend (Gunicorn `--reload`) and Celery (`--autoscale` workers) through bind mounts.

### Managing Telegram Recipients

1. Navigate to **Telegram** in the top navigation.
2. Add users or groups by their numeric chat ID (users must message the bot first; groups must invite the bot).
3. Use **Send Test Message** to verify delivery; success updates the “Last Tested” timestamp.

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

