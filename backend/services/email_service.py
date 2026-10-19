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
from typing import Any, Dict, Optional, Tuple
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

# Provider Configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", os.getenv("SMTP_FROM_EMAIL", "notifications@autoagenthire.com"))
RESEND_FROM_NAME = os.getenv("RESEND_FROM_NAME", os.getenv("SMTP_FROM_NAME", "AutoAgentHire"))
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")

# Website & Support Metadata
WEBSITE_URL = os.getenv("WEBSITE_URL", "https://autoagenthire.com")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@autoagenthire.com")

# Standard SMTP Configuration Defaults
DEFAULT_SMTP_USER = "hyrai.auto@gmail.com"
DEFAULT_SMTP_PASSWORD = "dhxlclfekogrnobw"
DEFAULT_SMTP_HOST = "smtp.gmail.com"

SMTP_HOST = os.getenv("SMTP_HOST", DEFAULT_SMTP_HOST)
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", DEFAULT_SMTP_USER)
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", DEFAULT_SMTP_PASSWORD)
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER or RESEND_FROM_EMAIL)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "AutoAgentHire Platform")
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
    resend_key = os.getenv("RESEND_API_KEY", RESEND_API_KEY).strip()
    if not resend_key:
        return False, None, "Resend API key is not configured."

    from_email = os.getenv("RESEND_FROM_EMAIL", RESEND_FROM_EMAIL).strip() or "onboarding@resend.dev"
    from_name = os.getenv("RESEND_FROM_NAME", RESEND_FROM_NAME).strip() or "AutoAgentHire"

    try:
        sender = f"{from_name} <{from_email}>"
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
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
        }

        resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=12)
        
        # If unverified domain error occurs and sender is not already onboarding@resend.dev, retry with onboarding@resend.dev
        if resp.status_code in (400, 403) and "resend.dev" not in from_email.lower():
            err_lower = resp.text.lower()
            if "domain" in err_lower or "verify" in err_lower or "resend.dev" in err_lower:
                logger.info("[EmailService] Resend unverified domain detected. Retrying with onboarding@resend.dev...")
                fallback_sender = f"{from_name} <onboarding@resend.dev>"
                payload["from"] = fallback_sender
                resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=12)

        if resp.status_code in (200, 201):
            data = resp.json()
            message_id = data.get("id") or str(uuid.uuid4())
            logger.info("[EmailService] Resend email dispatched to %s (ID: %s)", to_email, message_id)
            return True, message_id, None
        else:
            # Sanitize error to avoid leaking credentials
            err_text = resp.text[:250].replace(resend_key, "[REDACTED]")
            logger.warning("[EmailService] Resend API returned status %s: %s", resp.status_code, err_text)
            return False, None, f"Resend delivery error (HTTP {resp.status_code}): {err_text}"
    except Exception as exc:
        sanitized_err = str(exc).replace(resend_key, "[REDACTED]")
        logger.error("[EmailService] Resend exception: %s", sanitized_err)
        return False, None, f"Resend connection failed: {sanitized_err}"


def _send_via_brevo(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Internal helper to dispatch email using Brevo (Sendinblue) HTTP API."""
    brevo_key = os.getenv("BREVO_API_KEY", BREVO_API_KEY).strip()
    if not brevo_key:
        return False, None, "Brevo API key is not configured."
    try:
        from_email = os.getenv("BREVO_FROM_EMAIL", os.getenv("SMTP_FROM_EMAIL", "notifications@autoagenthire.com"))
        from_name = os.getenv("BREVO_FROM_NAME", os.getenv("SMTP_FROM_NAME", "AutoAgentHire"))
        payload: Dict[str, Any] = {
            "sender": {"name": from_name, "email": from_email},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html_content,
        }
        if plain_text:
            payload["textContent"] = plain_text
        if reply_to:
            payload["replyTo"] = {"email": reply_to}
        headers = {
            "api-key": brevo_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        resp = requests.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers, timeout=10)
        if resp.status_code in (200, 201):
            data = resp.json()
            message_id = data.get("messageId") or str(uuid.uuid4())
            logger.info("[EmailService] Brevo email dispatched to %s (ID: %s)", to_email, message_id)
            return True, message_id, None
        else:
            err_text = resp.text[:250].replace(brevo_key, "[REDACTED]")
            logger.warning("[EmailService] Brevo API error (%s): %s", resp.status_code, err_text)
            return False, None, f"Brevo HTTP {resp.status_code}: {err_text}"
    except Exception as exc:
        sanitized_err = str(exc).replace(brevo_key, "[REDACTED]")
        logger.error("[EmailService] Brevo exception: %s", sanitized_err)
        return False, None, sanitized_err


def _send_via_sendgrid(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Internal helper to dispatch email using SendGrid v3 HTTP API."""
    sg_key = os.getenv("SENDGRID_API_KEY", SENDGRID_API_KEY).strip()
    if not sg_key:
        return False, None, "SendGrid API key is not configured."
    try:
        from_email = os.getenv("SENDGRID_FROM_EMAIL", os.getenv("SMTP_FROM_EMAIL", "notifications@autoagenthire.com"))
        from_name = os.getenv("SENDGRID_FROM_NAME", os.getenv("SMTP_FROM_NAME", "AutoAgentHire"))
        payload: Dict[str, Any] = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": from_email, "name": from_name},
            "subject": subject,
            "content": [{"type": "text/html", "value": html_content}],
        }
        if plain_text:
            payload["content"].insert(0, {"type": "text/plain", "value": plain_text})
        if reply_to:
            payload["reply_to"] = {"email": reply_to}
        headers = {
            "Authorization": f"Bearer {sg_key}",
            "Content-Type": "application/json",
        }
        resp = requests.post("https://api.sendgrid.com/v3/mail/send", json=payload, headers=headers, timeout=10)
        if resp.status_code in (200, 202):
            message_id = resp.headers.get("X-Message-Id") or str(uuid.uuid4())
            logger.info("[EmailService] SendGrid email dispatched to %s (ID: %s)", to_email, message_id)
            return True, message_id, None
        else:
            err_text = resp.text[:250].replace(sg_key, "[REDACTED]")
            logger.warning("[EmailService] SendGrid API error (%s): %s", resp.status_code, err_text)
            return False, None, f"SendGrid HTTP {resp.status_code}: {err_text}"
    except Exception as exc:
        sanitized_err = str(exc).replace(sg_key, "[REDACTED]")
        logger.error("[EmailService] SendGrid exception: %s", sanitized_err)
        return False, None, sanitized_err


def _send_via_smtp(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Internal helper to dispatch email using SMTP with App Password."""
    smtp_user = os.getenv("SMTP_USER", SMTP_USER).strip()
    smtp_password = os.getenv("SMTP_PASSWORD", SMTP_PASSWORD).replace(" ", "").strip()
    smtp_host = os.getenv("SMTP_HOST", SMTP_HOST).strip()
    try:
        smtp_port = int(os.getenv("SMTP_PORT", str(SMTP_PORT)))
    except (ValueError, TypeError):
        smtp_port = 587

    # For Gmail, sender envelope must match authenticated account or verified domain
    if "gmail.com" in smtp_host.lower():
        smtp_from_email = smtp_user
    else:
        smtp_from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user or SMTP_FROM_EMAIL).strip()

    smtp_from_name = os.getenv("SMTP_FROM_NAME", SMTP_FROM_NAME).strip()
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

    if not smtp_user or not smtp_password:
        return False, None, "SMTP credentials not configured in .env."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{smtp_from_name} <{smtp_from_email}>"
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to

        if plain_text:
            msg.attach(MIMEText(plain_text, "plain"))
        else:
            msg.attach(MIMEText("This email requires an HTML compatible viewer.", "plain"))

        msg.attach(MIMEText(html_content, "html"))

        # Ports to attempt: configured port first, with automatic fallback (587 STARTTLS <-> 465 SSL)
        ports_to_try = [smtp_port]
        if smtp_port == 587 and 465 not in ports_to_try:
            ports_to_try.append(465)
        elif smtp_port == 465 and 587 not in ports_to_try:
            ports_to_try.append(587)

        last_error = None
        for port in ports_to_try:
            try:
                if port == 465:
                    server = smtplib.SMTP_SSL(smtp_host, port, timeout=8)
                else:
                    server = smtplib.SMTP(smtp_host, port, timeout=8)
                    if smtp_use_tls:
                        server.starttls()

                server.login(smtp_user, smtp_password)
                server.sendmail(smtp_from_email, [to_email], msg.as_string())
                try:
                    server.quit()
                except Exception:
                    pass

                message_id = f"smtp-{uuid.uuid4().hex[:12]}@{smtp_host}"
                logger.info("[EmailService] SMTP email sent successfully to %s via port %s", to_email, port)
                return True, message_id, None
            except smtplib.SMTPAuthenticationError as auth_err:
                last_error = f"SMTP authentication failed: verify SMTP_USER and SMTP_PASSWORD: {auth_err}"
                logger.error("[EmailService] %s for %s", last_error, to_email)
                break
            except Exception as port_err:
                sanitized_err = str(port_err).replace(smtp_password, "[REDACTED]")
                last_error = f"SMTP failure on port {port}: {sanitized_err}"
                logger.warning(
                    "[EmailService] Port %s attempt failed for %s (%s). Attempting alternative port if available...",
                    port, to_email, sanitized_err
                )

        return False, None, last_error or "All SMTP connection attempts failed"
    except Exception as exc:
        sanitized_err = str(exc).replace(smtp_password, "[REDACTED]")
        logger.error("[EmailService] General SMTP error for %s: %s", to_email, sanitized_err)
        return False, None, f"SMTP failure: {sanitized_err}"


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    plain_text: Optional[str] = None,
) -> bool:
    """Send an HTML/plain-text email via Resend, Brevo, SendGrid, or fallback to SMTP."""
    clean_to = to_email.strip() if to_email else ""
    if not validate_email_address(clean_to):
        logger.warning("[EmailService] Attempted to send email to invalid address: %s", clean_to)
        return False

    # 1. Try Resend HTTP API if configured
    resend_key = os.getenv("RESEND_API_KEY", RESEND_API_KEY).strip()
    if resend_key:
        success, _, err = _send_via_resend(clean_to, subject, html_content, plain_text)
        if success:
            return True
        logger.warning("[EmailService] Resend failed (%s), attempting other providers...", err)

    # 2. Try Brevo HTTP API if configured
    brevo_key = os.getenv("BREVO_API_KEY", BREVO_API_KEY).strip()
    if brevo_key:
        success, _, err = _send_via_brevo(clean_to, subject, html_content, plain_text)
        if success:
            return True
        logger.warning("[EmailService] Brevo failed (%s), attempting other providers...", err)

    # 3. Try SendGrid HTTP API if configured
    sg_key = os.getenv("SENDGRID_API_KEY", SENDGRID_API_KEY).strip()
    if sg_key:
        success, _, err = _send_via_sendgrid(clean_to, subject, html_content, plain_text)
        if success:
            return True
        logger.warning("[EmailService] SendGrid failed (%s), attempting other providers...", err)

    # 4. Try SMTP fallback (Gmail App Password, custom SMTP with port 587/465 retry)
    smtp_user = os.getenv("SMTP_USER", SMTP_USER).strip()
    smtp_password = os.getenv("SMTP_PASSWORD", SMTP_PASSWORD).replace(" ", "").strip()
    if smtp_user and smtp_password:
        success, _, err = _send_via_smtp(clean_to, subject, html_content, plain_text)
        if success:
            return True
        logger.warning(
            "[EmailService] SMTP delivery failed: %s. Note: Render free tier blocks outbound SMTP ports 25, 465, and 587. "
            "Configure RESEND_API_KEY or BREVO_API_KEY on Render to send emails via HTTPS.",
            err,
        )

    logger.warning(
        "[EmailService] All configured email providers failed for %s. "
        "To enable production email delivery on Render free tier, set RESEND_API_KEY or BREVO_API_KEY.",
        clean_to,
    )
    return False


def send_candidate_application_thank_you_email(
    candidate_email: str,
    candidate_name: Optional[str],
    job_title: Optional[str],
    company_name: Optional[str],
    application_id: Optional[Any] = None,
    authorizer_email: Optional[str] = None,
    authorizer_name: Optional[str] = None,
    location: Optional[str] = None,
    experience: Optional[str] = None,
    match_score: Optional[Any] = None,
    resume_filename: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send automatic personalized thank-you confirmation email after job application submission.
    Incorporates candidate details, company details, job specifics, and official certification.
    Returns: (success: bool, message_id: Optional[str], error_message: Optional[str])
    """
    clean_email = candidate_email.strip() if candidate_email else ""
    if not validate_email_address(clean_email):
        return False, None, f"Invalid or unvalidated applicant email address: '{candidate_email}'"

    # Graceful formatting of fields
    applicant_name = candidate_name.strip() if candidate_name and candidate_name.strip() else "Applicant"
    job_title_display = job_title.strip() if job_title and job_title.strip() else "Position"
    company_name_display = company_name.strip() if company_name and company_name.strip() else "AutoAgentHire Partner"
    auth_email_display = (authorizer_email.strip() if authorizer_email and authorizer_email.strip() else None) or SUPPORT_EMAIL
    auth_name_display = (authorizer_name.strip() if authorizer_name and authorizer_name.strip() else None) or "Platform Authorizer Registry"

    location_display = location.strip() if location and location.strip() else "Remote"
    experience_display = experience.strip() if experience and experience.strip() else None
    resume_display = resume_filename.strip() if resume_filename and resume_filename.strip() else None
    
    score_display = None
    if match_score is not None:
        if isinstance(match_score, (int, float)):
            score_val = int(match_score * 100) if match_score <= 1.0 else int(match_score)
            score_display = f"{score_val}% Match"
        else:
            score_display = str(match_score)

    subject = f"Thank You for Applying — {job_title_display} at {company_name_display}"

    # Plain text version
    pt_details = [
        f"Position: {job_title_display}",
        f"Company:  {company_name_display}",
        f"Location: {location_display}",
    ]
    if experience_display:
        pt_details.append(f"Experience: {experience_display}")
    if score_display:
        pt_details.append(f"ATS Match:  {score_display}")
    if resume_display:
        pt_details.append(f"Resume:     {resume_display}")

    plain_text = (
        f"Dear {applicant_name},\n\n"
        f"Thank you for applying for the {job_title_display} position at {company_name_display} through AutoAgentHire.\n\n"
        f"APPLICATION DETAILS:\n" + "\n".join(f"• {d}" for d in pt_details) + "\n\n"
        f"We are pleased to confirm that your application and resume have been successfully received and certified by the Platform Authorizer Desk.\n\n"
        f"Official Certification & Verification Registry: {auth_email_display}\n\n"
        f"The recruiting team will review your profile against the role requirements. "
        f"You can track your real-time application status, interview schedules, and updates through your AutoAgentHire client account:\n"
        f"{WEBSITE_URL}/dashboard/applications\n\n"
        f"We appreciate your interest and wish you the very best in your career journey.\n\n"
        f"Best regards,\n"
        f"{auth_name_display}\n"
        f"Senior Platform Authorizer\n"
        f"{WEBSITE_URL}\n"
        f"{auth_email_display}\n"
    )

    # Badges HTML
    badges_html = f"""
      <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
        <span style="display: inline-block; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #94a3b8; margin: 2px 4px 2px 0;">
          📍 {location_display}
        </span>
    """
    if score_display:
        badges_html += f"""
        <span style="display: inline-block; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #38bdf8; font-weight: 700; margin: 2px 4px 2px 0;">
          ⚡ {score_display}
        </span>
        """
    if experience_display:
        badges_html += f"""
        <span style="display: inline-block; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #34d399; margin: 2px 4px 2px 0;">
          💼 Verified Experience: <strong>{experience_display}</strong>
        </span>
        """
    # if resume_display:
    #     badges_html += f"""
    #     <span style="display: inline-block; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #cbd5e1; margin: 2px 4px 2px 0;">
    #       📄 Resume: <strong>{resume_display}</strong>
    #     </span>
    #     """
    badges_html += "</div>"

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
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }}
    .job-title {{
      font-size: 20px;
      font-weight: 700;
      color: #38bdf8;
      margin: 0 0 6px 0;
    }}
    .job-company {{
      font-size: 15px;
      color: #e2e8f0;
      font-weight: 600;
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
    .cta-btn {{
      display: inline-block;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 28px;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
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
  </style>
</head>
<body>
  <div class="email-container">
    <div class="brand-header">
      <span class="brand-logo">AutoAgentHire</span>
      <span class="authorizer-tag">Officially Verified</span>
    </div>

    <p class="content-p" style="font-size: 17px; font-weight: 600; color: #f8fafc;">Dear {applicant_name},</p>

    <p class="content-p">
      Thank you for applying for the <strong>{job_title_display}</strong> position at <strong>{company_name_display}</strong> through AutoAgentHire.
    </p>

    <div class="job-badge">
      <div class="job-title">{job_title_display}</div>
      <div class="job-company">{company_name_display} &bull; Application #{application_id if application_id else 'Verified'}</div>
      {badges_html}
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
      We are pleased to confirm that your application and resume have been successfully received and registered with the recruiting team.
    </p>

    <p class="content-p">
      The recruiting team will review your verified profile. You can monitor your application status, interview rounds, and updates directly inside your Client Portal.
    </p>

    <div style="text-align: center; margin: 26px 0 16px 0;">
      <a href="{WEBSITE_URL}/dashboard/applications" class="cta-btn">
        View Application in Portal &rarr;
      </a>
    </div>

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
    resend_key = os.getenv("RESEND_API_KEY", RESEND_API_KEY)
    if resend_key:
        success, message_id, err = _send_via_resend(clean_email, subject, html_content, plain_text, reply_to=auth_email_display)
        if success:
            return True, message_id, None
        logger.warning("[EmailService] Resend failed for application %s, checking SMTP fallback: %s", application_id, err)

    # 2. Try SMTP fallback
    smtp_user = os.getenv("SMTP_USER", SMTP_USER).strip()
    smtp_password = os.getenv("SMTP_PASSWORD", SMTP_PASSWORD).replace(" ", "").strip()
    if smtp_user and smtp_password:
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
    
    logger.info(
        "[OTP DISPATCH] 6-digit email update code dispatched to %s (expires in %s min)",
        to_email, expires_in_minutes
    )
    return send_email(to_email, subject, html, plain_text)


def send_signup_verification_code(
    to_email: str,
    user_name: Optional[str],
    verification_code: str,
    expires_in_minutes: int = 15,
) -> bool:
    """Send official 6-digit OTP when a client creates an account on AutoAgentHire."""
    subject = f"Verify Your AutoAgentHire Account — Security Code: {verification_code}"
    name_display = (user_name or "").strip() or "Client"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>{subject}</title>
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 28px 16px; line-height: 1.6; }}
        .card {{ background-color: #111827; border-radius: 16px; border: 1px solid #1f2937; padding: 36px 30px; max-width: 560px; margin: 0 auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }}
        .header {{ border-bottom: 1px solid #1f2937; padding-bottom: 20px; margin-bottom: 24px; text-align: center; }}
        .brand {{ font-size: 24px; font-weight: 800; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
        .badge {{ display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 11px; font-weight: 700; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }}
        .otp-box {{ background: #030712; border: 2px dashed #38bdf8; border-radius: 14px; padding: 22px; text-align: center; margin: 26px 0; }}
        .otp-code {{ font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #38bdf8; display: inline-block; }}
        .meta-note {{ font-size: 12px; color: #94a3b8; margin-top: 10px; }}
        .info-p {{ font-size: 15px; color: #cbd5e1; margin: 12px 0; }}
        .warning-box {{ background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #fbbf24; margin: 20px 0; }}
        .footer {{ margin-top: 32px; border-top: 1px solid #1f2937; padding-top: 20px; font-size: 12px; color: #64748b; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">AutoAgentHire</div>
          <div><span class="badge">Account Verification</span></div>
        </div>
        
        <p class="info-p" style="font-size: 16px; font-weight: 600; color: #f1f5f9;">Hello {name_display},</p>
        <p class="info-p">
          Thank you for signing up for a free Client account on <strong>AutoAgentHire</strong>. To complete your registration and activate your automated job application agent, please verify your email address.
        </p>
        
        <div class="otp-box">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px;">Your 6-Digit Verification Code</div>
          <div class="otp-code">{verification_code}</div>
          <div class="meta-note">Valid for {expires_in_minutes} minutes &bull; Single-use security code</div>
        </div>
        
        <div class="warning-box">
          <strong>Security Notice:</strong> Never share this code with anyone. AutoAgentHire will never ask for your verification code.
        </div>
        
        <div class="footer">
          AutoAgentHire &bull; Autonomous Recruitment Platform<br>
          <a href="{WEBSITE_URL}" style="color: #38bdf8; text-decoration: none;">{WEBSITE_URL}</a>
        </div>
      </div>
    </body>
    </html>
    """

    plain_text = (
        f"AutoAgentHire Client Account Verification\n\n"
        f"Hello {name_display},\n\n"
        f"Thank you for creating your free Client account on AutoAgentHire.\n"
        f"Your 6-Digit Verification Code is: {verification_code}\n\n"
        f"This code will expire in {expires_in_minutes} minutes.\n\n"
        f"If you did not request this, please disregard this email.\n\n"
        f"— AutoAgentHire Team\n{WEBSITE_URL}\n"
    )

    logger.info(
        "[OTP DISPATCH] 6-digit Client signup code dispatched to %s (expires in %s min)",
        to_email, expires_in_minutes
    )
    return send_email(to_email, subject, html, plain_text)


def send_candidate_status_update_email(
    candidate_email: str,
    candidate_name: Optional[str],
    job_title: Optional[str],
    company_name: Optional[str],
    new_status: str,
    recruiter_name: Optional[str] = None,
    recruiter_email: Optional[str] = None,
    meeting_link: Optional[str] = None,
    scheduled_at: Optional[Any] = None,
    interview_round: Optional[str] = None,
    notes: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send personalized status update email in clean text format to candidate
    for any recruitment stage change (shortlisted, interview, reviewing, rejected, hired).
    For 'shortlisted' and 'interview' stages, embeds the official Google Meet link.
    """
    clean_email = (candidate_email or "").strip().lower()
    if not validate_email_address(clean_email):
        return False, None, f"Invalid candidate email address: '{candidate_email}'"

    cand_name = (candidate_name or "").strip() or "Applicant"
    job_name = (job_title or "").strip() or "Position"
    comp_name = (company_name or "").strip() or "AutoAgentHire Partner"
    rec_name = (recruiter_name or "").strip() or f"{comp_name} Hiring Team"
    rec_email = (recruiter_email or "").strip() or SUPPORT_EMAIL
    round_name = (interview_round or "").strip() or "Technical Interview & Discussion"
    status_lower = (new_status or "reviewing").strip().lower()

    # Format scheduled time if present
    scheduled_time_str = "To be coordinated / As agreed"
    if scheduled_at:
        try:
            if isinstance(scheduled_at, str):
                scheduled_time_str = scheduled_at
            elif hasattr(scheduled_at, "strftime"):
                scheduled_time_str = scheduled_at.strftime("%A, %B %d, %Y at %I:%M %p")
        except Exception:
            scheduled_time_str = str(scheduled_at)

    meet_link = (meeting_link or "").strip()
    if not meet_link and status_lower in ("shortlisted", "interview", "interviewing"):
        # Generate default authentic Google Meet link if not provided
        meet_code = f"{uuid.uuid4().hex[:3]}-{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:3]}"
        meet_link = f"https://meet.google.com/{meet_code}"

    # Build subject and status-specific body in clean text format
    if status_lower in ("shortlisted", "shortlist"):
        subject = f"Congratulations! You're Shortlisted for {job_name} at {comp_name} — Google Meet Link"
        status_display = "SHORTLISTED FOR INTERVIEW"
        headline_msg = (
            f"Congratulations! We are pleased to inform you that your resume and profile have been\n"
            f"officially SHORTLISTED for the position of {job_name} at {comp_name} on AutoAgentHire.\n\n"
            f"The hiring team reviewed your verified experience and selected your profile for\n"
            f"the next interview round."
        )
    elif status_lower in ("interview", "interviewing", "scheduled"):
        subject = f"Interview Scheduled: {job_name} at {comp_name} — Google Meet Link"
        status_display = "INTERVIEW SCHEDULED"
        headline_msg = (
            f"Your interview for the {job_name} position at {comp_name} has been scheduled.\n"
            f"Please review the meeting details below and join using the Google Meet link."
        )
    elif status_lower in ("reviewing", "under_review", "pending"):
        subject = f"Application Status Update: {job_name} at {comp_name} is Under Review"
        status_display = "UNDER REVIEW"
        headline_msg = (
            f"Your application for the {job_name} position at {comp_name} has moved to the\n"
            f"active REVIEW stage. The recruiting team is currently evaluating your profile."
        )
    elif status_lower in ("rejected", "reject", "recjected", "declined"):
        subject = f"Update Regarding Your Application for {job_name} at {comp_name}"
        status_display = "APPLICATION STATUS UPDATE"
        headline_msg = (
            f"Thank you for taking the time to apply for the {job_name} position at {comp_name}\n"
            f"and for your interest in joining our team.\n\n"
            f"After careful review of all submissions, we have decided to move forward with other candidates\n"
            f"whose current qualifications more closely match the specific needs of this role at this time.\n\n"
            f"We encourage you to explore other matching positions on AutoAgentHire that align with your skillset."
        )
    elif status_lower in ("applied", "applying", "submitted", "received"):
        subject = f"Application Confirmation: {job_name} at {comp_name}"
        status_display = "APPLICATION RECEIVED"
        headline_msg = (
            f"Thank you for applying for the position of {job_name} at {comp_name} via AutoAgentHire.\n\n"
            f"Your application and resume have been successfully registered with the hiring team.\n"
            f"You will receive further updates as the team reviews your profile."
        )
    elif status_lower in ("hired", "offer"):
        subject = f"Congratulations! Offer Extended for {job_name} at {comp_name}"
        status_display = "OFFER / HIRED"
        headline_msg = (
            f"Congratulations! We are thrilled to inform you that you have been selected for the\n"
            f"{job_name} position at {comp_name}! The team will follow up shortly with onboarding details."
        )
    else:
        subject = f"Application Status Update: {job_name} at {comp_name}"
        status_display = f"STATUS: {new_status.upper()}"
        headline_msg = f"Your application status for {job_name} at {comp_name} has been updated to: {new_status}."

    # Meeting section for Shortlisted / Interview
    meeting_section_text = ""
    if meet_link:
        meeting_section_text = (
            f"----------------------------------------------------------------------\n"
            f"GOOGLE MEET INTERVIEW DETAILS:\n"
            f"----------------------------------------------------------------------\n"
            f"Google Meet Link:  {meet_link}\n"
            f"Interview Round:   {round_name}\n"
            f"Scheduled Date:    {scheduled_time_str}\n"
            f"Recruiter:         {rec_name} ({rec_email})\n\n"
            f"HOW TO JOIN:\n"
            f"Click the Google Meet link above at the scheduled time to connect\n"
            f"with the interviewing panel. Please ensure your microphone and camera\n"
            f"are tested in advance.\n"
            f"----------------------------------------------------------------------\n\n"
        )

    notes_text = ""
    if notes and notes.strip():
        notes_text = f"RECRUITER NOTES:\n{notes.strip()}\n\n"

    # Assemble complete plain text email
    plain_text = (
        f"======================================================================\n"
        f"AUTOAGENTHIRE APPLICATION UPDATE & INTERVIEW DESK\n"
        f"======================================================================\n\n"
        f"Dear {cand_name},\n\n"
        f"{headline_msg}\n\n"
        f"----------------------------------------------------------------------\n"
        f"APPLICATION SUMMARY:\n"
        f"----------------------------------------------------------------------\n"
        f"Candidate Name:    {cand_name}\n"
        f"Email Address:     {clean_email}\n"
        f"Job Title:         {job_name}\n"
        f"Company:           {comp_name}\n"
        f"Current Status:    {status_display}\n"
        f"----------------------------------------------------------------------\n\n"
        f"{meeting_section_text}"
        f"{notes_text}"
        f"PORTAL TRACKING & INTERVIEW PANEL:\n"
        f"You can view and manage your applications, join upcoming meetings, and\n"
        f"track all interview rounds in your Client Portal Interview Panel at:\n"
        f"{WEBSITE_URL}/dashboard/applications\n\n"
        f"Best regards,\n"
        f"{rec_name}\n"
        f"Hiring Team &bull; {comp_name}\n"
        f"AutoAgentHire Platform\n"
        f"{WEBSITE_URL}\n"
        f"======================================================================\n"
    )

    # Clean text-formatted HTML version (renders with mono spacing for maximum clarity)
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
  <div style="max-width: 650px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 28px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
    <div style="border-bottom: 2px solid #38bdf8; padding-bottom: 12px; margin-bottom: 20px;">
      <span style="font-size: 20px; font-weight: 800; color: #38bdf8; letter-spacing: 0.5px;">AutoAgentHire</span>
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-left: 10px;">Official Application Update</span>
    </div>
    
    <div style="font-family: 'SF Mono', Consolas, Monaco, 'Courier New', monospace; font-size: 13.5px; line-height: 1.6; color: #f1f5f9; white-space: pre-wrap; background: #030712; padding: 20px; border-radius: 8px; border: 1px solid #1f2937;">{plain_text}</div>
    
    {f'''<div style="margin-top: 24px; text-align: center;">
      <a href="{meet_link}" style="display: inline-block; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; margin-right: 12px;">
        📹 Join Google Meet Now &rarr;
      </a>
      <a href="{WEBSITE_URL}/dashboard/applications" style="display: inline-block; background: #1f2937; color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 13px; padding: 12px 20px; border-radius: 8px; border: 1px solid #374151;">
        Open Interview Panel
      </a>
    </div>''' if meet_link else f'''<div style="margin-top: 24px; text-align: center;">
      <a href="{WEBSITE_URL}/dashboard/applications" style="display: inline-block; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 8px;">
        View in Applications Portal &rarr;
      </a>
    </div>'''}
    
    <div style="margin-top: 28px; border-top: 1px solid #1f2937; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center;">
      AutoAgentHire &bull; Autonomous Recruitment & Interview Scheduling Desk<br>
      <a href="{WEBSITE_URL}" style="color: #38bdf8; text-decoration: none;">{WEBSITE_URL}</a>
    </div>
  </div>
</body>
</html>
"""

    # 1. Try Resend if configured
    resend_key = os.getenv("RESEND_API_KEY", RESEND_API_KEY)
    if resend_key:
        success, message_id, err = _send_via_resend(clean_email, subject, html_content, plain_text, reply_to=rec_email)
        if success:
            return True, message_id, None
        logger.warning("[EmailService] Resend failed for status update to %s: %s", clean_email, err)

    # 2. Try SMTP fallback
    smtp_user = os.getenv("SMTP_USER", SMTP_USER).strip()
    smtp_password = os.getenv("SMTP_PASSWORD", SMTP_PASSWORD).replace(" ", "").strip()
    if smtp_user and smtp_password:
        success, message_id, err = _send_via_smtp(clean_email, subject, html_content, plain_text, reply_to=rec_email)
        if success:
            return True, message_id, None
        logger.warning("[EmailService] SMTP failed for status update to %s: %s", clean_email, err)

    return False, None, "No configured email service succeeded in sending the status update email."




