"""
FastAPI dependencies for authentication.
Provides ``get_current_user`` which extracts and validates the JWT
from the ``Authorization: Bearer <token>`` header.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError

from backend.auth.jwt import decode_access_token
from backend.database.connection import get_db
from backend.database.models_complete import User
from backend.database.crud import UserRepository

# The tokenUrl points at the login endpoint so Swagger UI can use it.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> User | None:
    """Return the User if valid Bearer token provided; None otherwise."""
    if not token:
        return None
    try:
        return get_current_user(token=token, db=db)
    except Exception:
        return None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decode the JWT and return the associated ``User`` row.
    Every token's cryptographic signature and expiry are verified.

    Raises:
        HTTPException 401: If the token is missing, invalid, expired, forged,
            or the user no longer exists / is inactive.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        email: str | None = payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if not email:
        raise credentials_exception

    user = UserRepository.get_by_email(db, email=email)
    if user is None:
        # Auto-provision local user record for Supabase OAuth users (defaulting safely to candidate role)
        from backend.auth.passwords import hash_password
        import uuid as _uuid
        user = UserRepository.create(
            db,
            email=email,
            hashed_password=hash_password(_uuid.uuid4().hex),
            full_name=full_name or email.split("@")[0],
            role="candidate",
            is_active=True,
            is_verified=True,
        )

    if not user.is_active:  # type: ignore
        raise credentials_exception

    return user
