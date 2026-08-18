"""基于V3结构化结果，用QwenPlus生成管理员复核用的专业报告。

定位：V3 = 客观事实层；QwenPlus = 后台专业化表达层。
只做"解读"，绝不重算分数/档位；严格遵守筛查≠诊断等合规口径。
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.services.qwen.client import QwenClient

PAGE_KEYS = ("overview", "au", "rppg", "vibra", "eye")

SYSTEM_PROMPT = """你是心理评估报告助理。你的唯一任务，是把给定的V3客观事实改写成五页报告顶部的通俗摘要。

【铁律】
1. 只能引用输入 facts 中明确存在的名称、档位、分类和可用状态，不得补充原因、症状、人格、风险或建议。
2. 不重算、不修改数据，不新增任何数字；摘要正文不写数字，具体数值由下方专业卡片展示。
3. 抑郁和焦虑严格使用筛查口径，只能称为“筛查方向/筛查结果”，禁止使用“确诊、患有、病人、正常、异常、健康、不健康”。
4. unavailable=true 时必须直说未采集或不建议解释，绝不推测。
5. 每页 summary 40—100个汉字，通俗客观；constraint 20—70个汉字，说明该页证据边界。

【输出】只输出合法JSON，不要Markdown代码块或其他文字：
{"schema_version":"qwen_page_summaries_v1","pages":{"overview":{"summary":"...","constraint":"..."},"au":{"summary":"...","constraint":"..."},"rppg":{"summary":"...","constraint":"..."},"vibra":{"summary":"...","constraint":"..."},"eye":{"summary":"...","constraint":"..."}}}"""


def _screen_line(name: str, d: dict[str, Any]) -> str:
    return (
        f"  - {name}：分类={d.get('classification_label', '未知')}，"
        f"得分={d.get('score')}，置信度={d.get('classification_confidence_label', '未知')}"
    )


def _core_line(ci: dict[str, Any], key: str) -> str:
    d = ci.get(key) or {}
    grade = d.get("grade_label") or (d.get("level") or {}).get("label", "未知")
    return f"  - {d.get('name', key)}：得分={d.get('score')}，档位={grade}"


def _attention_line(summary: dict[str, Any], ci: dict[str, Any]) -> str:
    """V3.2 上传报告未带 gaze JSON 时，禁止把视觉注意解释成实际测得结果。"""
    eye_status = ((summary.get("modules") or {}).get("eye_tracking") or {}).get("status")
    if eye_status in {"not_collected", "not_collected_in_upload_report"}:
        return "  - 视觉注意：本次未采集眼动 / gaze 数据，不输出视觉注意力评分或解释。"
    return _core_line(ci, "attention_focus")


def build_user_prompt(
    summary: dict[str, Any],
    subject_context: dict[str, Any] | None = None,
) -> str:
    """把 V3 summary 压缩成按页事实白名单，避免模型接触无关字段。"""
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

    small = summary.get("small_indicators") or {}
    def compact_group(name: str) -> list[dict[str, Any]]:
        group = small.get(name) or {}
        out = []
        for key, item in list(group.items())[:16]:
            item = item if isinstance(item, dict) else {"value": item}
            level = (item.get("level") or {}).get("label") if isinstance(item.get("level"), dict) else None
            out.append({"key": key, "name": item.get("name") or key, "level": level or item.get("grade_label") or item.get("classification_label") or "未提供"})
        return out

    eye_status = ((summary.get("modules") or {}).get("eye_tracking") or {}).get("status")
    rppg_gate = summary.get("rppg_quality_gate") or {}
    facts = {
        "overview": {
            "overall_score": ov.get("score"),
            "overall_level": overall_level,
            "depression_screening": dep.get("classification_label", "未知"),
            "anxiety_screening": anx.get("classification_label", "未知"),
            "core_dimensions": [
                _core_line(ci, "stress_load"), _core_line(ci, "fatigue_recovery"),
                _core_line(ci, "physiological_arousal"), _attention_line(summary, ci),
            ],
        },
        "au": {"facts": compact_group("au")},
        "rppg": {"unavailable": rppg_gate.get("physiology_available") is False, "facts": compact_group("rppg")},
        "vibra": {"facts": compact_group("vibra")},
        "eye": {"unavailable": eye_status in {"not_collected", "not_collected_in_upload_report"}, "facts": compact_group("eye_tracking")},
        "clinical_positioning": notice.get("positioning", "心理生理状态辅助评估，不作为独立诊断依据。"),
    }
    lines = ["以下JSON是本次报告唯一允许引用的事实白名单：", json.dumps(facts, ensure_ascii=False), "【免责声明约束】各页 constraint 必须遵守 clinical_positioning。"]
    if subject_context:
        lines += ["", f"【被测者背景】{subject_context}"]
    lines += ["", "请按系统提示的格式与铁律生成后台专业报告。"]
    return "\n".join(lines)


def _fallback_report(summary: dict[str, Any]) -> dict[str, Any]:
    """模型输出不可用时的保守兜底；不产生新的心理学结论。"""
    cs = summary.get("clinical_screening") or {}
    core = summary.get("core_indicators") or {}
    def label(key: str) -> str:
        item = core.get(key) or {}
        return item.get("grade_label") or (item.get("level") or {}).get("label") or "未提供"
    dep = (cs.get("depression") or {}).get("classification_label", "未知")
    anx = (cs.get("anxiety") or {}).get("classification_label", "未知")
    eye_status = ((summary.get("modules") or {}).get("eye_tracking") or {}).get("status")
    eye_missing = eye_status in {"not_collected", "not_collected_in_upload_report"}
    rppg_missing = (summary.get("rppg_quality_gate") or {}).get("physiology_available") is False
    return {"schema_version": "qwen_page_summaries_v1", "source": "rule_fallback", "pages": {
        "overview": {"summary": f"本次抑郁方向筛查为{dep}，焦虑方向筛查为{anx}；压力负荷为{label('stress_load')}，疲劳恢复负荷为{label('fatigue_recovery')}，生理唤醒为{label('physiological_arousal')}。", "constraint": "筛查结果不是医学诊断，需结合量表、访谈及实际情况综合判断。"},
        "au": {"summary": "本页依据合作方返回的面部动作指标，概括测试过程中面部活动的强弱与变化。具体结果以下方专业卡片为准。", "constraint": "面部动作不等同于具体情绪，也不能单独用于心理诊断。"},
        "rppg": {"summary": "本次生理节律数据不建议解释。" if rppg_missing else "本页依据质量门控后的心率、心率变异性和信号质量，概括测试期间的生理节律变化。", "constraint": "rPPG为视频估算结果，受光照、头动和信号质量影响。"},
        "vibra": {"summary": "本页依据合作方返回的微振动聚合指标，概括测试期间身体微小运动所反映的状态变化。", "constraint": "单项微振动特征不能直接解释为具体症状或诊断结论。"},
        "eye": {"summary": "本次未采集可用于正式解释的眼动数据。" if eye_missing else "本页依据有效眼动比例和注意稳定性，概括测试期间的注视分布。", "constraint": "未采集时不作推测；视频级眼动线索不等同于专业眼动仪结果。"},
    }}


def _validate_model_report(text: str) -> dict[str, Any] | None:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I)
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    pages = data.get("pages") if isinstance(data, dict) else None
    forbidden = re.compile(r"确诊|患有|病人|正常|异常|不健康|健康人")
    if data.get("schema_version") != "qwen_page_summaries_v1" or not isinstance(pages, dict):
        return None
    for key in PAGE_KEYS:
        page = pages.get(key)
        if not isinstance(page, dict): return None
        for field in ("summary", "constraint"):
            value = page.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > 180 or forbidden.search(value): return None
            if re.search(r"\d", value): return None
    data["source"] = "qwen_constrained"
    return data


async def generate_report(
    summary: dict[str, Any],
    subject_context: dict[str, Any] | None = None,
    client: QwenClient | None = None,
) -> str:
    """生成管理员复核用的后台专业报告（Markdown）。"""
    qwen = client or QwenClient()
    user_prompt = build_user_prompt(summary, subject_context)
    raw = await qwen.chat_complete(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
        max_tokens=1200,
    )
    report = _validate_model_report(raw) or _fallback_report(summary)
    return json.dumps(report, ensure_ascii=False)
