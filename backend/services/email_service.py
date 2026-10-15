"""
Email Sender Service for AutoAgentHire
Supports Resend API (Recommended) with fallback to Standard SMTP
(Gmail, Outlook, Yahoo, SendGrid, Amazon SES, Custom SMTP).
Reads configuration securely from environment variables (.env).
"""

import os
import re
import smtplib
import logging
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple
import requests

logger = logging.getLogger(__name__)

# Provider Configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", os.getenv("SMTP_FROM_EMAIL", "notifications@autoagenthire.com"))
RESEND_FROM_NAME = os.getenv("RESEND_FROM_NAME", os.getenv("SMTP_FROM_NAME", "AutoAgentHire"))

# Website & Support Metadata
WEBSITE_URL = os.getenv("WEBSITE_URL", "https://autoagenthire.com")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@autoagenthire.com")

# Standard SMTP Configuration
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", os.getenv("SMTP_USER", RESEND_FROM_EMAIL))
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", RESEND_FROM_NAME)
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
SMTP_ENABLED = os.getenv("SMTP_ENABLED", "true").lower() in ("true", "1", "yes")


def validate_email_address(email: str) -> bool:
    """Validate email format with standard pattern."""
    if not email or not isinstance(email, str):
        return False
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email.strip()))


def _send_via_resend(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Internal helper to dispatch email using Resend HTTP API."""
    if not RESEND_API_KEY:
        return False, None, "Resend API key is not configured."

    try:
        sender = f"{RESEND_FROM_NAME} <{RESEND_FROM_EMAIL}>"
        payload: Dict[str, Any] = {
            "from": sender,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        if plain_text:
            payload["text"] = plain_text
        if reply_to:
            payload["reply_to"] = reply_to

        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        }

        resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=12)
        if resp.status_code in (200, 201):
            data = resp.json()
            message_id = data.get("id") or str(uuid.uuid4())
            logger.info("[EmailService] Resend email dispatched to %s (ID: %s)", to_email, message_id)
            return True, message_id, None
        else:
            # Sanitize error to avoid leaking credentials
            err_text = resp.text[:250].replace(RESEND_API_KEY, "[REDACTED]")
            logger.warning("[EmailService] Resend API returned status %s: %s", resp.status_code, err_text)
            return False, None, f"Resend delivery error (HTTP {resp.status_code}): {err_text}"
    except Exception as exc:
        sanitized_err = str(exc).replace(RESEND_API_KEY, "[REDACTED]")
        logger.error("[EmailService] Resend exception: %s", sanitized_err)
        return False, None, f"Resend connection failed: {sanitized_err}"


def _send_via_smtp(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Internal helper to dispatch email using SMTP."""
    if not SMTP_USER or not SMTP_PASSWORD:
        return False, None, "SMTP credentials not configured."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to

        if plain_text:
            msg.attach(MIMEText(plain_text, "plain"))
        else:
            msg.attach(MIMEText("This email requires an HTML compatible viewer.", "plain"))

        msg.attach(MIMEText(html_content, "html"))

        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
            if SMTP_USE_TLS:
                server.starttls()

        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM_EMAIL, [to_email], msg.as_string())
        server.quit()

        message_id = f"smtp-{uuid.uuid4().hex[:12]}@{SMTP_HOST}"
        logger.info("[EmailService] SMTP email sent successfully to %s", to_email)
        return True, message_id, None
    except Exception as exc:
        sanitized_err = str(exc).replace(SMTP_PASSWORD, "[REDACTED]")
        logger.error("[EmailService] SMTP error for %s: %s", to_email, sanitized_err)
        return False, None, f"SMTP failure: {sanitized_err}"


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
) -> bool:
    """Send an HTML/plain-text email via Resend if available, falling back to SMTP."""
    clean_to = to_email.strip() if to_email else ""
    if not validate_email_address(clean_to):
        logger.warning("[EmailService] Attempted to send email to invalid address: %s", clean_to)
        return False

    # 1. Try Resend if configured
    if RESEND_API_KEY:
        success, _, _ = _send_via_resend(clean_to, subject, html_content, plain_text)
        if success:
            return True

    # 2. Try SMTP fallback
    if SMTP_USER and SMTP_PASSWORD:
        success, _, _ = _send_via_smtp(clean_to, subject, html_content, plain_text)
        if success:
            return True

    logger.warning("[EmailService] All configured email providers failed for %s", clean_to)
    return False


def send_candidate_application_thank_you_email(
    candidate_email: str,
    candidate_name: Optional[str],
    job_title: Optional[str],
    company_name: Optional[str],
    application_id: Optional[int] = None,
    authorizer_email: Optional[str] = None,
    authorizer_name: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Feature 1: Send automatic thank-you confirmation email after job application submission.
    Incorporates official certification from Platform Authorizer Registry with reply-to set
    to the Authorizer's registered official email.
    Returns: (success: bool, message_id: Optional[str], error_message: Optional[str])
    """
    clean_email = candidate_email.strip() if candidate_email else ""
    if not validate_email_address(clean_email):
        return False, None, f"Invalid or unvalidated applicant email address: '{candidate_email}'"

    # Graceful formatting of optional fields
    applicant_name = candidate_name.strip() if candidate_name and candidate_name.strip() else "Applicant"
    job_title_display = job_title.strip() if job_title and job_title.strip() else "Position"
    company_name_display = company_name.strip() if company_name and company_name.strip() else "AutoAgentHire Partner"
    auth_email_display = (authorizer_email.strip() if authorizer_email and authorizer_email.strip() else None) or SUPPORT_EMAIL
    auth_name_display = (authorizer_name.strip() if authorizer_name and authorizer_name.strip() else None) or "Platform Authorizer Registry"

    # Subject: Thank You for Applying Through AutoAgentHire — [Job Title]
    subject = f"Thank You for Applying Through AutoAgentHire — {job_title_display}"

    # Plain text version matching the exact specification:
    plain_text = (
        f"Dear {applicant_name},\n\n"
        f"Thank you for applying for the {job_title_display} position at {company_name_display} through AutoAgentHire.\n\n"
        f"We are pleased to confirm that your application and resume have been successfully received and certified by the Platform Authorizer Desk.\n\n"
        f"Official Certification & Verification Registry: {auth_email_display}\n\n"
        f"The recruiting team will review your application and contact you if your profile matches the requirements of the position. "
        f"You can check your application status and any scheduled interviews through your AutoAgentHire account.\n\n"
        f"We appreciate your interest in AutoAgentHire and wish you success in your career journey.\n\n"
        f"Best regards,\n"
        f"{auth_name_display}\n"
        f"Senior Platform Authorizer\n"
        f"{WEBSITE_URL}\n"
        f"{auth_email_display}\n"
    )

    # Rich, modern HTML matching the plain text exactly
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #090d16;
      color: #f1f5f9;
      margin: 0;
      padding: 32px 16px;
      line-height: 1.6;
    }}
    .email-container {{
      max-width: 600px;
      margin: 0 auto;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 36px 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }}
    .brand-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      border-bottom: 1px solid #1f2937;
      padding-bottom: 20px;
    }}
    .brand-logo {{
      display: inline-block;
      background: linear-gradient(135deg, #0284c7, #9333ea);
      color: #ffffff;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.5px;
      padding: 6px 14px;
      border-radius: 8px;
    }}
    .authorizer-tag {{
      display: inline-block;
      background: rgba(147, 51, 234, 0.15);
      border: 1px solid rgba(147, 51, 234, 0.35);
      color: #c084fc;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .job-badge {{
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 16px;
      margin: 24px 0;
    }}
    .job-title {{
      font-size: 18px;
      font-weight: 700;
      color: #38bdf8;
      margin: 0 0 4px 0;
    }}
    .job-company {{
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
    }}
    .official-badge {{
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 10px;
      padding: 14px 16px;
      margin: 20px 0;
    }}
    .content-p {{
      font-size: 15px;
      color: #cbd5e1;
      margin: 16px 0;
    }}
    .footer {{
      margin-top: 36px;
      border-top: 1px solid #1f2937;
      padding-top: 24px;
      font-size: 13px;
      color: #94a3b8;
    }}
    .footer a {{
      color: #38bdf8;
      text-decoration: none;
    }}
    .footer a:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="brand-header">
      <span class="brand-logo">AutoAgentHire</span>
      <span class="authorizer-tag">Authorizer Verified</span>
    </div>

    <p class="content-p" style="font-size: 16px; font-weight: 600; color: #f8fafc;">Dear {applicant_name},</p>

    <p class="content-p">
      Thank you for applying for the <strong>{job_title_display}</strong> position at <strong>{company_name_display}</strong> through AutoAgentHire.
    </p>

    <div class="job-badge">
      <div class="job-title">{job_title_display}</div>
      <div class="job-company">{company_name_display} &bull; Application #{application_id if application_id else 'Verified'}</div>
    </div>

    <div class="official-badge">
      <div style="font-size: 13px; font-weight: 700; color: #34d399; margin-bottom: 2px;">
        🛡️ Officially Registered & Certified Application
      </div>
      <div style="font-size: 12px; color: #94a3b8;">
        Dispatched on behalf of Platform Authorizer Registry: <strong style="color: #f1f5f9;">{auth_email_display}</strong>
      </div>
    </div>

    <p class="content-p">
      We are pleased to confirm that your application and resume have been successfully received.
    </p>

    <p class="content-p">
      The recruiting team will review your application and contact you if your profile matches the requirements of the position. You can track your application status, interview schedules, and updates through your AutoAgentHire client account.
    </p>

    <p class="content-p">
      We appreciate your interest in AutoAgentHire and wish you the very best in your career journey.
    </p>

    <div class="footer">
      <p style="margin: 0 0 4px 0; color: #f1f5f9; font-weight: 600;">Best regards,</p>
      <p style="margin: 0 0 2px 0; color: #f8fafc; font-weight: 700; font-size: 15px;">{auth_name_display}</p>
      <p style="margin: 0 0 10px 0; color: #c084fc; font-size: 12px; font-weight: 600;">Senior Official &bull; Platform Authorizer Desk</p>
      <p style="margin: 0 0 4px 0;"><a href="mailto:{auth_email_display}">{auth_email_display}</a></p>
      <p style="margin: 0;"><a href="{WEBSITE_URL}">{WEBSITE_URL}</a></p>
    </div>
  </div>
</body>
</html>
"""

    # 1. Try Resend if configured
    if RESEND_API_KEY:
        success, message_id, err = _send_via_resend(clean_email, subject, html_content, plain_text, reply_to=auth_email_display)
        if success:
            return True, message_id, None
        logger.warning("[EmailService] Resend failed for application %s, checking SMTP fallback: %s", application_id, err)

    # 2. Try SMTP fallback
    if SMTP_USER and SMTP_PASSWORD:
        success, message_id, err = _send_via_smtp(clean_email, subject, html_content, plain_text, reply_to=auth_email_display)
        if success:
            return True, message_id, None
        return False, None, err

    # 3. Neither configured
    msg = "Email delivery pending: No active provider configured (Set RESEND_API_KEY or SMTP credentials in environment)."
    logger.info("[EmailService] %s", msg)
    return False, None, msg


def send_application_notification_email(
    recruiter_email: str,
    recruiter_name: str,
    job_title: str,
    candidate_name: str,
    candidate_email: str,
    candidate_phone: str,
    resume_url: Optional[str] = None,
) -> bool:
    """Notify recruiter when a candidate submits an application."""
    subject = f"New Candidate Application: {candidate_name} for {job_title}"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
        .card {{ background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 24px; max-width: 600px; margin: 0 auto; }}
        .header {{ border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; }}
        .title {{ font-size: 20px; font-weight: bold; color: #38bdf8; margin: 0; }}
        .field {{ margin-bottom: 12px; }}
        .label {{ font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 600; }}
        .value {{ font-size: 15px; color: #f1f5f9; font-weight: 500; margin-top: 4px; }}
        .badge {{ display: inline-block; padding: 4px 10px; border-radius: 6px; background-color: #0284c7; color: white; font-size: 12px; font-weight: 600; }}
        .footer {{ margin-top: 24px; border-top: 1px solid #334155; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">AutoAgentHire Notification</div>
          <h2 class="title" style="margin-top: 10px;">New Job Application Received</h2>
        </div>
        <p>Hello <strong>{recruiter_name or 'Recruiter'}</strong>,</p>
        <p>A new candidate has submitted their profile for <strong>{job_title}</strong>.</p>
        
        <div class="field">
          <div class="label">Candidate Name</div>
          <div class="value">{candidate_name}</div>
        </div>
        <div class="field">
          <div class="label">Email Address</div>
          <div class="value">{candidate_email}</div>
        </div>
        <div class="field">
          <div class="label">Phone</div>
          <div class="value">{candidate_phone or 'Not provided'}</div>
        </div>
        <div class="field">
          <div class="label">Role Applied</div>
          <div class="value">{job_title}</div>
        </div>

        <p style="margin-top: 20px;">You can view and manage this application directly inside the <strong>AutoAgentHire Recruiter Portal</strong>.</p>
        
        <div class="footer">
          AutoAgentHire &bull; Autonomous Recruitment & Candidate Matching Platform
        </div>
      </div>
    </body>
    </html>
    """
    return send_email(recruiter_email, subject, html)


def send_recruiter_welcome_email(
    recruiter_email: str,
    recruiter_name: str,
    custom_user_id: str,
    company_name: str,
    temp_password: Optional[str] = None,
) -> bool:
    """Send welcome email with User ID when an Authorizer creates/approves a recruiter."""
    subject = f"Your AutoAgentHire Recruiter Account has been created (Recruiter ID: {custom_user_id})"
    pwd_section = ""
    if temp_password:
        pwd_section = f"""
        <div class="field">
          <div class="label">Temporary Password</div>
          <div class="value" style="font-family: monospace; font-size: 16px; color: #a855f7;">{temp_password}</div>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
        .card {{ background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 24px; max-width: 600px; margin: 0 auto; }}
        .header {{ border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; }}
        .title {{ font-size: 20px; font-weight: bold; color: #a855f7; margin: 0; }}
        .field {{ margin-bottom: 14px; }}
        .label {{ font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 600; }}
        .value {{ font-size: 15px; color: #f1f5f9; font-weight: 500; margin-top: 4px; }}
        .badge {{ display: inline-block; padding: 4px 10px; border-radius: 6px; background-color: #9333ea; color: white; font-size: 12px; font-weight: 600; }}
        .footer {{ margin-top: 24px; border-top: 1px solid #334155; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="badge">Authorizer Action</div>
          <h2 class="title" style="margin-top: 10px;">Welcome to AutoAgentHire Recruiter Portal</h2>
        </div>
        <p>Hello <strong>{recruiter_name or 'Recruiter'}</strong>,</p>
        <p>An official Recruiter account for <strong>{company_name}</strong> has been created and approved by the Platform Authorizer.</p>
        
        <div class="field">
          <div class="label">Assigned Recruiter ID</div>
          <div class="value" style="font-family: monospace; font-size: 18px; color: #38bdf8; font-weight: bold;">{custom_user_id}</div>
        </div>
        <div class="field">
          <div class="label">Login Email</div>
          <div class="value">{recruiter_email}</div>
        </div>
        {pwd_section}

        <p style="margin-top: 20px;">You can now log in at the portal using either your <strong>Recruiter ID ({custom_user_id})</strong> or your registered email address.</p>

        <div class="footer">
          AutoAgentHire Platform &bull; Authorized Recruiter Access
        </div>
      </div>
    </body>
    </html>
    """
    return send_email(recruiter_email, subject, html)


def send_email_change_verification_code(
    to_email: str,
    user_name: Optional[str],
    user_role: str,
    verification_code: str,
    expires_in_minutes: int = 15,
) -> bool:
    """Send official verification code when Authorizer or Recruiter requests an email change."""
    role_display = "Platform Authorizer" if user_role == "authorizer" else "Corporate Recruiter"
    subject = f"AutoAgentHire: Official Email Verification Code ({verification_code})"
    
    name_display = (user_name or "").strip() or f"Official {role_display}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 28px 16px; }}
        .card {{ background-color: #111827; border-radius: 16px; border: 1px solid #1f2937; padding: 32px 28px; max-width: 580px; margin: 0 auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }}
        .header {{ border-bottom: 1px solid #1f2937; padding-bottom: 20px; margin-bottom: 24px; text-align: center; }}
        .brand {{ font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
        .badge {{ display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 11px; font-weight: 700; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }}
        .title {{ font-size: 18px; font-weight: 700; color: #f1f5f9; margin: 16px 0 8px 0; }}
        .otp-box {{ background: #030712; border: 2px dashed #38bdf8; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }}
        .otp-code {{ font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; display: inline-block; }}
        .meta-note {{ font-size: 12px; color: #94a3b8; line-height: 1.6; margin-top: 8px; }}
        .warning-box {{ background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #fbbf24; margin: 20px 0; }}
        .footer {{ margin-top: 32px; border-top: 1px solid #1f2937; padding-top: 20px; font-size: 12px; color: #64748b; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">AutoAgentHire</div>
          <div><span class="badge">Official Security Verification</span></div>
        </div>
        
        <p style="font-size: 15px; color: #e2e8f0; margin: 0 0 12px 0;">Hello <strong>{name_display}</strong>,</p>
        
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6; margin: 0 0 16px 0;">
          A request was initiated to update your official email address on AutoAgentHire for your <strong>{role_display}</strong> account to <strong>{to_email}</strong>.
        </p>
        
        <div class="otp-box">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px;">Your 6-Digit Email Verification Code</div>
          <div class="otp-code">{verification_code}</div>
          <div class="meta-note">Valid for {expires_in_minutes} minutes &bull; Single-use security token</div>
        </div>
        
        <div class="warning-box">
          <strong>Security Advisory:</strong> Never share this verification code with anyone. AutoAgentHire officials will never ask for your code. If you did not initiate this change, please ignore this email or review your account credentials immediately.
        </div>
        
        <div class="footer">
          AutoAgentHire &bull; Autonomous Recruitment, Authorizer Governance & Security Desk<br>
          <a href="{WEBSITE_URL}" style="color: #38bdf8; text-decoration: none;">{WEBSITE_URL}</a>
        </div>
      </div>
    </body>
    </html>
    """
    
    plain_text = (
        f"AutoAgentHire Official Email Verification\n\n"
        f"Hello {name_display},\n\n"
        f"A request was initiated to update your official email address for your {role_display} account to {to_email}.\n"
        f"Your 6-Digit Verification Code: {verification_code}\n\n"
        f"This code will expire in {expires_in_minutes} minutes.\n"
        f"If you did not request this, please disregard this email.\n\n"
        f"AutoAgentHire Security Desk\n{WEBSITE_URL}\n"
    )
    
    return send_email(to_email, subject, html, plain_text)

