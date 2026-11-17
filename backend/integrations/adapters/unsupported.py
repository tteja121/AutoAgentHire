"""
Unsupported / Enterprise-Only Job Portals (LinkedIn, Indeed).
Transparently informs users why direct API key ingestion is not supported by these providers,
preventing brittle scraping or fake credentials.
"""
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedApplication, NormalizedJobListing


class LinkedInAdapter(BaseIntegrationAdapter):
    provider_id = "linkedin"
    provider_name = "LinkedIn Recruiter"
    auth_type = "oauth2"
    is_supported = False
    unsupported_reason = (
        "LinkedIn does not provide public REST API keys for retrieving candidate applications or job listings. "
        "Access requires an approved enterprise LinkedIn Talent Solutions Partner agreement and "
        "OAuth 2.0 Partner Program authorization. Direct API key ingestion is strictly unsupported by LinkedIn."
    )
    instructions = "Requires LinkedIn Talent Solutions Partner credentials. Contact LinkedIn Enterprise Sales."

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        return False, self.unsupported_reason

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        return [], self.unsupported_reason

    def fetch_jobs(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[NormalizedJobListing], Optional[str]]:
        return [], self.unsupported_reason


class IndeedAdapter(BaseIntegrationAdapter):
    provider_id = "indeed"
    provider_name = "Indeed Employer"
    auth_type = "oauth2"
    is_supported = False
    unsupported_reason = (
        "Indeed requires approved Indeed Apply Developer OAuth 2.0 tokens and employer partnership verification. "
        "Arbitrary third-party API keys are rejected by Indeed's security policy."
    )
    instructions = "Requires Indeed Developer Portal approval and OAuth2 client credentials."

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        return False, self.unsupported_reason

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        return [], self.unsupported_reason

    def fetch_jobs(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[NormalizedJobListing], Optional[str]]:
        return [], self.unsupported_reason

