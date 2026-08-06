from fastapi import HTTPException

from app.core.admin_auth import create_admin_session, require_admin_session


def test_admin_session_round_trip() -> None:
    token = create_admin_session()
    assert require_admin_session(token) == token


def test_missing_admin_session_is_rejected() -> None:
    try:
        require_admin_session(None)
    except HTTPException as exc:
        assert exc.status_code == 401
    else:  # pragma: no cover - defensive assertion
        raise AssertionError("missing session should be rejected")
