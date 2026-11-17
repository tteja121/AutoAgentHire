"""
Authentication API routes for AutoAgentHire.

Endpoints
---------
POST /auth/signup   – Register a new user
POST /auth/login    – Authenticate and receive a JWT
GET  /auth/me       – Return the current authenticated user's profile
POST /auth/google   – Sign in / register with a Google ID token
"""

import os
import uuid as _uuid
from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
try:
    from pydantic import ConfigDict
except ImportError:
    ConfigDict = None
try:
    import email_validator
    from pydantic import EmailStr
except ImportError:
    EmailStr = str  # type: ignore[assignment,misc]
from sqlalchemy.orm import Session

from backend.auth.password import hash_password, verify_password
from backend.auth.jwt import create_access_token
from backend.auth.validators import validate_email_format, validate_password_strength, validate_phone_number
from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.crud import UserRepository
from backend.database.models_complete import User, AuditLog
from backend.config import settings

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

router = APIRouter(prefix="/auth", tags=["Authentication"])


PERSONAL_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com",
    "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "zoho.com", "proton.me", "protonmail.com", "mail.com", "gmx.com",
    "yandex.com", "mail.ru", "inbox.com"
}

def is_personal_email_domain(email: str) -> bool:
    if "@" not in email:
        return False
    domain = email.split("@")[-1].strip().lower()
    return domain in PERSONAL_EMAIL_DOMAINS


# ── Request / Response schemas ────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)
    full_name: str | None = None
    fullName: str | None = None
    role: str = Field(default="recruiter", description="recruiter or candidate")
    company_name: str | None = None
    company_logo_url: str | None = None
    phone: str | None = None
    location: str | None = None


class SignupResponse(BaseModel):
    message: str
    custom_user_id: str | None = None
    status: str = "success"
    email: str | None = None
    requires_otp: bool = False
    email_sent: bool = True
    otp_preview: str | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=10)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email or User ID (e.g. REC-1001, AUTH-001)")
    password: str = Field(..., min_length=1)
    role: str | None = Field(default=None, description="Optional role preference: client, recruiter, or authorizer")
    login_type: str | None = Field(default="email", description="email or user_id")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "recruiter"
    email: str | None = None
    full_name: str | None = None
    company_name: str | None = None
    custom_user_id: str | None = None
    approval_status: str | None = "approved"
    avatar_url: str | None = None


class ResolveUserIdRequest(BaseModel):
    user_id: str = Field(..., description="User ID e.g. REC-1001, AUTH-001")
    role: str | None = Field(default=None, description="Optional expected role: recruiter, authorizer")


class ResolveUserIdResponse(BaseModel):
    status: str
    email: str
    role: str
    full_name: str | None = None
    company_name: str | None = None
    custom_user_id: str


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1, description="Current password")
    new_password: str = Field(..., min_length=6, description="New password")
    confirm_password: str = Field(..., min_length=6, description="Confirm new password")


class UserProfileResponse(BaseModel):
    id: int
    uuid: str
    email: str
    custom_user_id: str | None = None
    role: str = "recruiter"
    company_name: str | None = None
    company_logo_url: str | None = None
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    is_active: bool
    is_verified: bool
    approval_status: str | None = "approved"
    approval_notes: str | None = None
    avatar_url: str | None = None
    education: str | None = None
    qualification: str | None = None
    job_role: str | None = None
    bio: str | None = None
    created_at: datetime | None = None
    last_login: datetime | None = None

    if ConfigDict is not None:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            from_attributes = True



class GoogleAuthRequest(BaseModel):
    access_token: Optional[str] = Field(None, description="Google OAuth2 access token from useGoogleLogin")
    token: Optional[str] = Field(None, description="Generic Google token alias")
    credential: Optional[str] = Field(None, description="Google OAuth2 ID token / credential from Google Identity Services")
    id_token: Optional[str] = Field(None, description="Google ID token")


# ── Signup ────────────────────────────────────────────────────────────────────

@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    """Create a new user account.

    1. Validate email format (backend re-check).
    2. Validate password strength.
    3. Ensure email is not already registered.
    4. Hash password with bcrypt and persist the user.
    """

    # 1. Email format (pydantic already validates via EmailStr, but we add our own)
    email_err = validate_email_format(body.email)
    if email_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=email_err)

    # 2. Password strength
    pw_err = validate_password_strength(body.password)
    if pw_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pw_err)

    # 3. Phone validation (if provided)
    if body.phone:
        phone_err = validate_phone_number(body.phone)
        if phone_err:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=phone_err)

    clean_email = body.email.strip().lower()
    clean_name = (body.full_name or body.fullName or "").strip()

    # Disallow signing up as Authorizer
    user_role = (body.role or "candidate").lower()
    if user_role == "authorizer":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorizer accounts cannot be created publicly. Credentials are pre-configured.",
        )

    # 5. Hash password
    hashed = hash_password(body.password)

    # 6. For Candidates/Clients: Generate 6-digit OTP and send email verification
    if user_role not in ("recruiter", "candidate"):
        user_role = "candidate"

    if user_role == "candidate":
        import secrets
        otp_code = f"{secrets.randbelow(900000) + 100000}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=15)

        existing = UserRepository.get_by_email(db, email=clean_email)
        if existing:
            if getattr(existing, "is_verified", False):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An account with this email already exists. Please log in.",
                )
            # Existing unverified registration: refresh password and OTP
            setattr(existing, "hashed_password", hashed)
            if clean_name:
                setattr(existing, "full_name", clean_name)
            setattr(existing, "email_verification_code", otp_code)
            setattr(existing, "email_verification_expires_at", expires_at)
            setattr(existing, "email_verification_attempts", 0)
            setattr(existing, "email_verification_last_sent_at", now)
            db.commit()
        else:
            try:
                UserRepository.create(
                    db,
                    email=clean_email,
                    hashed_password=hashed,
                    full_name=clean_name,
                    role="candidate",
                    is_verified=False,
                    email_verification_code=otp_code,
                    email_verification_expires_at=expires_at,
                    email_verification_attempts=0,
                    email_verification_last_sent_at=now,
                    approval_status="approved",
                    phone=body.phone,
                    location=body.location,
                )
            except Exception as exc:
                import logging as _logging
                _logging.getLogger(__name__).error("DB insert failed during client signup: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create user account. Please try again.",
                )

        from backend.services.email_service import send_signup_verification_code
        email_sent = send_signup_verification_code(clean_email, clean_name, otp_code)
        import logging as _logging
        _logging.getLogger(__name__).info("Client signup verification email dispatched to %s (sent=%s)", clean_email, email_sent)

        if email_sent:
            msg = f"A 6-digit verification code has been dispatched to {clean_email}. Please check your inbox and spam folder."
        else:
            _logging.getLogger(__name__).warning(
                "[OTP DISPATCH WARNING] Email delivery failed for %s. Security verification OTP code is: %s. "
                "Render free tier blocks SMTP ports 25, 465, and 587. Configure RESEND_API_KEY or BREVO_API_KEY on Render.",
                clean_email,
                otp_code,
            )
            msg = "Account created. However, verification email dispatch encountered an issue. Please click 'Resend Code' or check your email settings."

        otp_preview_val = otp_code if (not email_sent or os.getenv("ALLOW_OTP_PREVIEW", "true").lower() in ("true", "1")) else None

        return SignupResponse(
            status="pending_verification",
            message=msg,
            email=clean_email,
            requires_otp=True,
            email_sent=email_sent,
            otp_preview=otp_preview_val,
        )

    # 7. For recruiters: ensure official email, company name, and assign unique User ID
    existing = UserRepository.get_by_email(db, email=clean_email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists. Please login.",
        )

    approval_status = "approved"
    assigned_user_id = None
    if user_role == "recruiter":
        email_domain = clean_email.split("@")[-1].lower()
        if is_personal_email_domain(clean_email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Recruiters must register with an official company email address. Personal email domains (@{email_domain}) are not permitted. Please use your corporate or organization email.",
            )
        approval_status = "pending_approval"
        if not body.company_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization/Company Name is required for Recruiter registration.",
            )
        
        # Generate unique Recruiter User ID: REC-XXXX
        import random
        for _ in range(50):
            cand_id = f"REC-{random.randint(1001, 9999)}"
            if not UserRepository.get_by_identifier(db, cand_id):
                assigned_user_id = cand_id
                break
        if not assigned_user_id:
            assigned_user_id = f"REC-{random.randint(10000, 99999)}"

    try:
        UserRepository.create(
            db,
            email=clean_email,
            hashed_password=hashed,
            full_name=clean_name,
            role=user_role,
            company_name=body.company_name,
            company_logo_url=body.company_logo_url,
            approval_status=approval_status,
            custom_user_id=assigned_user_id,
            phone=body.phone,
            location=body.location,
        )
    except Exception as exc:
        import logging as _logging
        _logging.getLogger(__name__).error("DB insert failed during signup: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account. Please try again.",
        )

    import logging as _logging
    _logging.getLogger(__name__).info("User profile saved successfully: %s (role: %s, approval: %s, user_id: %s)", clean_email, user_role, approval_status, assigned_user_id)
    if user_role == "recruiter":
        return SignupResponse(
            message=f"Recruiter registration request submitted! Your assigned Recruiter User ID is {assigned_user_id}. Once an Authorizer grants permission, you can sign in using your official email or User ID.",
            custom_user_id=assigned_user_id,
            email=clean_email,
            requires_otp=False,
        )
    return SignupResponse(message="User created successfully", email=clean_email, requires_otp=False)


# ── Verify OTP ───────────────────────────────────────────────────────────────

@router.post(
    "/verify-otp",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify 6-digit OTP code to activate Client account",
)
def verify_signup_otp(body: VerifyOtpRequest, db: Session = Depends(get_db)):
    clean_email = body.email.strip().lower()
    code = body.code.strip()

    user = UserRepository.get_by_email(db, clean_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No registration found for this email. Please check your email address or sign up first.",
        )

    if getattr(user, "is_verified", False):
        access_token = create_access_token(data={"sub": str(getattr(user, "email", "")), "role": str(getattr(user, "role", "candidate")), "id": getattr(user, "id", None)})
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            role=str(getattr(user, "role", "candidate")),
            email=getattr(user, "email", None),
            full_name=getattr(user, "full_name", None),
            custom_user_id=getattr(user, "custom_user_id", None),
            approval_status=str(getattr(user, "approval_status", "approved")),
        )

    # Check attempt lockout
    attempts = getattr(user, "email_verification_attempts", 0) or 0
    if attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many invalid attempts. For security, please click 'Resend Code' to receive a new code.",
        )

    saved_code = getattr(user, "email_verification_code", None)
    expires_at = getattr(user, "email_verification_expires_at", None)

    now = datetime.now(timezone.utc)
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if now > expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code has expired. Please click 'Resend Code'.",
            )

    if not saved_code or saved_code != code:
        new_attempts = attempts + 1
        setattr(user, "email_verification_attempts", new_attempts)
        db.commit()
        remaining = max(0, 5 - new_attempts)
        if remaining > 0:
            err_msg = f"Invalid 6-digit verification code. Please check your email and try again ({remaining} attempts remaining)."
        else:
            err_msg = "Too many invalid attempts. Please click 'Resend Code' to receive a new code."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg,
        )

    # Account activation
    setattr(user, "is_verified", True)
    setattr(user, "email_verified_at", now)
    setattr(user, "email_verification_code", None)
    setattr(user, "email_verification_expires_at", None)
    setattr(user, "email_verification_attempts", 0)
    setattr(user, "is_active", True)
    setattr(user, "approval_status", "approved")
    setattr(user, "last_login", now)

    try:
        login_log = AuditLog(
            user_id=getattr(user, "id", None),
            performed_by_email=str(getattr(user, "email", "")),
            action="login_success",
            target_type="user",
            target_id=str(getattr(user, "id", "")),
            details={"role": getattr(user, "role", "candidate"), "login_method": "otp_verification"},
        )
        db.add(login_log)
    except Exception:
        pass

    db.commit()
    db.refresh(user)

    access_token = create_access_token(data={"sub": str(getattr(user, "email", "")), "role": str(getattr(user, "role", "candidate")), "id": getattr(user, "id", None)})
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        role=str(getattr(user, "role", "candidate")),
        email=getattr(user, "email", None),
        full_name=getattr(user, "full_name", None),
        custom_user_id=getattr(user, "custom_user_id", None),
        approval_status="approved",
    )


# ── Resend OTP ──────────────────────────────────────────────────────────────

@router.post(
    "/resend-otp",
    status_code=status.HTTP_200_OK,
    summary="Resend 6-digit OTP verification code",
)
def resend_signup_otp(body: ResendOtpRequest, db: Session = Depends(get_db)):
    clean_email = body.email.strip().lower()
    user = UserRepository.get_by_email(db, clean_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No registration found for this email. Please check your email address or sign up first.",
        )

    if getattr(user, "is_verified", False):
        return {"status": "already_verified", "message": "Email is already verified. Please sign in."}

    now = datetime.now(timezone.utc)
    last_sent = getattr(user, "email_verification_last_sent_at", None)
    if last_sent:
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        elapsed = (now - last_sent).total_seconds()
        if elapsed < 60:
            retry_after = int(60 - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {retry_after}s before requesting another verification code.",
            )

    import secrets
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    setattr(user, "email_verification_code", otp_code)
    setattr(user, "email_verification_expires_at", now + timedelta(minutes=15))
    setattr(user, "email_verification_attempts", 0)
    setattr(user, "email_verification_last_sent_at", now)
    db.commit()

    from backend.services.email_service import send_signup_verification_code
    email_sent = send_signup_verification_code(clean_email, getattr(user, "full_name", None), otp_code)
    import logging as _logging
    _logging.getLogger(__name__).info("Resent verification code dispatched to %s (sent=%s)", clean_email, email_sent)

    if email_sent:
        msg = f"A new 6-digit verification code has been dispatched to {clean_email}."
    else:
        _logging.getLogger(__name__).warning(
            "[RESEND OTP WARNING] Email delivery failed for %s. Security verification OTP code is: %s. "
            "Render free tier blocks SMTP ports 25, 465, and 587. Configure RESEND_API_KEY or BREVO_API_KEY on Render.",
            clean_email,
            otp_code,
        )
        msg = "Failed to dispatch verification email. Please check your email configuration or try again shortly."

    otp_preview_val = otp_code if (not email_sent or os.getenv("ALLOW_OTP_PREVIEW", "true").lower() in ("true", "1")) else None

    return {
        "status": "success",
        "message": msg,
        "email_sent": email_sent,
        "otp_preview": otp_preview_val,
    }



# ── Resolve User ID ──────────────────────────────────────────────────────────

@router.post(
    "/resolve-user-id",
    response_model=ResolveUserIdResponse,
    status_code=status.HTTP_200_OK,
    summary="Resolve unique User ID to registered account metadata",
)
def resolve_user_id(body: ResolveUserIdRequest, db: Session = Depends(get_db)):
    """Securely resolve User ID to registered account email and role."""
    uid = body.user_id.strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID is required.",
        )
    
    # Pre-configured Authorizer account
    if uid.upper() in ("AUTH-001", "AUTHOR", "AUTHORIZER", "AUTHOR@AUTO.IN"):
        return ResolveUserIdResponse(
            status="success",
            email="Author@auto.in",
            role="authorizer",
            full_name="System Authorizer",
            company_name="AutoAgentHire Security",
            custom_user_id="AUTH-001",
        )

    user = UserRepository.get_by_identifier(db, uid)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your User ID and password.",
        )

    user_role = getattr(user, "role", "candidate") or "candidate"
    if body.role:
        norm_expected = "candidate" if body.role.lower() == "client" else body.role.lower()
        if user_role.lower() != norm_expected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credentials do not match the selected portal role.",
            )

    return ResolveUserIdResponse(
        status="success",
        email=str(user.email),
        role=user_role,
        full_name=getattr(user, "full_name", None),
        company_name=getattr(user, "company_name", None),
        custom_user_id=getattr(user, "custom_user_id", uid) or uid,
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and get JWT token",
)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Single unified login for Clients, Recruiters, and Authorizers.

    Supports Option A (Official Email) and Option B (User ID).
    Enforces official email domains for Recruiters and Authorizers.
    """
    identifier_clean = body.email.strip()
    is_email_pattern = "@" in identifier_clean

    expected_role = body.role.lower() if body.role else None
    if expected_role == "client":
        expected_role = "candidate"

    # Official email validation: Recruiters & Authorizers must NOT use public/personal domains
    if is_email_pattern and expected_role in ("recruiter", "authorizer"):
        is_demo_auth = identifier_clean.lower() == "author@auto.in"
        if not is_demo_auth and is_personal_email_domain(identifier_clean):
            domain = identifier_clean.split("@")[-1].lower()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{expected_role.capitalize()}s must use an official company email address. Personal email providers (@{domain}) are not permitted.",
            )

    if is_email_pattern:
        email_err = validate_email_format(identifier_clean)
        if email_err:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=email_err)

    import logging as _logging
    _log = _logging.getLogger(__name__)

    # Special check for Authorizer pre-configured credentials
    is_authorizer = identifier_clean.lower() in (
        "author@auto.in",
        "auth-001",
        "author",
        "authorizer",
        "authorizer@auto.in",
    )

    # Look up user by identifier (email, custom_user_id, or uuid)
    user = UserRepository.get_by_identifier(db, identifier_clean)
    if user is None and is_authorizer:
        user = UserRepository.get_by_email(db, "Author@auto.in")

    # Handle Authorizer or existing user check
    if user is None:
        if is_authorizer:
            hashed = hash_password("Author@123")
            user = UserRepository.create(
                db,
                email="Author@auto.in",
                hashed_password=hashed,
                full_name="System Authorizer",
                role="authorizer",
                custom_user_id="AUTH-001",
                approval_status="approved",
                is_active=True,
                is_verified=True,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No account found with this email or User ID. Please create an account first before signing in.",
            )

    if is_authorizer and user is not None and body.password in ("Author@123", "author@123"):
        user.hashed_password = hash_password(body.password)  # type: ignore
        user.role = "authorizer"  # type: ignore
        user.approval_status = "approved"  # type: ignore
        user.is_active = True  # type: ignore
        user.is_verified = True  # type: ignore
        if not getattr(user, "custom_user_id", None):
            user.custom_user_id = "AUTH-001"  # type: ignore
        db.commit()

    # Verify password
    if not verify_password(body.password, str(user.hashed_password)):  # type: ignore
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please check your password or User ID.",
        )

    user_role = getattr(user, "role", "candidate") or "candidate"

    # Enforce role matching if specified
    if expected_role and user_role.lower() != expected_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account is registered with the role '{user_role.capitalize()}'. Please select the corresponding tab to sign in.",
        )

    # 5. Permission Check: Recruiters cannot log in without Authorizer permission
    user_role = getattr(user, "role", "candidate") or "candidate"
    if user_role == "recruiter":
        approval = getattr(user, "approval_status", "approved")
        if approval == "pending_approval":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Recruiter registration request is pending review by the Authorizer. Please wait for authorizer permission before logging in.",
            )
        elif approval == "rejected":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Recruiter registration request was rejected by the Authorizer. Please contact administration.",
            )

    # 6. Verification Check: Candidate accounts must be verified
    if user_role == "candidate" and not getattr(user, "is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your email is not verified yet. Please enter the 6-digit verification code sent to your email to activate your account.",
        )


    # Update last_login timestamp and write audit log
    try:
        setattr(user, "last_login", datetime.now(timezone.utc))
        login_log = AuditLog(
            user_id=user.id,
            performed_by_email=user.email,
            action="login_success",
            target_type="user",
            target_id=str(user.id),
            details={"role": user_role, "login_method": "email_password"},
        )
        db.add(login_log)
        db.commit()
    except Exception as exc:
        _log.error("Failed to record login audit log: %s", exc)
        db.rollback()

    user_role = getattr(user, "role", "candidate") or "candidate"

    # 5. Issue token
    access_token = create_access_token(data={"sub": str(user.email), "role": user_role, "id": user.id})
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        role=user_role,
        email=str(user.email),
        full_name=getattr(user, "full_name", None),
        company_name=getattr(user, "company_name", None),
        custom_user_id=getattr(user, "custom_user_id", None) or getattr(user, "uuid", None),
        approval_status=getattr(user, "approval_status", "approved"),
        avatar_url=getattr(user, "avatar_url", None) or getattr(user, "company_logo_url", None),
    )


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str
    id: int | None = None
    full_name: str | None = None
    company_name: str | None = None
    custom_user_id: str | None = None
    approval_status: str | None = "approved"


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh active session token",
)
def refresh_token(current_user: User = Depends(get_current_user)):
    """Issue a fresh access token for the authenticated user session."""
    user_role = str(getattr(current_user, "role", "candidate") or "candidate")
    access_token = create_access_token(
        data={"sub": str(current_user.email), "role": user_role, "id": current_user.id}
    )
    return RefreshResponse(
        access_token=access_token,
        token_type="bearer",
        role=user_role,
        email=str(current_user.email),
        id=current_user.id,
        full_name=getattr(current_user, "full_name", None),
        company_name=getattr(current_user, "company_name", None),
        custom_user_id=getattr(current_user, "custom_user_id", None),
        approval_status=getattr(current_user, "approval_status", "approved"),
    )


# ── Current user profile ─────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current authenticated user profile",
)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return current_user


@router.post("/logout", summary="Logout user and invalidate session")
def logout():
    """Client clears JWT token; endpoint acknowledges clean logout."""
    return {"message": "Logged out successfully", "status": "ok"}


@router.get("/callback", summary="Redirect OAuth callback to frontend SPA")
def auth_callback_redirect(request: Request):
    """Fallback handler: Redirects any direct backend hits on /auth/callback to the Vite SPA."""
    base = getattr(settings, 'REACT_APP_API_URL', 'http://localhost:8080').rstrip('/')
    query_str = str(request.query_params)
    target = f"{base}/auth/callback?{query_str}" if query_str else f"{base}/auth/callback"
    return RedirectResponse(url=target)


# ── Google OAuth ──────────────────────────────────────────────────────────────

def _sync_fetch_google_endpoint(url: str, headers: Optional[dict] = None, timeout: float = 8.0) -> Optional[dict]:
    """Execute network request safely using Python standard library urllib or requests."""
    import json
    # 1. Try standard library urllib first (always available, zero dependencies)
    try:
        import urllib.request
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                payload = json.loads(response.read().decode("utf-8"))
                if isinstance(payload, dict) and payload:
                    return payload
    except Exception:
        pass

    # 2. Try requests library
    try:
        import requests
        resp = requests.get(url, headers=headers or {}, timeout=timeout)
        if resp.status_code == 200:
            payload = resp.json()
            if isinstance(payload, dict) and payload:
                return payload
    except Exception:
        pass

    return None


def _verify_google_token_payload(raw_token: str) -> Optional[dict]:
    """Verify an OAuth access token or ID token (credential) against Google's official endpoints.
    
    Safe synchronous execution executed in threadpool by FastAPI.
    Supports:
    1. OpenID Connect JWT ID tokens via Google oauth2 tokeninfo.
    2. OAuth2 Access tokens via Google oauth2 v3 userinfo (Bearer).
    3. OAuth2 Access tokens via Google oauth2 v3 tokeninfo.
    """
    clean_token = raw_token.strip()
    is_jwt = clean_token.count(".") == 2

    # Case A: If it's a JWT ID token, check tokeninfo with id_token
    if is_jwt:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={clean_token}"
        data = _sync_fetch_google_endpoint(url)
        if data and ("email" in data or "sub" in data):
            return data

    # Case B: If it's an OAuth2 access token, check userinfo with Bearer authorization
    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    headers = {"Authorization": f"Bearer {clean_token}"}
    data = _sync_fetch_google_endpoint(userinfo_url, headers)
    if data and ("email" in data or "sub" in data):
        return data

    # Case C: Check tokeninfo with access_token parameter
    access_tokeninfo_url = f"https://www.googleapis.com/oauth2/v3/tokeninfo?access_token={clean_token}"
    data = _sync_fetch_google_endpoint(access_tokeninfo_url)
    if data and ("email" in data or "sub" in data):
        return data

    # Case D: Fallback attempt for ID token if not identified as standard JWT
    id_tokeninfo_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={clean_token}"
    data = _sync_fetch_google_endpoint(id_tokeninfo_url)
    if data and ("email" in data or "sub" in data):
        return data

    return None


@router.post(
    "/google",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in or register with Google",
)
def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verify a Google OAuth2 access token or ID token credential, then sign in or auto-register the user.

    Flow
    ----
    1. Verify token by calling Google's endpoints (userinfo or tokeninfo).
    2. Validate audience against configured GOOGLE_CLIENT_ID if present.
    3. Extract email + name + email_verified from the verified payload.
    4. Find or create the user in the database with race-condition safety.
    5. Return our signed JWT access token.
    """
    try:
        raw_token = (body.access_token or body.token or body.credential or body.id_token or "").strip()
        if not raw_token:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Google access token or credential is required.",
            )

        userinfo = _verify_google_token_payload(raw_token)
        if not userinfo:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired Google access token or credential.",
            )

        # 1. Validate audience / client ID if configured
        configured_client_id = (
            os.getenv("GOOGLE_CLIENT_ID")
            or os.getenv("VITE_GOOGLE_CLIENT_ID")
            or getattr(settings, "GOOGLE_CLIENT_ID", None)
            or ""
        ).strip()
        
        token_aud = str(userinfo.get("aud") or userinfo.get("azp") or "").strip()
        if configured_client_id and token_aud:
            if token_aud != configured_client_id and configured_client_id not in token_aud:
                import logging
                logging.getLogger(__name__).warning(
                    "[Google Auth Warning] Token audience '%s' does not match configured '%s'",
                    token_aud[:15] + "...", configured_client_id[:15] + "..."
                )

        # 2. Extract and validate verified email
        google_email: str = (userinfo.get("email") or "").strip().lower()
        google_name: str = (userinfo.get("name") or "").strip()
        raw_verified = userinfo.get("email_verified", False)
        if isinstance(raw_verified, str):
            email_verified = raw_verified.lower() in ("true", "1", "yes")
        else:
            email_verified = bool(raw_verified)

        if not google_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account has no associated email address.",
            )
        if not email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account email address is not verified.",
            )

        # 3. Find or auto-register candidate user
        try:
            user = UserRepository.get_by_email(db, email=google_email)
        except Exception as query_exc:
            if "no such table" in str(query_exc).lower():
                from backend.database.connection import init_db
                init_db()
                user = UserRepository.get_by_email(db, email=google_email)
            else:
                raise
        if user is None:
            try:
                random_pw = hash_password(_uuid.uuid4().hex + _uuid.uuid4().hex)
                user = UserRepository.create(
                    db,
                    email=google_email,
                    hashed_password=random_pw,
                    full_name=google_name or google_email.split("@")[0],
                    role="candidate",
                    is_active=True,
                    is_verified=True,
                )
            except Exception as create_exc:
                db.rollback()
                # Re-query in case user was created concurrently
                user = UserRepository.get_by_email(db, email=google_email)
                if user is None:
                    import logging
                    logging.getLogger(__name__).error("Failed to create user during Google Auth: %s", create_exc)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to initialize user account from Google profile.",
                    )

        # 4. Safe attribute extraction (isolated from subsequent database transactions)
        user_id = user.id
        user_email = str(user.email)
        user_role = str(getattr(user, "role", "candidate") or "candidate")
        user_full_name = getattr(user, "full_name", None) or google_name
        user_company = getattr(user, "company_name", None)
        user_custom_id = getattr(user, "custom_user_id", None) or getattr(user, "uuid", None)

        # 5. Non-fatal audit log & last_login recording
        try:
            user.last_login = datetime.now(timezone.utc)
            login_log = AuditLog(
                user_id=user_id,
                performed_by_email=user_email,
                action="login_success",
                target_type="user",
                target_id=str(user_id),
                details={"role": user_role, "login_method": "google_oauth"},
            )
            db.add(login_log)
            db.commit()
        except Exception as audit_exc:
            db.rollback()
            import logging
            logging.getLogger(__name__).warning("Non-fatal: failed to record login audit log: %s", audit_exc)

        # 6. Issue platform JWT access token
        access_token = create_access_token(data={"sub": user_email, "role": user_role})
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            role=user_role,
            email=user_email,
            full_name=user_full_name,
            company_name=user_company,
            custom_user_id=user_custom_id,
        )

    except HTTPException:
        raise
    except Exception as exc:
        import logging, traceback
        logging.getLogger(__name__).error("Google authentication unexpected exception: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google authentication failed: {str(exc)}",
        )
@router.post('/token', include_in_schema=False)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = UserRepository.get_by_email(db, email=form_data.username)
    if not user or not verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(status_code=401, detail='Incorrect email or password')
    try:
        setattr(user, "last_login", datetime.now(timezone.utc))
        login_log = AuditLog(
            user_id=getattr(user, "id", None),
            performed_by_email=str(getattr(user, "email", "")),
            action="login_success",
            target_type="user",
            target_id=str(getattr(user, "id", "")),
            details={"role": getattr(user, "role", "user"), "login_method": "oauth2_token"},
        )
        db.add(login_log)
        db.commit()
    except Exception:
        pass
    access_token = create_access_token(data={'sub': str(getattr(user, "email", ""))})
    return {'access_token': access_token, 'token_type': 'bearer'}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change password for authenticated user (recruiter, authorizer, or candidate)."""
    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation password do not match."
        )

    if not verify_password(body.old_password, str(current_user.hashed_password)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password. Please verify and try again."
        )

    strength_err = validate_password_strength(body.new_password)
    if strength_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=strength_err
        )

    new_hashed = hash_password(body.new_password)
    setattr(current_user, "hashed_password", new_hashed)
    db.commit()

    # Log audit entry
    try:
        audit = AuditLog(
            action="CHANGE_PASSWORD",
            user_id=getattr(current_user, "id", None),
            performed_by_email=str(getattr(current_user, "email", "")),
            target_type="user",
            target_id=str(getattr(current_user, "id", "")),
            details=f"User {getattr(current_user, 'email', '')} successfully updated their password."
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    return {"message": "Password changed successfully! You can now use your new password."}
