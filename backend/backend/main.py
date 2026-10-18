"""
AutoAgentHire — Backend Main Alias Module
Directs `uvicorn backend.main:app` to the main FastAPI application.
"""
import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Expose app from parent main.py
import main as _parent_main

app = getattr(_parent_main, "app")
lifespan = getattr(_parent_main, "lifespan", None)
