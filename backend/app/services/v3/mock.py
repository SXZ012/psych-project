"""MockV3Provider：回放真实样例结果，模拟异步轮询流程（路线 B）。

不依赖任何外部接口。返回的 result 结构与线上 V3 接口逐字段一致，
取自 fixtures/sample_result.json（由 ziliao/v3_report_sample.html 抽取）。
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from app.services.v3.provider import V3Provider

logger = logging.getLogger(__name__)


class MockV3Provider(V3Provider):
    def __init__(
        self,
        fixture_path: Path,
        poll_interval: float = 0.5,
        poll_steps: int = 2,
    ) -> None:
        self.fixture_path = Path(fixture_path)
        self.poll_interval = poll_interval
        self.poll_steps = poll_steps
        self._counter = 0

    def _load_fixture(self) -> dict[str, Any]:
        with open(self.fixture_path, encoding="utf-8") as f:
            return json.load(f)

    async def upload_video(
        self,
        video_path: Path | None = None,
        filename: str = "video.mp4",
        content_type: str = "video/mp4",
    ) -> tuple[str, int]:
        await asyncio.sleep(0.2)  # 模拟上传耗时
        self._counter += 1
        return f"https://mock.local/sample/{self._counter}.mp4", 9000 + self._counter

    async def create_task(
        self,
        file_url: str,
        file_id: int | None = None,
        sds_score: float | None = None,
        sas_score: float | None = None,
    ) -> dict[str, Any]:
        await asyncio.sleep(0.2)
        self._counter += 1
        return {
            "id": self._counter,
            "task_uuid": f"mock-task-{self._counter}",
            "status": 1,  # 正在处理
        }

    async def wait_task(self, task_id: Any) -> dict[str, Any]:
        # 模拟若干次轮询后完成（真实场景 60s 视频约 80-90s）
        for i in range(self.poll_steps):
            await asyncio.sleep(self.poll_interval)
            logger.info(
                "mock poll | task=%s round=%d/%d status=processing",
                task_id,
                i + 1,
                self.poll_steps,
            )
        logger.info("mock task completed | task=%s", task_id)
        return {"id": task_id, "status": 0, "result": self._load_fixture()}

    async def get_result(self, task_record: dict[str, Any]) -> dict[str, Any]:
        result = task_record.get("result")
        if isinstance(result, str):
            result = json.loads(result)
        return result or {}
