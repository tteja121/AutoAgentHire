"""
Unit tests for Candidate Custom Job Recommendations & Preferences.
Validates:
- Real-time job recommendations without requiring an uploaded resume.
- Fresher (0 years) vs experienced candidates.
- Remote and specific city location ranking (Hyderabad, Bengaluru, etc.).
- Input validation, skill deduplication, and canonicalization.
- Candidate customization preferences persistence in SQLite.
"""
import unittest
from backend.database.connection import SessionLocal
from backend.database.models_complete import User, ImportedJobListing
from backend.routes.candidate_recommendations_routes import (
    get_custom_job_recommendations,
    get_candidate_preferences,
    save_candidate_preferences,
    get_skill_suggestions,
    CandidatePreferencesPayload,
    _normalize_skill_list,
    _clean_experience_input,
)


class TestCandidateRecommendations(unittest.TestCase):

    def setUp(self):
        self.db = SessionLocal()
        # Find or create a test candidate user
        self.test_user = self.db.query(User).filter(User.role == "candidate").first()
        if not self.test_user:
            self.test_user = self.db.query(User).first()

    def tearDown(self):
        self.db.close()

    def test_normalize_skill_list(self):
        """Verify skills are canonicalized, trimmed, and deduplicated."""
        raw = ["python", "Python", "  REACT.JS ", "fastapi", "sql", "FastAPI"]
        normalized = _normalize_skill_list(raw)
        self.assertIn("Python", normalized)
        self.assertIn("React", normalized)
        self.assertIn("FastAPI", normalized)
        self.assertIn("SQL", normalized)
        # Deduplication check
        self.assertEqual(len(normalized), 4)

    def test_clean_experience_fresher_and_numeric(self):
        """Verify Fresher is recognized as 0.0 years and numerical values work."""
        years, level = _clean_experience_input(0, "fresher")
        self.assertEqual(years, 0.0)
        self.assertEqual(level, "fresher")

        years, level = _clean_experience_input("Fresher")
        self.assertEqual(years, 0.0)
        self.assertEqual(level, "fresher")

        years, level = _clean_experience_input(3.5, "experienced")
        self.assertEqual(years, 3.5)
        self.assertEqual(level, "experienced")

        # Negative protection
        years, level = _clean_experience_input(-5)
        self.assertEqual(years, 0.0)

    def test_get_skill_suggestions(self):
        """Verify skill suggestions returns common catalog."""
        res = get_skill_suggestions()
        self.assertIn("skills", res)
        self.assertTrue(len(res["skills"]) >= 10)
        self.assertIn("Python", res["skills"])

        # Filtered search
        res_filtered = get_skill_suggestions(q="py")
        self.assertTrue(any("Python" in s for s in res_filtered["skills"]))

    def test_custom_recommendations_without_resume(self):
        """Verify recommendations work directly from manual skills and location with NO resume."""
        res = get_custom_job_recommendations(
            skills="Python,React,SQL",
            experience=0,
            experience_level="fresher",
            location="Remote",
            min_threshold=30,
            limit=20,
            db=self.db,
        )
        self.assertGreater(res.total, 0)
        self.assertTrue(len(res.jobs) > 0)

        first_job = res.jobs[0]
        self.assertTrue(first_job.match_percentage >= 30)
        self.assertTrue(len(first_job.title) > 0)
        self.assertTrue(len(first_job.company) > 0)
        self.assertIsNotNone(first_job.suitability_reason)

        # Ensure jobs are sorted descending by match percentage
        for i in range(len(res.jobs) - 1):
            self.assertGreaterEqual(
                res.jobs[i].match_percentage,
                res.jobs[i + 1].match_percentage,
            )

    def test_custom_recommendations_fresher_experience_fit(self):
        """Verify fresher preferences correctly evaluate jobs and provide entry-level compatibility."""
        res = get_custom_job_recommendations(
            skills="Python,FastAPI",
            experience=0,
            experience_level="fresher",
            location="Hyderabad",
            min_threshold=30,
            limit=10,
            db=self.db,
        )
        self.assertGreater(res.total, 0)
        for job in res.jobs:
            self.assertIsNotNone(job.experience_compatibility)

    def test_preferences_save_and_retrieve(self):
        """Verify saving and retrieving candidate preferences in SQLite."""
        if not self.test_user:
            self.skipTest("No test user found in DB")

        payload = CandidatePreferencesPayload(
            skills=["Python", "FastAPI", "React", "Docker"],
            experience=0,
            experience_level="fresher",
            location="Hyderabad",
            customize_active=True,
        )

        saved = save_candidate_preferences(
            payload=payload,
            current_user=self.test_user,
            db=self.db,
        )

        self.assertEqual(saved.skills, ["Python", "FastAPI", "React", "Docker"])
        self.assertEqual(saved.experience, 0.0)
        self.assertEqual(saved.experience_level, "fresher")
        self.assertEqual(saved.location, "Hyderabad")
        self.assertTrue(saved.customize_active)

        # Retrieve
        fetched = get_candidate_preferences(
            current_user=self.test_user,
            db=self.db,
        )
        self.assertEqual(fetched.skills, ["Python", "FastAPI", "React", "Docker"])
        self.assertEqual(fetched.experience, 0.0)
        self.assertEqual(fetched.location, "Hyderabad")
        self.assertTrue(fetched.customize_active)


if __name__ == "__main__":
    unittest.main()
