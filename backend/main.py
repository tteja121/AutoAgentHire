"""
Main FastAPI application entry point.
Initializes the application, middleware, and routes.
"""
import sys
import asyncio
from pathlib import Path

# Windows-specific: Fix UTF-8 encoding for stdout/stderr so emoji print() calls
# in imported modules do not raise UnicodeEncodeError (cp1252 default on Windows).
# This MUST run before any module that prints emoji characters is imported.
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Windows-specific: ProactorEventLoop has been the default since Python 3.8.
# set_event_loop_policy is deprecated starting in Python 3.14 (and removed in 3.16).
if sys.platform == 'win32' and sys.version_info < (3, 8):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Ensure repo root AND backend dir are on sys.path for all run contexts.
repo_root = Path(__file__).resolve().parents[1]
backend_dir = Path(__file__).resolve().parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from typing import Optional, Dict, Any
from fastapi import FastAPI, Request, Depends
from sqlalchemy.orm import Session
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import uvicorn

# Use relative imports for script compatibility
from config import settings
from backend.routes.api_routes import router as api_router
from backend.routes.linkedin_jobs_routes import router as linkedin_jobs_router
from backend.routes.ats_routes import router as ats_router
from backend.routes.cover_letter_routes import router as cover_letter_router
from backend.api.autoagenthire import router as autoagenthire_router
from backend.routes.auth_routes import router as auth_router
from backend.routes.recruiter_routes import router as recruiter_router
from backend.routes.mongo_routes import router as mongo_router
from backend.database.mongo import mongo_manager
from backend.database.connection import init_db, get_db

# Heavy agent/ML routes — imported lazily so a missing dep doesn't break startup
agent_router = None
v2_router = None
try:
    from backend.routes.agent_routes import router as agent_router
except Exception as _e:
    print(f"[WARN] agent_routes not loaded: {_e}")

try:
    from backend.routes.v2_routes import router as v2_router
except Exception as _e:
    print(f"[WARN] v2_routes not loaded: {_e}")

# Setup logger
# logger = setup_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    print(f"🚀 Starting {settings.APP_NAME}...")
    print(f"📝 Environment: {settings.APP_ENV}")
    print(f"🔧 Debug mode: {settings.DEBUG}")
    
    # Initialize database without blocking service startup indefinitely.
    # Render needs the process to bind quickly; DB issues should not prevent boot.
    try:
        await asyncio.wait_for(asyncio.to_thread(init_db), timeout=25)
        print("✓ Database initialized")
    except asyncio.TimeoutError:
        print("[WARN] Database initialization timed out; continuing startup")
    except Exception as e:
        print(f"[WARN] Database initialization failed; continuing startup: {e}")

    # Initialize MongoDB Atlas connection (optional document store)
    try:
        mongo_ok = await asyncio.wait_for(asyncio.to_thread(mongo_manager.connect), timeout=10.0)
        if mongo_ok:
            print("✓ MongoDB Atlas connected successfully")
        else:
            print("ℹ Operating on primary SQLite database (MongoDB Atlas optional mirror offline)")
    except asyncio.TimeoutError:
        print("ℹ MongoDB Atlas connection timed out; operating on primary SQLite database")
    except Exception as e:
        print(f"ℹ MongoDB Atlas note: {e}")
    
    # TODO: Initialize vector store
    # TODO: Start background scheduler
    
    yield
    
    # Shutdown
    print("🛑 Shutting down...")
    # TODO: Close database connections
    # TODO: Clean up resources


# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="Autonomous AI agent system for job discovery and applications",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    debug=settings.DEBUG,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a frontend-friendly error payload for 422 validation errors."""
    errors = []
    for e in exc.errors():
        loc = e.get("loc", [])
        field = ".".join(str(p) for p in loc if p not in ("body", "query", "path")) or ".".join(str(p) for p in loc)
        msg = e.get("msg", "Invalid request")
        errors.append(f"{field}: {msg}" if field else msg)

    # Make detail JSON-serializable (pydantic may include bytes in 'input')
    def _make_serializable(obj):
        if isinstance(obj, bytes):
            return obj.decode("utf-8", errors="replace")
        if isinstance(obj, dict):
            return {k: _make_serializable(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_make_serializable(i) for i in obj]
        return obj

    return JSONResponse(
        status_code=422,
        content={
            "message": "Request validation failed",
            "errors": errors,
            "detail": _make_serializable(exc.errors()),
        },
    )

# CORS Middleware: allow localhost regex only during development
_is_development = getattr(settings, "APP_ENV", "development").lower() == "development" or getattr(settings, "DEBUG", False)
cors_origins = settings.cors_origins_list if hasattr(settings, 'cors_origins_list') else [o.strip() for o in str(settings.CORS_ORIGINS).split(',') if o.strip()]

cors_params = {
    "allow_origins": cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "allow_origin_regex": r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$",
}

app.add_middleware(
    CORSMiddleware,
    **cors_params,
)

# Gzip Middleware for response compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include routers
app.include_router(auth_router)
app.include_router(recruiter_router, prefix="/api")
app.include_router(api_router)
app.include_router(linkedin_jobs_router)
if agent_router is not None:
    app.include_router(agent_router)
app.include_router(ats_router)
app.include_router(cover_letter_router)
app.include_router(autoagenthire_router)
app.include_router(mongo_router)
if v2_router is not None:
    app.include_router(v2_router)  # V2 API for frontend

# Legacy backward-compatibility endpoint for resume URLs pointing to /uploads/resumes/...
from backend.routes.recruiter_routes import serve_file

@app.get("/uploads/resumes/{filename:path}")
def legacy_uploads_resumes_handler(
    filename: str,
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Backward-compatibility route for legacy /uploads/resumes/... URLs.
    Transparently delegates to serve_file with prefix matching and token authentication.
    """
    auth_header = request.headers.get("Authorization")
    if not token and auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    return serve_file(filename=filename, token=token, auth_header_user=None, db=db)

# Mount static files directory for uploaded resumes and documents
from fastapi.staticfiles import StaticFiles
import os as _os
uploads_path = _os.path.join(_os.getcwd(), "uploads")
_os.makedirs(uploads_path, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")


# Health check endpoint
@app.get("/")
async def root():
    """Root endpoint - health check."""
    return {
        "name": settings.APP_NAME,
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.APP_ENV,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    mongo_status = await asyncio.to_thread(mongo_manager.ping)
    return {
        "status": "healthy",
        "database": "connected",
        "mongodb": mongo_status.get("status", "disconnected"),
        "mongodb_database": mongo_status.get("database"),
        "mongodb_latency_ms": mongo_status.get("latency_ms"),
        "mongodb_collections": len(mongo_status.get("collections", [])),
        "vector_db": "connected",
    }


"""NOTE: API endpoints are defined in routers under `backend/routes/`.

Historically this file also defined `/api/run-agent` and `/api/agent/status` directly.
Those duplicates caused contract confusion (JSON vs multipart) and route precedence
issues. The canonical endpoints live in `backend.routes.api_routes` (mounted above)
and in `backend.api.autoagenthire` via `register_autoagenthire_routes(app)`.
"""

# TODO: Include routers
# app.include_router(routes.jobs_router, prefix="/jobs", tags=["Jobs"])
# app.include_router(routes.applications_router, prefix="/applications", tags=["Applications"])
# app.include_router(routes.user_router, prefix="/users", tags=["Users"])


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_RELOAD,
        reload_dirs=["backend"] if settings.API_RELOAD else None,
        reload_excludes=[
            "*.db*",
            "data/*",
            "uploads/*",
            "frontend/*",
            "*.log",
            "*.tmp",
            "**/.pytest_cache/**",
            "**/__pycache__/**",
        ] if settings.API_RELOAD else None,
        log_level=settings.LOG_LEVEL.lower(),
    )
