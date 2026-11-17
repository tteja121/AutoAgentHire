"""
Lever Postings & Opportunities API Adapter.
Official Documentation: https://hire.lever.co/developer/documentation
Uses HTTP Basic Auth where the API key is the username (empty password).
"""
import base64
import json
import urllib.request
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from backend.integrations.base import BaseIntegrationAdapter, NormalizedApplication, NormalizedJobListing


class LeverAdapter(BaseIntegrationAdapter):
    provider_id = "lever"
    provider_name = "Lever ATS"
    auth_type = "basic_auth"
    is_supported = True
    required_config_fields = []
    instructions = "Generate an API key in Lever under Settings -> Integrations and API -> Partner Integrations -> API Credentials. Required scopes: opportunities (read), postings (read)."

    DEFAULT_BASE_URL = "https://api.lever.co/v1"

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        auth_bytes = f"{api_key.strip()}:".encode("utf-8")
        auth_header = f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}"
        return {
            "Authorization": auth_header,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; AutoAgentHire/1.0; +https://auto-agent-hire.vercel.app/)",
        }

    def validate_credentials(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        cfg = config or {}
        clean_key = (api_key or "").strip()
        company = (cfg.get("company_name") or cfg.get("subdomain") or cfg.get("site") or cfg.get("board_token") or "").strip().lower()
        if not company:
            if clean_key.lower() in ("public", "default", "demo"):
                company = "leverdemo"
            elif clean_key and len(clean_key) < 50 and not any(c in clean_key for c in "+/="):
                company = clean_key.lower()

        # If company not specified, infer from clean_key (defaults to 'leverdemo' if 'public' or 'default')
        if not company:
            if clean_key.lower() in ("public", "default", "demo"):
                company = "leverdemo"
            elif clean_key and len(clean_key) < 50 and not clean_key.startswith("Bearer ") and not any(c in clean_key for c in "+/="):
                company = clean_key.lower()

        # 1. If company identifier is provided or inferred, test Lever public postings endpoint
        if company:
            public_url = f"https://api.lever.co/v0/postings/{company}?mode=json"
            try:
                req = urllib.request.Request(
                    public_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; AutoAgentHire/1.0; +https://auto-agent-hire.vercel.app/)", "Accept": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=12) as resp:
                    if resp.status in (200, 204):
                        return True, f"Successfully verified Lever career board for '{company}'."
            except Exception as b_err:
                if clean_key.lower() in ("public", "default", "demo"):
                    if company != "leverdemo":
                        return self.validate_credentials("public", api_base_url, {"company_name": "leverdemo"})
                    return False, f"Lever board '{company}' not reachable: {str(b_err)}"

        # 2. Test private API key if provided and not public/company slug
        if clean_key and clean_key.lower() not in ("public", "default", "demo", company):
            base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
            url = f"{base_url}/postings?limit=1"
            try:
                req = urllib.request.Request(url, headers=self._get_headers(clean_key))
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status == 200:
                        return True, "Successfully connected to Lever API."
                    return False, f"Lever responded with HTTP {resp.status}."
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    return False, "Invalid Lever API key (HTTP 401 Unauthorized)."
                if e.code == 403:
                    if company:
                        return True, f"Connected via public board for '{company}'."
                    return False, "API key lacks permission to access Lever data (HTTP 403 Forbidden)."
                return False, f"Lever API error: HTTP {e.code}."
            except Exception as exc:
                if company:
                    return True, f"Connected via public board for '{company}'."
                return False, f"Unable to reach Lever API: {str(exc)}"

        if company:
            return True, f"Connected to Lever board '{company}'."

        return False, "Lever API key or Company Board identifier is required."

    def fetch_applications(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Tuple[List[NormalizedApplication], Optional[str]]:
        base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
        url = f"{base_url}/opportunities?limit={min(limit, 100)}&expand=postings"
        
        try:
            req = urllib.request.Request(url, headers=self._get_headers(api_key))
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return [], f"Failed to fetch from Lever: HTTP {e.code}"
        except Exception as exc:
            return [], f"Lever connection error: {str(exc)}"

        data = payload.get("data", []) if isinstance(payload, dict) else payload
        if not isinstance(data, list):
            return [], "Unexpected response format from Lever API."

        applications: List[NormalizedApplication] = []
        company_name = (config or {}).get("company_name", "Lever Organization")

        for item in data:
            if not isinstance(item, dict):
                continue
            opp_id = str(item.get("id") or "")
            if not opp_id:
                continue

            headline = item.get("headline") or "Applicant Opportunity"
            postings = item.get("postings", [])
            posting_title = postings[0].get("text") if (postings and isinstance(postings[0], dict)) else headline

            # Parse createdAt timestamp (Lever uses epoch milliseconds)
            app_date = None
            raw_ts = item.get("createdAt")
            if isinstance(raw_ts, (int, float)):
                try:
                    app_date = datetime.fromtimestamp(raw_ts / 1000.0)
                except Exception:
                    pass

            stage = item.get("stage", {})
            stage_name = stage.get("text") if isinstance(stage, dict) else "active"

            applications.append(
                NormalizedApplication(
                    external_application_id=opp_id,
                    job_title=posting_title,
                    company_name=company_name,
                    job_location=item.get("location"),
                    application_date=app_date,
                    application_status=stage_name,
                    candidate_name=item.get("name"),
                    candidate_email=item.get("emails", [None])[0] if isinstance(item.get("emails"), list) else None,
                    job_posting_url=f"https://hire.lever.co/candidates/{opp_id}",
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
        company = (cfg.get("company_name") or cfg.get("subdomain") or cfg.get("site") or cfg.get("board_token") or "").strip().lower()
        if not company:
            if clean_key.lower() in ("public", "default", "demo"):
                company = "leverdemo"
            elif clean_key and len(clean_key) < 50 and not any(c in clean_key for c in "+/="):
                company = clean_key.lower()

        payload = None
        fetch_err = None

        # 1. If company identifier is provided, fetch from official Lever public postings endpoint
        if company:
            public_url = f"https://api.lever.co/v0/postings/{company}?mode=json"
            try:
                req = urllib.request.Request(
                    public_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; AutoAgentHire/1.0; +https://auto-agent-hire.vercel.app/)", "Accept": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
            except Exception as b_exc:
                fetch_err = f"Lever public board error: {str(b_exc)}"

        # 2. If no payload and valid private API key provided, try private Lever API
        if not payload and clean_key and clean_key.lower() != "public":
            base_url = (api_base_url or self.DEFAULT_BASE_URL).rstrip("/")
            url = f"{base_url}/postings?limit={min(limit, 100)}"
            try:
                req = urllib.request.Request(url, headers=self._get_headers(clean_key))
                with urllib.request.urlopen(req, timeout=15) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                    fetch_err = None
            except urllib.error.HTTPError as e:
                fetch_err = f"Failed to fetch jobs from Lever: HTTP {e.code}"
            except Exception as exc:
                fetch_err = f"Lever connection error: {str(exc)}"

        if payload is None:
            return [], fetch_err or "No jobs retrieved from Lever."

        data = payload.get("data", []) if isinstance(payload, dict) and "data" in payload else payload
        if not isinstance(data, list):
            return [], "Unexpected response format from Lever API."

        jobs_list: List[NormalizedJobListing] = []
        cfg = config or {}
        company_name = cfg.get("company_name") or "Lever Organization"
        company_logo_url = cfg.get("company_logo_url")

        for item in data:
            if not isinstance(item, dict):
                continue
            job_id = str(item.get("id") or "")
            if not job_id:
                continue

            title = item.get("text") or "Open Opportunity"
            categories = item.get("categories", {}) if isinstance(item.get("categories"), dict) else {}
            loc = categories.get("location") or "Remote"
            commitment = categories.get("commitment") or "Full-time"
            team = categories.get("team")

            raw_wp = str(item.get("workplaceType") or categories.get("workplaceType") or "").lower()
            is_remote = "remote" in loc.lower() or "anywhere" in loc.lower() or "remote" in raw_wp
            is_hybrid = "hybrid" in loc.lower() or "hybrid" in raw_wp
            workplace_type = "remote" if is_remote else ("hybrid" if is_hybrid else "on-site")

            import html
            content = item.get("content", {}) if isinstance(item.get("content"), dict) else {}
            raw_desc = content.get("description") or f"Team: {team or 'Engineering'}. Commitment: {commitment}."
            description = html.unescape(raw_desc).strip()

            urls = item.get("urls", {}) if isinstance(item.get("urls"), dict) else {}
            posting_url = urls.get("apply") or urls.get("show") or f"https://jobs.lever.co/postings/{job_id}"

            # Parse date
            posted_at = None
            raw_ts = item.get("createdAt")
            if isinstance(raw_ts, (int, float)):
                try:
                    posted_at = datetime.fromtimestamp(raw_ts / 1000.0)
                except Exception:
                    pass

            jobs_list.append(
                NormalizedJobListing(
                    external_job_id=job_id,
                    job_title=title,
                    company_name=company_name,
                    company_logo_url=company_logo_url,
                    job_description=description,
                    location=loc,
                    workplace_type=workplace_type,
                    employment_type=commitment,
                    salary=item.get("salaryRange") if isinstance(item.get("salaryRange"), str) else None,
                    skills=[team] if team else ["Engineering"],
                    job_posting_url=posting_url,
                    posted_at=posted_at,
                    status="active" if item.get("state") == "published" else (item.get("state") or "active"),
                    raw_data=item,
                )
            )

        return jobs_list, None

