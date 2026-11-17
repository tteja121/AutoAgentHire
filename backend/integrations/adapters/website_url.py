"""
Website URL Integration Adapter for AutoAgentHire.
Allows importing and synchronizing public job listings directly from corporate careers URLs
without requiring API keys or partner credentials.
"""
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedJobListing, NormalizedApplication


class WebsiteUrlAdapter(BaseIntegrationAdapter):
    provider_id = "website_url"
    provider_name = "Company Careers Website"
    auth_type = "public_url"
    is_supported = True
    required_config_fields = ["website_url"]
    instructions = "Provide any publicly accessible company careers page URL (e.g. https://company.com/careers). No API key required."

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        from backend.services.website_job_crawler import validate_url_security

        target_url = (api_base_url or (config or {}).get("website_url") or "").strip()
        if not target_url:
            return False, "Website URL is required."

        is_safe, clean_url, sec_err = validate_url_security(target_url)
        if not is_safe:
            return False, f"URL validation failed: {sec_err}"

        return True, f"Verified careers website URL: {clean_url}"

    def fetch_jobs(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedJobListing], Optional[str]]:
        from backend.services.website_job_crawler import crawl_and_extract_jobs

        target_url = (api_base_url or (config or {}).get("website_url") or "").strip()
        if not target_url:
            return [], "Website URL is not configured."

        conn_name = (config or {}).get("company_name") or (config or {}).get("name")
        res = crawl_and_extract_jobs(target_url, connection_name=conn_name, max_jobs=limit)

        if not res.get("success") and not res.get("jobs"):
            return [], res.get("error") or "No job listings discovered on website."

        from datetime import datetime
        raw_jobs = res.get("jobs", [])
        normalized: List[NormalizedJobListing] = []

        for j in raw_jobs:
            posted_at = None
            if j.get("posted_at"):
                try:
                    posted_at = datetime.fromisoformat(str(j["posted_at"]).replace("Z", "+00:00"))
                except Exception:
                    pass

            deadline = None
            if j.get("deadline"):
                try:
                    deadline = datetime.fromisoformat(str(j["deadline"]).replace("Z", "+00:00"))
                except Exception:
                    pass

            normalized.append(
                NormalizedJobListing(
                    external_job_id=str(j.get("temp_id") or hash(j.get("job_posting_url"))),
                    job_title=j.get("title") or "Open Position",
                    company_name=j.get("company_name") or res.get("company_name") or "Enterprise Partner",
                    job_description=j.get("description") or "",
                    location=j.get("location") or "Remote",
                    workplace_type=j.get("workplace_type") or "remote",
                    employment_type=j.get("employment_type") or "Full-time",
                    salary=j.get("salary") or "Competitive",
                    skills=j.get("skills") or [],
                    job_posting_url=j.get("job_posting_url") or target_url,
                    posted_at=posted_at,
                    deadline=deadline,
                    status="active",
                    raw_data=j,
                )
            )

        return normalized, None

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        # Public website crawling discovers jobs; candidate applications are submitted through AutoAgentHire
        return [], None
