"""
Email System Routes for AutoAgentHire.
Provides inbound webhook processing, delivery diagnostics, and test dispatch endpoints.
"""

import hmac
import hashlib
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, Header
from pydantic import BaseModel, Field
try:
    import email_validator  # noqa: F401
    from pydantic import EmailStr
except ImportError:
    EmailStr = str  # type: ignore
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database.connection import get_db
from backend.database.models_complete import User, JobApplication, AuditLog
from backend.services.email_service import (
    validate_email_address,
    send_email,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_FROM_EMAIL,
    SMTP_ENABLED,
    RESEND_API_KEY,
    BREVO_API_KEY,
    SENDGRID_API_KEY,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/email", tags=["Email System"])
admin_email_router = APIRouter(prefix="/api/admin/email", tags=["Admin Email Diagnostics"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TestEmailRequest(BaseModel):
    recipient_email: EmailStr
    subject: Optional[str] = "AutoAgentHire — Test Email Verification"
    message: Optional[str] = None


class EmailDiagnosticsResponse(BaseModel):
    status: str
    providers: Dict[str, Any]
    default_sender: str
    inbound_webhook_configured: bool
    timestamp: str


# Cache of recently processed inbound message IDs to prevent duplicates
_PROCESSED_INBOUND_IDS = set()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sanitize_inbound_html(raw_html: str) -> str:
    """Safely strip dangerous script tags or attributes from inbound email html."""
    if not raw_html:
        return ""
    # Strip script/style tags and inline handlers
    cleaned = re.sub(r'<\s*script[^>]*>[\s\S]*?<\s*/\s*script\s*>', '', raw_html, flags=re.IGNORECASE)
    cleaned = re.sub(r'<\s*style[^>]*>[\s\S]*?<\s*/\s*style\s*>', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\bon\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'javascript\s*:', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _extract_reference_id(subject: str, text: str) -> Optional[str]:
    """Extract AutoAgentHire application reference ID pattern (e.g. AAH-APP-2026-ABC123)."""
    pattern = r'AAH-APP-\d{4}-[A-Z0-9]{4,10}'
    match = re.search(pattern, subject or "", re.IGNORECASE)
    if match:
        return match.group(0).upper()
    match = re.search(pattern, text or "", re.IGNORECASE)
    if match:
        return match.group(0).upper()
    return None


# ── 1. Inbound Email Webhook ──────────────────────────────────────────────────

@router.post("/inbound", summary="Process incoming email webhook")
async def receive_inbound_email(
    request: Request,
    db: Session = Depends(get_db),
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature"),
):
    """
    Receives and processes inbound email webhooks from providers (Resend, SendGrid Inbound Parse, Brevo).
    Validates payload integrity, checks duplicate prevention, associates with applications via
    Reference ID or candidate email, and persists communication history.
    """
    # 1. Read raw body
    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8", errors="replace")

    # 2. Signature verification if webhook secret configured
    webhook_secret = os.getenv("INBOUND_EMAIL_WEBHOOK_SECRET") or os.getenv("RESEND_WEBHOOK_SECRET")
    if webhook_secret and x_webhook_signature:
        expected = hmac.new(webhook_secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_webhook_signature):
            logger.warning("[EmailInbound] Invalid webhook signature detected")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    # 3. Parse JSON or multipart form
    sender = ""
    recipient = ""
    subject = ""
    body_text = ""
    body_html = ""
    message_id = ""

    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            data = await request.json()
            # Handle Resend inbound format or SendGrid JSON format
            sender = data.get("from") or data.get("sender") or data.get("from_email") or ""
            recipient = data.get("to") or data.get("recipient") or ""
            subject = data.get("subject") or ""
            body_text = data.get("text") or data.get("plain") or ""
            body_html = data.get("html") or ""
            message_id = data.get("message_id") or data.get("id") or ""
        except Exception as e:
            logger.warning("[EmailInbound] JSON parse failed: %s", e)
    else:
        # Form-data format (e.g. SendGrid Inbound Parse / Mailgun)
        try:
            form = await request.form()
            sender = str(form.get("from") or form.get("sender") or "")
            recipient = str(form.get("to") or form.get("recipient") or "")
            subject = str(form.get("subject") or "")
            body_text = str(form.get("text") or "")
            body_html = str(form.get("html") or "")
            message_id = str(form.get("Message-ID") or form.get("headers", {}).get("Message-ID") or "")
        except Exception as e:
            logger.warning("[EmailInbound] Form parse failed: %s", e)

    # 4. Duplicate prevention
    dedup_key = message_id or hashlib.sha256(f"{sender}:{subject}:{body_text[:100]}".encode()).hexdigest()
    if dedup_key in _PROCESSED_INBOUND_IDS:
        logger.info("[EmailInbound] Ignoring duplicate message: %s", dedup_key)
        return {"status": "ignored", "reason": "duplicate", "message_id": dedup_key}

    _PROCESSED_INBOUND_IDS.add(dedup_key)
    if len(_PROCESSED_INBOUND_IDS) > 2000:
        # Prevent unbounded set growth
        _PROCESSED_INBOUND_IDS.clear()

    # 5. Extract sender email
    sender_clean = ""
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', sender)
    if email_match:
        sender_clean = email_match.group(0).lower()

    # 6. Sanitize content
    safe_html = _sanitize_inbound_html(body_html)
    safe_text = body_text.strip()

    # 7. Identify associated Application by Reference ID or candidate email
    ref_id = _extract_reference_id(subject, safe_text)
    matched_application = None

    if ref_id:
        matched_application = db.query(JobApplication).filter(JobApplication.reference_id == ref_id).first()

    if not matched_application and sender_clean:
        # Match latest application by candidate email
        matched_application = db.query(JobApplication).filter(
            JobApplication.candidate_email.ilike(sender_clean)
        ).order_by(JobApplication.created_at.desc()).first()

    # 8. Record audit log & update application recruiter notes if matched
    audit_notes = f"Inbound email received from {sender_clean} (Subject: '{subject}')"
    if matched_application:
        audit_notes += f" matched to Application {matched_application.reference_id or matched_application.id}"
        # Append note to application recruiter notes
        timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        update_note = f"\n[{timestamp_str} Inbound Email from {sender_clean}]: {subject}\n{safe_text[:300]}"
        existing_notes = str(getattr(matched_application, "recruiter_notes", "") or "")
        new_notes = f"{existing_notes}{update_note}" if existing_notes else update_note.strip()
        setattr(matched_application, "recruiter_notes", new_notes)
        db.commit()

    logger.info("[EmailInbound] %s", audit_notes)

    return {
        "status": "processed",
        "message_id": dedup_key,
        "sender": sender_clean,
        "reference_id": ref_id,
        "matched_application_id": matched_application.id if matched_application else None,
        "matched_application_reference": matched_application.reference_id if matched_application else None,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }


# ── 2. Admin Email Diagnostics ────────────────────────────────────────────────

@router.get("/diagnostics", response_model=EmailDiagnosticsResponse, summary="Get email system diagnostics")
@admin_email_router.get("/diagnostics", response_model=EmailDiagnosticsResponse, summary="Get email diagnostics (Admin)")
def get_email_diagnostics(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Returns diagnostics on all email providers (Resend, Brevo, SendGrid, SMTP),
    configuration status, and inbound webhook state.
    """
    has_resend = bool(os.getenv("RESEND_API_KEY", RESEND_API_KEY))
    has_brevo = bool(os.getenv("BREVO_API_KEY", BREVO_API_KEY))
    has_sendgrid = bool(os.getenv("SENDGRID_API_KEY", SENDGRID_API_KEY))
    has_smtp = bool(os.getenv("SMTP_USER", SMTP_USER) and os.getenv("SMTP_PASSWORD"))

    active_provider = "none"
    if has_resend:
        active_provider = "resend"
    elif has_brevo:
        active_provider = "brevo"
    elif has_sendgrid:
        active_provider = "sendgrid"
    elif has_smtp:
        active_provider = "smtp"

    sender = os.getenv("SMTP_FROM_EMAIL", SMTP_FROM_EMAIL) or "notifications@autoagenthire.com"

    return EmailDiagnosticsResponse(
        status="healthy" if (has_resend or has_smtp or has_sendgrid or has_brevo) else "unconfigured",
        providers={
            "resend": {"configured": has_resend, "active": active_provider == "resend"},
            "smtp": {
                "configured": has_smtp,
                "host": SMTP_HOST,
                "port": SMTP_PORT,
                "tls": True,
                "user": (SMTP_USER[:3] + "***" + SMTP_USER[SMTP_USER.find("@"):]) if "@" in SMTP_USER else "configured",
                "active": active_provider == "smtp",
            },
            "brevo": {"configured": has_brevo, "active": active_provider == "brevo"},
            "sendgrid": {"configured": has_sendgrid, "active": active_provider == "sendgrid"},
        },
        default_sender=sender,
        inbound_webhook_configured=bool(os.getenv("INBOUND_EMAIL_WEBHOOK_SECRET") or os.getenv("RESEND_WEBHOOK_SECRET")),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ── 3. Test Email Dispatch ────────────────────────────────────────────────────

@router.post("/test-send", summary="Send diagnostic test email")
@admin_email_router.post("/test-send", summary="Send diagnostic test email (Admin)")
def send_test_email(
    req: TestEmailRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Sends a test verification email to verify SMTP / Resend delivery end-to-end.
    """
    target_email = req.recipient_email.strip().lower()
    if not validate_email_address(target_email):
        raise HTTPException(status_code=400, detail=f"Invalid email address: '{target_email}'")

    cur_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = req.subject or "AutoAgentHire — Test Email Verification"
    msg_body = req.message or (
        f"This is a verified delivery test from the AutoAgentHire Email Diagnostic System.\n\n"
        f"Timestamp: {cur_time}\n"
        f"Recipient: {target_email}\n"
        f"System: AutoAgentHire Production Infrastructure\n\n"
        f"If you received this message, outbound mail delivery is operating correctly."
    )

    html_content = f"""<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 28px;">
    <h2 style="color: #38bdf8; margin-top: 0;">AutoAgentHire Email Test</h2>
    <p style="color: #94a3b8; font-size: 14px;">Outbound Email System Diagnostic</p>
    <div style="background: #1e293b; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <strong style="color: #34d399;">Status: Operational</strong>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #cbd5e1;">Sent to {target_email} at {cur_time}</p>
    </div>
    <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">{msg_body.replace(chr(10), '<br>')}</p>
    <hr style="border: 0; border-top: 1px solid #1f2937; margin: 24px 0 16px 0;" />
    <p style="font-size: 12px; color: #64748b; margin: 0;">AutoAgentHire Automation Platform &bull; Diagnostic Suite</p>
  </div>
</body>
</html>"""

    success, msg_id, err = send_email(
        to_email=target_email,
        subject=subject,
        html_content=html_content,
        plain_text=msg_body,
    )

    if not success:
        logger.warning("[EmailTest] Test email delivery failed to %s: %s", target_email, err)
        return {
            "success": False,
            "message": f"Test email delivery failed: {err}",
            "recipient": target_email,
            "timestamp": cur_time,
        }

    logger.info("[EmailTest] Test email sent successfully to %s (Msg ID: %s)", target_email, msg_id)
    return {
        "success": True,
        "message": f"Test email dispatched successfully to {target_email}!",
        "message_id": msg_id,
        "recipient": target_email,
        "timestamp": cur_time,
    }
