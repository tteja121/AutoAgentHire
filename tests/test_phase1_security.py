import os
import sys
import json
import pytest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from jose import jwt, JWTError
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Ensure root and backend directory are in path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "backend"))

from backend.config import validate_secret_key_value, settings
from backend.auth.jwt import create_access_token, decode_access_token
from backend.auth.dependencies import get_current_user
from backend.database.vector_store import VectorStoreManager
from backend.main import app


# ==============================================================================
# 1. HARD-CODED SECRETS ENFORCEMENT TESTS
# ==============================================================================

def test_secret_key_validation_rejects_missing_and_empty():
    with pytest.raises((ValueError, RuntimeError), match="SECRET_KEY environment variable is required"):
        validate_secret_key_value(None)
    with pytest.raises((ValueError, RuntimeError), match="SECRET_KEY environment variable is required"):
        validate_secret_key_value("")
    with pytest.raises((ValueError, RuntimeError), match="SECRET_KEY environment variable is required"):
        validate_secret_key_value("   ")


def test_secret_key_validation_rejects_short_secrets():
    short_secret = "short_secret_under_32_chars"
    with pytest.raises((ValueError, RuntimeError), match="must be at least 32 characters"):
        validate_secret_key_value(short_secret)


def test_secret_key_validation_rejects_known_placeholders():
    placeholders = [
        "your-secret-key-here-change-this",
        "dev-secret-change-in-production",
        "secret",
        "change_this_in_production_please",
        "12345678901234567890123456789012",
        "abcdefghijklmnopqrstuvwxyz123456"
    ]
    for placeholder in placeholders:
        with pytest.raises((ValueError, RuntimeError)):
            validate_secret_key_value(placeholder)


def test_secret_key_validation_accepts_strong_key():
    strong_key = "a" * 32 + "very_secure_random_production_key_12345"
    validated = validate_secret_key_value(strong_key)
    assert validated == strong_key


# ==============================================================================
# 2. AUTH BYPASS & TOKEN FORGERY TESTS
# ==============================================================================

class MockDbSession:
    """Mock DB session for get_current_user tests."""
    def __init__(self, user=None):
        self.user = user

    def query(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.user

    def add(self, obj):
        self.user = obj

    def commit(self):
        pass

    def refresh(self, obj):
        pass


class MockUser:
    def __init__(self, email, is_active=True, role="candidate"):
        self.id = 1
        self.email = email
        self.is_active = is_active
        self.role = role


def test_forged_backend_token_with_attacker_key_rejected():
    attacker_key = "attacker_secret_key_that_is_at_least_32_bytes_long!"
    forged_token = jwt.encode(
        {"sub": "victim@example.com", "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
        attacker_key,
        algorithm="HS256"
    )
    
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=forged_token, db=MockDbSession())
    assert exc_info.value.status_code == 401
    assert "Could not validate credentials" in exc_info.value.detail


def test_forged_backend_token_with_none_algorithm_rejected():
    import base64
    header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(b'{"sub":"victim@example.com"}').rstrip(b"=").decode()
    forged_token = f"{header}.{payload}."
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=forged_token, db=MockDbSession())
    assert exc_info.value.status_code == 401


def test_expired_backend_token_rejected():
    expired_token = create_access_token(
        data={"sub": "user@example.com"},
        expires_delta=timedelta(seconds=-10)
    )
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=expired_token, db=MockDbSession())
    assert exc_info.value.status_code == 401


def test_forged_backend_token_rejected():
    attacker_key = "attacker_controlled_secret_key_32_chars!"
    forged_token = jwt.encode(
        {
            "sub": "user@example.com",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15)
        },
        attacker_key,
        algorithm="HS256"
    )

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=forged_token, db=MockDbSession())
    assert exc_info.value.status_code == 401


def test_valid_backend_token_accepted():
    email = "legit_user@example.com"
    token = create_access_token(data={"sub": email})
    mock_user = MockUser(email=email, is_active=True)
    db = MockDbSession(user=mock_user)

    user = get_current_user(token=token, db=db)
    assert user.email == email


def test_mongodb_connection_status():
    from backend.database.mongo import mongo_manager
    ping = mongo_manager.ping()
    assert ping["database"] == "autoagenthire"
    assert "status" in ping


# ==============================================================================
# 3. CORS PRODUCTION RESTRICTIONS
# ==============================================================================

def test_cors_production_origin_policy():
    client = TestClient(app)
    
    # 1. Origin not in CORS_ORIGINS should not receive Access-Control-Allow-Origin
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://malicious-attacker-site.com",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.headers.get("access-control-allow-origin") != "https://malicious-attacker-site.com"

    # 2. Origin in allowed CORS origins receives header
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8080"


# ==============================================================================
# 4. SAFE DESERIALIZATION (NO PICKLE)
# ==============================================================================

def test_vector_store_safe_json_serialization(tmp_path):
    manager = VectorStoreManager()
    mapping_path = tmp_path / "resume_mapping.json"
    dummy_data = {0: 101, 1: 102}
    
    # Save mapping using VectorStoreManager safe json
    manager._save_mapping(dummy_data, mapping_path)
    assert mapping_path.exists(), "JSON mapping file should be created"
    
    # Confirm it is valid JSON and readable
    with open(mapping_path, "r", encoding="utf-8") as f:
        loaded = json.load(f)
    assert loaded["0"] == 101
    
    # Confirm loading back via _load_mapping
    result = manager._load_mapping(mapping_path)
    assert result[0] == 101
    assert result[1] == 102

    # Verify no pickle files are produced
    pickle_files = list(tmp_path.glob("*.pkl")) + list(tmp_path.glob("*.pickle"))
    assert len(pickle_files) == 0
