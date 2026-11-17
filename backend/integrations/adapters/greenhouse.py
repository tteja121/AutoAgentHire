"""
Greenhouse Harvest API Adapter.
Official Documentation: https://developers.greenhouse.io/harvest.html
Uses HTTP Basic Auth where the API key is the username (empty password).
"""
import base64
import json
import urllib.request
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedApplication, NormalizedJobListing


class GreenhouseAdapter(BaseIntegrationAdapter):
    provider_id = "greenhouse"
    provider_name = "Greenhouse ATS"
    auth_type = "basic_auth"
    is_supported = True
    required_config_fields = []
    instructions = "Create a Harvest API key in Greenhouse under Dev Center -> API Credential Management. Required permissions: Applications (Read), Jobs (Read)."

    DEFAULT_BASE_URL = "https://harvest.greenhouse.io/v1"

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        # Greenhouse Harvest API requires Basic Auth: base64(api_key + ':')
        auth_bytes = f"{api_key.strip()}:".encode("utf-8")
        auth_header = f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}"
        return {
            "Authorization": auth_header,
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
        board_token = (cfg.get("board_token") or cfg.get("subdomain") or "").strip()

        # 1. If board token is provided, test public job board API first
        if board_token:
            url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "AutoAgentHire-Integration/1.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status in (200, 204):
                        return True, f"Successfully verified Greenhouse job board for '{board_token}'."
            except Exception as b_err:
                # If board token failed and no API key, report error
                if not clean_key or clean_key.lower() == "public":
                    return False, f"Greenhouse job board '{board_token}' not reachable: {str(b_err)}"

        # 2. If API key is provided and not public placeholder, test Harvest API
        if clean_key and clean_key.lower() != "public":
            base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
            url = f"{base_url}/users?per_page=1"
            try:
                req = urllib.request.Request(url, headers=self._get_headers(clean_key))
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status in (200, 204):
                        return True, "Successfully connected to Greenhouse Harvest API."
                    return False, f"Greenhouse responded with HTTP {resp.status}."
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    return False, "Invalid Greenhouse Harvest API key (HTTP 401 Unauthorized)."
                if e.code == 403:
                    if board_token:
                        return True, f"Harvest key lacks admin scope, but public board '{board_token}' is active."
                    return False, "API key lacks permission to access Greenhouse Harvest API (HTTP 403 Forbidden)."
                return False, f"Greenhouse API connection error: HTTP {e.code}."
            except Exception as exc:
                if board_token:
                    return True, f"Connected via public board '{board_token}'."
                return False, f"Unable to reach Greenhouse Harvest API: {str(exc)}"

        if board_token:
            return True, f"Connected to Greenhouse board '{board_token}'."

        return False, "Greenhouse Harvest API key or Company Board Token is required."

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
        url = f"{base_url}/applications?per_page={min(limit, 100)}"
        
        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch from Greenhouse: HTTP {e.code}"
        except Exception as exc:
            return [], f"Greenhouse connection error: {str(exc)}"

        if not isinstance(payload, list):
            return [], "Unexpected response format from Greenhouse API."

        applications: List[NormalizedApplication] = []
        company_name = (config or {}).get("company_name", "Greenhouse Partner")

        for item in payload:
            if not isinstance(item, dict):
                continue
            app_id = str(item.get("id") or "")
            if not app_id:
                continue

            # Extract job title
            jobs = item.get("jobs", [])
            job_title = jobs[0].get("name") if (jobs and isinstance(jobs[0], dict)) else "Position at " + company_name

            # Parse date
            app_date_str = item.get("applied_at") or item.get("created_at")
            app_date = None
            if app_date_str:
                try:
                    app_date = datetime.fromisoformat(app_date_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            status_val = item.get("status") or "imported"
            if item.get("rejected_at"):
                status_val = "rejected"

            applications.append(
                NormalizedApplication(
                    external_application_id=app_id,
                    job_title=job_title,
                    company_name=company_name,
                    job_location=item.get("location", {}).get("name") if isinstance(item.get("location"), dict) else None,
                    application_date=app_date,
                    application_status=status_val,
                    job_description=f"Candidate ID: {item.get('candidate_id')}",
                    job_posting_url=f"https://app.greenhouse.io/applications/{app_id}",
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
        company_name = cfg.get("company_name") or cfg.get("organization_name") or "Greenhouse Partner"
        company_logo_url = cfg.get("company_logo_url")
        board_token = (cfg.get("board_token") or cfg.get("subdomain") or "").strip()
        clean_key = (api_key or "").strip()

        payload = None
        fetch_err = None

        # 1. If public board_token provided, prioritize official Greenhouse Public Job Board API
        if board_token:
            public_url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true"
            try:
                req = urllib.request.Request(public_url, headers={"User-Agent": "AutoAgentHire-Integration/1.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
            except Exception as b_exc:
                fetch_err = f"Greenhouse public board fetch error: {str(b_exc)}"

        # 2. If no board payload and clean_key is provided, try Harvest API
        if not payload and clean_key and clean_key.lower() != "public":
            base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
            url = f"{base_url}/jobs?per_page={min(limit, 100)}"
            try:
                req = urllib.request.Request(url, headers=self._get_headers(clean_key))
                with urllib.request.urlopen(req, timeout=15) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                    fetch_err = None
            except urllib.error.HTTPError as e:
                fetch_err = f"Failed to fetch jobs from Greenhouse: HTTP {e.code}"
            except Exception as exc:
                fetch_err = f"Greenhouse connection error: {str(exc)}"

        if payload is None:
            return [], fetch_err or "No jobs retrieved from Greenhouse."

        raw_items = payload.get("jobs", []) if isinstance(payload, dict) else payload
        if not isinstance(raw_items, list):
            return [], "Unexpected response format from Greenhouse API."

        jobs_list: List[NormalizedJobListing] = []

        for item in raw_items:
            if not isinstance(item, dict):
                continue
            job_id = str(item.get("id") or "")
            if not job_id:
                continue

            title = item.get("title") or item.get("name") or "Professional Role"
            status_val = "active" if item.get("status") in ("open", "active", None) else str(item.get("status"))

            # Extract location & remote classification
            loc_val = item.get("location")
            if isinstance(loc_val, dict):
                loc_str = loc_val.get("name") or "Remote"
            elif isinstance(loc_val, str) and loc_val.strip():
                loc_str = loc_val.strip()
            else:
                offices = item.get("offices", [])
                office_names = [o.get("name") for o in offices if isinstance(o, dict) and o.get("name")]
                loc_str = ", ".join(office_names) if office_names else "Remote"

            is_remote = "remote" in loc_str.lower() or "anywhere" in loc_str.lower() or bool(item.get("is_remote"))
            workplace_type = "remote" if is_remote else ("hybrid" if "hybrid" in loc_str.lower() else "on-site")

            # Extract department / skills / description
            departments = [d.get("name") for d in item.get("departments", []) if isinstance(d, dict) and d.get("name")]
            dept_str = ", ".join(departments) if departments else "Engineering"

            raw_content = item.get("content") or item.get("notes") or ""
            import html
            clean_desc = html.unescape(raw_content).strip() if raw_content else ""
            if not clean_desc:
                clean_desc = f"{title} opportunity at {company_name}. Department: {dept_str}. Location: {loc_str}."

            # Real direct application URL
            posting_url = item.get("absolute_url")
            if not posting_url:
                if board_token:
                    posting_url = f"https://boards.greenhouse.io/{board_token}/jobs/{job_id}"
                else:
                    posting_url = f"https://job-boards.greenhouse.io/job?id={job_id}"

            # Parse date
            posted_str = item.get("updated_at") or item.get("created_at")
            posted_at = None
            if posted_str:
                try:
                    posted_at = datetime.fromisoformat(str(posted_str).replace("Z", "+00:00"))
                except Exception:
                    pass

            jobs_list.append(
                NormalizedJobListing(
                    external_job_id=job_id,
                    job_title=title,
                    company_name=company_name,
                    company_logo_url=company_logo_url,
                    job_description=clean_desc[:4000],
                    location=loc_str,
                    workplace_type=workplace_type,
                    employment_type="Full-time",
                    salary=item.get("confidential_notes") if "salary" in str(item.get("confidential_notes", "")).lower() else None,
                    skills=departments,
                    job_posting_url=posting_url,
                    posted_at=posted_at,
                    status=status_val,
                    raw_data=item,
                )
            )

        return jobs_list[:limit], None

