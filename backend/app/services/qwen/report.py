"""基于V3结构化结果，用QwenPlus生成管理员复核用的专业报告。

定位：V3 = 客观事实层；QwenPlus = 后台专业化表达层。
只做"解读"，绝不重算分数/档位；严格遵守筛查≠诊断等合规口径。
"""
from __future__ import annotations

from typing import Any

from app.services.qwen.client import QwenClient

SYSTEM_PROMPT = """你是心理评估报告助理，把V3客观测评数据整理成供授权管理员或专业人员复核的【后台专业报告】。

【铁律】
1. 抑郁/焦虑是筛查口径、非诊断；用词只用数据里的
   classification_label（无明显风险 / 需量表确认 / 高风险关注），禁"确诊/患有/病人"等表述。
2. 不重算、不改任何分数/档位。
3. 出现"需量表确认/高风险关注"时，必须附"建议结合专业量表/访谈/临床判断"。
4. 结尾完整保留免责声明（用 clinical_notice 原文）。

【输出格式】严格如下（正文 ≤300 字，免责声明另算）：
【状态总览】一句话：综合负荷(分数/等级) + 整体印象
【关键维度】4 行，每行：名称 分数 档位 — 一句解读
【筛查结果】抑郁/焦虑各一行：分类(分数) — 一句话
【建议】1-2 条简短可执行的调适建议
【免责声明】原文（定位 + 限制）

【语气】专业、客观、审慎，使用“该受测者/本次测评”，不得直接下诊断结论。只输出上述内容，不要多余寒暄。"""


def _screen_line(name: str, d: dict[str, Any]) -> str:
    return (
        f"  - {name}：分类={d.get('classification_label', '未知')}，"
        f"得分={d.get('score')}，置信度={d.get('classification_confidence_label', '未知')}"
    )


def _core_line(ci: dict[str, Any], key: str) -> str:
    d = ci.get(key) or {}
    grade = d.get("grade_label") or (d.get("level") or {}).get("label", "未知")
    return f"  - {d.get('name', key)}：得分={d.get('score')}，档位={grade}"


def build_user_prompt(
    summary: dict[str, Any],
    subject_context: dict[str, Any] | None = None,
) -> str:
    """把 V3 summary 的关键事实压缩成给 Qwen 的 user prompt。"""
    cs = summary.get("clinical_screening") or {}
    dep = cs.get("depression") or {}
    anx = cs.get("anxiety") or {}
    ov = summary.get("overall") or {}
    ci = summary.get("core_indicators") or {}
    notice = summary.get("clinical_notice") or {}
    overall_level = (ov.get("level") or {}).get("label", "未知")
    limitations = notice.get("limitations") or []
    if isinstance(limitations, list):
        lim_text = "\n".join(f"    - {x}" for x in limitations) or "    （无）"
    else:
        lim_text = f"    {limitations}"

    lines = [
        "以下是本次 V3 心理生理状态评估的结构化结果（事实层，仅作解读、勿重算）：",
        "",
        f"【综合状态负荷】得分={ov.get('score')}，等级={overall_level}",
        "",
        "【核心状态维度】",
        _core_line(ci, "stress_load"),
        _core_line(ci, "fatigue_recovery"),
        _core_line(ci, "physiological_arousal"),
        _core_line(ci, "attention_focus"),
        "",
        "【抑郁 / 焦虑筛查（筛查口径，非诊断）】",
        _screen_line("抑郁方向", dep),
        _screen_line("焦虑方向", anx),
        "",
        "【免责声明原文（必须完整保留在报告末尾）】",
        f"  定位：{notice.get('positioning', '（无）')}",
        "  限制：",
        lim_text,
    ]
    if subject_context:
        lines += ["", f"【被测者背景】{subject_context}"]
    lines += ["", "请按系统提示的格式与铁律生成后台专业报告。"]
    return "\n".join(lines)


async def generate_report(
    summary: dict[str, Any],
    subject_context: dict[str, Any] | None = None,
    client: QwenClient | None = None,
) -> str:
    """生成管理员复核用的后台专业报告（Markdown）。"""
    qwen = client or QwenClient()
    user_prompt = build_user_prompt(summary, subject_context)
    return await qwen.chat_complete(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.5,
        max_tokens=1000,
    )
