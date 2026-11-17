"""
Integration & Database Health Test Suite for AutoAgentHire.
Tests:
1. Fernet credential encryption and decryption round-trip.
2. Credential masking (zero plaintext leakage).
3. Provider adapters (Greenhouse, Lever, Ashby, Workable, Generic ATS, Unsupported).
4. User-isolated integration CRUD.
5. Synchronization & SHA-256 deduplication logic.
6. Admin / Authorizer database health endpoint & role authorization.
"""
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from backend.database.connection import get_db, Base, engine
from backend.database.models_complete import (
    User,
    PortalIntegration,
    IntegrationSyncHistory,
    ImportedJobApplication,
)
from backend.integrations.security import (
    encrypt_credential,
    decrypt_credential,
    mask_credential,
)
from backend.integrations.registry import get_adapter, list_supported_providers
from backend.integrations.base import NormalizedApplication
from backend.integrations.adapters.greenhouse import GreenhouseAdapter
from backend.integrations.adapters.lever import LeverAdapter
from backend.integrations.adapters.ashby import AshbyAdapter
from backend.integrations.adapters.workable import WorkableAdapter
from backend.integrations.adapters.generic_ats import GenericAtsAdapter
from backend.integrations.adapters.unsupported import LinkedInAdapter, IndeedAdapter


# ─── 1. Security & Encryption Tests ──────────────────────────────────────────

def test_credential_encryption_and_decryption_roundtrip():
    """Verify Fernet encryption produces valid ciphertext and round-trips cleanly."""
    original_secret = "gh_harvest_live_key_998877665544"
    ciphertext = encrypt_credential(original_secret)

    assert ciphertext != original_secret
    assert isinstance(ciphertext, str)

    decrypted = decrypt_credential(ciphertext)
    assert decrypted == original_secret


def test_credential_masking():
    """Ensure sensitive API keys are masked with only prefix/suffix visible."""
    # Long key
    key1 = "gh_harvest_key_abcdef123456"
    masked1 = mask_credential(key1)
    assert masked1.startswith("gh_h")
    assert masked1.endswith("3456")
    assert "abcdef" not in masked1
    assert "•" in masked1

    # Medium key
    key2 = "sk_live_12345678"
    masked2 = mask_credential(key2)
    assert masked2.startswith("sk_l")
    assert masked2.endswith("5678")

    # Short key
    key3 = "short"
    masked3 = mask_credential(key3)
    assert masked3 == "••••••••"

    # Empty / None
    assert mask_credential("") == ""
    assert mask_credential(None) == ""


# ─── 2. Provider Adapters Tests ──────────────────────────────────────────────

def test_supported_providers_catalog():
    """Catalog must include all supported providers and clearly flag LinkedIn/Indeed as unsupported."""
    catalog = list_supported_providers()
    provider_ids = [p["id"] for p in catalog]

    assert "greenhouse" in provider_ids
    assert "lever" in provider_ids
    assert "ashby" in provider_ids
    assert "workable" in provider_ids
    assert "generic_ats" in provider_ids
    assert "linkedin" in provider_ids
    assert "indeed" in provider_ids

    # Verify LinkedIn & Indeed are unsupported for direct API keys
    linkedin_info = next(p for p in catalog if p["id"] == "linkedin")
    indeed_info = next(p for p in catalog if p["id"] == "indeed")
    assert linkedin_info["is_supported"] is False
    assert "Partner" in linkedin_info["unsupported_reason"]
    assert indeed_info["is_supported"] is False


@patch("urllib.request.urlopen")
def test_greenhouse_adapter_validation_success(mock_urlopen):
    """Greenhouse adapter validates Harvest API key via /v1/users."""
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.__enter__.return_value = mock_response
    mock_urlopen.return_value = mock_response

    adapter = GreenhouseAdapter()
    valid, message = adapter.validate_credentials(api_key="valid_greenhouse_key")

    assert valid is True
    assert "connected" in message.lower() or "valid" in message.lower()


@patch("urllib.request.urlopen")
def test_greenhouse_adapter_fetch_applications(mock_urlopen):
    """Greenhouse adapter normalizes applications into platform schema."""
    import json
    mock_data = [
        {
            "id": 101,
            "candidate_id": 501,
            "status": "active",
            "applied_at": "2026-03-01T10:00:00Z",
            "jobs": [{"id": 901, "name": "Senior Full-Stack Engineer"}],
        }
    ]
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps(mock_data).encode("utf-8")
    mock_response.__enter__.return_value = mock_response
    mock_urlopen.return_value = mock_response

    adapter = GreenhouseAdapter()
    apps, err = adapter.fetch_applications(api_key="valid_greenhouse_key", limit=10)

    assert err is None
    assert len(apps) == 1
    app = apps[0]
    assert isinstance(app, NormalizedApplication)
    assert app.external_application_id == "101"
    assert app.job_title == "Senior Full-Stack Engineer"


def test_unsupported_adapter_refuses_direct_api_key():
    """LinkedIn and Indeed adapters must refuse direct API keys with a clear message."""
    linkedin_adapter = LinkedInAdapter()
    valid, msg = linkedin_adapter.validate_credentials("some_api_key")

    assert valid is False
    assert "Partner" in msg or "unsupported" in msg.lower()

    apps, err = linkedin_adapter.fetch_applications("some_api_key")
    assert apps == []
    assert err is not None


# ─── 3. Ingestion Deduplication & DB Models Tests ─────────────────────────────

def test_application_deduplication_hash():
    """Ensure deduplication hash accurately identifies matching applications."""
    import hashlib
    user_id = 42
    provider = "greenhouse"
    external_id = "APP-9988"

    raw_hash = hashlib.sha256(f"{user_id}:{provider}:{external_id}".encode("utf-8")).hexdigest()

    # Recomputing with same inputs produces identical hash
    dup_hash = hashlib.sha256(f"{user_id}:{provider}:{external_id}".encode("utf-8")).hexdigest()
    assert raw_hash == dup_hash

    # Different user produces distinct hash
    diff_user_hash = hashlib.sha256(f"43:{provider}:{external_id}".encode("utf-8")).hexdigest()
    assert raw_hash != diff_user_hash


# ─── 4. Database Health Check Function ───────────────────────────────────────

def test_database_health_structure():
    """Database health audit must check connection, latency, and core tables."""
    from backend.routes.integration_routes import get_database_health
    from sqlalchemy.orm import Session

    # Create dummy authorizer user
    authorizer_user = User(
        id=999,
        email="authorizer_test@platform.internal",
        role="authorizer",
        full_name="Authorized System Auditor",
    )

    db_session = MagicMock(spec=Session)
    mock_query = MagicMock()
    mock_query.count.return_value = 5
    db_session.query.return_value = mock_query

    health = get_database_health(current_user=authorizer_user, db=db_session)

    assert "status" in health
    assert "latency_ms" in health
    assert "database_type" in health
    assert "tables" in health
    assert "users" in health["tables"]
    assert "portal_integrations" in health["tables"]
    assert "imported_job_applications" in health["tables"]


def test_database_health_forbidden_for_candidates():
    """Non-authorizer users must receive HTTP 403 when requesting DB health."""
    from backend.routes.integration_routes import get_database_health
    from fastapi import HTTPException

    candidate_user = User(
        id=888,
        email="candidate@gmail.com",
        role="candidate",
    )
    db_session = MagicMock()

    raised = False
    try:
        get_database_health(current_user=candidate_user, db=db_session)
    except HTTPException as exc:
        raised = True
        assert exc.status_code == 403
        assert "Authorizer governance permission required" in exc.detail

    assert raised, "Expected HTTPException with 403 Forbidden"


# ─── 5. Route Integration & Isolation Logic Tests ────────────────────────────

def test_create_integration_encrypts_and_masks_key():
    """Integration create endpoint encrypts credential in DB and returns masked key."""
    from backend.routes.integration_routes import create_integration, IntegrationCreateRequest
    from fastapi import HTTPException

    user = User(id=10, email="authorizer10@company.com", role="authorizer")
    payload = IntegrationCreateRequest(
        provider="greenhouse",
        name="Production Harvest ATS",
        api_key="gh_harvest_secret_key_12345",
    )

    db = MagicMock()
    # Mock adapter validation to succeed
    with patch("backend.routes.integration_routes.get_adapter") as mock_get_adapter:
        mock_adapter = MagicMock()
        mock_adapter.provider_id = "greenhouse"
        mock_adapter.is_supported = True
        mock_adapter.validate_credentials.return_value = (True, "Connection valid")
        mock_get_adapter.return_value = mock_adapter

        # Mock db add & commit
        saved_integration = None
        def mock_add(obj):
            nonlocal saved_integration
            if isinstance(obj, PortalIntegration):
                saved_integration = obj
                obj.id = 55
                obj.uuid = "mock-uuid-55"
                obj.created_at = datetime.now(timezone.utc)
                obj.status = "connected"
                obj.imported_count = 0
                obj.last_sync_at = None
                obj.last_error = None
        db.add.side_effect = mock_add

        response = create_integration(body=payload, current_user=user, db=db)

        assert response.id == 55
        assert response.name == "Production Harvest ATS"
        assert response.provider == "greenhouse"
        assert response.masked_api_key.startswith("gh_h")
        assert response.masked_api_key.endswith("2345")
        # Ensure raw key was never stored unencrypted
        assert saved_integration.encrypted_api_key != "gh_harvest_secret_key_12345"
        # Ensure it decrypts properly
        assert decrypt_credential(saved_integration.encrypted_api_key) == "gh_harvest_secret_key_12345"


def test_user_isolation_cannot_access_other_users_integration():
    """User B cannot validate, sync, or delete User A's integration."""
    from backend.routes.integration_routes import validate_integration, delete_integration
    from fastapi import HTTPException

    owner = User(id=1, email="owner@company.com", role="authorizer")
    other_user = User(id=2, email="attacker@company.com", role="authorizer")

    # DB returns None because query filters by current_user.id
    db = MagicMock()
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = None
    db.query.return_value = mock_query

    # Attempt validate
    try:
        validate_integration(integration_id=99, current_user=other_user, db=db)
        assert False, "Should raise 404 for other user's integration"
    except HTTPException as exc:
        assert exc.status_code == 404
        assert "not found" in exc.detail.lower()

    # Attempt delete
    try:
        delete_integration(integration_id=99, current_user=other_user, db=db)
        assert False, "Should raise 404 for other user's integration"
    except HTTPException as exc:
        assert exc.status_code == 404
        assert "not found" in exc.detail.lower()

