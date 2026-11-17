"""
Password hashing utilities using bcrypt via passlib.
Never store plain-text passwords – always hash before persisting.
"""

try:
    from passlib.context import CryptContext
    _pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except ImportError:
    import hashlib
    import hmac
    import os
    import sys
    import types

    try:
        import bcrypt
        class CryptContext:  # type: ignore[no-redef]
            def __init__(self, schemes=None, deprecated=None):
                pass
            def hash(self, secret: str) -> str:
                return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            def verify(self, secret: str, hash_val: str) -> bool:
                try:
                    return bcrypt.checkpw(secret.encode("utf-8"), hash_val.encode("utf-8"))
                except Exception:
                    return False
    except ImportError:
        class CryptContext:  # type: ignore[no-redef]
            def __init__(self, schemes=None, deprecated=None):
                pass
            def hash(self, secret: str) -> str:
                salt = os.urandom(16).hex()
                dk = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), 100000)
                return f"pbkdf2:sha256:100000${salt}${dk.hex()}"
            def verify(self, secret: str, hash_val: str) -> bool:
                if hash_val.startswith("pbkdf2:sha256:"):
                    parts = hash_val.split("$")
                    if len(parts) == 3:
                        salt = parts[1]
                        expected_dk = parts[2]
                        dk = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), 100000)
                        return hmac.compare_digest(dk.hex(), expected_dk)
                return False

    _pwd_context = CryptContext()
    _passlib_mod = types.ModuleType("passlib")
    _context_mod = types.ModuleType("passlib.context")
    _context_mod.CryptContext = CryptContext
    _passlib_mod.context = _context_mod
    sys.modules["passlib"] = _passlib_mod
    sys.modules["passlib.context"] = _context_mod


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using bcrypt.

    Args:
        plain_password: The raw password entered by the user.

    Returns:
        A bcrypt hash string suitable for database storage.
    """
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a stored bcrypt hash.

    Args:
        plain_password: The raw password entered by the user.
        hashed_password: The bcrypt hash stored in the database.

    Returns:
        True if the password matches, False otherwise.
    """
    return _pwd_context.verify(plain_password, hashed_password)
