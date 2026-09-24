"""文件存储 Provider：报告等产物的发布入口。

当前默认 LocalStorage（本地 data 目录即最终产物）；OSS 凭据齐全且开启备份时
自动切换 OssStorage。未来替换为真实 OSS/其他对象存储时只需提供新的
StorageProvider 实现并调整 get_storage()，业务调用方（PDF 生成等）不变。
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageProvider:
    """存储提供方接口。"""

    name = "base"

    async def publish(self, local_path: Path, key: str) -> str | None:
        """将本地文件发布为长期存储。

        返回存储 key（远端模式）或 None（本地模式，本地文件即最终产物）。
        """
        raise NotImplementedError


class LocalStorage(StorageProvider):
    """本地存储：文件已在本地目录，无需上传。"""

    name = "local"

    async def publish(self, local_path: Path, key: str) -> str | None:
        return None


class OssStorage(StorageProvider):
    """OSS 私有读存储（凭据齐全且开启备份时启用）。"""

    name = "oss"

    async def publish(self, local_path: Path, key: str) -> str | None:
        from app.services.oss.client import OSSClient

        await asyncio.to_thread(
            OSSClient().upload_file, local_path, key, "application/pdf"
        )
        return key


def get_storage() -> StorageProvider:
    if (
        settings.OSS_BACKUP_ENABLED
        and settings.OSS_ACCESS_KEY_ID
        and settings.OSS_ACCESS_KEY_SECRET
        and settings.OSS_BUCKET_NAME
    ):
        return OssStorage()
    return LocalStorage()
