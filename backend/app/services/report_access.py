"""报告查询凭证与限频。

设计要点：
- 查询码为高熵随机（Crockford Base32，去掉易混淆字符，10 字符 ≈ 50 bit 熵），
  服务端只保存 SHA-256(pepper + 规范化码)；泄漏数据库也无法直接反查明文。
- 明文只在创建/重置时返回一次，不写日志、不回传历史。
- 规范化容忍抄录差异（空格/连字符/小写/0↔O、1↔I），不影响熵。
- 按来源跨编号限频；开发用内存滑窗，生产用 Redis 原子计数与到期清理。
"""

from __future__ import annotations

import hashlib
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

# Crockford Base32（无 I/L/O/U，避免抄录混淆）
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_CODE_LENGTH = 10  # 50 bit 熵


def generate_access_code() -> str:
    """生成查询码明文（形如 XXXXX-XXXXX）。仅创建/重置时调用，调用方负责一次性下发。"""
    raw = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))
    return f"{raw[:5]}-{raw[5:]}"


def normalize_access_code(code: str) -> str:
    """抄录容错：去空白与连字符、大写、混淆字符归一（不影响熵，仅限同类映射）。"""
    cleaned = code.upper().replace(" ", "").replace("-", "").replace("—", "")
    return cleaned.translate(str.maketrans({"O": "0", "I": "1", "L": "1", "U": "V"}))


def hash_access_code(code: str) -> str:
    normalized = normalize_access_code(code)
    return hashlib.sha256((settings.REPORT_TOKEN_PEPPER + normalized).encode("utf-8")).hexdigest()


# ── 进程内滑窗限频 ──────────────────────────────────────────────

_buckets: dict[str, deque[float]] = defaultdict(deque)


class RateLimited(Exception):
    """超出查询尝试频次。"""


async def check_lookup_rate_limit(subject_id: str, client_ip: str) -> None:
    """检查失败尝试是否超限；成功查询和正常轮询不消耗额度。"""
    # One source budget across IDs; switching numbers must not reset the limit.
    key = f"lookup|{client_ip}"
    if settings.ENV == "prod":
        try:
            async with Redis.from_url(
                settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2
            ) as redis:
                value = await redis.get("report:" + key)
                if int(value or 0) >= settings.REPORT_LOOKUP_MAX_ATTEMPTS:
                    raise RateLimited()
        except RedisError as exc:
            raise HTTPException(503, "查询服务暂不可用，请稍后重试") from exc
        return
    now = time.monotonic()
    window = settings.REPORT_LOOKUP_WINDOW_SECONDS
    bucket = _buckets[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= settings.REPORT_LOOKUP_MAX_ATTEMPTS:
        raise RateLimited()
    # 防内存膨胀：桶数超上限时清理过期
    if len(_buckets) > 10_000:
        stale = [k for k, v in _buckets.items() if not v or now - v[0] > window]
        for k in stale:
            _buckets.pop(k, None)


async def record_lookup_failure(subject_id: str, client_ip: str) -> None:
    """仅在凭证校验失败时记一次失败。"""
    key = f"lookup|{client_ip}"
    if settings.ENV == "prod":
        try:
            async with Redis.from_url(
                settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2
            ) as redis:
                await redis.eval(
                    "local n=redis.call('INCR',KEYS[1]); "
                    "if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
                    1,
                    "report:" + key,
                    settings.REPORT_LOOKUP_WINDOW_SECONDS,
                )
        except RedisError as exc:
            raise HTTPException(503, "查询服务暂不可用，请稍后重试") from exc
        return
    _buckets[key].append(time.monotonic())


def clear_lookup_failures(subject_id: str, client_ip: str) -> None:
    """Success does not erase the source-wide failure budget."""
