"""
Test Email Script for AutoAgentHire
Tests Gmail SMTP App Password connection and delivers a test email.

Usage:
    python scripts/test_email.py [optional_recipient_email]
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

try:
    from dotenv import load_dotenv
    # Load .env file explicitly from workspace root
    load_dotenv(dotenv_path=root_dir / ".env", override=True)
except ImportError:
    pass

from backend.services.email_service import _send_via_smtp, validate_email_address


def main():
    print("=" * 60)
    print("  AutoAgentHire - Gmail SMTP App Password Verification")
    print("=" * 60)

    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_pass = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    smtp_port = os.getenv("SMTP_PORT", "587").strip()

    print(f"SMTP Host:     {smtp_host}:{smtp_port}")
    print(f"SMTP User:     {smtp_user or '[NOT CONFIGURED]'}")
    
    if not smtp_pass or smtp_pass == "your-16-character-app-password":
        masked_pass = "[PLACEHOLDER - NOT SET]"
    else:
        masked_pass = f"{smtp_pass[:3]}{'*' * (len(smtp_pass) - 5)}{smtp_pass[-2:]}"
    print(f"SMTP Password: {masked_pass}")
    print("-" * 60)

    if not smtp_user or smtp_user == "your-email@gmail.com":
        print("\n❌ Error: SMTP_USER is not set in your .env file.")
        print("Please edit your .env file and set:")
        print("  SMTP_USER=your_actual_email@gmail.com")
        sys.exit(1)

    if not smtp_pass or smtp_pass == "your-16-character-app-password":
        print("\n❌ Error: SMTP_PASSWORD is not set in your .env file.")
        print("Please generate a 16-character Google App Password and set it in your .env:")
        print("  1. Go to: https://myaccount.google.com/apppasswords")
        print("  2. Create an App Name (e.g. 'AutoAgentHire')")
        print("  3. Copy the 16-character password and set:")
        print("     SMTP_PASSWORD=xxxx xxxx xxxx xxxx")
        sys.exit(1)

    # Determine recipient
    if len(sys.argv) > 1 and sys.argv[1].strip():
        recipient = sys.argv[1].strip()
    else:
        recipient = smtp_user

    if not validate_email_address(recipient):
        print(f"\n❌ Invalid recipient email: '{recipient}'")
        sys.exit(1)

    print(f"Attempting to dispatch test email to: {recipient}...")

    subject = "AutoAgentHire — SMTP Connection Test Successful"
    plain_text = (
        "Congratulations!\n\n"
        "Your AutoAgentHire automated email service is properly configured using Gmail App Password.\n"
        "All automated emails (applicant confirmations, recruiter updates, security OTPs) will now send automatically.\n\n"
        "— AutoAgentHire Platform"
    )
    html_content = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px; margin: 0;">
  <div style="max-width: 540px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 28px;">
    <div style="background: linear-gradient(135deg, #0284c7, #9333ea); color: white; display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 13px; margin-bottom: 16px;">
      AutoAgentHire &bull; Email System
    </div>
    <h2 style="color: #38bdf8; margin: 0 0 12px 0;">Connection Verified! 🚀</h2>
    <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
      Congratulations! Your <strong>Gmail App Password</strong> integration is working seamlessly.
    </p>
    <div style="background: #090d16; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 13px; color: #34d399; margin: 18px 0;">
      ✔ SMTP Connected to {smtp_host}:{smtp_port}<br>
      ✔ TLS Handshake Established<br>
      ✔ Authenticated as {smtp_user}<br>
      ✔ Dispatched to {recipient}
    </div>
    <p style="color: #94a3b8; font-size: 13px; margin-top: 20px;">
      AutoAgentHire can now send candidate application confirmations, recruiter notifications, and security verification codes automatically.
    </p>
  </div>
</body>
</html>"""

    success, msg_id, err = _send_via_smtp(recipient, subject, html_content, plain_text)

    if success:
        print("\n" + "=" * 60)
        print("  [SUCCESS] Test email was delivered successfully!")
        print(f"  Message ID: {msg_id}")
        print(f"  Check the inbox (and spam folder) of: {recipient}")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("  [FAILURE] DELIVERY FAILED")
        print(f"  Error details: {err}")
        print("=" * 60)
        print("\nTroubleshooting tips for Gmail App Passwords:")
        print("1. Did you turn on 2-Step Verification on your Google Account?")
        print("   App Passwords can only be generated if 2FA is active.")
        print("2. Did you use your standard Google password by mistake?")
        print("   Google blocks normal passwords. You MUST generate an App Password at:")
        print("   https://myaccount.google.com/apppasswords")
        print("3. Check for typos in your email in the .env file.")


if __name__ == "__main__":
    main()
