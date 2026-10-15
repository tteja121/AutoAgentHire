import sys
from pathlib import Path

# Add project root and backend dir to path
project_root = Path(__file__).resolve().parents[3]
backend_dir = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import inspect, text
from backend.database.connection import engine


def run_migration():
    """Drop linkedin_password_encrypted and linkedin_email if present."""
    with engine.begin() as conn:
        inspector = inspect(conn)
        columns = [c["name"] for c in inspector.get_columns("users")] if inspector.has_table("users") else []
        
        dialect_name = engine.dialect.name
        
        for col in ["linkedin_password_encrypted", "linkedin_email"]:
            if col in columns:
                print(f"Dropping column {col} from table users...")
                if dialect_name == "postgresql":
                    conn.execute(text(f"ALTER TABLE users DROP COLUMN IF EXISTS {col};"))
                else:
                    # SQLite 3.35.0+ supports DROP COLUMN
                    try:
                        conn.execute(text(f"ALTER TABLE users DROP COLUMN {col};"))
                    except Exception as e:
                        print(f"Could not drop column {col} via simple ALTER TABLE: {e}")
                print(f"Dropped column {col} successfully.")
            else:
                print(f"Column {col} does not exist in users table; nothing to drop.")


if __name__ == "__main__":
    run_migration()
