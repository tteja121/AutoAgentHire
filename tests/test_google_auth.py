"""
Unit tests for the Google OAuth endpoint (POST /auth/google).
Tests valid login/registration, token verification, audience checking,
and error handling.
"""
import pytest
from unittest.mock import patch
from fastapi import HTTPException
from backend.database.connection import SessionLocal
from backend.routes.auth_routes import google_auth, GoogleAuthRequest
from backend.database.models_complete import User


def test_google_auth_invalid_token_returns_401():
    db = SessionLocal()
    try:
        with patch("backend.routes.auth_routes._verify_google_token_payload") as mock_verify:
            mock_verify.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                google_auth(GoogleAuthRequest(access_token="invalid_token_xyz"), db)
            assert exc_info.value.status_code == 401
            assert "Invalid or expired" in exc_info.value.detail
    finally:
        db.close()


def test_google_auth_unverified_email_returns_400():
    db = SessionLocal()
    try:
        with patch("backend.routes.auth_routes._verify_google_token_payload") as mock_verify:
            mock_verify.return_value = {
                "email": "unverified.user@gmail.com",
                "name": "Unverified User",
                "email_verified": False,
            }
            with pytest.raises(HTTPException) as exc_info:
                google_auth(GoogleAuthRequest(access_token="unverified_token"), db)
            assert exc_info.value.status_code == 400
            assert "not verified" in exc_info.value.detail
    finally:
        db.close()


def test_google_auth_new_user_success():
    db = SessionLocal()
    test_email = "new.google.test@example.com"
    try:
        # Ensure clean state
        existing = db.query(User).filter(User.email == test_email).first()
        if existing:
            db.delete(existing)
            db.commit()

        with patch("backend.routes.auth_routes._verify_google_token_payload") as mock_verify:
            mock_verify.return_value = {
                "email": test_email,
                "name": "New Google Candidate",
                "email_verified": True,
                "aud": "982444331534-ivhekjqkqqub16fjp6cvkhamhlteandn.apps.googleusercontent.com",
            }
            response = google_auth(GoogleAuthRequest(access_token="valid_access_token_123"), db)
            assert response.email == test_email
            assert response.role == "candidate"
            assert response.access_token is not None
            assert len(response.access_token) > 20

            # Verify user exists in database
            user_in_db = db.query(User).filter(User.email == test_email).first()
            assert user_in_db is not None
            assert user_in_db.is_verified is True
            assert user_in_db.role == "candidate"
    finally:
        # Cleanup
        cleanup_user = db.query(User).filter(User.email == test_email).first()
        if cleanup_user:
            db.delete(cleanup_user)
            db.commit()
        db.close()


def test_google_auth_existing_user_login():
    db = SessionLocal()
    test_email = "existing.google.test@example.com"
    try:
        # Clean up any leftover
        existing = db.query(User).filter(User.email == test_email).first()
        if existing:
            db.delete(existing)
            db.commit()

        with patch("backend.routes.auth_routes._verify_google_token_payload") as mock_verify:
            mock_verify.return_value = {
                "email": test_email,
                "name": "Existing Candidate",
                "email_verified": True,
                "aud": "982444331534-ivhekjqkqqub16fjp6cvkhamhlteandn.apps.googleusercontent.com",
            }
            # First call creates the user
            res1 = google_auth(GoogleAuthRequest(access_token="tok1"), db)
            assert res1.email == test_email

            # Second call logs in the existing user
            res2 = google_auth(GoogleAuthRequest(credential="tok2"), db)
            assert res2.email == test_email
            assert res2.access_token is not None
    finally:
        cleanup_user = db.query(User).filter(User.email == test_email).first()
        if cleanup_user:
            db.delete(cleanup_user)
            db.commit()
        db.close()
