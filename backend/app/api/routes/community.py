"""社区场景 API 路由：微信授权、支付会话、支付回调、报告查看。

联调阶段使用 Mock(不需要微信商户号)；商户号下来后将 Mock 替换为真实微信调用。
"""
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.assessment import Assessment
from app.models.community import Customer, Device, PaymentOrder
from app.services.community import (
    COMMUNITY_PRICE_FEN,
    SessionBindingError,
    build_mock_pay_params,
    create_order,
    create_session,
    expire_stale_orders,
    get_customer_reports,
    get_session,
    handle_payment_callback,
    issue_jwt,
    start_assessment,
    verify_jwt,
)

logger = logging.getLogger("app.routes.community")

DB = Depends(get_db)
router = APIRouter(prefix="/api/v1/community", tags=["community"])


async def get_current_customer(
    authorization: str = Header(default=""),
    db: AsyncSession = DB,
) -> Customer:
    """从 Authorization: Bearer <JWT> 解析当前社区用户。"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少 Bearer Token")

    token = authorization.removeprefix("Bearer ").strip()
    payload = verify_jwt(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")

    customer_id = payload.get("sub")
    if not customer_id:
        raise HTTPException(status_code=401, detail="Token 中缺少用户标识")

    customer = (
        await db.execute(select(Customer).where(Customer.id == UUID(customer_id)))
    ).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=401, detail="用户不存在")

    return customer


# ================== 授权登录 ==================

# /auth 限频（进程内滑窗，按 IP 计所有尝试）：Mock 模式 code 即 openid，
# 不限频可无限制造 Customer 行。
_AUTH_WINDOW_SECONDS = 300
_AUTH_MAX_ATTEMPTS = 20
_AUTH_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def _check_auth_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    bucket = _AUTH_BUCKETS[client_ip]
    while bucket and now - bucket[0] > _AUTH_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= _AUTH_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试")
    bucket.append(now)


class AuthRequest(BaseModel):
    code: str  # wx.login() 返回的临时授权码


class AuthResponse(BaseModel):
    token: str
    openid: str
    nickname: str | None = None
    is_new_user: bool = False


@router.post("/auth", response_model=AuthResponse)
async def wechat_auth(
    body: AuthRequest, request: Request, db: AsyncSession = DB
) -> AuthResponse:
    """H5 页面 OAuth 回调：code 换 OpenID + 签发 JWT。

    Mock 模式(未配置 AppID): 用 code 生成假 OpenID。
    真实模式(配置了 AppID): 调微信 OAuth API 换取 OpenID。
    """
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    _check_auth_rate_limit(client_ip)
    if not body.code:
        raise HTTPException(status_code=400, detail="code 不能为空")

    from app.services.wechat.oauth import code_to_openid

    try:
        oauth_result = await code_to_openid(body.code)
        openid = oauth_result["openid"]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # 查找或创建用户
    customer = (
        await db.execute(select(Customer).where(Customer.openid == openid))
    ).scalar_one_or_none()

    is_new = False
    if customer is None:
        customer = Customer(openid=openid, nickname="微信用户")
        db.add(customer)
        await db.commit()
        await db.refresh(customer)
        is_new = True

    token = issue_jwt(str(customer.id), customer.openid)
    return AuthResponse(
        token=token,
        openid=customer.openid,
        nickname=customer.nickname,
        is_new_user=is_new,
    )


# ================== 支付会话(终端调用) ==================


class CreateSessionRequest(BaseModel):
    device_id: str


class CreateSessionResponse(BaseModel):
    session_id: str
    scene: str
    amount_fen: int
    expires_at: str | None = None
    pay_params: dict  # wx.requestPayment 所需参数


@router.post("/session", response_model=CreateSessionResponse)
async def create_payment_session(
    body: CreateSessionRequest, db: AsyncSession = DB
) -> CreateSessionResponse:
    """终端请求创建支付会话(生成二维码前调用)。

    只信任后端设备配置：设备必须已注册、启用且 scene=community，
    终端自行声明的场景一律无效。
    """
    device = (
        await db.execute(select(Device).where(Device.device_id == body.device_id))
    ).scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=404, detail="设备未注册，请联系管理员")
    if not device.is_active:
        raise HTTPException(status_code=403, detail="设备已停用，请联系管理员")
    if device.scene != "community":
        raise HTTPException(status_code=403, detail="该设备未开通社区场景")

    session = await create_session(db, device_id=device.device_id, scene="community")

    # Mock 支付参数(真实模式下需要用户先登录才能生成,这里先返回占位)
    pay_params = build_mock_pay_params(session.id)

    return CreateSessionResponse(
        session_id=str(session.id),
        scene=session.scene,
        amount_fen=COMMUNITY_PRICE_FEN,
        expires_at=session.expires_at.isoformat() if session.expires_at else None,
        pay_params=pay_params,
    )


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str  # created|awaiting_payment|authorized|assessing|submitted|expired
    paid: bool
    openid_masked: str | None = None


@router.get("/session/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: UUID, db: AsyncSession = DB
) -> SessionStatusResponse:
    """终端轮询支付状态(建议 3 秒一次)。"""
    session = await get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 懒过期：等待支付期间超时的会话就地失效，并关闭其未支付订单
    if (
        session.status in ("created", "awaiting_payment")
        and session.expires_at
        and session.expires_at <= datetime.now(timezone.utc)
    ):
        session.status = "expired"
        await expire_stale_orders(db, session.id)
        await db.commit()

    paid = session.status in ("authorized", "assessing", "submitted")
    masked = None
    if session.customer_id:
        masked = str(session.customer_id)[:8] + "..."
    return SessionStatusResponse(
        session_id=str(session.id),
        status=session.status,
        paid=paid,
        openid_masked=masked,
    )


@router.post("/session/{session_id}/start")
async def start_session_assessment(session_id: UUID, db: AsyncSession = DB) -> dict:
    """终端进入核心测评时推进状态（authorized → assessing，订单 → 测评中）。

    支付解锁前置：未支付/过期/已提交的会话一律拒绝。
    """
    try:
        session = await start_assessment(db, session_id)
    except SessionBindingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"session_id": str(session.id), "status": session.status}


# ================== 支付(小程序调用) ==================


class PayRequest(BaseModel):
    session_id: str


class PayResponse(BaseModel):
    timeStamp: str
    nonceStr: str
    package: str
    signType: str
    paySign: str


@router.post("/pay", response_model=PayResponse)
async def create_payment(
    body: PayRequest,
    customer: "Customer" = Depends(get_current_customer),  # noqa: B008
    db: AsyncSession = DB,
) -> PayResponse:
    """小程序创建支付订单，返回 wx.requestPayment 参数。"""
    session = await get_session(db, UUID(body.session_id))
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在或已过期")
    if session.status not in ("created", "awaiting_payment"):
        raise HTTPException(status_code=400, detail="该会话已支付或已过期")

    now = datetime.now(timezone.utc)
    # 过期会话不再收款（收款后提交必 410，等于白付），顺手关闭未支付订单
    if session.expires_at and session.expires_at <= now:
        session.status = "expired"
        await expire_stale_orders(db, session.id)
        await db.commit()
        raise HTTPException(status_code=410, detail="会话已过期，请重新扫码发起测评")
    # 首个扫码支付的用户独占会话，防止两人各付一单抢同一测评
    if session.customer_id and session.customer_id != customer.id:
        raise HTTPException(status_code=409, detail="该会话已由其他用户发起支付")

    # 绑定用户到会话
    session.customer_id = customer.id
    await db.commit()

    # 复用该会话未支付且未过期的订单；重复扫码不再另开新单（避免双收款）
    order = (
        await db.execute(
            select(PaymentOrder)
            .where(
                PaymentOrder.assessment_session_id == session.id,
                PaymentOrder.status.in_(("created", "paid", "assessing", "analyzing")),
            )
            .order_by(PaymentOrder.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if order is not None and order.status != "created":
        raise HTTPException(status_code=400, detail="该会话已支付，无需重复下单")
    if order is not None and order.expires_at and order.expires_at <= now:
        order.status = "expired"
        await db.commit()
        order = None
    if order is None:
        order = await create_order(
            db,
            customer_id=customer.id,
            assessment_session_id=session.id,
            amount_fen=COMMUNITY_PRICE_FEN,
        )

    # 调微信支付服务(Mock 或真实模式自动切换)
    from app.services.wechat.pay import create_jsapi_order

    try:
        params = await create_jsapi_order(
            order_id=order.id,
            openid=customer.openid,
            amount_fen=COMMUNITY_PRICE_FEN,
            description="心理测评服务",
        )
    except NotImplementedError:
        # 真实模式未实现时回退到 Mock
        params = build_mock_pay_params(order.id)

    return PayResponse(
        timeStamp=params["timeStamp"],
        nonceStr=params["nonceStr"],
        package=params["package"],
        signType=params["signType"],
        paySign=params["paySign"],
    )


# ================== 支付回调(Mock / 微信服务器) ==================


class MockPayNotifyRequest(BaseModel):
    """Mock 回调请求体(联调用)。"""
    order_id: str
    wechat_txn_id: str | None = None


@router.post("/pay/mock-notify")
async def mock_pay_notify(body: MockPayNotifyRequest, db: AsyncSession = DB) -> dict:
    """Mock 支付回调(仅联调阶段使用，生产环境移除或加鉴权)。"""
    if settings.WECHAT_MCH_ID:
        # 配置真实商户号后关闭该入口，防止伪造回调标记订单已支付
        raise HTTPException(status_code=404, detail="Mock 回调仅在开发模式可用")
    order_id = UUID(body.order_id)
    ok = await handle_payment_callback(db, order_id, body.wechat_txn_id)
    if not ok:
        raise HTTPException(status_code=404, detail="订单不存在")
    return {"code": "SUCCESS", "message": "Mock 支付成功"}


# ================== Mock 支付页(开发联调) ==================

_MOCK_PAY_PAGE = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>模拟支付 · 社区心理测评</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#eaf3ee,#f8fbf9);color:#263c35;
  font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.card{width:min(420px,92vw);padding:36px 28px;border-radius:20px;text-align:center;
  background:#fff;border:1px solid #dce9e4;box-shadow:0 18px 48px #245b4b1f}
.amount{margin:18px 0 6px;font-size:44px;font-weight:700}
.hint{margin:0;color:#667c73;font-size:13px;line-height:1.7}
button{width:100%;margin-top:26px;padding:14px 0;border:0;border-radius:999px;
  background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:17px;font-weight:600}
button:disabled{opacity:.5}
#state{margin-top:18px;font-size:14px;color:#9a6a0d;min-height:20px}.ok #state{color:#26734d}
.report-link{display:none;margin-top:12px;color:#367864;font-size:13px}
.ok .report-link{display:inline-block}
</style></head><body>
<div class="card" id="card">
  <div style="font-size:15px;color:#4f8d82;font-weight:700">社区心理服务 · 演示体验</div>
  <div class="amount" id="amt">¥4.00</div>
  <p class="hint">确认后终端将自动进入测评。<br>当前为演示环境，不会产生真实扣款。</p>
  <button id="pay" onclick="doPay()">确认并模拟支付</button>
  <div id="state"></div>
  <a class="report-link" href="/community/reports">保持此页面，稍后查看报告 ›</a>
</div>
<script>
const params = new URLSearchParams(location.search);
const sessionId = params.get("session_id") || "";
const state = document.getElementById("state");
async function api(path, body, token) {
  const res = await fetch(path, {
    method: "POST",
    headers: Object.assign({"Content-Type": "application/json"},
      token ? {Authorization: "Bearer " + token} : {}),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || ("HTTP " + res.status));
  return data;
}
async function doPay() {
  const btn = document.getElementById("pay");
  btn.disabled = true;
  try {
    if (!sessionId) throw new Error("缺少 session_id 参数");
    state.textContent = "正在登录…";
    const auth = await api("/api/v1/community/auth", {code: "mock-" + sessionId.slice(0, 12)});
    state.textContent = "正在创建订单…";
    const pay = await api("/api/v1/community/pay", {session_id: sessionId}, auth.token);
    const m = /mock_([0-9a-f]{32})/.exec(pay.package || "");
    if (!m) throw new Error("支付参数缺少 Mock 订单号");
    state.textContent = "正在确认支付…";
    await api("/api/v1/community/pay/mock-notify", {
      order_id: m[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"),
    });
    // Mock 联调：将同一个微信用户 token 写给独立社区 H5，
    // 这样支付手机随后打开 /community/reports 能看到自己的报告。
    localStorage.setItem("psych.community.customer_token", auth.token);
    document.getElementById("card").classList.add("ok");
    state.textContent = "支付成功！请回到终端继续测评。";
  } catch (e) {
    state.textContent = "失败：" + e.message;
    btn.disabled = false;
  }
}
</script></body></html>"""


@router.get("/mock-pay", response_class=HTMLResponse, include_in_schema=False)
async def mock_pay_page(session_id: str = Query(default="")) -> HTMLResponse:
    """Mock 收银台页面：终端二维码指向这里，模拟用户扫码支付的全过程。

    仅在未配置真实微信商户号(即 Mock 支付模式)时可用。
    """
    if settings.WECHAT_MCH_ID:
        raise HTTPException(status_code=404, detail="Mock 支付页仅在开发模式可用")
    if not session_id:
        raise HTTPException(status_code=422, detail="缺少 session_id 参数")
    return HTMLResponse(_MOCK_PAY_PAGE)


# ================== 社区 H5 报告页（Mock 联调；真实服务号阶段替换为 OAuth） ==================


@router.get("/h5/report", response_class=HTMLResponse, include_in_schema=False)
async def community_h5_report(
    session_id: str = Query(default=""), db: AsyncSession = DB
) -> HTMLResponse:
    """社区用户版报告领取页：终端完成页二维码指向这里。

    Mock 阶段按支付会话定位用户（无需微信授权）；配置真实微信后此页
    改为 OAuth 静默授权换取 OpenID 再查报告。
    """
    if settings.WECHAT_MCH_ID or settings.WECHAT_APP_ID:
        raise HTTPException(status_code=404, detail="正式环境请通过微信公众号查看报告")
    try:
        parsed = UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="缺少有效的 session_id") from exc

    from app.models.community import Customer

    session = await get_session(db, parsed)
    if session is None:
        raise HTTPException(status_code=404, detail="会话不存在或已过期")

    rows_html = ""
    if session.customer_id:
        customer = await db.get(Customer, session.customer_id)
        if customer:
            token = issue_jwt(str(customer.id), customer.openid)
            reports = await get_customer_reports(db, customer.id)
            for r in reports:
                color_map = {"completed": "#16a34a", "failed": "#dc2626"}
                status_color = color_map.get(r["status"], "#d97706")
                file_url = f"/api/v1/community/me/reports/{r['id']}/file?token={token}"
                action = (
                    f'<a class="btn" href="{file_url}">查看报告</a>'
                    if r["has_pdf"]
                    else '<span class="btn btn--disabled">生成中…</span>'
                )
                created = (r.get("created_at") or "")[:16].replace("T", " ")
                rows_html += (
                    f'<div class="report"><div><b>测评记录</b>'
                    f'<small>{created}</small></div>'
                    f'<span class="status" style="color:{status_color}">'
                    f'{r["status_label"]}</span>{action}</div>'
                )
    if not rows_html:
        rows_html = '<div class="empty">完成测评后，这里会显示你的报告</div>'

    html = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>我的测评报告</title>
<style>
body{margin:0;min-height:100vh;background:linear-gradient(180deg,#eaf3ee,#f6faf7);color:#263c35;
  font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:28px 18px}
.wrap{max-width:420px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.sub{margin:0 0 22px;color:#6c8b7d;font-size:13px}
.report{display:flex;align-items:center;gap:10px;padding:16px 14px;margin-bottom:12px;
  border-radius:14px;
  background:#fff;box-shadow:0 6px 18px #17352b14}
.report b{display:block;font-size:15px}
.report small{color:#8aa89b;font-size:11px}
.report>div{flex:1}
.status{font-size:12px;font-weight:650;white-space:nowrap}
.btn{display:inline-block;padding:9px 14px;border-radius:999px;
  background:linear-gradient(135deg,#668d7e,#3e7367);
  color:#fff;text-decoration:none;font-size:13px;font-weight:650;white-space:nowrap}
.btn--disabled{background:#e3ece6;color:#8aa89b}
.empty{padding:36px 0;text-align:center;color:#8aa89b;font-size:14px}
.foot{margin-top:26px;text-align:center;color:#9db3a7;font-size:11px;line-height:1.7}
</style></head><body><div class="wrap">
<h1>我的测评报告</h1>
<p class="sub">AI视觉心理评估 · 社区版</p>
__ROWS__
<div class="foot">报告仅供个人参考，不构成临床诊断。<br>如有持续困扰，建议寻求专业帮助。</div>
</div></body></html>"""
    return HTMLResponse(html.replace("__ROWS__", rows_html))


# TODO: 真实微信回调(商户号下来后启用)
# @router.post("/payments/wechat/notify")
# async def wechat_pay_notify(request: Request, db: AsyncSession = DB):
#     """微信支付服务端回调(webhook)。"""
#     body = await request.body()
#     signature = request.headers.get("Wechatpay-Signature", "")
#     timestamp = request.headers.get("Wechatpay-Timestamp", "")
#     nonce = request.headers.get("Wechatpay-Nonce", "")
#     # 1. 验签  2. 解密  3. 金额核验  4. 幂等更新订单
#     ...


# ================== 报告(小程序调用) ==================


class ReportListResponse(BaseModel):
    reports: list[dict]


@router.get("/me/reports", response_model=ReportListResponse)
async def my_reports(
    customer: "Customer" = Depends(get_current_customer),  # noqa: B008
    db: AsyncSession = DB,
) -> ReportListResponse:
    """获取当前用户的报告列表。"""
    reports = await get_customer_reports(db, customer.id)
    return ReportListResponse(reports=reports)


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int  # 秒
    filename: str


class CommunityReportResponse(BaseModel):
    """社区用户 H5 使用的最小报告信息。

    不返回 V3 原始结果、Qwen 后台解读、管理员备注或调试信息。
    """
    id: str
    created_at: str | None = None
    status: str
    status_label: str
    has_pdf: bool


def _report_filename(assessment: Assessment) -> str:
    if assessment.created_at:
        return f"心理测评报告_{assessment.created_at.strftime('%Y%m%d')}.pdf"
    return "报告.pdf"


async def _get_own_report(
    db: AsyncSession, report_id: UUID, customer_id: UUID
) -> Assessment | None:
    return (
        await db.execute(
            select(Assessment).where(
                Assessment.id == report_id,
                Assessment.customer_id == customer_id,  # 仅本人可下载
                Assessment.scene == "community",  # 与航空报告硬隔离
            )
        )
    ).scalar_one_or_none()


def _community_report_status(assessment: Assessment) -> tuple[str, str]:
    raw_status = getattr(assessment.status, "value", assessment.status)
    return {
        "completed": ("completed", "报告已生成"),
        "invalid_result": ("failed", "本次结果暂不建议解释"),
        "failed": ("failed", "报告生成失败"),
    }.get(raw_status, ("analyzing", "正在分析中"))


@router.get("/me/reports/{report_id}", response_model=CommunityReportResponse)
async def get_my_report(
    report_id: UUID,
    customer: "Customer" = Depends(get_current_customer),  # noqa: B008
    db: AsyncSession = DB,
) -> CommunityReportResponse:
    """社区 H5 报告详情状态；只暴露面向用户的最小字段。"""
    assessment = await _get_own_report(db, report_id, customer.id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="报告不存在或不属于当前用户")
    report_status, status_label = _community_report_status(assessment)
    return CommunityReportResponse(
        id=str(assessment.id),
        created_at=assessment.created_at.isoformat() if assessment.created_at else None,
        status=report_status,
        status_label=status_label,
        has_pdf=bool(assessment.report_pdf_key),
    )


@router.get("/me/reports/{report_id}/download-url", response_model=DownloadUrlResponse)
async def get_download_url(
    report_id: UUID,
    request: Request,
    customer: "Customer" = Depends(get_current_customer),  # noqa: B008
    db: AsyncSession = DB,
) -> DownloadUrlResponse:
    """获取 PDF 报告的下载链接(签名 URL,24h 有效)。

    本地开发(未接 OSS)时 report_pdf_key 存的是本地文件路径，直接返回
    本服务的文件下载地址(带 token 的 Mock 链接)；接 OSS 后切换为签名 URL。
    """
    assessment = await _get_own_report(db, report_id, customer.id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="报告不存在或不属于当前用户")
    if not assessment.report_pdf_key:
        raise HTTPException(status_code=400, detail="报告尚未生成")

    if assessment.report_pdf_key.startswith("/"):
        # 本地文件模式：把调用方自己的 JWT 回填成直链(仅 Mock/开发用)
        raw_token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        base = str(request.base_url).rstrip("/")
        url = f"{base}/api/v1/community/me/reports/{report_id}/file?token={raw_token}"
    else:
        # TODO: 接入 OSS 后生成真实签名 URL
        url = f"https://oss.example.com/{assessment.report_pdf_key}?mock=true"

    return DownloadUrlResponse(
        url=url,
        expires_in=86400,
        filename=_report_filename(assessment),
    )


@router.get("/me/reports/{report_id}/file", response_class=FileResponse)
async def download_report_file(
    report_id: UUID,
    token: str = Query(default=""),
    authorization: str = Header(default=""),
    db: AsyncSession = DB,
) -> FileResponse:
    """报告 PDF 文件直出(本地开发模式)。

    鉴权支持 Authorization: Bearer 或 ?token= 查询参数——浏览器 <a> 直链
    无法携带请求头，Mock 阶段允许 token 走 URL(生产切换 OSS 签名 URL)。
    """
    raw_token = authorization.removeprefix("Bearer ").strip() or token
    payload = verify_jwt(raw_token) if raw_token else None
    if payload is None or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Token 无效或已过期")

    assessment = await _get_own_report(db, report_id, UUID(payload["sub"]))
    if assessment is None:
        raise HTTPException(status_code=404, detail="报告不存在或不属于当前用户")
    if not assessment.report_pdf_key:
        raise HTTPException(status_code=400, detail="报告尚未生成")

    pdf_path = Path(assessment.report_pdf_key)
    if not assessment.report_pdf_key.startswith("/") or not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="报告文件不在本地(非 Mock 模式请走 OSS 下载)")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=_report_filename(assessment),
        headers={"Cache-Control": "private, max-age=0"},
    )
