"""基于V3结构化结果，用QwenPlus生成管理员复核用的专业报告。

定位：V3 = 客观事实层；QwenPlus = 后台专业化表达层。
只做"解读"，绝不重算分数/档位；严格遵守筛查≠诊断等合规口径。
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.services.qwen.client import QwenClient

PAGE_KEYS = ("overview", "screening", "core", "evidence")

SYSTEM_PROMPT = """你是航空从业人员心理状态辅助评估报告助理。你的任务是把给定的V3客观事实改写成四页报告顶部的通俗摘要。

【铁律】
1. 只能引用输入 facts 中明确存在的名称、档位、分类和可用状态；建议只能选用 allowed_actions，不得补充原因、症状、人格或适航判断。
2. 不重算、不修改数据，不新增任何数字；摘要正文不写数字，具体数值由下方专业卡片展示。
3. 抑郁和焦虑严格使用筛查口径，只能称为“筛查方向/筛查结果”；合作方返回“无明显风险”时可通俗表述为“正常（未见明显风险）”，禁止使用“确诊、患有、病人、异常、不健康”。
4. unavailable=true 时必须直说未采集或不建议解释，绝不推测。
5. 每页 summary 60—150个汉字，先说结果再解释含义；constraint 20—80个汉字，说明该页证据边界。
6. 可以说明“压力负荷、疲劳恢复、生理唤醒、视觉注意”等结果之间的并列关系，但不得推断因果关系。
7. 禁止使用“适航、不适航、胜任、不胜任、停飞”等自动岗位结论。

【输出】只输出合法JSON，不要Markdown代码块或其他文字：
{"schema_version":"qwen_page_summaries_v2","pages":{"overview":{"summary":"...","constraint":"..."},"screening":{"summary":"...","constraint":"..."},"core":{"summary":"...","constraint":"..."},"evidence":{"summary":"...","constraint":"..."}}}"""


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
    small = summary.get("small_indicators") or {}

    def compact_group(name: str) -> list[dict[str, Any]]:
        group = small.get(name) or {}
        out = []
        for key, item in list(group.items())[:16]:
            item = item if isinstance(item, dict) else {"value": item}
            level_data = item.get("level")
            level = level_data.get("label") if isinstance(level_data, dict) else None
            out.append(
                {
                    "key": key,
                    "name": item.get("name") or key,
                    "level": level
                    or item.get("grade_label")
                    or item.get("classification_label")
                    or "未提供",
                }
            )
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
        "core": {
            "stress_load": _core_line(ci, "stress_load"),
            "fatigue_recovery": _core_line(ci, "fatigue_recovery"),
            "physiological_arousal": _core_line(ci, "physiological_arousal"),
            ("visual_attention_status" if eye_status in {"not_collected", "not_collected_in_upload_report"} else "attention_focus"): _attention_line(summary, ci),
        },
        "screening": {
            "depression": _screen_line("抑郁方向筛查", dep),
            "anxiety": _screen_line("焦虑方向筛查", anx),
            "depression_reliability": dep.get("reliability"),
            "anxiety_reliability": anx.get("reliability"),
        },
        "evidence": {
            "au": compact_group("au"),
            "rppg": {"unavailable": rppg_gate.get("physiology_available") is False, "facts": compact_group("rppg")},
            "vibra": compact_group("vibra"),
            "eye": {"unavailable": eye_status in {"not_collected", "not_collected_in_upload_report"}, "facts": compact_group("eye_tracking")},
        },
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
    return {"schema_version": "qwen_page_summaries_v2", "source": "rule_fallback", "pages": {
        "overview": {"summary": f"本次抑郁方向筛查为{dep}，焦虑方向筛查为{anx}；压力负荷为{label('stress_load')}，疲劳恢复负荷为{label('fatigue_recovery')}，生理唤醒为{label('physiological_arousal')}。", "constraint": "筛查结果不是医学诊断，需结合量表、访谈及实际情况综合判断。"},
        "core": {"summary": f"核心状态中，压力负荷为{label('stress_load')}，疲劳恢复负荷为{label('fatigue_recovery')}，生理唤醒为{label('physiological_arousal')}；各项定义、分档依据和参考区间以下方合作方结果为准。", "constraint": "短时状态受测评情境和采集质量影响，不据此推断稳定人格或岗位胜任。"},
        "screening": {"summary": f"本次抑郁方向筛查为{dep}，焦虑方向筛查为{anx}。需要关注的分类应结合标准量表、访谈和近期实际情境进一步确认。", "constraint": "筛查不是诊断，严禁写作已患抑郁或焦虑。"},
        "evidence": {"summary": "本页保留AU面部动作与Vibra微振动依据；" + ("rPPG生理节律数据未通过解释条件；" if rppg_missing else "同时保留质量门控后的rPPG生理节律证据；") + ("眼动未采集。" if eye_missing else "并保留眼动代理证据。"), "constraint": "底层多模态指标只用于结果追溯，不能脱离核心分类与质量门控单独形成心理结论。"},
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
    forbidden = re.compile(r"确诊|患有|病人|异常|不健康|健康人|不适航|适航|停飞|不胜任|胜任")
    if data.get("schema_version") != "qwen_page_summaries_v2" or not isinstance(pages, dict):
        return None
    for key in PAGE_KEYS:
        page = pages.get(key)
        if not isinstance(page, dict):
            return None
        for field in ("summary", "constraint"):
            value = page.get(field)
            invalid_value = (
                not isinstance(value, str)
                or not value.strip()
                or len(value) > 180
                or forbidden.search(value)
            )
            if invalid_value or re.search(r"\d", value):
                return None
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
