"""
AutoAgentHire — Root Application Entry Point
Supports root execution contexts (Render, Fly.io, Railway, Docker, Local CLI).
Exposes ASGI application `app` imported from `backend.main`.
"""
import os
import sys
from pathlib import Path

# Ensure repo root and backend directory are always on sys.path
_repo_root = Path(__file__).resolve().parent
_backend_dir = _repo_root / "backend"

if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Expose app for ASGI servers: uvicorn main:app / gunicorn main:app
from backend.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", os.environ.get("API_PORT", 8000)))
    host = os.environ.get("API_HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
