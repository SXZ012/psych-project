from app.services.qwen.report import build_user_prompt, generate_report

SAMPLE_SUMMARY = {
    "overall": {"score": 64.61, "level": {"label": "偏高"}},
    "core_indicators": {
        "stress_load": {"name": "压力/唤醒负荷", "score": 70, "grade_label": "偏高"},
        "fatigue_recovery": {"name": "疲劳/恢复负荷", "score": 40, "grade_label": "偏低"},
        "physiological_arousal": {"name": "生理唤醒线索", "score": 60, "grade_label": "参考范围"},
        "attention_focus": {"name": "视觉注意力", "score": 55, "grade_label": "正常"},
    },
    "clinical_screening": {
        "depression": {
            "classification_label": "无明显风险",
            "score": 4.27,
            "classification_confidence_label": "高",
        },
        "anxiety": {
            "classification_label": "无明显风险",
            "score": 35.71,
            "classification_confidence_label": "中",
        },
    },
    "clinical_notice": {
        "positioning": "心理生理状态辅助评估，不作为独立诊断依据。",
        "limitations": ["示例限制一", "示例限制二"],
    },
}


class _FakeQwenClient:
    def __init__(self) -> None:
        self.last_messages: list[dict] | None = None

    async def chat_complete(self, messages, *, model=None, temperature=0.7, max_tokens=None):
        self.last_messages = messages
        return "# 心理状态解读\n（测试用占位报告）"


def test_build_prompt_contains_key_facts():
    prompt = build_user_prompt(SAMPLE_SUMMARY)
    assert "64.61" in prompt
    assert "无明显风险" in prompt
    assert "压力/唤醒负荷" in prompt
    assert "免责声明" in prompt  # 合规块在场


async def test_generate_report_uses_client_and_returns_text():
    fake = _FakeQwenClient()
    report = await generate_report(SAMPLE_SUMMARY, client=fake)
    assert "测试用占位报告" in report
    assert fake.last_messages is not None
    # system 在前、user 在后，且 system 含合规铁律
    assert fake.last_messages[0]["role"] == "system"
    assert "筛查口径" in fake.last_messages[0]["content"]
    assert fake.last_messages[1]["role"] == "user"
    assert "64.61" in fake.last_messages[1]["content"]
