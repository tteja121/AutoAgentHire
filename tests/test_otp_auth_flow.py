"""
Tests for AutoAgentHire Email OTP Registration & Verification Flow.
Verifies:
- Candidate registration persists unverified record
- No OTP codes or dev secrets exposed in frontend responses
- Verification endpoint returns 400 (not 404) for missing records
- Real email delivery mock tracks actual recipient
- Attempt lockout and expiration enforcement
- Invalidation of OTP after account activation
- Login restriction before activation, success after activation
- Resend rate limiting (60s)
"""

import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from unittest.mock import patch

from backend.main import app
from backend.database.connection import get_db, SessionLocal
from backend.database.models_complete import User
from backend.database.crud import UserRepository


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def cleanup_test_user(db: Session, email: str):
    clean = email.strip().lower()
    user = UserRepository.get_by_email(db, clean)
    if user:
        db.delete(user)
        db.commit()


def test_candidate_signup_persists_and_does_not_expose_otp(client: TestClient, db_session: Session):
    test_email = "otp_test_signup@example.com"
    cleanup_test_user(db_session, test_email)

    with patch("backend.services.email_service.send_signup_verification_code", return_value=True) as mock_send:
        resp = client.post(
            "/auth/signup",
            json={
                "email": test_email,
                "password": "SecurePassword123!",
                "fullName": "OTP Tester",
                "role": "candidate",
            },
        )

        assert resp.status_code == 201
        data = resp.json()

        # Acceptance Criteria: No dev_code or exposed OTP in response
        assert "dev_code" not in data or data.get("dev_code") is None
        assert data.get("requires_otp") is True
        assert data.get("status") == "pending_verification"
        assert "verification code is:" not in data.get("message", "").lower()

        # Acceptance Criteria: Email delivery invoked with user's actual email
        mock_send.assert_called_once()
        args = mock_send.call_args[0]
        assert args[0] == test_email
        assert args[1] == "OTP Tester"
        otp_sent = args[2]
        assert len(otp_sent) == 6
        assert otp_sent.isdigit()

        # Acceptance Criteria: User persisted in DB before verification begins
        user = UserRepository.get_by_email(db_session, test_email)
        assert user is not None
        assert user.is_verified is False
        assert user.email_verification_code == otp_sent
        assert user.email_verification_attempts == 0
        assert user.email_verification_expires_at is not None

    cleanup_test_user(db_session, test_email)


def test_login_blocked_before_verification(client: TestClient, db_session: Session):
    test_email = "otp_unverified_login@example.com"
    cleanup_test_user(db_session, test_email)

    # Register candidate
    with patch("backend.services.email_service.send_signup_verification_code", return_value=True):
        client.post(
            "/auth/signup",
            json={
                "email": test_email,
                "password": "SecurePassword123!",
                "fullName": "Unverified Candidate",
                "role": "candidate",
            },
        )

    # Try login before verifying OTP
    login_resp = client.post(
        "/auth/login",
        json={
            "email": test_email,
            "password": "SecurePassword123!",
            "role": "client",
        },
    )
    assert login_resp.status_code == 403
    assert "not verified" in login_resp.json().get("detail", "").lower()

    cleanup_test_user(db_session, test_email)


def test_verify_otp_missing_registration_returns_400_not_404(client: TestClient):
    # Testing that non-existent registration returns 400 Bad Request, NOT 404 Not Found
    resp = client.post(
        "/auth/verify-otp",
        json={"email": "non_existent_user_9988@example.com", "code": "123456"},
    )
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "no registration found" in detail.lower()


def test_verify_otp_invalid_code_and_attempt_limit(client: TestClient, db_session: Session):
    test_email = "otp_attempts@example.com"
    cleanup_test_user(db_session, test_email)

    with patch("backend.services.email_service.send_signup_verification_code", return_value=True):
        client.post(
            "/auth/signup",
            json={
                "email": test_email,
                "password": "SecurePassword123!",
                "fullName": "Attempt Tester",
                "role": "candidate",
            },
        )

    # Send 4 invalid codes
    for attempt in range(1, 5):
        resp = client.post(
            "/auth/verify-otp",
            json={"email": test_email, "code": "000000"},
        )
        assert resp.status_code == 400
        assert "invalid 6-digit verification code" in resp.json().get("detail", "").lower()

    # 5th invalid attempt
    resp5 = client.post(
        "/auth/verify-otp",
        json={"email": test_email, "code": "000000"},
    )
    assert resp5.status_code == 400
    assert "too many invalid attempts" in resp5.json().get("detail", "").lower()

    # 6th attempt is locked out
    resp6 = client.post(
        "/auth/verify-otp",
        json={"email": test_email, "code": "000000"},
    )
    assert resp6.status_code == 400
    assert "too many invalid attempts" in resp6.json().get("detail", "").lower()

    cleanup_test_user(db_session, test_email)


def test_verify_otp_expired_code(client: TestClient, db_session: Session):
    test_email = "otp_expired@example.com"
    cleanup_test_user(db_session, test_email)

    with patch("backend.services.email_service.send_signup_verification_code", return_value=True):
        client.post(
            "/auth/signup",
            json={
                "email": test_email,
                "password": "SecurePassword123!",
                "fullName": "Expired Tester",
                "role": "candidate",
            },
        )

    # Manually expire code
    user = UserRepository.get_by_email(db_session, test_email)
    assert user is not None
    code = user.email_verification_code
    user.email_verification_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.commit()

    resp = client.post(
        "/auth/verify-otp",
        json={"email": test_email, "code": code},
    )
    assert resp.status_code == 400
    assert "expired" in resp.json().get("detail", "").lower()

    cleanup_test_user(db_session, test_email)


def test_verify_otp_success_activates_account_and_allows_login(client: TestClient, db_session: Session):
    test_email = "otp_success@example.com"
    cleanup_test_user(db_session, test_email)

    with patch("backend.services.email_service.send_signup_verification_code", return_value=True):
        client.post(
            "/auth/signup",
            json={
                "email": test_email,
                "password": "SecurePassword123!",
                "fullName": "Success Candidate",
                "role": "candidate",
            },
        )

    user = UserRepository.get_by_email(db_session, test_email)
    valid_code = user.email_verification_code

    # Verify with correct OTP
    verify_resp = client.post(
        "/auth/verify-otp",
        json={"email": test_email, "code": valid_code},
    )
    assert verify_resp.status_code == 200
    data = verify_resp.json()
    assert "access_token" in data
    assert data["role"] == "candidate"

    # Verify DB state: account is active, OTP is invalidated
    db_session.refresh(user)
    assert user.is_verified is True
    assert user.email_verification_code is None
    assert user.email_verification_expires_at is None
    assert user.is_active is True

    # Login now works
    login_resp = client.post(
        "/auth/login",
        json={
            "email": test_email,
            "password": "SecurePassword123!",
            "role": "client",
        },
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

    cleanup_test_user(db_session, test_email)


def test_resend_otp_rate_limiting_and_new_code(client: TestClient, db_session: Session):
    test_email = "otp_resend@example.com"
    cleanup_test_user(db_session, test_email)

    with patch("backend.services.email_service.send_signup_verification_code", return_value=True):
        client.post(
            "/auth/signup",
            json={
                "email": test_email,
                "password": "SecurePassword123!",
                "fullName": "Resend Tester",
                "role": "candidate",
            },
        )

    # Immediate resend should trigger 429 rate limit
    with patch("backend.services.email_service.send_signup_verification_code", return_value=True):
        rate_resp = client.post("/auth/resend-otp", json={"email": test_email})
        assert rate_resp.status_code == 429
        assert "please wait" in rate_resp.json().get("detail", "").lower()

    # Move last_sent back 61 seconds to simulate cooldown passing
    user = UserRepository.get_by_email(db_session, test_email)
    orig_code = user.email_verification_code
    user.email_verification_last_sent_at = datetime.now(timezone.utc) - timedelta(seconds=65)
    db_session.commit()

    # Now resend should succeed
    with patch("backend.services.email_service.send_signup_verification_code", return_value=True) as mock_resend:
        success_resp = client.post("/auth/resend-otp", json={"email": test_email})
        assert success_resp.status_code == 200
        res_data = success_resp.json()
        assert res_data.get("status") == "success"
        assert "dev_code" not in res_data
        assert "verification code is:" not in res_data.get("message", "").lower()

        mock_resend.assert_called_once()
        new_code = mock_resend.call_args[0][2]
        assert new_code != orig_code
        assert len(new_code) == 6

        # Check DB updated
        db_session.refresh(user)
        assert user.email_verification_code == new_code
        assert user.email_verification_attempts == 0

    cleanup_test_user(db_session, test_email)
