"""
Central Provider Adapter Registry.
Maps provider identifiers to concrete adapter implementations.
"""
from typing import Dict, List, Optional
from backend.integrations.base import BaseIntegrationAdapter
from backend.integrations.adapters.greenhouse import GreenhouseAdapter
from backend.integrations.adapters.lever import LeverAdapter
from backend.integrations.adapters.ashby import AshbyAdapter
from backend.integrations.adapters.workable import WorkableAdapter
from backend.integrations.adapters.generic_ats import GenericAtsAdapter
from backend.integrations.adapters.website_url import WebsiteUrlAdapter
from backend.integrations.adapters.unsupported import LinkedInAdapter, IndeedAdapter

_REGISTRY: Dict[str, BaseIntegrationAdapter] = {
    "greenhouse": GreenhouseAdapter(),
    "lever": LeverAdapter(),
    "ashby": AshbyAdapter(),
    "workable": WorkableAdapter(),
    "generic_ats": GenericAtsAdapter(),
    "website_url": WebsiteUrlAdapter(),
    "linkedin": LinkedInAdapter(),
    "indeed": IndeedAdapter(),
}


def get_adapter(provider_id: str) -> Optional[BaseIntegrationAdapter]:
    """Retrieve the adapter instance for a given provider ID."""
    return _REGISTRY.get((provider_id or "").strip().lower())


def list_supported_providers() -> List[dict]:
    """Return catalog of supported and enterprise-only providers for UI selection."""
    catalog = []
    for pid, adapter in _REGISTRY.items():
        catalog.append({
            "id": adapter.provider_id,
            "name": adapter.provider_name,
            "auth_type": adapter.auth_type,
            "is_supported": adapter.is_supported,
            "unsupported_reason": adapter.unsupported_reason,
            "required_config_fields": adapter.required_config_fields,
            "instructions": adapter.instructions,
        })
    return catalog

