"""
Workable Recruiting API Adapter.
Official Documentation: https://workable.readme.io/
Uses Bearer token authentication scoped to the company subdomain.
"""
import json
import urllib.request
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedApplication, NormalizedJobListing


class WorkableAdapter(BaseIntegrationAdapter):
    provider_id = "workable"
    provider_name = "Workable ATS"
    auth_type = "bearer_token"
    is_supported = True
    required_config_fields = ["subdomain"]
    instructions = "Create an API Key in Workable under Settings -> Integrations -> Access Tokens. Enter your company's Workable subdomain (e.g., 'acme' from acme.workable.com)."

    def _resolve_base_url(self, api_base_url: Optional[str], config: Optional[Dict[str, Any]]) -> str:
        if api_base_url and api_base_url.strip():
            return api_base_url.rstrip("/")
        subdomain = ((config or {}).get("subdomain") or "api").strip()
        return f"https://{subdomain}.workable.com/spi/v3"

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key.strip()}",
            "Accept": "application/json",
            "User-Agent": "AutoAgentHire-Integration/1.0",
        }

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        if not api_key or not api_key.strip():
            return False, "Workable API token is required."

        subdomain = ((config or {}).get("subdomain") or "").strip()
        if not subdomain and not api_base_url:
            return False, "Workable subdomain is required (e.g., 'acme' from acme.workable.com)."

        base_url = self._resolve_base_url(api_base_url, config)
        url = f"{base_url}/jobs?limit=1"
        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    return True, "Successfully connected to Workable API."
                return False, f"Workable responded with HTTP {resp.status}."
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return False, "Invalid Workable API token (HTTP 401 Unauthorized)."
            if e.code == 404:
                return False, f"Invalid Workable subdomain '{subdomain}'. Please verify your organization subdomain."
            return False, f"Workable API error: HTTP {e.code}."
        except Exception as exc:
            return False, f"Unable to reach Workable API: {str(exc)}"

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        base_url = self._resolve_base_url(api_base_url, config)
        url = f"{base_url}/candidates?limit={min(limit, 100)}"
        
        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch from Workable: HTTP {e.code}"
        except Exception as exc:
            return [], f"Workable connection error: {str(exc)}"

        candidates = payload.get("candidates", []) if isinstance(payload, dict) else []
        if not isinstance(candidates, list):
            return [], "Unexpected response format from Workable API."

        applications: List[NormalizedApplication] = []
        company_name = (config or {}).get("company_name", (config or {}).get("subdomain", "Workable Employer"))

        for cand in candidates:
            if not isinstance(cand, dict):
                continue
            cand_id = str(cand.get("id") or "")
            if not cand_id:
                continue

            job_title = cand.get("job", {}).get("title") if isinstance(cand.get("job"), dict) else "Job Applicant"
            
            app_date_str = cand.get("created_at")
            app_date = None
            if app_date_str:
                try:
                    app_date = datetime.fromisoformat(app_date_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            applications.append(
                NormalizedApplication(
                    external_application_id=cand_id,
                    job_title=job_title,
                    company_name=company_name,
                    job_location=cand.get("location"),
                    application_date=app_date,
                    application_status=cand.get("stage") or "applied",
                    candidate_name=cand.get("name"),
                    candidate_email=cand.get("email"),
                    job_posting_url=cand.get("profile_url"),
                    raw_data=cand,
                )
            )

        return applications, None

    def fetch_jobs(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[NormalizedJobListing], Optional[str]]:
        base_url = self._resolve_base_url(api_base_url, config)
        url = f"{base_url}/jobs?limit={min(limit, 100)}"

        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch jobs from Workable: HTTP {e.code}"
        except Exception as exc:
            return [], f"Workable connection error: {str(exc)}"

        jobs_data = payload.get("jobs", []) if isinstance(payload, dict) else payload
        if not isinstance(jobs_data, list):
            return [], "Unexpected response format from Workable API."

        jobs_list: List[NormalizedJobListing] = []
        cfg = config or {}
        company_name = cfg.get("company_name") or cfg.get("subdomain") or "Workable Employer"
        company_logo_url = cfg.get("company_logo_url")

        for item in jobs_data:
            if not isinstance(item, dict):
                continue
            job_id = str(item.get("shortcode") or item.get("id") or "")
            if not job_id:
                continue

            title = item.get("title") or "Open Role"
            dept = item.get("department") or "Engineering"
            loc_obj = item.get("location", {}) if isinstance(item.get("location"), dict) else {}
            loc_str = loc_obj.get("location_str") or loc_obj.get("city") or "Remote"
            is_telecommuting = bool(loc_obj.get("telecommuting")) or "remote" in loc_str.lower()
            workplace_type = "remote" if is_telecommuting else "on-site"

            emp_type = str(item.get("employment_type") or "full_time").replace("_", "-").capitalize()
            posting_url = item.get("url") or item.get("application_url") or f"https://apply.workable.com/j/{job_id}/"
            import html
            raw_desc = item.get("description") or f"Department: {dept}. Location: {loc_str}."
            description = html.unescape(raw_desc).strip()

            posted_at = None
            raw_date = item.get("created_at")
            if raw_date:
                try:
                    posted_at = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                except Exception:
                    pass

            jobs_list.append(
                NormalizedJobListing(
                    external_job_id=job_id,
                    job_title=title,
                    company_name=company_name,
                    company_logo_url=company_logo_url,
                    job_description=description,
                    location=loc_str,
                    workplace_type=workplace_type,
                    employment_type=emp_type,
                    salary=item.get("salary") or None,
                    skills=[dept] if dept else [],
                    job_posting_url=posting_url,
                    posted_at=posted_at,
                    status="active" if item.get("state") == "published" else (item.get("state") or "active"),
                    raw_data=item,
                )
            )

        return jobs_list, None

