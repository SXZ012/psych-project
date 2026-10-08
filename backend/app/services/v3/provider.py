"""V3 Provider 抽象层 + 工厂（按 PROVIDER_MODE 切换 mock / real）。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class V3Provider(ABC):
    """心理生理状态评估算法的统一接口（异步）。

    对应《V3 算法服务对接指南》6 步流程：上传 → 建任务 → 轮询 → 解析结果。
    """

    @abstractmethod
    async def upload_video(
        self,
        video_path: Path | None = None,
        filename: str = "video.mp4",
        content_type: str = "video/mp4",
    ) -> tuple[str, int]:
        """上传视频，返回 (file_url, file_id)。"""

    @abstractmethod
    async def create_task(
        self,
        file_url: str,
        file_id: int | None = None,
        sds_score: float | None = None,
        sas_score: float | None = None,
    ) -> dict[str, Any]:
        """创建算法任务，返回任务记录（含 id）。"""

    @abstractmethod
    async def wait_task(self, task_id: Any) -> dict[str, Any]:
        """轮询直到终态，返回最终任务记录。"""

    @abstractmethod
    async def get_result(self, task_record: dict[str, Any]) -> dict[str, Any]:
        """从任务记录解析 result wrapper。"""

    async def run(
        self,
        video_path: Path | None = None,
        sds_score: float | None = None,
        sas_score: float | None = None,
    ) -> dict[str, Any]:
        """完整流程：上传 → 建任务 → 轮询 → 解析结果。"""
        file_url, file_id = await self.upload_video(video_path)
        task = await self.create_task(file_url, file_id, sds_score, sas_score)
        final = await self.wait_task(task["id"])
        return await self.get_result(final)


def get_v3_provider() -> V3Provider:
    """按 settings.PROVIDER_MODE 返回 Mock 或 Real Provider。"""
    from app.core.config import settings

    if settings.PROVIDER_MODE.lower() == "real":
        from app.services.v3.real import RealV3Client

        return RealV3Client(
            api_root=settings.V3_API_ROOT,
            token=settings.V3_BASIC_TOKEN,
            alg_service_uuid=settings.V3_ALG_SERVICE_UUID,
            bucket_id=settings.V3_OSS_BUCKET_ID,
            poll_interval=settings.V3_POLL_INTERVAL,
            poll_timeout=settings.V3_POLL_TIMEOUT,
        )

    from app.services.v3.mock import MockV3Provider

    # 默认回放合作方最新 V3.2 样例；旧 V3 fixture 保留用于兼容回归。
    fixture = Path(__file__).parent / "fixtures" / "sample_result_v32.json"
    return MockV3Provider(fixture_path=fixture)
