"""微信公众号网页授权(OAuth2)。

用户在微信内打开 H5 页面时，静默授权获取 OpenID。
开发阶段(Mock): 未配置 AppID 时用 code 生成假 OpenID。
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

WECHAT_API_BASE = "https://api.weixin.qq.com"

# OAuth 授权 URL(前端重定向用)
OAUTH_AUTHORIZE_URL = "https://open.weixin.qq.com/connect/oauth2/authorize"


def build_oauth_url(redirect_uri: str, state: str = "") -> str:
    """构建微信 OAuth 授权跳转 URL(scope=snsapi_base 静默授权)。"""
    import urllib.parse

    appid = settings.WECHAT_APP_ID or "wxMOCK_APPID"
    return (
        f"{OAUTH_AUTHORIZE_URL}"
        f"?appid={appid}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri)}"
        f"&response_type=code"
        f"&scope=snsapi_base"
        f"&state={state}"
        f"#wechat_redirect"
    )


async def code_to_openid(code: str) -> dict:
    """用 OAuth code 换取用户 OpenID。

    Returns:
        {"openid": "...", "nickname": None}
        失败时 raise ValueError
    """
    if not settings.WECHAT_APP_ID or not settings.WECHAT_APP_SECRET:
        if settings.ENV == "prod":
            raise ValueError("正式身份验证尚未配置")
        # Mock 模式
        mock_openid = f"mock_{code[:16]}"
        logger.debug("[Mock OAuth] code=%s → openid=%s", code, mock_openid)
        return {"openid": mock_openid, "nickname": None}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{WECHAT_API_BASE}/sns/oauth2/access_token",
            params={
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        data = resp.json()

    if "openid" not in data:
        errcode = data.get("errcode")
        errmsg = data.get("errmsg", "未知错误")
        logger.error("OAuth 换取 OpenID 失败 | errcode=%s errmsg=%s", errcode, errmsg)
        raise ValueError(f"微信授权失败: {errmsg} (code={errcode})")

    return {"openid": data["openid"], "nickname": None}
