"""
Comprehensive tests for Website URL Job Import & Crawler:
- SSRF and protocol security validation
- Schema.org JobPosting JSON-LD extraction
- Website URL Adapter in Integration Registry
- /api/integrations/website/scan endpoint
- /api/integrations/website/import endpoint with selective persistence
- Duplicate prevention (canonical URL & composite key)
- Compatibility with unified job listings and candidate application pipeline
"""
import os
import unittest
from unittest.mock import patch, MagicMock

os.environ["TESTING"] = "true"

from backend.database.connection import SessionLocal
from backend.database.models_complete import (
    User,
    PortalIntegration,
    ImportedJobListing,
    JobApplication,
)
from backend.services.website_job_crawler import (
    validate_url_security,
    extract_jobs_from_json_ld,
    detect_embedded_ats,
)
from backend.integrations.registry import get_adapter
from backend.auth.jwt import create_access_token


class TestWebsiteJobCrawlerAndImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.authorizer = cls.db.query(User).filter(User.role == "authorizer").first()
        if not cls.authorizer:
            cls.authorizer = User(
                email="test_authorizer@autoagenthire.com",
                role="authorizer",
                hashed_password="hashed_pw_test",
                full_name="Test Authorizer",
                is_active=True,
            )
            cls.db.add(cls.authorizer)
            cls.db.commit()
            cls.db.refresh(cls.authorizer)

        cls.candidate = cls.db.query(User).filter(User.role == "candidate").first()
        if not cls.candidate:
            cls.candidate = User(
                email="test_candidate@autoagenthire.com",
                role="candidate",
                hashed_password="hashed_pw_test",
                full_name="Test Candidate",
                is_active=True,
            )
            cls.db.add(cls.candidate)
            cls.db.commit()
            cls.db.refresh(cls.candidate)

        cls.auth_token = create_access_token({"sub": cls.authorizer.email, "role": cls.authorizer.role})
        cls.candidate_token = create_access_token({"sub": cls.candidate.email, "role": cls.candidate.role})

    @classmethod
    def tearDownClass(cls):
        cls.db.query(ImportedJobListing).filter(ImportedJobListing.provider == "website_url").delete(synchronize_session=False)
        cls.db.query(JobApplication).filter(JobApplication.reference_id.like("AAH-APP-TEST-%")).delete(synchronize_session=False)
        cls.db.commit()
        cls.db.close()

    # ── 1. SSRF & Security Validation Tests ────────────────────────────────────

    def test_ssrf_rejects_loopback_and_localhost(self):
        is_safe, _, err = validate_url_security("http://localhost:8000/api")
        self.assertFalse(is_safe)
        self.assertIn("blocked", err.lower())

        is_safe, _, err = validate_url_security("http://127.0.0.1:8000")
        self.assertFalse(is_safe)

    def test_ssrf_rejects_cloud_metadata(self):
        is_safe, _, err = validate_url_security("http://169.254.169.254/latest/meta-data/")
        self.assertFalse(is_safe)
        self.assertIn("blocked", err.lower())

        is_safe, _, err = validate_url_security("http://metadata.google.internal/computeMetadata/v1/")
        self.assertFalse(is_safe)

    def test_ssrf_rejects_private_ips(self):
        is_safe, _, err = validate_url_security("http://10.0.0.1/careers")
        self.assertFalse(is_safe)

        is_safe, _, err = validate_url_security("http://192.168.1.1/jobs")
        self.assertFalse(is_safe)

    def test_ssrf_rejects_invalid_schemes(self):
        is_safe, _, err = validate_url_security("ftp://example.com/careers")
        self.assertFalse(is_safe)
        self.assertIn("http", err.lower())

        is_safe, _, err = validate_url_security("file:///etc/passwd")
        self.assertFalse(is_safe)

    # ── 2. JSON-LD Schema.org JobPosting Extraction Tests ─────────────────────

    def test_extract_jobs_from_json_ld_schema(self):
        sample_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <script type="application/ld+json">
            {
                "@context": "https://schema.org/",
                "@type": "JobPosting",
                "title": "Senior AI Infrastructure Engineer",
                "description": "<p>Build autonomous recruitment systems with Python and PyTorch.</p>",
                "hiringOrganization": {
                    "@type": "Organization",
                    "name": "Acme Robotics"
                },
                "jobLocation": {
                    "@type": "Place",
                    "address": {
                        "@type": "PostalAddress",
                        "addressLocality": "San Francisco",
                        "addressRegion": "CA"
                    }
                },
                "jobLocationType": "TELECOMMUTE",
                "employmentType": "FULL_TIME",
                "baseSalary": {
                    "@type": "MonetaryAmount",
                    "currency": "USD",
                    "value": {
                        "@type": "QuantitativeValue",
                        "value": 185000,
                        "unitText": "YEAR"
                    }
                },
                "skills": "Python, Kubernetes, FastAPI",
                "datePosted": "2026-11-01T00:00:00Z"
            }
            </script>
        </head>
        <body>Careers Page</body>
        </html>
        """
        jobs = extract_jobs_from_json_ld(sample_html, "https://acme.example/careers")
        self.assertEqual(len(jobs), 1)
        job = jobs[0]
        self.assertEqual(job.title, "Senior AI Infrastructure Engineer")
        self.assertEqual(job.company_name, "Acme Robotics")
        self.assertEqual(job.workplace_type, "remote")
        self.assertEqual(job.employment_type, "Full-time")
        self.assertIn("185,000", job.salary)
        self.assertIn("Python", job.skills)

    def test_extract_jobs_from_graph_json_ld(self):
        sample_graph = """
        <html><head>
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "JobPosting",
                    "title": "Frontend Architect",
                    "hiringOrganization": "WebTech Inc",
                    "jobLocation": "New York, NY",
                    "employmentType": "CONTRACTOR"
                },
                {
                    "@type": "JobPosting",
                    "title": "Backend Lead",
                    "hiringOrganization": "WebTech Inc",
                    "jobLocation": "Remote"
                }
            ]
        }
        </script>
        </head></html>
        """
        jobs = extract_jobs_from_json_ld(sample_graph, "https://webtech.example/jobs")
        self.assertEqual(len(jobs), 2)
        titles = [j.title for j in jobs]
        self.assertIn("Frontend Architect", titles)
        self.assertIn("Backend Lead", titles)

    def test_detect_embedded_ats_providers(self):
        html_gh = '<iframe src="https://boards.greenhouse.io/embed/job_board?for=stripe"></iframe>'
        ats_type, board_token = detect_embedded_ats(html_gh, "https://stripe.com/jobs")
        self.assertEqual(ats_type, "greenhouse")
        self.assertEqual(board_token, "stripe")

        html_ashby = '<a href="https://jobs.ashbyhq.com/openai">View Open Positions</a>'
        ats_type, board_token = detect_embedded_ats(html_ashby, "https://openai.com/careers")
        self.assertEqual(ats_type, "ashby")
        self.assertEqual(board_token, "openai")

    # ── 3. Adapter Registry Verification ──────────────────────────────────────

    def test_website_url_adapter_registered(self):
        adapter = get_adapter("website_url")
        self.assertIsNotNone(adapter)
        self.assertEqual(adapter.provider_id, "website_url")
        self.assertTrue(adapter.is_supported)

    def test_reject_synthetic_or_identifier_job_titles(self):
        from backend.services.website_job_crawler import is_invalid_or_placeholder_title, clean_and_validate_title
        # Synthetic test title
        self.assertTrue(is_invalid_or_placeholder_title("Test Website Job aebdbff79ddb"))
        # UUID / Hex identifier
        self.assertTrue(is_invalid_or_placeholder_title("6a6402631d3b0"))
        self.assertTrue(is_invalid_or_placeholder_title("550e8400-e29b-41d4-a716-446655440000"))
        # Numeric / Requisition ID
        self.assertTrue(is_invalid_or_placeholder_title("job-12345"))
        self.assertTrue(is_invalid_or_placeholder_title("req_9876"))
        # Navigation words
        self.assertTrue(is_invalid_or_placeholder_title("Apply Now"))
        self.assertTrue(is_invalid_or_placeholder_title("View Details"))
        # Genuine job titles must pass
        self.assertFalse(is_invalid_or_placeholder_title("Senior Python Developer"))
        self.assertFalse(is_invalid_or_placeholder_title("Full Stack Engineer (Remote)"))
        self.assertFalse(is_invalid_or_placeholder_title("Associate Data Analyst"))
        # Fallback enforcement
        self.assertEqual(clean_and_validate_title("6a6402631d3b0"), "Job title unavailable")
        self.assertEqual(clean_and_validate_title("Test Website Job e6b081f3837"), "Job title unavailable")
        self.assertEqual(clean_and_validate_title("Junior React Developer"), "Junior React Developer")

    # ── 4. End-to-End API Persistence and Duplicate Detection ─────────────────

    def test_website_import_and_unified_job_pipeline(self):
        from backend.routes.website_import_routes import (
            WebsiteImportRequest,
            DiscoveredJobImportItem,
            import_selected_website_jobs,
        )
        from backend.routes.job_listings_routes import get_unified_job_listings

        # 1. Create a simulated discovered job preview item
        unique_hex = os.urandom(4).hex()
        unique_title = f"Senior AI Systems Engineer {unique_hex}"
        unique_job_url = f"https://innovate.example/jobs/{unique_hex}"
        preview_job = DiscoveredJobImportItem(
            temp_id="temp_12345",
            title=unique_title,
            company_name="Innovate Corp",
            location="San Francisco, CA",
            workplace_type="hybrid",
            employment_type="Full-time",
            salary="$160,000 - $190,000",
            skills=["Python", "FastAPI", "React"],
            job_posting_url=unique_job_url,
            description="Leading innovation in AI recruitment workflows.",
        )

        import_req = WebsiteImportRequest(
            url="https://innovate.example/careers",
            connection_name="Innovate Careers Hub",
            selected_jobs=[preview_job],
        )

        # 2. Persist using the endpoint logic with mocked DNS for test domain
        with patch("backend.services.website_job_crawler.socket.getaddrinfo", return_value=[(None, None, None, None, ("93.184.216.34", 80))]):
            import_result = import_selected_website_jobs(
                body=import_req,
                current_user=self.authorizer,
                db=self.db,
            )

            self.assertEqual(import_result.imported_count, 1)
            self.assertEqual(import_result.updated_count, 0)
            self.assertGreater(len(import_result.imported_job_ids), 0)
            saved_id = import_result.imported_job_ids[0]

            # 3. Test duplicate prevention on re-import
            reimport_result = import_selected_website_jobs(
                body=import_req,
                current_user=self.authorizer,
                db=self.db,
            )
            self.assertEqual(reimport_result.imported_count, 0)
            self.assertEqual(reimport_result.updated_count, 1)

        # 4. Verify job appears in unified job listings (Candidate Jobs Page backend)
        unified_res = get_unified_job_listings(
            source="website_url",
            search=unique_title,
            db=self.db,
        )
        self.assertGreater(unified_res.total, 0)
        matched_job = next((j for j in unified_res.jobs if j.title == unique_title), None)
        self.assertIsNotNone(matched_job)
        self.assertEqual(matched_job.company_name, "Innovate Corp")
        self.assertEqual(matched_job.source, "website_url")
        self.assertEqual(matched_job.workplace_type, "hybrid")

        # 5. Verify Candidate application persistence for imported website job
        ref_id = f"AAH-APP-TEST-{os.urandom(3).hex().upper()}"
        app = JobApplication(
            reference_id=ref_id,
            job_type="imported",
            imported_job_id=saved_id,
            candidate_id=self.candidate.id,
            company_name="Innovate Corp",
            job_title=unique_title,
            job_location="San Francisco, CA",
            candidate_name="Candidate Tester",
            candidate_email=self.candidate.email,
            delivery_status="Delivered to Employer",
            delivery_channel="AutoAgentHire Direct Requisition",
            delivery_details="Application delivered directly to Innovate Corp recruiting desk.",
            status="pending",
        )
        self.db.add(app)
        self.db.commit()
        self.db.refresh(app)

        self.assertIsNotNone(app.id)
        self.assertEqual(app.imported_job_id, saved_id)
        self.assertEqual(app.job_title, unique_title)
        self.assertEqual(app.delivery_status, "Delivered to Employer")

        # Clean up test artifacts so real job listings database remains clean
        self.db.delete(app)
        self.db.query(ImportedJobListing).filter(ImportedJobListing.id.in_(import_result.imported_job_ids)).delete(synchronize_session=False)
        self.db.commit()


if __name__ == "__main__":
    unittest.main()
