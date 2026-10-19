"""
FastAPI dependencies for authentication.
Provides ``get_current_user`` which extracts and validates the JWT
from the ``Authorization: Bearer <token>`` header.
"""

from fastapi import Depends, HTTPException, Request, status
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
    request: Request = None,  # type: ignore
    db: Session = Depends(get_db),
) -> User | None:
    """Return the User if valid Bearer token provided; None otherwise."""
    eff_token = token
    if not eff_token and request is not None:
        eff_token = (
            request.query_params.get("token")
            or request.cookies.get("authToken")
            or request.cookies.get("token")
        )
    if not eff_token:
        return None
    try:
        return get_current_user(token=eff_token, request=request, db=db)
    except Exception:
        return None


def get_current_user(
    token: str | None = Depends(oauth2_scheme_optional),
    request: Request = None,  # type: ignore
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

    eff_token = token
    if not eff_token and request is not None:
        eff_token = (
            request.query_params.get("token")
            or request.cookies.get("authToken")
            or request.cookies.get("token")
        )

    if not eff_token:
        raise credentials_exception

    clean_token = eff_token.strip()
    if clean_token.startswith("Bearer "):
        clean_token = clean_token[7:].strip()
    if clean_token.startswith('"') and clean_token.endswith('"'):
        clean_token = clean_token[1:-1].strip()

    try:
        payload = decode_access_token(clean_token)
        email: str | None = payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if not email:
        raise credentials_exception

    user = UserRepository.get_by_email(db, email=email)
    if user is None:
        from sqlalchemy import func
        user = db.query(User).filter(func.lower(User.email) == email.lower()).first()

    if user is None and payload.get("id"):
        try:
            user = UserRepository.get_by_id(db, user_id=int(payload["id"]))
        except (ValueError, TypeError):
            user = None

    if user is None:
        raise credentials_exception

    if user.is_active is False:
        raise credentials_exception

    return user
