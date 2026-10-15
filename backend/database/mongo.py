"""
MongoDB Database Manager for AutoAgentHire
Provides native connection pooling, indexes, CRUD helpers, and automatic SQLite synchronization.
"""

import os
import time
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from pymongo import MongoClient, ASCENDING, DESCENDING, TEXT
from pymongo.database import Database
from pymongo.collection import Collection
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

logger = logging.getLogger(__name__)

DEFAULT_MONGO_URI = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://hyraiauto_db_user:eYxzOK1AH9kuNW9E@cluster0.amc4psk.mongodb.net/autoagenthire?retryWrites=true&w=majority"
)
DEFAULT_DB_NAME = os.getenv("MONGODB_DB_NAME", "autoagenthire")


class MongoDBManager:
    """Manages MongoDB Atlas connection and document collections."""

    def __init__(self, uri: Optional[str] = None, db_name: Optional[str] = None):
        self.uri = uri or DEFAULT_MONGO_URI
        self.db_name = db_name or DEFAULT_DB_NAME
        self._client: Optional[MongoClient] = None
        self._db: Optional[Database] = None
        self._connected = False

    def connect(self) -> bool:
        """Initialize connection pool to MongoDB Atlas."""
        if self._connected and self._client:
            return True

        try:
            logger.info("Connecting to MongoDB Atlas at %s...", self.uri.split('@')[-1] if '@' in self.uri else 'local')
            self._client = MongoClient(
                self.uri,
                serverSelectionTimeoutMS=6000,
                connectTimeoutMS=10000,
                socketTimeoutMS=20000,
                maxPoolSize=50,
                minPoolSize=5,
                retryWrites=True,
                retryReads=True,
            )
            # Verify connectivity with ping
            self._client.admin.command('ping')
            self._db = self._client[self.db_name]
            self._connected = True
            logger.info("✓ MongoDB Atlas connected successfully (database: %s)", self.db_name)
            self.ensure_indexes()
            return True
        except Exception as e:
            logger.error("MongoDB Atlas connection failed: %s", e)
            self._connected = False
            return False

    @property
    def db(self) -> Database:
        """Get the MongoDB database instance."""
        if not self._connected or self._db is None:
            self.connect()
        if self._db is None:
            raise RuntimeError("MongoDB connection not established.")
        return self._db

    def get_collection(self, name: str) -> Collection:
        """Get a collection by name."""
        return self.db[name]

    def ping(self) -> Dict[str, Any]:
        """Perform health check on MongoDB cluster."""
        start_time = time.time()
        try:
            if not self._client:
                self.connect()
            self._client.admin.command('ping')
            latency_ms = round((time.time() - start_time) * 1000, 2)
            return {
                "status": "connected",
                "database": self.db_name,
                "latency_ms": latency_ms,
                "collections": self.db.list_collection_names(),
                "error": None
            }
        except Exception as exc:
            return {
                "status": "disconnected",
                "database": self.db_name,
                "latency_ms": None,
                "collections": [],
                "error": str(exc)
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
                    "updated_at": datetime.utcnow().isoformat(),
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
                    "updated_at": datetime.utcnow().isoformat(),
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
                    "updated_at": datetime.utcnow().isoformat(),
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

    # ─────────────────────────────────────────────────────────────────────────
    # Helper Methods for Collections
    # ─────────────────────────────────────────────────────────────────────────
    def get_users(self, filter_query: Optional[Dict] = None) -> List[Dict]:
        return list(self.db["users"].find(filter_query or {}, {"_id": 0}))

    def get_jobs(self, filter_query: Optional[Dict] = None, limit: int = 50) -> List[Dict]:
        return list(self.db["job_postings"].find(filter_query or {}, {"_id": 0}).limit(limit))

    def get_applications(self, filter_query: Optional[Dict] = None, limit: int = 50) -> List[Dict]:
        return list(self.db["job_candidate_applications"].find(filter_query or {}, {"_id": 0}).limit(limit))

    def get_resumes(self, filter_query: Optional[Dict] = None) -> List[Dict]:
        return list(self.db["resumes"].find(filter_query or {}, {"_id": 0}))

    def get_audit_logs(self, filter_query: Optional[Dict] = None, limit: int = 50) -> List[Dict]:
        return list(self.db["audit_logs"].find(filter_query or {}, {"_id": 0}).sort("timestamp", DESCENDING).limit(limit))


# Global singleton manager instance
mongo_manager = MongoDBManager()
