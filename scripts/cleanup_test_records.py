import sqlite3
import re

db_path = 'data/autoagenthire.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT id, provider, title, company_name, job_posting_url FROM imported_job_listings")
all_rows = c.fetchall()

test_ids_to_remove = []
for row in all_rows:
    row_id, provider, title, company, url = row
    # Check if title matches "Test Website Job" or has random hex suffix or url has innovate.example
    is_test_website_job = bool(title and re.search(r"^Test Website Job\s+[0-9a-fA-F]+", title))
    is_fake_example_url = bool(url and ("innovate.example" in url or "example.com" in url))
    is_uuid_like_title = bool(title and re.match(r"^[0-9a-fA-F-]{8,}$", title))
    
    if is_test_website_job or is_fake_example_url or is_uuid_like_title:
        test_ids_to_remove.append(row_id)
        print(f"Removing test/corrupt record: ID {row_id} | Title: '{title}' | URL: {url}")

if test_ids_to_remove:
    c.executemany("DELETE FROM imported_job_listings WHERE id = ?", [(tid,) for tid in test_ids_to_remove])
    # Also clean up any user_saved_jobs referencing these deleted jobs
    c.executemany("DELETE FROM user_saved_jobs WHERE job_type = 'imported' AND job_id = ?", [(tid,) for tid in test_ids_to_remove])
    # Also clean up any candidate_job_matches referencing these
    c.executemany("DELETE FROM candidate_job_matches WHERE job_type = 'imported' AND job_id = ?", [(tid,) for tid in test_ids_to_remove])
    conn.commit()
    print(f"Successfully cleaned up {len(test_ids_to_remove)} test records from database.")
else:
    print("No test records found to clean.")

c.execute("SELECT COUNT(*) FROM imported_job_listings")
print(f"Total remaining verified jobs in imported_job_listings: {c.fetchone()[0]}")
conn.close()
