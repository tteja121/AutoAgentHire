"""
JWT (JSON Web Token) utilities for access-token creation and verification.
Uses python-jose with the HS256 algorithm by default.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import os

try:
    from jose import JWTError, jwt
except ImportError:
    import base64
    import hashlib
    import hmac
    import json
    import time
    import types
    import sys

    class JWTError(Exception):
        """Exception raised when JWT decode or verification fails."""
        pass

    class _PurePyJWT:
        @staticmethod
        def _b64url_encode(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

        @staticmethod
        def _b64url_decode(s: str) -> bytes:
            padding = "=" * (-len(s) % 4)
            return base64.urlsafe_b64decode(s + padding)

        @classmethod
        def encode(cls, claims: Dict[str, Any], key: str, algorithm: str = "HS256") -> str:
            header = {"typ": "JWT", "alg": algorithm}
            serializable = {}
            for k, v in claims.items():
                if isinstance(v, datetime):
                    serializable[k] = int(v.timestamp())
                else:
                    serializable[k] = v
            h_str = cls._b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
            p_str = cls._b64url_encode(json.dumps(serializable, separators=(",", ":")).encode("utf-8"))
            msg = f"{h_str}.{p_str}".encode("utf-8")
            sig = hmac.new(key.encode("utf-8"), msg, hashlib.sha256).digest()
            sig_str = cls._b64url_encode(sig)
            return f"{h_str}.{p_str}.{sig_str}"

        @classmethod
        def decode(
            cls,
            token: str,
            key: str,
            algorithms: Optional[Any] = None,
            options: Optional[Dict[str, Any]] = None,
        ) -> Dict[str, Any]:
            parts = token.split(".")
            if len(parts) != 3:
                raise JWTError("Invalid token structure")
            h_str, p_str, sig_str = parts
            msg = f"{h_str}.{p_str}".encode("utf-8")
            expected_sig = hmac.new(key.encode("utf-8"), msg, hashlib.sha256).digest()
            try:
                sig_bytes = cls._b64url_decode(sig_str)
                if not hmac.compare_digest(sig_bytes, expected_sig):
                    raise JWTError("Signature verification failed")
                payload = json.loads(cls._b64url_decode(p_str).decode("utf-8"))
            except Exception as e:
                if isinstance(e, JWTError):
                    raise
                raise JWTError(f"Could not decode token: {e}") from e

            verify_exp = True
            if options and options.get("verify_exp") is False:
                verify_exp = False
            if verify_exp and "exp" in payload:
                now_ts = datetime.now(timezone.utc).timestamp()
                if payload["exp"] < now_ts:
                    raise JWTError("Token has expired")
            return payload

    jwt = _PurePyJWT()
    _jose_mod = types.ModuleType("jose")
    _jose_mod.jwt = jwt
    _jose_mod.JWTError = JWTError
    sys.modules["jose"] = _jose_mod

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 10080)
else:
    # Must refuse to start without a valid strong secret
    raw_key = os.environ.get("SECRET_KEY", "")
    SECRET_KEY = validate_secret_key_value(raw_key)
    ALGORITHM = os.environ.get("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))


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


def decode_access_token(token: str, verify_exp: bool = True) -> Dict[str, Any]:
    """Decode and verify a JWT access token against SECRET_KEY.

    Args:
        token: The encoded JWT string.
        verify_exp: Whether to verify expiry date (set False for document viewing grace period).

    Returns:
        The decoded payload dictionary.

    Raises:
        JWTError: If the token is invalid, expired, or tampered with.
    """
    clean_token = token.strip()
    if (clean_token.startswith('"') and clean_token.endswith('"')) or (clean_token.startswith("'") and clean_token.endswith("'")):
        clean_token = clean_token[1:-1].strip()
    if clean_token.lower().startswith("bearer "):
        clean_token = clean_token[7:].strip()
    if (clean_token.startswith('"') and clean_token.endswith('"')) or (clean_token.startswith("'") and clean_token.endswith("'")):
        clean_token = clean_token[1:-1].strip()

    options: Dict[str, Any] = {"leeway": 300}
    if not verify_exp:
        options["verify_exp"] = False
    return jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM], options=options)


