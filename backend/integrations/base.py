"""
Base Provider Integration Adapter and Data Normalization Contracts.
Provides common interfaces for ATS and job portal API integrations.
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel, Field


class NormalizedApplication(BaseModel):
    """Unified application record format normalized across all provider APIs."""
    external_application_id: str = Field(..., description="Provider's unique application ID")
    job_title: str = Field(..., description="Job role title")
    company_name: str = Field(..., description="Company name")
    job_location: Optional[str] = Field(None, description="Location / remote status")
    application_date: Optional[datetime] = Field(None, description="Submission timestamp")
    application_status: str = Field("imported", description="Current status in provider system")
    job_description: Optional[str] = Field(None, description="Job description or notes")
    job_posting_url: Optional[str] = Field(None, description="Public posting URL")
    candidate_email: Optional[str] = Field(None, description="Applicant email")
    candidate_name: Optional[str] = Field(None, description="Applicant full name")
    raw_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Original JSON record")


class NormalizedJobListing(BaseModel):
    """Unified job listing schema normalized across all provider APIs."""
    external_job_id: str = Field(..., description="Provider's unique job identifier")
    job_title: str = Field(..., description="Job role title")
    company_name: str = Field(..., description="Company or organization name")
    company_logo_url: Optional[str] = Field(None, description="Company logo image URL")
    job_description: str = Field(..., description="Full or structured job description")
    location: str = Field("Remote", description="Job location or country")
    workplace_type: str = Field("remote", description="remote, hybrid, or on-site")
    employment_type: str = Field("Full-time", description="Full-time, Part-time, Contract, Internship")
    salary: Optional[str] = Field(None, description="Salary description e.g. $120k - $150k or Competitive")
    skills: List[str] = Field(default_factory=list, description="Required or mentioned skills")
    experience_level: Optional[str] = Field(None, description="Entry, Mid, Senior, Lead, Executive")
    job_posting_url: str = Field(..., description="Direct URL to view/apply on provider's site")
    posted_at: Optional[datetime] = Field(None, description="Original publication timestamp")
    deadline: Optional[datetime] = Field(None, description="Application deadline if provided")
    status: str = Field("active", description="Job availability status: active, closed, draft")
    raw_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Raw provider JSON response")

    @property
    def title(self) -> str:
        return self.job_title

    @property
    def description(self) -> str:
        return self.job_description


class BaseIntegrationAdapter(ABC):
    """Abstract contract for third-party job portal / ATS API adapters."""

    provider_id: str
    provider_name: str
    auth_type: str  # 'basic_auth', 'bearer_token', 'api_key', 'oauth2', 'unsupported'
    is_supported: bool = True
    unsupported_reason: Optional[str] = None
    required_config_fields: List[str] = []
    instructions: str = ""

    @abstractmethod
    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        """
        Validate that the provided credentials have valid access permissions.
        Returns: (is_valid, message_or_error)
        """
        pass

    @abstractmethod
    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        """
        Fetch applications from the provider's official API and return normalized records.
        Returns: (applications_list, error_if_any)
        """
        pass

    @abstractmethod
    def fetch_jobs(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[NormalizedJobListing], Optional[str]]:
        """
        Fetch available job listings from the provider's official API and return normalized job records.
        Returns: (jobs_list, error_if_any)
        """
        pass

