"""
Unit tests for Google Gemini configuration, status reporting, and fallback mechanisms.
Validates:
1. Configured key reporting.
2. Missing key detection and clean fallback.
3. Invalid / placeholder key rejection.
4. Absolute secrecy of API key (never leaked in status or responses).
5. Safe status endpoints on FastAPI backend.
"""

import os
import unittest

os.environ["TESTING"] = "true"

from backend.llm.gemini_service import GeminiService, get_gemini_service
from backend.routes.ats_routes import get_ats_gemini_status as ats_gemini_status
from backend.routes.practice_routes import get_practice_gemini_status as practice_gemini_status


class TestGeminiConfig(unittest.TestCase):
    def test_01_missing_key_detection(self):
        """Test missing API key reports configured=False and status=missing_key."""
        svc = GeminiService(api_key="")
        status = svc.get_status()
        self.assertFalse(status["configured"])
        self.assertEqual(status["status"], "missing_key")
        self.assertIn("not set", status["message"].lower())
        self.assertNotIn("api_key", status)
        self.assertEqual(status["provider"], "google-gemini")

    def test_02_placeholder_key_rejection(self):
        """Test placeholder keys like 'your-gemini-api-key' are rejected as unconfigured."""
        placeholders = [
            "your-gemini-api-key",
            "your_gemini_api_key_here",
            "   ",
        ]
        for ph in placeholders:
            svc = GeminiService(api_key=ph)
            status = svc.get_status()
            self.assertFalse(status["configured"], f"Failed for placeholder: {ph}")
            self.assertEqual(status["status"], "missing_key")

    def test_03_configured_key_status(self):
        """Test valid key format initializes and reports configured=True without leaking value."""
        dummy_valid_key = "AIzaSyFakeKeyForUnitTestingOnly12345"
        svc = GeminiService(api_key=dummy_valid_key)
        status = svc.get_status()
        self.assertTrue(status["configured"])
        self.assertIn("model", status)
        # CRITICAL: Secret key MUST NOT be present in status payload
        self.assertNotIn(dummy_valid_key, str(status))
        self.assertNotIn("api_key", status)

    def test_04_api_status_endpoints_never_expose_key(self):
        """Test ATS and Practice gemini status endpoints are public, safe, and secret."""
        for fn in [ats_gemini_status, practice_gemini_status]:
            data = fn()
            self.assertIn("configured", data)
            self.assertIn("status", data)
            self.assertIn("model", data)
            self.assertNotIn("api_key", data)
            self.assertNotIn("AIzaSy", str(data))

    def test_05_fallback_resume_analysis_explicitly_flags_unpowered(self):
        """Test that when built-in fallback parser is used, ai_powered is strictly False."""
        svc = GeminiService(api_key="")
        result = svc.analyze_resume("Jane Doe\nSoftware Engineer with Python, React, and SQL experience.")
        self.assertFalse(result.get("ai_powered"))
        self.assertEqual(result.get("model_used"), "builtin-local-heuristics")
        self.assertIn("config_message", result)


if __name__ == "__main__":
    unittest.main()
