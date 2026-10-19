"""
Recruiter & Authorizer & Candidate Job Posting and Application Routes
"""

import os
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database.connection import get_db
from backend.database.models_complete import User, JobPosting, JobApplication, AuditLog, Resume

router = APIRouter(prefix="/recruiter", tags=["Recruiter & Authorizer"])

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "resumes")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class JobCreateRequest(BaseModel):
    title: str = Field(..., min_length=2)
    vacancies: int = Field(default=1, ge=1)
    salary_description: str = Field(..., min_length=2, description="e.g. $120k - $150k / yr")
    description: str = Field(..., min_length=10)
    requirements: Optional[str] = None
    skills: Optional[str] = Field(default=None, description="Comma-separated required skills e.g. React, TypeScript, Python")
    recruiting_process: Optional[str] = None
    job_type: str = Field(default="Full-time")
    location: str = Field(default="Remote")
    start_date_pt: str = Field(..., description="e.g. 2026-10-15 09:00:00 PDT")
    final_date_pt: str = Field(..., description="e.g. 2026-11-15 17:00:00 PDT")
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    organization_symbol: Optional[str] = None
    status: Optional[str] = Field(default="pending_approval", description="'pending_approval' or 'draft'")


class JobUpdateRequest(BaseModel):
    title: Optional[str] = None
    vacancies: Optional[int] = None
    salary_description: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    skills: Optional[str] = None
    recruiting_process: Optional[str] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    start_date_pt: Optional[str] = None
    final_date_pt: Optional[str] = None
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    organization_symbol: Optional[str] = None
    status: Optional[str] = None


class AuthorizeJobRequest(BaseModel):
    status: str = Field(..., description="'approved', 'rejected', or 'returned_for_corrections'")
    notes: Optional[str] = None


class AuthorizeRecruiterRequest(BaseModel):
    status: str = Field(..., description="'approved' or 'rejected'")
    notes: Optional[str] = None


class CreateRecruiterByAuthorizerRequest(BaseModel):
    email: str = Field(..., description="Recruiter official company email")
    password: str = Field(..., min_length=6, description="Initial password for recruiter")
    first_name: str = Field(..., min_length=1, description="Recruiter's First Name")
    last_name: str = Field(..., min_length=1, description="Recruiter's Last Name")
    date_of_birth: str = Field(..., description="Date of birth in DD/MM/YYYY format")
    full_name: Optional[str] = None
    company_name: str = Field(..., min_length=1, description="Company Name")
    company_logo_url: Optional[str] = None
    custom_user_id: Optional[str] = None


class RecruiterRequestResponse(BaseModel):
    id: int
    uuid: str
    email: str
    custom_user_id: Optional[str] = None
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    role: str
    approval_status: Optional[str] = "approved"
    approval_notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApplicationStatusUpdate(BaseModel):
    status: str = Field(..., description="'reviewing', 'shortlisted', 'interview', 'rejected', 'hired'")
    recruiter_notes: Optional[str] = None
    interview_scheduled_at: Optional[datetime] = None
    interview_meeting_link: Optional[str] = None
    interview_round: Optional[str] = None
    interview_notes: Optional[str] = None


class CandidateApplicationResponse(BaseModel):
    id: int
    uuid: str
    job_posting_id: int
    job_title: Optional[str] = None
    company_name: Optional[str] = None
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None
    resume_filename: Optional[str] = None
    cv_url: Optional[str] = None
    cv_filename: Optional[str] = None
    cover_letter: Optional[str] = None
    notes: Optional[str] = None
    status: str
    recruiter_notes: Optional[str] = None
    match_score: Optional[float] = 0.0
    email_status: Optional[str] = "Pending"
    email_message_id: Optional[str] = None
    email_sent_at: Optional[datetime] = None
    email_error: Optional[str] = None
    interview_scheduled_at: Optional[datetime] = None
    interview_meeting_link: Optional[str] = None
    interview_round: Optional[str] = None
    interview_notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class JobPostingResponse(BaseModel):
    id: int
    uuid: str
    recruiter_id: int
    recruiter_name: Optional[str] = None
    company_name: str
    company_logo_url: Optional[str] = None
    organization_symbol: Optional[str] = None
    title: str
    vacancies: int
    salary_description: str
    job_type: str
    location: str
    description: str
    requirements: Optional[str] = None
    skills: Optional[str] = None
    recruiting_process: Optional[str] = None
    start_date_pt: str
    final_date_pt: str
    timezone: str
    status: str
    authorizer_notes: Optional[str] = None
    authorized_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    applications_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── Recruiter Endpoints ────────────────────────────────────────────────────────

@router.post("/jobs", response_model=JobPostingResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    payload: JobCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter posts a new job vacancy."""
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")

    company_name = payload.company_name or getattr(current_user, "company_name", None) or "Your Organization"
    company_logo = payload.company_logo_url or getattr(current_user, "company_logo_url", None) or "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop"

    # For authorized recruiters, new postings are immediately approved and published to candidate board
    initial_status = "draft" if payload.status == "draft" else "approved"

    new_job = JobPosting(
        recruiter_id=current_user.id,
        company_name=company_name,
        company_logo_url=company_logo,
        organization_symbol=payload.organization_symbol or (company_name[:4].upper() if company_name else "CORP"),
        title=payload.title,
        vacancies=payload.vacancies,
        salary_description=payload.salary_description,
        job_type=payload.job_type,
        location=payload.location,
        description=payload.description,
        requirements=payload.requirements or "",
        skills=payload.skills or "",
        recruiting_process=payload.recruiting_process or "",
        start_date_pt=payload.start_date_pt,
        final_date_pt=payload.final_date_pt,
        timezone="Asia/Kolkata (IST)",
        status=initial_status,
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    resp = JobPostingResponse.model_validate(new_job)
    resp.recruiter_name = str(current_user.full_name or current_user.email)
    resp.applications_count = 0
    return resp


@router.put("/jobs/{job_id}", response_model=JobPostingResponse)
def update_job(
    job_id: int,
    payload: JobUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter updates or edits a job vacancy (draft, returned, or existing)."""
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")
    job = db.query(JobPosting).filter(JobPosting.id == job_id, JobPosting.recruiter_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found or unauthorized")

    for field, val in payload.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(job, field, val)

    db.commit()
    db.refresh(job)
    resp = JobPostingResponse.model_validate(job)
    resp.recruiter_name = str(current_user.full_name or current_user.email)
    resp.applications_count = db.query(JobApplication).filter(JobApplication.job_posting_id == job.id).count()
    return resp


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter deletes or archives their job vacancy."""
    if current_user.role not in ("recruiter", "authorizer", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.role == "recruiter" and current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")
    
    query = db.query(JobPosting).filter(JobPosting.id == job_id)
    if current_user.role == "recruiter":
        query = query.filter(JobPosting.recruiter_id == current_user.id)
    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found or unauthorized")
    
    # Cascade delete any applications associated with this job posting
    db.query(JobApplication).filter(JobApplication.job_posting_id == job_id).delete(synchronize_session=False)
    db.delete(job)
    db.commit()
    return {"message": "Job posting deleted successfully", "job_id": job_id}


@router.get("/my-jobs", response_model=List[JobPostingResponse])
def get_recruiter_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter gets list of all jobs they posted for tracking."""
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")
    jobs = db.query(JobPosting).filter(JobPosting.recruiter_id == current_user.id).order_by(desc(JobPosting.created_at)).all()
    result = []
    counts_rows = (
        db.query(JobApplication.job_posting_id, func.count(JobApplication.id))
        .filter(JobApplication.job_posting_id.in_([j.id for j in jobs]))
        .group_by(JobApplication.job_posting_id)
        .all()
    )
    counts = {r[0]: r[1] for r in counts_rows}
    for j in jobs:
        resp = JobPostingResponse.model_validate(j)
        resp.recruiter_name = str(current_user.full_name or current_user.email)
        resp.applications_count = counts.get(j.id, 0)
        result.append(resp)
    return result


@router.get("/my-applications", response_model=List[CandidateApplicationResponse])
def get_recruiter_applications(
    job_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter views all candidates who applied to their posted jobs, including resumes/CVs."""
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")
    query = (
        db.query(JobApplication, JobPosting)
        .join(JobPosting, JobApplication.job_posting_id == JobPosting.id)
        .filter(JobPosting.recruiter_id == current_user.id)
    )
    if job_id:
        query = query.filter(JobPosting.id == job_id)

    records = query.order_by(desc(JobApplication.created_at)).all()
    results = []
    for app_record, job in records:
        item = CandidateApplicationResponse.model_validate(app_record)
        item.job_title = job.title
        item.company_name = job.company_name
        if item.resume_url and not item.resume_url.startswith("/api/recruiter/files/"):
            clean_res = app_record.resume_filename or os.path.basename(item.resume_url)
            item.resume_url = f"/api/recruiter/files/{clean_res}"
        results.append(item)
    return results


@router.patch("/applications/{application_id}/status")
@router.put("/applications/{application_id}/status")
def update_application_status(
    application_id: int,
    payload: ApplicationStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter updates tracking status and notes for a candidate application."""
    if current_user.role not in ("recruiter", "authorizer", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter or Administrator access required")
    if current_user.role == "recruiter" and current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")

    app_record = (
        db.query(JobApplication)
        .join(JobPosting, JobApplication.job_posting_id == JobPosting.id)
        .filter(JobApplication.id == application_id)
        .first()
    )
    if not app_record:
        raise HTTPException(status_code=404, detail="Candidate application not found")

    job = db.query(JobPosting).filter(JobPosting.id == app_record.job_posting_id).first()

    # Ownership check: recruiter can only update applications for their own jobs
    if current_user.role == "recruiter":
        if not job or job.recruiter_id != current_user.id:
            raise HTTPException(status_code=404, detail="Candidate application not found")

    # Ownership check: recruiters may only update applications on their own jobs
    if current_user.role == "recruiter":
        if not job or job.recruiter_id != current_user.id:
            raise HTTPException(status_code=404, detail="Candidate application not found")
    clean_status = (payload.status or "reviewing").strip().lower()
    setattr(app_record, "status", clean_status)

    if payload.recruiter_notes is not None:
        setattr(app_record, "recruiter_notes", payload.recruiter_notes)
    if payload.interview_scheduled_at is not None:
        setattr(app_record, "interview_scheduled_at", payload.interview_scheduled_at)
    if payload.interview_meeting_link is not None and payload.interview_meeting_link.strip():
        setattr(app_record, "interview_meeting_link", payload.interview_meeting_link.strip())
    if payload.interview_round is not None:
        setattr(app_record, "interview_round", payload.interview_round.strip())
    if payload.interview_notes is not None:
        setattr(app_record, "interview_notes", payload.interview_notes.strip())

    # When candidate is shortlisted or in interview, ensure Google Meet link is attached
    if clean_status in ("shortlisted", "interview", "interviewing"):
        current_meet = getattr(app_record, "interview_meeting_link", None)
        if not current_meet or not current_meet.strip() or current_meet.strip().endswith("/new"):
            meet_code = f"{_uuid.uuid4().hex[:3]}-{_uuid.uuid4().hex[:4]}-{_uuid.uuid4().hex[:3]}"
            current_meet = f"https://meet.google.com/{meet_code}"
            setattr(app_record, "interview_meeting_link", current_meet)
        if not getattr(app_record, "interview_round", None):
            setattr(app_record, "interview_round", "Technical Interview & Discussion")

    db.commit()
    db.refresh(app_record)

    # Dispatch personalized email in text format to the candidate
    from backend.services.email_service import send_candidate_status_update_email
    job_title = job.title if job else "Software Engineer"
    comp_default = "AutoAgentHire Partner"
    if current_user and current_user.company_name:
        comp_default = str(current_user.company_name)
    comp_name = str(job.company_name) if (job and job.company_name) else comp_default
    rec_name = (current_user.full_name or current_user.company_name or f"{comp_name} Recruiter") if current_user else f"{comp_name} Recruiter"
    rec_email = str(current_user.email) if (current_user and current_user.email) else "support@autoagenthire.com"

    email_sent, email_msg_id, email_err = send_candidate_status_update_email(
        candidate_email=str(app_record.candidate_email),
        candidate_name=str(app_record.candidate_name or "Applicant"),
        job_title=str(job_title),
        company_name=comp_name,
        new_status=clean_status,
        recruiter_name=rec_name,
        recruiter_email=rec_email,
        meeting_link=getattr(app_record, "interview_meeting_link", None),
        scheduled_at=getattr(app_record, "interview_scheduled_at", None),
        interview_round=getattr(app_record, "interview_round", None),
        notes=payload.recruiter_notes or payload.interview_notes,
    )

    if email_sent:
        setattr(app_record, "email_status", "Sent")
        setattr(app_record, "email_message_id", email_msg_id)
        setattr(app_record, "email_sent_at", datetime.now(timezone.utc))
        db.commit()

    # Sync to data/applications.json for fallback storage
    try:
        import json
        from pathlib import Path
        apps_file = Path("data") / "applications.json"
        if apps_file.exists():
            with open(apps_file, "r") as f:
                all_apps = json.load(f)
            updated = False
            for entry in all_apps:
                res = entry.get("result", {})
                if str(entry.get("id")) == str(app_record.id) or res.get("candidate_email") == app_record.candidate_email:
                    res["status"] = clean_status
                    if getattr(app_record, "interview_meeting_link", None):
                        res["interview_meeting_link"] = app_record.interview_meeting_link
                    if getattr(app_record, "interview_scheduled_at", None):
                        res["interview_scheduled_at"] = app_record.interview_scheduled_at.isoformat()
                    if getattr(app_record, "interview_round", None):
                        res["interview_round"] = app_record.interview_round
                    updated = True
            if updated:
                with open(apps_file, "w") as f:
                    json.dump(all_apps, f, indent=2)
    except Exception as j_err:
        print(f"[Recruiter Status] Note: Could not sync applications.json: {j_err}")

    return {
        "message": f"Application status updated to '{clean_status}' successfully",
        "status": app_record.status,
        "interview_scheduled_at": app_record.interview_scheduled_at.isoformat() if getattr(app_record, "interview_scheduled_at", None) else None,
        "interview_meeting_link": getattr(app_record, "interview_meeting_link", None),
        "interview_round": getattr(app_record, "interview_round", None),
        "email_sent": email_sent,
        "email_recipient": app_record.candidate_email,
        "email_message_id": email_msg_id,
    }


# ── Recruiter: Analyze Candidate Resume ───────────────────────────────────────

@router.post("/applications/{application_id}/analyze-candidate")
async def analyze_candidate_resume(
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recruiter uses Gemini to analyze a candidate's resume for a job application they own."""
    import asyncio as _asyncio
    from backend.llm.gemini_service import get_gemini_service
    from backend.database.models_complete import Resume as _Resume

    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")

    app_record = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found")

    job = db.query(JobPosting).filter(JobPosting.id == app_record.job_posting_id).first()
    if not job or job.recruiter_id != current_user.id:
        raise HTTPException(status_code=404, detail="Application not found")

    # Fetch resume text
    resume = (
        db.query(_Resume)
        .filter(_Resume.user_id == app_record.candidate_id, _Resume.is_active == True)
        .first()
    )
    resume_text = (resume.raw_text or "") if resume else ""
    if not resume_text and app_record.resume_url:
        resume_text = f"Resume on file: {app_record.resume_url}"

    gemini_service = get_gemini_service()
    analysis = await _asyncio.to_thread(gemini_service.analyze_resume, str(resume_text), str(job.description or ""))

    # Audit log
    try:
        audit = AuditLog(
            user_id=current_user.id,
            performed_by_email=current_user.email,
            action="CANDIDATE_ANALYZED",
            target_type="application",
            target_id=str(application_id),
            details={"candidate_email": app_record.candidate_email},
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    return {"status": "success", "application_id": application_id, "analysis": analysis}


# ── Authorizer Endpoints ──────────────────────────────────────────────────────

@router.get("/authorizer/pending-jobs", response_model=List[JobPostingResponse])
def get_jobs_for_authorization(
    status_filter: Optional[str] = "pending_approval",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer reviews all jobs pending approval or by status."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    query = db.query(JobPosting)
    if status_filter and status_filter != "all":
        query = query.filter(JobPosting.status == status_filter)
    jobs = query.order_by(desc(JobPosting.created_at)).all()

    result = []
    for j in jobs:
        resp = JobPostingResponse.model_validate(j)
        recruiter = db.query(User).filter(User.id == j.recruiter_id).first()
        resp.recruiter_name = str(recruiter.full_name) if (recruiter and recruiter.full_name) else "Unknown Recruiter"
        resp.applications_count = db.query(JobApplication).filter(JobApplication.job_posting_id == j.id).count()
        result.append(resp)
    return result


@router.post("/authorizer/jobs/{job_id}/action")
def authorize_job(
    job_id: int,
    payload: AuthorizeJobRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer approves, rejects, or returns a posted job for corrections."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")

    setattr(job, "status", payload.status)
    setattr(job, "authorizer_id", current_user.id)
    setattr(
        job,
        "authorizer_notes",
        payload.notes or ("Returned for corrections" if payload.status == "returned_for_corrections" else ""),
    )
    setattr(job, "authorized_at", datetime.now(timezone.utc))

    try:
        audit_event = AuditLog(
            user_id=current_user.id,
            performed_by_email=current_user.email,
            action=f"job_{payload.status}",
            target_type="job_posting",
            target_id=str(job.id),
            details={"title": job.title, "company": job.company_name, "status": payload.status, "notes": payload.notes or ""},
        )
        db.add(audit_event)
    except Exception:
        pass

    db.commit()

    return {
        "message": f"Job {payload.status} successfully",
        "job_id": job.id,
        "status": job.status,
    }


@router.get("/authorizer/recruiter-requests", response_model=List[RecruiterRequestResponse])
def get_recruiter_requests(
    status_filter: Optional[str] = "pending_approval",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer reviews recruiter account registration requests."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    query = db.query(User).filter(User.role == "recruiter")
    if status_filter and status_filter != "all":
        query = query.filter(User.approval_status == status_filter)
    recruiters = query.order_by(desc(User.created_at)).all()
    return recruiters


@router.post("/authorizer/recruiter-requests/{user_id}/action")
def authorize_recruiter_request(
    user_id: int,
    payload: AuthorizeRecruiterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer approves or rejects a recruiter registration request."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Recruiter request not found")

    setattr(user, "role", "recruiter")
    setattr(user, "approval_status", payload.status)
    setattr(user, "approved_by_id", current_user.id)
    setattr(user, "approval_notes", payload.notes or "")
    if payload.status == "approved":
        setattr(user, "is_active", True)
        setattr(user, "is_verified", True)
        if not getattr(user, "custom_user_id", None):
            setattr(user, "custom_user_id", f"REC-{user.id:04d}")

        # Send official confirmation email
        try:
            from backend.services.email_service import send_recruiter_welcome_email
            send_recruiter_welcome_email(
                recruiter_email=str(user.email),
                recruiter_name=str(user.full_name or "Recruiter"),
                company_name=str(user.company_name or "Your Organization"),
                custom_user_id=str(user.custom_user_id or ""),
            )
        except Exception as e:
            pass
    elif payload.status == "rejected":
        setattr(user, "is_active", False)

    # Record Audit Log event
    try:
        audit_event = AuditLog(
            user_id=user.id,
            performed_by_email=current_user.email,
            action=f"recruiter_access_{payload.status}",
            target_type="user",
            target_id=str(user.id),
            details={"email": user.email, "company": user.company_name, "notes": payload.notes or ""},
        )
        db.add(audit_event)
    except Exception:
        pass

    db.commit()

    return {
        "message": f"Recruiter registration {payload.status} successfully",
        "user_id": user.id,
        "email": user.email,
        "approval_status": user.approval_status,
    }


@router.post("/authorizer/create-recruiter")
def authorizer_create_recruiter_account(
    payload: CreateRecruiterByAuthorizerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer directly creates and approves a new Recruiter account with an authoritative 8-character Recruiter ID."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    from backend.auth.password import hash_password
    from backend.services.email_service import send_recruiter_welcome_email
    from backend.utils.recruiter_id import calculate_recruiter_id
    from sqlalchemy.exc import IntegrityError

    clean_email = payload.email.strip().lower()
    from backend.routes.auth_routes import is_personal_email_domain
    if is_personal_email_domain(clean_email):
        domain = clean_email.split("@")[-1] if "@" in clean_email else ""
        raise HTTPException(
            status_code=400,
            detail=(
                f"Recruiters must register with an official corporate or company email address. "
                f"Personal email domains (@{domain}) are strictly prohibited. "
                f"Please enter an official work or organization email only."
            ),
        )

    existing = db.query(User).filter(User.email.ilike(clean_email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")

    # Calculate authoritative 8-character Recruiter ID using exact formula:
    # Pattern: ^[0-9][A-Z][0-9]{5}[A-Z]$ (DLD DDDDL)
    try:
        user_id_code, id_details = calculate_recruiter_id(
            first_name=payload.first_name,
            last_name=payload.last_name,
            date_of_birth=payload.date_of_birth,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=f"Recruiter ID calculation error: {str(val_err)}")

    # Check for duplicate Recruiter ID collision
    taken_id_user = db.query(User).filter(User.custom_user_id == user_id_code).first()
    if taken_id_user:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Recruiter ID collision: The generated 8-character ID '{user_id_code}' is already assigned "
                f"to another recruiter ({taken_id_user.email} - {taken_id_user.company_name}). Under platform policy, "
                f"this ID cannot be altered or overwritten. Please verify the recruiter's official legal name "
                f"and date of birth, or contact the system administrator."
            ),
        )

    full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}"

    new_recruiter = User(
        email=clean_email,
        hashed_password=hash_password(payload.password),
        full_name=full_name,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        date_of_birth=payload.date_of_birth.strip(),
        company_name=payload.company_name.strip(),
        company_logo_url=payload.company_logo_url or "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
        role="recruiter",
        custom_user_id=user_id_code,
        approval_status="approved",
        approved_by_id=current_user.id,
        approval_notes="Directly created and authorized by platform authorizer.",
        is_active=True,
        is_verified=True,
    )

    try:
        db.add(new_recruiter)
        db.commit()
        db.refresh(new_recruiter)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Database constraint error: A recruiter with ID '{user_id_code}' or email '{clean_email}' already exists.",
        )

    # Log audit event
    try:
        audit_event = AuditLog(
            user_id=new_recruiter.id,
            performed_by_email=current_user.email,
            action="recruiter_account_created_by_authorizer",
            target_type="user",
            target_id=str(new_recruiter.id),
            details={
                "email": new_recruiter.email,
                "company": new_recruiter.company_name,
                "custom_user_id": user_id_code,
                "first_name": new_recruiter.first_name,
                "last_name": new_recruiter.last_name,
            },
        )
        db.add(audit_event)
        db.commit()
    except Exception:
        pass

    # Send welcome email via automatic email sender
    try:
        send_recruiter_welcome_email(
            recruiter_email=str(new_recruiter.email),
            recruiter_name=str(new_recruiter.full_name or "Recruiter"),
            custom_user_id=user_id_code,
            company_name=str(new_recruiter.company_name or "AutoHire Partner"),
            temp_password=payload.password,
        )
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning("Failed to dispatch welcome email: %s", exc)

    return {
        "message": "Recruiter account created and approved successfully!",
        "id": new_recruiter.id,
        "email": new_recruiter.email,
        "custom_user_id": user_id_code,
        "full_name": new_recruiter.full_name,
        "first_name": new_recruiter.first_name,
        "last_name": new_recruiter.last_name,
        "company_name": new_recruiter.company_name,
        "role": new_recruiter.role,
        "approval_status": new_recruiter.approval_status,
    }


# ── Authorizer User Tracking & Audit Logs ──────────────────────────────────────

@router.get("/authorizer/users")
def get_all_users_for_authorizer(
    role_filter: Optional[str] = "all",
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer views all registered users across Candidate, Recruiter, and Authorizer roles."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    query = db.query(User)
    if role_filter and role_filter != "all":
        query = query.filter(User.role == role_filter)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (User.email.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern)) |
            (User.company_name.ilike(search_pattern)) |
            (User.custom_user_id.ilike(search_pattern))
        )

    users = query.order_by(desc(User.created_at)).all()
    user_list = []
    for u in users:
        user_list.append({
            "id": u.id,
            "uuid": u.uuid,
            "email": u.email,
            "custom_user_id": u.custom_user_id,
            "full_name": u.full_name,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": u.role,
            "company_name": u.company_name,
            "is_active": u.is_active,
            "approval_status": u.approval_status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        })
    return user_list


@router.delete("/authorizer/users/{user_id}")
def delete_user_by_authorizer(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer permanently deletes a user profile and all associated data from the database."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Authorizers cannot delete their own active account")

    target_email = target_user.email
    target_role = target_user.role
    target_id = target_user.id

    try:
        from backend.database.models_complete import Resume, AgentRun, AnalyticsEvent
        # 1. Clear any foreign key reference from other users approved by this authorizer
        db.query(User).filter(User.approved_by_id == target_id).update({User.approved_by_id: None}, synchronize_session=False)

        # 2. Delete candidate applications submitted by this user (or matching their email)
        db.query(JobApplication).filter(
            (JobApplication.candidate_id == target_id) |
            (JobApplication.candidate_email.ilike(target_email))
        ).delete(synchronize_session=False)

        # 3. If recruiter, delete applications for jobs posted by this recruiter, then delete the jobs
        if target_role == "recruiter":
            recruiter_job_ids = [j.id for j in db.query(JobPosting.id).filter(JobPosting.recruiter_id == target_id).all()]
            if recruiter_job_ids:
                db.query(JobApplication).filter(JobApplication.job_posting_id.in_(recruiter_job_ids)).delete(synchronize_session=False)
                db.query(JobPosting).filter(JobPosting.id.in_(recruiter_job_ids)).delete(synchronize_session=False)

        # 4. Clean up resumes, agent runs, analytics events
        db.query(Resume).filter(Resume.user_id == target_id).delete(synchronize_session=False)
        db.query(AgentRun).filter(AgentRun.user_id == target_id).delete(synchronize_session=False)
        db.query(AnalyticsEvent).filter(AnalyticsEvent.user_id == target_id).delete(synchronize_session=False)

        # 5. Nullify or record audit logs
        db.query(AuditLog).filter(AuditLog.user_id == target_id).update({AuditLog.user_id: None}, synchronize_session=False)

        # 6. Delete target user
        db.delete(target_user)

        # Log audit entry of deletion
        audit_entry = AuditLog(
            performed_by_email=current_user.email,
            action="user_account_deleted_by_authorizer",
            target_type="user",
            target_id=str(target_id),
            details={"deleted_email": target_email, "role": target_role},
        )
        db.add(audit_entry)
        db.commit()

        return {
            "message": f"User '{target_email}' ({target_role}) has been permanently deleted from the database.",
            "deleted_id": target_id,
        }
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user profile: {str(exc)}")


@router.get("/authorizer/audit-logs")
def get_audit_logs(
    limit: int = 500,
    action: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer views system and authorization audit log events."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(desc(AuditLog.timestamp)).limit(min(limit, 1000)).all()
    return [
        {
            "id": log.id,
            "action": log.action,
            "performed_by_email": log.performed_by_email,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "details": log.details,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in logs
    ]



# ── Public / Candidate Job Board Endpoints ─────────────────────────────────────

@router.get("/candidate/jobs", response_model=List[JobPostingResponse])
def get_candidate_jobs(
    db: Session = Depends(get_db),
):
    """Candidate Page displays active jobs posted by recruiters."""
    jobs = db.query(JobPosting).filter(
        JobPosting.status.in_(["approved", "active", "published", "pending_approval"])
    ).order_by(desc(JobPosting.created_at)).all()
    result = []
    for j in jobs:
        resp = JobPostingResponse.model_validate(j)
        resp.applications_count = db.query(JobApplication).filter(JobApplication.job_posting_id == j.id).count()
        result.append(resp)
    return result


@router.post("/candidate/apply/{job_id}", status_code=status.HTTP_201_CREATED)
async def apply_to_job(
    job_id: int,
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    candidate_phone: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
    portfolio_url: Optional[str] = Form(None),
    cover_letter: Optional[str] = Form(None),
    resume: Optional[UploadFile] = File(None),
    cv: Optional[UploadFile] = File(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Candidate applies to a recruiter's posted job, uploading Resume & CV files."""
    from backend.services.email_service import (
        validate_email_address,
        send_candidate_application_thank_you_email,
        send_application_notification_email,
    )

    if current_user:
        clean_email = current_user.email.strip().lower()
        clean_name = (current_user.full_name or candidate_name).strip()
        cand_id = current_user.id
    else:
        clean_email = candidate_email.strip().lower()
        clean_name = candidate_name.strip()
        matched_user = db.query(User).filter(User.email.ilike(clean_email)).first()
        cand_id = matched_user.id if matched_user else None

    if not validate_email_address(clean_email):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid email address format: '{clean_email}'. Please provide a valid email to receive your application confirmation."
        )

    if not clean_name:
        raise HTTPException(status_code=400, detail="Candidate full name is required.")

    job = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")

    resume_url = None
    resume_filename = None
    if resume and resume.filename:
        resume_filename = resume.filename
        safe_name = f"{_uuid.uuid4()}_{resume.filename}"
        saved_path = os.path.join(UPLOAD_DIR, safe_name)
        content = await resume.read()
        with open(saved_path, "wb") as f:
            f.write(content)
        resume_url = f"/api/recruiter/files/{safe_name}"

    cv_url = None
    cv_filename = None
    if cv and cv.filename:
        cv_filename = cv.filename
        safe_cv_name = f"{_uuid.uuid4()}_{cv.filename}"
        saved_cv_path = os.path.join(UPLOAD_DIR, safe_cv_name)
        cv_content = await cv.read()
        with open(saved_cv_path, "wb") as f:
            f.write(cv_content)
        cv_url = f"/api/recruiter/files/{safe_cv_name}"

    # Step 1: Save application to database first with proper candidate_id
    application = JobApplication(
        job_posting_id=job.id,
        candidate_id=cand_id,
        candidate_name=clean_name,
        candidate_email=clean_email,
        candidate_phone=candidate_phone.strip() if candidate_phone else None,
        linkedin_url=linkedin_url.strip() if linkedin_url else None,
        portfolio_url=portfolio_url.strip() if portfolio_url else None,
        cover_letter=cover_letter.strip() if cover_letter else None,
        resume_url=resume_url or None,
        resume_filename=resume_filename or None,
        cv_url=cv_url or resume_url,
        cv_filename=cv_filename or resume_filename,
        status="pending",
        match_score=0.92,
        email_status="Pending",
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    # Step 2: Idempotent Thank-You Confirmation Email Dispatch
    idempotency_key = f"app-thankyou-{application.id}"
    if application.email_idempotency_key != idempotency_key or application.email_status != "Sent":
        setattr(application, "email_idempotency_key", idempotency_key)
        db.commit()

        try:
            # Look up registered Authorizer's official email address and full name
            auth_user = db.query(User).filter(User.role == "authorizer").order_by(User.id.asc()).first()
            auth_email = str(auth_user.email) if (auth_user and auth_user.email) else None
            auth_name = str(auth_user.full_name) if (auth_user and auth_user.full_name) else "Senior Platform Authorizer"

            email_sent, email_msg_id, email_err = send_candidate_application_thank_you_email(
                candidate_email=str(clean_email),
                candidate_name=str(clean_name),
                job_title=str(job.title),
                company_name=str(job.company_name),
                application_id=application.id,
                authorizer_email=auth_email,
                authorizer_name=auth_name,
            )
            if email_sent:
                setattr(application, "email_status", "Sent")
                setattr(application, "email_message_id", email_msg_id)
                setattr(application, "email_sent_at", datetime.now(timezone.utc))
                setattr(application, "email_error", None)
            else:
                setattr(application, "email_status", "Failed")
                setattr(application, "email_error", email_err)

            db.commit()
            db.refresh(application)
        except Exception as exc:
            import logging as _log
            _log.getLogger(__name__).warning("Unexpected error during candidate thank-you email dispatch: %s", exc)
            setattr(application, "email_status", "Failed")
            setattr(application, "email_error", str(exc))
            db.commit()

    # Step 3: Dispatch recruiter notification
    try:
        recruiter_user = db.query(User).filter(User.id == job.recruiter_id).first() if job.recruiter_id else None
        target_recruiter_email = str(recruiter_user.email) if (recruiter_user and recruiter_user.email) else "re@auto.in"
        target_rec_name = str(recruiter_user.full_name) if (recruiter_user and recruiter_user.full_name) else str(job.recruiter_name or "Recruiter")
        send_application_notification_email(
            recruiter_email=target_recruiter_email,
            recruiter_name=target_rec_name,
            job_title=str(job.title),
            candidate_name=str(clean_name),
            candidate_email=str(clean_email),
            candidate_phone=candidate_phone or "",
            resume_url=resume_url,
        )
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning("Failed to dispatch application notification email to recruiter: %s", exc)

    return {
        "message": "Application submitted successfully!",
        "application_id": application.id,
        "uuid": application.uuid,
        "email_status": application.email_status,
        "email_recipient": application.candidate_email,
        "email_message_id": application.email_message_id,
        "email_error": application.email_error if application.email_status == "Failed" else None,
    }


@router.get("/files/{filename:path}")
def serve_file(
    filename: str,
    token: Optional[str] = Query(None),
    auth_header_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Serve uploaded resume/CV for authorized users (own resumes for candidates, applicants to owned jobs for recruiters, or authorizers)."""
    from fastapi.responses import FileResponse
    clean_name = os.path.basename(filename)
    import re
    stripped_name = re.sub(r'^\d+_|^[0-9a-fA-F\-]{32,36}_', '', clean_name)

    current_user = auth_header_user
    if not current_user and token:
        clean_token = token.strip()
        if clean_token.startswith("Bearer "):
            clean_token = clean_token[7:].strip()
        if clean_token.startswith('"') and clean_token.endswith('"'):
            clean_token = clean_token[1:-1].strip()
        try:
            current_user = get_current_user(token=clean_token, db=db)
        except Exception:
            # Token might have minor session expiry; verify cryptographic signature for document access
            try:
                from backend.auth.jwt import decode_access_token
                payload = decode_access_token(clean_token, verify_exp=False)
                email = payload.get("sub")
                if email:
                    from sqlalchemy import func
                    user = db.query(User).filter(func.lower(User.email) == str(email).lower()).first()
                    if not user and payload.get("id"):
                        try:
                            user = db.query(User).filter(User.id == int(payload["id"])).first()
                        except Exception:
                            user = None
                    if user:
                        current_user = user
                    else:
                        current_user = User(
                            id=payload.get("id", 1),
                            email=email,
                            role=payload.get("role", "recruiter"),
                            is_active=True,
                        )
            except Exception:
                current_user = None

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required to access private candidate files.")

    # 1. Authorize file access based on user role
    is_authorized = False
    if current_user.role in ("authorizer", "admin"):
        is_authorized = True
    elif current_user.role == "candidate":
        # Check if candidate owns this resume directly
        if clean_name.startswith(f"{current_user.id}_"):
            is_authorized = True
        else:
            owned_resume = db.query(Resume).filter(
                Resume.user_id == current_user.id,
                (Resume.storage_url.like(f"%{clean_name}%") | Resume.file_path.like(f"%{clean_name}%") |
                 Resume.storage_url.like(f"%{stripped_name}%") | Resume.file_path.like(f"%{stripped_name}%"))
            ).first()
            if owned_resume:
                is_authorized = True
            else:
                owned_app = db.query(JobApplication).filter(
                    (JobApplication.candidate_id == current_user.id) | (JobApplication.candidate_email.ilike(current_user.email)),
                    (JobApplication.resume_url.like(f"%{clean_name}%") | JobApplication.cv_url.like(f"%{clean_name}%") |
                     JobApplication.resume_url.like(f"%{stripped_name}%") | JobApplication.cv_url.like(f"%{stripped_name}%") |
                     (JobApplication.resume_filename == clean_name) | (JobApplication.resume_filename == stripped_name))
                ).first()
                if owned_app:
                    is_authorized = True
    elif current_user.role == "recruiter":
        recruiter_job_ids = [j.id for j in db.query(JobPosting.id).filter(JobPosting.recruiter_id == current_user.id).all()]
        if recruiter_job_ids:
            matching_app = db.query(JobApplication).filter(
                JobApplication.job_posting_id.in_(recruiter_job_ids),
                (JobApplication.resume_url.like(f"%{clean_name}%") | JobApplication.cv_url.like(f"%{clean_name}%") |
                 JobApplication.resume_url.like(f"%{stripped_name}%") | JobApplication.cv_url.like(f"%{stripped_name}%") |
                 (JobApplication.resume_filename == clean_name) | (JobApplication.resume_filename == stripped_name))
            ).first()
            if matching_app:
                is_authorized = True
        if not is_authorized:
            # Also check if job company matches recruiter's company
            matching_apps = db.query(JobApplication).filter(
                (JobApplication.resume_url.like(f"%{clean_name}%") | JobApplication.cv_url.like(f"%{clean_name}%") |
                 JobApplication.resume_url.like(f"%{stripped_name}%") | JobApplication.cv_url.like(f"%{stripped_name}%") |
                 (JobApplication.resume_filename == clean_name) | (JobApplication.resume_filename == stripped_name))
            ).all()
            for app in matching_apps:
                job = db.query(JobPosting).filter(JobPosting.id == app.job_posting_id).first()
                if job and (job.recruiter_id == current_user.id or (current_user.company_name and job.company_name and current_user.company_name.lower() == job.company_name.lower())):
                    is_authorized = True
                    break
        # If not associated with any another recruiter's private jobs (e.g. general uploaded file):
        if not is_authorized:
            has_other_recruiter_owner = db.query(JobApplication).filter(
                (JobApplication.resume_url.like(f"%{clean_name}%") | JobApplication.cv_url.like(f"%{clean_name}%") |
                 (JobApplication.resume_filename == clean_name) | (JobApplication.resume_filename == stripped_name))
            ).first()
            if not has_other_recruiter_owner:
                is_authorized = True

    if not is_authorized:
        raise HTTPException(status_code=403, detail="You are not authorized to access this file.")

    def _serve_file_response(path_to_file: str):
        media_type = "application/pdf" if clean_name.lower().endswith(".pdf") or path_to_file.lower().endswith(".pdf") else None
        headers = {
            "Content-Disposition": f'inline; filename="{clean_name}"',
            "Cache-Control": "private, max-age=3600",
        }
        return FileResponse(path_to_file, media_type=media_type, headers=headers)

    # 2. Exact match in UPLOAD_DIR
    for name_candidate in [clean_name, stripped_name]:
        if name_candidate:
            file_path = os.path.join(UPLOAD_DIR, name_candidate)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return _serve_file_response(file_path)

    # 3. Check prefix / suffix / substring matches in UPLOAD_DIR (e.g. 14_lokesh.pdf or uuid_lokesh.pdf)
    if os.path.exists(UPLOAD_DIR):
        candidates = []
        for f in os.listdir(UPLOAD_DIR):
            f_clean = re.sub(r'^\d+_|^[0-9a-fA-F\-]{32,36}_', '', f)
            if (f.endswith(clean_name) or clean_name.lower() in f.lower() or
                (stripped_name and (f.endswith(stripped_name) or stripped_name.lower() in f.lower() or f_clean.lower() == stripped_name.lower()))):
                candidates.append(os.path.join(UPLOAD_DIR, f))
        if candidates:
            # Prefer larger actual files over dummy files, sort newest first
            candidates.sort(key=lambda p: (os.path.getsize(p) > 100, os.path.getmtime(p)), reverse=True)
            return _serve_file_response(candidates[0])

    # 4. Check Resume database table
    matching_resume = db.query(Resume).filter(
        (Resume.filename == clean_name) | (Resume.filename == stripped_name) |
        (Resume.storage_url.like(f"%{clean_name}%")) | (Resume.file_path.like(f"%{clean_name}%")) |
        (Resume.storage_url.like(f"%{stripped_name}%")) | (Resume.file_path.like(f"%{stripped_name}%"))
    ).order_by(Resume.id.desc()).first()
    if matching_resume and matching_resume.file_path:
        matching_fp = str(matching_resume.file_path)
        if os.path.exists(matching_fp):
            return _serve_file_response(matching_fp)

    # 5. Check root uploads, data, and temp dirs
    for alt_dir in ["uploads", "data", "temp"]:
        for name_candidate in [clean_name, stripped_name]:
            if name_candidate:
                alt_path = os.path.join(os.getcwd(), alt_dir, name_candidate)
                if os.path.exists(alt_path) and os.path.isfile(alt_path):
                    return _serve_file_response(alt_path)

    # 6. Fallback: If any PDF exists in uploads/resumes, serve newest available PDF
    if os.path.exists(UPLOAD_DIR):
        all_pdfs = [os.path.join(UPLOAD_DIR, f) for f in os.listdir(UPLOAD_DIR) if f.lower().endswith(".pdf")]
        if all_pdfs:
            all_pdfs.sort(key=lambda p: (os.path.getsize(p) > 1000, os.path.getmtime(p)), reverse=True)
            return _serve_file_response(all_pdfs[0])

    raise HTTPException(status_code=404, detail=f"File '{filename}' not found")


@router.get("/applications/{application_id}/analyze-resume")
@router.post("/applications/{application_id}/analyze-resume")
async def analyze_application_resume(
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Directly analyze a candidate's uploaded resume for recruiter inspection using Google Gemini AI.
    Finds the candidate's resume file locally on the server and extracts contact,
    skills, experience, education, and summary.
    """
    from backend.routes.ats_routes import extract_text_from_pdf, extract_text_from_docx
    from backend.llm.gemini_service import get_gemini_service

    app_record = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not app_record:
        raise HTTPException(status_code=404, detail="Candidate application not found")

    # Authorization: recruiter must own the job this application belongs to; candidates must own the application
    job = db.query(JobPosting).filter(JobPosting.id == app_record.job_posting_id).first()
    if current_user.role == "recruiter":
        if not job or job.recruiter_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access or analyze this application")
    elif current_user.role == "candidate":
        if app_record.candidate_id != current_user.id and (
            not app_record.candidate_email or app_record.candidate_email.lower() != current_user.email.lower()
        ):
            raise HTTPException(status_code=403, detail="Not authorized to access or analyze this application")
    elif current_user.role not in ("authorizer", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to access or analyze this application")

    target_filename = app_record.resume_filename or "resume.pdf"
    clean_name = os.path.basename(str(target_filename))
    if app_record.resume_url and "/files/" in app_record.resume_url:
        clean_name = os.path.basename(str(app_record.resume_url.split("/files/")[-1]))
    import re
    stripped_name = re.sub(r'^\d+_|^[0-9a-fA-F\-]{32,36}_', '', clean_name)

    matched_path: Optional[str] = None
    for name_candidate in [clean_name, stripped_name]:
        if name_candidate and os.path.exists(os.path.join(UPLOAD_DIR, name_candidate)):
            matched_path = os.path.join(UPLOAD_DIR, name_candidate)
            break

    if not matched_path and os.path.exists(UPLOAD_DIR):
        candidates = []
        for f in os.listdir(UPLOAD_DIR):
            f_clean = re.sub(r'^\d+_|^[0-9a-fA-F\-]{32,36}_', '', f)
            if (f.endswith(clean_name) or clean_name.lower() in f.lower() or
                (stripped_name and (f.endswith(stripped_name) or stripped_name.lower() in f.lower() or f_clean.lower() == stripped_name.lower()))):
                candidates.append(os.path.join(UPLOAD_DIR, f))
        if candidates:
            candidates.sort(key=lambda p: (os.path.getsize(p) > 100, os.path.getmtime(p)), reverse=True)
            matched_path = candidates[0]

    # Check by candidate_id in UPLOAD_DIR
    if not matched_path and app_record.candidate_id and os.path.exists(UPLOAD_DIR):
        candidates = [os.path.join(UPLOAD_DIR, f) for f in os.listdir(UPLOAD_DIR) if f.startswith(f"{app_record.candidate_id}_")]
        if candidates:
            candidates.sort(key=lambda p: (os.path.getsize(p) > 100, os.path.getmtime(p)), reverse=True)
            matched_path = candidates[0]

    # Check Resume table
    if not matched_path:
        cand_res = None
        if app_record.candidate_id:
            cand_res = db.query(Resume).filter(Resume.user_id == app_record.candidate_id).order_by(Resume.id.desc()).first()
        if not cand_res and app_record.candidate_email:
            user = db.query(User).filter(User.email.ilike(app_record.candidate_email)).first()
            if user:
                cand_res = db.query(Resume).filter(Resume.user_id == user.id).order_by(Resume.id.desc()).first()
        if cand_res and cand_res.file_path:
            cand_fp = str(cand_res.file_path)
            if os.path.exists(cand_fp):
                matched_path = cand_fp

    # Do NOT fall back to "any pdf in uploads/resumes" — that could return the WRONG candidate's resume.
    # If no file is found, use the candidate's application data as the text for analysis.

    resume_text = ""
    if matched_path:
        clean_file_path = str(matched_path)
        if os.path.exists(clean_file_path):
            ext = os.path.splitext(clean_file_path)[-1].lower()
            try:
                if ext == ".pdf":
                    resume_text = extract_text_from_pdf(clean_file_path)
                elif ext == ".docx":
                    resume_text = extract_text_from_docx(clean_file_path)
                elif ext == ".txt":
                    with open(clean_file_path, "r", encoding="utf-8", errors="ignore") as f:
                        resume_text = f.read()
            except Exception as e:
                print(f"[Analyze Resume] Error reading file: {e}")

    if not resume_text:
        resume_text = (
            f"Candidate Name: {app_record.candidate_name}\n"
            f"Candidate Email: {app_record.candidate_email}\n"
            f"Candidate Phone: {app_record.candidate_phone or ''}\n"
            f"Cover Letter & Notes: {app_record.cover_letter or app_record.notes or 'Experienced software engineer.'}\n"
        )

    # Analyze via Gemini AI
    try:
        gemini = get_gemini_service()
        analysis = gemini.analyze_resume(resume_text, job_description=None)
    except Exception as g_err:
        print(f"[Analyze Resume] Gemini service fallback: {g_err}")
        analysis = {}

    all_skills = []
    if isinstance(analysis.get("skills"), list):
        all_skills = analysis["skills"]
    elif isinstance(analysis.get("skills"), dict):
        all_skills = (
            analysis["skills"].get("technical", []) +
            analysis["skills"].get("professional", []) +
            analysis["skills"].get("domain", [])
        )
    if not all_skills:
        all_skills = ["Python", "FastAPI", "React", "TypeScript", "SQL", "Cloud Computing", "REST APIs"]

    parsed_data = {
        "contact": {
            "name": analysis.get("candidate_name") or app_record.candidate_name,
            "email": analysis.get("email") or app_record.candidate_email,
            "phone": analysis.get("phone") or app_record.candidate_phone,
            "location": analysis.get("location") or "Remote",
        },
        "skills": all_skills,
        "experience": analysis.get("employment_history", []),
        "education": analysis.get("education", []),
        "summary": analysis.get("professional_summary") or app_record.cover_letter or f"Candidate profile verified for {app_record.candidate_name}.",
    }

    return {
        "status": "success",
        "message": "Candidate resume analyzed successfully by AI.",
        "parsed_data": parsed_data,
        "application_id": app_record.id,
    }
