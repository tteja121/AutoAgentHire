"""
Safe Database Migration for:
1. Feature 1: Email status & delivery diagnostics on candidate applications
2. Feature 2: Recruiter first_name, last_name, date_of_birth on users
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "autoagenthire.db")

def migrate():
    print(f"Connecting to database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    def add_col_if_missing(table, col_name, col_type):
        cursor.execute(f"PRAGMA table_info({table})")
        existing_cols = [r[1] for r in cursor.fetchall()]
        if col_name not in existing_cols:
            print(f"Adding column '{col_name}' ({col_type}) to table '{table}'...")
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
            conn.commit()
            print(f"[OK] Column '{col_name}' added successfully.")
        else:
            print(f"[EXISTS] Column '{col_name}' already exists in table '{table}'.")

    # Feature 1 columns in job_candidate_applications
    add_col_if_missing("job_candidate_applications", "email_status", "VARCHAR(50) DEFAULT 'Pending'")
    add_col_if_missing("job_candidate_applications", "email_message_id", "VARCHAR(255)")
    add_col_if_missing("job_candidate_applications", "email_sent_at", "TIMESTAMP")
    add_col_if_missing("job_candidate_applications", "email_error", "TEXT")
    add_col_if_missing("job_candidate_applications", "email_idempotency_key", "VARCHAR(100)")

    # Feature 2 columns in users
    add_col_if_missing("users", "first_name", "VARCHAR(100)")
    add_col_if_missing("users", "last_name", "VARCHAR(100)")
    add_col_if_missing("users", "date_of_birth", "VARCHAR(20)")

    # Resolve legacy duplicates before enforcing unique index
    cursor.execute("UPDATE users SET custom_user_id = 'AUTH-002' WHERE email = 'Author@gmail.com' AND custom_user_id = 'AUTH-001'")
    conn.commit()

    # Ensure unique index on users.custom_user_id
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_custom_user_id ON users(custom_user_id) WHERE custom_user_id IS NOT NULL")
    conn.commit()
    print("[OK] Unique index on users(custom_user_id) ensured.")

    # Ensure unique index on email_idempotency_key
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_job_app_email_idempotency ON job_candidate_applications(email_idempotency_key) WHERE email_idempotency_key IS NOT NULL")
    conn.commit()
    print("[OK] Unique index on job_candidate_applications(email_idempotency_key) ensured.")

    conn.close()
    print("[OK] All migrations successfully applied.")

if __name__ == "__main__":
    migrate()
