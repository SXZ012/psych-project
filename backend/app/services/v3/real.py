"""合作方 V3 算法服务真实客户端。

实现《V3 算法服务对接指南》的完整链路：
文件登记 -> 对象存储直传 -> 创建任务 -> 轮询 -> 解析结果。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx

from app.services.v3.provider import V3Provider

TERMINAL_STATUSES = {0, 2, 4, 5}
STATUS_LABELS = {0: "处理完成", 1: "处理中", 2: "处理异常", 3: "排队中", 4: "停止中", 5: "已停止"}


class V3IntegrationError(RuntimeError):
    """可安全写入业务日志和后台页面的 V3 联调异常。"""


class V3ConfigurationError(V3IntegrationError):
    """V3 配置缺失或无效。"""


class V3TaskError(V3IntegrationError):
    """合作方算法任务以失败状态结束。"""


def _file_md5(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.md5()  # noqa: S324 - 合作方协议明确使用 MD5 做文件去重
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


async def _file_chunks(path: Path, chunk_size: int = 1024 * 1024) -> AsyncIterator[bytes]:
    """异步分块读取视频，避免把整个视频一次性加载到内存。"""
    stream = path.open("rb")
    try:
        while True:
            chunk = await asyncio.to_thread(stream.read, chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        stream.close()


class RealV3Client(V3Provider):
    def __init__(
        self,
        api_root: str,
        token: str,
        alg_service_uuid: str,
        bucket_id: int = 1,
        poll_interval: int = 5,
        poll_timeout: int = 600,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_root.strip():
            raise V3ConfigurationError("V3_API_ROOT 未配置")
        if not token.strip():
            raise V3ConfigurationError("V3_BASIC_TOKEN 未配置")
        if not alg_service_uuid.strip():
            raise V3ConfigurationError("V3_ALG_SERVICE_UUID 未配置，请向合作方索取算法服务 UUID")
        if poll_interval <= 0 or poll_timeout <= 0:
            raise V3ConfigurationError("V3 轮询间隔和超时时间必须大于 0")

        self.api_root = api_root.rstrip("/")
        self.alg_service_uuid = alg_service_uuid.strip()
        self.bucket_id = bucket_id
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout
        self._transport = transport
        self._headers = {
            "Content-Type": "application/json",
            "Authorization": f"Token {token.strip()}",
        }

    def _client(self, *, upload: bool = False) -> httpx.AsyncClient:
        read_timeout = 300.0 if upload else 30.0
        return httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=read_timeout, write=read_timeout, pool=10.0),
            transport=self._transport,
            follow_redirects=True,
        )

    @staticmethod
    def _raise_api_error(response: httpx.Response, stage: str) -> None:
        if response.is_success:
            return
        detail = ""
        try:
            body = response.json()
            if isinstance(body, dict):
                detail = str(body.get("detail") or body.get("message") or body.get("error") or "")
        except (ValueError, TypeError):
            pass
        suffix = f"：{detail[:200]}" if detail else ""
        raise V3IntegrationError(f"{stage}失败（HTTP {response.status_code}）{suffix}")

    async def upload_video(
        self,
        video_path: Path | None = None,
        filename: str = "video.mp4",
        content_type: str = "video/mp4",
    ) -> tuple[str, int]:
        if video_path is None:
            raise V3IntegrationError("真实 V3 模式必须提供视频文件")
        video_path = Path(video_path)
        if not video_path.is_file():
            raise V3IntegrationError(f"待上传视频不存在：{video_path.name}")
        file_size = video_path.stat().st_size
        if file_size <= 0:
            raise V3IntegrationError("待上传视频为空文件")

        content_type = mimetypes.guess_type(video_path.name)[0] or content_type
        md5 = await asyncio.to_thread(_file_md5, video_path)

        async with self._client() as client:
            response = await client.post(
                f"{self.api_root}/api/file-manager/put-presignurl",
                headers=self._headers,
                json={
                    "filter_key": video_path.name or filename,
                    "file_md5": md5,
                    "file_size": file_size,
                    "content_type": content_type,
                    "bucket": self.bucket_id,
                },
            )
            self._raise_api_error(response, "创建合作方文件记录")
            payload = response.json()
            file_id = payload.get("id")
            if file_id is None:
                raise V3IntegrationError("合作方文件登记响应缺少 file_id")
            put_url = payload.get("presigned_put_url")

        if put_url:
            async with self._client(upload=True) as client:
                response = await client.put(
                    put_url,
                    content=_file_chunks(video_path),
                    headers={"Content-Type": content_type},
                )
                self._raise_api_error(response, "上传视频到合作方 OSS")

        async with self._client() as client:
            response = await client.get(
                f"{self.api_root}/api/file-manager/oss-file/{file_id}",
                headers=self._headers,
            )
            self._raise_api_error(response, "获取合作方视频地址")
            detail = response.json()
            file_url = detail.get("presigned_get_url") or detail.get("url")
            if not file_url:
                raise V3IntegrationError("合作方文件响应缺少可用的视频地址")
            return str(file_url), int(file_id)

    async def create_task(
        self,
        file_url: str,
        file_id: int | None = None,
        sds_score: float | None = None,
        sas_score: float | None = None,
    ) -> dict[str, Any]:
        if not file_url:
            raise V3IntegrationError("创建 V3 任务时缺少 file_url")
        for name, score in (("SDS", sds_score), ("SAS", sas_score)):
            if score is not None and not 0 <= score <= 100:
                raise V3IntegrationError(f"{name} 分数必须在 0-100 之间")

        input_params: dict[str, Any] = {"file_url": file_url}
        if file_id is not None:
            input_params["file_id"] = file_id
        if sds_score is not None:
            input_params["sds_score"] = sds_score
        if sas_score is not None:
            input_params["sas_score"] = sas_score

        async with self._client() as client:
            response = await client.post(
                f"{self.api_root}/api/alg-manager/start-task",
                headers=self._headers,
                json={
                    "alg_service_uuid": self.alg_service_uuid,
                    "input_params": json.dumps(input_params, ensure_ascii=False),
                    "input_type": 1,
                    "is_async": False,
                },
            )
            self._raise_api_error(response, "创建 V3 算法任务")
            task = response.json()
            if task.get("id") is None:
                raise V3IntegrationError("合作方任务响应缺少 task_id")
            return task

    async def wait_task(self, task_id: Any) -> dict[str, Any]:
        waited = 0
        auth = {"Authorization": self._headers["Authorization"]}
        async with self._client() as client:
            while waited < self.poll_timeout:
                response = await client.get(
                    f"{self.api_root}/api/alg-manager/task-record/{task_id}",
                    headers=auth,
                )
                self._raise_api_error(response, "查询 V3 任务")
                task = response.json()
                try:
                    status = int(task.get("status"))
                except (TypeError, ValueError) as exc:
                    raise V3IntegrationError("合作方任务响应缺少有效 status") from exc
                if status in TERMINAL_STATUSES:
                    if status != 0:
                        label = STATUS_LABELS.get(status, "未知状态")
                        raise V3TaskError(f"V3 算法任务未成功完成：{label}（status={status}）")
                    return task
                await asyncio.sleep(self.poll_interval)
                waited += self.poll_interval
        raise TimeoutError(f"V3 任务 {task_id} 超过 {self.poll_timeout} 秒仍未完成")

    async def get_result(self, task_record: dict[str, Any]) -> dict[str, Any]:
        result = task_record.get("result")
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError as exc:
                raise V3IntegrationError("V3 任务 result 不是有效 JSON") from exc
        if not isinstance(result, dict) or not result.get("summary"):
            raise V3IntegrationError("V3 任务已完成，但结果中缺少 summary")
        return result

    async def download_timeline(self, timeline_url: str) -> dict[str, Any]:
        """在约 1 小时有效期内下载 timeline，供联调落盘或后续转存。"""
        if not timeline_url:
            raise V3IntegrationError("V3 结果中没有 timeline 地址")
        async with self._client(upload=True) as client:
            response = await client.get(timeline_url)
            self._raise_api_error(response, "下载 V3 timeline")
            timeline = response.json()
            if not isinstance(timeline, dict):
                raise V3IntegrationError("V3 timeline 不是 JSON 对象")
            return timeline
