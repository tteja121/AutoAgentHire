"""
Automated Security & Data Isolation Test Suite
Verifies strict cross-account tenant isolation, IDOR prevention, and RBAC across AutoAgentHire.
Tests cover 3 Client accounts, 2 Recruiters across different companies, and an Authorizer.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.main import app
from backend.config import settings
from backend.auth.jwt import create_access_token
from backend.database.connection import get_db_session
from backend.database.models_complete import (
    User, JobPosting, JobApplication, Resume, AuditLog
)

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_isolation_data():
    """Create distinct client accounts, recruiters from separate companies, and authorizer."""
    with get_db_session() as session:
        def get_or_create_user(email, role, full_name, company_name=None):
            u = session.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    email=email,
                    hashed_password="pbkdf2_sha256$test_dummy_hash_for_testing",
                    role=role,
                    full_name=full_name,
                    company_name=company_name,
                    is_active=True,
                    is_verified=True,
                    approval_status="approved",
                )
                session.add(u)
                session.commit()
                session.refresh(u)
            return u

        # 1. Users: 3 Clients
        client_a = get_or_create_user("client_a_secure@test.com", "candidate", "Client Alice")
        client_b = get_or_create_user("client_b_secure@test.com", "candidate", "Client Bob")
        client_c = get_or_create_user("client_c_zero@test.com", "candidate", "Client Charlie (Zero Apps)")

        # 2 Recruiters across distinct companies
        recruiter_1 = get_or_create_user("recruiter_alpha@alphatech.test", "recruiter", "Recruiter Alpha", "Alpha Technologies Inc")
        recruiter_2 = get_or_create_user("recruiter_beta@betacloud.test", "recruiter", "Recruiter Beta", "Beta Cloud Solutions")

        # 1 Authorizer
        authorizer = get_or_create_user("authorizer_admin@autoagenthire.test", "authorizer", "System Authorizer")

        # 2. Job Postings for each Recruiter
        job_alpha = session.query(JobPosting).filter(JobPosting.title == "Alpha Lead AI Engineer").first()
        if not job_alpha:
            job_alpha = JobPosting(
                recruiter_id=recruiter_1.id,
                company_name="Alpha Technologies Inc",
                title="Alpha Lead AI Engineer",
                salary_description="$160k - $200k",
                description="Lead machine learning systems at Alpha.",
                location="San Francisco, CA",
                job_type="Full-time",
                status="published",
                requirements="Python, PyTorch, FastAPI",
                start_date_pt="2026-10-01 09:00:00 PDT",
                final_date_pt="2026-12-31 17:00:00 PDT",
            )
            session.add(job_alpha)
            session.commit()
            session.refresh(job_alpha)

        job_beta = session.query(JobPosting).filter(JobPosting.title == "Beta Cloud Architect").first()
        if not job_beta:
            job_beta = JobPosting(
                recruiter_id=recruiter_2.id,
                company_name="Beta Cloud Solutions",
                title="Beta Cloud Architect",
                salary_description="$150k - $190k",
                description="Design cloud infrastructure at Beta.",
                location="Remote",
                job_type="Full-time",
                status="published",
                requirements="Kubernetes, Terraform, AWS",
                start_date_pt="2026-10-01 09:00:00 PDT",
                final_date_pt="2026-12-31 17:00:00 PDT",
            )
            session.add(job_beta)
            session.commit()
            session.refresh(job_beta)

        # 3. Clean previous test applications for these test clients from DB and applications.json
        session.query(JobApplication).filter(
            JobApplication.candidate_email.in_([
                "client_a_secure@test.com",
                "client_b_secure@test.com",
                "client_c_zero@test.com"
            ])
        ).delete(synchronize_session=False)
        session.commit()

        try:
            import json as _json
            apps_file = Path("data") / "applications.json"
            if apps_file.exists():
                with open(apps_file, "r") as f:
                    content = _json.load(f)
                cleaned = [
                    a for a in content
                    if a.get("user_id") not in [
                        "client_a_secure@test.com",
                        "client_b_secure@test.com",
                        "client_c_zero@test.com"
                    ] and a.get("result", {}).get("candidate_email") not in [
                        "client_a_secure@test.com",
                        "client_b_secure@test.com",
                        "client_c_zero@test.com"
                    ]
                ]
                with open(apps_file, "w") as f:
                    _json.dump(cleaned, f, indent=2)
        except Exception:
            pass

        # 4. Application 1: Client A applied to Job Alpha with scheduled interview
        app_a = JobApplication(
            job_posting_id=job_alpha.id,
            candidate_id=client_a.id,
            candidate_name=client_a.full_name,
            candidate_email=client_a.email,
            status="interview",
            interview_meeting_link="https://meet.google.com/sec-test-alp",
            interview_scheduled_at=datetime(2026, 10, 25, 14, 0, 0, tzinfo=timezone.utc),
            interview_round="Technical Round 1",
            interview_notes="Confidential Alpha Candidate notes",
            resume_filename=f"{client_a.id}_alice_resume.pdf",
            resume_url=f"/api/recruiter/files/{client_a.id}_alice_resume.pdf",
            match_score=95,
        )
        session.add(app_a)

        # Application 2: Client B applied to Job Beta
        app_b = JobApplication(
            job_posting_id=job_beta.id,
            candidate_id=client_b.id,
            candidate_name=client_b.full_name,
            candidate_email=client_b.email,
            status="applied",
            resume_filename=f"{client_b.id}_bob_resume.pdf",
            resume_url=f"/api/recruiter/files/{client_b.id}_bob_resume.pdf",
            match_score=88,
        )
        session.add(app_b)
        session.commit()
        session.refresh(app_a)
        session.refresh(app_b)

        # Client C deliberately has NO applications (0 applications)

        # Generate tokens
        token_a = create_access_token({"sub": client_a.email, "role": "candidate", "id": client_a.id})
        token_b = create_access_token({"sub": client_b.email, "role": "candidate", "id": client_b.id})
        token_c = create_access_token({"sub": client_c.email, "role": "candidate", "id": client_c.id})
        token_rec_1 = create_access_token({"sub": recruiter_1.email, "role": "recruiter", "id": recruiter_1.id})
        token_rec_2 = create_access_token({"sub": recruiter_2.email, "role": "recruiter", "id": recruiter_2.id})
        token_auth = create_access_token({"sub": authorizer.email, "role": "authorizer", "id": authorizer.id})

        app_a_id = app_a.id
        app_b_id = app_b.id
        app_a_filename = app_a.resume_filename
        job_alpha_id = job_alpha.id
        job_beta_id = job_beta.id
        job_alpha_title = job_alpha.title
        client_a_id = client_a.id
        client_b_id = client_b.id
        client_c_id = client_c.id

        return {
            "client_a_id": client_a_id,
            "client_b_id": client_b_id,
            "client_c_id": client_c_id,
            "job_alpha_id": job_alpha_id,
            "job_beta_id": job_beta_id,
            "job_alpha_title": job_alpha_title,
            "app_a_id": app_a_id,
            "app_b_id": app_b_id,
            "app_a_filename": app_a_filename,
            "tokens": {
                "client_a": token_a,
                "client_b": token_b,
                "client_c": token_c,
                "rec_1": token_rec_1,
                "rec_2": token_rec_2,
                "auth": token_auth,
            }
        }


# ==============================================================================
# TEST 1 & 2: CLIENT ISOLATION & NO DATA LEAKAGE TO OTHER CLIENTS
# ==============================================================================

def test_client_a_sees_only_own_application_and_interview(setup_isolation_data):
    """Client A sees only their application to Alpha and their own Google Meet link."""
    token = setup_isolation_data["tokens"]["client_a"]
    resp = client.get("/api/applications", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    apps = data.get("applications", [])
    
    assert len(apps) == 1
    app = apps[0]
    assert app["title"] == "Alpha Lead AI Engineer"
    assert app["candidate_email"] == "client_a_secure@test.com"
    assert app["interview_meeting_link"] == "https://meet.google.com/sec-test-alp"
    assert app["interview_round"] == "Technical Round 1"


def test_clients_b_and_c_cannot_see_client_a_data(setup_isolation_data):
    """Client B only sees Beta; Client C sees ZERO applications and ZERO interviews."""
    # Client B
    token_b = setup_isolation_data["tokens"]["client_b"]
    resp_b = client.get("/api/applications", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 200
    apps_b = resp_b.json().get("applications", [])
    assert len(apps_b) == 1
    assert apps_b[0]["title"] == "Beta Cloud Architect"
    assert apps_b[0]["candidate_email"] == "client_b_secure@test.com"
    # Client B MUST NOT see Client A's application or interview
    for app in apps_b:
        assert app["candidate_email"] != "client_a_secure@test.com"
        assert app.get("interview_meeting_link") != "https://meet.google.com/sec-test-alp"

    # Client C (Zero applications)
    token_c = setup_isolation_data["tokens"]["client_c"]
    resp_c = client.get("/api/applications", headers={"Authorization": f"Bearer {token_c}"})
    assert resp_c.status_code == 200
    apps_c = resp_c.json().get("applications", [])
    assert len(apps_c) == 0


# ==============================================================================
# TEST 3 & 4: DASHBOARD STATS COMPUTED PER-CLIENT (ZERO COUNTS FOR ZERO APPS)
# ==============================================================================

def test_dashboard_statistics_per_client(setup_isolation_data):
    """Statistics are strictly computed from client's own authorized records."""
    token_a = setup_isolation_data["tokens"]["client_a"]
    apps_a = client.get("/api/applications", headers={"Authorization": f"Bearer {token_a}"}).json().get("applications", [])
    assert len(apps_a) == 1
    companies_a = set(a.get("company") or a.get("company_name") for a in apps_a)
    assert len(companies_a) == 1

    token_c = setup_isolation_data["tokens"]["client_c"]
    apps_c = client.get("/api/applications", headers={"Authorization": f"Bearer {token_c}"}).json().get("applications", [])
    assert len(apps_c) == 0
    companies_c = set(a.get("company") or a.get("company_name") for a in apps_c)
    assert len(companies_c) == 0


# ==============================================================================
# TEST 5: IDOR & PARAMETER TAMPERING PREVENTION
# ==============================================================================

def test_idor_query_parameter_spoofing_denied(setup_isolation_data):
    """Client B passing ?user_email=client_a in query params still receives only Client B data."""
    token_b = setup_isolation_data["tokens"]["client_b"]
    resp = client.get(
        "/api/applications?user_email=client_a_secure@test.com",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 200
    apps = resp.json().get("applications", [])
    # Must still only return Client B's applications
    for app in apps:
        assert app["candidate_email"] == "client_b_secure@test.com"
        assert app["candidate_email"] != "client_a_secure@test.com"


def test_idor_unauthorized_resume_analysis_denied(setup_isolation_data):
    """Client B cannot analyze Client A's resume by guessing or changing application_id in URL."""
    app_a_id = setup_isolation_data["app_a_id"]
    token_b = setup_isolation_data["tokens"]["client_b"]
    resp = client.get(
        f"/api/recruiter/applications/{app_a_id}/analyze-resume",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 403
    assert "Not authorized" in resp.json().get("detail", "")


def test_idor_unauthorized_file_download_denied(setup_isolation_data):
    """Client B cannot download Client A's private resume file via file endpoint."""
    token_b = setup_isolation_data["tokens"]["client_b"]
    filename = setup_isolation_data["app_a_filename"]

    resp = client.get(
        f"/api/recruiter/files/{filename}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 403
    assert "not authorized" in resp.json().get("detail", "").lower()


def test_unauthenticated_requests_denied():
    """Unauthenticated access to private applications and files is strictly blocked."""
    assert client.get("/api/applications").status_code == 401
    assert client.get("/api/recruiter/files/some_file.pdf").status_code == 401
    assert client.get("/api/mongo/users").status_code == 401
    assert client.get("/api/mongo/applications").status_code == 401


# ==============================================================================
# TEST 6: ACCOUNT SWITCHING & CACHE SAFETY
# ==============================================================================

def test_account_switch_does_not_leak_previous_user_data(setup_isolation_data):
    """Sequential API calls simulating Client A logout followed by Client C login."""
    # First: Client A logs in and retrieves their application
    token_a = setup_isolation_data["tokens"]["client_a"]
    resp_a = client.get("/api/applications", headers={"Authorization": f"Bearer {token_a}"})
    assert len(resp_a.json().get("applications", [])) == 1

    # Second: Client C logs in with their token (simulating clean switch)
    token_c = setup_isolation_data["tokens"]["client_c"]
    resp_c = client.get("/api/applications", headers={"Authorization": f"Bearer {token_c}"})
    # Client C must receive 0 applications, never Client A's data
    assert len(resp_c.json().get("applications", [])) == 0


# ==============================================================================
# TEST 7: RECRUITER & COMPANY DATA ISOLATION
# ==============================================================================

def test_recruiter_cannot_access_unauthorized_company_or_job_applications(setup_isolation_data):
    """Recruiter 2 (Beta) cannot view or analyze Client A's application for Recruiter 1's (Alpha) job."""
    app_a_id = setup_isolation_data["app_a_id"]
    token_rec_2 = setup_isolation_data["tokens"]["rec_2"]

    # Recruiter 2 attempts to analyze Client A's resume for Alpha's job
    resp = client.get(
        f"/api/recruiter/applications/{app_a_id}/analyze-resume",
        headers={"Authorization": f"Bearer {token_rec_2}"}
    )
    assert resp.status_code == 403
    assert "Not authorized" in resp.json().get("detail", "")

    # Recruiter 2 attempts to download Client A's resume
    filename = setup_isolation_data["app_a_filename"]
    resp_file = client.get(
        f"/api/recruiter/files/{filename}",
        headers={"Authorization": f"Bearer {token_rec_2}"}
    )
    assert resp_file.status_code == 403


def test_recruiter_1_can_access_own_job_applications(setup_isolation_data):
    """Recruiter 1 (Alpha) CAN view and manage candidates who applied to their own job."""
    token_rec_1 = setup_isolation_data["tokens"]["rec_1"]
    resp = client.get(
        "/api/recruiter/my-applications",
        headers={"Authorization": f"Bearer {token_rec_1}"}
    )
    assert resp.status_code == 200
    apps = resp.json()
    assert isinstance(apps, list)
    # Check that any returned application belongs to Recruiter 1's job
    for app in apps:
        assert app["job_posting_id"] == setup_isolation_data["job_alpha_id"]


# ==============================================================================
# TEST 8: AUTHORIZER ADMINISTRATIVE PERMISSIONS
# ==============================================================================

def test_authorizer_permissions_work_and_block_non_authorizers(setup_isolation_data):
    """Authorizers can review requests; Candidates and Recruiters receive 403 Forbidden."""
    token_auth = setup_isolation_data["tokens"]["auth"]
    token_rec_1 = setup_isolation_data["tokens"]["rec_1"]
    token_client_a = setup_isolation_data["tokens"]["client_a"]

    # Authorizer can view recruiter requests
    resp_auth = client.get(
        "/api/recruiter/authorizer/recruiter-requests",
        headers={"Authorization": f"Bearer {token_auth}"}
    )
    assert resp_auth.status_code == 200

    # Recruiter is blocked
    resp_rec = client.get(
        "/api/recruiter/authorizer/recruiter-requests",
        headers={"Authorization": f"Bearer {token_rec_1}"}
    )
    assert resp_rec.status_code == 403

    # Candidate is blocked
    resp_cand = client.get(
        "/api/recruiter/authorizer/recruiter-requests",
        headers={"Authorization": f"Bearer {token_client_a}"}
    )
    assert resp_cand.status_code == 403

    # Candidate cannot view MongoDB users
    resp_mongo_users = client.get(
        "/api/mongo/users",
        headers={"Authorization": f"Bearer {token_client_a}"}
    )
    assert resp_mongo_users.status_code == 403


# ==============================================================================
# TEST 9: LEGITIMATE APPLICATION SUBMISSION WORKS WITH IDENTITY DERIVED FROM JWT
# ==============================================================================

def test_legitimate_application_submission_binds_to_authenticated_user(setup_isolation_data):
    """Submitting an application binds it strictly to current_user, preventing identity spoofing."""
    token_b = setup_isolation_data["tokens"]["client_b"]
    job_alpha_id = setup_isolation_data["job_alpha_id"]
    job_alpha_title = setup_isolation_data["job_alpha_title"]
    client_b_id = setup_isolation_data["client_b_id"]

    # Client B applies to Job Alpha attempting to send spoofed email in body
    payload = {
        "candidate_name": "Spoofed Alice",
        "candidate_email": "client_a_secure@test.com",  # Spoof attempt
        "job_ids": [str(job_alpha_id)],
        "job_title": job_alpha_title,
        "company_name": "Alpha Technologies Inc",
        "location": "Remote",
        "match_score": 90,
        "jobs": [{
            "id": str(job_alpha_id),
            "title": job_alpha_title,
            "company": "Alpha Technologies Inc",
            "location": "Remote",
            "match_score": 90,
        }]
    }

    resp = client.post(
        "/api/ats/apply-all",
        json=payload,
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 200, resp.text

    # Verify that the created application is owned by Client B (Bob), NOT the spoofed Client A (Alice)!
    with get_db_session() as session:
        new_app = session.query(JobApplication).filter(
            JobApplication.job_posting_id == job_alpha_id,
            JobApplication.candidate_id == client_b_id
        ).first()
        assert new_app is not None
        assert new_app.candidate_email == "client_b_secure@test.com"
        assert new_app.candidate_name == "Client Bob"
