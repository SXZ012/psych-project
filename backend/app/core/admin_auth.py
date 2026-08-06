"""Minimal cookie session for the demo admin area.

The production deployment should replace this with the company's SSO/RBAC,
but report APIs must still be protected server-side in the demo.
"""
import secrets
import time

from fastapi import Cookie, HTTPException, status

_SESSION_TTL_SECONDS = 8 * 60 * 60
_sessions: dict[str, float] = {}


def create_admin_session() -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = time.time() + _SESSION_TTL_SECONDS
    return token


def require_admin_session(admin_session: str | None = Cookie(default=None)) -> str:
    now = time.time()
    if admin_session is None or _sessions.get(admin_session, 0) <= now:
        if admin_session:
            _sessions.pop(admin_session, None)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要管理员登录")
    return admin_session
