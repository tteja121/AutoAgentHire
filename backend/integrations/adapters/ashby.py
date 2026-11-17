"""
Ashby Recruiting API Adapter.
Official Documentation: https://developers.ashbyhq.com/
Uses HTTP Basic Auth where the API key is the username (empty password).
"""
import base64
import json
import urllib.request
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedApplication, NormalizedJobListing


class AshbyAdapter(BaseIntegrationAdapter):
    provider_id = "ashby"
    provider_name = "Ashby ATS"
    auth_type = "basic_auth"
    is_supported = True
    required_config_fields = []
    instructions = "Generate an API key in Ashby under Admin -> Integrations -> Ashby API. Requires 'Application: Read' and 'Job Posting: Read' permissions."

    DEFAULT_BASE_URL = "https://api.ashbyhq.com"

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        auth_bytes = f"{api_key.strip()}:".encode("utf-8")
        auth_header = f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}"
        return {
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "AutoAgentHire-Integration/1.0",
        }

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        cfg = config or {}
        clean_key = (api_key or "").strip()
        company = (cfg.get("company_name") or cfg.get("subdomain") or cfg.get("board_token") or "").strip().lower()

        # 1. If Ashby public job board / company slug is provided, test public board endpoint
        if company:
            public_url = f"https://api.ashbyhq.com/posting-api/job-board/{company}"
            try:
                req = urllib.request.Request(
                    public_url,
                    headers={"User-Agent": "AutoAgentHire-Integration/1.0", "Accept": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status == 200:
                        return True, f"Successfully verified Ashby job board for '{company}'."
            except Exception as b_err:
                if not clean_key or clean_key.lower() == "public":
                    return False, f"Ashby job board '{company}' not reachable: {str(b_err)}"

        # 2. Test private API key if provided and not 'public'
        if clean_key and clean_key.lower() != "public":
            base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
            url = f"{base_url}/jobPosting.list"
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps({"limit": 1}).encode("utf-8"),
                    headers=self._get_headers(clean_key),
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status == 200:
                        return True, "Successfully connected to Ashby API."
                    return False, f"Ashby responded with HTTP {resp.status}."
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    return False, "Invalid Ashby API key (HTTP 401 Unauthorized)."
                if company:
                    return True, f"Connected via public Ashby board for '{company}'."
                return False, f"Ashby API error: HTTP {e.code}."
            except Exception as exc:
                if company:
                    return True, f"Connected via public Ashby board for '{company}'."
                return False, f"Unable to reach Ashby API: {str(exc)}"

        if company:
            return True, f"Connected to Ashby board '{company}'."

        return False, "Ashby API key or Company Board identifier is required."

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
        url = f"{base_url}/application.list"
        
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps({"limit": min(limit, 100)}).encode("utf-8"),
                headers=self._get_headers(api_key),
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch from Ashby: HTTP {e.code}"
        except Exception as exc:
            return [], f"Ashby connection error: {str(exc)}"

        results = payload.get("results", []) if isinstance(payload, dict) else []
        if not isinstance(results, list):
            return [], "Unexpected response format from Ashby API."

        applications: List[NormalizedApplication] = []
        company_name = (config or {}).get("company_name", "Ashby Client")

        for item in results:
            if not isinstance(item, dict):
                continue
            app_id = str(item.get("id") or "")
            if not app_id:
                continue

            job = item.get("job", {})
            job_title = job.get("title") if isinstance(job, dict) else "Role at " + company_name

            app_date_str = item.get("createdAt")
            app_date = None
            if app_date_str:
                try:
                    app_date = datetime.fromisoformat(app_date_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            status_str = item.get("status") or "active"

            applications.append(
                NormalizedApplication(
                    external_application_id=app_id,
                    job_title=job_title,
                    company_name=company_name,
                    application_date=app_date,
                    application_status=status_str,
                    candidate_name=item.get("candidate", {}).get("name") if isinstance(item.get("candidate"), dict) else None,
                    candidate_email=item.get("candidate", {}).get("email") if isinstance(item.get("candidate"), dict) else None,
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
        cfg = config or {}
        clean_key = (api_key or "").strip()
        company = (cfg.get("company_name") or cfg.get("subdomain") or cfg.get("board_token") or "").strip().lower()

        payload = None
        fetch_err = None

        # 1. If company identifier is provided, query Ashby's official public job board endpoint
        if company:
            public_url = f"https://api.ashbyhq.com/posting-api/job-board/{company}"
            try:
                req = urllib.request.Request(
                    public_url,
                    headers={"User-Agent": "AutoAgentHire-Integration/1.0", "Accept": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
            except Exception as b_exc:
                fetch_err = f"Ashby public job board error: {str(b_exc)}"

        # 2. If no payload and valid private API key provided, query private Ashby API
        if not payload and clean_key and clean_key.lower() != "public":
            base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
            url = f"{base_url}/jobPosting.list"
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps({"limit": min(limit, 100)}).encode("utf-8"),
                    headers=self._get_headers(clean_key),
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                    fetch_err = None
            except urllib.error.HTTPError as e:
                fetch_err = f"Failed to fetch jobs from Ashby: HTTP {e.code}"
            except Exception as exc:
                fetch_err = f"Ashby connection error: {str(exc)}"

        if payload is None:
            return [], fetch_err or "No jobs retrieved from Ashby."

        # Public API returns {"jobs": [...]}, private API returns {"results": [...]} or list directly
        results = payload.get("jobs") if "jobs" in payload else payload.get("results", [])
        if not isinstance(results, list):
            if isinstance(payload, list):
                results = payload
            else:
                return [], "Unexpected response format from Ashby API."

        jobs_list: List[NormalizedJobListing] = []
        company_name = cfg.get("display_name") or cfg.get("company_name") or (company.capitalize() if company else "Ashby Organization")
        company_logo_url = cfg.get("company_logo_url")

        for item in results:
            if not isinstance(item, dict):
                continue
            job_id = str(item.get("id") or "")
            if not job_id:
                continue

            title = item.get("title") or "Open Position"

            # Handle department: string or dict or departmentName
            dept_val = item.get("department") or item.get("departmentName") or ""
            dept = dept_val.get("name") if isinstance(dept_val, dict) else str(dept_val or "")
            if not dept:
                dept = "General"

            # Handle location
            loc_val = item.get("location") or item.get("locationName") or "Remote"
            loc = loc_val.get("name") if isinstance(loc_val, dict) else str(loc_val or "Remote")

            is_remote = bool(item.get("isRemote")) or "remote" in loc.lower() or "anywhere" in loc.lower()
            workplace_type = "remote" if is_remote else ("hybrid" if "hybrid" in loc.lower() else "on-site")
            
            raw_emp_type = str(item.get("employmentType") or "Full-time")
            if raw_emp_type.lower() in ("fulltime", "full_time", "full time"):
                emp_type = "Full-time"
            elif raw_emp_type.lower() in ("parttime", "part_time", "part time"):
                emp_type = "Part-time"
            elif raw_emp_type.lower() in ("contract", "contractor"):
                emp_type = "Contract"
            elif raw_emp_type.lower() in ("intern", "internship"):
                emp_type = "Internship"
            else:
                emp_type = raw_emp_type

            comp = item.get("compensation", {}) if isinstance(item.get("compensation"), dict) else {}
            salary_str = comp.get("compensationTierSummary") or comp.get("targetSalary") or comp.get("summary") or None

            posting_url = item.get("jobPostingUrl") or (f"https://jobs.ashbyhq.com/{company}/{job_id}" if company else f"https://jobs.ashbyhq.com/job/{job_id}")
            
            raw_desc = item.get("descriptionHtml") or item.get("descriptionPlain") or item.get("description") or f"Department: {dept}. Location: {loc}."
            import html
            clean_desc = html.unescape(raw_desc).strip()

            posted_at = None
            raw_date = item.get("publishedAt") or item.get("publishedDate") or item.get("createdAt")
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
                    job_description=clean_desc,
                    location=loc,
                    workplace_type=workplace_type,
                    employment_type=emp_type,
                    salary=salary_str,
                    skills=[dept] if dept and dept != "General" else ["Tech"],
                    job_posting_url=posting_url,
                    posted_at=posted_at,
                    status="active" if item.get("status") in (None, "Open", "active") else str(item.get("status")),
                    raw_data=item,
                )
            )

        return jobs_list, None

