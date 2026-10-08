"""持久化后台处理任务：入队、领取（行锁）、退避重试、worker 循环。

机制（替代"仅请求内 BackgroundTasks"的演示方案）：
- 入队与测评创建同事务：/submit 提交成功即有任务行，终端退出/服务重启不丢；
- 领取：SELECT ... FOR UPDATE SKIP LOCKED —— 同一任务并发只有一个 worker 成功；
- 崩溃恢复：running 且租约（lease_seconds）过期的任务可被重新领取；
- 退避：失败后 next_run_at = now + attempts * backoff_base；超过 max_attempts 进 dead；
- 远端不确定性：上传阶段失败但已产生远端 file_id 而无 task_id 时标记
  uncertain_remote，不自动重试（合作方接口无幂等键，盲目重传可能重复计费），
  由管理端确认后续查或作废；
- 采集不合格（QA）与合作方分析失败分开：QA 失败任务直接 done（测评本身
  invalid/failed，需重新采集，不是处理故障）。

执行体仍是 services/assessment.run_assessment（分阶段可续跑：已有 v3_task_id
则续查而非重建）。
"""

from __future__ import annotations

import asyncio
import logging
import socket
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.assessment import Assessment, ProcessingTask
from app.services.assessment import run_assessment

logger = logging.getLogger(__name__)

# run_assessment 的终态中，属于"本轮数据问题"而非"处理故障"的结局：
# 任务记 done，不进入重试。
_TERMINAL_DATA_OUTCOMES = {"completed", "invalid_result", "qa_failed", "VideoQAFailed"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def enqueue_assessment_task(
    db: AsyncSession, assessment_id: uuid.UUID, scene: str
) -> ProcessingTask:
    """为测评创建任务行（调用方在同一事务内 commit——与测评共存亡）。"""
    task = ProcessingTask(
        assessment_id=assessment_id,
        scene=scene,
        stage="video_processing",
        status="pending",
        max_attempts=settings.TASK_MAX_ATTEMPTS,
        lease_seconds=settings.TASK_LEASE_SECONDS,
        next_run_at=_now(),
    )
    db.add(task)
    return task


async def requeue_task_for_retry(
    db: AsyncSession, assessment_id: uuid.UUID, *, reset_attempts: bool = False
) -> ProcessingTask | None:
    """管理端/重提交触发的安全重试：重置为 pending 并立即到期。

    reset_attempts=True（管理端明确重试）时尝试次数清零，重新获得完整额度。
    """
    stmt = select(ProcessingTask).where(ProcessingTask.assessment_id == assessment_id)
    task = (await db.execute(stmt)).scalar_one_or_none()
    if task is None:
        return None
    task.status = "pending"
    task.next_run_at = _now()
    task.last_error = None
    task.uncertain_remote = False
    task.locked_by = None
    task.locked_at = None
    if reset_attempts:
        task.attempts = 0
    return task


async def claim_next_task(worker_id: str) -> ProcessingTask | None:
    """领取一个到期任务（含租约过期的 running 任务）。行锁保证并发唯一。"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                SELECT id FROM processing_tasks
                WHERE (
                        (status = 'pending' AND next_run_at <= now())
                     OR (status = 'running'
                         AND locked_at + make_interval(secs => lease_seconds) < now())
                     OR (status = 'failed' AND next_run_at <= now())
                    )
                  AND NOT uncertain_remote
                ORDER BY next_run_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        task = await db.get(ProcessingTask, row)
        assert task is not None
        task.status = "running"
        task.attempts += 1
        task.locked_by = worker_id
        task.locked_at = _now()
        await db.commit()
        await db.refresh(task)
        return task


async def complete_task(task_id: uuid.UUID, stage: str = "done") -> None:
    async with AsyncSessionLocal() as db:
        task = await db.get(ProcessingTask, task_id)
        if task is None:
            return
        task.status = "done"
        task.stage = stage
        task.locked_by = None
        task.locked_at = None
        await db.commit()


async def fail_task(task: ProcessingTask, error: str, *, uncertain_remote: bool = False) -> None:
    """失败记账：额度内退避重试，超限 dead；远端不确定不自动重试。"""
    async with AsyncSessionLocal() as db:
        fresh = await db.get(ProcessingTask, task.id)
        if fresh is None:
            return
        fresh.last_error = error[:2000]
        fresh.uncertain_remote = uncertain_remote
        fresh.locked_by = None
        fresh.locked_at = None
        if uncertain_remote:
            fresh.status = "failed"  # 不自动重试；管理端确认后重试
            fresh.next_run_at = _now()
        elif fresh.attempts >= fresh.max_attempts:
            fresh.status = "dead"
            fresh.next_run_at = _now()
            logger.error(
                "任务 %s 超过最大重试(%d)，进入 dead: %s",
                fresh.assessment_id,
                fresh.max_attempts,
                error[:200],
            )
        else:
            fresh.status = "failed"
            backoff = timedelta(seconds=fresh.attempts * settings.TASK_BACKOFF_BASE_SECONDS)
            fresh.next_run_at = _now() + backoff
            logger.warning(
                "任务 %s 第 %d 次失败，%ds 后重试: %s",
                fresh.assessment_id,
                fresh.attempts,
                int(backoff.total_seconds()),
                error[:200],
            )
        await db.commit()
        # 审计冗余：测评行同步尝试次数与最后错误
        assessment = await db.get(Assessment, fresh.assessment_id)
        if assessment is not None:
            assessment.processing_attempts = fresh.attempts
            await db.commit()


async def execute_task(task: ProcessingTask) -> None:
    """执行一个任务：跑管道 → 按结局记账。所有异常落任务层，不外抛。"""
    try:
        outcome = await run_assessment(task.assessment_id)
        # 兼容枚举成员与裸字符串：AssessmentStatus.completed → 'completed'
        outcome = str(getattr(outcome, "value", outcome) or "")
        if outcome in _TERMINAL_DATA_OUTCOMES or outcome.startswith("VideoQAFailed"):
            await complete_task(task.id, stage=outcome)
            return
        # 处理故障（failed/未知）：按重试策略记账
        async with AsyncSessionLocal() as db:
            assessment = await db.get(Assessment, task.assessment_id)
            error = (assessment.error_message if assessment else None) or outcome or "处理失败"
            uploaded_no_task = (
                assessment is not None
                and assessment.v3_file_id is not None
                and not assessment.v3_task_id
            )
        await fail_task(task, error, uncertain_remote=bool(uploaded_no_task))
    except Exception as exc:  # noqa: BLE001
        logger.exception("任务 %s 执行异常", task.assessment_id)
        await fail_task(task, f"{type(exc).__name__}: {exc}")


def _worker_id() -> str:
    try:  # get_event_loop 在 3.12+ 已弃用；仅在事件循环内调用本函数
        loop_id = hex(id(asyncio.get_running_loop()))[-6:]
    except RuntimeError:
        loop_id = "noloop"
    return f"{socket.gethostname()}:{loop_id}"


async def community_expiry_sweep() -> None:
    """社区过期清扫：批量过期超时会话与未支付订单。

    终端放弃轮询后，会话/订单只能靠这里收尾（路由侧懒过期覆盖不到
    不再回来的客户端）；随 worker 循环周期性执行，失败不影响任务处理。
    """
    from app.services.community import expire_stale_orders_bulk, expire_stale_sessions

    try:
        async with AsyncSessionLocal() as db:
            await expire_stale_sessions(db)
            await expire_stale_orders_bulk(db)
    except Exception:  # noqa: BLE001
        logger.exception("社区过期清扫失败（下一轮重试）")


class ProcessingWorker:
    """轮询 worker。生产部署用独立进程（python -m app.worker）；开发可内嵌。"""

    SWEEP_INTERVAL_SECONDS = 60.0

    def __init__(self, worker_id: str | None = None, poll_interval: float | None = None):
        self.worker_id = worker_id or _worker_id()
        self.poll_interval = poll_interval or settings.WORKER_POLL_INTERVAL
        self._stop = asyncio.Event()
        self._next_sweep = 0.0  # monotonic；0 = 首轮立即清扫一次

    def stop(self) -> None:
        self._stop.set()

    async def run_forever(self) -> None:
        logger.info(
            "processing worker 启动 | id=%s interval=%.1fs",
            self.worker_id,
            self.poll_interval,
        )
        try:
            while not self._stop.is_set():
                now = time.monotonic()
                if now >= self._next_sweep:
                    self._next_sweep = now + self.SWEEP_INTERVAL_SECONDS
                    await community_expiry_sweep()
                try:
                    task = await claim_next_task(self.worker_id)
                except Exception:  # noqa: BLE001
                    logger.exception("worker 领取任务失败（数据库不可达？）")
                    task = None
                if task is None:
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=self.poll_interval)
                    except asyncio.TimeoutError:
                        pass
                    continue
                await execute_task(task)
        finally:
            logger.info("processing worker 退出 | id=%s", self.worker_id)


async def run_single_pass(worker_id: str = "manual") -> int:
    """执行一轮领取（测试/运维手动驱动）。返回本轮执行的任务数。"""
    count = 0
    for _ in range(settings.WORKER_BATCH):
        task = await claim_next_task(worker_id)
        if task is None:
            break
        await execute_task(task)
        count += 1
    return count
