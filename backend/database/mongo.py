"""
MongoDB Database Manager for AutoAgentHire
Provides native connection pooling, indexes, CRUD helpers, and automatic SQLite synchronization.
"""

import os
import time
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
try:
    from pymongo import MongoClient, ASCENDING, DESCENDING, TEXT
    from pymongo.database import Database
    from pymongo.collection import Collection
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
    PYMONGO_AVAILABLE = True
except ImportError:
    MongoClient: Any = Any  # type: ignore[assignment, misc]
    Database: Any = Any  # type: ignore[assignment, misc]
    Collection: Any = Any  # type: ignore[assignment, misc]
    ASCENDING = 1
    DESCENDING = -1
    TEXT = "text"
    ConnectionFailure: Any = Exception  # type: ignore[assignment, misc]
    ServerSelectionTimeoutError: Any = Exception  # type: ignore[assignment, misc]
    PYMONGO_AVAILABLE = False

logger = logging.getLogger(__name__)

DEFAULT_MONGO_URI = os.getenv("MONGODB_URI", "")
DEFAULT_DB_NAME = os.getenv("MONGODB_DB_NAME", "autoagenthire")


class MongoDBManager:
    """Manages MongoDB Atlas connection and document collections with graceful fallback."""

    def __init__(self, uri: Optional[str] = None, db_name: Optional[str] = None):
        self.uri = uri or DEFAULT_MONGO_URI
        self.db_name = db_name or DEFAULT_DB_NAME
        self._client: Any = None
        self._db: Any = None
        self._connected = False
        self._last_attempt: float = 0.0
        self._cooldown_seconds: float = 60.0
        self._failure_logged = False
        self._last_error: Optional[str] = None
        self._indexes_ensured = False

    def get_uri(self) -> str:
        """Resolve MongoDB URI from instance setting or environment."""
        if self.uri:
            return self.uri
        return os.getenv("MONGODB_URI", "").strip()

    def connect(self) -> bool:
        """Initialize connection pool to MongoDB Atlas with circuit-breaker protection."""
        if not PYMONGO_AVAILABLE:
            if not self._failure_logged:
                logger.info("[MongoDB] pymongo driver not installed — operating on primary SQLite database.")
                self._failure_logged = True
            return False

        if self._connected and self._client and self._db is not None:
            return True

        current_uri = self.get_uri()
        if not current_uri:
            if not self._failure_logged:
                logger.info("[MongoDB] MONGODB_URI not configured — operating on local database.")
                self._failure_logged = True
            return False

        self.uri = current_uri
        now = time.time()
        # Cooldown guard: avoid repeating blocking TLS/handshake attempts during requests
        if not self._connected and (now - self._last_attempt) < self._cooldown_seconds:
            return False

        self._last_attempt = now

        try:
            extra_kwargs: Dict[str, Any] = {}
            try:
                import certifi
                extra_kwargs["tlsCAFile"] = certifi.where()
            except ImportError:
                pass

            self._client = MongoClient(
                self.uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=10000,
                maxPoolSize=20,
                minPoolSize=1,
                retryWrites=True,
                retryReads=True,
                **extra_kwargs,
            )
            # Verify connectivity with ping
            self._client.admin.command('ping')
            self._db = self._client[self.db_name]
            self._connected = True
            self._last_error = None
            self._failure_logged = False
            logger.info("✓ MongoDB Atlas connected successfully (database: %s)", self.db_name)
            if not self._indexes_ensured:
                try:
                    self.ensure_indexes()
                    self._indexes_ensured = True
                except Exception as idx_err:
                    logger.debug("Indexes ensure note: %s", idx_err)
            return True
        except Exception as e:
            raw_err = str(e)
            if "TLSV1_ALERT_INTERNAL_ERROR" in raw_err or "SSL handshake failed" in raw_err:
                err_msg = "TLS handshake rejected (likely IP not whitelisted in MongoDB Atlas Network Access or cluster paused)"
            elif "timed out" in raw_err.lower():
                err_msg = "Connection timed out"
            else:
                err_msg = raw_err.splitlines()[0] if raw_err else "Connection failed"

            self._last_error = err_msg
            if not self._failure_logged:
                logger.warning(
                    "[MongoDB] Optional MongoDB Atlas unavailable: %s. Operating safely on SQLite database. (Next retry in %ds)",
                    err_msg,
                    int(self._cooldown_seconds),
                )
                self._failure_logged = True
            else:
                logger.debug("[MongoDB] Connection retry skipped: %s", err_msg)

            self._connected = False
            return False

    @property
    def db(self) -> Any:
        """Get the MongoDB database instance."""
        if not self._connected or self._db is None:
            self.connect()
        if self._db is None:
            raise RuntimeError(f"MongoDB connection not established ({self._last_error or 'unavailable'}).")
        return self._db

    def get_collection(self, name: str) -> Any:
        """Get a collection by name."""
        return self.db[name]

    def ping(self) -> Dict[str, Any]:
        """Perform health check on MongoDB cluster."""
        start_time = time.time()
        try:
            if not self._client or not self._connected:
                return {
                    "status": "disconnected",
                    "database": self.db_name,
                    "latency_ms": None,
                    "collections": [],
                    "error": self._last_error or "MongoDB Atlas unreachable",
                }
            self._client.admin.command('ping')
            latency_ms = round((time.time() - start_time) * 1000, 2)
            colls = self._db.list_collection_names() if self._db is not None else []
            return {
                "status": "connected",
                "database": self.db_name,
                "latency_ms": latency_ms,
                "collections": colls,
                "error": None,
            }
        except Exception as exc:
            err_str = str(exc)
            if "TLSV1_ALERT_INTERNAL_ERROR" in err_str:
                err_clean = "TLS handshake rejected (IP not in Atlas Network Access list)"
            else:
                err_clean = err_str.splitlines()[0] if err_str else "Health check failed"
            return {
                "status": "disconnected",
                "database": self.db_name,
                "latency_ms": None,
                "collections": [],
                "error": err_clean,
            }

    def ensure_indexes(self):
        """Create required indexes across all collections."""
        try:
            # Users
            users_col = self.db["users"]
            users_col.create_index([("email", ASCENDING)], unique=True, sparse=True)
            users_col.create_index([("id", ASCENDING)], sparse=True)
            users_col.create_index([("role", ASCENDING)])
            users_col.create_index([("custom_user_id", ASCENDING)], sparse=True)

            # Job Postings
            jobs_col = self.db["job_postings"]
            jobs_col.create_index([("id", ASCENDING)], sparse=True)
            jobs_col.create_index([("status", ASCENDING)])
            jobs_col.create_index([("recruiter_id", ASCENDING)])
            jobs_col.create_index([("title", TEXT), ("description", TEXT), ("skills", TEXT)])

            # Candidate Applications
            apps_col = self.db["job_candidate_applications"]
            apps_col.create_index([("id", ASCENDING)], sparse=True)
            apps_col.create_index([("job_posting_id", ASCENDING)])
            apps_col.create_index([("candidate_email", ASCENDING)])
            apps_col.create_index([("candidate_id", ASCENDING)])
            apps_col.create_index([("status", ASCENDING)])

            # Resumes
            resumes_col = self.db["resumes"]
            resumes_col.create_index([("id", ASCENDING)], sparse=True)
            resumes_col.create_index([("user_id", ASCENDING)])
            resumes_col.create_index([("is_active", ASCENDING)])

            # Audit Logs
            audit_col = self.db["audit_logs"]
            audit_col.create_index([("user_id", ASCENDING)])
            audit_col.create_index([("performed_by_email", ASCENDING)])
            audit_col.create_index([("timestamp", DESCENDING)])

            logger.info("✓ MongoDB indexes ensured across collections.")
        except Exception as e:
            logger.warning("Could not create MongoDB indexes: %s", e)

    # ─────────────────────────────────────────────────────────────────────────
    # Synchronize SQLite Data to MongoDB
    # ─────────────────────────────────────────────────────────────────────────
    def sync_from_sqlite(self) -> Dict[str, Any]:
        """
        Export all records from SQLite to MongoDB Atlas so MongoDB contains
        the latest application data, user profiles, jobs, applications, and resumes.
        """
        from backend.database.connection import SessionLocal
        from backend.database.models_complete import (
            User, JobPosting, JobApplication, Resume, AuditLog, Application
        )

        counts = {
            "users": 0,
            "job_postings": 0,
            "job_candidate_applications": 0,
            "resumes": 0,
            "audit_logs": 0,
        }

        db_session = SessionLocal()
        try:
            # 1. Sync Users
            for u in db_session.query(User).all():
                doc = {
                    "id": u.id,
                    "uuid": u.uuid,
                    "email": u.email,
                    "hashed_password": u.hashed_password,
                    "full_name": u.full_name,
                    "first_name": u.first_name,
                    "last_name": u.last_name,
                    "role": u.role,
                    "company_name": u.company_name,
                    "company_logo_url": u.company_logo_url,
                    "phone": u.phone,
                    "location": u.location,
                    "is_active": u.is_active,
                    "is_verified": u.is_verified,
                    "approval_status": u.approval_status,
                    "custom_user_id": u.custom_user_id,
                    "default_skills": u.default_skills,
                    "default_experience_level": u.default_experience_level,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                self.db["users"].update_one({"email": u.email}, {"$set": doc}, upsert=True)
                counts["users"] += 1

            # 2. Sync Job Postings
            for j in db_session.query(JobPosting).all():
                doc = {
                    "id": j.id,
                    "uuid": j.uuid,
                    "recruiter_id": j.recruiter_id,
                    "title": j.title,
                    "company_name": j.company_name,
                    "company_logo_url": j.company_logo_url,
                    "organization_symbol": j.organization_symbol,
                    "vacancies": j.vacancies,
                    "salary_description": j.salary_description,
                    "job_type": j.job_type,
                    "location": j.location,
                    "description": j.description,
                    "requirements": j.requirements,
                    "skills": j.skills,
                    "recruiting_process": j.recruiting_process,
                    "status": j.status,
                    "created_at": j.created_at.isoformat() if j.created_at else None,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                self.db["job_postings"].update_one({"id": j.id}, {"$set": doc}, upsert=True)
                counts["job_postings"] += 1

            # 3. Sync Candidate Applications
            for a in db_session.query(JobApplication).all():
                doc = {
                    "id": a.id,
                    "uuid": a.uuid,
                    "job_posting_id": a.job_posting_id,
                    "candidate_id": a.candidate_id,
                    "candidate_name": a.candidate_name,
                    "candidate_email": a.candidate_email,
                    "candidate_phone": a.candidate_phone,
                    "linkedin_url": a.linkedin_url,
                    "portfolio_url": a.portfolio_url,
                    "resume_url": a.resume_url,
                    "resume_filename": a.resume_filename,
                    "cv_url": a.cv_url,
                    "cv_filename": a.cv_filename,
                    "status": a.status,
                    "match_score": a.match_score,
                    "email_status": a.email_status,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                self.db["job_candidate_applications"].update_one({"id": a.id}, {"$set": doc}, upsert=True)
                counts["job_candidate_applications"] += 1

            # 4. Sync Resumes
            for r in db_session.query(Resume).all():
                doc = {
                    "id": r.id,
                    "uuid": r.uuid,
                    "user_id": r.user_id,
                    "filename": r.filename,
                    "file_path": r.file_path,
                    "file_size_bytes": r.file_size_bytes,
                    "file_type": r.file_type,
                    "raw_text": r.raw_text,
                    "parsed_data": r.parsed_data,
                    "full_name": r.full_name,
                    "email": r.email,
                    "phone": r.phone,
                    "location": r.location,
                    "skills": r.skills,
                    "summary": r.summary,
                    "is_active": r.is_active,
                    "storage_url": r.storage_url,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                self.db["resumes"].update_one({"id": r.id}, {"$set": doc}, upsert=True)
                counts["resumes"] += 1

            # 5. Sync Audit Logs
            for log in db_session.query(AuditLog).all():
                doc = {
                    "id": log.id,
                    "uuid": log.uuid,
                    "user_id": log.user_id,
                    "performed_by_email": log.performed_by_email,
                    "action": log.action,
                    "target_type": log.target_type,
                    "target_id": log.target_id,
                    "details": log.details,
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                }
                self.db["audit_logs"].update_one({"id": log.id}, {"$set": doc}, upsert=True)
                counts["audit_logs"] += 1

            logger.info("✓ Successfully synced SQLite data to MongoDB Atlas: %s", counts)
            return {"status": "success", "synced": counts}
        except Exception as e:
            logger.error("Error syncing to MongoDB Atlas: %s", e, exc_info=True)
            return {"status": "error", "error": str(e), "synced": counts}
        finally:
            db_session.close()

    def _is_available(self) -> bool:
        if self._connected and self._client and self._db is not None:
            return True
        return self.connect()

    def get_users(self, filter_query: Optional[Dict] = None) -> List[Dict]:
        if not self._is_available():
            return []
        return list(self.db["users"].find(filter_query or {}, {"_id": 0}))

    def get_jobs(self, filter_query: Optional[Dict] = None, limit: int = 50) -> List[Dict]:
        if not self._is_available():
            return []
        return list(self.db["job_postings"].find(filter_query or {}, {"_id": 0}).limit(limit))

    def get_applications(self, filter_query: Optional[Dict] = None, limit: int = 50) -> List[Dict]:
        if not self._is_available():
            return []
        return list(self.db["job_candidate_applications"].find(filter_query or {}, {"_id": 0}).limit(limit))

    def get_resumes(self, filter_query: Optional[Dict] = None) -> List[Dict]:
        if not self._is_available():
            return []
        return list(self.db["resumes"].find(filter_query or {}, {"_id": 0}))

    def get_audit_logs(self, filter_query: Optional[Dict] = None, limit: int = 50) -> List[Dict]:
        if not self._is_available():
            return []
        return list(self.db["audit_logs"].find(filter_query or {}, {"_id": 0}).sort("timestamp", DESCENDING).limit(limit))

    # ─────────────────────────────────────────────────────────────────────────
    # Native MongoDB CRUD Operations for Unified Persistence
    # ─────────────────────────────────────────────────────────────────────────
    def find_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Find user by email case-insensitively in MongoDB users collection."""
        if not self._is_available():
            return None
        import re
        clean_email = email.strip()
        user_doc = self.db["users"].find_one({
            "email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}
        })
        if user_doc:
            user_doc.pop("_id", None)
        return user_doc

    def find_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Find user by numeric ID in MongoDB users collection."""
        if not self._is_available():
            return None
        user_doc = self.db["users"].find_one({"id": user_id})
        if user_doc:
            user_doc.pop("_id", None)
        return user_doc

    def find_user_by_identifier(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Find user by email, custom_user_id, or uuid in MongoDB users collection."""
        if not self._is_available():
            return None
        import re
        clean_id = identifier.strip()
        user_doc = self.db["users"].find_one({
            "$or": [
                {"email": {"$regex": f"^{re.escape(clean_id)}$", "$options": "i"}},
                {"custom_user_id": {"$regex": f"^{re.escape(clean_id)}$", "$options": "i"}},
                {"uuid": clean_id},
            ]
        })
        if user_doc:
            user_doc.pop("_id", None)
        return user_doc

    def save_user(self, user_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update user document in MongoDB Atlas users collection."""
        if not self._is_available():
            return user_dict
        import re
        email = str(user_dict.get("email", "")).strip().lower()
        if not email:
            return user_dict

        doc = dict(user_dict)
        doc.pop("_id", None)
        doc["email"] = email
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        if "created_at" not in doc or not doc["created_at"]:
            doc["created_at"] = datetime.now(timezone.utc).isoformat()

        # If numeric id not provided, auto-increment based on current highest id
        if "id" not in doc or doc["id"] is None:
            last = self.db["users"].find_one(sort=[("id", DESCENDING)])
            doc["id"] = (last.get("id", 0) + 1) if (last and last.get("id")) else 1

        self.db["users"].update_one(
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            {"$set": doc},
            upsert=True,
        )
        return doc

    def record_audit_log(self, log_dict: Dict[str, Any]) -> bool:
        """Insert audit log entry into MongoDB audit_logs collection."""
        if not self._is_available():
            return False
        doc = dict(log_dict)
        doc.pop("_id", None)
        if "timestamp" not in doc or not doc["timestamp"]:
            doc["timestamp"] = datetime.now(timezone.utc).isoformat()
        self.db["audit_logs"].insert_one(doc)
        return True

    def save_application(self, app_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update application in MongoDB job_candidate_applications collection."""
        if not self._is_available():
            return app_dict
        doc = dict(app_dict)
        doc.pop("_id", None)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        app_id = doc.get("id")
        if app_id:
            self.db["job_candidate_applications"].update_one({"id": app_id}, {"$set": doc}, upsert=True)
        else:
            self.db["job_candidate_applications"].insert_one(doc)
        return doc

    def save_resume(self, resume_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update resume in MongoDB resumes collection."""
        if not self._is_available():
            return resume_dict
        doc = dict(resume_dict)
        doc.pop("_id", None)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        res_id = doc.get("id")
        if res_id:
            self.db["resumes"].update_one({"id": res_id}, {"$set": doc}, upsert=True)
        else:
            self.db["resumes"].insert_one(doc)
        return doc

    def save_practice_session(self, session_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update practice session in MongoDB practice_sessions collection."""
        if not self._is_available():
            return session_dict
        doc = dict(session_dict)
        doc.pop("_id", None)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        sess_id = doc.get("id")
        if sess_id:
            self.db["practice_sessions"].update_one({"id": sess_id}, {"$set": doc}, upsert=True)
        else:
            self.db["practice_sessions"].insert_one(doc)
        return doc

    def save_saved_job(self, job_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update saved job in MongoDB user_saved_jobs collection."""
        if not self._is_available():
            return job_dict
        doc = dict(job_dict)
        doc.pop("_id", None)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.db["user_saved_jobs"].update_one(
            {"user_id": doc.get("user_id"), "job_id": doc.get("job_id")},
            {"$set": doc},
            upsert=True
        )
        return doc


# Global singleton manager instance
mongo_manager = MongoDBManager()
