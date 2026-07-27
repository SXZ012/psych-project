"""图片上传到 OSS（诱发图片库用）。"""
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.services.oss.client import OSSClient

router = APIRouter()

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB 上限


@router.post("/images")
async def upload_image(file: Annotated[UploadFile, File()]) -> dict:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="图片过大（>10MB）")

    key = OSSClient.gen_object_key("images", file.filename or "upload.png")
    # oss2 是同步 SDK，丢到线程池避免阻塞事件循环
    url = await run_in_threadpool(
        OSSClient().upload, data, key, file.content_type or "application/octet-stream"
    )
    return {"url": url, "key": key, "size": len(data), "content_type": file.content_type}
