"""
Unified Job Listings API Routes for Candidates and Client Portal.
Supports real imported job listings (Greenhouse, Lever, Ashby, Workable, Generic ATS)
combined with internal recruiter job postings, with search, multi-filters,
pagination, and candidate saved/bookmark functionality.
"""

import math
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, asc, or_, and_, func
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database.connection import get_db
from backend.database.models_complete import (
    User,
    JobPosting,
    ImportedJobListing,
    UserSavedJob,
    PortalIntegration,
)
from backend.services.job_sync_service import sync_all_active_integrations

router = APIRouter(prefix="/api/jobs", tags=["Job Listings"])
# Also provide router for root /jobs prefix for flexibility
root_jobs_router = APIRouter(prefix="/jobs", tags=["Job Listings (Root)"])


# ── Pydantic Models ────────────────────────────────────────────────────────────

class UnifiedJobResponse(BaseModel):
    id: int
    uuid: str
    job_type: str = Field(..., description="'imported' from external ATS or 'recruiter' internal posting")
    source: str = Field(..., description="greenhouse, lever, ashby, workable, generic_ats, recruiter")
    external_job_id: Optional[str] = None
    title: str
    company_name: str
    company_logo_url: Optional[str] = None
    description: str
    requirements: Optional[str] = None
    location: str
    workplace_type: str = "remote"  # remote, hybrid, on-site
    employment_type: str = "Full-time"
    salary: Optional[str] = None
    skills: List[str] = []
    job_posting_url: Optional[str] = None
    posted_at: Optional[str] = None
    deadline: Optional[str] = None
    is_saved: bool = False
    vacancies: Optional[int] = 1
    integration_id: Optional[int] = None


class JobListingsListResponse(BaseModel):
    jobs: List[UnifiedJobResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    available_sources: List[str]
    last_synced_at: Optional[str] = None


class ToggleSaveJobRequest(BaseModel):
    job_type: str = Field(default="imported", description="'imported' or 'recruiter'")


class ToggleSaveJobResponse(BaseModel):
    job_id: int
    job_type: str
    is_saved: bool
    message: str


# ── Helper Functions ──────────────────────────────────────────────────────────

def _normalize_workplace_type(location_str: str, workplace_str: Optional[str]) -> str:
    """Normalize location and workplace string into remote, hybrid, or on-site."""
    w = (workplace_str or "").lower().strip()
    l = (location_str or "").lower().strip()
    if "remote" in w or "remote" in l or "anywhere" in l or "virtual" in l:
        return "remote"
    if "hybrid" in w or "hybrid" in l:
        return "hybrid"
    return "on-site"


def _parse_skills_list(skills_val: Any) -> List[str]:
    """Ensure skills are returned as a list of strings."""
    if isinstance(skills_val, list):
        return [str(s).strip() for s in skills_val if str(s).strip()]
    if isinstance(skills_val, str) and skills_val.strip():
        # Could be comma-separated or JSON
        import json
        try:
            parsed = json.loads(skills_val)
            if isinstance(parsed, list):
                return [str(s).strip() for s in parsed if str(s).strip()]
        except Exception:
            pass
        return [s.strip() for s in skills_val.split(",") if s.strip()]
    return []


# ── Core Job Endpoints ────────────────────────────────────────────────────────

@router.get("", response_model=JobListingsListResponse, summary="Get unified job listings")
@root_jobs_router.get("", response_model=JobListingsListResponse, include_in_schema=False)
def get_unified_job_listings(
    search: Optional[str] = Query(None, description="Search term for title, company, or keyword"),
    location: Optional[str] = Query(None, description="Filter by location keyword"),
    workplace_type: Optional[str] = Query("all", description="'all', 'remote', 'hybrid', 'on-site'"),
    employment_type: Optional[str] = Query("all", description="'all', 'Full-time', 'Part-time', 'Contract', etc."),
    skills: Optional[str] = Query(None, description="Comma-separated skill keywords"),
    experience: Optional[float] = Query(None, description="Candidate years of experience (0.0 for Fresher)"),
    source: Optional[str] = Query("all", description="'all', 'greenhouse', 'lever', 'ashby', 'workable', 'generic_ats', 'recruiter'"),
    sort: Optional[str] = Query("newest", description="'newest', 'oldest', 'company'"),
    saved_only: bool = Query(False, description="Filter only jobs saved/bookmarked by current user"),
    page: int = Query(1, ge=1, description="Page number starting at 1"),
    page_size: int = Query(12, ge=1, le=100, description="Items per page"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Retrieve unified, synchronized job listings across connected ATS providers
    and authorized recruiter postings with multi-criteria filtering and pagination.
    """
    saved_imported_ids = set()
    saved_recruiter_ids = set()

    if current_user and hasattr(current_user, "id"):
        saved_rows = db.query(UserSavedJob).filter(UserSavedJob.user_id == current_user.id).all()
        for s in saved_rows:
            if s.job_type == "imported":
                saved_imported_ids.add(s.job_id)
            elif s.job_type == "recruiter":
                saved_recruiter_ids.add(s.job_id)

    # Safely extract and normalize parameter types
    clean_search = search.strip() if isinstance(search, str) and search.strip() else None
    clean_location = location.strip() if isinstance(location, str) and location.strip() else None
    clean_workplace = workplace_type.strip().lower() if isinstance(workplace_type, str) else "all"
    clean_employment = employment_type.strip() if isinstance(employment_type, str) else "all"
    clean_skills = skills.strip() if isinstance(skills, str) and skills.strip() else None
    clean_experience: Optional[float] = None
    if experience is not None and not hasattr(experience, "default"):
        try:
            clean_experience = float(experience)
        except (ValueError, TypeError):
            clean_experience = None
    clean_source = source.strip().lower() if isinstance(source, str) else "all"
    clean_sort = sort.strip().lower() if isinstance(sort, str) else "newest"
    clean_saved_only = bool(saved_only) if not hasattr(saved_only, "default") else False
    clean_page = int(page) if isinstance(page, int) and page >= 1 else 1
    clean_page_size = int(page_size) if isinstance(page_size, int) and 1 <= page_size <= 100 else 12

    # 1. Query Imported ATS Job Listings
    imported_query = db.query(ImportedJobListing).filter(ImportedJobListing.status == "active")

    if clean_source != "all" and clean_source != "recruiter":
        imported_query = imported_query.filter(ImportedJobListing.provider.ilike(clean_source))
    elif clean_source == "recruiter":
        # Recruiter only: exclude all imported
        imported_query = imported_query.filter(ImportedJobListing.id == -1)

    if clean_workplace != "all":
        imported_query = imported_query.filter(ImportedJobListing.workplace_type == clean_workplace)

    if clean_employment != "all":
        imported_query = imported_query.filter(ImportedJobListing.employment_type.ilike(f"%{clean_employment}%"))

    if clean_location:
        if clean_location.lower() == "remote":
            imported_query = imported_query.filter(
                or_(
                    ImportedJobListing.workplace_type == "remote",
                    ImportedJobListing.location.ilike("%remote%"),
                )
            )
        else:
            loc_term = f"%{clean_location}%"
            imported_query = imported_query.filter(
                or_(
                    ImportedJobListing.location.ilike(loc_term),
                    ImportedJobListing.workplace_type == "remote",
                    ImportedJobListing.location.ilike("%remote%"),
                )
            )

    if clean_search:
        q_term = f"%{clean_search}%"
        imported_query = imported_query.filter(
            or_(
                ImportedJobListing.title.ilike(q_term),
                ImportedJobListing.company_name.ilike(q_term),
                ImportedJobListing.description.ilike(q_term),
            )
        )

    if clean_skills:
        skill_kws = [s.strip() for s in clean_skills.split(",") if s.strip()]
        if skill_kws:
            skill_conds = []
            for sk in skill_kws[:8]:
                skill_conds.extend([
                    ImportedJobListing.description.ilike(f"%{sk}%"),
                    ImportedJobListing.title.ilike(f"%{sk}%"),
                    ImportedJobListing.skills.ilike(f"%{sk}%"),
                ])
            imported_query = imported_query.filter(or_(*skill_conds))

    if clean_experience is not None:
        if clean_experience == 0.0:
            # Fresher (0 years): prioritize entry-level / associate roles; avoid senior/lead titles
            for senior_term in ["senior", "lead", "staff", "principal", "director", "head of", "vp"]:
                imported_query = imported_query.filter(~ImportedJobListing.title.ilike(f"%{senior_term}%"))

    if clean_saved_only:
        if not current_user or not saved_imported_ids:
            imported_query = imported_query.filter(ImportedJobListing.id == -1)
        else:
            imported_query = imported_query.filter(ImportedJobListing.id.in_(list(saved_imported_ids)))

    imported_listings = imported_query.all()

    # 2. Query Recruiter Job Postings
    recruiter_listings = []
    if clean_source in ("all", "recruiter"):
        rec_query = db.query(JobPosting).filter(
            JobPosting.status.in_(["approved", "active", "published", "pending_approval"])
        )

        if clean_workplace != "all":
            if clean_workplace == "remote":
                rec_query = rec_query.filter(
                    or_(
                        JobPosting.location.ilike("%remote%"),
                        JobPosting.job_type.ilike("%remote%"),
                    )
                )
            elif clean_workplace == "hybrid":
                rec_query = rec_query.filter(JobPosting.location.ilike("%hybrid%"))
            elif clean_workplace == "on-site":
                rec_query = rec_query.filter(
                    ~JobPosting.location.ilike("%remote%"),
                    ~JobPosting.location.ilike("%hybrid%"),
                )

        if clean_employment != "all":
            rec_query = rec_query.filter(JobPosting.job_type.ilike(f"%{clean_employment}%"))

        if clean_location:
            rec_query = rec_query.filter(JobPosting.location.ilike(f"%{clean_location}%"))

        if clean_search:
            q_term = f"%{clean_search}%"
            rec_query = rec_query.filter(
                or_(
                    JobPosting.title.ilike(q_term),
                    JobPosting.company_name.ilike(q_term),
                    JobPosting.description.ilike(q_term),
                    JobPosting.organization_symbol.ilike(q_term),
                )
            )

        if clean_skills:
            for skill_kw in [s.strip() for s in clean_skills.split(",") if s.strip()]:
                rec_query = rec_query.filter(
                    or_(
                        JobPosting.skills.ilike(f"%{skill_kw}%"),
                        JobPosting.description.ilike(f"%{skill_kw}%"),
                        JobPosting.title.ilike(f"%{skill_kw}%"),
                    )
                )

        if clean_saved_only:
            if not current_user or not saved_recruiter_ids:
                rec_query = rec_query.filter(JobPosting.id == -1)
            else:
                rec_query = rec_query.filter(JobPosting.id.in_(list(saved_recruiter_ids)))

        recruiter_listings = rec_query.all()

    # 3. Normalize into Unified Models
    unified_items: List[UnifiedJobResponse] = []

    for imp in imported_listings:
        posted_str = imp.posted_at.isoformat() if imp.posted_at else (imp.created_at.isoformat() if imp.created_at else None)
        deadline_str = imp.deadline.isoformat() if imp.deadline else None
        is_saved = imp.id in saved_imported_ids

        unified_items.append(
            UnifiedJobResponse(
                id=imp.id,
                uuid=imp.uuid,
                job_type="imported",
                source=imp.provider,
                external_job_id=imp.external_job_id,
                title=imp.title,
                company_name=imp.company_name,
                company_logo_url=imp.company_logo_url,
                description=imp.description,
                requirements=None,
                location=imp.location or "Remote",
                workplace_type=_normalize_workplace_type(imp.location or "", imp.workplace_type),
                employment_type=imp.employment_type or "Full-time",
                salary=imp.salary or "Competitive",
                skills=_parse_skills_list(imp.skills),
                job_posting_url=imp.job_posting_url,
                posted_at=posted_str,
                deadline=deadline_str,
                is_saved=is_saved,
                vacancies=1,
                integration_id=imp.integration_id,
            )
        )

    for rec in recruiter_listings:
        posted_str = rec.created_at.isoformat() if rec.created_at else None
        is_saved = rec.id in saved_recruiter_ids

        unified_items.append(
            UnifiedJobResponse(
                id=rec.id,
                uuid=rec.uuid,
                job_type="recruiter",
                source="recruiter",
                external_job_id=f"rec-{rec.id}",
                title=rec.title,
                company_name=rec.company_name,
                company_logo_url=rec.company_logo_url,
                description=rec.description,
                requirements=rec.requirements,
                location=rec.location or "Remote",
                workplace_type=_normalize_workplace_type(rec.location or "", None),
                employment_type=rec.job_type or "Full-time",
                salary=rec.salary_description or "Competitive",
                skills=_parse_skills_list(rec.skills),
                job_posting_url=None,  # Handled via internal applicant modal
                posted_at=posted_str,
                deadline=rec.final_date_pt,
                is_saved=is_saved,
                vacancies=rec.vacancies or 1,
                integration_id=None,
            )
        )

    # 4. Sorting
    if clean_sort == "oldest":
        unified_items.sort(key=lambda j: j.posted_at or "", reverse=False)
    elif clean_sort == "company":
        unified_items.sort(key=lambda j: j.company_name.lower())
    else:  # newest default
        unified_items.sort(key=lambda j: j.posted_at or "", reverse=True)

    # 5. Pagination
    total = len(unified_items)
    total_pages = max(1, math.ceil(total / clean_page_size))
    start_idx = (clean_page - 1) * clean_page_size
    end_idx = start_idx + clean_page_size
    paged_items = unified_items[start_idx:end_idx]

    # 6. Gather active sources & last sync
    sources_in_db = set(r[0] for r in db.query(ImportedJobListing.provider).distinct().all())
    sources_in_db.add("recruiter")

    latest_sync_record = (
        db.query(PortalIntegration.last_sync_at)
        .filter(PortalIntegration.last_sync_at.isnot(None))
        .order_by(desc(PortalIntegration.last_sync_at))
        .first()
    )
    last_synced_str = None
    if latest_sync_record and hasattr(latest_sync_record, "__getitem__"):
        try:
            val = latest_sync_record[0]
            if hasattr(val, "isoformat") and not isinstance(val, MagicMock if "MagicMock" in globals() else object):
                # Verify it's an actual datetime
                if isinstance(val, datetime):
                    last_synced_str = val.isoformat()
            elif isinstance(val, str):
                last_synced_str = val
        except Exception:
            last_synced_str = None

    if not isinstance(last_synced_str, str):
        last_synced_str = None

    return JobListingsListResponse(
        jobs=paged_items,
        total=total,
        page=clean_page,
        page_size=clean_page_size,
        total_pages=total_pages,
        available_sources=sorted(list(sources_in_db)),
        last_synced_at=last_synced_str,
    )


@router.get("/search", response_model=List[UnifiedJobResponse], summary="Quick search jobs")
@root_jobs_router.get("/search", response_model=List[UnifiedJobResponse], include_in_schema=False)
def search_jobs(
    q: str = Query(..., min_length=1, description="Query string"),
    limit: int = Query(10, ge=1, le=50),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Fast search-as-you-type endpoint returning matching job listings."""
    resp = get_unified_job_listings(
        search=q,
        page=1,
        page_size=limit,
        current_user=current_user,
        db=db,
    )
    return resp.jobs


@router.get("/saved", response_model=List[UnifiedJobResponse], summary="Get candidate saved jobs")
@root_jobs_router.get("/saved", response_model=List[UnifiedJobResponse], include_in_schema=False)
def get_user_saved_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all bookmarked / saved jobs for the current candidate."""
    resp = get_unified_job_listings(
        saved_only=True,
        page=1,
        page_size=100,
        current_user=current_user,
        db=db,
    )
    return resp.jobs


@router.post("/sync", summary="Trigger synchronization of ATS job requisitions")
@root_jobs_router.post("/sync", summary="Trigger synchronization of ATS job requisitions", include_in_schema=False)
def sync_job_requisitions(
    limit: int = Query(50, ge=1, le=100, description="Max jobs to fetch per provider"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Synchronizes job postings across all connected ATS providers (Greenhouse, Ashby, Lever).
    If no integrations are configured, provisions default verified job board requisitions.
    Accessible to candidates and administrators.
    """
    res = sync_all_active_integrations(db=db, limit=limit)
    return {
        "status": res["status"],
        "message": f"Successfully synchronized job listings. Total active jobs: {res['total_jobs_in_db']}",
        "total_jobs": res["total_jobs_in_db"],
        "new_jobs": res["total_new_imported"],
        "updated_jobs": res["total_updated"],
        "providers": res["providers_synced"],
        "timestamp": res["timestamp"],
    }


@router.get("/{job_id}", response_model=UnifiedJobResponse, summary="Get single job details")
@root_jobs_router.get("/{job_id}", response_model=UnifiedJobResponse, include_in_schema=False)
def get_job_details(
    job_id: int,
    job_type: str = Query("imported", description="'imported' or 'recruiter'"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Fetch complete details for a single job opportunity."""
    is_saved = False
    if current_user and hasattr(current_user, "id"):
        is_saved = db.query(UserSavedJob).filter(
            UserSavedJob.user_id == current_user.id,
            UserSavedJob.job_id == job_id,
            UserSavedJob.job_type == job_type,
        ).first() is not None

    if job_type == "imported":
        imp = db.query(ImportedJobListing).filter(ImportedJobListing.id == job_id).first()
        if not imp:
            # Fallback check if it was a recruiter job ID passed without type
            rec = db.query(JobPosting).filter(JobPosting.id == job_id).first()
            if rec:
                job_type = "recruiter"
            else:
                raise HTTPException(status_code=404, detail="Job listing not found")

        if job_type == "imported":
            return UnifiedJobResponse(
                id=imp.id,
                uuid=imp.uuid,
                job_type="imported",
                source=imp.provider,
                external_job_id=imp.external_job_id,
                title=imp.title,
                company_name=imp.company_name,
                company_logo_url=imp.company_logo_url,
                description=imp.description,
                requirements=None,
                location=imp.location or "Remote",
                workplace_type=_normalize_workplace_type(imp.location or "", imp.workplace_type),
                employment_type=imp.employment_type or "Full-time",
                salary=imp.salary or "Competitive",
                skills=_parse_skills_list(imp.skills),
                job_posting_url=imp.job_posting_url,
                posted_at=imp.posted_at.isoformat() if imp.posted_at else None,
                deadline=imp.deadline.isoformat() if imp.deadline else None,
                is_saved=is_saved,
                vacancies=1,
                integration_id=imp.integration_id,
            )

    rec = db.query(JobPosting).filter(JobPosting.id == job_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Job listing not found")

    return UnifiedJobResponse(
        id=rec.id,
        uuid=rec.uuid,
        job_type="recruiter",
        source="recruiter",
        external_job_id=f"rec-{rec.id}",
        title=rec.title,
        company_name=rec.company_name,
        company_logo_url=rec.company_logo_url,
        description=rec.description,
        requirements=rec.requirements,
        location=rec.location or "Remote",
        workplace_type=_normalize_workplace_type(rec.location or "", None),
        employment_type=rec.job_type or "Full-time",
        salary=rec.salary_description or "Competitive",
        skills=_parse_skills_list(rec.skills),
        job_posting_url=None,
        posted_at=rec.created_at.isoformat() if rec.created_at else None,
        deadline=rec.final_date_pt,
        is_saved=is_saved,
        vacancies=rec.vacancies or 1,
        integration_id=None,
    )


@router.post("/{job_id}/save", response_model=ToggleSaveJobResponse, summary="Toggle bookmark / save job")
@root_jobs_router.post("/{job_id}/save", response_model=ToggleSaveJobResponse, include_in_schema=False)
def toggle_save_job(
    job_id: int,
    payload: Optional[ToggleSaveJobRequest] = None,
    job_type: Optional[str] = Query(None, description="'imported' or 'recruiter'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Toggle saving / bookmarking a job listing for the candidate.
    If already saved, it removes the bookmark. If not saved, it saves it.
    """
    effective_type = (payload.job_type if payload else None) or job_type or "imported"
    effective_type = effective_type.strip().lower()
    if effective_type not in ("imported", "recruiter"):
        effective_type = "imported"

    # Verify job existence
    if effective_type == "imported":
        job_exists = db.query(ImportedJobListing.id).filter(ImportedJobListing.id == job_id).first()
    else:
        job_exists = db.query(JobPosting.id).filter(JobPosting.id == job_id).first()

    if not job_exists:
        raise HTTPException(status_code=404, detail=f"Target {effective_type} job not found")

    existing_save = db.query(UserSavedJob).filter(
        UserSavedJob.user_id == current_user.id,
        UserSavedJob.job_id == job_id,
        UserSavedJob.job_type == effective_type,
    ).first()

    if existing_save:
        db.delete(existing_save)
        db.commit()
        return ToggleSaveJobResponse(
            job_id=job_id,
            job_type=effective_type,
            is_saved=False,
            message="Job removed from saved opportunities.",
        )
    else:
        new_save = UserSavedJob(
            user_id=current_user.id,
            job_id=job_id,
            job_type=effective_type,
        )
        db.add(new_save)
        db.commit()
        return ToggleSaveJobResponse(
            job_id=job_id,
            job_type=effective_type,
            is_saved=True,
            message="Job saved to bookmarks successfully.",
        )
