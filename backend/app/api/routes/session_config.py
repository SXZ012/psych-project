"""场景配置接口：终端启动时获取自己的场景配置。

设备在管理后台注册时绑定场景(aviation/community)，之后每次启动
自动从此接口获取配置，无需人工干预。设备需携带令牌鉴权。
"""
import hashlib
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.models.community import Device

logger = logging.getLogger("app.routes.session_config")
router = APIRouter(prefix="/api/v1/session", tags=["session-config"])

# 各场景的默认阶段序列与参数
SCENE_PRESETS: dict[str, dict] = {
    "aviation": {
        "scene": "aviation",
        "need_payment": False,
        "need_video": True,
        "need_face_check": True,
        "question_count": 6,
        "question_duration": 10,
        "report_type": "admin",
        "phases": ["login", "consent", "detect", "intro", "assess", "complete"],
    },
    "community": {
        "scene": "community",
        "need_payment": True,
        "need_video": True,
        "need_face_check": True,
        # 社区正式题池：30 条独立题干，自定节奏完成 60 秒连续采集。
        "question_count": 30,
        "question_duration": 10,
        "report_type": "customer_pdf",
        "phases": [
            "payment",
            "consent",
            "self_report",
            "detect",
            "assess",
            "breathing",
            "analyzing",
            "complete",
        ],
    },
}


class SceneConfigResponse(BaseModel):
    scene: str
    device_name: str | None = None
    device_location: str | None = None
    need_payment: bool
    need_video: bool
    need_face_check: bool
    question_count: int
    question_duration: int
    report_type: str
    phases: list[str]


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


DB = Depends(get_db)


@router.get("/config", response_model=SceneConfigResponse)
async def get_session_config(
    device_id: str,
    x_device_token: str = Header(default=""),
    db: AsyncSession = DB,
) -> SceneConfigResponse:
    """终端启动时调用：根据 device_id + device_token 返回该设备的场景配置。"""
    device = (
        await db.execute(select(Device).where(Device.device_id == device_id))
    ).scalar_one_or_none()

    if device is None:
        raise HTTPException(status_code=404, detail="设备未注册，请联系管理员")

    if not device.is_active:
        raise HTTPException(status_code=403, detail="设备已停用，请联系管理员")

    # 令牌校验：注册时生成 token，终端存本地，每次请求带上
    if device.token_hash:
        if not x_device_token:
            raise HTTPException(status_code=401, detail="缺少设备令牌(X-Device-Token)")
        if _hash_token(x_device_token) != device.token_hash:
            raise HTTPException(status_code=401, detail="设备令牌无效")

    preset = SCENE_PRESETS.get(device.scene)
    if preset is None:
        raise HTTPException(status_code=500, detail=f"未知场景类型: {device.scene}")

    return SceneConfigResponse(
        scene=preset["scene"],
        device_name=device.name,
        device_location=device.location,
        need_payment=preset["need_payment"],
        need_video=preset["need_video"],
        need_face_check=preset["need_face_check"],
        question_count=preset["question_count"],
        question_duration=preset["question_duration"],
        report_type=preset["report_type"],
        phases=preset["phases"],
    )
