"""
Portal Integration & Admin Database Health API Routes.
Provides secure endpoints for managing third-party ATS integrations,
synchronizing external job applications, and auditing database health.
"""
import hashlib
import time
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db, DATABASE_URL, engine
from backend.database.models_complete import (
    User,
    PortalIntegration,
    IntegrationSyncHistory,
    ImportedJobApplication,
    ImportedJobListing,
    JobPosting,
    JobApplication,
    Application,
    Resume,
    AuditLog,
    Notification,
)
from backend.integrations.registry import get_adapter, list_supported_providers
from backend.integrations.security import encrypt_credential, decrypt_credential, mask_credential
from backend.services.job_sync_service import execute_sync, compute_dedup_hash
from backend.routes.website_import_routes import (
    router as website_import_router,
    root_router as root_website_import_router,
)

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])
root_integration_router = APIRouter(prefix="/integrations", tags=["Integrations (Root)"])
admin_router = APIRouter(prefix="/api/admin", tags=["Admin Governance"])

# Mount website URL import sub-routes
router.include_router(website_import_router)
root_integration_router.include_router(root_website_import_router)


# ── Pydantic Request / Response Schemas ────────────────────────────────────────

class IntegrationCreateRequest(BaseModel):
    provider: str = Field(..., description="Provider identifier e.g. greenhouse, lever, ashby, workable, generic_ats")
    name: str = Field(..., min_length=2, max_length=100, description="Display name for this connection")
    api_key: str = Field(..., min_length=1, description="API Key, access token, or service credential")
    api_base_url: Optional[str] = Field(None, description="Optional custom API endpoint URL")
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Provider-specific configuration e.g. subdomain")


class IntegrationResponse(BaseModel):
    id: int
    uuid: str
    provider: str
    name: str
    api_base_url: Optional[str] = None
    masked_api_key: str
    config: Optional[Dict[str, Any]] = None
    status: str
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None
    imported_count: int = 0
    created_at: Optional[datetime] = None


class SyncHistoryResponse(BaseModel):
    id: int
    integration_id: int
    status: str
    records_imported: int
    records_updated: int
    records_failed: int
    error_message: Optional[str] = None
    synced_at: datetime


class ImportedApplicationResponse(BaseModel):
    id: int
    uuid: str
    provider: str
    external_application_id: str
    job_title: str
    company_name: str
    job_location: Optional[str] = None
    application_date: Optional[datetime] = None
    application_status: str
    job_description: Optional[str] = None
    job_posting_url: Optional[str] = None
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    created_at: Optional[datetime] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_integration(integ: PortalIntegration) -> IntegrationResponse:
    try:
        decrypted = decrypt_credential(integ.encrypted_api_key)
        masked = mask_credential(decrypted)
    except Exception:
        masked = "••••••••"

    return IntegrationResponse(
        id=integ.id,
        uuid=integ.uuid,
        provider=integ.provider,
        name=integ.name,
        api_base_url=integ.api_base_url,
        masked_api_key=masked,
        config=integ.config,
        status=integ.status,
        last_sync_at=integ.last_sync_at,
        last_error=integ.last_error,
        imported_count=integ.imported_count or 0,
        created_at=integ.created_at,
    )


def _compute_dedup_hash(user_id: int, provider: str, external_id: str) -> str:
    return compute_dedup_hash(user_id=user_id, provider=provider, external_id=external_id)


# ── Integration API Endpoints ─────────────────────────────────────────────────

@router.get("/providers", summary="List supported job portal providers")
def get_providers():
    """Return all supported ATS providers and requirements catalog."""
    return {"providers": list_supported_providers()}


@router.get("", response_model=List[IntegrationResponse], summary="List user's connected integrations")
def list_integrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all portal integrations configured by the authenticated user."""
    integrations = (
        db.query(PortalIntegration)
        .filter(PortalIntegration.user_id == current_user.id)
        .order_by(PortalIntegration.created_at.desc())
        .all()
    )
    return [_format_integration(i) for i in integrations]


@router.post("", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED, summary="Add new portal integration")
def create_integration(
    body: IntegrationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validate credentials against the provider API, encrypt secrets, and register the integration.
    """
    adapter = get_adapter(body.provider)
    if not adapter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{body.provider}'. Please choose from supported ATS integrations.",
        )

    if not adapter.is_supported:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=adapter.unsupported_reason or "This portal does not support direct API key authentication.",
        )

    # 1. Live credential validation
    is_valid, validation_msg = adapter.validate_credentials(
        api_key=body.api_key,
        api_base_url=body.api_base_url,
        config=body.config,
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection verification failed: {validation_msg}",
        )

    # 2. Server-side encryption
    encrypted_key = encrypt_credential(body.api_key)

    # 3. Persistence bound strictly to current_user.id
    new_integ = PortalIntegration(
        user_id=current_user.id,
        provider=adapter.provider_id,
        name=body.name.strip(),
        api_base_url=body.api_base_url.strip() if body.api_base_url else None,
        encrypted_api_key=encrypted_key,
        config=body.config or {},
        status="connected",
        imported_count=0,
    )
    db.add(new_integ)
    db.commit()
    db.refresh(new_integ)

    # Audit log
    try:
        audit = AuditLog(
            user_id=current_user.id,
            performed_by_email=str(current_user.email),
            action="integration_created",
            target_type="portal_integration",
            target_id=str(new_integ.id),
            details={"provider": adapter.provider_id, "name": new_integ.name},
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    # Initial automatic synchronization to populate jobs immediately
    try:
        _execute_sync(integ=new_integ, user_id=current_user.id, db=db, limit=50)
        db.refresh(new_integ)
    except Exception:
        pass

    return _format_integration(new_integ)


@router.post("/{integration_id}/validate", summary="Validate existing integration connection")
def validate_integration(
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test the connection status of a saved integration without re-entering credentials."""
    integ = (
        db.query(PortalIntegration)
        .filter(PortalIntegration.id == integration_id, PortalIntegration.user_id == current_user.id)
        .first()
    )
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found.")

    adapter = get_adapter(integ.provider)
    if not adapter or not adapter.is_supported:
        raise HTTPException(status_code=400, detail="Provider adapter unavailable.")

    try:
        plain_key = decrypt_credential(integ.encrypted_api_key)
    except Exception as exc:
        integ.status = "error"
        integ.last_error = "Credential decryption failed."
        db.commit()
        return {"is_valid": False, "message": "Failed to decrypt saved credentials."}

    is_valid, msg = adapter.validate_credentials(
        api_key=plain_key,
        api_base_url=integ.api_base_url,
        config=integ.config,
    )
    integ.status = "connected" if is_valid else "error"
    integ.last_error = None if is_valid else msg
    db.commit()

    return {"is_valid": is_valid, "message": msg, "status": integ.status}


@router.delete("/{integration_id}", summary="Disconnect / delete a portal integration")
def delete_integration(
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a portal integration and revoke saved credentials."""
    integ = (
        db.query(PortalIntegration)
        .filter(PortalIntegration.id == integration_id, PortalIntegration.user_id == current_user.id)
        .first()
    )
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found.")

    db.delete(integ)
    db.commit()

    try:
        audit = AuditLog(
            user_id=current_user.id,
            performed_by_email=str(current_user.email),
            action="integration_deleted",
            target_type="portal_integration",
            target_id=str(integration_id),
            details={"provider": integ.provider, "name": integ.name},
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    return {"message": "Integration disconnected and removed successfully.", "status": "ok"}


def _execute_sync(integ: PortalIntegration, user_id: int, db: Session, limit: int = 50) -> Dict[str, Any]:
    """Execute real synchronization of both jobs and applications for an integration."""
    return execute_sync(integ=integ, user_id=user_id, db=db, limit=limit)


@router.post("/{integration_id}/sync", summary="Trigger manual synchronization")
def sync_integration(
    integration_id: int,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch both job listings and candidate applications from the external provider API,
    normalize them, and persist new or updated records with deduplication.
    """
    integ = (
        db.query(PortalIntegration)
        .filter(PortalIntegration.id == integration_id, PortalIntegration.user_id == current_user.id)
        .first()
    )
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found.")

    res = _execute_sync(integ=integ, user_id=current_user.id, db=db, limit=limit)
    return res


@router.get("/{integration_id}/history", response_model=List[SyncHistoryResponse], summary="Get synchronization history")
def get_sync_history(
    integration_id: int,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve audit history of past synchronizations for an integration."""
    integ = (
        db.query(PortalIntegration)
        .filter(PortalIntegration.id == integration_id, PortalIntegration.user_id == current_user.id)
        .first()
    )
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found.")

    logs = (
        db.query(IntegrationSyncHistory)
        .filter(IntegrationSyncHistory.integration_id == integration_id, IntegrationSyncHistory.user_id == current_user.id)
        .order_by(IntegrationSyncHistory.synced_at.desc())
        .limit(limit)
        .all()
    )
    return logs


@router.get("/applications", response_model=List[ImportedApplicationResponse], summary="Retrieve imported job applications")
def get_imported_applications(
    provider: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve applications imported from external job portals for the authenticated user.
    Enforces strict user data isolation.
    """
    query = db.query(ImportedJobApplication).filter(ImportedJobApplication.user_id == current_user.id)

    if provider:
        query = query.filter(ImportedJobApplication.provider == provider.strip().lower())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (ImportedJobApplication.job_title.ilike(s)) |
            (ImportedJobApplication.company_name.ilike(s)) |
            (ImportedJobApplication.candidate_name.ilike(s))
        )

    apps = query.order_by(ImportedJobApplication.created_at.desc()).offset(offset).limit(limit).all()
    return apps


# ── Integration Health Audit Endpoint ─────────────────────────────────────────

class IntegrationHealthItem(BaseModel):
    provider: str
    name: str
    is_configured: bool
    is_reachable: bool
    status: str
    last_successful_sync: Optional[datetime] = None
    jobs_imported: int = 0
    jobs_updated: int = 0
    latest_error: Optional[str] = None


class IntegrationsHealthResponse(BaseModel):
    status: str
    total_configured: int
    total_active_jobs: int
    providers: List[IntegrationHealthItem]
    checked_at: datetime


def _build_integrations_health(db: Session) -> IntegrationsHealthResponse:
    supported = list_supported_providers()
    configured_list = db.query(PortalIntegration).all()
    configured_by_provider = {integ.provider: integ for integ in configured_list}

    items: List[IntegrationHealthItem] = []
    total_configured = 0
    total_reachable = 0

    for prov in supported:
        pid = prov["id"]
        integ = configured_by_provider.get(pid)
        if integ:
            total_configured += 1
            adapter = get_adapter(pid)
            is_reachable = False
            val_err = integ.last_error

            if adapter and adapter.is_supported:
                try:
                    plain_key = decrypt_credential(integ.encrypted_api_key)
                    is_reachable, val_msg = adapter.validate_credentials(
                        api_key=plain_key,
                        api_base_url=integ.api_base_url,
                        config=integ.config,
                    )
                    if not is_reachable:
                        val_err = val_msg
                except Exception as e:
                    is_reachable = False
                    val_err = str(e)

            if is_reachable:
                total_reachable += 1

            jobs_count = db.query(ImportedJobListing).filter(
                ImportedJobListing.integration_id == integ.id,
                ImportedJobListing.status == "active",
            ).count()

            items.append(
                IntegrationHealthItem(
                    provider=pid,
                    name=integ.name,
                    is_configured=True,
                    is_reachable=is_reachable,
                    status="connected" if is_reachable else "error",
                    last_successful_sync=integ.last_sync_at,
                    jobs_imported=jobs_count,
                    jobs_updated=0,
                    latest_error=val_err if not is_reachable else None,
                )
            )
        else:
            items.append(
                IntegrationHealthItem(
                    provider=pid,
                    name=prov["name"],
                    is_configured=False,
                    is_reachable=False,
                    status="unsupported" if not prov.get("is_supported", True) else "unconfigured",
                    last_successful_sync=None,
                    jobs_imported=0,
                    jobs_updated=0,
                    latest_error=prov.get("unsupported_reason"),
                )
            )

    total_active = db.query(ImportedJobListing).filter(ImportedJobListing.status == "active").count()
    overall_status = "healthy" if total_reachable > 0 else ("degraded" if total_configured > 0 else "unconfigured")

    return IntegrationsHealthResponse(
        status=overall_status,
        total_configured=total_configured,
        total_active_jobs=total_active,
        providers=items,
        checked_at=datetime.now(timezone.utc),
    )


@admin_router.get("/integrations/health", response_model=IntegrationsHealthResponse, summary="Audit ATS integration health status")
def get_admin_integrations_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin-only audit of integration providers health without exposing secrets."""
    if current_user.role not in ("authorizer", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authorizer governance permission required to inspect integrations health.",
        )
    return _build_integrations_health(db)


@router.get("/health", response_model=IntegrationsHealthResponse, summary="Audit ATS integration health status")
def get_user_integrations_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """User-accessible summary of integration reachability and sync counts."""
    return _build_integrations_health(db)


@admin_router.get("/database-health", summary="Audit complete database health and table status")
def get_database_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Complete database health audit restricted to administrators and authorizers.
    Reports connection latency, table availability, row counts, and MongoDB mirror health.
    Secrets and passwords are never exposed.
    """
    if current_user.role not in ("authorizer", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authorizer governance permission required to inspect database health.",
        )

    start_time = time.time()
    db_type = "sqlite" if DATABASE_URL.startswith("sqlite") else "postgresql"
    query_healthy = False
    query_err = None

    try:
        db.execute(text("SELECT 1")).scalar()
        query_healthy = True
    except Exception as exc:
        query_err = str(exc).splitlines()[0]

    latency_ms = round((time.time() - start_time) * 1000, 2)

    # Inspect required tables and row counts safely
    table_models = {
        "users": User,
        "job_postings": JobPosting,
        "job_candidate_applications": JobApplication,
        "applications": Application,
        "resumes": Resume,
        "audit_logs": AuditLog,
        "notifications": Notification,
        "portal_integrations": PortalIntegration,
        "integration_sync_history": IntegrationSyncHistory,
        "imported_job_applications": ImportedJobApplication,
    }

    tables_report: Dict[str, Any] = {}
    total_records = 0

    for name, model in table_models.items():
        try:
            count = db.query(model).count()
            tables_report[name] = {"available": True, "count": count}
            total_records += count
        except Exception as e:
            tables_report[name] = {"available": False, "error": str(e).splitlines()[0]}

    # Check MongoDB mirror health if configured
    mongo_report = {"status": "unconfigured"}
    try:
        from backend.database.mongo import mongo_manager
        ping_res = mongo_manager.ping()
        mongo_report = {
            "status": ping_res.get("status", "disconnected"),
            "database": ping_res.get("database"),
            "latency_ms": ping_res.get("latency_ms"),
            "collections_count": len(ping_res.get("collections", [])),
        }
    except Exception as e:
        mongo_report = {"status": "offline", "note": str(e).splitlines()[0]}

    is_healthy = query_healthy and all(t["available"] for t in tables_report.values())

    return {
        "status": "healthy" if is_healthy else "degraded",
        "database_type": db_type,
        "connection": "connected" if query_healthy else "disconnected",
        "query_healthy": query_healthy,
        "query_latency_ms": latency_ms,
        "latency_ms": latency_ms,
        "query_error": query_err,
        "total_records_tracked": total_records,
        "tables": tables_report,
        "mongodb_mirror": mongo_report,
        "last_health_check": datetime.now(timezone.utc),
        "checked_by": str(current_user.email),
        "checked_by_id": current_user.id,
    }
