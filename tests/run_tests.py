"""
Standalone test runner for AutoAgentHire integration and health tests.
Uses Python built-in unittest so no third-party test runners are required.
"""
import os
import sys
import unittest
from pathlib import Path

os.environ["TESTING"] = "true"

# Add project root to sys.path
root_dir = Path(__file__).resolve().parents[1]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

# Import test functions
from tests.test_integrations_and_health import (
    test_credential_encryption_and_decryption_roundtrip,
    test_credential_masking,
    test_supported_providers_catalog,
    test_greenhouse_adapter_validation_success,
    test_greenhouse_adapter_fetch_applications,
    test_unsupported_adapter_refuses_direct_api_key,
    test_application_deduplication_hash,
    test_database_health_structure,
    test_database_health_forbidden_for_candidates,
    test_create_integration_encrypts_and_masks_key,
    test_user_isolation_cannot_access_other_users_integration,
)


class TestIntegrationsAndHealth(unittest.TestCase):
    def test_encryption_roundtrip(self):
        test_credential_encryption_and_decryption_roundtrip()

    def test_masking(self):
        test_credential_masking()

    def test_providers_catalog(self):
        test_supported_providers_catalog()

    def test_greenhouse_validation(self):
        test_greenhouse_adapter_validation_success()

    def test_greenhouse_fetch(self):
        test_greenhouse_adapter_fetch_applications()

    def test_unsupported_adapter(self):
        test_unsupported_adapter_refuses_direct_api_key()

    def test_deduplication(self):
        test_application_deduplication_hash()

    def test_db_health_structure(self):
        test_database_health_structure()

    def test_db_health_forbidden(self):
        test_database_health_forbidden_for_candidates()

    def test_create_and_mask(self):
        test_create_integration_encrypts_and_masks_key()

    def test_user_isolation(self):
        test_user_isolation_cannot_access_other_users_integration()


from tests.test_job_import_and_persistence import TestJobImportAndPersistence
from tests.test_application_and_email_system import TestApplicationAndEmailSystem


if __name__ == "__main__":
    suite1 = unittest.TestLoader().loadTestsFromTestCase(TestIntegrationsAndHealth)
    suite2 = unittest.TestLoader().loadTestsFromTestCase(TestJobImportAndPersistence)
    suite3 = unittest.TestLoader().loadTestsFromTestCase(TestApplicationAndEmailSystem)
    suite = unittest.TestSuite([suite1, suite2, suite3])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
