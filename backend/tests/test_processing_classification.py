"""任务结局分类回归测试。

背景（2026-09-16 真机端到端事故）：run_assessment 返回
`str(AssessmentStatus.completed)` = 'AssessmentStatus.completed'，
不在终态集合里 → 成功被误判为处理故障 → 重试 → 结果表唯一约束冲突 →
任务 dead、状态被覆写 failed，报告页显示"暂未生成"。
本文件锁定：枚举成员与裸字符串都能正确分类。
"""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.services.processing as processing
from app.models.assessment import Assessment, AssessmentStatus, ProcessingTask


async def _run_with_outcome(db_engine, monkeypatch, outcome):
    """在测试库上执行 execute_task，并把 run_assessment 替换为返回指定结局。"""
    from app.db.base import get_db  # noqa: F401  # 确保 engine 注册

    maker = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    # processing 内部的 AsyncSessionLocal 指向测试库
    monkeypatch.setattr(processing, "AsyncSessionLocal", maker)

    async def _fake_run(assessment_id):  # noqa: ARG001
        return outcome

    monkeypatch.setattr(processing, "run_assessment", _fake_run)

    # 直接用 maker 造一个种子会话写数据
    async with maker() as seed:
        assessment = Assessment(name="分类测试", scene="aviation", status=AssessmentStatus.pending)
        seed.add(assessment)
        await seed.flush()
        task = ProcessingTask(
            assessment_id=assessment.id,
            scene="aviation",
            status="running",
            attempts=1,
            max_attempts=3,
        )
        seed.add(task)
        await seed.commit()
        task_id, assessment_id = task.id, assessment.id

    await processing.execute_task(
        ProcessingTask(id=task_id, assessment_id=assessment_id, attempts=1)
    )
    async with maker() as check:
        fresh = await check.get(ProcessingTask, task_id)
        return fresh, assessment_id


@pytest.mark.parametrize(
    "outcome",
    [
        AssessmentStatus.completed,   # 事故根因：枚举成员
        "completed",                  # 裸字符串（修复后 run_assessment 的返回）
        AssessmentStatus.invalid_result,
        "qa_failed",
    ],
)
async def test_terminal_outcomes_mark_task_done(db_engine, monkeypatch, outcome):
    fresh, _ = await _run_with_outcome(db_engine, monkeypatch, outcome)
    assert fresh is not None
    assert fresh.status == "done", f"终态 {outcome!r} 应记 done，实际 {fresh.status}"


async def test_failure_outcome_schedules_retry(db_engine, monkeypatch):
    fresh, _ = await _run_with_outcome(db_engine, monkeypatch, "failed")
    assert fresh is not None
    assert fresh.status == "failed"      # 额度内退避重试
    assert fresh.attempts == 1
    assert fresh.last_error


async def test_enum_failure_not_misclassified(db_engine, monkeypatch):
    """枚举失败（极端防御）：不得因 str(enum) 前缀匹配而误判为成功。"""
    fresh, _ = await _run_with_outcome(db_engine, monkeypatch, AssessmentStatus.failed)
    assert fresh is not None
    assert fresh.status == "failed"
