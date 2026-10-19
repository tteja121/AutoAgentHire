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
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
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

    class Config:
        from_attributes = True



class GoogleAuthRequest(BaseModel):
    access_token: str = Field(..., description="Google OAuth2 access token from useGoogleLogin")


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
    clean_name = (body.full_name or "").strip()

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
        import random
        otp_code = f"{random.randint(100000, 999999)}"
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

        return SignupResponse(
            status="pending_verification",
            message=f"A 6-digit verification code has been dispatched to {clean_email}.",
            email=clean_email,
            requires_otp=True,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No registration found for this email.")

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 6-digit verification code. Please check your email and try again.",
        )

    setattr(user, "is_verified", True)
    setattr(user, "email_verified_at", now)
    setattr(user, "email_verification_code", None)
    setattr(user, "email_verification_expires_at", None)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No registration found for this email.")

    if getattr(user, "is_verified", False):
        return {"status": "already_verified", "message": "Email is already verified. Please sign in."}

    import random
    otp_code = f"{random.randint(100000, 999999)}"
    now = datetime.now(timezone.utc)
    setattr(user, "email_verification_code", otp_code)
    setattr(user, "email_verification_expires_at", now + timedelta(minutes=15))
    db.commit()

    from backend.services.email_service import send_signup_verification_code
    email_sent = send_signup_verification_code(clean_email, getattr(user, "full_name", None), otp_code)
    import logging as _logging
    _logging.getLogger(__name__).info("Resent verification code dispatched to %s (sent=%s)", clean_email, email_sent)

    return {
        "status": "success",
        "message": f"A new 6-digit verification code has been dispatched to {clean_email}.",
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
    if uid.upper() == "AUTH-001":
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
    is_authorizer = identifier_clean.lower() in ("author@auto.in", "auth-001")

    # Look up user by identifier (email, custom_user_id, or uuid)
    user = UserRepository.get_by_identifier(db, identifier_clean)

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
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No account found with this email or User ID. Please create an account first before signing in.",
            )

    if is_authorizer and user is not None and body.password == "Author@123":
        if not verify_password("Author@123", str(user.hashed_password)):
            user.hashed_password = hash_password("Author@123")  # type: ignore
            db.commit()
        user.role = "authorizer"  # type: ignore
        user.approval_status = "approved"  # type: ignore
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

    # 6. Verification Check: Clients with pending verification code must verify
    if user_role == "candidate" and getattr(user, "is_verified", None) is False and getattr(user, "email_verification_code", None) is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your email is not verified yet. Please enter the 6-digit verification code sent to your inbox.",
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
    access_token = create_access_token(data={"sub": user.email, "role": user_role})
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




# ── Current user profile ─────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current authenticated user profile",
)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return current_user


@router.get("/callback", summary="Redirect OAuth callback to frontend SPA")
def auth_callback_redirect(request: Request):
    """Fallback handler: Redirects any direct backend hits on /auth/callback to the Vite SPA."""
    base = getattr(settings, 'REACT_APP_API_URL', 'http://localhost:8080').rstrip('/')
    query_str = str(request.query_params)
    target = f"{base}/auth/callback?{query_str}" if query_str else f"{base}/auth/callback"
    return RedirectResponse(url=target)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.post(
    "/google",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in or register with Google",
)
async def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verify a Google OAuth2 access token, then sign in or auto-register the user.

    Flow
    ----
    1. Call Google's userinfo endpoint with the access token to verify it.
    2. Extract email + name from the verified payload.
    3. Find or create the user in the database.
    4. Return our own JWT access token.
    """
    # 1. Verify token by calling Google's userinfo endpoint
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {body.access_token}"},
                timeout=10,
            )
    except ImportError:
        # httpx not installed — fall back to synchronous requests
        import requests as _requests
        try:
            resp = _requests.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {body.access_token}"},
                timeout=10,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Could not reach Google servers: {exc}",
            )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not reach Google servers: {exc}",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google access token.",
        )

    userinfo = resp.json()
    google_email: str = userinfo.get("email", "")
    google_name: str = userinfo.get("name", "")
    email_verified: bool = userinfo.get("email_verified", False)

    if not google_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account has no email address.",
        )
    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email is not verified.",
        )

    # 2. Find or create user
    user = UserRepository.get_by_email(db, email=google_email)
    if user is None:
        # Auto-register candidate: never auto-assign privileged roles
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

    # 3. Update last_login and record audit log
    user_role = getattr(user, "role", "candidate") or "candidate"
    try:
        setattr(user, "last_login", datetime.now(timezone.utc))
        login_log = AuditLog(
            user_id=user.id,
            performed_by_email=user.email,
            action="login_success",
            target_type="user",
            target_id=str(user.id),
            details={"role": user_role, "login_method": "google_oauth"},
        )
        db.add(login_log)
        db.commit()
    except Exception as exc:
        import logging as _logging
        _logging.getLogger(__name__).error("Failed to record google login audit log: %s", exc)
        db.rollback()

    user_role = getattr(user, "role", "candidate") or "candidate"

    # 4. Issue our JWT
    access_token = create_access_token(data={"sub": user.email, "role": user_role})
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        role=user_role,
        email=str(user.email),
        full_name=getattr(user, "full_name", None),
        company_name=getattr(user, "company_name", None),
        custom_user_id=getattr(user, "custom_user_id", None) or getattr(user, "uuid", None),
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
        user.last_login = datetime.now(timezone.utc)
        login_log = AuditLog(
            user_id=user.id,
            performed_by_email=user.email,
            action="login_success",
            target_type="user",
            target_id=str(user.id),
            details={"role": user.role, "login_method": "oauth2_token"},
        )
        db.add(login_log)
        db.commit()
    except Exception:
        pass
    access_token = create_access_token(data={'sub': user.email})
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
