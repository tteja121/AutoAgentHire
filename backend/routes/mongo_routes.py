"""
MongoDB Atlas Management and Diagnostic Routes
Provides health checks, collection inspect endpoints, and synchronization triggers.
"""

from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from backend.database.mongo import mongo_manager
from backend.auth.dependencies import get_current_user_optional
from backend.database.models_complete import User

router = APIRouter(prefix="/api/mongo", tags=["MongoDB"])


@router.get("/status")
def get_mongo_status():
    """Check MongoDB Atlas cluster connection status and collection statistics."""
    ping_result = mongo_manager.ping()
    if ping_result.get("status") != "connected":
        raise HTTPException(
            status_code=503,
            detail=f"MongoDB Atlas disconnected: {ping_result.get('error')}"
        )

    try:
        col_names = mongo_manager.db.list_collection_names()
        counts = {}
        for col_name in col_names:
            counts[col_name] = mongo_manager.db[col_name].count_documents({})

        return {
            "status": "healthy",
            "cluster": "MongoDB Atlas",
            "database": mongo_manager.db_name,
            "latency_ms": ping_result.get("latency_ms"),
            "collections_count": len(col_names),
            "collection_documents": counts,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/sync")
def trigger_mongo_sync():
    """Trigger manual or automated synchronization of SQLite records into MongoDB Atlas."""
    res = mongo_manager.sync_from_sqlite()
    return res


@router.get("/collections")
def list_mongo_collections():
    """List all available collections in MongoDB Atlas."""
    try:
        return {
            "database": mongo_manager.db_name,
            "collections": mongo_manager.db.list_collection_names()
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/jobs")
def get_mongo_jobs(limit: int = 50):
    """Retrieve job postings stored directly in MongoDB Atlas."""
    return {
        "jobs": mongo_manager.get_jobs(limit=limit),
        "source": "MongoDB Atlas"
    }


@router.get("/applications")
def get_mongo_applications(candidate_email: Optional[str] = None, limit: int = 50):
    """Retrieve candidate applications stored directly in MongoDB Atlas."""
    filter_q = {}
    if candidate_email:
        filter_q["candidate_email"] = candidate_email.strip()
    return {
        "applications": mongo_manager.get_applications(filter_query=filter_q, limit=limit),
        "source": "MongoDB Atlas"
    }


@router.get("/users")
def get_mongo_users(limit: int = 50):
    """Retrieve user accounts stored in MongoDB Atlas."""
    users = mongo_manager.get_users()
    # Mask hashed password for security
    sanitized = []
    for u in users[:limit]:
        u_copy = dict(u)
        u_copy["hashed_password"] = "***MASKED***"
        sanitized.append(u_copy)
    return {
        "users": sanitized,
        "total": len(users),
        "source": "MongoDB Atlas"
    }
