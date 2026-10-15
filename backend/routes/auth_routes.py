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
import requests as http_requests
from datetime import datetime, timezone

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
    role: str = Field(default="recruiter", description="recruiter or authorizer")
    company_name: str | None = None
    company_logo_url: str | None = None
    phone: str | None = None
    location: str | None = None


class SignupResponse(BaseModel):
    message: str
    custom_user_id: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email or User ID (e.g. REC-1001, AUTH-001)")
    password: str = Field(..., min_length=1)
    role: str | None = Field(default=None, description="Optional role preference: client, recruiter, or authorizer")
    login_type: str | None = Field(default="email", description="email or user_id")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "recruiter"
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

    # 4. Duplicate check
    existing = UserRepository.get_by_email(db, email=body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists. Please login.",
        )

    # 5. Hash + store
    hashed = hash_password(body.password)
    # Disallow signing up as Authorizer
    user_role = (body.role or "candidate").lower()
    if user_role == "authorizer":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorizer accounts cannot be created publicly. Credentials are pre-configured.",
        )

    # For recruiters, ensure official email, company name, and assign unique User ID
    approval_status = "approved"
    assigned_user_id = None
    if user_role == "recruiter":
        email_domain = body.email.split("@")[-1].lower()
        if is_personal_email_domain(body.email):
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

    if user_role not in ("recruiter", "candidate"):
        user_role = "candidate"

    try:
        UserRepository.create(
            db,
            email=body.email,
            hashed_password=hashed,
            full_name=body.full_name or "",
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
    _logging.getLogger(__name__).info("User profile saved successfully: %s (role: %s, approval: %s, user_id: %s)", body.email, user_role, approval_status, assigned_user_id)
    if user_role == "recruiter":
        return SignupResponse(
            message=f"Recruiter registration request submitted! Your assigned Recruiter User ID is {assigned_user_id}. Once an Authorizer grants permission, you can sign in using your official email or User ID.",
            custom_user_id=assigned_user_id
        )
    return SignupResponse(message="User created successfully")


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
    
    # Pre-configured demo accounts
    if uid.upper() == "REC-1001":
        return ResolveUserIdResponse(
            status="success",
            email="Re@auto.in",
            role="recruiter",
            full_name="Verified Recruiter",
            company_name="AutoHire Partner Tech",
            custom_user_id="REC-1001",
        )
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
        email=user.email,
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
        is_demo_rec = identifier_clean.lower() == "re@auto.in"
        is_demo_auth = identifier_clean.lower() == "author@auto.in"
        if not is_demo_rec and not is_demo_auth and is_personal_email_domain(identifier_clean):
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

    # Special check for Authorizer and Recruiter pre-configured credentials
    is_authorizer = identifier_clean.lower() in ("author@auto.in", "auth-001")
    is_demo_recruiter = identifier_clean.lower() in ("re@auto.in", "rec-1001")

    # Look up user by identifier (email, custom_user_id, or uuid)
    user = UserRepository.get_by_identifier(db, identifier_clean)

    # Handle Authorizer, Demo Recruiter, or existing user / auto-signup
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
        elif is_demo_recruiter:
            hashed = hash_password("Re@123")
            user = UserRepository.create(
                db,
                email="Re@auto.in",
                hashed_password=hashed,
                full_name="Verified Recruiter",
                company_name="AutoHire Partner Tech",
                role="recruiter",
                custom_user_id="REC-1001",
                approval_status="approved",
            )
        elif is_email_pattern and expected_role in (None, "candidate"):
            # Auto-create standard client/candidate account if client signs in
            _log.info("Client user not found for %s — creating client account", identifier_clean)
            hashed = hash_password(body.password)
            try:
                user = UserRepository.create(
                    db,
                    email=identifier_clean,
                    hashed_password=hashed,
                    full_name="",
                    role="candidate",
                    approval_status="approved",
                )
            except Exception as exc:
                _log.error("DB insert failed during client auto-signup: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create user account. Please try again.",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Please verify your User ID or email and password.",
            )

    # Sync pre-configured credentials if password matches official seed
    if is_demo_recruiter and user is not None and body.password == "Re@123":
        user.hashed_password = hash_password("Re@123")  # type: ignore
        user.role = "recruiter"  # type: ignore
        user.approval_status = "approved"  # type: ignore
        if not getattr(user, "custom_user_id", None):
            user.custom_user_id = "REC-1001"  # type: ignore
        db.commit()

    if is_authorizer and user is not None and body.password == "Author@123":
        user.hashed_password = hash_password("Author@123")  # type: ignore
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


    # Update last_login timestamp and write audit log
    try:
        UserRepository.update(db, int(user.id), last_login=datetime.now(timezone.utc))  # type: ignore
        login_log = AuditLog(
            user_id=user.id,
            performed_by_email=user.email,
            action="login_success",
            target_type="user",
            target_id=str(user.id),
            details={"role": user_role},
        )
        db.add(login_log)
        db.commit()
    except Exception:
        pass

    user_role = getattr(user, "role", "candidate") or "candidate"

    # 5. Issue token
    access_token = create_access_token(data={"sub": user.email, "role": user_role})
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        role=user_role,
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
    query_str = str(request.query_params)
    target = f"http://localhost:8080/auth/callback?{query_str}" if query_str else "http://localhost:8080/auth/callback"
    return RedirectResponse(url=target)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.post(
    "/google",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in or register with Google",
)
def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
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
        resp = http_requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {body.access_token}"},
            timeout=10,
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

    # 3. Update last_login
    try:
        UserRepository.update(db, int(user.id), last_login=datetime.now(timezone.utc))  # type: ignore
    except Exception:
        pass

    user_role = getattr(user, "role", "candidate") or "candidate"

    # 4. Issue our JWT
    access_token = create_access_token(data={"sub": user.email, "role": user_role})
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        role=user_role,
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
    current_user.hashed_password = new_hashed
    db.commit()

    # Log audit entry
    try:
        audit = AuditLog(
            action="CHANGE_PASSWORD",
            performed_by_id=int(current_user.id),
            performed_by_email=str(current_user.email),
            target_type="user",
            target_id=int(current_user.id),
            details=f"User {current_user.email} successfully updated their password."
        )
        db.add(audit)
        db.commit()
    except Exception:
        pass

    return {"message": "Password changed successfully! You can now use your new password."}
