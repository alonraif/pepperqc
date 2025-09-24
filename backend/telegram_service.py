import os
from typing import Optional

import requests


def _resolve_token(token: Optional[str] = None) -> Optional[str]:
    if token:
        return token
    return os.environ.get('TELEGRAM_BOT_TOKEN')


def _api_base() -> str:
    base = os.environ.get('TELEGRAM_API_BASE', 'https://api.telegram.org')
    return base.rstrip('/')


def _build_url(method: str, token: Optional[str] = None) -> Optional[str]:
    token = _resolve_token(token)
    if not token:
        return None
    return f"{_api_base()}/bot{token}/{method}"


def is_configured(token: Optional[str] = None) -> bool:
    return bool(_resolve_token(token))


def send_message(chat_id: str, text: str, parse_mode: Optional[str] = None, disable_notification: bool = False, token: Optional[str] = None) -> bool:
    url = _build_url('sendMessage', token)
    if not url:
        return False

    payload = {
        'chat_id': chat_id,
        'text': text,
        'disable_notification': disable_notification,
    }
    if parse_mode:
        payload['parse_mode'] = parse_mode

    try:
        response = requests.post(url, data=payload, timeout=10)
        if response.ok:
            data = response.json()
            return bool(data.get('ok'))
        print(f"Telegram send_message failed ({response.status_code}): {response.text}")
    except requests.RequestException as error:
        print(f"Telegram send_message error: {error}")
    return False


def send_document(chat_id: str, file_path: str, caption: Optional[str] = None, parse_mode: Optional[str] = None, disable_notification: bool = False, token: Optional[str] = None) -> bool:
    url = _build_url('sendDocument', token)
    if not url:
        return False

    payload = {
        'chat_id': chat_id,
        'disable_notification': disable_notification,
    }
    if caption:
        payload['caption'] = caption
    if parse_mode:
        payload['parse_mode'] = parse_mode

    try:
        with open(file_path, 'rb') as file_handle:
            files = {'document': file_handle}
            response = requests.post(url, data=payload, files=files, timeout=20)
        if response.ok:
            data = response.json()
            return bool(data.get('ok'))
        print(f"Telegram send_document failed ({response.status_code}): {response.text}")
    except FileNotFoundError:
        print(f"Telegram send_document error: file not found at {file_path}")
    except requests.RequestException as error:
        print(f"Telegram send_document error: {error}")
    return False
