"""微信公众号模板消息推送。

报告生成后通知用户。用户关注公众号即可收到推送，无需每次授权(与小程序订阅消息的区别)。
开发阶段(Mock): 未配置 AppID 时仅打日志，不调微信 API。
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# 微信 API 基础地址
WECHAT_API_BASE = "https://api.weixin.qq.com"

# access_token 缓存(生产建议存 Redis)
_access_token_cache: dict = {"token": None, "expires_at": 0}


async def _get_access_token() -> str | None:
    """获取公众号 access_token(全局凭证，2小时有效)。"""
    import time

    # 缓存有效
    if (
        _access_token_cache["token"]
        and _access_token_cache["expires_at"] > time.time()
    ):
        return _access_token_cache["token"]

    if not settings.WECHAT_APP_ID or not settings.WECHAT_APP_SECRET:
        logger.debug("Mock 模式: 未配置 AppID/Secret，跳过 access_token 获取")
        return None

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{WECHAT_API_BASE}/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
            },
        )
        data = resp.json()

    if "access_token" not in data:
        logger.error("获取 access_token 失败: %s", data)
        return None

    _access_token_cache["token"] = data["access_token"]
    _access_token_cache["expires_at"] = time.time() + int(data.get("expires_in", 7200))
    return data["access_token"]


async def send_report_ready(openid: str, report_url: str) -> bool:
    """推送"报告已生成"模板消息。

    Args:
        openid: 用户 OpenID
        report_url: 报告页面路径(如 /community/report/xxx)，跳转到 H5 页面

    Returns:
        是否成功(Mock 模式返回 True)
    """
    if not settings.WECHAT_APP_ID:
        # Mock 模式：仅打日志
        logger.info("[Mock推送] openid=%s report_url=%s", openid, report_url)
        return True

    access_token = await _get_access_token()
    if not access_token:
        return False

    template_id = settings.WECHAT_TEMPLATE_ID
    if not template_id:
        logger.warning("未配置模板 ID(WECHAT_TEMPLATE_ID)，跳过推送")
        return False

    payload = {
        "touser": openid,
        "template_id": template_id,
        "url": report_url,
        "data": {
            "thing1": {"value": "心理测评报告"},
            "phrase2": {"value": "已生成"},
            "time3": {"value": "刚刚"},
        },
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{WECHAT_API_BASE}/cgi-bin/message/template/send",
            params={"access_token": access_token},
            json=payload,
        )
        data = resp.json()

    if data.get("errcode") == 0:
        logger.info("模板消息推送成功 | openid=%s", openid)
        return True
    else:
        logger.error("模板消息推送失败 | openid=%s error=%s", openid, data)
        return False
