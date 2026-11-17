"""
Candidate Recommendations & Customization Preferences Routes.
Provides endpoints for:
- Automatic, resume-independent job recommendations matching candidate's manual skills, experience, and location.
- Storing and retrieving candidate customization preferences in the SQLite database.
- Skill suggestions and popular skill autocompletion.
"""
import re
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Union, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database.connection import get_db
from backend.database.models_complete import (
    User,
    ImportedJobListing,
    JobPosting,
    JobApplication,
    Application,
    CandidateJobMatch,
)
from backend.services.matching_service import (
    CandidateJobMatchingService,
    CANONICAL_SKILLS,
    normalize_skill,
    parse_experience_years,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/candidate", tags=["Candidate Recommendations"])


# ── Popular Skill Catalog ───────────────────────────────────────────────────────
POPULAR_SKILL_SUGGESTIONS: List[str] = [
    "Python", "React", "JavaScript", "TypeScript", "Java", "SQL", "FastAPI",
    "Node.js", "Machine Learning", "Docker", "Kubernetes", "AWS", "Google Cloud",
    "PostgreSQL", "MongoDB", "C++", "C#", "Go", "HTML5", "CSS3", "Tailwind CSS",
    "Git", "REST APIs", "CI/CD", "Linux", "DevOps", "GraphQL", "Agile / Scrum",
]


# ── Pydantic Request & Response Schemas ──────────────────────────────────────────

class CandidatePreferencesPayload(BaseModel):
    skills: List[str] = Field(default_factory=list, description="List of technical and professional skills")
    experience: Union[float, int, str] = Field(default=0, description="Years of experience (0 for fresher)")
    experience_level: Optional[str] = Field(default="fresher", description="'fresher' or 'experienced'")
    location: Optional[str] = Field(default="", description="Preferred location, e.g. Hyderabad, Bengaluru, Remote")
    customize_active: Optional[bool] = Field(default=False, description="Whether customize mode is currently active")


class CandidatePreferencesResponse(BaseModel):
    skills: List[str]
    experience: float
    experience_level: str
    location: str
    customize_active: bool
    last_updated: Optional[str] = None


class CustomRecommendationJobItem(BaseModel):
    id: str
    job_id: int
    job_type: str
    source: str
    title: str
    company: str
    company_logo_url: Optional[str] = None
    location: str
    workplace_type: str
    employment_type: str
    salary_range: str
    match_percentage: int
    matching_skills: List[str]
    missing_skills: List[str]
    experience_compatibility: Optional[str] = None
    suitability_reason: Optional[str] = None
    improvement_suggestions: List[str] = []
    score_breakdown: Optional[Dict[str, float]] = None
    description: str
    job_posting_url: Optional[str] = None
    posted_at: Optional[str] = None
    applied: bool = False


class CustomRecommendationsResponse(BaseModel):
    total: int
    jobs: List[CustomRecommendationJobItem]
    preferences_applied: Dict[str, Any]


# ── Helper Functions ────────────────────────────────────────────────────────────

def _normalize_skill_list(raw_skills: Union[List[str], str, None]) -> List[str]:
    """Clean, deduplicate, and normalize skills to canonical casing."""
    if not raw_skills:
        return []
    if isinstance(raw_skills, str):
        items = [s.strip() for s in re.split(r'[,|;]+', raw_skills) if s.strip()]
    else:
        items = [str(s).strip() for s in raw_skills if str(s).strip()]

    seen = set()
    normalized: List[str] = []
    for s in items:
        canon = normalize_skill(s)
        lower_canon = canon.lower()
        if lower_canon not in seen:
            seen.add(lower_canon)
            normalized.append(canon)
    return normalized


def _clean_experience_input(exp_val: Union[float, int, str, None], exp_level: Optional[str] = None) -> Tuple[float, str]:
    """Parse experience years and determine fresher vs experienced level."""
    if exp_level and exp_level.strip().lower() == "fresher":
        return 0.0, "fresher"

    if exp_val is None:
        return 0.0, "fresher"

    if isinstance(exp_val, (int, float)):
        years = max(0.0, float(exp_val))
        level = "fresher" if years == 0.0 else "experienced"
        return years, level

    # String format
    s_val = str(exp_val).strip().lower()
    if any(k in s_val for k in ["fresher", "entry", "0 year", "0-1", "none"]):
        return 0.0, "fresher"

    parsed = parse_experience_years(s_val)
    parsed = max(0.0, parsed)
    level = "fresher" if parsed == 0.0 else "experienced"
    return parsed, level


# ── Core Endpoints ──────────────────────────────────────────────────────────────

@router.get("/skills-suggestions", summary="Get catalog of popular skill suggestions")
def get_skill_suggestions(q: Optional[str] = Query(None, description="Optional search prefix")):
    """Returns standard skill suggestions for autocompletion."""
    clean_q = str(q).strip().lower() if isinstance(q, str) and not hasattr(q, "default") and q.strip() else None
    if not clean_q:
        return {"skills": POPULAR_SKILL_SUGGESTIONS}

    filtered = [s for s in POPULAR_SKILL_SUGGESTIONS if clean_q in s.lower()]
    return {"skills": filtered}


@router.get("/preferences", response_model=CandidatePreferencesResponse, summary="Get candidate customization preferences")
def get_candidate_preferences(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Retrieves the persisted customization preferences for the candidate.
    If the user has not explicitly configured preferences yet, returns clean defaults.
    """
    clean_user = current_user if isinstance(current_user, User) and hasattr(current_user, "id") else None
    if not clean_user:
        return CandidatePreferencesResponse(
            skills=[],
            experience=0.0,
            experience_level="fresher",
            location="",
            customize_active=False,
            last_updated=None,
        )

    # Extract stored values from User model
    raw_skills = clean_user.default_skills
    skills = _normalize_skill_list(raw_skills)

    exp_years, exp_level = _clean_experience_input(clean_user.default_experience_level)
    location = (clean_user.default_location or clean_user.location or "").strip()

    # Check notification_preferences or dedicated JSON for customize_active flag
    user_prefs = clean_user.notification_preferences or {}
    customize_active = bool(user_prefs.get("customize_active", False)) if isinstance(user_prefs, dict) else False

    updated_str = clean_user.updated_at.isoformat() if clean_user.updated_at else None

    return CandidatePreferencesResponse(
        skills=skills,
        experience=exp_years,
        experience_level=exp_level,
        location=location,
        customize_active=customize_active,
        last_updated=updated_str,
    )


@router.put("/preferences", response_model=CandidatePreferencesResponse, summary="Save candidate customization preferences")
@router.post("/preferences", response_model=CandidatePreferencesResponse, summary="Save candidate customization preferences (POST alias)")
def save_candidate_preferences(
    payload: CandidatePreferencesPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Persists candidate's customization preferences into SQLite database.
    Retains preferences across navigation, page refreshes, and future sessions.
    """
    from sqlalchemy.orm.attributes import flag_modified

    skills = _normalize_skill_list(payload.skills)
    years, level = _clean_experience_input(payload.experience, payload.experience_level)
    clean_location = (payload.location or "").strip()

    # Update User record
    current_user.default_skills = skills
    current_user.default_experience_level = "fresher" if years == 0.0 else f"{years:.1f}"
    current_user.default_location = clean_location
    if clean_location and not current_user.location:
        current_user.location = clean_location

    # Persist customize_active toggle state
    existing_prefs = current_user.notification_preferences or {}
    if not isinstance(existing_prefs, dict):
        existing_prefs = {}
    new_prefs = dict(existing_prefs)
    new_prefs["customize_active"] = bool(payload.customize_active)
    current_user.notification_preferences = new_prefs
    flag_modified(current_user, "notification_preferences")

    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)

    logger.info(f"Updated customization preferences for user_id={current_user.id}: skills={len(skills)}, exp={years}, loc={clean_location}")

    return CandidatePreferencesResponse(
        skills=skills,
        experience=years,
        experience_level=level,
        location=clean_location,
        customize_active=bool(payload.customize_active),
        last_updated=current_user.updated_at.isoformat() if current_user.updated_at else None,
    )


@router.get("/recommendations", response_model=CustomRecommendationsResponse, summary="Get automatic customized job recommendations")
@router.post("/recommendations", response_model=CustomRecommendationsResponse, summary="Get automatic customized job recommendations (POST)")
def get_custom_job_recommendations(
    # Optional GET Query parameters
    skills: Optional[str] = Query(None, description="Comma-separated skill keywords or list"),
    experience: Optional[Union[float, int, str]] = Query(None, description="Years of experience (0 for fresher)"),
    experience_level: Optional[str] = Query("fresher", description="'fresher' or 'experienced'"),
    location: Optional[str] = Query(None, description="Preferred location, e.g. Hyderabad, Bengaluru, Remote"),
    min_threshold: Optional[int] = Query(35, ge=0, le=100, description="Minimum match percentage"),
    limit: Optional[int] = Query(50, ge=1, le=100, description="Max jobs to return"),
    # Optional POST body payload
    body: Optional[CandidatePreferencesPayload] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Computes grounded, explainable job recommendations based strictly on candidate's
    manually customized skills, experience, and location preferences without requiring a resume.
    
    Evaluates all active jobs across connected ATS platforms (Greenhouse, Lever, Ashby, Workable)
    and internal recruiter vacancies, ranking by deterministic 6-factor relevance.
    """
    # 1. Resolve inputs (prefer JSON body if provided, fallback to GET query parameters, fallback to user DB prefs)
    clean_user = current_user if isinstance(current_user, User) and hasattr(current_user, "id") else None

    input_skills: List[str] = []
    raw_exp: Any = None
    input_level: Optional[str] = None
    input_loc: Optional[str] = None

    if body is not None:
        input_skills = body.skills or []
        raw_exp = body.experience
        input_level = body.experience_level
        input_loc = body.location
    else:
        if skills and not hasattr(skills, "default"):
            input_skills = [s.strip() for s in str(skills).split(",") if s.strip()]
        if experience is not None and not hasattr(experience, "default"):
            raw_exp = experience
        if experience_level and not hasattr(experience_level, "default"):
            input_level = experience_level
        if location and not hasattr(location, "default"):
            input_loc = location

    # If parameters were not provided at all, fallback to candidate's stored DB preferences if logged in
    if not input_skills and raw_exp is None and not input_loc and clean_user:
        input_skills = clean_user.default_skills or []
        raw_exp = clean_user.default_experience_level
        input_loc = clean_user.default_location or clean_user.location or ""

    clean_skills = _normalize_skill_list(input_skills)
    exp_years, clean_level = _clean_experience_input(raw_exp, input_level)
    clean_location = (input_loc or "").strip()
    clean_threshold = int(min_threshold) if isinstance(min_threshold, (int, float)) else 35
    clean_limit = int(limit) if isinstance(limit, (int, float)) else 50

    # 2. Build Candidate Profile dictionary for matching service
    exp_display = "Fresher / Entry-Level (0 years)" if exp_years == 0.0 else f"{exp_years:.1f} years"
    cand_profile: Dict[str, Any] = {
        "skills": clean_skills,
        "total_experience": exp_display,
        "years_of_experience": exp_years,
        "location": clean_location,
        "current_job_title": "",
        "job_title": "",
        "professional_summary": f"Candidate specializing in {', '.join(clean_skills[:5]) if clean_skills else 'software development'} with {exp_display} looking for opportunities in {clean_location or 'Any location'}.",
        "education": [],
        "raw_text": " ".join(clean_skills),
    }

    # 3. Retrieve all active target jobs from database
    imported_jobs = (
        db.query(ImportedJobListing)
        .filter(ImportedJobListing.status == "active")
        .all()
    )

    recruiter_jobs = (
        db.query(JobPosting)
        .filter(JobPosting.status.in_(["approved", "active", "published"]))
        .all()
    )

    target_jobs: List[Dict[str, Any]] = []

    for imp in imported_jobs:
        target_jobs.append({
            "id": imp.id,
            "job_type": "imported",
            "source": imp.provider or "imported",
            "title": imp.title,
            "company_name": imp.company_name,
            "company_logo_url": imp.company_logo_url,
            "description": imp.description or "",
            "location": imp.location or "Remote",
            "workplace_type": imp.workplace_type or "remote",
            "employment_type": imp.employment_type or "Full-time",
            "salary": imp.salary or "Competitive",
            "skills": imp.skills or [],
            "job_posting_url": imp.job_posting_url,
            "posted_at": imp.posted_at.isoformat() if imp.posted_at else None,
        })

    for rec in recruiter_jobs:
        target_jobs.append({
            "id": rec.id,
            "job_type": "recruiter",
            "source": "recruiter",
            "title": rec.title,
            "company_name": rec.company_name,
            "company_logo_url": rec.company_logo_url,
            "description": rec.description or "",
            "location": rec.location or "Remote",
            "workplace_type": "remote" if "remote" in (rec.location or "").lower() else "on-site",
            "employment_type": rec.job_type or "Full-time",
            "salary": rec.salary_description or "Competitive",
            "skills": [s.strip() for s in (rec.skills or "").split(",") if s.strip()],
            "job_posting_url": None,
            "posted_at": rec.created_at.isoformat() if rec.created_at else None,
        })

    # 4. Check if authenticated candidate has applied to any of these jobs
    applied_job_ids = set()
    applied_urls = set()

    if clean_user:
        user_apps = db.query(JobApplication.job_posting_id).filter(JobApplication.candidate_id == clean_user.id).all()
        for a in user_apps:
            if a and a[0]:
                applied_job_ids.add(a[0])

        try:
            from backend.database.models_complete import AgentRun
            agent_apps = (
                db.query(Application.job_url)
                .join(AgentRun, Application.agent_run_id == AgentRun.id)
                .filter(AgentRun.user_id == clean_user.id)
                .all()
            )
            for a in agent_apps:
                if a and a[0]:
                    applied_urls.add(a[0])
        except Exception:
            pass

    # 5. Evaluate compatibility using deterministic 6-factor model
    scored_items: List[CustomRecommendationJobItem] = []

    for job in target_jobs:
        score_res = CandidateJobMatchingService.score_candidate_job(cand_profile, job)
        match_pct = score_res.get("match_percentage", 50)

        # Apply minimum threshold filter
        if match_pct < clean_threshold:
            continue

        is_applied = False
        if job["job_type"] == "recruiter" and job["id"] in applied_job_ids:
            is_applied = True
        elif job.get("job_posting_url") and job["job_posting_url"] in applied_urls:
            is_applied = True

        scored_items.append(
            CustomRecommendationJobItem(
                id=str(job["id"]),
                job_id=job["id"],
                job_type=job["job_type"],
                source=job["source"],
                title=job["title"],
                company=job["company_name"],
                company_logo_url=job.get("company_logo_url"),
                location=job["location"],
                workplace_type=job["workplace_type"],
                employment_type=job["employment_type"],
                salary_range=job["salary"],
                match_percentage=match_pct,
                matching_skills=score_res.get("matching_skills", []),
                missing_skills=score_res.get("missing_skills", []),
                experience_compatibility=score_res.get("experience_compatibility"),
                suitability_reason=score_res.get("suitability_reason"),
                improvement_suggestions=score_res.get("improvement_suggestions", []),
                score_breakdown=score_res.get("score_breakdown"),
                description=job["description"][:380] + ("..." if len(job["description"]) > 380 else ""),
                job_posting_url=job.get("job_posting_url"),
                posted_at=job.get("posted_at"),
                applied=is_applied,
            )
        )

    # 6. Rank in descending order of match percentage
    scored_items.sort(key=lambda x: x.match_percentage, reverse=True)

    # Limit results
    final_jobs = scored_items[:clean_limit]

    return CustomRecommendationsResponse(
        total=len(final_jobs),
        jobs=final_jobs,
        preferences_applied={
            "skills": clean_skills,
            "experience": exp_years,
            "experience_level": clean_level,
            "location": clean_location,
            "min_threshold": clean_threshold,
        },
    )
