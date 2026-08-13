import uuid
from datetime import datetime, timezone

from app.schemas.assessment import AssessmentOut, AssessmentResultOut


def test_assessment_response_masks_id_card_and_does_not_expose_video_key() -> None:
    payload = AssessmentOut(
        id=uuid.uuid4(),
        name="测试用户",
        id_card="110101199001011234",
        status="pending",
        provider_mode="mock",
        created_at=datetime.now(timezone.utc),
    ).model_dump()
    assert payload["id_card"] == "110***********1234"
    assert "video_storage_key" not in payload


def test_assessment_result_exposes_v32_timeline_evidence() -> None:
    timeline = {
        "display_payload": {
            "au_event_frames": {"candidate_frames": []},
            "rppg_waveforms": {"quality_gate": {"physiology_available": True}},
        }
    }
    payload = AssessmentResultOut(
        algorithm_version="v3_20260724.1",
        summary_json={"schema_version": "report_json_v0.1"},
        timeline_json=timeline,
    ).model_dump()

    assert payload["timeline_json"] == timeline
