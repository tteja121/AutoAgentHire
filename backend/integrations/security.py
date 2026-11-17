"""
Security and Credential Management for Portal Integrations.
Provides AES-authenticated encryption using Fernet derived from platform SECRET_KEY.
Ensures third-party API keys and secrets are never stored in plaintext or logged.
"""
import base64
import hashlib
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from backend.config import settings


def _get_fernet() -> Fernet:
    """Derive a deterministic 32-byte Fernet key from settings.SECRET_KEY."""
    raw_secret = getattr(settings, "SECRET_KEY", "default-autoagenthire-secure-key-32-chars")
    key_bytes = hashlib.sha256(raw_secret.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_credential(plain_text: Optional[str]) -> str:
    """Encrypt an API key or access token before saving to database."""
    if not plain_text:
        return ""
    clean = plain_text.strip()
    if not clean:
        return ""
    f = _get_fernet()
    return f.encrypt(clean.encode("utf-8")).decode("utf-8")


def decrypt_credential(cipher_text: Optional[str]) -> str:
    """Decrypt an encrypted credential for backend service use only."""
    if not cipher_text:
        return ""
    clean = cipher_text.strip()
    if not clean:
        return ""
    f = _get_fernet()
    try:
        return f.decrypt(clean.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Failed to decrypt API credential: token or SECRET_KEY mismatch.")


def mask_credential(credential_str: Optional[str]) -> str:
    """
    Produce a safe masked preview for UI presentation.
    Never reveals the complete API key.
    
    Example:
        'gh_harvest_9a8b7c6d5e4f3a2b1' -> 'gh_h••••••••a2b1'
    """
    if not credential_str:
        return ""
    clean = credential_str.strip()
    if len(clean) <= 8:
        return "••••••••"
    return clean[:4] + "••••••••" + clean[-4:]

