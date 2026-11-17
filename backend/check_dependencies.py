#!/usr/bin/env python3
"""
AutoAgentHire — Dependency & Environment Health Check
=====================================================
Performs a comprehensive audit of:
  1. Python version compatibility (Target: Python 3.11 / 3.12, >= 3.10, < 3.14).
  2. Active Python executable and virtual environment isolation.
  3. Mandatory third-party packages required for application startup.
  4. Pydantic v2 `EmailStr` and `email-validator` runtime functionality.
  5. FastAPI framework and Uvicorn ASGI server imports.
  6. SQLAlchemy ORM and SQLite data directory availability.
  7. Optional integrations (Qdrant, SentenceTransformers, S3/Boto3, Cloud LLMs).

Usage:
  python backend/check_dependencies.py
  python backend/check_dependencies.py --quiet
"""

import sys
import os
from pathlib import Path
from typing import List, Tuple

# Ensure repository root is on sys.path
_repo_root = Path(__file__).resolve().parent.parent
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

# Enable UTF-8 on Windows terminals for clean symbol display
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

QUIET_MODE = "--quiet" in sys.argv or "-q" in sys.argv

# Formatting helpers
def _fmt(status: str, name: str, detail: str = "") -> str:
    badge = f"[{status}]"
    if status == "PASS":
        color_badge = f"\033[92m{badge}\033[0m"
    elif status == "FAIL":
        color_badge = f"\033[91m{badge}\033[0m"
    elif status == "WARN":
        color_badge = f"\033[93m{badge}\033[0m"
    elif status == "OPTIONAL":
        color_badge = f"\033[96m{badge}\033[0m"
    else:
        color_badge = badge
    
    # Strip ANSI if terminal does not support it
    if not sys.stdout.isatty() and sys.platform == "win32":
        color_badge = badge
        
    res = f"{color_badge:<18} {name}"
    if detail:
        res += f" ({detail})"
    return res


def check_python_environment() -> Tuple[bool, List[str]]:
    messages = []
    has_failure = False

    # 1. Version check
    v = sys.version_info
    v_str = f"{v.major}.{v.minor}.{v.micro}"
    if v.major == 3 and v.minor in (11, 12):
        messages.append(_fmt("PASS", "Python Version", f"{v_str} — Fully Compatible"))
    elif v.major == 3 and v.minor == 10:
        messages.append(_fmt("WARN", "Python Version", f"{v_str} — Compatible (Python 3.12 recommended)"))
    elif v.major == 3 and v.minor >= 14:
        messages.append(_fmt("FAIL", "Python Version", f"{v_str} — Python 3.14+ is an experimental pre-release lacking binary wheels for dependencies. Please use Python 3.12."))
        has_failure = True
    elif v.major == 3 and v.minor == 13:
        messages.append(_fmt("WARN", "Python Version", f"{v_str} — Python 3.13 may have partial C-extension incompatibilities. Python 3.12 is strongly recommended."))
    else:
        messages.append(_fmt("FAIL", "Python Version", f"{v_str} — Unsupported. Requires Python 3.11 or 3.12."))
        has_failure = True

    # 2. Virtual environment check
    is_venv = (sys.prefix != getattr(sys, "base_prefix", sys.prefix)) or bool(os.environ.get("VIRTUAL_ENV"))
    if is_venv:
        messages.append(_fmt("PASS", "Virtual Environment", f"Active ({sys.prefix})"))
    else:
        messages.append(_fmt("WARN", "Virtual Environment", f"Global interpreter detected: {sys.executable}. Running inside a virtual environment (.venv) is strongly recommended."))

    return not has_failure, messages


def check_mandatory_dependencies() -> Tuple[bool, List[str]]:
    messages = []
    has_failure = False

    # (display_name, import_module, pypi_package_name)
    mandatory_pkgs = [
        ("FastAPI", "fastapi", "fastapi==0.115.0"),
        ("Uvicorn ASGI Server", "uvicorn", "uvicorn[standard]==0.32.0"),
        ("Pydantic v2 Core", "pydantic", "pydantic==2.9.2"),
        ("Pydantic Settings", "pydantic_settings", "pydantic-settings==2.6.1"),
        ("Email Validator", "email_validator", "email-validator>=2.1.0"),
        ("SQLAlchemy ORM", "sqlalchemy", "sqlalchemy==2.0.36"),
        ("Python Multipart", "multipart", "python-multipart==0.0.9"),
        ("Python JOSE (JWT)", "jose", "python-jose[cryptography]==3.3.0"),
        ("Passlib (Hashing)", "passlib", "passlib[bcrypt]==1.7.4"),
        ("Bcrypt", "bcrypt", "bcrypt==4.0.1"),
        ("Google Auth", "google.auth", "google-auth==2.29.0"),
        ("Requests (HTTP)", "requests", "requests==2.32.3"),
        ("HTTPX Client", "httpx", "httpx==0.28.1"),
        ("Aiohttp Client", "aiohttp", "aiohttp==3.11.11"),
        ("PyMongo", "pymongo", "pymongo>=4.0.0"),
        ("DNSPython", "dns", "dnspython>=2.0.0"),
        ("Python Dotenv", "dotenv", "python-dotenv==1.0.1"),
        ("LangGraph / Core", "langgraph", "langgraph==0.2.59"),
        ("PyPDF Document Parser", "pypdf", "pypdf==5.1.0"),
        ("PDFMiner Document Parser", "pdfminer", "pdfminer.six>=20231228"),
        ("Python Docx", "docx", "python-docx==1.1.2"),
        ("BeautifulSoup4", "bs4", "beautifulsoup4==4.12.3"),
        ("LXML Parser", "lxml", "lxml==5.3.0"),
        ("Loguru Logging", "loguru", "loguru==0.7.2"),
    ]

    for name, module_name, install_spec in mandatory_pkgs:
        try:
            mod = __import__(module_name)
            ver = getattr(mod, "__version__", "installed")
            messages.append(_fmt("PASS", name, f"v{ver}"))
        except ImportError as exc:
            messages.append(_fmt("FAIL", name, f"Missing! Run: pip install '{install_spec}'"))
            has_failure = True
        except Exception as exc:
            messages.append(_fmt("FAIL", name, f"Error importing: {exc}"))
            has_failure = True

    return not has_failure, messages


def check_email_validation_runtime() -> Tuple[bool, List[str]]:
    messages = []
    try:
        import email_validator
        ev_version = getattr(email_validator, "__version__", "unknown")
        
        # Test full Pydantic v2 EmailStr integration
        from pydantic import BaseModel, EmailStr, ValidationError

        class ProbeModel(BaseModel):
            email: EmailStr

        # Valid test
        valid_obj = ProbeModel(email="support@autoagenthire.com")
        if valid_obj.email != "support@autoagenthire.com":
            raise ValueError("EmailStr failed normalization")

        # Invalid test (must reject)
        rejected = False
        try:
            ProbeModel(email="invalid-not-an-email")
        except ValidationError:
            rejected = True

        if not rejected:
            raise ValueError("EmailStr failed to reject malformed email address")

        messages.append(_fmt("PASS", "Pydantic EmailStr Runtime", f"email-validator v{ev_version} functional"))
        return True, messages
    except ImportError as e:
        messages.append(_fmt("FAIL", "Pydantic EmailStr Runtime", f"email-validator missing: {e}. Run: pip install 'pydantic[email]'"))
        return False, messages
    except Exception as e:
        messages.append(_fmt("FAIL", "Pydantic EmailStr Runtime", f"Validation probe failed: {e}"))
        return False, messages


def check_database_readiness() -> Tuple[bool, List[str]]:
    messages = []
    has_failure = False

    # Check data directory
    data_dir = Path("data")
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        db_file = data_dir / "autoagenthire.db"
        exists = db_file.exists()
        size_kb = (db_file.stat().st_size / 1024) if exists else 0
        status_detail = f"Database present ({size_kb:.1f} KB)" if exists else "Database will be initialized on boot"
        messages.append(_fmt("PASS", "SQLite Data Directory", f"./data/autoagenthire.db — {status_detail}"))
    except Exception as exc:
        messages.append(_fmt("FAIL", "SQLite Data Directory", f"Cannot access/create ./data: {exc}"))
        has_failure = True

    # Test SQLAlchemy engine creation
    try:
        from backend.database.connection import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        messages.append(_fmt("PASS", "SQLAlchemy SQLite Connection", "Local connection verified"))
    except Exception as exc:
        messages.append(_fmt("FAIL", "SQLAlchemy SQLite Connection", f"Connection test failed: {exc}"))
        has_failure = True

    return not has_failure, messages


def check_optional_integrations() -> Tuple[bool, List[str]]:
    messages = []

    # 1. Qdrant
    try:
        import qdrant_client
        import importlib.metadata
        try:
            q_ver = importlib.metadata.version("qdrant-client")
        except Exception:
            q_ver = getattr(qdrant_client, "__version__", "ready")
        q_url = os.getenv("QDRANT_URL")
        if q_url:
            messages.append(_fmt("OPTIONAL", "Qdrant Vector Store", f"Library v{q_ver} installed, URL configured"))
        else:
            messages.append(_fmt("OPTIONAL", "Qdrant Vector Store", f"Library v{q_ver} installed (Cloud URL not set; gracefully disabled)"))
    except ImportError:
        messages.append(_fmt("OPTIONAL", "Qdrant Vector Store", "Not installed (Optional; graceful fallback enabled)"))

    # 2. Sentence Transformers
    try:
        import sentence_transformers
        messages.append(_fmt("OPTIONAL", "Sentence Transformers", f"Installed v{sentence_transformers.__version__}"))
    except ImportError:
        messages.append(_fmt("OPTIONAL", "Sentence Transformers", "Not installed (Optional local embeddings)"))

    # 3. AWS S3 / Boto3
    try:
        import boto3
        messages.append(_fmt("OPTIONAL", "AWS Boto3 (S3 Storage)", f"Installed v{boto3.__version__}"))
    except ImportError:
        messages.append(_fmt("OPTIONAL", "AWS Boto3 (S3 Storage)", "Not installed (Optional S3 document mirror)"))

    # 4. LLM Providers
    for provider, mod_name in [("OpenAI", "openai"), ("Groq", "groq"), ("Google Gemini", "google.generativeai")]:
        try:
            m = __import__(mod_name)
            messages.append(_fmt("OPTIONAL", f"LLM SDK: {provider}", f"Installed v{getattr(m, '__version__', 'ready')}"))
        except ImportError:
            messages.append(_fmt("OPTIONAL", f"LLM SDK: {provider}", "Not installed"))

    return True, messages


def main() -> int:
    if not QUIET_MODE:
        print("=" * 76)
        print(" AutoAgentHire — Environment & Dependency Diagnostics")
        print("=" * 76)

    overall_success = True
    sections = [
        ("1. Python Environment & Virtualenv", check_python_environment),
        ("2. Mandatory Web Framework & Core Dependencies", check_mandatory_dependencies),
        ("3. Pydantic Runtime & Email Validation", check_email_validation_runtime),
        ("4. Database & Storage Readiness", check_database_readiness),
        ("5. Optional External Integrations", check_optional_integrations),
    ]

    for title, check_fn in sections:
        success, lines = check_fn()
        if not success:
            overall_success = False
        if not QUIET_MODE:
            print(f"\n{title}")
            print("-" * 76)
            for l in lines:
                print(l)

    if not QUIET_MODE:
        print("\n" + "=" * 76)
        if overall_success:
            print(" \033[92mSUCCESS\033[0m: All mandatory dependencies and runtime environments are verified!")
            print(" Application is ready to start with: python -m uvicorn main:app --reload")
        else:
            print(" \033[91mFAILURE\033[0m: One or more mandatory dependencies or environment checks failed.")
            print(" To resolve missing packages into the project virtual environment, run:")
            print("   .\\.venv\\Scripts\\pip.exe install -r requirements.txt")
            print(" Or execute the automated launcher:")
            print("   .\\start_autoagenthire.ps1")
        print("=" * 76)

    return 0 if overall_success else 1


if __name__ == "__main__":
    sys.exit(main())
