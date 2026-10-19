"""
Global pytest fixtures and test environment configuration.
Initializes test database schemas, directories, and seeds before any tests execute.
"""
import sys
from pathlib import Path

# Ensure repository root is on sys.path for test discovery
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest
from backend.database.connection import init_db


@pytest.fixture(scope="session", autouse=True)
def initialize_test_database():
    """Ensure database tables and system seeds are created for the test session."""
    init_db()

