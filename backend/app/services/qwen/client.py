"""Qwen（阿里云百炼 DashScope）OpenAI 兼容异步客户端。

密钥从 settings.DASHSCOPE_API_KEY 读取（.env 注入），**绝不硬编码**。
端点：{QWEN_BASE_URL}/chat/completions，鉴权 Authorization: Bearer <key>。
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class QwenClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.api_key = api_key or settings.DASHSCOPE_API_KEY
        self.base_url = (base_url or settings.QWEN_BASE_URL).rstrip("/")
        self.model = model or settings.QWEN_MODEL
        self.timeout = timeout

    async def chat_complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """调用 chat/completions，返回 assistant 文本内容。"""
        if not self.api_key:
            raise RuntimeError("DASHSCOPE_API_KEY 未配置（请检查 .env）")

        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
        usage = data.get("usage") or {}
        logger.info(
            "qwen chat | model=%s tokens=%s %.0fms",
            payload["model"],
            usage.get("total_tokens"),
            (time.perf_counter() - start) * 1000,
        )
        return data["choices"][0]["message"]["content"]
