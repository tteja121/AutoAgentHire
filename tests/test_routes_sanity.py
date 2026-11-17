"""
Sanity tests verifying health, OpenAPI documentation, and core authentication routes are registered.
"""
from backend.main import app


def test_core_endpoints_registered():
    openapi_paths = set(app.openapi()["paths"].keys())

    # 1. Root & Health endpoints
    assert "/" in openapi_paths
    assert "/health" in openapi_paths

    # 2. Authentication endpoints
    assert "/auth/google" in openapi_paths
    assert "/auth/login" in openapi_paths
    assert "/auth/signup" in openapi_paths
    assert "/auth/me" in openapi_paths
    assert "/auth/logout" in openapi_paths
    assert "/auth/verify-otp" in openapi_paths
    assert "/auth/resend-otp" in openapi_paths

    # 3. Recruiter & Job endpoints
    assert "/api/recruiter/jobs" in openapi_paths
    assert "/api/recruiter/candidate/jobs" in openapi_paths
