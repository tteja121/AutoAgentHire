"""
Website URL Job Import & Discovery API Routes for AutoAgentHire.
Supports scanning company careers websites, previewing discovered postings,
and persisting selected jobs into the unified job listings pipeline with
duplicate prevention and audit tracking.
"""
import hashlib
import time
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models_complete import (
    User,
    PortalIntegration,
    IntegrationSyncHistory,
    ImportedJobListing,
    AuditLog,
)
from backend.integrations.security import encrypt_credential
from backend.services.website_job_crawler import (
    crawl_and_extract_jobs,
    validate_url_security,
    clean_and_validate_title,
)

router = APIRouter(prefix="/website", tags=["Website URL Job Import"])
root_router = APIRouter(prefix="/website", tags=["Website URL Job Import (Root)"])


# ── Request / Response Models ──────────────────────────────────────────────────

class WebsiteScanRequest(BaseModel):
    url: str = Field(..., description="Careers website URL (e.g. https://company.com/careers)")
    connection_name: Optional[str] = Field(None, description="Optional connection display name")
    max_jobs: Optional[int] = Field(50, ge=1, le=100, description="Maximum jobs to scan")


class DiscoveredJobPreview(BaseModel):
    temp_id: str
    title: str
    company_name: str
    location: str = "Remote"
    workplace_type: str = "remote"
    employment_type: str = "Full-time"
    salary: Optional[str] = "Competitive"
    description: str
    skills: List[str] = []
    job_posting_url: str
    posted_at: Optional[str] = None
    deadline: Optional[str] = None
    source_website: str
    is_already_imported: bool = False


class WebsiteScanResponse(BaseModel):
    success: bool
    source_url: str
    company_name: str
    jobs_discovered: int
    jobs: List[DiscoveredJobPreview]
    scan_duration_ms: int
    notes: str
    error: Optional[str] = None


class DiscoveredJobImportItem(BaseModel):
    temp_id: Optional[str] = None
    title: str
    company_name: str
    location: Optional[str] = "Remote"
    workplace_type: Optional[str] = "remote"
    employment_type: Optional[str] = "Full-time"
    salary: Optional[str] = "Competitive"
    description: str
    skills: Optional[List[str]] = []
    company_logo_url: Optional[str] = None
    job_posting_url: str
    posted_at: Optional[str] = None
    deadline: Optional[str] = None


class WebsiteImportRequest(BaseModel):
    source_url: Optional[str] = Field(None, description="Careers website URL")
    url: Optional[str] = Field(None, description="Careers website URL (alias)")
    connection_name: Optional[str] = Field(None, description="Connection display name")
    selected_jobs: List[DiscoveredJobImportItem] = Field(..., min_length=1, description="List of selected jobs to import")


class WebsiteImportResponse(BaseModel):
    success: bool
    integration_id: int
    records_imported: int
    records_updated: int
    records_skipped: int
    records_failed: int
    message: str
    imported_count: Optional[int] = None
    updated_count: Optional[int] = None
    skipped_count: Optional[int] = None
    imported_job_ids: Optional[List[int]] = []


class WebsiteHistoryItem(BaseModel):
    id: int
    integration_id: int
    connection_name: str
    source_website: str
    status: str
    records_imported: int
    records_updated: int
    records_failed: int
    records_skipped: int
    error_message: Optional[str] = None
    synced_at: datetime
    details: Optional[Dict[str, Any]] = None


class WebsiteStatusResponse(BaseModel):
    id: int
    connection_name: str
    source_url: str
    status: str
    active_jobs_count: int
    last_scan_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_job_exists_in_db(db: Session, job_url: str, title: str, company: str, location: str) -> bool:
    """Check if a job already exists in the database by URL or (company, title, location)."""
    clean_url = (job_url or "").strip()
    if clean_url:
        existing_url = db.query(ImportedJobListing).filter(ImportedJobListing.job_posting_url == clean_url).first()
        if existing_url:
            return True

    existing_attrs = db.query(ImportedJobListing).filter(
        ImportedJobListing.company_name.ilike(company.strip()),
        ImportedJobListing.title.ilike(title.strip()),
        ImportedJobListing.location.ilike(location.strip()),
    ).first()

    return existing_attrs is not None


# ── Route Handlers ─────────────────────────────────────────────────────────────

@router.post("/scan", response_model=WebsiteScanResponse, summary="Scan website careers URL for public jobs")
@root_router.post("/scan", response_model=WebsiteScanResponse, include_in_schema=False)
def scan_website_jobs(
    body: WebsiteScanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validate target URL with SSRF protection, scan the careers page, extract JobPosting
    JSON-LD, detect embedded ATS platforms, and return a structured preview of discovered jobs.
    """
    # 1. Security pre-validation
    is_safe, clean_url, sec_err = validate_url_security(body.url)
    if not is_safe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security restriction: {sec_err}",
        )

    # 2. Execute crawling and extraction
    result = crawl_and_extract_jobs(
        url=clean_url,
        connection_name=body.connection_name,
        max_jobs=body.max_jobs or 50,
    )

    if not result.get("success") and not result.get("jobs"):
        # Return helpful response payload with error
        return WebsiteScanResponse(
            success=False,
            source_url=clean_url,
            company_name=result.get("company_name", "Company"),
            jobs_discovered=0,
            jobs=[],
            scan_duration_ms=result.get("scan_duration_ms", 0),
            notes="",
            error=result.get("error") or "No job openings could be discovered on this page.",
        )

    # 3. Check for duplicates in DB for each discovered job
    previews: List[DiscoveredJobPreview] = []
    for item in result.get("jobs", []):
        is_already_imported = _check_job_exists_in_db(
            db=db,
            job_url=item.get("job_posting_url", ""),
            title=item.get("title", ""),
            company=item.get("company_name", ""),
            location=item.get("location", "Remote"),
        )
        previews.append(
            DiscoveredJobPreview(
                temp_id=item["temp_id"],
                title=item["title"],
                company_name=item["company_name"],
                location=item.get("location") or "Remote",
                workplace_type=item.get("workplace_type") or "remote",
                employment_type=item.get("employment_type") or "Full-time",
                salary=item.get("salary") or "Competitive",
                description=item.get("description") or "",
                skills=item.get("skills") or [],
                job_posting_url=item["job_posting_url"],
                posted_at=item.get("posted_at"),
                deadline=item.get("deadline"),
                source_website=clean_url,
                is_already_imported=is_already_imported,
            )
        )

    return WebsiteScanResponse(
        success=True,
        source_url=clean_url,
        company_name=result.get("company_name", "Company"),
        jobs_discovered=len(previews),
        jobs=previews,
        scan_duration_ms=result.get("scan_duration_ms", 0),
        notes=result.get("notes", ""),
        error=None,
    )


@router.post("/import", response_model=WebsiteImportResponse, summary="Import selected jobs from website scan")
@root_router.post("/import", response_model=WebsiteImportResponse, include_in_schema=False)
def import_selected_website_jobs(
    body: WebsiteImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Persist selected website job listings into the unified job database,
    create or link to a website integration record, handle deduplication,
    and log the import history.
    """
    if not body.selected_jobs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No jobs were selected for import.",
        )

    clean_source_url = (body.source_url or body.url or "").strip()
    if not clean_source_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Careers website URL is required.",
        )

    is_safe, valid_url, sec_err = validate_url_security(clean_source_url)
    if not is_safe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or restricted source URL: {sec_err}",
        )

    parsed_domain = urlparse(valid_url).netloc.replace("www.", "")
    derived_name = (body.connection_name or f"{parsed_domain.split('.')[0].title()} Careers Website").strip()

    # 1. Find or create PortalIntegration for this website
    integ = (
        db.query(PortalIntegration)
        .filter(
            PortalIntegration.user_id == current_user.id,
            PortalIntegration.provider == "website_url",
            PortalIntegration.api_base_url == valid_url,
        )
        .first()
    )

    now = datetime.now(timezone.utc)
    if not integ:
        integ = PortalIntegration(
            user_id=current_user.id,
            provider="website_url",
            name=derived_name,
            api_base_url=valid_url,
            encrypted_api_key=encrypt_credential(valid_url),
            config={"website_url": valid_url, "company_name": derived_name, "last_scan_at": now.isoformat()},
            status="connected",
            imported_count=0,
        )
        db.add(integ)
        db.commit()
        db.refresh(integ)
    else:
        # Update name if specified
        if body.connection_name:
            integ.name = body.connection_name.strip()
        integ.status = "connected"
        integ.last_sync_at = now
        db.commit()

    records_imported = 0
    records_updated = 0
    records_skipped = 0
    records_failed = 0
    saved_job_ids: List[int] = []

    # 2. Iterate and persist selected jobs with duplicate prevention
    for job in body.selected_jobs:
        try:
            clean_job_url = (job.job_posting_url or valid_url).strip()
            clean_title = clean_and_validate_title(job.title, fallback="Job title unavailable")
            clean_company = (job.company_name or derived_name).strip()
            clean_location = (job.location or "Remote").strip()

            # Deterministic external job ID
            ext_id = f"web-{hashlib.sha256(f'{valid_url}:{clean_job_url}:{clean_title}'.encode()).hexdigest()[:16]}"

            # Check for existing job by URL
            existing_job = db.query(ImportedJobListing).filter(
                ImportedJobListing.job_posting_url == clean_job_url
            ).first()

            # If not found by URL, check by (company, title, location)
            if not existing_job:
                existing_job = db.query(ImportedJobListing).filter(
                    ImportedJobListing.company_name.ilike(clean_company),
                    ImportedJobListing.title.ilike(clean_title),
                    ImportedJobListing.location.ilike(clean_location),
                ).first()

            parsed_posted_at = None
            if job.posted_at:
                try:
                    parsed_posted_at = datetime.fromisoformat(str(job.posted_at).replace("Z", "+00:00"))
                except Exception:
                    pass

            parsed_deadline = None
            if job.deadline:
                try:
                    parsed_deadline = datetime.fromisoformat(str(job.deadline).replace("Z", "+00:00"))
                except Exception:
                    pass

            if existing_job:
                # Update existing job record to keep it fresh
                existing_job.title = clean_title
                existing_job.company_name = clean_company
                if job.company_logo_url:
                    existing_job.company_logo_url = job.company_logo_url
                if job.description and len(job.description) > len(existing_job.description or ""):
                    existing_job.description = job.description
                existing_job.location = clean_location
                existing_job.workplace_type = job.workplace_type or existing_job.workplace_type or "remote"
                existing_job.employment_type = job.employment_type or existing_job.employment_type or "Full-time"
                if job.salary and job.salary != "Competitive":
                    existing_job.salary = job.salary
                if job.skills:
                    existing_job.skills = job.skills
                existing_job.status = "active"
                existing_job.last_synced_at = now
                records_updated += 1
                saved_job_ids.append(existing_job.id)
            else:
                new_listing = ImportedJobListing(
                    integration_id=integ.id,
                    user_id=current_user.id,
                    provider="website_url",
                    external_job_id=ext_id,
                    title=clean_title,
                    company_name=clean_company,
                    company_logo_url=job.company_logo_url,
                    description=job.description or f"Position for {clean_title} at {clean_company}.",
                    location=clean_location,
                    workplace_type=job.workplace_type or "remote",
                    employment_type=job.employment_type or "Full-time",
                    salary=job.salary or "Competitive",
                    skills=job.skills or [],
                    job_posting_url=clean_job_url,
                    posted_at=parsed_posted_at or now,
                    deadline=parsed_deadline,
                    status="active",
                    last_synced_at=now,
                    raw_data={
                        "source": "website_url_import",
                        "source_website": valid_url,
                        "imported_at": now.isoformat(),
                    },
                )
                db.add(new_listing)
                db.flush()
                records_imported += 1
                saved_job_ids.append(new_listing.id)
        except Exception as exc:
            logger.warning(f"Failed to import job {job.title}: {exc}")
            records_failed += 1

    # 3. Commit database changes
    db.commit()

    # 4. Update integration statistics
    total_active = db.query(ImportedJobListing).filter(ImportedJobListing.integration_id == integ.id).count()
    integ.imported_count = total_active
    integ.last_sync_at = now
    db.commit()

    # 5. Record IntegrationSyncHistory
    sync_status = "success" if records_imported > 0 or records_updated > 0 else ("failed" if records_failed > 0 else "partial")
    sync_log = IntegrationSyncHistory(
        integration_id=integ.id,
        user_id=current_user.id,
        status=sync_status,
        records_imported=records_imported,
        records_updated=records_updated,
        records_failed=records_failed,
        error_message=f"{records_failed} failed" if records_failed else None,
        details={
            "source_url": valid_url,
            "jobs_submitted": len(body.selected_jobs),
            "jobs_imported": records_imported,
            "jobs_updated": records_updated,
            "jobs_skipped": records_skipped,
            "total_active_integration_jobs": total_active,
        },
    )
    db.add(sync_log)

    # 6. Audit log
    try:
        audit = AuditLog(
            user_id=current_user.id,
            performed_by_email=str(current_user.email),
            action="website_jobs_imported",
            target_type="portal_integration",
            target_id=str(integ.id),
            details={
                "source_url": valid_url,
                "imported": records_imported,
                "updated": records_updated,
                "failed": records_failed,
            },
        )
        db.add(audit)
    except Exception:
        pass

    db.commit()

    msg = f"Successfully imported {records_imported} job(s)"
    if records_updated:
        msg += f" and updated {records_updated} existing listing(s)"
    msg += f" from {valid_url}."

    return WebsiteImportResponse(
        success=True,
        integration_id=integ.id,
        records_imported=records_imported,
        records_updated=records_updated,
        records_skipped=records_skipped,
        records_failed=records_failed,
        message=msg,
        imported_count=records_imported,
        updated_count=records_updated,
        skipped_count=records_skipped,
        imported_job_ids=saved_job_ids,
    )


@router.get("/history", response_model=List[WebsiteHistoryItem], summary="Get website import scan history")
@root_router.get("/history", response_model=List[WebsiteHistoryItem], include_in_schema=False)
def get_website_import_history(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve audit history of past website URL imports and scans for the authenticated authorizer.
    """
    logs = (
        db.query(IntegrationSyncHistory, PortalIntegration)
        .join(PortalIntegration, IntegrationSyncHistory.integration_id == PortalIntegration.id)
        .filter(
            PortalIntegration.provider == "website_url",
            IntegrationSyncHistory.user_id == current_user.id,
        )
        .order_by(IntegrationSyncHistory.synced_at.desc())
        .limit(limit)
        .all()
    )

    history_items: List[WebsiteHistoryItem] = []
    for sync_log, integ in logs:
        details = sync_log.details or {}
        history_items.append(
            WebsiteHistoryItem(
                id=sync_log.id,
                integration_id=integ.id,
                connection_name=integ.name,
                source_website=integ.api_base_url or details.get("source_url") or "",
                status=sync_log.status,
                records_imported=sync_log.records_imported or 0,
                records_updated=sync_log.records_updated or 0,
                records_failed=sync_log.records_failed or 0,
                records_skipped=details.get("jobs_skipped", 0),
                error_message=sync_log.error_message,
                synced_at=sync_log.synced_at,
                details=details,
            )
        )

    return history_items


@router.get("/{integration_id}/status", response_model=WebsiteStatusResponse, summary="Get website integration status")
@root_router.get("/{integration_id}/status", response_model=WebsiteStatusResponse, include_in_schema=False)
def get_website_integration_status(
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get live status and job counts for a specific website integration."""
    integ = (
        db.query(PortalIntegration)
        .filter(
            PortalIntegration.id == integration_id,
            PortalIntegration.user_id == current_user.id,
            PortalIntegration.provider == "website_url",
        )
        .first()
    )
    if not integ:
        raise HTTPException(status_code=404, detail="Website integration not found.")

    active_count = db.query(ImportedJobListing).filter(
        ImportedJobListing.integration_id == integ.id,
        ImportedJobListing.status == "active",
    ).count()

    return WebsiteStatusResponse(
        id=integ.id,
        connection_name=integ.name,
        source_url=integ.api_base_url or (integ.config or {}).get("website_url") or "",
        status=integ.status,
        active_jobs_count=active_count,
        last_scan_at=integ.last_sync_at,
        created_at=integ.created_at,
    )
