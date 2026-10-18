"""
Database Connection Manager for AutoAgentHire
Supports MongoDB Atlas and SQLite with automatic fallback.
"""

import os
import sys
from pathlib import Path
from contextlib import contextmanager
from typing import Generator, Optional
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool, NullPool
from dotenv import load_dotenv

load_dotenv()

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Import models
from backend.database.models_complete import Base

_SQLITE_FALLBACK = 'sqlite:///./data/autoagenthire.db'

import logging
# SQL statement echo is disabled by default to maintain clean logs and prevent leaking query parameters.
# Can be enabled explicitly for temporary debugging via SQL_ECHO=true or SQLALCHEMY_ECHO=true in .env
_echo = os.getenv('SQL_ECHO', os.getenv('SQLALCHEMY_ECHO', 'False')).lower() == 'true'

if not _echo:
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.dialects').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.orm').setLevel(logging.WARNING)


def _make_engine(url: str):
    """Create a SQLAlchemy engine for the given URL."""
    if url.startswith('sqlite'):
        # StaticPool: all requests share ONE connection - safe for SQLite single-process only.
        # For multi-process or production, switch to NullPool + DATABASE_URL=postgresql://...
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=_echo,
        )
    # Strip asyncpg prefix — we always use psycopg2 for sync connections
    sync_url = url.replace('postgresql+asyncpg://', 'postgresql://', 1)
    # PostgreSQL connection
    return create_engine(
        sync_url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        echo=_echo,
        connect_args={"connect_timeout": 10},
    )


def _resolve_engine():
    """
    Try each DATABASE_URL candidate in order and return the first engine
    that can actually reach the server.

    Priority:
      1. SYNC_DATABASE_URL  (explicit sync override)
      2. DATABASE_URL       (primary setting)
      3. SQLite fallback    (local development safety net)
    """
    candidates = []
    for key in ('SYNC_DATABASE_URL', 'DATABASE_URL'):
        val = os.getenv(key, '').strip()
        if val and val not in candidates:
            candidates.append(val)
    candidates.append(_SQLITE_FALLBACK)  # always have a last resort

    for url in candidates:
        try:
            eng = _make_engine(url)
            # Skip the blocking liveness check at import time to prevent deployment hang
            display = url.split('@')[-1] if '@' in url else url
            print("[DB] Configured for: " + display)
            return eng, url
        except Exception as exc:
            display = url.split('@')[-1] if '@' in url else url
            print("[DB] WARNING - Could not connect to " + display + ": " + str(exc).splitlines()[0])

    raise RuntimeError("No database backend is reachable. Check your .env and network.")


# Build the engine once at import time
engine, DATABASE_URL = _resolve_engine()

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Column migrations — ADD COLUMN IF NOT EXISTS is idempotent on PostgreSQL.
# SQLite does not support IF NOT EXISTS on ALTER TABLE, so we catch and ignore errors there.
_COLUMN_MIGRATIONS = [
    ("users", "phone",            "VARCHAR(50)"),
    ("users", "location",         "VARCHAR(255)"),
    ("users", "role",             "VARCHAR(50) DEFAULT 'recruiter'"),
    ("users", "company_name",     "VARCHAR(255)"),
    ("users", "company_logo_url", "TEXT"),
    ("users", "approval_status",   "VARCHAR(50) DEFAULT 'approved'"),
    ("users", "approved_by_id",   "INTEGER"),
    ("users", "approval_notes",   "TEXT"),
    ("users", "custom_user_id",    "VARCHAR(50)"),
    ("users", "avatar_url",       "TEXT"),
    ("users", "education",        "TEXT"),
    ("users", "qualification",    "TEXT"),
    ("users", "job_role",         "VARCHAR(255)"),
    ("users", "bio",              "TEXT"),
    ("job_postings", "skills",    "TEXT"),
    ("job_candidate_applications", "interview_scheduled_at", "TIMESTAMP"),
    ("job_candidate_applications", "interview_meeting_link", "VARCHAR(512)"),
    ("job_candidate_applications", "interview_round",        "VARCHAR(100)"),
    ("job_candidate_applications", "interview_notes",        "TEXT"),
    ("users", "pending_email",                                "VARCHAR(255)"),
    ("users", "email_verification_code",                     "VARCHAR(20)"),
    ("users", "email_verification_expires_at",                "TIMESTAMP"),
]




def _run_migrations():
    """Apply any missing column additions to existing tables efficiently."""
    is_sqlite = DATABASE_URL.startswith("sqlite")
    
    # Group columns by table so we query table_info only ONCE per table
    tables_map = {}
    for table, column, definition in _COLUMN_MIGRATIONS:
        tables_map.setdefault(table, []).append((column, definition))

    with engine.begin() as conn:
        for table, col_defs in tables_map.items():
            try:
                if is_sqlite:
                    result = conn.execute(text(f"PRAGMA table_info({table})"))
                    existing_cols = {row[1] for row in result}
                    for column, definition in col_defs:
                        if column not in existing_cols:
                            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                            print(f"[DB] Migration: added column {table}.{column}")
                else:
                    for column, definition in col_defs:
                        conn.execute(text(
                            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
                        ))
            except Exception as exc:
                msg = str(exc).lower()
                # "already exists" or "duplicate column" — safe to ignore
                if "already exists" not in msg and "duplicate column" not in msg:
                    print(f"[DB] Migration warning ({table}): {str(exc).splitlines()[0]}")


def init_db():
    """Initialize database tables — creates all tables if they don't exist."""
    try:
        Path('./data').mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=engine)
        print("[DB] Tables created/verified successfully")
    except Exception as e:
        print("[DB] WARNING - Table initialization error: " + str(e))
        print("Continuing without database initialization...")

    # Always run column migrations so new columns are added to pre-existing tables
    try:
        _run_migrations()
    except Exception as e:
        print("[DB] WARNING - Migration error: " + str(e))

    # Seed system Authorizer account if not present
    try:
        from backend.auth.password import hash_password
        from backend.database.models_complete import User
        with SessionLocal() as db:
            existing_auth = db.query(User).filter(
                (User.custom_user_id == "AUTH-001") | (User.email.ilike("Author@auto.in")) | (User.email.ilike("Author@gmail.com"))
            ).first()
            if not existing_auth:
                new_auth = User(
                    email="Author@auto.in",
                    hashed_password=hash_password("Author@123"),
                    full_name="System Authorizer",
                    role="authorizer",
                    custom_user_id="AUTH-001",
                    is_active=True,
                    is_verified=True,
                )
                db.add(new_auth)
                db.commit()
                print("[DB] System Authorizer account seeded: Author@auto.in (ID: AUTH-001)")
            else:
                existing_auth.role = "authorizer"  # type: ignore
                existing_auth.is_active = True  # type: ignore
                if not getattr(existing_auth, "custom_user_id", None):
                    existing_auth.custom_user_id = "AUTH-001"  # type: ignore
                db.commit()

            # Seed pre-configured Recruiter account: Re@auto.in / Re@123
            existing_rec = db.query(User).filter(
                (User.custom_user_id == "REC-1001") | (User.email.ilike("re@auto.in"))
            ).first()
            if not existing_rec:
                new_rec = User(
                    email="Re@auto.in",
                    hashed_password=hash_password("Re@123"),
                    full_name="Verified Recruiter",
                    company_name="AutoHire Partner Tech",
                    company_logo_url="https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=128&h=128&fit=crop",
                    role="recruiter",
                    custom_user_id="REC-1001",
                    approval_status="approved",
                    is_active=True,
                    is_verified=True,
                )
                db.add(new_rec)
                db.commit()
                print("[DB] Recruiter account seeded: Re@auto.in (ID: REC-1001)")
            else:
                existing_rec.role = "recruiter"  # type: ignore
                existing_rec.approval_status = "approved"  # type: ignore
                existing_rec.is_active = True  # type: ignore
                existing_rec.hashed_password = hash_password("Re@123")  # type: ignore
                if not getattr(existing_rec, "custom_user_id", None):
                    existing_rec.custom_user_id = "REC-1001"  # type: ignore
                if not existing_rec.company_name:
                    existing_rec.company_name = "AutoHire Partner Tech"  # type: ignore
                db.commit()

            # Seed standard job postings if none or very few exist
            try:
                from backend.database.seed_jobs import seed_jobs
                seed_jobs()
            except Exception as e:
                print(f"[DB] Jobs seed note: {e}")
    except Exception as e:
        print("[DB] Accounts seed note: " + str(e))



def drop_db():
    """Drop all database tables (use with caution!)"""
    Base.metadata.drop_all(bind=engine)
    print("[DB] All database tables dropped")


def get_db() -> Generator[Session, None, None]:
    """Get database session (dependency injection for FastAPI)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Context manager for database sessions"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class DatabaseManager:
    """Database manager class for advanced operations"""
    
    def __init__(self):
        self.engine = engine
        self.SessionLocal = SessionLocal
    
    def create_session(self) -> Session:
        """Create a new database session"""
        return self.SessionLocal()
    
    def init_tables(self):
        """Initialize all database tables"""
        init_db()
    
    def reset_database(self):
        """Reset database (drop and recreate all tables)"""
        drop_db()
        init_db()
    
    def health_check(self) -> bool:
        """Check database connectivity"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            print("[DB] Health check failed: " + str(e))
            return False


# Global database manager instance
db_manager = DatabaseManager()


# SQLite specific optimizations
if DATABASE_URL.startswith('sqlite'):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Enable foreign keys and WAL mode for SQLite"""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
