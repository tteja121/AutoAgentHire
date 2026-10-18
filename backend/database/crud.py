"""
CRUD Operations for AutoAgentHire Database
Repository pattern implementation for all models

Note: Pylance type warnings about SQLAlchemy Column assignments are false positives.
SQLAlchemy handles Column -> Python type conversion at runtime.
"""

from typing import List, Optional, Dict, Any, cast
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_, or_

from backend.database.models_complete import (
    User, Resume, AgentRun, Application, 
    AgentLog, JobCache, FileStorage, AnalyticsEvent,
    Notification
)


# ═══════════════════════════════════════════════════════════════════════════════
# User CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class UserRepository:
    """Repository for User operations"""
    
    @staticmethod
    def create(db: Session, email: str, hashed_password: str, **kwargs) -> User:
        """Create a new user"""
        user = User(
            email=email,
            hashed_password=hashed_password,
            **kwargs
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def get_by_id(db: Session, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()
    
    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        """Get user by email"""
        return db.query(User).filter(User.email == email).first()
    
    @staticmethod
    def get_by_uuid(db: Session, uuid: str) -> Optional[User]:
        """Get user by UUID"""
        return db.query(User).filter(User.uuid == uuid).first()

    @staticmethod
    def get_by_identifier(db: Session, identifier: str) -> Optional[User]:
        """Get user by email, custom_user_id, or UUID"""
        identifier_clean = identifier.strip()
        user = db.query(User).filter(User.email.ilike(identifier_clean)).first()
        if user:
            return user
        if hasattr(User, 'custom_user_id'):
            user = db.query(User).filter(User.custom_user_id.ilike(identifier_clean)).first()
            if user:
                return user
        return db.query(User).filter(User.uuid == identifier_clean).first()
    
    @staticmethod
    def update(db: Session, user_id: int, **kwargs) -> Optional[User]:
        """Update user"""
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            for key, value in kwargs.items():
                if hasattr(user, key):
                    setattr(user, key, value)
            db.commit()
            db.refresh(user)
        return user
    
    @staticmethod
    def delete(db: Session, user_id: int) -> bool:
        """Soft delete user"""
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            setattr(user, 'deleted_at', datetime.now(timezone.utc))
            setattr(user, 'is_active', False)
            db.commit()
            return True
        return False
    
    @staticmethod
    def list_all(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
        """List all active users"""
        return db.query(User)\
            .filter(User.is_active == True)\
            .offset(skip)\
            .limit(limit)\
            .all()


# ═══════════════════════════════════════════════════════════════════════════════
# Resume CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class ResumeRepository:
    """Repository for Resume operations"""
    
    @staticmethod
    def create(db: Session, user_id: int, filename: str, file_path: str, 
               file_size_bytes: int, file_type: str, **kwargs) -> Resume:
        """Create a new resume"""
        # Deactivate existing resumes for user
        db.query(Resume)\
            .filter(Resume.user_id == user_id, Resume.is_active == True)\
            .update({"is_active": False})
        
        resume = Resume(
            user_id=user_id,
            filename=filename,
            file_path=file_path,
            file_size_bytes=file_size_bytes,
            file_type=file_type,
            **kwargs
        )
        db.add(resume)
        db.commit()
        db.refresh(resume)
        return resume
    
    @staticmethod
    def get_by_id(db: Session, resume_id: int) -> Optional[Resume]:
        """Get resume by ID"""
        return db.query(Resume).filter(Resume.id == resume_id).first()
    
    @staticmethod
    def get_active_for_user(db: Session, user_id: int) -> Optional[Resume]:
        """Get active resume for user"""
        return db.query(Resume)\
            .filter(Resume.user_id == user_id, Resume.is_active == True)\
            .first()
    
    @staticmethod
    def get_all_for_user(db: Session, user_id: int) -> List[Resume]:
        """Get all resumes for user"""
        return db.query(Resume)\
            .filter(Resume.user_id == user_id)\
            .order_by(desc(Resume.created_at))\
            .all()
    
    @staticmethod
    def update(db: Session, resume_id: int, **kwargs) -> Optional[Resume]:
        """Update resume"""
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            for key, value in kwargs.items():
                if hasattr(resume, key):
                    setattr(resume, key, value)
            db.commit()
            db.refresh(resume)
        return resume
    
    @staticmethod
    def update_embedding(db: Session, resume_id: int, embedding: List[float], 
                        model: str = "all-MiniLM-L6-v2") -> Optional[Resume]:
        """Update resume embedding"""
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            setattr(resume, 'embedding_vector', embedding)
            setattr(resume, 'embedding_model', model)
            setattr(resume, 'embedding_dimensions', len(embedding))
            setattr(resume, 'embedding_created_at', datetime.now(timezone.utc))
            db.commit()
            db.refresh(resume)
        return resume
    
    @staticmethod
    def delete(db: Session, resume_id: int) -> bool:
        """Delete resume"""
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            db.delete(resume)
            db.commit()
            return True
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# AgentRun CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class AgentRunRepository:
    """Repository for AgentRun operations"""
    
    @staticmethod
    def create(db: Session, user_id: int, resume_id: int, 
               job_role: str, **kwargs) -> AgentRun:
        """Create a new agent run"""
        agent_run = AgentRun(
            user_id=user_id,
            resume_id=resume_id,
            job_role=job_role,
            status='pending',
            **kwargs
        )
        db.add(agent_run)
        db.commit()
        db.refresh(agent_run)
        return agent_run
    
    @staticmethod
    def get_by_id(db: Session, run_id: int) -> Optional[AgentRun]:
        """Get agent run by ID"""
        return db.query(AgentRun).filter(AgentRun.id == run_id).first()
    
    @staticmethod
    def get_by_uuid(db: Session, uuid: str) -> Optional[AgentRun]:
        """Get agent run by UUID"""
        return db.query(AgentRun).filter(AgentRun.uuid == uuid).first()
    
    @staticmethod
    def get_for_user(db: Session, user_id: int, limit: int = 20) -> List[AgentRun]:
        """Get recent agent runs for user"""
        return db.query(AgentRun)\
            .filter(AgentRun.user_id == user_id)\
            .order_by(desc(AgentRun.created_at))\
            .limit(limit)\
            .all()
    
    @staticmethod
    def get_active_runs(db: Session) -> List[AgentRun]:
        """Get all currently running agents"""
        active_statuses = ['pending', 'initializing', 'parsing_resume', 
                          'searching_jobs', 'matching_jobs', 'applying']
        return db.query(AgentRun)\
            .filter(AgentRun.status.in_(active_statuses))\
            .all()
    
    @staticmethod
    def update_status(db: Session, run_id: int, status: str, 
                     phase: Optional[str] = None, progress: Optional[float] = None,
                     **kwargs: Any) -> Optional[AgentRun]:
        """Update agent run status"""
        agent_run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
        if agent_run:
            setattr(agent_run, 'status', status)
            if phase:
                setattr(agent_run, 'current_phase', phase)
            if progress is not None:
                setattr(agent_run, 'progress_percentage', progress)
            
            # Set timestamps
            if status in ['completed', 'failed', 'cancelled']:
                setattr(agent_run, 'completed_at', datetime.now(timezone.utc))
            elif status == 'initializing' and getattr(agent_run, 'started_at', None) is None:
                setattr(agent_run, 'started_at', datetime.now(timezone.utc))
            
            for key, value in kwargs.items():
                if hasattr(agent_run, key):
                    setattr(agent_run, key, value)
            
            db.commit()
            db.refresh(agent_run)
        return agent_run
    
    @staticmethod
    def update_metrics(db: Session, run_id: int, **kwargs) -> Optional[AgentRun]:
        """Update agent run metrics"""
        agent_run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
        if agent_run:
            for key, value in kwargs.items():
                if hasattr(agent_run, key):
                    setattr(agent_run, key, value)
            db.commit()
            db.refresh(agent_run)
        return agent_run


# ═══════════════════════════════════════════════════════════════════════════════
# Application CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class ApplicationRepository:
    """Repository for Application operations"""
    
    @staticmethod
    def create(db: Session, agent_run_id: int, job_url: str, 
               job_title: str, company_name: str, 
               match_score: float, **kwargs) -> Application:
        """Create a new application record"""
        application = Application(
            agent_run_id=agent_run_id,
            job_url=job_url,
            job_title=job_title,
            company_name=company_name,
            match_score=match_score,
            status='pending',
            **kwargs
        )
        db.add(application)
        db.commit()
        db.refresh(application)
        return application
    
    @staticmethod
    def get_by_id(db: Session, app_id: int) -> Optional[Application]:
        """Get application by ID"""
        return db.query(Application).filter(Application.id == app_id).first()
    
    @staticmethod
    def get_for_run(db: Session, run_id: int) -> List[Application]:
        """Get all applications for an agent run"""
        return db.query(Application)\
            .filter(Application.agent_run_id == run_id)\
            .order_by(desc(Application.match_score))\
            .all()
    
    @staticmethod
    def get_for_user(db: Session, user_id: int, limit: int = 100) -> List[Application]:
        """Get all applications for a user (via agent runs)"""
        return db.query(Application)\
            .join(AgentRun)\
            .filter(AgentRun.user_id == user_id)\
            .order_by(desc(Application.created_at))\
            .limit(limit)\
            .all()
    
    @staticmethod
    def update_status(db: Session, app_id: int, status: str, 
                     **kwargs: Any) -> Optional[Application]:
        """Update application status"""
        application = db.query(Application).filter(Application.id == app_id).first()
        if application:
            setattr(application, 'status', status)
            if status == 'applied' and getattr(application, 'applied_at', None) is None:
                setattr(application, 'applied_at', datetime.now(timezone.utc))
            
            for key, value in kwargs.items():
                if hasattr(application, key):
                    setattr(application, key, value)
            
            db.commit()
            db.refresh(application)
        return application
    
    @staticmethod
    def get_stats_for_user(db: Session, user_id: int) -> Dict[str, Any]:
        """Get application statistics for user"""
        apps = db.query(Application)\
            .join(AgentRun)\
            .filter(AgentRun.user_id == user_id)\
            .all()
        
        # Use getattr to avoid Pylance Column type issues
        def get_status(app: Application) -> str:
            return str(getattr(app, 'status', ''))
        
        def get_match_score(app: Application) -> float:
            return float(getattr(app, 'match_score', 0) or 0)
        
        return {
            "total": len(apps),
            "applied": len([a for a in apps if get_status(a) == 'applied']),
            "pending": len([a for a in apps if get_status(a) == 'pending']),
            "failed": len([a for a in apps if get_status(a) == 'failed']),
            "skipped": len([a for a in apps if get_status(a) == 'skipped']),
            "avg_match_score": sum(get_match_score(a) for a in apps) / len(apps) if apps else 0,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# AgentLog CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class AgentLogRepository:
    """Repository for AgentLog operations"""
    
    @staticmethod
    def create(db: Session, agent_run_id: int, agent_name: str,
               action: str, message: str, log_level: str = 'INFO',
               **kwargs) -> AgentLog:
        """Create a new log entry"""
        log = AgentLog(
            agent_run_id=agent_run_id,
            agent_name=agent_name,
            action=action,
            message=message,
            log_level=log_level,
            **kwargs
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log
    
    @staticmethod
    def get_for_run(db: Session, run_id: int, 
                   level: Optional[str] = None, limit: int = 1000) -> List[AgentLog]:
        """Get logs for an agent run"""
        query = db.query(AgentLog).filter(AgentLog.agent_run_id == run_id)
        if level:
            query = query.filter(AgentLog.log_level == level)
        return query.order_by(desc(AgentLog.timestamp)).limit(limit).all()
    
    @staticmethod
    def get_errors(db: Session, run_id: int) -> List[AgentLog]:
        """Get error logs for an agent run"""
        return db.query(AgentLog)\
            .filter(
                AgentLog.agent_run_id == run_id,
                AgentLog.log_level.in_(['ERROR', 'CRITICAL'])
            )\
            .order_by(desc(AgentLog.timestamp))\
            .all()
    
    @staticmethod
    def bulk_create(db: Session, logs: List[Dict]) -> int:
        """Bulk create log entries"""
        log_objects = [AgentLog(**log) for log in logs]
        db.bulk_save_objects(log_objects)
        db.commit()
        return len(log_objects)


# ═══════════════════════════════════════════════════════════════════════════════
# JobCache CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class JobCacheRepository:
    """Repository for JobCache operations"""
    
    @staticmethod
    def create_or_update(db: Session, job_id: str, job_url: str,
                        job_title: str, company_name: str,
                        **kwargs) -> JobCache:
        """Create or update job cache entry"""
        job = db.query(JobCache).filter(JobCache.job_id == job_id).first()
        
        if job:
            # Update existing
            setattr(job, 'job_title', job_title)
            setattr(job, 'company_name', company_name)
            setattr(job, 'last_verified_at', datetime.now(timezone.utc))
            setattr(job, 'cache_hits', (getattr(job, 'cache_hits', 0) or 0) + 1)
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)
        else:
            # Create new
            job = JobCache(
                job_id=job_id,
                job_url=job_url,
                job_title=job_title,
                company_name=company_name,
                **kwargs
            )
            db.add(job)
        
        db.commit()
        db.refresh(job)
        return job
    
    @staticmethod
    def get_by_job_id(db: Session, job_id: str) -> Optional[JobCache]:
        """Get cached job by LinkedIn job ID"""
        return db.query(JobCache).filter(JobCache.job_id == job_id).first()
    
    @staticmethod
    def search(db: Session, keyword: Optional[str] = None, 
              location: Optional[str] = None, limit: int = 100) -> List[JobCache]:
        """Search cached jobs"""
        query = db.query(JobCache).filter(JobCache.is_active == True)
        
        if keyword:
            query = query.filter(
                or_(
                    JobCache.job_title.ilike(f'%{keyword}%'),
                    JobCache.company_name.ilike(f'%{keyword}%')
                )
            )
        if location:
            query = query.filter(JobCache.location.ilike(f'%{location}%'))
        
        return query.limit(limit).all()
    
    @staticmethod
    def cleanup_expired(db: Session) -> int:
        """Remove expired cache entries"""
        count = db.query(JobCache)\
            .filter(JobCache.expires_at < datetime.now(timezone.utc))\
            .delete()
        db.commit()
        return count


# ═══════════════════════════════════════════════════════════════════════════════
# FileStorage CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class FileStorageRepository:
    """Repository for FileStorage operations"""
    
    @staticmethod
    def create(db: Session, filename: str, file_path: str,
              file_size_bytes: int, file_type: str,
              category: str, **kwargs) -> FileStorage:
        """Create a new file storage record"""
        file_record = FileStorage(
            filename=filename,
            file_path=file_path,
            file_size_bytes=file_size_bytes,
            file_type=file_type,
            category=category,
            **kwargs
        )
        db.add(file_record)
        db.commit()
        db.refresh(file_record)
        return file_record
    
    @staticmethod
    def get_by_uuid(db: Session, uuid: str) -> Optional[FileStorage]:
        """Get file by UUID"""
        return db.query(FileStorage).filter(FileStorage.uuid == uuid).first()
    
    @staticmethod
    def get_for_entity(db: Session, entity_type: str, 
                      entity_id: int) -> List[FileStorage]:
        """Get files for an entity"""
        return db.query(FileStorage)\
            .filter(
                FileStorage.entity_type == entity_type,
                FileStorage.entity_id == entity_id,
                FileStorage.deleted_at.is_(None)
            )\
            .all()
    
    @staticmethod
    def soft_delete(db: Session, file_id: int) -> bool:
        """Soft delete a file record"""
        file_record = db.query(FileStorage).filter(FileStorage.id == file_id).first()
        if file_record:
            setattr(file_record, 'deleted_at', datetime.now(timezone.utc))
            db.commit()
            return True
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# Analytics CRUD Operations
# ═══════════════════════════════════════════════════════════════════════════════

class AnalyticsRepository:
    """Repository for Analytics operations"""
    
    @staticmethod
    def track_event(db: Session, event_type: str, event_name: str,
                   user_id: Optional[int] = None, **kwargs: Any) -> AnalyticsEvent:
        """Track an analytics event"""
        event = AnalyticsEvent(
            event_type=event_type,
            event_name=event_name,
            user_id=user_id,
            **kwargs
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    
    @staticmethod
    def get_events_for_user(db: Session, user_id: int,
                           days: int = 30, limit: int = 1000) -> List[AnalyticsEvent]:
        """Get events for a user"""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        
        return db.query(AnalyticsEvent)\
            .filter(
                AnalyticsEvent.user_id == user_id,
                AnalyticsEvent.timestamp > cutoff
            )\
            .order_by(desc(AnalyticsEvent.timestamp))\
            .limit(limit)\
            .all()


# ── Standalone CRUD helpers called by agent_routes.py ──────────────────────

def get_user_by_email(db: Session, email: str):
    """Delegate to UserRepository."""
    return UserRepository.get_by_email(db, email=email)


def create_user(db: Session, email: str, hashed_password: str = "", full_name: str = "", role: str = "job_seeker", **kwargs):
    """Delegate to UserRepository."""
    if not hashed_password:
        import uuid as _uuid
        from backend.auth.password import hash_password
        hashed_password = hash_password(_uuid.uuid4().hex)
    return UserRepository.create(db, email=email, hashed_password=hashed_password, full_name=full_name, role=role, **kwargs)


def create_agent_run(db: Session, data: dict):
    """Create a new AgentRun record."""
    run = AgentRun(**data)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def get_agent_run(db: Session, run_id: str):
    """Get an AgentRun by its UUID string."""
    return db.query(AgentRun).filter(AgentRun.uuid == run_id).first()


def update_agent_run(db: Session, run_id: str, data: dict):
    """Update an AgentRun by UUID."""
    run = get_agent_run(db, run_id)
    if run is None:
        return None
    for key, value in data.items():
        setattr(run, key, value)
    db.commit()
    db.refresh(run)
    return run


def get_user_agent_runs(db: Session, user_id: int, limit: int = 50):
    """Get AgentRuns for a user."""
    return AgentRunRepository.get_for_user(db, user_id=user_id, limit=limit)


def create_application(db: Session, data: dict):
    """Create a new Application record."""
    app = Application(**data)
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def get_agent_run_applications(db: Session, run_id: str):
    """Get Applications linked to a specific AgentRun by UUID."""
    run = get_agent_run(db, run_id)
    if run is None:
        return []
    return db.query(Application).filter(Application.agent_run_id == run.id).all()


def deactivate_other_resumes(db: Session, user_id: int, resume_id: int):
    """Set is_active=False for all resumes of user except the given resume_id."""
    db.query(Resume).filter(
        Resume.user_id == user_id,
        Resume.id != resume_id
    ).update({"is_active": False}, synchronize_session="fetch")
    db.commit()


def create_resume(db: Session, user_id: int, resume_dict: dict):
    """Create a Resume record for a user."""
    return ResumeRepository.create(
        db,
        user_id=user_id,
        filename=resume_dict.get("filename", "resume"),
        file_path=resume_dict.get("file_path", ""),
        file_size_bytes=resume_dict.get("file_size_bytes", 0),
        file_type=resume_dict.get("file_type", "pdf"),
        **{k: v for k, v in resume_dict.items() if k not in ("filename", "file_path", "file_size_bytes", "file_type")},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Notification CRUD Operations (Account-Isolated)
# ═══════════════════════════════════════════════════════════════════════════════

class NotificationRepository:
    """Repository for in-app user notifications with strict user-level isolation."""

    @staticmethod
    def get_for_user(db: Session, user_id: int, limit: int = 50) -> List[Notification]:
        """Get all notifications belonging strictly to the user, ordered by creation date."""
        return (
            db.query(Notification)
            .filter(Notification.user_id == user_id)
            .order_by(desc(Notification.created_at))
            .limit(limit)
            .all()
        )

    @staticmethod
    def count_unread(db: Session, user_id: int) -> int:
        """Count unread notifications for a user."""
        return (
            db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.is_read == False)
            .count()
        )

    @staticmethod
    def get_by_identifier(db: Session, identifier: str | int, user_id: int) -> Optional[Notification]:
        """Get a single notification by id or uuid ensuring user ownership."""
        query = db.query(Notification).filter(Notification.user_id == user_id)
        if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.isdigit()):
            query = query.filter(Notification.id == int(identifier))
        else:
            query = query.filter(Notification.uuid == identifier)
        return query.first()

    @staticmethod
    def create(
        db: Session,
        user_id: int,
        title: str,
        message: str,
        type: str = "system",
        action_href: Optional[str] = None,
        is_read: bool = False,
    ) -> Notification:
        """Create a new notification for a specific user."""
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            action_href=action_href,
            is_read=is_read,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        return notif

    @staticmethod
    def mark_as_read(db: Session, identifier: str | int, user_id: int) -> Optional[Notification]:
        """Mark a single notification as read, enforcing user isolation."""
        notif = NotificationRepository.get_by_identifier(db, identifier, user_id)
        if notif:
            setattr(notif, "is_read", True)
            db.commit()
            db.refresh(notif)
        return notif

    @staticmethod
    def mark_all_as_read(db: Session, user_id: int) -> int:
        """Mark all unread notifications for a user as read."""
        count = (
            db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.is_read == False)
            .update({"is_read": True}, synchronize_session="fetch")
        )
        db.commit()
        return count

    @staticmethod
    def clear_all(db: Session, user_id: int) -> int:
        """Delete all notifications for a user."""
        count = (
            db.query(Notification)
            .filter(Notification.user_id == user_id)
            .delete(synchronize_session="fetch")
        )
        db.commit()
        return count

    @staticmethod
    def delete_by_identifier(db: Session, identifier: str | int, user_id: int) -> bool:
        """Delete a single notification by id/uuid strictly within user scope."""
        notif = NotificationRepository.get_by_identifier(db, identifier, user_id)
        if notif:
            db.delete(notif)
            db.commit()
            return True
        return False

    @staticmethod
    def seed_initial_if_empty(db: Session, user_id: int) -> List[Notification]:
        """Seed default starter notifications if the user currently has none."""
        existing_count = db.query(Notification).filter(Notification.user_id == user_id).count()
        if existing_count > 0:
            return []

        defaults = [
            {
                "title": "New Verified Job Match",
                "message": "A new Full Stack Engineer position matching your skillset was published.",
                "type": "job",
                "action_href": "/candidate/jobs",
                "is_read": False,
            },
            {
                "title": "Candidate Profile Verified",
                "message": "Your profile details and credentials are live on the candidate portal.",
                "type": "system",
                "action_href": "/dashboard/profile",
                "is_read": False,
            },
            {
                "title": "Application Tracked",
                "message": "Your candidate profile and documents were updated in the tracking database.",
                "type": "application",
                "action_href": "/dashboard/applications",
                "is_read": False,
            },
            {
                "title": "AI Job Agent Ready",
                "message": "Candidate search agent is ready to automate verified job submissions.",
                "type": "system",
                "action_href": "/dashboard/automation",
                "is_read": True,
            },
        ]
        created = []
        for item in defaults:
            notif = Notification(
                user_id=user_id,
                title=item["title"],
                message=item["message"],
                type=item["type"],
                action_href=item["action_href"],
                is_read=item["is_read"],
            )
            db.add(notif)
            created.append(notif)
        db.commit()
        for n in created:
            db.refresh(n)
        return created
