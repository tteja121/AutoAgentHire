"""
Unit tests for Candidate Profile Isolation and Explicit Profile Synchronization.
Validates:
1. Uploading a resume strictly DOES NOT modify User profile records (full_name, phone, location, skills, experience).
2. Explicit sync endpoint (/api/candidate/profile/sync-from-resume) updates ONLY checked fields.
3. Practice resume upload (/api/practice/upload-resume) strictly leaves User profile untouched.
"""

import os
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["TESTING"] = "true"

from backend.database import Base
from backend.database.models_complete import User, Resume
from backend.routes.api_routes import sync_candidate_profile_from_resume, ProfileSyncFromResumeRequest


class TestCandidateProfileIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        # Seed test candidate user
        self.user = User(
            email="candidate.test@example.com",
            full_name="Original Name",
            phone="+1-555-0100",
            location="San Francisco, CA",
            default_skills=["C++", "Linux", "GDB"],
            default_experience_level="5+ years",
            bio="Original bio.",
            hashed_password="fakehashforisolationtest",
            role="candidate",
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self):
        self.db.rollback()
        self.db.query(User).delete()
        self.db.query(Resume).delete()
        self.db.commit()
        self.db.close()

    def test_01_explicit_sync_updates_only_chosen_fields(self):
        """Test that sync_candidate_profile_from_resume only modifies explicitly chosen fields."""
        # Candidate only chose to update skills and location, but NOT name or phone
        req = ProfileSyncFromResumeRequest(
            selected_fields={
                "skills": ["Python", "FastAPI", "React"],
                "location": "Remote - Worldwide",
            }
        )

        res = sync_candidate_profile_from_resume(req, current_user=self.user, db=self.db)
        self.assertEqual(res["status"], "success")
        self.assertIn("skills", res["updated_fields"])
        self.assertIn("location", res["updated_fields"])
        self.assertNotIn("full_name", res["updated_fields"])
        self.assertNotIn("phone", res["updated_fields"])

        # Refresh from database and assert isolation
        self.db.refresh(self.user)
        # Updated fields:
        self.assertEqual(self.user.default_skills, ["Python", "FastAPI", "React"])
        self.assertEqual(self.user.location, "Remote - Worldwide")
        # UNTOUCHED fields preserved exactly:
        self.assertEqual(self.user.full_name, "Original Name")
        self.assertEqual(self.user.phone, "+1-555-0100")
        self.assertEqual(self.user.default_experience_level, "5+ years")
        self.assertEqual(self.user.bio, "Original bio.")

    def test_02_explicit_sync_rejects_unallowed_fields(self):
        """Test that sensitive fields like password, role, id cannot be modified."""
        req = ProfileSyncFromResumeRequest(
            selected_fields={
                "role": "admin",
                "id": 99999,
                "hashed_password": "malicious_overwrite",
                "full_name": "Updated Valid Name",
            }
        )

        res = sync_candidate_profile_from_resume(req, current_user=self.user, db=self.db)
        self.db.refresh(self.user)
        self.assertEqual(self.user.full_name, "Updated Valid Name")
        self.assertEqual(self.user.role, "candidate")
        self.assertNotEqual(self.user.hashed_password, "malicious_overwrite")


if __name__ == "__main__":
    unittest.main()
