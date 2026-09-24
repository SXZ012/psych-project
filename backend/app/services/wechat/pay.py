"""微信公众号支付(JSAPI v3)。

统一下单 → 返回 JSBridge 支付参数 → 微信回调 → 验签解密 → 更新订单。
开发阶段(Mock): 未配置商户号时返回假参数，跳过验签。
"""
from __future__ import annotations

import json
import logging
import secrets
import time
from uuid import UUID

from app.core.config import settings

logger = logging.getLogger(__name__)

WECHAT_PAY_BASE = "https://api.mch.weixin.qq.com"

# 回调通知地址(商户号下来后填入 .env)
# WECHAT_PAY_NOTIFY_URL=https://api.xxx.com/api/v1/payments/wechat/notify


def _is_mock() -> bool:
    """是否为 Mock 模式(未配置商户号)。"""
    return not settings.WECHAT_MCH_ID


def build_mock_pay_params(order_id: UUID) -> dict:
    """生成 Mock 支付参数。"""
    return {
        "timeStamp": str(int(time.time())),
        "nonceStr": secrets.token_hex(16),
        "package": f"prepay_id=mock_{order_id.hex}",
        "signType": "RSA",
        "paySign": "mock_sign_for_dev",
    }


async def create_jsapi_order(
    order_id: UUID,
    openid: str,
    amount_fen: int,
    description: str = "心理测评服务",
) -> dict:
    """微信统一下单(JSAPI)，返回前端 JSBridge 调起支付所需参数。

    Args:
        order_id: 内部订单 ID(作为 out_trade_no)
        openid: 用户 OpenID
        amount_fen: 金额(分)，如 400 = ¥4.00
        description: 商品描述

    Returns:
        {"timeStamp", "nonceStr", "package", "signType", "paySign"}
    """
    if _is_mock():
        logger.info(
            "[Mock支付] 下单 | order=%s openid=%s amount=%dfen",
            order_id, openid, amount_fen,
        )
        return build_mock_pay_params(order_id)

    # TODO: 真实模式(商户号下来后实现)
    # 1. 构造请求体
    # 2. 加载商户私钥签名
    # 3. 调 POST /v3/pay/transactions/jsapi
    # 4. 解析返回的 prepay_id
    # 5. 用 prepay_id 生成前端签名
    raise NotImplementedError("微信支付真实模式待商户号下来后实现")


async def verify_and_decrypt_callback(
    body: bytes,
    signature: str,
    timestamp: str,
    nonce: str,
    serial: str,
) -> dict | None:
    """验签 + 解密微信支付回调。

    Returns:
        解密后的订单数据 dict;验证失败返回 None
    """
    if _is_mock():
        # Mock: 直接解析 JSON
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return None

    # TODO: 真实模式
    # 1. 加载微信平台证书(验签用)
    # 2. 验证 Wechatpay-Signature
    # 3. 用 APIv3 密钥 AES-256-GCM 解密 resource.ciphertext
    # 4. 返回解密后的订单数据
    raise NotImplementedError("微信支付回调验签待商户号下来后实现")


async def query_order(out_trade_no: str) -> dict | None:
    """主动查单(回调丢失时兜底)。"""
    if _is_mock():
        return {"trade_state": "NOTPAY"}

    # TODO: 真实模式
    # GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid={mchid}
    raise NotImplementedError("微信查单待商户号下来后实现")


async def refund(order_id: UUID, refund_no: str, total_fen: int) -> dict | None:
    """退款。"""
    if _is_mock():
        logger.info("[Mock退款] order=%s refund_no=%s", order_id, refund_no)
        return {"refund_id": f"mock_refund_{refund_no}", "status": "SUCCESS"}

    # TODO: 真实模式
    # POST /v3/refund/domestic/refunds
    raise NotImplementedError("微信退款待商户号下来后实现")
