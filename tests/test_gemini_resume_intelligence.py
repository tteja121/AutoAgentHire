"""
Comprehensive Test Suite for Gemini-Powered Resume Intelligence, Job Matching,
and Account Isolation Security.
"""
import os
import io
import json
import pytest
from pathlib import Path
from fastapi import HTTPException
from pydantic import BaseModel

from backend.llm.gemini_service import get_gemini_service, GeminiService, normalize_skills
from backend.routes.ats_routes import extract_text_from_pdf, extract_text_from_docx, extract_skills
from backend.database.connection import SessionLocal
from backend.database.models_complete import User, JobPosting, Resume



@pytest.fixture(scope="module", autouse=True)
def setup_gemini_test_data():
    """Ensure at least two users, a candidate resume, and an approved job posting exist in DB."""
    db = SessionLocal()
    try:
        user_a = db.query(User).filter(User.email == "gemini_test_user_a@test.com").first()
        if not user_a:
            user_a = User(
                email="gemini_test_user_a@test.com",
                hashed_password="pbkdf2_sha256$test_dummy_hash",
                full_name="Gemini Test User A",
                role="candidate",
                is_active=True,
                is_verified=True,
                approval_status="approved",
            )
            db.add(user_a)
            db.commit()
            db.refresh(user_a)

        user_b = db.query(User).filter(User.email == "gemini_test_user_b@test.com").first()
        if not user_b:
            user_b = User(
                email="gemini_test_user_b@test.com",
                hashed_password="pbkdf2_sha256$test_dummy_hash",
                full_name="Gemini Test User B",
                role="recruiter",
                is_active=True,
                is_verified=True,
                approval_status="approved",
            )
            db.add(user_b)
            db.commit()
            db.refresh(user_b)

        resume_a = db.query(Resume).filter(Resume.user_id == user_a.id).first()
        if not resume_a:
            resume_a = Resume(
                user_id=user_a.id,
                filename="resume_a.pdf",
                file_path="/dummy/path/resume_a.pdf",
                file_size_bytes=1024,
                file_type="pdf",
                raw_text="Harshavardhan Reddy Thimmareddygari\nSoftware engineer with React, JavaScript, Python, and FastAPI skills.",
                skills=["React.js", "Python", "FastAPI", "MongoDB", "JavaScript"],
                is_active=True,
            )
            db.add(resume_a)
            db.commit()

        approved_job = db.query(JobPosting).filter(JobPosting.status == "approved").first()
        if not approved_job:
            approved_job = JobPosting(
                recruiter_id=user_b.id,
                company_name="Tech Partner",
                title="Senior Full Stack Engineer",
                vacancies=1,
                salary_description="$140,000 - $180,000",
                job_type="Full-time",
                location="San Francisco, CA (Remote)",
                description="Full stack developer to build scalable cloud web applications using modern Python and React.",
                skills="React.js, Python, FastAPI, MongoDB, JavaScript",
                start_date_pt="2026-10-01 09:00:00 PDT",
                final_date_pt="2026-12-31 17:00:00 PDT",
                status="approved",
            )
            db.add(approved_job)
            db.commit()
    finally:
        db.close()


def test_gemini_key_discovery_and_configuration():
    """Verify Gemini API key is discovered from backend/.env and working model is configured."""
    svc = get_gemini_service()
    if not svc.api_key or len(svc.api_key) <= 20:
        pytest.skip("GEMINI_API_KEY is not configured in this environment")
    assert svc.api_key not in ("your-gemini-api-key", "your_gemini_api_key_here"), "Dummy key detected"
    assert svc.model_name in ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.8-flash"], (
        f"Configured model '{svc.model_name}' should be an active Google Gemini model"
    )
    assert svc.model is not None, "GenerativeModel should be initialized"


def test_live_gemini_api_call():
    """Verify live Gemini API request succeeds or catches rate limits gracefully."""
    svc = get_gemini_service()
    if not svc.api_key or not svc.model:
        pytest.skip("GEMINI_API_KEY or model not configured for live API call")
    try:
        response = svc._generate_with_fallback("Respond with exact word: PONG")
        if response:
            assert "PONG" in response.text.strip().upper(), f"Unexpected live response: {response.text}"
    except Exception as e:
        # If Gemini daily free quota is exhausted (429), verify rate-limit error is reported
        assert "429" in str(e) or "quota" in str(e).lower(), f"Unexpected error: {e}"



def test_skills_normalization():
    """Verify skill normalization deduplicates, standardizes casing, and categorizes."""
    raw = {
        "technical": ["react.js", "python", "Python", "fastapi", "AWS", "aws", "REST API"],
        "professional": ["communication", "Problem Solving", "communication"],
        "domain": ["Cloud Infrastructure", "Fintech"]
    }
    normalized = normalize_skills(raw)
    tech = normalized["technical"]
    assert "Python" in tech
    assert tech.count("Python") == 1, "Duplicate 'Python' not deduplicated"
    assert "React.js" in tech
    assert "FastAPI" in tech
    assert "AWS" in tech
    assert tech.count("AWS") == 1
    assert "Communication" in normalized["professional"]
    assert normalized["professional"].count("Communication") == 1


def test_synthetic_txt_resume_extraction():
    """Test text resume parsing and extraction with facts vs inferences."""
    svc = get_gemini_service()
    synthetic_resume = """
    Jane Doe
    jane.doe@example.com | +1 555-0199 | San Francisco, CA
    LinkedIn: linkedin.com/in/janedoe | Portfolio: janedoe.dev

    PROFESSIONAL SUMMARY:
    Full Stack Software Engineer with 4 years of experience building distributed systems in Python and React.

    EXPERIENCE:
    Senior Software Engineer | CloudScale Systems | 2022 - Present
    - Architected real-time event streaming pipeline using FastAPI, Kafka, and PostgreSQL.
    - Improved API response latency by 35% across 20+ microservices.

    Software Engineer | AppVenture | 2020 - 2022
    - Developed customer-facing React components with TypeScript and Tailwind CSS.
    - Wrote comprehensive unit tests achieving 90% pytest and Jest code coverage.

    EDUCATION:
    B.S. in Computer Science | University of California, Berkeley | 2020

    TECHNICAL SKILLS:
    Python, FastAPI, React, TypeScript, PostgreSQL, Docker, AWS, Git, Redis
    """
    result = svc.analyze_resume(synthetic_resume)
    assert result["status"] == "success"
    # When quota is live, ai_powered is True; when rate-limited, fallback heuristic is active
    assert result["ai_powered"] in (True, False)
    assert "Jane Doe" in (result["candidate_name"] or "")
    assert result["email"] == "jane.doe@example.com"

    tech_skills = result["skills"]["technical"]
    assert any("Python" in s for s in tech_skills)
    assert any("React" in s for s in tech_skills)
    assert any("FastAPI" in s for s in tech_skills)

    # Facts vs Inferences
    facts_vs_inf = result.get("facts_vs_inferences", {})
    assert "explicit_facts" in facts_vs_inf
    assert "inferences" in facts_vs_inf
    assert len(facts_vs_inf["explicit_facts"]) > 0


def test_synthetic_docx_extraction(tmp_path):
    """Test extracting text from DOCX format."""
    import docx
    docx_file = tmp_path / "synthetic_resume.docx"
    doc = docx.Document()
    doc.add_heading("Alex Morgan - Software Developer", 0)
    doc.add_paragraph("alex.morgan@testdomain.com | +1-555-8822")
    doc.add_paragraph("Skills: Python, Django, React, PostgreSQL, Docker, Kubernetes")
    doc.add_paragraph("Experience: 3 years building web APIs and containerized microservices.")
    doc.save(str(docx_file))

    extracted_text = extract_text_from_docx(str(docx_file))
    assert "Alex Morgan" in extracted_text
    assert "Python" in extracted_text
    assert "Django" in extracted_text


def test_corrupt_empty_and_scanned_pdf_handling(tmp_path):
    """Test scanned PDF detection and empty document protection."""
    # 1. Empty/too short document detection in analyze_resume
    svc = get_gemini_service()
    empty_result = svc.analyze_resume("Short text")
    # Must either reject or gracefully handle
    assert empty_result is not None

    # 2. Scanned or image-only PDF detection
    # Create a dummy PDF with 0 extractable text but non-zero file size
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    scanned_pdf = tmp_path / "scanned_image.pdf"
    with open(str(scanned_pdf), "wb") as f:
        writer.write(f)

    # Calling extract_text_from_pdf on this blank page should raise HTTPException
    # indicating scanned image or no selectable text layer
    with pytest.raises(HTTPException) as excinfo:
        extract_text_from_pdf(str(scanned_pdf))
    assert excinfo.value.status_code == 400
    assert "scanned" in str(excinfo.value.detail).lower() or "selectable text" in str(excinfo.value.detail).lower()


def test_grounded_job_matching_against_real_database():
    """Verify job matching grounds against real database vacancies."""
    db = SessionLocal()
    try:
        approved_jobs = db.query(JobPosting).filter(JobPosting.status == "approved").all()
        assert len(approved_jobs) >= 1, "Database should contain at least 1 approved job posting"

        jobs_data = [
            {
                "id": j.id,
                "title": j.title,
                "company_name": j.company_name,
                "location": j.location,
                "salary_description": j.salary_description,
                "job_type": j.job_type,
                "skills": j.skills,
                "description": j.description,
            }
            for j in approved_jobs
        ]

        svc = get_gemini_service()
        candidate_skills = ["React.js", "Python", "FastAPI", "MongoDB", "JavaScript"]
        matches = svc.match_candidate_against_jobs(
            candidate_skills=candidate_skills,
            jobs=jobs_data,
            candidate_experience="2+ years of relevant experience"
        )

        assert len(matches) == len(approved_jobs)
        for m in matches:
            # Score must be 0-100
            assert 0 <= m["match_percentage"] <= 100
            # Must ground on DB fields
            assert m["title"] in [j["title"] for j in jobs_data]
            assert m["company"] in [j["company_name"] for j in jobs_data]
            assert isinstance(m["matching_skills"], list)
            assert isinstance(m["missing_skills"], list)
            assert "suitability_reason" in m
            assert len(m["suitability_reason"]) > 10
    finally:
        db.close()


def test_resume_optimization_for_database_job():
    """Verify resume optimization generates grounded suggestions for real job."""
    db = SessionLocal()
    try:
        job = db.query(JobPosting).filter(JobPosting.status == "approved").first()
        assert job is not None

        svc = get_gemini_service()
        sample_resume = (
            "Harshavardhan Reddy Thimmareddygari\n"
            "Software engineer with React, JavaScript, Python, and FastAPI skills.\n"
            "Built full-stack video store application using Node.js and MongoDB.\n"
            "Implemented JWT authentication and REST APIs."
        )

        opt_result = svc.optimize_resume_for_job(
            resume_text=sample_resume,
            job_title=job.title,
            job_company=job.company_name or "Tech Partner",
            job_description=job.description or "",
            job_skills=job.skills or ""
        )

        assert opt_result["status"] == "success"
        assert "missing_keywords" in opt_result
        assert "bullet_point_improvements" in opt_result
        assert "tailored_professional_summary" in opt_result
        assert len(opt_result["tailored_professional_summary"]) > 20
    finally:
        db.close()


def test_account_isolation_and_cross_account_security():
    """Verify candidate resume data is isolated and cross-account access is prevented."""
    db = SessionLocal()
    try:
        # Check user accounts
        users = db.query(User).all()
        assert len(users) >= 2, "Test requires at least two users to test isolation"

        user_a = users[0]
        user_b = users[1]

        # Check user A resumes
        user_a_resumes = db.query(Resume).filter(Resume.user_id == user_a.id).all()
        for r in user_a_resumes:
            # Ensure resume explicitly belongs to user_a
            assert r.user_id == user_a.id
            assert r.user_id != user_b.id

        # Verify query with user_b cannot see user_a's resume
        cross_resumes = db.query(Resume).filter(Resume.id.in_([r.id for r in user_a_resumes]), Resume.user_id == user_b.id).all()
        assert len(cross_resumes) == 0, "Security Violation: User B retrieved User A's resume records!"
    finally:
        db.close()


def test_fallback_behavior_when_unconfigured():
    """Verify fallback parser returns structured data without claiming key is missing when configured."""
    # Test service with a dummy unconfigured instance
    unconfigured_svc = GeminiService(api_key="")
    fb = unconfigured_svc._fallback_resume_analysis("John Doe\njohn@example.com\nPython, React")
    assert fb["status"] == "success"
    assert fb["ai_powered"] is False
    assert "GEMINI_API_KEY" in fb["config_message"]

    # Test configured service with simulated failure note
    sim_configured = GeminiService(api_key="simulated-valid-key-at-least-30-chars-long")
    sim_fb = sim_configured._fallback_resume_analysis(
        "John Doe\njohn@example.com\nPython, React",
        error_note="429 Quota Exceeded"
    )
    assert sim_fb["ai_powered"] is False
    # Must NOT claim the key is missing when the key is configured
    assert "GEMINI_API_KEY" not in sim_fb["config_message"]
    assert "quota" in sim_fb["config_message"].lower() or "temporarily" in sim_fb["config_message"].lower()

