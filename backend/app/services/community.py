"""社区场景服务层：会话管理 + 订单流转 + JWT 签发。

职责边界：
- 创建/过期测评会话(AssessmentSession)
- 创建支付订单 + 状态流转(PaymentOrder)
- JWT 签发与解析(社区小程序用户鉴权)
- Mock 支付回调(联调阶段使用，商户号下来后切真实微信支付)

不涉及的：V3 分析(run_assessment 共用)、PDF 生成(services/pdf)、微信消息推送(services/wechat)。
"""

from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.community import AssessmentSession, Customer, PaymentOrder

logger = logging.getLogger(__name__)

# 订单/会话过期时间
SESSION_TTL_MINUTES = 30
ORDER_TTL_MINUTES = 30

# 社区测评价格(分)。Mock 与真实微信支付共用，避免路由/服务两处硬编码漂移
COMMUNITY_PRICE_FEN = 400  # ¥4.00


class SessionBindingError(Exception):
    """社区会话校验失败(提交测评时)。携带 HTTP 状态码与用户可读信息。"""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# JWT 配置
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 7 * 24  # 7 天


# ================== JWT ==================


def issue_jwt(customer_id: str, openid: str) -> str:
    """为社区用户签发 JWT,有效期 7 天。"""
    payload = {
        "sub": customer_id,
        "openid": openid,
        "scope": "community",
        "exp": int(time.time()) + JWT_EXPIRES_HOURS * 3600,
        "iat": int(time.time()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> dict | None:
    """验证 JWT 并返回 payload;无效或过期返回 None。"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("scope") != "community":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ================== 会话管理 ==================


async def create_session(
    db: AsyncSession, device_id: str, scene: str = "community"
) -> AssessmentSession:
    """终端请求创建测评会话(生成二维码前调用)。"""
    session = AssessmentSession(
        scene=scene,
        device_id=device_id,
        status="awaiting_payment",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    logger.info("创建测评会话 | session=%s device=%s scene=%s", session.id, device_id, scene)
    return session


async def get_session(db: AsyncSession, session_id: UUID) -> AssessmentSession | None:
    return (
        await db.execute(select(AssessmentSession).where(AssessmentSession.id == session_id))
    ).scalar_one_or_none()


async def expire_stale_sessions(db: AsyncSession) -> int:
    """批量过期超时会话(可由定时任务调用)。"""
    result = await db.execute(
        update(AssessmentSession)
        .where(
            AssessmentSession.status.in_(["created", "awaiting_payment"]),
            AssessmentSession.expires_at < datetime.now(timezone.utc),
        )
        .values(status="expired")
    )
    await db.commit()
    if result.rowcount:
        logger.info("过期会话 | count=%d", result.rowcount)
    return result.rowcount


async def expire_stale_orders_bulk(db: AsyncSession) -> int:
    """批量关闭全部超时未支付订单(created → expired)，与过期会话清扫配套。

    不按会话过滤：终端放弃轮询后其会话与订单只能靠这里的批量清扫收尾。
    """
    result = await db.execute(
        update(PaymentOrder)
        .where(
            PaymentOrder.status == "created",
            PaymentOrder.expires_at < datetime.now(timezone.utc),
        )
        .values(status="expired")
    )
    await db.commit()
    if result.rowcount:
        logger.info("过期订单(批量) | count=%d", result.rowcount)
    return result.rowcount or 0


# ================== 订单管理 ==================


async def create_order(
    db: AsyncSession,
    customer_id: UUID,
    assessment_session_id: UUID,
    amount_fen: int = COMMUNITY_PRICE_FEN,
) -> PaymentOrder:
    """创建支付订单。"""
    order = PaymentOrder(
        customer_id=customer_id,
        assessment_session_id=assessment_session_id,
        amount_fen=amount_fen,
        status="created",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=ORDER_TTL_MINUTES),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    logger.info(
        "创建支付订单 | order=%s customer=%s session=%s amount=%dfen",
        order.id,
        customer_id,
        assessment_session_id,
        amount_fen,
    )
    return order


async def get_order(db: AsyncSession, order_id: UUID) -> PaymentOrder | None:
    return (
        await db.execute(select(PaymentOrder).where(PaymentOrder.id == order_id))
    ).scalar_one_or_none()


async def mark_order_paid(
    db: AsyncSession, order_id: UUID, wechat_txn_id: str | None = None
) -> PaymentOrder | None:
    """将订单标记为已支付(幂等)，并解锁关联的测评会话。"""
    order = await get_order(db, order_id)
    if order is None:
        return None
    if order.status == "paid":
        logger.info("订单已支付(幂等跳过) | order=%s", order_id)
        return order  # 幂等

    order.status = "paid"
    order.paid_at = datetime.now(timezone.utc)
    order.wechat_txn_id = wechat_txn_id

    # 解锁关联会话
    if order.assessment_session_id:
        session = await get_session(db, order.assessment_session_id)
        if session and session.status in ("created", "awaiting_payment"):
            session.status = "authorized"
            # Payment QR expires quickly; an already paid entitlement does not.
            session.expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.commit()
    logger.info(
        "订单支付成功 | order=%s txn=%s session=%s",
        order_id,
        wechat_txn_id,
        order.assessment_session_id,
    )
    return order


async def refund_order(db: AsyncSession, order_id: UUID) -> PaymentOrder | None:
    """退款(仅管理员操作)。"""
    order = await get_order(db, order_id)
    if order is None or order.status != "paid":
        return None
    order.status = "refunded"
    await db.commit()
    logger.info("订单退款 | order=%s", order_id)
    return order


# ================== 订单全状态机 ==================
# created(待支付) → paid(已支付) → assessing(测评中) → analyzing(分析中)
#   → completed(已完成) / failed(失败)；未支付超时 → expired(过期/关闭)；退款 → refunded。


async def start_assessment(db: AsyncSession, session_id: UUID) -> AssessmentSession | None:
    """终端进入核心测评时推进状态：authorized → assessing（订单 paid → assessing）。

    幂等：已处于 assessing 直接返回；未授权/已提交的会话拒绝。
    """
    session = await get_session(db, session_id)
    if session is None:
        return None
    if session.status == "assessing":
        return session
    if session.status != "authorized":
        raise SessionBindingError(409, f"会话当前状态不允许开始测评: {session.status}")
    session.status = "assessing"
    order = await _latest_paid_order(db, session.id)
    if order is not None:
        order.status = "assessing"
    await db.commit()
    logger.info("测评开始 | session=%s order=%s", session_id, order.id if order else None)
    return session


async def _latest_paid_order(db: AsyncSession, session_id: UUID) -> PaymentOrder | None:
    return (
        await db.execute(
            select(PaymentOrder)
            .where(
                PaymentOrder.assessment_session_id == session_id,
                PaymentOrder.status.in_(("paid", "assessing")),
            )
            .order_by(PaymentOrder.paid_at.desc().nulls_last())
            .limit(1)
        )
    ).scalar_one_or_none()


async def mark_order_analyzing(db: AsyncSession, order_id: UUID) -> None:
    """测评提交、视频与答题数据落库后：订单进入分析中。"""
    order = await db.get(PaymentOrder, order_id)
    if order is not None and order.status in ("paid", "assessing"):
        order.status = "analyzing"


_ORDER_STATUS_BY_ASSESSMENT = {
    "completed": "completed",
    "invalid_result": "failed",
    "failed": "failed",
}


async def sync_community_order_status(db: AsyncSession, assessment) -> None:  # noqa: ANN001
    """分析到终态后回写订单：completed→已完成，invalid_result/failed→失败。

    仅社区测评有效；退款/过期订单不再覆盖。航空测评零副作用。
    """
    if getattr(assessment, "scene", None) != "community" or not assessment.order_id:
        return
    raw_status = getattr(assessment.status, "value", assessment.status)
    target = _ORDER_STATUS_BY_ASSESSMENT.get(raw_status)
    if not target:
        return
    order = await db.get(PaymentOrder, assessment.order_id)
    if order is not None and order.status not in ("refunded", "expired"):
        order.status = target
        logger.info(
            "订单状态回写 | order=%s assessment=%s -> %s",
            assessment.order_id,
            assessment.id,
            target,
        )


async def expire_stale_orders(db: AsyncSession, session_id: UUID) -> int:
    """会话过期时关闭其未支付订单（created → expired）。"""
    result = await db.execute(
        update(PaymentOrder)
        .where(
            PaymentOrder.assessment_session_id == session_id,
            PaymentOrder.status == "created",
        )
        .values(status="expired")
    )
    return result.rowcount or 0


# ================== 支付回调(Mock / 真实) ==================


async def handle_payment_callback(
    db: AsyncSession, order_id: UUID, wechat_txn_id: str | None = None
) -> bool:
    """处理支付成功回调(统一入口)。

    Mock 模式: 直接调此函数(测试用)
    真实模式: 微信 webhook 验签解密后调此函数
    """
    order = await mark_order_paid(db, order_id, wechat_txn_id)
    return order is not None


# ================== Mock 支付参数 ==================


def build_mock_pay_params(order_id: UUID) -> dict:
    """生成 Mock 支付参数(前端 wx.requestPayment 所需格式)。"""
    return {
        "timeStamp": str(int(time.time())),
        "nonceStr": secrets.token_hex(16),
        "package": f"prepay_id=mock_{order_id.hex}",
        "signType": "RSA",
        "paySign": "mock_sign_for_dev",
        "_mock": True,  # 前端可识别这是 Mock 参数
    }


# ================== 提交前会话校验 ==================


async def authorize_community_submission(
    db: AsyncSession, session_id: UUID
) -> tuple[AssessmentSession, PaymentOrder, Customer]:
    """校验社区会话可否提交测评：已支付授权、未过期、未使用、场景匹配。

    通过后返回 (会话, 已支付订单, 支付用户)，由调用方把订单/用户/终端绑定
    写入 Assessment 并将会话状态推进为 submitted。
    任何校验失败抛 SessionBindingError(状态码, 中文原因)。

    会话行加 FOR UPDATE 行锁：并发双提交在锁上串行化，后到者必然
    看到 submitted 状态被拒，杜绝"一单两测"。
    """
    session = (
        await db.execute(
            select(AssessmentSession).where(AssessmentSession.id == session_id).with_for_update()
        )
    ).scalar_one_or_none()
    if session is None:
        raise SessionBindingError(404, "测评会话不存在")

    if session.scene != "community":
        raise SessionBindingError(403, "会话场景不匹配，该入口仅支持社区会话")

    if session.status in ("created", "awaiting_payment"):
        # 顺手做懒过期，保证终端轮询与提交侧状态一致；同时关闭其未支付订单
        if session.expires_at and session.expires_at <= datetime.now(timezone.utc):
            session.status = "expired"
            await expire_stale_orders(db, session.id)
            await db.commit()
            raise SessionBindingError(410, "会话已过期，请重新扫码发起测评")
        raise SessionBindingError(402, "会话尚未支付，无法提交测评")

    if session.status == "expired":
        raise SessionBindingError(410, "会话已过期，请重新扫码发起测评")

    if session.status == "submitted":
        raise SessionBindingError(409, "该会话已提交过测评，每笔支付仅支持一次提交")

    # authorized(已支付未开始) 或 assessing(终端已开始测评) 均可提交
    if session.status not in ("authorized", "assessing"):
        raise SessionBindingError(409, f"会话状态不允许提交: {session.status}")

    if session.expires_at and session.expires_at <= datetime.now(timezone.utc):
        session.status = "expired"
        await expire_stale_orders(db, session.id)
        await db.commit()
        raise SessionBindingError(410, "会话已过期，请重新扫码发起测评")

    if not session.customer_id:
        raise SessionBindingError(402, "会话未绑定支付用户，无法提交测评")

    order = await _latest_paid_order(db, session.id)
    if order is None:
        raise SessionBindingError(402, "会话没有已支付的订单，无法提交测评")

    customer = await db.get(Customer, session.customer_id)
    if customer is None:
        raise SessionBindingError(402, "支付用户不存在")

    return session, order, customer


# ================== 报告查询 ==================


async def get_customer_reports(db: AsyncSession, customer_id: UUID) -> list[dict]:
    """查询社区用户的测评报告列表。"""
    from app.models.assessment import Assessment

    stmt = (
        select(Assessment)
        .where(
            Assessment.customer_id == customer_id,
            # 社区用户报告绝不能因为未来的数据扩展混入其他场景。
            Assessment.scene == "community",
        )
        .order_by(Assessment.created_at.desc())
        .limit(50)
    )
    rows = (await db.execute(stmt)).scalars().all()

    reports = []
    for a in rows:
        status_map = {
            "completed": ("completed", "已生成"),
            "invalid_result": ("failed", "结果无效"),
            "failed": ("failed", "生成失败"),
        }
        # AssessmentStatus 是枚举，str(成员) 会得到 "AssessmentStatus.completed"
        raw_status = getattr(a.status, "value", a.status)
        status, label = status_map.get(raw_status, ("analyzing", "分析中"))
        reports.append(
            {
                "id": str(a.id),
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "status": status,
                "status_label": label,
                "summary": None,  # V3 + Qwen 摘要(PDF 生成后填)
                "has_pdf": bool(a.report_pdf_key),
            }
        )
    return reports
