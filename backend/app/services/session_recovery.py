"""A recovery credential is separate from the publicly displayed report number."""

import hashlib
import hmac

from app.core.config import settings


def recovery_code(session_id) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode(), f"recover:{session_id}".encode(), hashlib.sha256
    ).digest()
    return str(int.from_bytes(digest[:8], "big") % 10**12).zfill(12)
