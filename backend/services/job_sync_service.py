"""
Job Synchronization Service.
Orchestrates fetching, normalizing, deduplicating, and persisting job listings
and applications from external ATS providers (Greenhouse, Lever, Ashby, Workable).
Includes seed integration initialization and failure-isolated synchronization.
"""
import hashlib
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.database.models_complete import (
    User,
    PortalIntegration,
    IntegrationSyncHistory,
    ImportedJobApplication,
    ImportedJobListing,
)
from backend.integrations.registry import get_adapter, list_supported_providers
from backend.integrations.security import encrypt_credential, decrypt_credential

logger = logging.getLogger(__name__)


def compute_dedup_hash(user_id: int, provider: str, external_id: str) -> str:
    """Generate SHA256 deduplication hash for imported records."""
    raw = f"{user_id}:{provider.strip().lower()}:{external_id.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def execute_sync(
    integ: PortalIntegration,
    user_id: int,
    db: Session,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    Execute real synchronization of both jobs and applications for a given integration.
    Fully isolated: errors inside this function do not throw unhandled exceptions.
    """
    adapter = get_adapter(integ.provider)
    if not adapter or not adapter.is_supported:
        return {
            "status": "failed",
            "error_message": f"Adapter for provider '{integ.provider}' is unsupported or unavailable.",
            "jobs_imported": 0,
            "jobs_updated": 0,
            "records_imported": 0,
            "records_updated": 0,
        }

    try:
        plain_key = decrypt_credential(integ.encrypted_api_key)
    except Exception as dec_err:
        integ.status = "error"
        integ.last_error = f"Credential decryption failed: {dec_err}"
        db.commit()
        return {
            "status": "failed",
            "error_message": integ.last_error,
            "jobs_imported": 0,
            "jobs_updated": 0,
            "records_imported": 0,
            "records_updated": 0,
        }

    now = datetime.now(timezone.utc)
    jobs_imported = 0
    jobs_updated = 0
    jobs_failed = 0
    apps_imported = 0
    apps_updated = 0
    apps_failed = 0

    # 1. Fetch real job listings from provider API
    raw_jobs = []
    fetch_jobs_err = None
    try:
        raw_jobs, fetch_jobs_err = adapter.fetch_jobs(
            api_key=plain_key,
            api_base_url=integ.api_base_url,
            config=integ.config,
            limit=limit,
        )
    except Exception as exc:
        fetch_jobs_err = str(exc)

    if raw_jobs:
        for norm_job in raw_jobs:
            try:
                existing_job = (
                    db.query(ImportedJobListing)
                    .filter(
                        ImportedJobListing.provider == integ.provider,
                        ImportedJobListing.external_job_id == norm_job.external_job_id,
                    )
                    .first()
                )
                if existing_job:
                    existing_job.title = norm_job.title
                    existing_job.company_name = norm_job.company_name
                    if norm_job.company_logo_url:
                        existing_job.company_logo_url = norm_job.company_logo_url
                    existing_job.description = norm_job.description
                    existing_job.location = norm_job.location or existing_job.location
                    existing_job.workplace_type = norm_job.workplace_type or existing_job.workplace_type
                    existing_job.employment_type = norm_job.employment_type or existing_job.employment_type
                    if norm_job.salary:
                        existing_job.salary = norm_job.salary
                    if norm_job.skills:
                        existing_job.skills = norm_job.skills
                    existing_job.job_posting_url = norm_job.job_posting_url
                    existing_job.status = "active"
                    existing_job.last_synced_at = now
                    if norm_job.raw_data:
                        existing_job.raw_data = norm_job.raw_data
                    jobs_updated += 1
                else:
                    new_job = ImportedJobListing(
                        integration_id=integ.id,
                        user_id=user_id,
                        provider=integ.provider,
                        external_job_id=norm_job.external_job_id,
                        title=norm_job.title,
                        company_name=norm_job.company_name,
                        company_logo_url=norm_job.company_logo_url,
                        description=norm_job.description,
                        location=norm_job.location or "Remote",
                        workplace_type=norm_job.workplace_type or "remote",
                        employment_type=norm_job.employment_type or "Full-time",
                        salary=norm_job.salary,
                        skills=norm_job.skills or [],
                        job_posting_url=norm_job.job_posting_url,
                        posted_at=norm_job.posted_at or now,
                        deadline=norm_job.deadline,
                        last_synced_at=now,
                        status="active",
                        raw_data=norm_job.raw_data or {},
                    )
                    db.add(new_job)
                    jobs_imported += 1
            except Exception as e:
                logger.warning(f"Error persisting job {norm_job.external_job_id}: {e}")
                jobs_failed += 1

    # 2. Fetch applications from provider API (if supported / permitted)
    raw_apps = []
    fetch_apps_err = None
    try:
        raw_apps, fetch_apps_err = adapter.fetch_applications(
            api_key=plain_key,
            api_base_url=integ.api_base_url,
            config=integ.config,
            limit=limit,
        )
    except Exception as exc:
        fetch_apps_err = str(exc)

    if raw_apps:
        for norm_app in raw_apps:
            try:
                dedup_hash = compute_dedup_hash(user_id, integ.provider, norm_app.external_application_id)
                existing_app = (
                    db.query(ImportedJobApplication)
                    .filter(
                        ImportedJobApplication.user_id == user_id,
                        ImportedJobApplication.dedup_hash == dedup_hash,
                    )
                    .first()
                )
                if existing_app:
                    if existing_app.application_status != norm_app.application_status:
                        existing_app.application_status = norm_app.application_status
                        existing_app.updated_at = now
                        apps_updated += 1
                else:
                    new_app = ImportedJobApplication(
                        user_id=user_id,
                        integration_id=integ.id,
                        provider=integ.provider,
                        external_application_id=norm_app.external_application_id,
                        dedup_hash=dedup_hash,
                        job_title=norm_app.job_title,
                        company_name=norm_app.company_name,
                        job_location=norm_app.job_location,
                        application_date=norm_app.application_date or now,
                        application_status=norm_app.application_status,
                        job_description=norm_app.job_description,
                        job_posting_url=norm_app.job_posting_url,
                        candidate_name=norm_app.candidate_name,
                        candidate_email=norm_app.candidate_email,
                        raw_data=norm_app.raw_data or {},
                    )
                    db.add(new_app)
                    apps_imported += 1
            except Exception as e:
                logger.warning(f"Error persisting application {norm_app.external_application_id}: {e}")
                apps_failed += 1

    # 3. Overall Sync Assessment
    total_imported = jobs_imported + apps_imported
    total_updated = jobs_updated + apps_updated
    total_failed = jobs_failed + apps_failed

    sync_err = None
    if fetch_jobs_err and fetch_apps_err:
        sync_err = f"Jobs: {fetch_jobs_err}; Apps: {fetch_apps_err}"
    elif fetch_jobs_err and total_imported == 0 and total_updated == 0:
        sync_err = f"Jobs: {fetch_jobs_err}"

    # Commit db changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Commit failed during sync: {e}")
        return {
            "status": "failed",
            "error_message": f"Database commit failed: {e}",
            "jobs_imported": 0,
            "jobs_updated": 0,
        }

    # Update Integration Record
    total_active_jobs = db.query(ImportedJobListing).filter(
        ImportedJobListing.integration_id == integ.id,
        ImportedJobListing.status == "active",
    ).count()
    total_active_apps = db.query(ImportedJobApplication).filter(
        ImportedJobApplication.integration_id == integ.id
    ).count()

    integ.imported_count = total_active_jobs + total_active_apps
    integ.last_sync_at = now
    integ.status = "connected" if not (fetch_jobs_err and total_active_jobs == 0) else "error"
    integ.last_error = sync_err if integ.status == "error" else None

    # Save History Log
    status_str = "success"
    if total_failed > 0 or sync_err:
        status_str = "partial" if (total_imported > 0 or total_updated > 0) else "failed"

    history = IntegrationSyncHistory(
        integration_id=integ.id,
        user_id=user_id,
        status=status_str,
        records_imported=total_imported,
        records_updated=total_updated,
        records_failed=total_failed,
        error_message=sync_err,
        details={
            "jobs_imported": jobs_imported,
            "jobs_updated": jobs_updated,
            "jobs_failed": jobs_failed,
            "applications_imported": apps_imported,
            "applications_updated": apps_updated,
            "applications_failed": apps_failed,
            "total_active_jobs": total_active_jobs,
        },
    )
    db.add(history)
    db.commit()

    return {
        "status": status_str,
        "records_imported": total_imported,
        "records_updated": total_updated,
        "records_failed": total_failed,
        "jobs_imported": jobs_imported,
        "jobs_updated": jobs_updated,
        "applications_imported": apps_imported,
        "applications_updated": apps_updated,
        "total_active": integ.imported_count,
        "total_jobs": total_active_jobs,
        "error_message": sync_err,
        "synced_at": now.isoformat(),
    }


def seed_default_integrations(db: Session, authorizer_user_id: Optional[int] = None) -> List[PortalIntegration]:
    """
    Ensure the platform has pre-configured verified ATS requisitions.
    Uses official public job board endpoints for Greenhouse, Ashby, and Lever.
    """
    if not authorizer_user_id:
        authorizer = (
            db.query(User)
            .filter(User.role.in_(["authorizer", "admin"]))
            .order_by(User.id.asc())
            .first()
        )
        if not authorizer:
            authorizer = db.query(User).order_by(User.id.asc()).first()
        if not authorizer:
            logger.warning("No user found in database to associate default integrations.")
            return []
        authorizer_user_id = authorizer.id

    default_configs = [
        {
            "provider": "greenhouse",
            "name": "Stripe Requisitions (Greenhouse)",
            "api_key": "public",
            "config": {
                "board_token": "stripe",
                "company_name": "Stripe",
                "company_logo_url": "https://logo.clearbit.com/stripe.com",
            },
        },
        {
            "provider": "ashby",
            "name": "Linear Requisitions (Ashby)",
            "api_key": "public",
            "config": {
                "company_name": "linear",
                "board_token": "linear",
                "display_name": "Linear",
                "company_logo_url": "https://logo.clearbit.com/linear.app",
            },
        },
        {
            "provider": "lever",
            "name": "Lever Partner Requisitions",
            "api_key": "public",
            "config": {
                "company_name": "leverdemo",
                "display_name": "Lever Partner",
                "company_logo_url": "https://logo.clearbit.com/lever.co",
            },
        },
    ]

    created = []
    for cfg in default_configs:
        existing = (
            db.query(PortalIntegration)
            .filter(
                PortalIntegration.provider == cfg["provider"],
                PortalIntegration.user_id == authorizer_user_id,
            )
            .first()
        )
        if not existing:
            integ = PortalIntegration(
                user_id=authorizer_user_id,
                provider=cfg["provider"],
                name=cfg["name"],
                encrypted_api_key=encrypt_credential(cfg["api_key"]),
                config=cfg["config"],
                status="ready",
                imported_count=0,
            )
            db.add(integ)
            db.commit()
            db.refresh(integ)
            created.append(integ)
        else:
            # If config is missing key fields, update it
            if not existing.config or not existing.config.get("board_token") and not existing.config.get("company_name"):
                existing.config = cfg["config"]
                db.commit()
            created.append(existing)

    return created


def sync_all_active_integrations(db: Session, user_id: Optional[int] = None, limit: int = 50) -> Dict[str, Any]:
    """
    Synchronize all active portal integrations with strict error isolation.
    If one provider experiences a timeout or error, other providers continue unaffected.
    """
    query = db.query(PortalIntegration)
    if user_id:
        query = query.filter(PortalIntegration.user_id == user_id)
    integrations = query.all()

    if not integrations:
        # Seed default integrations if none exist
        integrations = seed_default_integrations(db, authorizer_user_id=user_id)

    total_imported = 0
    total_updated = 0
    results_by_provider: Dict[str, Any] = {}

    for integ in integrations:
        try:
            res = execute_sync(integ=integ, user_id=integ.user_id, db=db, limit=limit)
            total_imported += res.get("jobs_imported", 0)
            total_updated += res.get("jobs_updated", 0)
            results_by_provider[integ.provider] = res
        except Exception as exc:
            logger.error(f"Sync error for provider {integ.provider}: {exc}")
            results_by_provider[integ.provider] = {
                "status": "failed",
                "error_message": str(exc),
                "jobs_imported": 0,
            }

    total_jobs_in_db = db.query(ImportedJobListing).filter(ImportedJobListing.status == "active").count()

    # If new or updated jobs were synced, refresh matches for all candidates with active resumes
    if total_imported > 0 or total_updated > 0:
        try:
            from backend.services.matching_service import CandidateJobMatchingService
            from backend.database.models_complete import Resume
            active_resume_user_ids = [
                r[0] for r in db.query(Resume.user_id).distinct().all() if r[0] is not None
            ]
            for uid in active_resume_user_ids:
                try:
                    CandidateJobMatchingService.calculate_and_persist_candidate_matches(user_id=uid, db=db)
                except Exception as _m_err:
                    logger.warning(f"Failed to auto-update matches for candidate user_id={uid}: {_m_err}")
        except Exception as _all_m_err:
            logger.warning(f"Could not refresh candidate matches after sync: {_all_m_err}")

    return {
        "status": "success" if total_jobs_in_db > 0 else "warning",
        "total_jobs_in_db": total_jobs_in_db,
        "total_new_imported": total_imported,
        "total_updated": total_updated,
        "providers_synced": results_by_provider,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def ensure_default_jobs_synced(db: Session, force: bool = False) -> Dict[str, Any]:
    """
    Idempotent helper to ensure the platform has live active job listings populated.
    Called on backend startup.
    """
    active_count = db.query(ImportedJobListing).filter(ImportedJobListing.status == "active").count()
    if active_count > 0 and not force:
        return {
            "status": "skipped",
            "message": f"Database already contains {active_count} active job listings.",
            "total_jobs": active_count,
        }

    logger.info("Initializing default ATS integrations and performing initial sync...")
    return sync_all_active_integrations(db=db, limit=50)

