"""
Recruiter & Authorizer & Candidate Job Posting and Application Routes
"""

import os
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models_complete import User, JobPosting, JobApplication, AuditLog

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
    approval_status: str
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

    # Support draft or pending_approval
    initial_status = "draft" if payload.status == "draft" else "pending_approval"

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
        timezone="America/Los_Angeles (PT)",
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
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")
    job = db.query(JobPosting).filter(JobPosting.id == job_id, JobPosting.recruiter_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found or unauthorized")
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
    for j in jobs:
        resp = JobPostingResponse.model_validate(j)
        resp.recruiter_name = str(current_user.full_name or current_user.email)
        resp.applications_count = db.query(JobApplication).filter(JobApplication.job_posting_id == j.id).count()
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
    if current_user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    if current_user.approval_status != "approved":
        raise HTTPException(status_code=403, detail="Recruiter registration request is pending Authorizer approval")
    app_record = (
        db.query(JobApplication)
        .join(JobPosting, JobApplication.job_posting_id == JobPosting.id)
        .filter(JobApplication.id == application_id, JobPosting.recruiter_id == current_user.id)
        .first()
    )
    if not app_record:
        raise HTTPException(status_code=404, detail="Candidate application not found or unauthorized")

    setattr(app_record, "status", payload.status)
    if payload.recruiter_notes is not None:
        setattr(app_record, "recruiter_notes", payload.recruiter_notes)
    if payload.interview_scheduled_at is not None:
        setattr(app_record, "interview_scheduled_at", payload.interview_scheduled_at)
    if payload.interview_meeting_link is not None:
        setattr(app_record, "interview_meeting_link", payload.interview_meeting_link.strip())
    if payload.interview_round is not None:
        setattr(app_record, "interview_round", payload.interview_round.strip())
    if payload.interview_notes is not None:
        setattr(app_record, "interview_notes", payload.interview_notes.strip())

    db.commit()
    db.refresh(app_record)
    return {
        "message": "Application status updated successfully",
        "status": app_record.status,
        "interview_scheduled_at": app_record.interview_scheduled_at.isoformat() if getattr(app_record, "interview_scheduled_at", None) else None,
        "interview_meeting_link": getattr(app_record, "interview_meeting_link", None),
        "interview_round": getattr(app_record, "interview_round", None),
    }


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

    user = db.query(User).filter(User.id == user_id, User.role == "recruiter").first()
    if not user:
        raise HTTPException(status_code=404, detail="Recruiter request not found")

    setattr(user, "approval_status", payload.status)
    setattr(user, "approved_by_id", current_user.id)
    setattr(user, "approval_notes", payload.notes or "")
    if payload.status == "approved":
        setattr(user, "is_active", True)
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
            recruiter_email=new_recruiter.email,
            recruiter_name=new_recruiter.full_name or "Recruiter",
            custom_user_id=user_id_code,
            company_name=new_recruiter.company_name or "AutoHire Partner",
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authorizer views system and authorization audit log events."""
    if current_user.role != "authorizer":
        raise HTTPException(status_code=403, detail="Authorizer permission required")

    logs = db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(100).all()
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
    """Candidate Page displays active jobs posted by recruiters (approved or active only)."""
    jobs = db.query(JobPosting).filter(JobPosting.status.in_(["approved", "active"])).order_by(desc(JobPosting.created_at)).all()
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
    db: Session = Depends(get_db),
):
    """Candidate applies to a recruiter's posted job, uploading Resume & CV files."""
    from backend.services.email_service import (
        validate_email_address,
        send_candidate_application_thank_you_email,
        send_application_notification_email,
    )

    clean_email = candidate_email.strip() if candidate_email else ""
    if not validate_email_address(clean_email):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid email address format: '{candidate_email}'. Please provide a valid email to receive your application confirmation."
        )

    clean_name = candidate_name.strip() if candidate_name else ""
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

    # Step 1: Save application to database first
    application = JobApplication(
        job_posting_id=job.id,
        candidate_name=clean_name,
        candidate_email=clean_email,
        candidate_phone=candidate_phone.strip() if candidate_phone else None,
        linkedin_url=linkedin_url.strip() if linkedin_url else None,
        portfolio_url=portfolio_url.strip() if portfolio_url else None,
        cover_letter=cover_letter.strip() if cover_letter else None,
        resume_url=resume_url or f"https://autoagenthire-resumes.local/{resume_filename or 'resume.pdf'}",
        resume_filename=resume_filename or "resume.pdf",
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
        application.email_idempotency_key = idempotency_key
        db.commit()

        try:
            # Look up registered Authorizer's official email address and full name
            auth_user = db.query(User).filter(User.role == "authorizer").order_by(User.id.asc()).first()
            auth_email = auth_user.email if auth_user else None
            auth_name = auth_user.full_name if auth_user else "Senior Platform Authorizer"

            email_sent, email_msg_id, email_err = send_candidate_application_thank_you_email(
                candidate_email=clean_email,
                candidate_name=clean_name,
                job_title=job.title,
                company_name=job.company_name,
                application_id=application.id,
                authorizer_email=auth_email,
                authorizer_name=auth_name,
            )
            if email_sent:
                application.email_status = "Sent"
                application.email_message_id = email_msg_id
                application.email_sent_at = datetime.utcnow()
                application.email_error = None
            else:
                application.email_status = "Failed"
                application.email_error = email_err

            db.commit()
            db.refresh(application)
        except Exception as exc:
            import logging as _log
            _log.getLogger(__name__).warning("Unexpected error during candidate thank-you email dispatch: %s", exc)
            application.email_status = "Failed"
            application.email_error = str(exc)
            db.commit()

    # Step 3: Dispatch recruiter notification
    try:
        recruiter_user = db.query(User).filter(User.id == job.recruiter_id).first() if job.recruiter_id else None
        target_recruiter_email = recruiter_user.email if recruiter_user else "re@auto.in"
        send_application_notification_email(
            recruiter_email=target_recruiter_email,
            recruiter_name=recruiter_user.full_name if recruiter_user else (job.recruiter_name or "Recruiter"),
            job_title=job.title,
            candidate_name=clean_name,
            candidate_email=clean_email,
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


@router.get("/files/{filename}")
def serve_file(filename: str):
    """Serve uploaded resume/CV for recruiter inspection."""
    from fastapi.responses import FileResponse
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")
