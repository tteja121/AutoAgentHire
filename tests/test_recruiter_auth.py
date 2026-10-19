"""
Recruiter Authentication and Authorization Integration Tests.

Validates:
- 401 Unauthorized when no credentials or invalid/expired tokens are supplied.
- 403 Forbidden when non-recruiters or unapproved recruiters access endpoints.
- 403 / 404 isolation when recruiters attempt to access other recruiters' jobs.
- 200 OK for authorized recruiters updating status or deleting their own jobs.
"""

import sys
from pathlib import Path
import pytest
from jose import jwt
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.main import app  # noqa: E402
from backend.auth.jwt import create_access_token  # noqa: E402
from backend.database.connection import get_db_session  # noqa: E402
from backend.database.models_complete import (  # noqa: E402
    User,
    JobPosting,
    JobApplication,
)

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_recruiter_test_data():
    """Create test recruiters, candidate, job posting, and application."""
    with get_db_session() as session:
        def get_or_create(email, role, full_name, company=None, status="approved"):
            u = session.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    email=email,
                    hashed_password="pbkdf2_sha256$test_dummy_hash",
                    role=role,
                    full_name=full_name,
                    company_name=company,
                    is_active=True,
                    is_verified=True,
                    approval_status=status,
                )
                session.add(u)
                session.commit()
                session.refresh(u)
            return u

        recruiter_a = get_or_create(
            "recruiter_auth_a@corp.test",
            "recruiter",
            "Recruiter Auth A",
            "Corp A",
            "approved",
        )
        recruiter_b = get_or_create(
            "recruiter_auth_b@corp.test",
            "recruiter",
            "Recruiter Auth B",
            "Corp B",
            "approved",
        )
        recruiter_pending = get_or_create(
            "recruiter_auth_pending@corp.test",
            "recruiter",
            "Recruiter Pending",
            "Corp P",
            "pending",
        )
        candidate = get_or_create(
            "candidate_auth_test@applicant.test",
            "candidate",
            "Candidate Tester",
            None,
            "approved",
        )

        # Job posting belonging to recruiter_a
        job_a = (
            session.query(JobPosting)
            .filter(JobPosting.title == "Auth Test Backend Engineer")
            .first()
        )
        if not job_a:
            job_a = JobPosting(
                recruiter_id=recruiter_a.id,
                company_name="Corp A",
                title="Auth Test Backend Engineer",
                salary_description="$140k - $170k",
                description="Backend engineer auth test posting.",
                location="Remote",
                job_type="Full-time",
                status="published",
                requirements="Python, FastAPI",
                start_date_pt="2026-10-01 09:00:00 PDT",
                final_date_pt="2026-12-31 17:00:00 PDT",
            )
            session.add(job_a)
            session.commit()
            session.refresh(job_a)

        # Job posting belonging to recruiter_b
        job_b = (
            session.query(JobPosting)
            .filter(JobPosting.title == "Auth Test Frontend Engineer")
            .first()
        )
        if not job_b:
            job_b = JobPosting(
                recruiter_id=recruiter_b.id,
                company_name="Corp B",
                title="Auth Test Frontend Engineer",
                salary_description="$130k - $160k",
                description="Frontend engineer auth test posting.",
                location="Remote",
                job_type="Full-time",
                status="published",
                requirements="React, TypeScript",
                start_date_pt="2026-10-01 09:00:00 PDT",
                final_date_pt="2026-12-31 17:00:00 PDT",
            )
            session.add(job_b)
            session.commit()
            session.refresh(job_b)

        # Application for Job A
        app_a = (
            session.query(JobApplication)
            .filter(
                JobApplication.job_posting_id == job_a.id,
                JobApplication.candidate_email == candidate.email,
            )
            .first()
        )
        if not app_a:
            app_a = JobApplication(
                candidate_id=candidate.id,
                candidate_name=str(candidate.full_name or "Candidate Tester"),
                candidate_email=str(candidate.email),
                job_posting_id=job_a.id,
                status="applied",
            )
            session.add(app_a)
            session.commit()
            session.refresh(app_a)

        yield {
            "recruiter_a": recruiter_a,
            "recruiter_b": recruiter_b,
            "recruiter_pending": recruiter_pending,
            "candidate": candidate,
            "job_a": job_a,
            "job_b": job_b,
            "app_a": app_a,
        }


def test_put_application_status_unauthenticated_rejected(
    setup_recruiter_test_data,
):
    """PUT status without token must return 401 Unauthorized."""
    app_id = setup_recruiter_test_data["app_a"].id
    res = client.put(
        f"/api/recruiter/applications/{app_id}/status",
        json={"status": "interview"},
    )
    assert res.status_code == 401


def test_put_application_status_forged_token_rejected(
    setup_recruiter_test_data,
):
    """PUT status with token signed by wrong secret must return 401."""
    app_id = setup_recruiter_test_data["app_a"].id
    forged = jwt.encode(
        {"sub": "recruiter_auth_a@corp.test"},
        "wrong_secret_key_that_is_32_bytes_long!",
        algorithm="HS256",
    )
    res = client.put(
        f"/api/recruiter/applications/{app_id}/status",
        json={"status": "interview"},
        headers={"Authorization": f"Bearer {forged}"},
    )
    assert res.status_code == 401


def test_put_application_status_candidate_forbidden(setup_recruiter_test_data):
    """PUT status with candidate role token must return 403 Forbidden."""
    candidate = setup_recruiter_test_data["candidate"]
    app_id = setup_recruiter_test_data["app_a"].id
    token = create_access_token(data={"sub": candidate.email})
    res = client.put(
        f"/api/recruiter/applications/{app_id}/status",
        json={"status": "interview"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_put_application_status_pending_recruiter_forbidden(
    setup_recruiter_test_data,
):
    """PUT status with pending recruiter token must return 403 Forbidden."""
    recruiter = setup_recruiter_test_data["recruiter_pending"]
    app_id = setup_recruiter_test_data["app_a"].id
    token = create_access_token(data={"sub": recruiter.email})
    res = client.put(
        f"/api/recruiter/applications/{app_id}/status",
        json={"status": "interview"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_put_application_status_other_recruiter_forbidden(
    setup_recruiter_test_data,
):
    """PUT status by a different recruiter not owning job returns 403."""
    recruiter_b = setup_recruiter_test_data["recruiter_b"]
    app_id = setup_recruiter_test_data["app_a"].id
    token = create_access_token(data={"sub": recruiter_b.email})
    res = client.put(
        f"/api/recruiter/applications/{app_id}/status",
        json={"status": "interview"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_put_application_status_owner_recruiter_succeeds(
    setup_recruiter_test_data,
):
    """PUT status by the owning recruiter returns 200 and updates status."""
    recruiter_a = setup_recruiter_test_data["recruiter_a"]
    app_id = setup_recruiter_test_data["app_a"].id
    token = create_access_token(data={"sub": recruiter_a.email})
    res = client.put(
        f"/api/recruiter/applications/{app_id}/status",
        json={"status": "shortlisted", "recruiter_notes": "Great profile"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "shortlisted"


def test_delete_job_unauthenticated_rejected(setup_recruiter_test_data):
    """DELETE job without token must return 401 Unauthorized."""
    job_id = setup_recruiter_test_data["job_a"].id
    res = client.delete(f"/api/recruiter/jobs/{job_id}")
    assert res.status_code == 401


def test_delete_job_candidate_forbidden(setup_recruiter_test_data):
    """DELETE job with candidate role must return 403 Forbidden."""
    candidate = setup_recruiter_test_data["candidate"]
    job_id = setup_recruiter_test_data["job_a"].id
    token = create_access_token(data={"sub": candidate.email})
    res = client.delete(
        f"/api/recruiter/jobs/{job_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_delete_job_other_recruiter_unauthorized(setup_recruiter_test_data):
    """DELETE job posted by recruiter_a using recruiter_b token fails 404."""
    recruiter_b = setup_recruiter_test_data["recruiter_b"]
    job_id = setup_recruiter_test_data["job_a"].id
    token = create_access_token(data={"sub": recruiter_b.email})
    res = client.delete(
        f"/api/recruiter/jobs/{job_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 404


def test_delete_job_owner_recruiter_succeeds(setup_recruiter_test_data):
    """DELETE job by the owning recruiter succeeds and returns 200."""
    recruiter_b = setup_recruiter_test_data["recruiter_b"]
    job_b_id = setup_recruiter_test_data["job_b"].id
    token = create_access_token(data={"sub": recruiter_b.email})
    res = client.delete(
        f"/api/recruiter/jobs/{job_b_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["job_id"] == job_b_id
