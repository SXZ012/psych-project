"""V3 结果的 Pydantic 模型。

只建模业务「会消费」的核心字段，其余字段（modules / small_indicators 细节等）
通过 extra="allow" 透传，避免被庞大 schema 拖累。字段定义对照
《V3 算法服务对接指南》第 5、6 节。
"""
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Level(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str | None = None
    label: str | None = None
    color: str | None = None


class ScreeningItem(BaseModel):
    """抑郁 / 焦虑筛查项（筛查口径，非诊断）。"""
    model_config = ConfigDict(extra="allow")
    classification: str | None = None
    classification_label: str | None = None
    score: float | None = None


class ClinicalScreening(BaseModel):
    model_config = ConfigDict(extra="allow")
    depression: ScreeningItem = Field(default_factory=ScreeningItem)
    anxiety: ScreeningItem = Field(default_factory=ScreeningItem)


class Overall(BaseModel):
    """综合状态负荷指数。"""
    model_config = ConfigDict(extra="allow")
    score: float | None = None
    level: Level = Field(default_factory=Level)


class V3Summary(BaseModel):
    model_config = ConfigDict(extra="allow")
    schema_version: str | None = None
    algorithm_version: str | None = None
    clinical_screening: ClinicalScreening = Field(default_factory=ClinicalScreening)
    overall: Overall = Field(default_factory=Overall)
    # V3.2：rPPG 生理指标必须以该质量门控为准，false 时不得解释心率/HRV。
    rppg_quality_gate: dict[str, Any] = Field(default_factory=dict)


class V3Result(BaseModel):
    """V3 任务结果 wrapper（result 顶层）。"""
    model_config = ConfigDict(extra="allow")
    schema_version: str | None = None
    algorithm_version: str | None = None
    summary: V3Summary = Field(default_factory=V3Summary)
    timeline: dict[str, Any] | str | None = None
