import uuid
from datetime import datetime, timezone

from app.schemas.assessment import AssessmentOut


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
