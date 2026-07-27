"""RealV3Client：合作方 V3 算法服务的真实异步客户端（路线 A）。

依据《V3 算法服务对接指南》。仅当 PROVIDER_MODE=real 且配置了
V3_BASIC_TOKEN / V3_ALG_SERVICE_UUID 时启用。
鉴权头：Authorization: Token <token>（注意不是 Bearer）。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
from pathlib import Path
from typing import Any

import httpx

from app.services.v3.provider import V3Provider

# 任务状态：0完成 2异常 4停止中 5已停止
TERMINAL_STATUSES = {0, 2, 4, 5}


class RealV3Client(V3Provider):
    def __init__(
        self,
        api_root: str,
        token: str,
        alg_service_uuid: str,
        bucket_id: int = 1,
        poll_interval: int = 5,
        poll_timeout: int = 600,
    ) -> None:
        self.api_root = api_root.rstrip("/")
        self.alg_service_uuid = alg_service_uuid
        self.bucket_id = bucket_id
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout
        self._headers = {
            "Content-Type": "application/json",
            "Authorization": f"Token {token}",
        }

    async def upload_video(
        self,
        video_path: Path | None = None,
        filename: str = "video.mp4",
        content_type: str = "video/mp4",
    ) -> tuple[str, int]:
        assert video_path is not None, "real 模式必须提供 video_path"
        video_path = Path(video_path)
        content_type = mimetypes.guess_type(video_path.name)[0] or content_type
        data = video_path.read_bytes()
        md5 = hashlib.md5(data).hexdigest()

        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=300.0)) as client:
            # ① 创建 OSS 文件记录
            r = await client.post(
                f"{self.api_root}/api/file-manager/put-presignurl",
                headers=self._headers,
                json={
                    "filter_key": video_path.name,
                    "file_md5": md5,
                    "file_size": len(data),
                    "content_type": content_type,
                    "bucket": self.bucket_id,
                },
            )
            r.raise_for_status()
            d = r.json()
            file_id = d["id"]
            put_url = d.get("presigned_put_url")

            # ② 直传（presigned_put_url 为空 = 命中秒传）
            if put_url:
                pr = await client.put(
                    put_url,
                    content=data,
                    headers={"Content-Type": content_type},
                )
                pr.raise_for_status()

            # ③ 换取下载 URL
            r = await client.get(
                f"{self.api_root}/api/file-manager/oss-file/{file_id}",
                headers=self._headers,
            )
            r.raise_for_status()
            detail = r.json()
            file_url = detail.get("presigned_get_url") or detail.get("url", "")
            return file_url, file_id

    async def create_task(
        self,
        file_url: str,
        file_id: int | None = None,
        sds_score: float | None = None,
        sas_score: float | None = None,
    ) -> dict[str, Any]:
        input_params: dict[str, Any] = {"file_url": file_url}
        if file_id is not None:
            input_params["file_id"] = file_id
        if sds_score is not None:
            input_params["sds_score"] = sds_score
        if sas_score is not None:
            input_params["sas_score"] = sas_score

        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=30.0)) as client:
            r = await client.post(
                f"{self.api_root}/api/alg-manager/start-task",
                headers=self._headers,
                json={
                    "alg_service_uuid": self.alg_service_uuid,
                    # 注意：input_params 是 JSON 字符串，不是对象
                    "input_params": json.dumps(input_params, ensure_ascii=False),
                    "input_type": 1,
                    "is_async": False,
                },
            )
            r.raise_for_status()
            return r.json()

    async def wait_task(self, task_id: Any) -> dict[str, Any]:
        waited = 0
        auth = {"Authorization": self._headers["Authorization"]}
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=30.0)) as client:
            while waited < self.poll_timeout:
                r = await client.get(
                    f"{self.api_root}/api/alg-manager/task-record/{task_id}",
                    headers=auth,
                )
                r.raise_for_status()
                task = r.json()
                if task.get("status") in TERMINAL_STATUSES:
                    return task
                await asyncio.sleep(self.poll_interval)
                waited += self.poll_interval
        raise TimeoutError(f"V3 任务 {task_id} 超过 {self.poll_timeout}s 未完成")

    async def get_result(self, task_record: dict[str, Any]) -> dict[str, Any]:
        result = task_record.get("result")
        if isinstance(result, str):
            result = json.loads(result)
        return result or {}
