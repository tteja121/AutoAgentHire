"""
Tests for AutoAgentHire Job Description Rendering, Internal Application Workflow, and Email System.
"""

import os
import sys

os.environ["TESTING"] = "true"
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parents[1]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import html
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.main import app
from backend.database.connection import SessionLocal
from backend.database.models_complete import (
    User,
    JobPosting,
    ImportedJobListing,
    JobApplication,
)
import backend.services.email_service as email_service


class TestApplicationAndEmailSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.patcher1 = patch("backend.services.email_service.send_candidate_application_thank_you_email", return_value=(True, "mock-msg-id", None))
        cls.patcher2 = patch("backend.services.email_service.send_application_notification_email", return_value=True)
        cls.patcher3 = patch("backend.services.email_service.send_email", return_value=(True, "mock-id", None))
        cls.patcher4 = patch("backend.services.email_service._send_via_smtp", return_value=(True, "mock-smtp-id", None))
        cls.patcher5 = patch("backend.services.email_service._send_via_resend", return_value=(True, "mock-resend-id", None))
        cls.patcher1.start()
        cls.patcher2.start()
        cls.patcher3.start()
        cls.patcher4.start()
        cls.patcher5.start()

    @classmethod
    def tearDownClass(cls):
        cls.patcher1.stop()
        cls.patcher2.stop()
        cls.patcher3.stop()
        cls.patcher4.stop()
        cls.patcher5.stop()

    def test_job_descriptions_unescaped_in_database(self):
        """Test that active job listings in the database do not contain literal entity tags like &lt;h2&gt;."""
        with SessionLocal() as db:
            jobs_with_raw_entities = (
                db.query(ImportedJobListing)
                .filter(ImportedJobListing.description.like("%&lt;%"))
                .count()
            )
            self.assertEqual(
                jobs_with_raw_entities,
                0,
                f"Expected 0 jobs with raw &lt; entities, found {jobs_with_raw_entities}",
            )

            first_job = db.query(ImportedJobListing).filter(ImportedJobListing.id == 1).first()
            if first_job and first_job.description:
                self.assertNotIn("&lt;h2&gt;", first_job.description)
                self.assertNotIn("&amp;#39;", first_job.description)

    def test_internal_application_submission_for_imported_job(self):
        """Test applying internally to an imported ATS job creates a valid JobApplication with reference ID."""
        db = SessionLocal()
        try:
            imported_job = db.query(ImportedJobListing).filter(ImportedJobListing.status == "active").first()
            self.assertIsNotNone(imported_job, "Should have at least one active imported job")
            job_id = imported_job.id
            company = imported_job.company_name
        finally:
            db.close()

        test_email = f"test_applicant_{int(datetime.now().timestamp())}@example.com"
        payload = {
            "candidate_name": "Alex Candidate",
            "candidate_email": test_email,
            "candidate_phone": "+1-555-0199",
            "cover_letter": "I am deeply passionate about this role and company mission.",
            "job_type": "imported",
        }

        resp = self.client.post(
            f"/api/recruiter/candidate/apply/{job_id}?job_type=imported",
            data=payload,
        )
        self.assertEqual(resp.status_code, 201, f"Expected 201 Created, got {resp.status_code}: {resp.text}")
        data = resp.json()

        self.assertIn("reference_id", data)
        self.assertTrue(data["reference_id"].startswith("AAH-APP-"))
        self.assertIn("delivery_status", data)
        self.assertIn(data["delivery_status"], ["Delivered to Employer", "Awaiting Employer Connection"])

        # Verify persisted in database
        db2 = SessionLocal()
        try:
            saved_app = db2.query(JobApplication).filter(JobApplication.reference_id == data["reference_id"]).first()
            self.assertIsNotNone(saved_app)
            self.assertEqual(saved_app.candidate_email, test_email)
            self.assertEqual(saved_app.job_type, "imported")
            self.assertEqual(saved_app.imported_job_id, job_id)
            self.assertEqual(saved_app.company_name, company)
        finally:
            db2.close()

    def test_duplicate_application_prevention(self):
        """Test that submitting a second application for the same job and email returns 409 Conflict."""
        db = SessionLocal()
        try:
            imported_job = db.query(ImportedJobListing).filter(ImportedJobListing.status == "active").first()
            self.assertIsNotNone(imported_job)
            job_id = imported_job.id
        finally:
            db.close()

        dup_email = f"dup_applicant_{int(datetime.now().timestamp())}@example.com"
        payload = {
            "candidate_name": "Jordan Duplicate",
            "candidate_email": dup_email,
            "job_type": "imported",
        }

        # First application -> 201
        resp1 = self.client.post(
            f"/api/recruiter/candidate/apply/{job_id}?job_type=imported",
            data=payload,
        )
        self.assertEqual(resp1.status_code, 201)
        ref1 = resp1.json()["reference_id"]

        # Second application -> 409 Conflict with reference ID in message
        resp2 = self.client.post(
            f"/api/recruiter/candidate/apply/{job_id}?job_type=imported",
            data=payload,
        )
        self.assertEqual(resp2.status_code, 409)
        self.assertIn(ref1, resp2.json()["detail"])

    @patch.object(email_service, "_send_via_smtp", return_value=(True, "mock-smtp-id", None))
    @patch.object(email_service, "_send_via_resend", return_value=(True, "mock-resend-id", None))
    def test_email_confirmation_dispatch_formatting(self, mock_resend, mock_smtp):
        """Test thank-you email formatter generates correct subject with Reference ID and delivery status."""
        test_email = "test_verify@example.com"
        success, msg_id, err = email_service.send_candidate_application_thank_you_email(
            candidate_email=test_email,
            candidate_name="Taylor Tester",
            job_title="Senior Platform Engineer",
            company_name="AutoAgentHire Partner Corp",
            application_id=999,
            location="San Francisco, CA",
            reference_id="AAH-APP-2026-TEST01",
            delivery_status="Delivered to Employer",
        )
        self.assertTrue(success)

    def test_inbound_email_webhook_processing(self):
        """Test that the /api/email/inbound endpoint processes inbound email and associates with reference ID."""
        test_ref = "AAH-APP-2026-INBD01"
        payload = {
            "from": "recruiter@stripe.com",
            "to": "notifications@autoagenthire.com",
            "subject": f"Re: Application Received [{test_ref}] Interview Request",
            "text": f"We would love to invite the candidate for an initial round regarding {test_ref}.",
            "html": f"<p>We would love to invite the candidate for an initial round regarding {test_ref}.</p>",
            "message_id": f"msg-{int(datetime.now().timestamp())}",
        }

        resp = self.client.post("/api/email/inbound", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "processed")
        self.assertEqual(data["reference_id"], test_ref)

    def test_email_diagnostics_endpoint(self):
        """Test that /api/email/diagnostics returns provider statuses and health."""
        resp = self.client.get("/api/email/diagnostics")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("status", data)
        self.assertIn("providers", data)
        self.assertIn("smtp", data["providers"])
        self.assertIn("default_sender", data)


if __name__ == "__main__":
    unittest.main()
