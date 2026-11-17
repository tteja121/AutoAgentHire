"""
AutoAgentHire Integrations Package.
"""
from backend.integrations.registry import get_adapter, list_supported_providers
from backend.integrations.security import encrypt_credential, decrypt_credential, mask_credential

__all__ = [
    "get_adapter",
    "list_supported_providers",
    "encrypt_credential",
    "decrypt_credential",
    "mask_credential",
]

