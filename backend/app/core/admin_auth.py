"""管理端 cookie 会话 + 角色体系。

角色（服务端鉴权，前端只隐藏按钮不算数）：
- terminal_user：终端普通用户——无管理会话，仅凭报告查询码访问本人报告；
- reviewer：复核员——查看/复核授权范围内的报告（现有复核接口）；
- administrator：管理员——设备、任务重试、凭证重置等全部管理能力。

生产部署应替换为公司 SSO/RBAC；当前以口令区分角色，会话仅存内存
（重启即失效，属可接受的安全衰减）。
"""
import secrets
import time
from dataclasses import dataclass

from fastapi import Cookie, HTTPException, status

_SESSION_TTL_SECONDS = 8 * 60 * 60

ROLES = ("terminal_user", "reviewer", "administrator")


@dataclass
class AdminSession:
    token: str
    role: str
    expires_at: float


_sessions: dict[str, AdminSession] = {}


def create_admin_session(role: str = "administrator") -> str:
    if role not in ROLES:
        raise ValueError(f"unknown role: {role}")
    token = secrets.token_urlsafe(32)
    _sessions[token] = AdminSession(
        token=token, role=role, expires_at=time.time() + _SESSION_TTL_SECONDS
    )
    return token


def _lookup(token: str | None) -> AdminSession | None:
    if token is None:
        return None
    session = _sessions.get(token)
    if session is None or session.expires_at <= time.time():
        _sessions.pop(token, None)
        return None
    return session


def get_session_role(admin_session: str | None = Cookie(default=None)) -> str | None:
    session = _lookup(admin_session)
    return session.role if session else None


def require_admin_session(admin_session: str | None = Cookie(default=None)) -> str:
    """任意已认证管理会话（reviewer/administrator）。"""
    session = _lookup(admin_session)
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要管理员登录")
    return session.token


def require_role(*allowed: str):
    """限定角色的依赖工厂：require_role('administrator') 等。"""
    allowed_set = set(allowed)

    def _dependency(admin_session: str | None = Cookie(default=None)) -> str:
        session = _lookup(admin_session)
        if session is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要工作人员认证")
        if session.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="当前角色无权执行此操作",
            )
        return session.token

    return _dependency


def drop_session(admin_session: str | None) -> None:
    """退出登录：清除管理会话（终端隐私清理要求）。"""
    if admin_session:
        _sessions.pop(admin_session, None)
