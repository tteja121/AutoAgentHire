"""
Generic / Custom ATS REST API Adapter.
Allows connecting custom corporate ATS endpoints exposing a JSON REST feed of applications.
"""
import json
import urllib.request
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedApplication, NormalizedJobListing


class GenericAtsAdapter(BaseIntegrationAdapter):
    provider_id = "generic_ats"
    provider_name = "Custom / Enterprise ATS"
    auth_type = "bearer_token"
    is_supported = True
    required_config_fields = ["api_base_url"]
    instructions = "Connect any custom REST ATS API. Provide the API Base URL exposing '/applications' (or custom endpoint) and an Authorization Bearer token."

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": "AutoAgentHire-Integration/1.0",
        }
        if api_key and api_key.strip():
            headers["Authorization"] = f"Bearer {api_key.strip()}"
        return headers

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        url = (api_base_url or (config or {}).get("api_base_url") or "").strip().rstrip("/")
        if not url:
            return False, "API Base URL is required for Custom ATS integration."

        test_url = f"{url}/health" if not url.endswith("/applications") else url
        try:
            req = urllib.request.Request(test_url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 204):
                    return True, "Successfully verified custom ATS connection."
                return False, f"Server responded with HTTP {resp.status}."
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return False, "Invalid authentication token for custom ATS (HTTP 401 Unauthorized)."
            return False, f"Custom ATS responded with HTTP {e.code}."
        except Exception as exc:
            return False, f"Failed to connect to custom ATS: {str(exc)}"

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        base_url = (api_base_url or (config or {}).get("api_base_url") or "").strip().rstrip("/")
        if not base_url:
            return [], "API Base URL is not configured."

        endpoint = base_url if "/applications" in base_url else f"{base_url}/applications"
        url = f"{endpoint}?limit={min(limit, 100)}"
        
        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch from Custom ATS: HTTP {e.code}"
        except Exception as exc:
            return [], f"Custom ATS connection error: {str(exc)}"

        raw_list = payload if isinstance(payload, list) else payload.get("data", payload.get("applications", []))
        if not isinstance(raw_list, list):
            return [], "Custom ATS response was not a JSON list of application objects."

        applications: List[NormalizedApplication] = []
        default_company = (config or {}).get("company_name", "Enterprise Organization")

        for idx, item in enumerate(raw_list):
            if not isinstance(item, dict):
                continue

            app_id = str(item.get("id") or item.get("application_id") or item.get("uuid") or f"app-{idx+1}")
            title = item.get("job_title") or item.get("title") or item.get("position") or "Imported Position"
            company = item.get("company_name") or item.get("company") or default_company

            app_date_str = item.get("application_date") or item.get("applied_at") or item.get("created_at")
            app_date = None
            if app_date_str:
                try:
                    app_date = datetime.fromisoformat(str(app_date_str).replace("Z", "+00:00"))
                except Exception:
                    pass

            applications.append(
                NormalizedApplication(
                    external_application_id=app_id,
                    job_title=title,
                    company_name=company,
                    job_location=item.get("location") or item.get("job_location"),
                    application_date=app_date,
                    application_status=item.get("status") or item.get("application_status") or "imported",
                    job_description=item.get("job_description") or item.get("description"),
                    job_posting_url=item.get("job_url") or item.get("posting_url"),
                    candidate_name=item.get("candidate_name") or item.get("name"),
                    candidate_email=item.get("candidate_email") or item.get("email"),
                    raw_data=item,
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
        base_url = (api_base_url or (config or {}).get("api_base_url") or "").strip().rstrip("/")
        if not base_url:
            return [], "API Base URL is not configured for Custom ATS."

        endpoint = base_url if "/jobs" in base_url else f"{base_url}/jobs"
        url = f"{endpoint}?limit={min(limit, 100)}"

        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch jobs from Custom ATS: HTTP {e.code}"
        except Exception as exc:
            return [], f"Custom ATS connection error: {str(exc)}"

        raw_list = payload if isinstance(payload, list) else payload.get("data", payload.get("jobs", payload.get("items", [])))
        if not isinstance(raw_list, list):
            return [], "Custom ATS response was not a JSON list of job objects."

        jobs_list: List[NormalizedJobListing] = []
        default_company = (config or {}).get("company_name", "Enterprise ATS")
        company_logo_url = (config or {}).get("company_logo_url")

        for idx, item in enumerate(raw_list):
            if not isinstance(item, dict):
                continue

            job_id = str(item.get("id") or item.get("job_id") or item.get("external_id") or f"ext-job-{idx+1}")
            title = item.get("title") or item.get("job_title") or item.get("role") or "Open Role"
            company = item.get("company_name") or item.get("company") or default_company
            loc = item.get("location") or item.get("job_location") or "Remote"
            is_remote = "remote" in loc.lower() or bool(item.get("is_remote")) or item.get("workplace_type") == "remote"
            workplace_type = "remote" if is_remote else ("hybrid" if "hybrid" in loc.lower() else "on-site")
            emp_type = item.get("employment_type") or item.get("job_type") or "Full-time"
            desc = item.get("description") or item.get("job_description") or f"Role: {title} at {company}."
            posting_url = item.get("job_url") or item.get("url") or item.get("posting_url") or f"{base_url}/jobs/{job_id}"

            # Skills
            skills_raw = item.get("skills") or item.get("required_skills") or []
            skills_list = skills_raw if isinstance(skills_raw, list) else [s.strip() for s in str(skills_raw).split(",") if s.strip()]

            # Posted date
            posted_at = None
            raw_date = item.get("posted_at") or item.get("created_at") or item.get("date")
            if raw_date:
                try:
                    posted_at = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                except Exception:
                    pass

            jobs_list.append(
                NormalizedJobListing(
                    external_job_id=job_id,
                    job_title=title,
                    company_name=company,
                    company_logo_url=company_logo_url,
                    job_description=desc,
                    location=loc,
                    workplace_type=workplace_type,
                    employment_type=emp_type,
                    salary=item.get("salary") or item.get("salary_range") or None,
                    skills=skills_list,
                    job_posting_url=posting_url,
                    posted_at=posted_at,
                    status="active" if item.get("status") in ("active", "open", None) else str(item.get("status")),
                    raw_data=item,
                )
            )

        return jobs_list, None

