"""
Unit tests for API-based Job Import, Provider Normalization, Deduplication,
and Client Portal Unified Job Listings.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from backend.integrations.registry import get_adapter
from backend.integrations.base import NormalizedJobListing
from backend.database.models_complete import (
    User,
    PortalIntegration,
    ImportedJobListing,
    UserSavedJob,
    JobPosting,
)
from backend.routes.job_listings_routes import (
    _normalize_workplace_type,
    _parse_skills_list,
    get_unified_job_listings,
    search_jobs,
    toggle_save_job,
    ToggleSaveJobRequest,
)


class TestJobImportAndPersistence(unittest.TestCase):

    def test_normalize_workplace_type(self):
        """Test classification of workplace types into remote, hybrid, or on-site."""
        self.assertEqual(_normalize_workplace_type("San Francisco, CA (Remote)", None), "remote")
        self.assertEqual(_normalize_workplace_type("New York, NY", "remote"), "remote")
        self.assertEqual(_normalize_workplace_type("London, UK", "Hybrid"), "hybrid")
        self.assertEqual(_normalize_workplace_type("Seattle, WA (Hybrid)", None), "hybrid")
        self.assertEqual(_normalize_workplace_type("Chicago, IL", "On-site"), "on-site")
        self.assertEqual(_normalize_workplace_type("Austin, TX", None), "on-site")

    def test_parse_skills_list(self):
        """Test parsing of skills from strings, JSON arrays, and lists."""
        self.assertEqual(_parse_skills_list(["Python", "React"]), ["Python", "React"])
        self.assertEqual(_parse_skills_list("Python, FastAPI, TypeScript"), ["Python", "FastAPI", "TypeScript"])
        self.assertEqual(_parse_skills_list('["Docker", "Kubernetes"]'), ["Docker", "Kubernetes"])
        self.assertEqual(_parse_skills_list(None), [])

    @patch("urllib.request.urlopen")
    def test_greenhouse_adapter_fetch_jobs_normalization(self, mock_urlopen):
        """Verify Greenhouse adapter normalizes jobs with direct application URLs."""
        adapter = get_adapter("greenhouse")
        self.assertIsNotNone(adapter)

        import json
        mock_data = [
            {
                "id": 884120,
                "name": "Senior Full-Stack Engineer",
                "status": "open",
                "offices": [{"name": "San Francisco, CA (Remote)"}],
                "departments": [{"name": "Engineering"}],
                "notes": "Experience with React and Python.",
                "updated_at": "2026-10-01T12:00:00Z",
                "requisition_id": "REQ-101",
            }
        ]
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_data).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        jobs, err = adapter.fetch_jobs(
            api_key="valid_token",
            config={"board_token": "stripe", "company_name": "Stripe"},
            limit=10,
        )

        self.assertIsNone(err)
        self.assertEqual(len(jobs), 1)
        job = jobs[0]
        self.assertEqual(job.external_job_id, "884120")
        self.assertEqual(job.title, "Senior Full-Stack Engineer")
        self.assertEqual(job.company_name, "Stripe")
        self.assertEqual(job.workplace_type, "remote")
        self.assertIn("boards.greenhouse.io/stripe/jobs/884120", job.job_posting_url)

    @patch("urllib.request.urlopen")
    def test_lever_adapter_fetch_jobs_normalization(self, mock_urlopen):
        """Verify Lever adapter normalizes jobs and handles categories."""
        adapter = get_adapter("lever")
        self.assertIsNotNone(adapter)

        import json
        mock_data = [
            {
                "id": "lever-job-99",
                "text": "Lead Backend Architect",
                "categories": {
                    "location": "New York, NY",
                    "commitment": "Full-time",
                    "team": "Platform",
                },
                "workplaceType": "hybrid",
                "descriptionPlain": "We are seeking a Lead Backend Architect.",
                "urls": {
                    "show": "https://jobs.lever.co/example/lever-job-99",
                    "apply": "https://jobs.lever.co/example/lever-job-99/apply",
                },
                "createdAt": 1700000000000,
            }
        ]
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_data).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        jobs, err = adapter.fetch_jobs(
            api_key="lever_secret_key",
            limit=10,
        )

        self.assertIsNone(err)
        self.assertEqual(len(jobs), 1)
        job = jobs[0]
        self.assertEqual(job.external_job_id, "lever-job-99")
        self.assertEqual(job.title, "Lead Backend Architect")
        self.assertEqual(job.workplace_type, "hybrid")
        self.assertEqual(job.job_posting_url, "https://jobs.lever.co/example/lever-job-99/apply")

    @patch("urllib.request.urlopen")
    def test_workable_adapter_fetch_jobs_normalization(self, mock_urlopen):
        """Verify Workable adapter normalizes jobs with subdomain routing."""
        adapter = get_adapter("workable")
        self.assertIsNotNone(adapter)

        import json
        mock_data = {
            "jobs": [
                {
                    "id": "WKB-12",
                    "shortcode": "WKB1234",
                    "title": "Machine Learning Engineer",
                    "department": "AI Research",
                    "location": {"city": "Boston", "country": "United States", "telecommuting": True},
                    "employment_type": "Full-time",
                    "description": "Design and build production AI agents.",
                    "url": "https://apply.workable.com/techcorp/j/WKB1234/",
                    "created_at": "2026-10-10T08:00:00Z",
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_data).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        jobs, err = adapter.fetch_jobs(
            api_key="workable_bearer_token",
            config={"subdomain": "techcorp"},
            limit=10,
        )

        self.assertIsNone(err)
        self.assertEqual(len(jobs), 1)
        job = jobs[0]
        self.assertEqual(job.external_job_id, "WKB1234")
        self.assertEqual(job.workplace_type, "remote")
        self.assertEqual(job.job_posting_url, "https://apply.workable.com/techcorp/j/WKB1234/")

    def test_unified_job_listings_mock_filtering(self):
        """Test filtering, source isolation, and pagination in unified jobs query."""
        mock_db = MagicMock()

        # Mock imported jobs
        mock_imp = ImportedJobListing(
            id=1,
            uuid="imp-1",
            integration_id=10,
            user_id=1,
            provider="greenhouse",
            external_job_id="gh-101",
            title="Senior React Developer",
            company_name="Acme Corp",
            company_logo_url="https://example.com/logo.png",
            description="Build modern web applications.",
            location="Remote",
            workplace_type="remote",
            employment_type="Full-time",
            salary="$130k - $160k",
            skills=["React", "TypeScript"],
            job_posting_url="https://boards.greenhouse.io/acme/jobs/gh-101",
            status="active",
        )

        # Mock recruiter job
        mock_rec = JobPosting(
            id=2,
            uuid="rec-2",
            recruiter_id=5,
            company_name="Globex Tech",
            title="Senior Python Backend Engineer",
            vacancies=2,
            salary_description="$140k - $170k",
            job_type="Full-time",
            location="San Francisco, CA",
            description="Build scalable microservices with FastAPI and PostgreSQL.",
            status="approved",
            skills="Python, FastAPI, SQL",
        )

        # Set up mock query chain
        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        # When queried for UserSavedJob, return empty
        # When queried for distinct providers, return [("greenhouse",)]
        def side_effect_query(*entities):
            q = MagicMock()
            target = entities[0] if entities else None
            if target is ImportedJobListing:
                q.filter.return_value.all.return_value = [mock_imp]
                return q
            elif target is JobPosting:
                q.filter.return_value.all.return_value = [mock_rec]
                return q
            elif target is UserSavedJob:
                q.filter.return_value.all.return_value = []
                return q
            elif target is PortalIntegration:
                q.filter.return_value.order_by.return_value.first.return_value = None
                return q
            elif hasattr(target, "key") and target.key == "provider":
                q.distinct.return_value.all.return_value = [("greenhouse",)]
                return q
            q.distinct.return_value.all.return_value = [("greenhouse",)]
            return q

        mock_db.query.side_effect = side_effect_query

        mock_user = User(id=1, email="test@candidate.com", role="candidate")

        res = get_unified_job_listings(
            search=None,
            location=None,
            workplace_type="all",
            employment_type="all",
            source="all",
            page=1,
            page_size=10,
            current_user=mock_user,
            db=mock_db,
        )

        self.assertEqual(res.total, 2)
        self.assertEqual(len(res.jobs), 2)
        sources = [j.source for j in res.jobs]
        self.assertIn("greenhouse", sources)
        self.assertIn("recruiter", sources)

    def test_toggle_save_job(self):
        """Test bookmarking and un-bookmarking a job listing."""
        mock_db = MagicMock()
        mock_user = User(id=42, email="candidate@test.com", role="candidate")

        # Mock job exists in ImportedJobListing
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            (1,),  # Job exists check
            None,  # No existing save -> save it
        ]

        # 1. First toggle: Saves the job
        res = toggle_save_job(
            job_id=1,
            payload=ToggleSaveJobRequest(job_type="imported"),
            current_user=mock_user,
            db=mock_db,
        )
        self.assertTrue(res.is_saved)
        self.assertIn("saved to bookmarks", res.message.lower())
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called()

        # 2. Second toggle: Removes the saved job
        existing_save = UserSavedJob(id=10, user_id=42, job_id=1, job_type="imported")
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            (1,),           # Job exists check
            existing_save,  # Existing save found -> delete it
        ]
        res_delete = toggle_save_job(
            job_id=1,
            payload=ToggleSaveJobRequest(job_type="imported"),
            current_user=mock_user,
            db=mock_db,
        )
        self.assertFalse(res_delete.is_saved)
        self.assertIn("removed from saved", res_delete.message.lower())
        mock_db.delete.assert_called_with(existing_save)

    @patch("urllib.request.urlopen")
    def test_ashby_adapter_fetch_jobs_normalization(self, mock_urlopen):
        """Verify Ashby adapter normalizes jobs from public job board endpoint."""
        adapter = get_adapter("ashby")
        self.assertIsNotNone(adapter)

        import json
        mock_data = {
            "jobs": [
                {
                    "id": "ashby-job-123",
                    "title": "Staff Platform Engineer",
                    "department": "Engineering",
                    "location": "Remote - US",
                    "isRemote": True,
                    "employmentType": "FullTime",
                    "jobPostingUrl": "https://jobs.ashbyhq.com/linear/ashby-job-123",
                    "publishedAt": "2026-10-15T08:00:00Z",
                    "descriptionHtml": "<p>Build high-scale distributed systems.</p>",
                    "compensation": {"compensationTierSummary": "$180,000 - $220,000"},
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_data).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        jobs, err = adapter.fetch_jobs(
            api_key="public",
            config={"company_name": "linear", "board_token": "linear", "display_name": "Linear"},
            limit=10,
        )

        self.assertIsNone(err)
        self.assertEqual(len(jobs), 1)
        job = jobs[0]
        self.assertEqual(job.external_job_id, "ashby-job-123")
        self.assertEqual(job.title, "Staff Platform Engineer")
        self.assertEqual(job.company_name, "Linear")
        self.assertEqual(job.workplace_type, "remote")
        self.assertEqual(job.employment_type, "Full-time")
        self.assertIn("180,000", str(job.salary))
        self.assertIn("high-scale distributed systems", job.description)

    @patch("backend.routes.integration_routes._build_integrations_health")
    def test_admin_integrations_health_permissions(self, mock_build):
        """Verify /api/admin/integrations/health requires authorizer or admin permissions."""
        from backend.routes.integration_routes import get_admin_integrations_health
        from fastapi import HTTPException

        mock_build.return_value = MagicMock(status="healthy")

        admin_user = User(id=1, email="admin@auto.in", role="admin")
        authorizer_user = User(id=2, email="author@auto.in", role="authorizer")
        candidate_user = User(id=3, email="candidate@auto.in", role="candidate")
        mock_db = MagicMock()

        # Admin and authorizer succeed
        self.assertIsNotNone(get_admin_integrations_health(current_user=admin_user, db=mock_db))
        self.assertIsNotNone(get_admin_integrations_health(current_user=authorizer_user, db=mock_db))

        # Candidate is forbidden with 403
        with self.assertRaises(HTTPException) as ctx:
            get_admin_integrations_health(current_user=candidate_user, db=mock_db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_candidate_job_matching_scoring_factors(self):
        """Verify 6-factor deterministic scoring model produces explainable matches."""
        from backend.services.matching_service import CandidateJobMatchingService

        candidate_profile = {
            "skills": ["Python", "FastAPI", "React", "TypeScript", "PostgreSQL", "Docker"],
            "total_experience": "4 years of software development experience",
            "years_of_experience": 4,
            "current_job_title": "Full Stack Engineer",
            "summary": "Full Stack Engineer specializing in scalable web systems with Python and React.",
            "location": "San Francisco, CA",
            "education": [{"degree": "Bachelor of Science in Computer Science"}],
            "raw_text": "Experienced Full Stack Engineer building cloud-native APIs and web apps.",
        }

        target_job = {
            "id": 101,
            "job_type": "imported",
            "source": "ashby",
            "title": "Senior Full Stack Engineer",
            "company_name": "Tech Corp",
            "description": "Looking for a Senior Full Stack Engineer experienced with Python, React, and PostgreSQL.",
            "location": "San Francisco, CA (Remote)",
            "workplace_type": "remote",
            "employment_type": "Full-time",
            "salary": "$160,000 - $190,000",
            "skills": ["Python", "React", "PostgreSQL", "FastAPI"],
        }

        score_res = CandidateJobMatchingService.score_candidate_job(candidate_profile, target_job)
        self.assertGreaterEqual(score_res["match_percentage"], 75)
        self.assertIn("score_breakdown", score_res)
        breakdown = score_res["score_breakdown"]
        self.assertIn("technical_skills", breakdown)
        self.assertIn("experience", breakdown)
        self.assertIn("role_alignment", breakdown)
        self.assertIn("education", breakdown)
        self.assertIn("location_workplace", breakdown)
        self.assertIn("additional_skills", breakdown)

        total_weight = sum(breakdown.values())
        self.assertEqual(score_res["match_percentage"], round(total_weight))
        self.assertTrue(len(score_res["matching_skills"]) > 0)
        self.assertTrue(len(score_res["suitability_reason"]) > 10)


if __name__ == "__main__":
    unittest.main()
