"""阿里云 OSS 文件上传工具类（FastAPI 用）。

凭证从 settings 读取（.env 注入），**绝不硬编码**。
依赖: oss2  ->  pip install oss2

公共读 Bucket 的文件直链: https://{bucket}.{endpoint}/{object_key}
私有 Bucket 请用 presigned_url() 生成临时访问链接。
"""

from __future__ import annotations

import hashlib
import logging
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import IO

import httpx
import oss2

from app.core.config import settings

logger = logging.getLogger(__name__)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


class OSSClient:
    """阿里云 OSS 上传 / 下载 / 删除 / 签名工具。"""

    def __init__(
        self,
        access_key_id: str | None = None,
        access_key_secret: str | None = None,
        endpoint: str | None = None,
        bucket_name: str | None = None,
    ) -> None:
        self.access_key_id = access_key_id or settings.OSS_ACCESS_KEY_ID
        self.access_key_secret = access_key_secret or settings.OSS_ACCESS_KEY_SECRET
        self.endpoint = (endpoint or settings.OSS_ENDPOINT).rstrip("/")
        self.endpoint = self.endpoint.removeprefix("https://").removeprefix("http://")
        self.bucket_name = bucket_name or settings.OSS_BUCKET_NAME
        self._bucket: oss2.Bucket | None = None

    def _ensure(self) -> oss2.Bucket:
        """惰性构建 Bucket 句柄；缺凭证时抛错。"""
        if not self.access_key_id or not self.access_key_secret:
            raise RuntimeError(
                "OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET 未配置（请在 .env 中填写）"
            )
        if self._bucket is None:
            auth = oss2.Auth(self.access_key_id, self.access_key_secret)
            self._bucket = oss2.Bucket(auth, self.endpoint, self.bucket_name)
        return self._bucket

    @property
    def base_url(self) -> str:
        return f"https://{self.bucket_name}.{self.endpoint}"

    def public_url(self, object_key: str) -> str:
        """公共读 Bucket 的直链（私有 Bucket 请改用 presigned_url）。"""
        return f"{self.base_url}/{object_key.lstrip('/')}"

    @staticmethod
    def gen_object_key(prefix: str, filename: str) -> str:
        """生成 前缀/日期/UUID.ext 的唯一 key，防冲突、便归档。"""
        ext = Path(filename).suffix.lower()
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"{prefix.strip('/')}/{day}/{uuid.uuid4().hex}{ext}"

    # ---------- 写 ----------
    def upload(
        self,
        data: bytes,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """上传字节流，返回可访问 URL。"""
        bucket = self._ensure()
        bucket.put_object(object_key, data, headers={"Content-Type": content_type})
        logger.info("oss upload | key=%s size=%d type=%s", object_key, len(data), content_type)
        return self.public_url(object_key)

    def upload_stream(
        self,
        fileobj: IO[bytes],
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """上传文件流（适合 UploadFile / 大文件分块）。"""
        bucket = self._ensure()
        bucket.put_object(object_key, fileobj, headers={"Content-Type": content_type})
        logger.info("oss upload_stream | key=%s type=%s", object_key, content_type)
        return self.public_url(object_key)

    def upload_file(
        self,
        file_path: str | Path,
        object_key: str | None = None,
        content_type: str | None = None,
    ) -> str:
        """上传本地文件。"""
        file_path = Path(file_path)
        object_key = object_key or self.gen_object_key("files", file_path.name)
        content_type = content_type or (
            mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        )
        bucket = self._ensure()
        bucket.put_object_from_file(object_key, str(file_path))
        logger.info("oss upload_file | key=%s path=%s", object_key, file_path)
        return self.public_url(object_key)

    # ---------- 读 / 删 / 签名 ----------

    def upload_private_file(
        self, file_path: str | Path, object_key: str, content_type: str
    ) -> dict:
        """Publish an explicitly private object and verify bytes before returning its key."""
        file_path = Path(file_path)
        digest = file_sha256(file_path)
        size = file_path.stat().st_size
        bucket = self._ensure()
        bucket.put_object_from_file(
            object_key,
            str(file_path),
            headers={
                "Content-Type": content_type,
                "x-oss-object-acl": oss2.OBJECT_ACL_PRIVATE,
                "x-oss-meta-sha256": digest,
                "Cache-Control": "private, no-store",
            },
        )
        head = bucket.head_object(object_key)
        if head.content_length != size or head.headers.get("x-oss-meta-sha256") != digest:
            raise RuntimeError("OSS 文件元数据校验失败")
        if bucket.get_object_acl(object_key).acl != oss2.OBJECT_ACL_PRIVATE:
            raise RuntimeError("OSS 文件未设置为私有")
        anonymous = httpx.get(
            self.public_url(object_key), headers={"Range": "bytes=0-0"}, timeout=15
        )
        if anonymous.status_code != 403:
            if anonymous.status_code in {200, 206}:
                bucket.delete_object(object_key)
            raise RuntimeError("OSS 匿名访问未被拒绝，文件未发布")
        remote = bucket.get_object(object_key)
        try:
            remote_digest = hashlib.sha256()
            while chunk := remote.read(1024 * 1024):
                remote_digest.update(chunk)
        finally:
            remote.close()
        if remote_digest.hexdigest() != digest:
            raise RuntimeError("OSS 文件内容校验失败")
        return {"key": object_key, "size": size, "sha256": digest, "bucket": self.bucket_name}

    def presigned_url(
        self,
        object_key: str,
        expires: int = 3600,
        *,
        filename: str | None = None,
        download: bool = False,
    ) -> str:
        """生成临时下载链接（私有 Bucket 用），默认 1 小时。"""
        bucket = self._ensure()
        if filename:
            from urllib.parse import quote

            disposition = "attachment" if download else "inline"
            params = {
                "response-content-disposition": (
                    f"{disposition}; filename*=UTF-8''{quote(filename, safe='')}"
                )
            }
            return bucket.sign_url("GET", object_key, expires, params=params)
        return bucket.sign_url("GET", object_key, expires)

    def download_private_file(self, object_key: str, target: Path, sha256: str) -> Path:
        """Restore a verified processing source; never replace it with incomplete bytes."""
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".download.tmp")
        try:
            self._ensure().get_object_to_file(object_key, str(temporary))
            if file_sha256(temporary) != sha256:
                raise RuntimeError("OSS 视频恢复校验失败")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        return target

    def delete(self, object_key: str) -> None:
        bucket = self._ensure()
        bucket.delete_object(object_key)
        logger.info("oss delete | key=%s", object_key)
