"""
Global pytest fixtures and test environment configuration.
Initializes test database schemas, directories, and seeds before any tests execute.
"""
import pytest
from backend.database.connection import init_db


@pytest.fixture(scope="session", autouse=True)
def initialize_test_database():
    """Ensure database tables and system seeds are created for the test session."""
    init_db()
