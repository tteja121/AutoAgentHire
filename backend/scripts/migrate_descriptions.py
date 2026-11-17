import sqlite3
import html
from pathlib import Path

def run_migration():
    db_path = Path("data/autoagenthire.db")
    if not db_path.exists():
        print("Database not found")
        return

    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()

    # 1. Unescape imported_job_listings
    c.execute("SELECT id, description FROM imported_job_listings WHERE description LIKE '%&lt;%' OR description LIKE '%&amp;%'")
    rows = c.fetchall()
    print(f"Found {len(rows)} descriptions to unescape in imported_job_listings")
    for r_id, r_desc in rows:
        if r_desc:
            clean = html.unescape(r_desc)
            c.execute("UPDATE imported_job_listings SET description = ? WHERE id = ?", (clean, r_id))

    # 2. Check job_postings
    try:
        c.execute("SELECT id, description FROM job_postings WHERE description LIKE '%&lt;%' OR description LIKE '%&amp;%'")
        jp_rows = c.fetchall()
        for r_id, r_desc in jp_rows:
            if r_desc:
                clean = html.unescape(r_desc)
                c.execute("UPDATE job_postings SET description = ? WHERE id = ?", (clean, r_id))
    except Exception as e:
        pass

    conn.commit()
    conn.close()
    print("Migration completed successfully")

if __name__ == "__main__":
    run_migration()

