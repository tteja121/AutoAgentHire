"""
Main API routes for AutoAgentHire application.
Handles job automation, user management, and application tracking.
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
import logging
import os
import json
import re
from pathlib import Path
from datetime import datetime

from backend.database.connection import get_db
from backend.database.crud import UserRepository, ResumeRepository
from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database.models_complete import User, JobApplication, JobPosting, Application, Resume, AuditLog
from backend.auth.validators import validate_email_format, validate_phone_number

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api"])


# ==========================================
# Request/Response Models
# ==========================================

class UserProfileCreate(BaseModel):
    """User profile creation model."""
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    linkedin_email: Optional[EmailStr] = None
    job_keywords: List[str] = Field(default_factory=list)
    preferred_locations: List[str] = Field(default_factory=list)
    job_type: str = Field(default="Remote", pattern="^(Remote|On-site|Hybrid|Any)$")
    experience_level: str = Field(default="Mid-level")
    skills: List[str] = Field(default_factory=list)
    gemini_api_key: Optional[str] = None


class JobSearchRequest(BaseModel):
    """Job search request model."""
    keywords: str = Field(..., min_length=1)
    location: str = Field(default="Remote")
    job_type: Optional[str] = None
    experience_level: Optional[str] = None
    easy_apply_only: bool = True
    max_results: int = Field(default=50, le=100)
    linkedin_email: Optional[str] = None
    linkedin_password: Optional[str] = None  # Deprecated / ignored
    submit_applications: bool = False  # Safety flag (defaults to false)


class ApplicationSubmitRequest(BaseModel):
    """Application submission request."""
    job_id: str
    cover_letter: Optional[str] = None
    additional_answers: Optional[Dict[str, str]] = None


class AgentRunRequest(BaseModel):
    """Full agent automation run request."""
    user_profile: UserProfileCreate
    search_criteria: JobSearchRequest
    auto_submit: bool = False
    min_match_score: float = Field(default=0.7, ge=0, le=1)


# ==========================================
# Global State Management
# ==========================================

class ApplicationState:
    """Tracks the current state of agent execution."""
    
    def __init__(self):
        self.status = "idle"  # idle, running, paused, completed, failed
        self.current_phase = ""  # login, searching, applying, etc.
        self.jobs_found = 0
        self.applications_submitted = 0
        self.applications_previewed = 0
        self.errors = []
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.logs = []
    
    def reset(self):
        self.__init__()
    
    def add_log(self, level: str, message: str):
        self.logs.append({
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message
        })
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "phase": self.current_phase,
            "jobs_found": self.jobs_found,
            "applications_submitted": self.applications_submitted,
            "applications_previewed": self.applications_previewed,
            "errors": self.errors,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "logs": self.logs[-20:]  # Last 20 logs
        }


# Global state instance
app_state = ApplicationState()


# ==========================================
# Routes
# ==========================================

@router.post("/run-agent")
async def run_agent(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    keyword: str = Form(...),
    location: str = Form(...),
    skills: str = Form(...),
    linkedin_email: Optional[str] = Form(None),
    linkedin_password: Optional[str] = Form(None),
    experience_level: str = Form("Any"),
    job_type: str = Form("Any"),
    salary_range: str = Form("Any"),
    max_jobs: int = Form(15),
    max_applications: int = Form(5),
    similarity_threshold: float = Form(0.6),
    auto_apply: str = Form("false"),  # Automation off by default
    first_name: str = Form(""),
    last_name: str = Form(""),
    phone_number: str = Form(""),
    linkedin_url: str = Form(""),
    portfolio_url: str = Form(""),
    city: str = Form(""),
    state: str = Form(""),
    country: str = Form(""),
    # NEW: Accept comprehensive user profile as JSON string
    user_profile_json: str = Form("{}")
):
    """
    Start the automated job application agent with resume upload and user profile.
    
    This endpoint triggers the full workflow:
    1. Upload and parse resume
    2. Login to LinkedIn
    3. Search for jobs matching criteria
    4. Evaluate job matches using AI
    5. Auto-fill application forms with user profile data (NEW)
    6. Submit applications automatically
    
    NEW: The user_profile_json parameter accepts a JSON string with complete user info
    for automatic form filling (name, contact, address, work history, education, etc.)
    """
    if app_state.status == "running":
        raise HTTPException(400, "Agent is already running")
    
    try:
        effective_email = (linkedin_email or "").strip() or os.getenv("LINKEDIN_EMAIL", "").strip() or "user@example.com"
        
        # Save resume file or use existing
        upload_dir = "uploads/resumes"
        os.makedirs(upload_dir, exist_ok=True)
        
        resume_path = ""
        if file and file.filename:
            safe_prefix = re.sub(r'[^a-zA-Z0-9_-]', '_', effective_email)
            resume_path = os.path.join(upload_dir, f"{safe_prefix}_{file.filename}")
            with open(resume_path, "wb") as f:
                content = await file.read()
                f.write(content)
            logger.info(f"Resume saved for agent run: {resume_path}")
        else:
            # Fallback to existing resume file if available
            if os.path.exists(upload_dir):
                matching = [os.path.join(upload_dir, f) for f in os.listdir(upload_dir) if f.endswith(('.pdf', '.docx', '.txt'))]
                if matching:
                    resume_path = matching[-1]
                    logger.info(f"Using existing resume for agent run: {resume_path}")
        
        # NEW: Parse user profile JSON
        try:
            user_profile = json.loads(user_profile_json) if user_profile_json else {}
        except json.JSONDecodeError:
            logger.warning("Invalid user_profile_json, using empty profile")
            user_profile = {}
        
        # Merge form fields into user profile (for backward compatibility)
        if not user_profile:
            user_profile = {}
        
        if first_name and not user_profile.get('first_name'):
            user_profile['first_name'] = first_name
        if last_name and not user_profile.get('last_name'):
            user_profile['last_name'] = last_name
        if phone_number and not user_profile.get('phone_number'):
            user_profile['phone_number'] = phone_number
        if city and not user_profile.get('city'):
            user_profile['city'] = city
        if state and not user_profile.get('state'):
            user_profile['state'] = state
        if country and not user_profile.get('country'):
            user_profile['country'] = country
        if linkedin_url and not user_profile.get('linkedin_url'):
            user_profile['linkedin_url'] = linkedin_url
        if portfolio_url and not user_profile.get('portfolio_url'):
            user_profile['portfolio_url'] = portfolio_url
        
        enable_auto_apply = os.getenv("ENABLE_AUTO_APPLY", "false").lower() in ("true", "1", "yes")
        is_auto_apply = (auto_apply.lower() in ("true", "1", "yes")) and enable_auto_apply

        # Prepare data for workflow
        data = {
            "resume_path": resume_path,
            "keyword": keyword,
            "location": location,
            "skills": skills,
            "linkedin_email": effective_email,
            "experience_level": experience_level,
            "job_type": job_type,
            "salary_range": salary_range,
            "max_jobs": max_jobs,
            "max_applications": max_applications,
            "similarity_threshold": similarity_threshold,
            "auto_apply": is_auto_apply,
            # Include individual fields for backward compatibility
            "first_name": first_name,
            "last_name": last_name,
            "phone_number": phone_number,
            "linkedin_url": linkedin_url,
            "portfolio_url": portfolio_url,
            "city": city,
            "state": state,
            "country": country,
            # NEW: Pass complete user profile to bot
            "user_profile": user_profile
        }
        
        # Reset state
        app_state.reset()
        app_state.status = "running"
        app_state.start_time = datetime.now()
        app_state.add_log("INFO", f"Agent started for {linkedin_email} with auto-fill profile")
        
        # Run in background
        background_tasks.add_task(execute_agent_workflow, data)
        
        return {
            "status": "started",
            "message": "Agent workflow started with auto-fill enabled",
            "job_id": "agent-run-1"
        }
        
    except Exception as e:
        logger.error(f"Failed to start agent: {e}", exc_info=True)
        app_state.status = "failed"
        app_state.add_log("ERROR", str(e))
        raise HTTPException(500, f"Failed to start agent: {e}")


@router.get("/agent/status")
async def get_agent_status():
    """Get current agent execution status."""
    return {
        "status": app_state.status,
        "detail": app_state.to_dict()
    }


@router.post("/agent/pause")
async def pause_agent():
    """Pause the running agent."""
    if app_state.status != "running":
        raise HTTPException(400, "Agent is not running")
    
    app_state.status = "paused"
    app_state.add_log("INFO", "Agent paused by user")
    
    return {"status": "paused"}


@router.post("/agent/resume")
async def resume_agent():
    """Resume a paused agent."""
    if app_state.status != "paused":
        raise HTTPException(400, "Agent is not paused")
    
    app_state.status = "running"
    app_state.add_log("INFO", "Agent resumed by user")
    
    return {"status": "resumed"}


@router.post("/agent/stop")
async def stop_agent():
    """Stop the running agent."""
    if app_state.status not in ["running", "paused"]:
        raise HTTPException(400, "Agent is not running or paused")
    
    app_state.status = "stopped"
    app_state.end_time = datetime.now()
    app_state.add_log("INFO", "Agent stopped by user")
    
    return {"status": "stopped"}


@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    user_email: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Upload and process resume for the authenticated user or provided email.
    Saves the file to uploads/resumes/, persists metadata and parsed data to the database,
    updates candidate user profile with skills and contact details, and returns parsed resume data.
    """
    if not file.filename or not file.filename.lower().endswith(('.pdf', '.docx', '.txt')):
        raise HTTPException(400, "Only PDF, DOCX, and TXT files are supported")

    # Resolve user
    target_user = current_user
    if not target_user and user_email:
        clean_email = user_email.strip().lower()
        target_user = UserRepository.get_by_email(db, email=clean_email)
        if not target_user:
            from backend.auth.passwords import hash_password
            import uuid as _uuid
            target_user = UserRepository.create(
                db,
                email=clean_email,
                hashed_password=hash_password(_uuid.uuid4().hex),
                full_name=clean_email.split("@")[0],
                role="candidate",
                is_active=True,
                is_verified=True,
            )

    if not target_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in or provide your email address to upload a resume."
        )

    try:
        # Save file to disk
        upload_dir = "uploads/resumes"
        os.makedirs(upload_dir, exist_ok=True)

        safe_name = f"{target_user.id}_{file.filename}"
        file_path = os.path.join(upload_dir, safe_name)

        content = await file.read()
        if not content:
            raise HTTPException(400, "Uploaded file is empty")

        with open(file_path, "wb") as f:
            f.write(content)

        file_size = len(content)
        file_ext = os.path.splitext(file.filename)[1].lower().lstrip(".")

        logger.info(f"Resume uploaded successfully: {file_path} (user_id={target_user.id})")

        # Parse resume
        try:
            from backend.parsers.resume_parser import ResumeParser
            parser = ResumeParser()
            parsed_data = parser.parse(file_path)
        except Exception as p_err:
            logger.warning(f"Resume parser error, using empty data: {p_err}")
            parsed_data = {}

        resume_text = parsed_data.get("raw_text", "")
        skills = parsed_data.get("skills", [])
        experience = parsed_data.get("experience", [])
        education = parsed_data.get("education", [])
        contact = parsed_data.get("contact", {})
        summary = parsed_data.get("summary", "")

        # Persist resume metadata and parsed details to the database
        try:
            resume = ResumeRepository.create(
                db,
                user_id=int(target_user.id),  # type: ignore
                filename=file.filename,
                file_path=file_path,
                file_size_bytes=file_size,
                file_type=file_ext,
                raw_text=resume_text,
                parsed_data=parsed_data,
                skills=skills,
                experience=experience,
                education=education,
                full_name=contact.get("name") or target_user.full_name,
                email=contact.get("email") or target_user.email,
                phone=contact.get("phone") or target_user.phone,
                location=contact.get("location") or target_user.location,
                summary=summary,
                storage_url=f"/api/recruiter/files/{safe_name}",
            )
            logger.info("Resume uploaded successfully (DB record id=%s)", resume.id)
        except Exception as db_exc:
            logger.error("DB insert failed for resume upload: %s", db_exc)
            raise HTTPException(
                status_code=500,
                detail="Resume file saved but failed to persist metadata to database.",
            )

        # Update candidate user profile with extracted skills and details
        try:
            user_updates = False
            if skills:
                target_user.default_skills = skills
                user_updates = True
            if contact.get("name"):
                target_user.full_name = contact.get("name")
                user_updates = True
            if contact.get("phone"):
                target_user.phone = contact.get("phone")
                user_updates = True
            if contact.get("location"):
                target_user.location = contact.get("location")
                user_updates = True
            if experience and isinstance(experience, list) and len(experience) > 0:
                first_exp = experience[0]
                if isinstance(first_exp, dict) and first_exp.get("title"):
                    target_user.default_experience_level = f"{first_exp.get('title')} ({len(experience)} roles)"
                    user_updates = True
            if user_updates:
                db.commit()
                db.refresh(target_user)
        except Exception as u_err:
            logger.warning(f"User profile auto-update note: {u_err}")

        # Record activity in AuditLog
        try:
            audit = AuditLog(
                user_id=target_user.id,
                performed_by_email=target_user.email,
                action="resume_uploaded",
                target_type="resume",
                target_id=str(resume.id),
                details={"filename": file.filename, "skills_count": len(skills)},
            )
            db.add(audit)
            db.commit()
        except Exception as a_err:
            logger.warning(f"Audit log record note: {a_err}")

        return {
            "status": "success",
            "resume_id": resume.id,
            "filename": file.filename,
            "file_path": file_path,
            "file_url": f"/api/recruiter/files/{safe_name}",
            "text_length": len(resume_text),
            "parsed_data": {
                "skills": skills,
                "experience": experience,
                "education": education,
                "contact": contact,
                "summary": summary,
            },
            "candidate_name": contact.get("name") or target_user.full_name or "Candidate",
            "email": contact.get("email") or target_user.email or "",
            "phone": contact.get("phone") or target_user.phone or "",
            "location": contact.get("location") or target_user.location or "",
            "skills": skills,
            "total_experience": f"{len(experience)} roles" if experience else "Experienced",
            "metadata": {
                "skills_count": len(skills),
                "experience_count": len(experience),
                "education_count": len(education),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading resume: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to process resume: {str(e)}")


@router.get("/user/resumes")
def get_user_resumes(
    current_user: Optional[User] = Depends(get_current_user_optional),
    user_email: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return all resumes for the authenticated user or provided email."""
    target_user = current_user
    if not target_user and user_email:
        target_user = UserRepository.get_by_email(db, user_email.strip())

    if not target_user:
        return {"resumes": [], "total": 0}

    resumes = ResumeRepository.get_all_for_user(db, target_user.id)
    return {
        "resumes": [
            {
                "id": r.id,
                "uuid": r.uuid,
                "filename": r.filename,
                "file_type": r.file_type,
                "file_size_bytes": r.file_size_bytes,
                "url": r.storage_url or f"/api/recruiter/files/{os.path.basename(r.file_path)}",
                "is_active": r.is_active,
                "skills": r.skills or [],
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "summary": r.summary,
            }
            for r in resumes
        ],
        "total": len(resumes),
    }


@router.get("/user/activities")
def get_user_activities(
    current_user: Optional[User] = Depends(get_current_user_optional),
    user_email: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Get consolidated candidate activity history:
    - Job applications submitted
    - Resumes uploaded / parsed
    - System / profile audit events
    """
    target_user = current_user
    if not target_user and user_email:
        target_user = UserRepository.get_by_email(db, user_email.strip())

    activities = []

    # 1. Candidate Job Applications
    app_query = db.query(JobApplication, JobPosting).join(
        JobPosting, JobApplication.job_posting_id == JobPosting.id, isouter=True
    )
    if target_user:
        app_query = app_query.filter(
            (JobApplication.candidate_email == target_user.email) |
            (JobApplication.candidate_id == target_user.id)
        )
    elif user_email:
        app_query = app_query.filter(JobApplication.candidate_email == user_email.strip())

    for app, job in app_query.order_by(JobApplication.created_at.desc()).limit(30).all():
        raw_score = app.match_score or 0.92
        score_pct = int(raw_score * 100) if raw_score <= 1.0 else int(raw_score)
        activities.append({
            "id": f"app_{app.id}",
            "type": "job_application",
            "title": f"Applied to {job.title if job else 'Position'}",
            "description": f"Application submitted to {job.company_name if job else 'Company'} with status: {app.status.capitalize()}",
            "status": app.status,
            "timestamp": app.created_at.isoformat() if app.created_at else datetime.utcnow().isoformat(),
            "meta": {
                "job_id": app.job_posting_id,
                "job_title": job.title if job else "Position",
                "company": job.company_name if job else "Company",
                "match_score": score_pct,
                "resume_url": app.resume_url,
            }
        })

    # 2. Resumes uploaded
    if target_user:
        resumes = ResumeRepository.get_all_for_user(db, target_user.id)
        for r in resumes[:15]:
            activities.append({
                "id": f"resume_{r.id}",
                "type": "resume_upload",
                "title": f"Uploaded Resume: {r.filename}",
                "description": f"Extracted {len(r.skills or [])} skills and updated candidate profile",
                "status": "completed",
                "timestamp": r.created_at.isoformat() if r.created_at else datetime.utcnow().isoformat(),
                "meta": {
                    "resume_id": r.id,
                    "filename": r.filename,
                    "skills_count": len(r.skills or []),
                }
            })

    # 3. Audit logs
    if target_user:
        logs = db.query(AuditLog).filter(
            (AuditLog.user_id == target_user.id) |
            (AuditLog.performed_by_email == target_user.email)
        ).order_by(AuditLog.timestamp.desc()).limit(20).all()
        for log in logs:
            if log.action != "resume_uploaded":  # avoid duplicate
                activities.append({
                    "id": f"audit_{log.id}",
                    "type": "audit_event",
                    "title": log.action.replace("_", " ").title(),
                    "description": f"Event logged for {log.target_type or 'profile'}",
                    "status": "completed",
                    "timestamp": log.timestamp.isoformat() if log.timestamp else datetime.utcnow().isoformat(),
                    "meta": log.details or {},
                })

    # Sort all activities chronologically (newest first)
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"activities": activities, "total": len(activities)}




# ── User Profile Update & Email Verification ─────────────────────────────────

class EmailVerificationRequest(BaseModel):
    new_email: str


class EmailVerificationConfirm(BaseModel):
    new_email: str
    code: str


class UserProfileUpdateRequest(BaseModel):
    email: Optional[str] = None
    verification_code: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    experience: Optional[str] = None
    avatar_url: Optional[str] = None
    education: Optional[str] = None
    qualification: Optional[str] = None
    job_role: Optional[str] = None
    company_name: Optional[str] = None
    bio: Optional[str] = None


@router.post("/user/email/request-verification")
def request_email_verification(
    body: EmailVerificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate and dispatch a 6-digit verification code to the proposed new official email.
    Enforces official domain requirements for Authorizers and Recruiters.
    """
    clean_email = (body.new_email or "").strip().lower()
    if not clean_email or not validate_email_format(clean_email):
        raise HTTPException(status_code=400, detail="Invalid email address format.")

    if clean_email == current_user.email.lower():
        raise HTTPException(
            status_code=400,
            detail="The specified email is already your current registered email address."
        )

    # Check official domain restrictions for Authorizers & Recruiters
    if current_user.role in ("authorizer", "recruiter"):
        from backend.routes.auth_routes import is_personal_email_domain
        if is_personal_email_domain(clean_email):
            email_domain = clean_email.split("@")[-1] if "@" in clean_email else ""
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Official corporate or work email required. Personal email domains (@{email_domain}) "
                    f"are strictly prohibited for {current_user.role.capitalize()} accounts. "
                    f"Please enter your official institutional or company email only."
                ),
            )

    # Check duplicate email
    existing_user = UserRepository.get_by_email(db, clean_email)
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(
            status_code=400,
            detail="This email address is already registered to another account."
        )

    import random
    from datetime import datetime, timezone, timedelta
    from backend.services.email_service import send_email_change_verification_code

    code = f"{random.randint(100000, 999999)}"
    current_user.pending_email = clean_email
    current_user.email_verification_code = code
    current_user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.commit()

    # Dispatch official email
    sent = send_email_change_verification_code(
        to_email=clean_email,
        user_name=current_user.full_name or "Official User",
        user_role=current_user.role,
        verification_code=code,
        expires_in_minutes=15,
    )

    logger.info(
        "Email verification code %s generated and dispatched to %s for user %s (role=%s, dispatched=%s)",
        code, clean_email, current_user.id, current_user.role, sent
    )

    return {
        "status": "success",
        "message": f"A 6-digit verification code has been dispatched to {clean_email}.",
        "pending_email": clean_email,
        "expires_in_minutes": 15,
        "dev_code": code,
    }


@router.post("/user/email/verify-code")
def verify_email_code(
    body: EmailVerificationConfirm,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify the 6-digit code and officially update the user's registered email address.
    """
    clean_email = (body.new_email or "").strip().lower()
    clean_code = (body.code or "").strip()

    if not clean_code or not clean_email:
        raise HTTPException(status_code=400, detail="Email and 6-digit verification code are required.")

    if not current_user.pending_email or current_user.pending_email.lower() != clean_email:
        raise HTTPException(
            status_code=400,
            detail="No pending verification found for this email address. Please request a new verification code."
        )

    if not current_user.email_verification_code or current_user.email_verification_code != clean_code:
        raise HTTPException(
            status_code=400,
            detail="Invalid 6-digit verification code. Please check your inbox and try again."
        )

    from datetime import datetime, timezone
    if current_user.email_verification_expires_at:
        exp = current_user.email_verification_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(
                status_code=400,
                detail="Verification code has expired. Please request a fresh code."
            )

    # Re-verify uniqueness
    existing_user = UserRepository.get_by_email(db, clean_email)
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(
            status_code=400,
            detail="This email address was recently registered to another account."
        )

    # Officially update the email!
    old_email = current_user.email
    current_user.email = clean_email
    current_user.pending_email = None
    current_user.email_verification_code = None
    current_user.email_verification_expires_at = None
    current_user.email_verified_at = datetime.now(timezone.utc)
    current_user.is_verified = True
    db.commit()
    db.refresh(current_user)

    logger.info(
        "User %s successfully verified and updated official email from %s to %s",
        current_user.id, old_email, clean_email
    )

    return {
        "status": "success",
        "message": "Official email address successfully verified and updated!",
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "company_name": getattr(current_user, "company_name", None),
            "custom_user_id": getattr(current_user, "custom_user_id", None),
        }
    }


@router.post("/user/profile")
def update_user_profile(
    body: UserProfileUpdateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Save or update user profile fields (name, phone, location, skills, experience,
    avatar_url, education, qualification, job_role, company_name, bio).
    Supports authenticated users as well as candidates identifying via email.
    """
    target_user = current_user
    if not target_user and body.email:
        clean_email = body.email.strip().lower()
        target_user = UserRepository.get_by_email(db, clean_email)
        if not target_user:
            from backend.auth.passwords import hash_password
            import uuid as _uuid
            target_user = UserRepository.create(
                db,
                email=clean_email,
                hashed_password=hash_password(_uuid.uuid4().hex),
                full_name=body.full_name or clean_email.split("@")[0],
                phone=body.phone,
                location=body.location,
                role="candidate",
                is_active=True,
                is_verified=True,
            )

    if not target_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required or valid candidate email must be provided to update profile."
        )

    # Phone validation
    if body.phone:
        phone_err = validate_phone_number(body.phone)
        if phone_err:
            raise HTTPException(status_code=400, detail=phone_err)

    update_fields: Dict[str, Any] = {}

    # Email update with official email enforcement and verification requirement for Authorizer & Recruiter
    if body.email and body.email.strip():
        new_email = body.email.strip().lower()
        if new_email != target_user.email.lower():
            if target_user.role in ("authorizer", "recruiter"):
                from backend.routes.auth_routes import is_personal_email_domain
                if is_personal_email_domain(new_email):
                    email_domain = new_email.split("@")[-1] if "@" in new_email else ""
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Official corporate or work email required. Personal email domains (@{email_domain}) "
                            f"are strictly prohibited for {target_user.role.capitalize()} accounts. "
                            f"Please enter your official institutional or company email only."
                        ),
                    )

                # Verification check: If verification code is passed, verify it; otherwise require verification process
                if body.verification_code:
                    code = str(body.verification_code).strip()
                    if not target_user.email_verification_code or target_user.email_verification_code != code:
                        raise HTTPException(status_code=400, detail="Invalid verification code. Please check your inbox.")
                    if not target_user.pending_email or target_user.pending_email.lower() != new_email:
                        raise HTTPException(status_code=400, detail="Verification code does not match this pending email.")
                    from datetime import datetime, timezone
                    if target_user.email_verification_expires_at:
                        exp = target_user.email_verification_expires_at
                        if exp.tzinfo is None:
                            exp = exp.replace(tzinfo=timezone.utc)
                        if datetime.now(timezone.utc) > exp:
                            raise HTTPException(status_code=400, detail="Verification code has expired. Please request a fresh code.")
                    # Verified!
                    target_user.pending_email = None
                    target_user.email_verification_code = None
                    target_user.email_verification_expires_at = None
                    target_user.email_verified_at = datetime.now(timezone.utc)
                    update_fields["email"] = new_email
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Email verification required: A 6-digit verification code must be requested and verified "
                            f"before updating your registered {target_user.role.capitalize()} email address."
                        )
                    )
            else:
                existing_user = UserRepository.get_by_email(db, new_email)
                if existing_user and existing_user.id != target_user.id:
                    raise HTTPException(status_code=400, detail="This email address is already registered to another account.")
                update_fields["email"] = new_email

    if body.full_name is not None:
        update_fields["full_name"] = body.full_name
    if body.phone is not None:
        update_fields["phone"] = body.phone
    if body.location is not None:
        update_fields["location"] = body.location
    if body.skills is not None:
        update_fields["default_skills"] = body.skills
    if body.experience is not None:
        update_fields["default_experience_level"] = body.experience
    if body.avatar_url is not None:
        update_fields["avatar_url"] = body.avatar_url
    if body.education is not None:
        update_fields["education"] = body.education
    if body.qualification is not None:
        update_fields["qualification"] = body.qualification
    if body.job_role is not None:
        update_fields["job_role"] = body.job_role
        update_fields["default_job_role"] = body.job_role
    if body.company_name is not None:
        update_fields["company_name"] = body.company_name
    if body.bio is not None:
        update_fields["bio"] = body.bio

    try:
        user = UserRepository.update(db, int(target_user.id), **update_fields)  # type: ignore
        if user is None:
            raise HTTPException(status_code=404, detail="User not found.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("DB update failed for user profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save user profile. Please try again.")

    logger.info("User profile saved successfully for user_id=%s", target_user.id)
    return {
        "status": "success",
        "message": "User profile saved successfully",
        "user_id": user.id,
        "updated_fields": list(update_fields.keys()),
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "location": user.location,
            "avatar_url": getattr(user, "avatar_url", None) or getattr(user, "company_logo_url", None),
            "education": getattr(user, "education", None),
            "qualification": getattr(user, "qualification", None),
            "job_role": getattr(user, "job_role", None) or getattr(user, "default_job_role", None),
            "company_name": getattr(user, "company_name", None),
            "role": user.role,
            "approval_status": getattr(user, "approval_status", "approved"),
            "custom_user_id": getattr(user, "custom_user_id", None),
        }
    }


@router.get("/user/profile")
def get_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's profile."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "location": current_user.location,
        "skills": current_user.default_skills,
        "experience": current_user.default_experience_level,
        "avatar_url": getattr(current_user, "avatar_url", None) or getattr(current_user, "company_logo_url", None),
        "education": getattr(current_user, "education", None),
        "qualification": getattr(current_user, "qualification", None),
        "job_role": getattr(current_user, "job_role", None) or getattr(current_user, "default_job_role", None),
        "company_name": getattr(current_user, "company_name", None),
        "bio": getattr(current_user, "bio", None),
        "role": current_user.role,
        "approval_status": getattr(current_user, "approval_status", "approved"),
        "custom_user_id": getattr(current_user, "custom_user_id", None),
        "created_at": str(current_user.created_at),
    }


# ── Cover Letter ──────────────────────────────────────────────────────────────

@router.post("/generate-cover-letter")
async def generate_cover_letter(
    job_title: str = Form(...),
    company: str = Form(...),
    job_description: str = Form(...),
    user_name: str = Form(...),
    resume_text: str = Form(...),
    ai_provider: str = Form("gemini"),
    api_key: Optional[str] = Form(None)
):
    """
    Generate AI-powered cover letter for a job application.
    Supports multiple AI providers: gemini, groq, openai
    """
    try:
        from backend.llm.multi_ai_service import MultiAIService, AIProvider
        
        # Validate provider
        valid_providers = ["gemini", "groq", "openai"]
        if ai_provider not in valid_providers:
            raise HTTPException(400, f"Invalid AI provider. Choose from: {', '.join(valid_providers)}")
        
        # Initialize AI service with specified provider and API key
        ai_service = MultiAIService(
            provider=ai_provider,  # type: ignore
            api_key=api_key
        )
        
        if not ai_service.is_available():
            raise HTTPException(
                400, 
                f"AI provider '{ai_provider}' is not available. Please check your API key."
            )
        
        cover_letter = ai_service.generate_cover_letter(
            job_title=job_title,
            company_name=company,
            job_description=job_description,
            resume_text=resume_text,
            user_name=user_name
        )
        
        if not cover_letter:
            raise HTTPException(500, "Failed to generate cover letter")
        
        # Save cover letter
        upload_dir = "uploads/cover_letters"
        os.makedirs(upload_dir, exist_ok=True)
        
        filename = f"{user_name}_{company}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        file_path = os.path.join(upload_dir, filename)
        
        with open(file_path, "w") as f:
            f.write(cover_letter)
        
        return {
            "status": "success",
            "cover_letter": cover_letter,
            "file_path": file_path
        }
        
    except Exception as e:
        logger.error(f"Error generating cover letter: {e}")
        raise HTTPException(500, f"Failed to generate cover letter: {e}")


@router.post("/answer-question")
async def answer_application_question(
    question: str = Form(...),
    job_title: str = Form(...),
    company: str = Form(...),
    resume_text: str = Form(...),
    max_words: Optional[int] = Form(None),
    ai_provider: str = Form("gemini"),
    api_key: Optional[str] = Form(None)
):
    """
    Generate intelligent answer to application question using AI.
    Supports multiple AI providers: gemini, groq, openai
    """
    try:
        from backend.llm.multi_ai_service import MultiAIService
        
        # Validate provider
        valid_providers = ["gemini", "groq", "openai"]
        if ai_provider not in valid_providers:
            raise HTTPException(400, f"Invalid AI provider. Choose from: {', '.join(valid_providers)}")
        
        # Initialize AI service
        ai_service = MultiAIService(
            provider=ai_provider,  # type: ignore
            api_key=api_key
        )
        
        if not ai_service.is_available():
            raise HTTPException(
                400, 
                f"AI provider '{ai_provider}' is not available. Please check your API key."
            )
        
        job_context = f"Job Title: {job_title}\nCompany: {company}"
        
        answer = ai_service.answer_question(
            question=question,
            resume_text=resume_text,
            job_context=job_context
        )
        
        if not answer:
            raise HTTPException(500, "Failed to generate answer")
        
        return {
            "status": "success",
            "question": question,
            "answer": answer
        }
        
    except Exception as e:
        logger.error(f"Error answering question: {e}")
        raise HTTPException(500, f"Failed to generate answer: {e}")


@router.post("/match-profile")
async def match_profile(
    resume_file_path: str = Form(...),
    job_description: str = Form(...),
    job_title: str = Form(""),
    company_name: str = Form(""),
    ai_provider: str = Form("gemini"),
    api_key: Optional[str] = Form(None)
):
    """
    Match a resume against a job description and return compatibility score.
    Returns match score (0-100), reasoning, strengths, concerns, and recommendation.
    
    Supports multiple AI providers: gemini, groq, openai
    """
    try:
        from backend.parsers.resume_parser import ResumeParser
        from backend.matching.profile_matcher import ProfileMatcher
        
        # Validate provider
        valid_providers = ["gemini", "groq", "openai"]
        if ai_provider not in valid_providers:
            raise HTTPException(400, f"Invalid AI provider. Choose from: {', '.join(valid_providers)}")
        
        # Check if resume file exists
        if not os.path.exists(resume_file_path):
            raise HTTPException(404, f"Resume file not found: {resume_file_path}")
        
        # Parse the resume
        parser = ResumeParser()
        resume_data = parser.parse(resume_file_path)
        
        # Match against job
        matcher = ProfileMatcher(ai_provider=ai_provider, api_key=api_key)  # type: ignore
        match_result = matcher.match_profile(
            resume_data=resume_data,
            job_description=job_description,
            job_title=job_title,
            company_name=company_name
        )
        
        return {
            "status": "success",
            "match_score": match_result["match_score"],
            "reasoning": match_result["reasoning"],
            "strengths": match_result["strengths"],
            "concerns": match_result["concerns"],
            "recommendation": match_result["recommendation"],
            "extracted_skills": resume_data.get("skills", []),
            "experience_count": len(resume_data.get("experience", []))
        }
        
    except FileNotFoundError as e:
        logger.error(f"Resume file not found: {e}")
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(f"Error matching profile: {e}")
        raise HTTPException(500, f"Failed to match profile: {e}")


@router.post("/batch-match")
async def batch_match_jobs(
    resume_file_path: str = Form(...),
    jobs: str = Form(...),  # JSON string of job list
    min_score: int = Form(0),
    ai_provider: str = Form("gemini"),
    api_key: Optional[str] = Form(None)
):
    """
    Match a resume against multiple jobs and return sorted results.
    
    Args:
        resume_file_path: Path to the uploaded resume
        jobs: JSON string containing array of job objects with title, company, description
        min_score: Minimum match score to include (0-100)
        ai_provider: AI provider (gemini, groq, openai)
        api_key: Optional API key for the provider
    
    Returns:
        List of jobs with match results, sorted by score (highest first)
    """
    try:
        import json
        from backend.parsers.resume_parser import ResumeParser
        from backend.matching.profile_matcher import ProfileMatcher
        
        # Validate provider
        valid_providers = ["gemini", "groq", "openai"]
        if ai_provider not in valid_providers:
            raise HTTPException(400, f"Invalid AI provider. Choose from: {', '.join(valid_providers)}")
        
        # Check if resume file exists
        if not os.path.exists(resume_file_path):
            raise HTTPException(404, f"Resume file not found: {resume_file_path}")
        
        # Parse jobs JSON
        try:
            jobs_list = json.loads(jobs)
            if not isinstance(jobs_list, list):
                raise ValueError("Jobs must be an array")
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Invalid JSON format for jobs: {e}")
        
        # Parse the resume
        parser = ResumeParser()
        resume_data = parser.parse(resume_file_path)
        
        # Match against all jobs
        matcher = ProfileMatcher(ai_provider=ai_provider, api_key=api_key)  # type: ignore
        results = matcher.batch_match(
            resume_data=resume_data,
            jobs=jobs_list,
            min_score=min_score
        )
        
        return {
            "status": "success",
            "total_jobs": len(jobs_list),
            "matched_jobs": len(results),
            "min_score": min_score,
            "results": results
        }
        
    except FileNotFoundError as e:
        logger.error(f"Resume file not found: {e}")
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(f"Error in batch matching: {e}")
        raise HTTPException(500, f"Failed to batch match: {e}")


@router.get("/applications")
async def get_applications(
    user_email: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Get application history from SQLite database (job_candidate_applications and applications),
    with fallback to applications.json.
    """
    try:
        # Determine effective user / email
        target_user = current_user
        if not target_user and user_email:
            target_user = UserRepository.get_by_email(db, user_email.strip())

        formatted_apps = []

        # 1. Query candidate applications from SQLite database
        query = db.query(JobApplication, JobPosting).join(
            JobPosting, JobApplication.job_posting_id == JobPosting.id, isouter=True
        )

        if target_user:
            query = query.filter(
                (JobApplication.candidate_email == target_user.email) |
                (JobApplication.candidate_id == target_user.id)
            )
        elif user_email:
            query = query.filter(JobApplication.candidate_email == user_email.strip())

        if status and status.lower() != "all":
            query = query.filter(JobApplication.status == status.lower())

        candidate_apps = query.order_by(JobApplication.created_at.desc()).limit(limit).all()

        for app, job in candidate_apps:
            raw_score = app.match_score or 0.92
            score_pct = int(raw_score * 100) if raw_score <= 1.0 else int(raw_score)
            formatted_apps.append({
                "id": app.id,
                "title": job.title if job else "Software Engineer",
                "job_title": job.title if job else "Software Engineer",
                "company": job.company_name if job else "AutoAgentHire Partner",
                "company_name": job.company_name if job else "AutoAgentHire Partner",
                "url": f"/candidate/jobs",
                "job_url": f"/candidate/jobs",
                "status": app.status or "applied",
                "applied_date": app.created_at.isoformat() if app.created_at else datetime.utcnow().isoformat(),
                "applied_at": app.created_at.isoformat() if app.created_at else datetime.utcnow().isoformat(),
                "match_score": score_pct,
                "candidate_name": app.candidate_name,
                "candidate_email": app.candidate_email,
                "candidate_phone": app.candidate_phone,
                "resume_url": app.resume_url,
                "resume_filename": app.resume_filename,
                "cv_url": app.cv_url,
                "cv_filename": app.cv_filename,
                "location": job.location if job else "Remote",
                "salary": job.salary_description if job else "Competitive",
                "interview_scheduled_at": app.interview_scheduled_at.isoformat() if getattr(app, "interview_scheduled_at", None) else None,
                "interview_meeting_link": getattr(app, "interview_meeting_link", None),
                "interview_round": getattr(app, "interview_round", None),
                "interview_notes": getattr(app, "interview_notes", None) or getattr(app, "recruiter_notes", None),
            })

        # 2. Also query bot/agent runs applications if any exist
        try:
            bot_db_apps = db.query(Application).limit(limit).all()
            for b_app in bot_db_apps:
                raw_score = b_app.match_score or 90
                score_pct = int(raw_score * 100) if raw_score <= 1.0 else int(raw_score)
                formatted_apps.append({
                    "id": b_app.id + 10000,
                    "title": b_app.job_title or "Position",
                    "job_title": b_app.job_title or "Position",
                    "company": b_app.company_name or "Company",
                    "company_name": b_app.company_name or "Company",
                    "url": b_app.job_url or "/candidate/jobs",
                    "job_url": b_app.job_url or "/candidate/jobs",
                    "status": b_app.status or "applied",
                    "applied_date": datetime.utcnow().isoformat(),
                    "applied_at": datetime.utcnow().isoformat(),
                    "match_score": score_pct,
                })
        except Exception as b_err:
            logger.debug(f"Bot db applications query note: {b_err}")

        # 3. Fallback / supplementary JSON applications file
        applications_file = Path("data") / "applications.json"
        if applications_file.exists():
            try:
                with open(applications_file, 'r') as f:
                    all_json_apps = json.load(f)

                if user_email:
                    all_json_apps = [a for a in all_json_apps if a.get("user_id") == user_email]
                if status and status.lower() != "all":
                    all_json_apps = [a for a in all_json_apps if a.get("result", {}).get("status") == status.lower()]

                for a in all_json_apps[:limit]:
                    res = a.get("result", {})
                    formatted_apps.append({
                        "id": abs(hash(res.get("url", ""))) % 1000000,
                        "title": res.get("title", "Unknown Position"),
                        "job_title": res.get("title", "Unknown Position"),
                        "company": res.get("company", "Unknown Company"),
                        "company_name": res.get("company", "Unknown Company"),
                        "url": res.get("url", "/candidate/jobs"),
                        "job_url": res.get("url", "/candidate/jobs"),
                        "status": res.get("status", "applied"),
                        "applied_date": res.get("timestamp", datetime.utcnow().isoformat()),
                        "applied_at": res.get("timestamp", datetime.utcnow().isoformat()),
                        "match_score": res.get("match_score", 90),
                    })
            except Exception as j_err:
                logger.warning(f"Failed to read applications.json: {j_err}")

        return {
            "applications": formatted_apps[:limit],
            "total": len(formatted_apps),
            "page": 1,
            "limit": limit
        }

    except Exception as e:
        logger.error(f"Failed to load applications: {e}", exc_info=True)
        return {
            "applications": [],
            "total": 0,
            "page": 1,
            "limit": limit
        }


@router.get("/jobs/search")
async def search_jobs(
    keywords: str,
    location: str = "Remote",
    max_results: int = 20
):
    """
    Search for jobs without automation (preview only).
    """
    try:
        # Try to import linkedin scraper, fallback to mock data if not available
        try:
            from backend.automation.linkedin_scraper import search_linkedin_jobs  # type: ignore
        except ImportError:
            # Return mock data if scraper not implemented yet
            logger.warning("LinkedIn scraper not implemented, returning mock data")
            return {
                "status": "success",
                "jobs": [
                    {
                        "id": "mock1",
                        "title": f"{keywords} - Mock Job 1",
                        "company": "Sample Company",
                        "location": location or "Remote",
                        "description": "This is a mock job listing. Implement linkedin_scraper.py for real jobs."
                    }
                ],
                "count": 1,
                "message": "Mock data - implement linkedin_scraper.py for real results"
            }
        
        jobs = search_linkedin_jobs(
            keywords=keywords,
            location=location,
            max_results=max_results
        )
        
        return {
            "jobs": jobs,
            "count": len(jobs)
        }
        
    except Exception as e:
        logger.error(f"Error searching jobs: {e}")
        raise HTTPException(500, f"Job search failed: {e}")


# ==========================================
# Background Task Functions
# ==========================================

async def execute_agent_workflow(data: Dict[str, Any]):
    """
    Execute the complete agent workflow in the background.
    """
    import asyncio
    
    try:
        app_state.current_phase = "initializing"
        app_state.add_log("INFO", "Initializing automation")
        
        # Initialize orchestrator
        from backend.agents.orchestrator import AgentOrchestrator
        orchestrator = AgentOrchestrator()
        
        # Prepare search criteria - handle both old and new format
        keywords = data.get("keyword", data.get("keywords", ""))
        
        search_criteria = {
            "keywords": keywords,
            "location": data.get("location", "Remote"),
            "linkedin_email": data.get("linkedin_email", ""),
            "submit": data.get("auto_apply", data.get("submit", False)),
            "resume_path": data.get("resume_path", ""),
            "max_jobs": data.get("max_jobs", 15),
            "max_applications": data.get("max_applications", 5),
            "similarity_threshold": data.get("similarity_threshold", 0.6),
            # IMPORTANT: pass through the full user profile for Easy Apply auto-fill
            "user_profile": data.get("user_profile", {})
        }
        
        app_state.current_phase = "executing"
        app_state.add_log("INFO", f"Starting job search: {search_criteria['keywords']} in {search_criteria['location']}")
        
        # Execute workflow
        result = await orchestrator.execute_job_search_workflow(
            user_id="default_user",
            search_criteria=search_criteria
        )
        
        # Update state
        app_state.jobs_found = result.get("jobs_found", 0)
        if search_criteria["submit"]:
            app_state.applications_submitted = result.get("applications_created", 0)
        else:
            app_state.applications_previewed = result.get("applications_created", 0)
        
        app_state.status = "completed"
        app_state.end_time = datetime.now()
        app_state.current_phase = "completed"
        app_state.add_log("INFO", "Workflow completed successfully")
        
    except Exception as e:
        logger.error(f"Agent workflow error: {e}", exc_info=True)
        app_state.status = "failed"
        app_state.end_time = datetime.now()
        app_state.errors.append(str(e))
        app_state.add_log("ERROR", str(e))
