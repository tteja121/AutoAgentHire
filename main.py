"""
AutoAgentHire — Root Application Entry Point
Supports root execution contexts (Render, Fly.io, Railway, Docker, Local CLI).
Exposes ASGI application `app` imported from `backend.main`.
"""
import os
import sys
from pathlib import Path

# Enable UTF-8 encoding on Windows to prevent UnicodeEncodeError on console output
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure repo root and backend directory are always on sys.path
_repo_root = Path(__file__).resolve().parent
_backend_dir = _repo_root / "backend"

if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Python Version Sanity Check
if sys.version_info >= (3, 14):
    print(
        f"[AutoAgentHire WARN] Running on Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}. "
        "Python 3.14+ is an experimental pre-release. Python 3.12 is strongly recommended.\n"
        "To run reliably in the verified Python 3.12 environment, use: .\\start_autoagenthire.ps1"
    )

# Pre-flight check for mandatory email validation runtime
try:
    import email_validator  # noqa: F401
except ImportError:
    print(
        "\n" + "=" * 76 + "\n"
        " [AutoAgentHire FATAL] Missing mandatory dependency: 'email-validator'\n"
        " This error occurs when running outside the project's virtual environment.\n"
        "\n"
        " Recommended fix:\n"
        "   1. Launch with the automated startup script:\n"
        "      .\\start_autoagenthire.ps1\n"
        "\n"
        "   2. Or activate the project virtual environment before starting Uvicorn:\n"
        "      .\\.venv\\Scripts\\Activate.ps1\n"
        "      python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000\n"
        "\n"
        "   3. Or install dependencies into this environment:\n"
        "      pip install -r requirements.txt\n"
        + "=" * 76 + "\n"
    )
    raise SystemExit(1)

# Expose app for ASGI servers: uvicorn main:app / gunicorn main:app
from backend.main import app as _raw_app


class AsgiWsgiHybridApp:
    """
    Universal ASGI/WSGI hybrid application wrapper.
    - When invoked by ASGI servers (Uvicorn, Hypercorn, Gunicorn UvicornWorker):
      Calls (scope, receive, send) as an ASGI coroutine.
    - When invoked by default synchronous WSGI servers (Gunicorn SyncWorker):
      Transparently bridges (environ, start_response) using a2wsgi.WSGIMiddleware
      or a safe built-in health-check/diagnostic response, preventing the fatal:
      'TypeError: FastAPI.__call__() missing 1 required positional argument: send'.
    """
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app
        self._wsgi_app = None

    def _get_wsgi_app(self):
        if self._wsgi_app is None:
            try:
                from a2wsgi import WSGIMiddleware
                self._wsgi_app = WSGIMiddleware(self.asgi_app)
            except Exception:
                pass
        return self._wsgi_app

    def __call__(self, *args, **kwargs):
        # WSGI protocol passes exactly 2 positional arguments: (environ, start_response)
        if len(args) == 2 and callable(args[1]):
            wsgi = self._get_wsgi_app()
            if wsgi is not None:
                return wsgi(*args, **kwargs)
            environ, start_response = args
            path = environ.get("PATH_INFO", "")
            if path in ("/", "/health"):
                status = "200 OK"
                body = b'{"status":"healthy","server":"asgi-wsgi-bridge","note":"Running FastAPI on WSGI worker"}'
            else:
                status = "200 OK"
                body = (
                    b'{"detail":"AutoAgentHire FastAPI is an ASGI application. '
                    b'For best performance and full WebSocket/streaming support, '
                    b'set Render Start Command to: uvicorn main:app --host 0.0.0.0 --port $PORT"}'
                )
            start_response(status, [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(body))),
            ])
            return [body]

        # Standard ASGI3: (scope, receive, send)
        return self.asgi_app(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.asgi_app, name)


app = AsgiWsgiHybridApp(_raw_app)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", os.environ.get("API_PORT", 8000)))
    host = os.environ.get("API_HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
