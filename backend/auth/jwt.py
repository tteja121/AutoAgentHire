"""
JWT (JSON Web Token) utilities for access-token creation and verification.
Uses python-jose with the HS256 algorithm by default.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import os

from jose import JWTError, jwt

try:
    from backend.config import settings, validate_secret_key_value
except ImportError:
    try:
        from config import settings, validate_secret_key_value
    except ImportError:
        settings = None
        from backend.config import validate_secret_key_value

if settings is not None and getattr(settings, "SECRET_KEY", None):
    SECRET_KEY: str = validate_secret_key_value(settings.SECRET_KEY)
    ALGORITHM: str = getattr(settings, "ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 30)
else:
    # Must refuse to start without a valid strong secret
    raw_key = os.environ.get("SECRET_KEY", "")
    SECRET_KEY = validate_secret_key_value(raw_key)
    ALGORITHM = os.environ.get("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token.

    Args:
        data: Payload to encode (must include ``sub`` – typically the user email).
        expires_delta: Custom expiry duration. Falls back to
            ``ACCESS_TOKEN_EXPIRE_MINUTES`` from settings.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and verify a JWT access token against SECRET_KEY.

    Args:
        token: The encoded JWT string.

    Returns:
        The decoded payload dictionary.

    Raises:
        JWTError: If the token is invalid, expired, or tampered with.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


