"""
AutoAgentHire — Self-Aliasing Backend Package
Enables `import backend` and `from backend...` to work seamlessly when
the working directory or Render Root Directory is configured as `backend/`.
"""
import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent

# Ensure the backend directory is on sys.path
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Extend package search path so all sibling subpackages (routes, database, auth, api, etc.)
# are discovered as members of this 'backend' package
__path__ = [str(_backend_dir), str(Path(__file__).resolve().parent)]
