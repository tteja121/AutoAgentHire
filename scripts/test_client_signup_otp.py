"""
Test Client Signup & Email OTP Verification Flow
Tests:
1. Client account creation dispatches 6-digit OTP via hyrai.auto@gmail.com
2. Verifying with correct OTP activates the account and returns JWT token
"""

import os
import sys
from pathlib import Path

# Add project root to path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from dotenv import load_dotenv
load_dotenv(dotenv_path=root_dir / ".env", override=True)

from backend.database.connection import SessionLocal
from backend.database.models_complete import User
from backend.database.crud import UserRepository
from backend.routes.auth_routes import SignupRequest, VerifyOtpRequest, signup, verify_signup_otp, resend_signup_otp


def test_client_otp_flow():
    print("=" * 65)
    print("  Testing Free Client Account Creation with Email OTP")
    print("=" * 65)

    test_email = "hyrai.auto@gmail.com"  # send real verification OTP to verified inbox!
    test_password = "Password123!"
    test_name = "Test Client User"

    db = SessionLocal()
    try:
        # Clean up any previous test user with this email
        old_user = UserRepository.get_by_email(db, test_email)
        if old_user:
            print(f"[*] Resetting test account state for: {test_email}")
            db.delete(old_user)
            db.commit()

        # Step 1: Client Signup
        print(f"\n[1] Submitting signup request for free client account ({test_email})...")
        signup_req = SignupRequest(
            email=test_email,
            password=test_password,
            full_name=test_name,
            role="candidate"
        )
        resp = signup(signup_req, db=db)
        print(f"    -> Response: status={resp.status}, requires_otp={resp.requires_otp}")
        print(f"    -> Message:  {resp.message}")

        assert resp.requires_otp is True, "Expected requires_otp=True"
        assert resp.status == "pending_verification", "Expected pending_verification"

        # Check DB state
        user = UserRepository.get_by_email(db, test_email)
        assert user is not None, "User should exist in database"
        assert user.is_verified is False, "User should not be verified yet"
        assert user.email_verification_code is not None, "OTP code must be generated"
        code = user.email_verification_code
        print(f"    -> Generated & Dispatched 6-digit OTP: {code}")

        # Step 2: Try invalid OTP
        print("\n[2] Testing invalid OTP rejection...")
        try:
            verify_signup_otp(VerifyOtpRequest(email=test_email, code="000000"), db=db)
            print("    -> ERROR: Invalid OTP was unexpectedly accepted!")
            sys.exit(1)
        except Exception as e:
            print(f"    -> Correctly rejected invalid code: {getattr(e, 'detail', str(e))}")

        # Step 3: Verify with real OTP
        print(f"\n[3] Submitting correct OTP ({code})...")
        verify_resp = verify_signup_otp(VerifyOtpRequest(email=test_email, code=code), db=db)
        print(f"    -> Success! Access Token received: {verify_resp.access_token[:20]}...")
        print(f"    -> Role: {verify_resp.role}")

        # Verify DB is now verified
        db.refresh(user)
        assert user.is_verified is True, "User should now be verified"
        assert user.email_verification_code is None, "Verification code should be cleared"
        print("    -> Database state: is_verified = True, code cleared!")

        print("\n" + "=" * 65)
        print("  [SUCCESS] All Client OTP Registration Tests Passed!")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    test_client_otp_flow()
