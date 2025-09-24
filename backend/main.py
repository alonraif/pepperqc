import os
import json
import uuid
import shutil
import re
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from celery import Celery, states
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from werkzeug.utils import secure_filename
from utils import (
    AVAILABLE_QCTOOLS_TESTS,
    FFMPEG_DETECTORS,
    get_default_qctools_preset,
    normalize_qctools_preset,
    run_ffmpeg_detectors,
    run_qctools_analysis,
    get_file_analysis,
    generate_job_report,
    build_report_filename,
)
from telegram_service import (
    is_configured as telegram_is_configured,
    send_message as telegram_send_message,
    send_document as telegram_send_document,
)

# --- App, DB, and Celery Configuration ---
app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
app.config['CELERY_BROKER_URL'] = os.environ.get('CELERY_BROKER_URL')
app.config['CELERY_RESULT_BACKEND'] = os.environ.get('CELERY_RESULT_BACKEND')
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(APP_ROOT, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DEFAULT_PRESET_PARAMS = get_default_qctools_preset()

# --- Database Models (Unchanged) ---
class Preset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    parameters = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_default = db.Column(db.Boolean, default=False)

class Job(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), default='PENDING')
    result = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    percent = db.Column(db.Integer, default=0)
    preset_id = db.Column(db.Integer, db.ForeignKey('preset.id'), nullable=True)
    preset = db.relationship('Preset', backref='jobs')

    @property
    def stored_filename(self):
        _, ext = os.path.splitext(self.filename or '')
        candidate = f"{self.id}{ext}" if ext else self.id
        candidate_path = os.path.join(UPLOAD_FOLDER, candidate)
        if os.path.exists(candidate_path):
            return candidate
        return self.filename

    @property
    def stored_filepath(self):
        return os.path.join(UPLOAD_FOLDER, self.stored_filename)


class TelegramRecipient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(120), nullable=False)
    chat_id = db.Column(db.String(100), unique=True, nullable=False)
    is_group = db.Column(db.Boolean, default=False)
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_tested_at = db.Column(db.DateTime, nullable=True)

    def as_dict(self):
        return {
            'id': self.id,
            'display_name': self.display_name,
            'chat_id': self.chat_id,
            'is_group': self.is_group,
            'enabled': self.enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_tested_at': self.last_tested_at.isoformat() if self.last_tested_at else None,
        }


class TelegramConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bot_token = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemConfig(db.Model):
    __tablename__ = 'system_config'

    key = db.Column(db.String(120), primary_key=True)
    value = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def _extract_issue_count(result_blob):
    if not result_blob:
        return 0
    if isinstance(result_blob, dict):
        payload = result_blob
    else:
        try:
            payload = json.loads(result_blob)
        except (TypeError, ValueError):
            return 0

    issues = payload.get('issues')
    if isinstance(issues, list):
        return len(issues)
    if isinstance(issues, dict):
        return sum(len(v) for v in issues.values() if isinstance(v, list))
    return 0


def _enabled_telegram_recipients():
    return TelegramRecipient.query.filter_by(enabled=True).all()


def _format_timestamp(value):
    if not value:
        return 'N/A'
    return value.strftime('%Y-%m-%d %H:%M UTC')


def _build_submission_message(job):
    preset_name = job.preset.name if job.preset else 'Default'
    submitted_at = _format_timestamp(job.created_at)
    return (
        '📥 PepperQC job submitted\n'
        f'File: {job.filename}\n'
        f'Preset: {preset_name}\n'
        f'Submitted: {submitted_at}'
    )


def _build_success_message(job, analysis_result):
    severity_summary = analysis_result.get('severity_summary') if isinstance(analysis_result, dict) else {}
    counts = severity_summary.get('counts', {}) if isinstance(severity_summary, dict) else {}
    total = severity_summary.get('total', 0)
    overall = severity_summary.get('overall', 'clear')
    lines = [
        '✅ PepperQC job completed',
        f'File: {job.filename}',
        f'Status: {overall.replace("_", " ").title()}',
        f'Total issues: {total}',
    ]
    if counts:
        lines.append(
            'Breakdown: '
            f"critical={counts.get('critical', 0)}, "
            f"non_critical={counts.get('non_critical', 0)}, "
            f"informational={counts.get('informational', 0)}"
        )
    lines.append(f'Completed: {_format_timestamp(datetime.utcnow())}')
    return '\n'.join(lines)


def _build_failure_message(job, error_message):
    base_lines = [
        '⚠️ PepperQC job failed',
        f'File: {job.filename}',
        f'Status: {job.status}',
    ]
    if error_message:
        base_lines.append(f'Error: {error_message}')
    base_lines.append(f'Finished: {_format_timestamp(datetime.utcnow())}')
    return '\n'.join(base_lines)


def _env_telegram_token():
    token = os.environ.get('TELEGRAM_BOT_TOKEN')
    return token.strip() if isinstance(token, str) and token.strip() else None


def _get_telegram_config(create_if_missing: bool = False):
    config = TelegramConfig.query.get(1)
    if not config and create_if_missing:
        config = TelegramConfig(id=1)
        db.session.add(config)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
    return config


def get_telegram_bot_token():
    env_token = _env_telegram_token()
    if env_token:
        return env_token
    config = _get_telegram_config()
    return (config.bot_token or '').strip() if config and config.bot_token else None


def get_telegram_token_status():
    env_token = _env_telegram_token()
    if env_token:
        return {
            'configured': True,
            'source': 'environment',
            'last_updated_at': None,
        }

    config = _get_telegram_config()
    if config and config.bot_token:
        return {
            'configured': True,
            'source': 'database',
            'last_updated_at': config.updated_at.isoformat() if config.updated_at else None,
        }

    return {'configured': False, 'source': 'unset', 'last_updated_at': None}


def set_telegram_bot_token(token: str):
    cleaned = (token or '').strip()
    if not cleaned:
        raise ValueError('Telegram bot token is required.')

    config = _get_telegram_config(create_if_missing=True)
    config.bot_token = cleaned
    config.updated_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return config


def clear_telegram_bot_token():
    config = _get_telegram_config()
    if not config or not config.bot_token:
        return config
    config.bot_token = None
    config.updated_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return config


def _get_system_config_value(key: str, default=None):
    entry = SystemConfig.query.get(key)
    if entry is None:
        return default
    return entry.value


def _set_system_config_value(key: str, value: str):
    entry = SystemConfig.query.get(key)
    timestamp = datetime.utcnow()
    if entry is None:
        entry = SystemConfig(key=key, value=value, created_at=timestamp, updated_at=timestamp)
        db.session.add(entry)
    else:
        entry.value = value
        entry.updated_at = timestamp
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return entry


def get_domain_settings():
    return {
        'hostname': _get_system_config_value('domain.hostname', ''),
        'lets_encrypt_email': _get_system_config_value('domain.lets_encrypt_email', ''),
    }


def _write_caddyfile(contents: str) -> None:
    target_path = os.environ.get('CADDYFILE_PATH')
    if not target_path:
        return
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    # Also ensure caddy storage directory exists
    storage_path = os.environ.get('CADDY_STORAGE_PATH')
    if storage_path:
        Path(storage_path).mkdir(parents=True, exist_ok=True)

    target.write_text(contents, encoding='utf-8')


def _load_caddy_config(contents: str) -> None:
    admin_url = os.environ.get('CADDY_ADMIN_URL')
    if not admin_url:
        return
    try:
        response = requests.post(
            f"{admin_url.rstrip('/')}/load",
            data=contents,
            headers={'Content-Type': 'text/caddyfile'},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f'Unable to apply configuration via Caddy admin API: {exc}') from exc


def _build_caddyfile(hostname: str, email: str) -> str:
    base_header_lines = ['{', '  admin 0.0.0.0:2019']
    if email:
        base_header_lines.append(f'  email {email}')
    if not hostname:
        base_header_lines.append('  auto_https off')
    base_header_lines.append('}')

    api_block = [
        '  @api path_prefix /api',
        '  reverse_proxy @api backend:5000',
        '  reverse_proxy frontend:80',
    ]

    if hostname:
        site_block = [
            f'{hostname} {{',
            '  encode zstd gzip',
        ] + api_block + [
            '  log {',
            '    output file /var/log/caddy/access.log',
            '  }',
            '}',
            '',
            f'http://{hostname} {{',
            '  redir https://{host}{uri} 308',
            '}',
        ]
    else:
        site_block = [
            ':80 {',
            '  encode zstd gzip',
        ] + api_block + ['}']

    lines = base_header_lines + [''] + site_block
    return '\n'.join(lines) + '\n'


def apply_reverse_proxy_configuration(hostname: str, email: str) -> None:
    caddyfile_contents = _build_caddyfile(hostname, email)
    _write_caddyfile(caddyfile_contents)
    try:
        _load_caddy_config(caddyfile_contents)
    except RuntimeError as exc:
        raise


def _find_certificate_metadata(hostname: str):
    storage_root = os.environ.get('CADDY_STORAGE_PATH')
    if not storage_root or not hostname:
        return None

    certificates_dir = Path(storage_root) / 'certificates'
    if not certificates_dir.exists():
        return None

    # Search within ACME directories
    try:
        for issuer_dir in certificates_dir.iterdir():
            potential = issuer_dir / hostname / f'{hostname}.json'
            if potential.exists():
                try:
                    payload = json.loads(potential.read_text(encoding='utf-8'))
                    return payload
                except (ValueError, OSError):
                    continue
    except OSError:
        return None
    return None


def get_certificate_status(hostname: str):
    metadata = _find_certificate_metadata(hostname)
    if not metadata:
        return {
            'has_certificate': False,
            'expires_at': None,
            'days_remaining': None,
        }

    expires_at = metadata.get('expires')
    expires_dt = None
    if expires_at:
        try:
            expires_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        except ValueError:
            expires_dt = None

    days_remaining = None
    if expires_dt:
        delta = expires_dt - datetime.utcnow().replace(tzinfo=expires_dt.tzinfo)
        days_remaining = round(delta.total_seconds() / 86400, 2)

    return {
        'has_certificate': True,
        'expires_at': expires_dt.isoformat() if expires_dt else expires_at,
        'days_remaining': days_remaining,
    }


_HOSTNAME_PATTERN = re.compile(r'^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.(?:[A-Za-z0-9-]{1,63}\.)*[A-Za-z]{2,63}$')


def _is_valid_hostname(hostname: str) -> bool:
    if not hostname:
        return False
    candidate = hostname.strip().lower()
    if candidate.endswith('.'): 
        candidate = candidate[:-1]
    if candidate.count('.') < 1:
        return False
    return bool(_HOSTNAME_PATTERN.match(candidate))


def _compose_telegram_settings():
    status = get_telegram_token_status()
    configured = telegram_is_configured(get_telegram_bot_token())
    recipients_total = TelegramRecipient.query.count()
    latest_test = db.session.query(func.max(TelegramRecipient.last_tested_at)).scalar()

    return {
        'configured': configured,
        'token_source': status['source'],
        'token_last_updated_at': status['last_updated_at'],
        'recipient_count': recipients_total,
        'last_tested_at': latest_test.isoformat() if latest_test else None,
    }


def _compose_domain_settings():
    settings = get_domain_settings()
    hostname = (settings.get('hostname') or '').strip()
    cert_info = get_certificate_status(hostname)
    return {
        'hostname': hostname,
        'lets_encrypt_email': settings.get('lets_encrypt_email') or '',
        'certificate': cert_info,
    }

def _send_notifications(text, attachment_path=None, attachment_caption=None):
    token = get_telegram_bot_token()
    if not telegram_is_configured(token):
        return

    recipients = _enabled_telegram_recipients()
    if not recipients:
        return

    for recipient in recipients:
        ok = telegram_send_message(recipient.chat_id, text, token=token)
        if attachment_path and ok:
            telegram_send_document(recipient.chat_id, attachment_path, caption=attachment_caption, token=token)


def cleanup_expired_jobs(max_age_days: int = 7):
    cutoff = datetime.utcnow() - timedelta(days=max_age_days)
    expired_jobs = Job.query.filter(Job.created_at < cutoff).all()
    if not expired_jobs:
        return

    for job in expired_jobs:
        try:
            path = job.stored_filepath
            if path and os.path.exists(path):
                os.remove(path)
            report_path = os.path.join(UPLOAD_FOLDER, 'reports', build_report_filename(job))
            if os.path.exists(report_path):
                os.remove(report_path)
            screenshot_dir = os.path.join(UPLOAD_FOLDER, 'reports', 'screenshots', job.id)
            if os.path.isdir(screenshot_dir):
                shutil.rmtree(screenshot_dir, ignore_errors=True)
        except OSError:
            pass
        db.session.delete(job)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

# --- UPDATED Celery Task ---
@celery.task(bind=True)
def process_video_file(self, file_path, job_id, preset_params):
    with app.app_context():
        try:
            job = Job.query.get(job_id)
            if not job: return
            preset_label = job.preset.name if job.preset else 'Default'
            normalized_preset = normalize_qctools_preset(preset_params)

            def push_progress(percent, current_test):
                tracked_job = Job.query.get(job_id)
                if not tracked_job:
                    return
                tracked_job.status = 'PROCESSING'
                tracked_job.percent = int(percent)
                tracked_job.result = json.dumps(
                    {
                        'current_test': current_test,
                        'preset_name': preset_label,
                    }
                )
                db.session.commit()

            push_progress(5, 'Initializing analysis')

            push_progress(20, 'QCTools analysis')
            try:
                qctools_result = run_qctools_analysis(file_path, normalized_preset)
                qctools_error = None
            except RuntimeError as qc_err:
                print(f"QCTools analysis failed for {file_path}: {qc_err}")
                qctools_result = {"filters": [], "issues": [], "statistics": {}}
                qctools_error = str(qc_err)

            push_progress(60, 'FFmpeg detectors')
            ffmpeg_result = run_ffmpeg_detectors(file_path, normalized_preset)

            push_progress(85, 'Compiling results')
            file_info = get_file_analysis(file_path)

            combined_issues = qctools_result.get('issues', []) + ffmpeg_result.get('issues', [])

            severity_counts = {'critical': 0, 'non_critical': 0, 'informational': 0}
            for issue in combined_issues:
                raw_severity = str(issue.get('severity') or '').lower()
                if raw_severity in ('critical', 'high'):
                    normalized_severity = 'critical'
                elif raw_severity in ('informational', 'info', 'notice'):
                    normalized_severity = 'informational'
                else:
                    normalized_severity = 'non_critical'
                issue['severity'] = normalized_severity
                severity_counts.setdefault(normalized_severity, 0)
                severity_counts[normalized_severity] += 1

            total_issues = sum(severity_counts.values())
            overall_severity = 'clear'
            if severity_counts.get('critical'):
                overall_severity = 'critical'
            elif severity_counts.get('non_critical'):
                overall_severity = 'non_critical'

            severity_summary = {
                'overall': overall_severity,
                'counts': severity_counts,
                'total': total_issues,
            }

            analysis_result = {
                'file_info': file_info,
                'issues': combined_issues,
                'qctools': qctools_result,
                'ffmpeg_reports': ffmpeg_result.get('reports', []),
                'preset': normalized_preset,
                'qctools_error': qctools_error,
                'current_test': None,
                'severity_summary': severity_summary,
            }

            job = Job.query.get(job_id)
            job.status = 'SUCCESS'
            job.percent = 100
            job.result = json.dumps(analysis_result)
            db.session.commit()
            send_job_completed_notification.delay(job.id, 'SUCCESS')
            return {'status': 'SUCCESS', 'result': analysis_result}
        except Exception as e:
            db.session.rollback()
            job = Job.query.get(job_id)
            if job:
                job.status = 'FAILURE'; job.percent = 100
                job.result = json.dumps({'error': f'An error occurred during analysis: {str(e)}'})
                db.session.commit()
                send_job_completed_notification.delay(job.id, 'FAILURE', str(e))
            self.update_state(state=states.FAILURE, meta={'exc_type': type(e).__name__, 'exc_message': str(e)})
            raise


@celery.task()
def send_job_submitted_notification(job_id):
    with app.app_context():
        job = Job.query.get(job_id)
        if not job:
            return
        text = _build_submission_message(job)
        _send_notifications(text)


@celery.task()
def send_job_completed_notification(job_id, status, error_message=None):
    with app.app_context():
        job = Job.query.get(job_id)
        if not job:
            return

        if status == 'SUCCESS':
            try:
                analysis_result = json.loads(job.result) if job.result else {}
            except (TypeError, ValueError):
                analysis_result = {}

            message = _build_success_message(job, analysis_result)
            attachment_path = None
            try:
                if job.result:
                    attachment_path = generate_job_report(job, analysis_result, UPLOAD_FOLDER)
            except Exception as report_error:
                print(f'Failed to generate Telegram report for job {job.id}: {report_error}')
                attachment_path = None

            caption = f'PepperQC summary for {job.filename}' if attachment_path else None
            _send_notifications(message, attachment_path=attachment_path, attachment_caption=caption)
        else:
            if not error_message and job.result:
                try:
                    parsed = json.loads(job.result)
                    error_message = parsed.get('error')
                except (TypeError, ValueError):
                    error_message = error_message
            message = _build_failure_message(job, error_message)
            _send_notifications(message)

# --- API Endpoints ---
@app.route('/api/jobs', methods=['POST'])
def create_job():
    cleanup_expired_jobs()
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    uploaded_file = request.files['file']
    if not uploaded_file or uploaded_file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    original_filename = uploaded_file.filename
    safe_filename = secure_filename(original_filename)
    if not safe_filename:
        return jsonify({"error": "Invalid filename"}), 400

    job_id = str(uuid.uuid4())
    _, extension = os.path.splitext(safe_filename)
    stored_filename = f"{job_id}{extension}" if extension else job_id
    stored_path = os.path.join(UPLOAD_FOLDER, stored_filename)
    uploaded_file.save(stored_path)

    preset_id_raw = request.form.get('preset_id')
    preset_config = get_default_qctools_preset()
    preset = None

    if preset_id_raw:
        try:
            preset_id_int = int(preset_id_raw)
        except ValueError:
            return jsonify({"error": "Invalid preset id"}), 400

        preset = Preset.query.get(preset_id_int)
        if not preset:
            return jsonify({"error": f"Preset with ID {preset_id_int} not found"}), 400
    else:
        preset = Preset.query.filter_by(is_default=True).first()
        if not preset:
            preset = Preset.query.filter_by(name='Default').first()
        if not preset:
            preset = Preset.query.first()

    if preset:
        preset_config = normalize_qctools_preset(preset.parameters)

    new_job = Job(id=job_id, filename=original_filename, status='QUEUED', preset_id=preset.id if preset else None)
    db.session.add(new_job)
    db.session.commit()

    process_video_file.apply_async(args=[stored_path, new_job.id, preset_config], task_id=job_id)
    send_job_submitted_notification.delay(job_id)
    return jsonify({"job_id": job_id}), 202

@app.route('/api/jobs', methods=['GET'])
def get_all_jobs():
    cleanup_expired_jobs()
    jobs = Job.query.order_by(Job.created_at.desc()).all()
    payload = []
    for job in jobs:
        issue_count = _extract_issue_count(job.result)
        try:
            result_payload = json.loads(job.result) if job.result else {}
        except (TypeError, ValueError):
            result_payload = {}

        severity_summary = result_payload.get('severity_summary') if isinstance(result_payload, dict) else {}
        severity_counts = severity_summary.get('counts') if isinstance(severity_summary, dict) else {}
        overall_severity = severity_summary.get('overall') if isinstance(severity_summary, dict) else None
        if not overall_severity:
            overall_severity = 'clear' if issue_count == 0 else 'non_critical'

        payload.append({
            'id': job.id,
            'filename': job.filename,
            'status': job.status,
            'created_at': job.created_at.isoformat(),
            'percent': job.percent,
            'preset_name': job.preset.name if job.preset else 'Default',
            'video_filename': job.stored_filename,
            'issues_count': issue_count,
            'has_issues': issue_count > 0,
            'current_test': result_payload.get('current_test') if isinstance(result_payload, dict) else None,
            'severity': overall_severity,
            'severity_counts': severity_counts,
            'critical_issues': severity_counts.get('critical', 0) if isinstance(severity_counts, dict) else 0,
            'non_critical_issues': severity_counts.get('non_critical', 0) if isinstance(severity_counts, dict) else 0,
        })
    return jsonify(payload)

@app.route('/api/jobs/<job_id>', methods=['GET'])
def get_job_details(job_id):
    job = Job.query.get(job_id)
    if not job: return jsonify({'error': 'Job not found'}), 404
    result_data = json.loads(job.result) if job.result else None
    issues_count = _extract_issue_count(result_data if result_data is not None else job.result)
    severity_summary = result_data.get('severity_summary') if isinstance(result_data, dict) else {}
    severity_counts = severity_summary.get('counts') if isinstance(severity_summary, dict) else {}
    overall_severity = severity_summary.get('overall') if isinstance(severity_summary, dict) else None
    if not overall_severity:
        overall_severity = 'clear' if issues_count == 0 else 'non_critical'

    return jsonify({
        'id': job.id,
        'filename': job.filename,
        'status': job.status,
        'created_at': job.created_at.isoformat(),
        'result': result_data,
        'percent': job.percent,
        'video_filename': job.stored_filename,
        'preset_name': job.preset.name if job.preset else 'Default',
        'issues_count': issues_count,
        'has_issues': issues_count > 0,
        'current_test': result_data.get('current_test') if isinstance(result_data, dict) else None,
        'severity': overall_severity,
        'severity_counts': severity_counts,
        'critical_issues': severity_counts.get('critical', 0) if isinstance(severity_counts, dict) else 0,
        'non_critical_issues': severity_counts.get('non_critical', 0) if isinstance(severity_counts, dict) else 0,
    })


@app.route('/api/jobs/<job_id>/report', methods=['GET'])
def download_job_report(job_id):
    job = Job.query.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    if not job.result:
        return jsonify({'error': 'No analysis data available for this job yet.'}), 400

    try:
        analysis_result = json.loads(job.result) if job.result else {}
    except (TypeError, ValueError):
        analysis_result = {}

    try:
        report_path = generate_job_report(job, analysis_result, UPLOAD_FOLDER)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 500

    if not os.path.exists(report_path):
        return jsonify({'error': 'Unable to generate report.'}), 500

    directory, filename = os.path.split(report_path)
    return send_from_directory(directory, filename, as_attachment=True, mimetype='application/pdf')


@app.route('/api/videos/<job_id>')
def serve_video(job_id):
    job = Job.query.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    if not os.path.exists(job.stored_filepath):
        return jsonify({'error': 'Video file missing'}), 404
    return send_from_directory(UPLOAD_FOLDER, job.stored_filename)

@app.route('/api/jobs/<job_id>', methods=['DELETE'])
def delete_job(job_id):
    job = Job.query.get(job_id)
    if not job: return jsonify({'error': 'Job not found'}), 404
    try:
        if os.path.exists(job.stored_filepath):
            os.remove(job.stored_filepath)
        db.session.delete(job)
        db.session.commit()
        return jsonify({'message': 'Job deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# --- Telegram Integration ---
@app.route('/api/telegram/token', methods=['GET'])
def telegram_token_details():
    status = get_telegram_token_status()
    status['configured'] = telegram_is_configured(get_telegram_bot_token())
    return jsonify(status), 200


@app.route('/api/telegram/token', methods=['POST'])
def update_telegram_token():
    if _env_telegram_token():
        return jsonify({'error': 'Telegram bot token is managed via environment variable. Unset TELEGRAM_BOT_TOKEN to manage it from the UI.'}), 409

    data = request.get_json() or {}
    token = (data.get('bot_token') or '').strip()
    if not token:
        return jsonify({'error': 'Telegram bot token is required.'}), 400

    try:
        set_telegram_bot_token(token)
        status = get_telegram_token_status()
        status['configured'] = telegram_is_configured(get_telegram_bot_token())
        return jsonify(status), 200
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to update Telegram bot token.'}), 500


@app.route('/api/telegram/token', methods=['DELETE'])
def delete_telegram_token():
    if _env_telegram_token():
        return jsonify({'error': 'Telegram bot token is managed via environment variable. Unset TELEGRAM_BOT_TOKEN to manage it from the UI.'}), 409

    try:
        clear_telegram_bot_token()
        status = get_telegram_token_status()
        status['configured'] = telegram_is_configured(get_telegram_bot_token())
        return jsonify(status), 200
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to remove Telegram bot token.'}), 500


@app.route('/api/telegram/status', methods=['GET'])
def telegram_status():
    recipients_total = TelegramRecipient.query.count()
    latest_test = db.session.query(func.max(TelegramRecipient.last_tested_at)).scalar()
    token_status = get_telegram_token_status()
    configured = telegram_is_configured(get_telegram_bot_token())
    return jsonify({
        'configured': configured,
        'recipient_count': recipients_total,
        'last_tested_at': latest_test.isoformat() if latest_test else None,
        'token_source': token_status['source'],
        'token_last_updated_at': token_status['last_updated_at'],
    })


@app.route('/api/telegram/recipients', methods=['GET'])
def list_telegram_recipients():
    recipients = TelegramRecipient.query.order_by(TelegramRecipient.created_at.desc()).all()
    return jsonify([recipient.as_dict() for recipient in recipients])


@app.route('/api/telegram/recipients', methods=['POST'])
def create_telegram_recipient():
    data = request.get_json() or {}
    display_name = (data.get('display_name') or '').strip()
    chat_id = str(data.get('chat_id') or '').strip()
    if not display_name or not chat_id:
        return jsonify({'error': 'Display name and chat ID are required.'}), 400

    existing = TelegramRecipient.query.filter_by(chat_id=chat_id).first()
    if existing:
        return jsonify({'error': 'Chat ID already configured.'}), 409

    recipient = TelegramRecipient(
        display_name=display_name,
        chat_id=chat_id,
        is_group=bool(data.get('is_group', False)),
        enabled=bool(data.get('enabled', True)),
    )
    db.session.add(recipient)
    db.session.commit()
    return jsonify(recipient.as_dict()), 201


@app.route('/api/telegram/recipients/<int:recipient_id>', methods=['PUT'])
def update_telegram_recipient(recipient_id):
    recipient = TelegramRecipient.query.get(recipient_id)
    if not recipient:
        return jsonify({'error': 'Recipient not found.'}), 404

    data = request.get_json() or {}
    display_name = data.get('display_name')
    chat_id = data.get('chat_id')

    if display_name is not None:
        cleaned = display_name.strip()
        if not cleaned:
            return jsonify({'error': 'Display name cannot be empty.'}), 400
        recipient.display_name = cleaned

    if chat_id is not None:
        cleaned_chat_id = str(chat_id).strip()
        if not cleaned_chat_id:
            return jsonify({'error': 'Chat ID cannot be empty.'}), 400
        existing = TelegramRecipient.query.filter(
            TelegramRecipient.chat_id == cleaned_chat_id,
            TelegramRecipient.id != recipient_id,
        ).first()
        if existing:
            return jsonify({'error': 'Chat ID already configured.'}), 409
        recipient.chat_id = cleaned_chat_id

    if 'is_group' in data:
        recipient.is_group = bool(data.get('is_group'))

    if 'enabled' in data:
        recipient.enabled = bool(data.get('enabled'))

    db.session.commit()
    return jsonify(recipient.as_dict()), 200


@app.route('/api/telegram/recipients/<int:recipient_id>', methods=['DELETE'])
def delete_telegram_recipient(recipient_id):
    recipient = TelegramRecipient.query.get(recipient_id)
    if not recipient:
        return jsonify({'error': 'Recipient not found.'}), 404

    db.session.delete(recipient)
    db.session.commit()
    return jsonify({'status': 'deleted'}), 200


@app.route('/api/telegram/recipients/<int:recipient_id>/test', methods=['POST'])
def test_telegram_recipient(recipient_id):
    recipient = TelegramRecipient.query.get(recipient_id)
    if not recipient:
        return jsonify({'error': 'Recipient not found.'}), 404

    token = get_telegram_bot_token()
    if not telegram_is_configured(token):
        return jsonify({'error': 'Telegram bot token is not configured.'}), 400

    message = (
        '🔔 PepperQC test message\n'
        f'Target: {recipient.display_name}\n'
        f'Sent at: {_format_timestamp(datetime.utcnow())}'
    )
    success = telegram_send_message(recipient.chat_id, message, token=token)
    if success:
        recipient.last_tested_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'status': 'sent', 'recipient': recipient.as_dict()}), 200

    return jsonify({'error': 'Unable to deliver Telegram message. Check chat ID and bot permissions.'}), 502


@app.route('/api/presets', methods=['GET'])
def get_presets():
    presets = Preset.query.all()
    return jsonify([
        {
            'id': p.id,
            'name': p.name,
            'parameters': normalize_qctools_preset(p.parameters),
            'is_default': p.is_default,
        }
        for p in presets
    ])

@app.route('/api/presets', methods=['POST'])
def create_preset():
    data = request.get_json()
    if not data or 'name' not in data or 'parameters' not in data:
        return jsonify({'error': 'Invalid data'}), 400
    
    # Check if preset name already exists
    existing_preset = Preset.query.filter_by(name=data['name']).first()
    if existing_preset:
        return jsonify({'error': f'Preset with name "{data["name"]}" already exists.'}), 409

    normalized_parameters = normalize_qctools_preset(data.get('parameters'))
    new_preset = Preset(name=data['name'], parameters=normalized_parameters)
    db.session.add(new_preset)
    if data.get('is_default'):
        Preset.query.update({Preset.is_default: False})
        new_preset.is_default = True
    db.session.commit()
    return jsonify({'id': new_preset.id, 'name': new_preset.name}), 201

# --- PUT and DELETE for presets would go here ---


@app.route('/api/qctools/tests', methods=['GET'])
def list_qctools_tests():
    return jsonify({
        'qctools': AVAILABLE_QCTOOLS_TESTS,
        'ffmpeg': FFMPEG_DETECTORS,
    })


@app.route('/api/presets/<int:preset_id>', methods=['PUT'])
def update_preset(preset_id):
    data = request.get_json() or {}
    preset = Preset.query.get(preset_id)
    if not preset:
        return jsonify({'error': 'Preset not found'}), 404

    name = data.get('name', preset.name)
    parameters = data.get('parameters', preset.parameters)
    mark_default = bool(data.get('is_default', False))

    if not name:
        return jsonify({'error': 'Preset name is required'}), 400

    existing_with_name = Preset.query.filter(Preset.name == name, Preset.id != preset_id).first()
    if existing_with_name:
        return jsonify({'error': f'Preset with name "{name}" already exists.'}), 409

    preset.name = name
    preset.parameters = normalize_qctools_preset(parameters)
    if mark_default:
        Preset.query.update({Preset.is_default: False})
        preset.is_default = True
    elif data.get('is_default') is False and preset.is_default:
        preset.is_default = False
    db.session.commit()
    return jsonify({'id': preset.id, 'name': preset.name, 'is_default': preset.is_default}), 200


# --- Unified System Configuration API ---

@app.route('/api/system/config', methods=['GET'])
def get_system_configuration():
    """Get all system configuration settings in one unified response"""
    try:
        # SSL/Domain configuration
        domain_settings = get_domain_settings()
        hostname = domain_settings.get('hostname', '')
        ssl_config = {
            'hostname': hostname,
            'email': domain_settings.get('lets_encrypt_email', ''),
            'certificate_status': get_certificate_status(hostname) if hostname else None
        }

        # Telegram configuration
        telegram_config = _compose_telegram_settings()

        # System information
        system_info = {
            'version': '1.0.0',  # You can make this dynamic
            'environment': os.environ.get('FLASK_ENV', 'production'),
        }

        return jsonify({
            'ssl': ssl_config,
            'telegram': telegram_config,
            'system': system_info
        })
    except Exception as e:
        return jsonify({'error': f'Failed to load configuration: {str(e)}'}), 500


@app.route('/api/system/config/ssl', methods=['PUT'])
def update_ssl_configuration():
    """Update SSL/Domain configuration and apply changes"""
    data = request.get_json() or {}
    hostname = data.get('hostname', '').strip()
    email = data.get('email', '').strip()

    # Validate hostname
    if hostname and not _is_valid_hostname(hostname):
        return jsonify({'error': 'Invalid hostname format'}), 400

    # Validate email
    if hostname and not email:
        return jsonify({'error': 'Email is required for SSL certificate generation'}), 400

    if email and '@' not in email:
        return jsonify({'error': 'Invalid email format'}), 400

    try:
        # Save to database
        _set_system_config_value('domain.hostname', hostname)
        _set_system_config_value('domain.lets_encrypt_email', email)

        # Apply configuration immediately
        if hostname:
            apply_reverse_proxy_configuration(hostname, email)
            certificate_status = get_certificate_status(hostname)
        else:
            # Disable SSL by applying HTTP-only configuration
            apply_reverse_proxy_configuration('', '')
            certificate_status = None

        return jsonify({
            'success': True,
            'hostname': hostname,
            'email': email,
            'certificate_status': certificate_status,
            'message': 'SSL configuration updated successfully' if hostname else 'SSL disabled successfully'
        })
    except Exception as e:
        return jsonify({'error': f'Failed to apply SSL configuration: {str(e)}'}), 500


@app.route('/api/system/config/ssl/status', methods=['GET'])
def get_ssl_status():
    """Get current SSL certificate status"""
    domain_settings = get_domain_settings()
    hostname = domain_settings.get('hostname', '')

    if not hostname:
        return jsonify({'enabled': False, 'certificate_status': None})

    try:
        certificate_status = get_certificate_status(hostname)
        return jsonify({
            'enabled': True,
            'hostname': hostname,
            'email': domain_settings.get('lets_encrypt_email', ''),
            'certificate_status': certificate_status
        })
    except Exception as e:
        return jsonify({'error': f'Failed to get SSL status: {str(e)}'}), 500


@app.route('/api/system/config/ssl/renew', methods=['POST'])
def renew_ssl_certificate():
    """Force SSL certificate renewal"""
    domain_settings = get_domain_settings()
    hostname = domain_settings.get('hostname', '')
    email = domain_settings.get('lets_encrypt_email', '')

    if not hostname or not email:
        return jsonify({'error': 'SSL not configured'}), 400

    try:
        # Force renewal by reapplying configuration
        apply_reverse_proxy_configuration(hostname, email)

        # Give it a moment to process, then check status
        import time
        time.sleep(2)

        certificate_status = get_certificate_status(hostname)
        return jsonify({
            'success': True,
            'certificate_status': certificate_status,
            'message': 'SSL certificate renewal initiated'
        })
    except Exception as e:
        return jsonify({'error': f'Failed to renew certificate: {str(e)}'}), 500
