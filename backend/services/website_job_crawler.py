"""
Website Job Crawler & Extraction Service for AutoAgentHire.
Supports scanning and importing publicly accessible job listings from company careers
websites without requiring an API key.

Includes comprehensive SSRF protection, robots.txt compliance, structured JobPosting
JSON-LD extraction, embedded ATS auto-detection (Greenhouse, Lever, Ashby, Workable),
HTML semantic fallback extraction, and duplicate detection.
"""
import ipaddress
import json
import logging
import re
import socket
import time
import urllib.parse
import urllib.robotparser
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore

from backend.integrations.base import NormalizedJobListing

logger = logging.getLogger(__name__)

# Security configuration
ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "metadata.google.internal",
    "169.254.169.254",
    "100.100.100.200",
    "instance-data",
}
MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # 5 MB safety limit
DEFAULT_TIMEOUT_SECONDS = 10
MAX_SUBPAGE_FETCHES = 10
USER_AGENT = "AutoAgentHire-Bot/1.0 (+https://autoagenthire.com/bot; public job discovery)"


class SSRFSecurityError(Exception):
    """Raised when a URL targets a restricted, private, or loopback network address."""
    pass


# ── 1. SSRF & URL Security Validation ──────────────────────────────────────────

def validate_url_security(url: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validate that the URL is a safe, publicly reachable HTTP/HTTPS destination.
    Rejects localhost, loopback, private RFC-1918, link-local, cloud metadata,
    and invalid schemes to prevent Server-Side Request Forgery (SSRF).

    Returns:
        (is_safe, normalized_url_or_none, error_message_or_none)
    """
    if not url or not isinstance(url, str):
        return False, None, "URL must be a non-empty string."

    clean_url = url.strip()
    try:
        parsed = urllib.parse.urlparse(clean_url)
    except Exception as e:
        return False, None, f"Malformed URL: {e}"

    # 1. Scheme check
    scheme = (parsed.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        return False, None, f"Invalid scheme '{scheme}'. Only HTTP and HTTPS are permitted."

    # 2. Hostname check
    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        return False, None, "URL must include a valid host name."

    if hostname in BLOCKED_HOSTNAMES or hostname.endswith(".local") or hostname.endswith(".internal"):
        return False, None, f"Access to '{hostname}' is blocked for security reasons."

    # 3. DNS resolution & IP range checks
    port = parsed.port or (443 if scheme == "https" else 80)
    try:
        addr_info = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        return False, None, f"Failed to resolve host '{hostname}': {e}"
    except Exception as e:
        return False, None, f"DNS error resolving '{hostname}': {e}"

    if not addr_info:
        return False, None, f"No IP address found for host '{hostname}'."

    for item in addr_info:
        sockaddr = item[4]
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            return False, None, f"Invalid resolved IP format: {ip_str}"

        # Strictly disallow internal/private networks
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
            or ip_obj.is_unspecified
        ):
            return (
                False,
                None,
                f"Security restriction: host '{hostname}' resolves to restricted address {ip_str} (SSRF protection).",
            )

        # Cloud metadata IP (169.254.169.254)
        if str(ip_obj) == "169.254.169.254":
            return False, None, "Access to cloud metadata endpoints is strictly forbidden."

    return True, clean_url, None


def safe_fetch_page(
    url: str,
    max_redirects: int = 3,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = MAX_RESPONSE_BYTES,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Fetch an HTTP/HTTPS page safely by validating every redirect hop against SSRF rules.
    Limits the response size to prevent memory exhaustion / zip bombs.

    Returns:
        (html_content, final_url, error_message)
    """
    current_url = url
    session = requests.Session()
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
    }

    for redirect_hop in range(max_redirects + 1):
        is_safe, normalized_url, err = validate_url_security(current_url)
        if not is_safe:
            return None, current_url, f"Redirect to unsafe address rejected: {err}"

        try:
            resp = session.get(
                normalized_url,
                headers=headers,
                timeout=timeout,
                allow_redirects=False,
                stream=True,
            )
        except requests.exceptions.Timeout:
            return None, current_url, f"Connection timed out after {timeout} seconds."
        except requests.exceptions.RequestException as e:
            return None, current_url, f"Failed to retrieve page: {e}"

        # Handle Redirects with re-validation
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("Location")
            if not location:
                return None, current_url, f"Received HTTP {resp.status_code} redirect without Location header."
            next_url = urllib.parse.urljoin(current_url, location)
            current_url = next_url
            continue

        if resp.status_code >= 400:
            return None, current_url, f"Server returned error HTTP {resp.status_code} ({resp.reason})."

        # Check content length
        content_length = resp.headers.get("Content-Length")
        if content_length and int(content_length) > max_bytes:
            return None, current_url, f"Response exceeds safe size limit ({max_bytes} bytes)."

        # Stream chunks safely
        content_chunks = []
        bytes_read = 0
        try:
            for chunk in resp.iter_content(chunk_size=65536):
                bytes_read += len(chunk)
                if bytes_read > max_bytes:
                    return None, current_url, f"Response truncated: exceeded {max_bytes} bytes limit."
                content_chunks.append(chunk)
        except Exception as e:
            return None, current_url, f"Error streaming response body: {e}"

        raw_bytes = b"".join(content_chunks)
        encoding = resp.encoding or "utf-8"
        try:
            html_text = raw_bytes.decode(encoding, errors="replace")
        except Exception:
            html_text = raw_bytes.decode("utf-8", errors="replace")

        return html_text, str(resp.url or current_url), None

    return None, current_url, "Exceeded maximum allowed redirects (limit: 3)."


# ── 2. Robots.txt Compliance ──────────────────────────────────────────────────

def check_robots_txt(target_url: str) -> Tuple[bool, Optional[str]]:
    """
    Check if the target URL path is permitted under the website's robots.txt rules.
    Gracefully allows scanning if robots.txt is missing (404) or unreachable.
    """
    try:
        parsed = urllib.parse.urlparse(target_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        
        is_safe, _, _ = validate_url_security(robots_url)
        if not is_safe:
            return True, None

        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(robots_url)
        
        # Read robots with short timeout
        resp = requests.get(robots_url, headers={"User-Agent": USER_AGENT}, timeout=5, allow_redirects=True)
        if resp.status_code == 200:
            rp.parse(resp.text.splitlines())
            allowed = rp.can_fetch(USER_AGENT, target_url) or rp.can_fetch("*", target_url)
            if not allowed:
                return False, f"The website's robots.txt disallows automated crawler access to path '{parsed.path}'."
        return True, None
    except Exception as exc:
        logger.debug(f"robots.txt check notice for {target_url}: {exc}")
        return True, None


# ── 3. Embedded ATS Public API Detection ───────────────────────────────────────

def detect_embedded_ats(html: str, page_url: str) -> Optional[Tuple[str, str]]:
    """
    Inspect the URL and page HTML for standard ATS platforms (Greenhouse, Lever, Ashby, Workable).
    Returns (provider, board_token_or_subdomain) if detected.
    """
    # 1. URL pattern check
    url_lower = page_url.lower()

    # Greenhouse (boards.greenhouse.io/{board})
    gh_match = re.search(r"boards\.greenhouse\.io/(?:embed/job_board\?for=)?([a-zA-Z0-9_\-]+)", page_url, re.IGNORECASE)
    if gh_match:
        return "greenhouse", gh_match.group(1)

    # Lever (jobs.lever.co/{company})
    lever_match = re.search(r"jobs\.lever\.co/([a-zA-Z0-9_\-]+)", page_url, re.IGNORECASE)
    if lever_match:
        return "lever", lever_match.group(1)

    # Ashby (jobs.ashbyhq.com/{company})
    ashby_match = re.search(r"jobs\.ashbyhq\.com/([a-zA-Z0-9_\-]+)", page_url, re.IGNORECASE)
    if ashby_match:
        return "ashby", ashby_match.group(1)

    # Workable (apply.workable.com/{company})
    workable_match = re.search(r"apply\.workable\.com/([a-zA-Z0-9_\-]+)", page_url, re.IGNORECASE)
    if workable_match:
        return "workable", workable_match.group(1)

    # 2. HTML embedded iframe / script checks
    if html:
        # Greenhouse iframe or embed
        gh_embed = re.search(r'boards\.greenhouse\.io/(?:embed/job_board\?for=)?([a-zA-Z0-9_\-]+)', html, re.IGNORECASE)
        if gh_embed:
            return "greenhouse", gh_embed.group(1)

        # Lever iframe / link
        lever_embed = re.search(r'jobs\.lever\.co/([a-zA-Z0-9_\-]+)', html, re.IGNORECASE)
        if lever_embed:
            return "lever", lever_embed.group(1)

        # Ashby iframe / link
        ashby_embed = re.search(r'jobs\.ashbyhq\.com/([a-zA-Z0-9_\-]+)', html, re.IGNORECASE)
        if ashby_embed:
            return "ashby", ashby_embed.group(1)

        # Workable widget
        workable_embed = re.search(r'apply\.workable\.com/([a-zA-Z0-9_\-]+)', html, re.IGNORECASE)
        if workable_embed:
            return "workable", workable_embed.group(1)

    return None


def fetch_from_detected_ats(provider: str, identifier: str, limit: int = 50) -> List[NormalizedJobListing]:
    """
    Fetch public job listings directly via the provider's official public board API.
    """
    from backend.integrations.registry import get_adapter
    adapter = get_adapter(provider)
    if not adapter:
        return []

    cfg: Dict[str, Any] = {}
    if provider == "greenhouse":
        cfg = {"board_token": identifier, "company_name": identifier.replace("-", " ").title()}
    elif provider == "lever":
        cfg = {"site": identifier, "company_name": identifier.replace("-", " ").title()}
    elif provider == "ashby":
        cfg = {"job_board_name": identifier, "company_name": identifier.replace("-", " ").title()}
    elif provider == "workable":
        cfg = {"subdomain": identifier, "company_name": identifier.replace("-", " ").title()}

    try:
        jobs, err = adapter.fetch_jobs(api_key="", config=cfg, limit=limit)
        if not err and jobs:
            return jobs
    except Exception as exc:
        logger.warning(f"Error fetching from detected {provider} ({identifier}): {exc}")

    return []


# ── 4. Structured JobPosting JSON-LD Extraction ────────────────────────────────

def _clean_html_text(raw_html: str) -> str:
    """Strip tags and normalize whitespace."""
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    for s in soup(["script", "style"]):
        s.decompose()
    text = soup.get_text(separator="\n")
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def _normalize_workplace_type(location_str: str, workplace_str: Optional[str]) -> str:
    combined = f"{location_str} {workplace_str or ''}".lower()
    if "remote" in combined or "anywhere" in combined or "telecommute" in combined or "virtual" in combined:
        return "remote"
    if "hybrid" in combined:
        return "hybrid"
    return "on-site"


def _normalize_employment_type(emp_str: Optional[str]) -> str:
    s = (emp_str or "").upper()
    if "FULL" in s or "PERMANENT" in s:
        return "Full-time"
    if "PART" in s:
        return "Part-time"
    if "CONTRACT" in s or "FREELANCE" in s:
        return "Contract"
    if "INTERN" in s:
        return "Internship"
    return "Full-time"


def is_invalid_or_placeholder_title(title: Optional[str]) -> bool:
    """
    Check if a candidate job title is an identifier, UUID, hash, or test placeholder
    rather than a genuine job designation.
    """
    if not title or not isinstance(title, str):
        return True
    t = title.strip()
    if len(t) < 3:
        return True
    # Pure UUID / hex string (e.g. 6a6402631d3b0 or aebdbff79ddb)
    if re.match(r"^[0-9a-fA-F-]{8,}$", t):
        return True
    # Test job placeholders like "Test Website Job abc123"
    if re.match(r"^test(?:\s+website)?\s+job\b", t, re.IGNORECASE):
        return True
    # Numeric or ID patterns like "job-12345" or "req_12345"
    if re.match(r"^(?:job|req|position|posting|requisition)[-_#\s]*\d+$", t, re.IGNORECASE):
        return True
    # Common non-title navigation strings
    if re.match(r"^(?:apply(?:\s+now)?|view(?:\s+details)?|learn(?:\s+more)?|read(?:\s+more)?|click\s+here|back|jobs|careers|openings|home|menu|search|all\s+jobs)$", t, re.IGNORECASE):
        return True
    return False


def clean_and_validate_title(raw_title: Optional[str], fallback: str = "Job title unavailable") -> str:
    """
    Ensure title does not contain raw HTML, entity escapes, or identifier-like text.
    Prioritizes genuine job designations and records extraction warnings for missing/corrupt titles.
    """
    if is_invalid_or_placeholder_title(raw_title):
        logger.warning(f"[Crawler] Discarding invalid/synthetic title: {raw_title}. Defaulting to '{fallback}'.")
        return fallback
    clean = re.sub(r"\s+", " ", str(raw_title)).strip()
    clean = clean.strip("\"'- ")
    return clean or fallback


def _extract_skills_from_text(text: str) -> List[str]:
    """Derive common technical skills from job title and description."""
    common_skills = [
        "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java", "C++", "C#", "Go", "Rust",
        "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
        "Terraform", "Git", "Linux", "FastAPI", "Django", "GraphQL", "REST", "CI/CD", "Machine Learning",
        "Data Engineering", "Tailwind", "Next.js", "Vue", "Angular", "Agile", "DevOps"
    ]
    found = []
    text_lower = text.lower()
    for skill in common_skills:
        # Match word boundary
        pattern = r"\b" + re.escape(skill.lower()) + r"\b"
        if re.search(pattern, text_lower):
            found.append(skill)
    return found[:12]


def extract_jobs_from_json_ld(
    html: str,
    page_url: str,
    default_company: Optional[str] = None,
) -> List[NormalizedJobListing]:
    """
    Parse Schema.org JobPosting JSON-LD blocks from HTML.
    Handles single objects, lists, and @graph nodes.
    """
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    scripts = soup.find_all("script", type="application/ld+json")
    postings_data: List[Dict[str, Any]] = []

    def _collect_job_postings(obj: Any):
        if isinstance(obj, dict):
            obj_type = obj.get("@type")
            if obj_type == "JobPosting" or (isinstance(obj_type, list) and "JobPosting" in obj_type):
                postings_data.append(obj)
            if "@graph" in obj and isinstance(obj["@graph"], list):
                for sub in obj["@graph"]:
                    _collect_job_postings(sub)
        elif isinstance(obj, list):
            for item in obj:
                _collect_job_postings(item)

    for script in scripts:
        content = (script.string or "").strip()
        if not content:
            continue
        try:
            data = json.loads(content)
            _collect_job_postings(data)
        except Exception:
            continue

    parsed_jobs: List[NormalizedJobListing] = []
    parsed_domain = urllib.parse.urlparse(page_url).netloc.replace("www.", "")
    fallback_company = default_company or parsed_domain.split(".")[0].title()

    for idx, jp in enumerate(postings_data):
        raw_title = (jp.get("title") or jp.get("name") or jp.get("headline") or "").strip()
        title = clean_and_validate_title(raw_title, fallback="Job title unavailable")
        if not raw_title or is_invalid_or_placeholder_title(raw_title):
            logger.warning(f"[Crawler] Discarding invalid/synthetic title: '{raw_title}'. Assigned '{title}'.")

        # Company name
        hiring_org = jp.get("hiringOrganization")
        company = fallback_company
        company_logo = None
        if isinstance(hiring_org, dict):
            company = hiring_org.get("name") or fallback_company
            company_logo = hiring_org.get("logo")

        # Location
        loc_display = "Remote"
        job_loc = jp.get("jobLocation")
        if isinstance(job_loc, dict):
            addr = job_loc.get("address")
            if isinstance(addr, dict):
                parts = [
                    addr.get("addressLocality"),
                    addr.get("addressRegion"),
                    addr.get("addressCountry"),
                ]
                loc_display = ", ".join([str(p).strip() for p in parts if p and str(p).strip()]) or "Remote"
            elif isinstance(addr, str) and addr.strip():
                loc_display = addr.strip()
            elif job_loc.get("name"):
                loc_display = str(job_loc["name"]).strip()
        elif isinstance(job_loc, list) and len(job_loc) > 0 and isinstance(job_loc[0], dict):
            addr = job_loc[0].get("address")
            if isinstance(addr, dict):
                loc_display = addr.get("addressLocality") or "Remote"

        # Workplace type
        loc_type = str(jp.get("jobLocationType") or "")
        workplace_type = _normalize_workplace_type(loc_display, loc_type)

        # Description
        raw_desc = jp.get("description") or jp.get("responsibilities") or f"Exciting opportunity for {title} at {company}."
        clean_desc = _clean_html_text(raw_desc) if "<" in raw_desc else raw_desc

        # Dates
        posted_at = None
        date_posted_str = jp.get("datePosted")
        if date_posted_str:
            try:
                posted_at = datetime.fromisoformat(str(date_posted_str).replace("Z", "+00:00"))
            except Exception:
                pass

        deadline = None
        valid_through_str = jp.get("validThrough")
        if valid_through_str:
            try:
                deadline = datetime.fromisoformat(str(valid_through_str).replace("Z", "+00:00"))
            except Exception:
                pass

        # Employment type
        emp_type = _normalize_employment_type(jp.get("employmentType"))

        # Salary
        salary_str = None
        base_salary = jp.get("baseSalary")
        if isinstance(base_salary, dict):
            val = base_salary.get("value")
            currency = base_salary.get("currency", "USD")
            if isinstance(val, dict):
                min_v = val.get("minValue")
                max_v = val.get("maxValue")
                unit = val.get("unitText", "YEAR")
                if min_v and max_v:
                    salary_str = f"{currency} {min_v:,} - {max_v:,} / {unit.lower()}"
                elif min_v:
                    salary_str = f"{currency} {min_v:,}+ / {unit.lower()}"
                elif val.get("value"):
                    single_v = val.get("value")
                    try:
                        salary_str = f"{currency} {int(float(single_v)):,} / {unit.lower()}"
                    except Exception:
                        salary_str = f"{currency} {single_v}"
            elif isinstance(val, (int, float)):
                salary_str = f"{currency} {val:,}"
            elif isinstance(val, str) and val.strip():
                salary_str = f"{currency} {val.strip()}"

        # Job posting URL
        job_url = jp.get("url")
        if job_url:
            job_url = urllib.parse.urljoin(page_url, str(job_url))
        else:
            job_url = page_url

        # Identifier
        ext_id = str(jp.get("identifier") or jp.get("id") or f"jsonld-{idx+1}-{hash(title)}")
        if isinstance(ext_id, dict):
            ext_id = str(ext_id.get("value") or ext_id.get("name") or f"jsonld-{idx+1}")

        skills = _extract_skills_from_text(f"{title}\n{clean_desc}")

        parsed_jobs.append(
            NormalizedJobListing(
                external_job_id=ext_id,
                job_title=title,
                company_name=company,
                company_logo_url=company_logo,
                job_description=clean_desc,
                location=loc_display,
                workplace_type=workplace_type,
                employment_type=emp_type,
                salary=salary_str or "Competitive",
                skills=skills,
                job_posting_url=job_url,
                posted_at=posted_at,
                deadline=deadline,
                status="active",
                raw_data=jp,
            )
        )

    return parsed_jobs


# ── 5. HTML Semantic Fallback Job Discovery ────────────────────────────────────

def extract_jobs_from_html_semantic(
    html: str,
    page_url: str,
    default_company: Optional[str] = None,
    max_subpages: int = MAX_SUBPAGE_FETCHES,
) -> List[NormalizedJobListing]:
    """
    Fallback extractor when structured JSON-LD is absent or incomplete.
    Analyzes careers hub cards, job table rows, and individual job links.
    """
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    parsed_domain = urllib.parse.urlparse(page_url).netloc.replace("www.", "")
    fallback_company = default_company or parsed_domain.split(".")[0].title()

    # Search for job links
    job_link_pattern = re.compile(
        r"/(?:jobs?|careers?|positions?|openings?|roles?)/[a-zA-Z0-9_\-]+|\b(?:gh_jid|lever\.co|ashbyhq\.com)\b",
        re.IGNORECASE,
    )
    ignore_pattern = re.compile(
        r"/(?:privacy|terms|benefits|culture|about|contact|press|blog|login|signup|apply-now|jobs?$|careers?$)",
        re.IGNORECASE,
    )

    discovered_links: List[Tuple[str, str, Optional[str]]] = []  # (href, title, location)
    seen_urls: Set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue

        abs_url = urllib.parse.urljoin(page_url, href)
        if abs_url in seen_urls:
            continue

        # Check if URL looks like a job posting
        if job_link_pattern.search(abs_url) and not ignore_pattern.search(abs_url):
            link_text = a.get_text(separator=" ").strip()
            # Must look like a real job title (not "Apply", "View", "Back", etc.)
            if len(link_text) >= 4 and not re.match(r"^(?:apply|view|learn|read|click|more|back|jobs|careers)$", link_text, re.IGNORECASE):
                seen_urls.add(abs_url)
                # Try finding location in parent container
                parent = a.find_parent(["div", "li", "tr", "section"])
                loc = None
                if parent:
                    loc_match = re.search(r"\b(Remote|Hybrid|On-site|[A-Z][a-zA-Z\s]+,\s*[A-Z]{2})\b", parent.get_text(), re.IGNORECASE)
                    if loc_match:
                        loc = loc_match.group(1).strip()
                discovered_links.append((abs_url, link_text, loc))

    results: List[NormalizedJobListing] = []

    # If this page itself is a single job listing (e.g. h1 title + apply button)
    h1 = soup.find("h1")
    apply_button = soup.find(lambda tag: tag.name in ["a", "button"] and re.search(r"apply|submit application", tag.get_text(), re.IGNORECASE))
    if h1 and apply_button and len(discovered_links) <= 2:
        single_title = clean_and_validate_title(h1.get_text().strip(), fallback="Job title unavailable")
        body_text = _clean_html_text(html)
        skills = _extract_skills_from_text(f"{single_title}\n{body_text[:2000]}")
        results.append(
            NormalizedJobListing(
                external_job_id=f"page-{hash(page_url)}",
                job_title=single_title,
                company_name=fallback_company,
                job_description=body_text[:4000],
                location="Remote",
                workplace_type="remote",
                employment_type="Full-time",
                salary="Competitive",
                skills=skills,
                job_posting_url=page_url,
                status="active",
                raw_data={"source": "single_page_semantic"},
            )
        )
        return results

    # Process discovered sub-links up to max_subpages
    for idx, (sub_url, title, loc) in enumerate(discovered_links[:max_subpages]):
        ext_id = f"web-{hash(sub_url)}"
        location = loc or "Remote"
        workplace_type = _normalize_workplace_type(location, None)

        # Attempt quick fetch for detail page to see if JSON-LD exists there
        sub_desc = f"Position for {title} at {fallback_company}. For full requisitions and to submit application materials, see official posting."
        resolved_title = title
        
        # We fetch detail page to get richer description, page H1 heading, and JSON-LD if available
        try:
            sub_html, _, _ = safe_fetch_page(sub_url, timeout=5)
            if sub_html:
                # Check if subpage has JSON-LD
                sub_jobs = extract_jobs_from_json_ld(sub_html, sub_url, default_company=fallback_company)
                if sub_jobs:
                    results.extend(sub_jobs)
                    continue

                detail_soup = BeautifulSoup(sub_html, "html.parser")
                detail_h1 = detail_soup.find("h1")
                og_tag = detail_soup.find("meta", property="og:title") or detail_soup.find("meta", attrs={"name": "og:title"}) or detail_soup.find("meta", attrs={"name": "title"})
                page_title = detail_soup.find("title")

                # 1. Detail page H1 heading
                if detail_h1 and not is_invalid_or_placeholder_title(detail_h1.get_text()):
                    resolved_title = detail_h1.get_text().strip()
                # 2. og:title metadata
                elif og_tag and og_tag.get("content") and not is_invalid_or_placeholder_title(og_tag["content"]):
                    resolved_title = og_tag["content"].strip()
                # 3. <title> tag
                elif page_title and not is_invalid_or_placeholder_title(page_title.get_text()):
                    pt = re.split(r"\s+[|\-•—]\s+", page_title.get_text())[0].strip()
                    if not is_invalid_or_placeholder_title(pt):
                        resolved_title = pt

                sub_desc = _clean_html_text(sub_html)[:3500]
        except Exception:
            pass

        final_title = clean_and_validate_title(resolved_title, fallback="Job title unavailable")
        sub_skills = _extract_skills_from_text(f"{final_title}\n{sub_desc[:1500]}")

        results.append(
            NormalizedJobListing(
                external_job_id=ext_id,
                job_title=final_title,
                company_name=fallback_company,
                job_description=sub_desc,
                location=location,
                workplace_type=workplace_type,
                employment_type="Full-time",
                salary="Competitive",
                skills=sub_skills,
                job_posting_url=sub_url,
                status="active",
                raw_data={"source": "careers_hub_semantic"},
            )
        )

    return results


# ── 6. Master Crawl & Discovery Orchestrator ───────────────────────────────────

def crawl_and_extract_jobs(
    url: str,
    connection_name: Optional[str] = None,
    max_jobs: int = 50,
) -> Dict[str, Any]:
    """
    Main entry point for website URL job discovery.
    Validates security, checks robots.txt, attempts ATS detection, JSON-LD extraction,
    and HTML fallback parsing.

    Returns:
        {
            "success": bool,
            "source_url": str,
            "company_name": str,
            "jobs_discovered": int,
            "jobs": List[Dict[str, Any]],
            "scan_duration_ms": int,
            "notes": str,
            "error": Optional[str]
        }
    """
    start_time = time.time()
    parsed_netloc = urllib.parse.urlparse(url).netloc.replace("www.", "")
    derived_company = connection_name or parsed_netloc.split(".")[0].title()

    # 1. SSRF & Scheme Validation
    is_safe, clean_url, sec_err = validate_url_security(url)
    if not is_safe:
        return {
            "success": False,
            "source_url": url,
            "company_name": derived_company,
            "jobs_discovered": 0,
            "jobs": [],
            "scan_duration_ms": round((time.time() - start_time) * 1000),
            "notes": "",
            "error": f"Security restriction: {sec_err}",
        }

    # 2. Robots.txt check
    allowed, robot_reason = check_robots_txt(clean_url)
    if not allowed:
        return {
            "success": False,
            "source_url": clean_url,
            "company_name": derived_company,
            "jobs_discovered": 0,
            "jobs": [],
            "scan_duration_ms": round((time.time() - start_time) * 1000),
            "notes": "",
            "error": robot_reason or "Automated scanning blocked by robots.txt policy.",
        }

    # 3. Safe HTTP retrieval
    html_content, final_url, fetch_err = safe_fetch_page(clean_url)
    if fetch_err or not html_content:
        return {
            "success": False,
            "source_url": clean_url,
            "company_name": derived_company,
            "jobs_discovered": 0,
            "jobs": [],
            "scan_duration_ms": round((time.time() - start_time) * 1000),
            "notes": "",
            "error": f"Could not connect to careers page: {fetch_err}",
        }

    extracted_jobs: List[NormalizedJobListing] = []
    extraction_method = "html_semantic"

    # 4. Check for embedded ATS (Greenhouse, Lever, Ashby, Workable)
    ats_info = detect_embedded_ats(html_content, final_url)
    if ats_info:
        provider, ident = ats_info
        logger.info(f"Detected embedded {provider} ATS ({ident}) on {clean_url}")
        ats_jobs = fetch_from_detected_ats(provider, ident, limit=max_jobs)
        if ats_jobs:
            extracted_jobs = ats_jobs
            extraction_method = f"embedded_{provider}_api"

    # 5. Schema.org JobPosting JSON-LD
    if not extracted_jobs:
        json_ld_jobs = extract_jobs_from_json_ld(html_content, final_url, default_company=derived_company)
        if json_ld_jobs:
            extracted_jobs = json_ld_jobs
            extraction_method = "schema_jobposting_json_ld"

    # 6. Fallback semantic HTML analysis
    if not extracted_jobs:
        semantic_jobs = extract_jobs_from_html_semantic(html_content, final_url, default_company=derived_company)
        if semantic_jobs:
            extracted_jobs = semantic_jobs
            extraction_method = "semantic_html_discovery"

    # Deduplicate extracted jobs by (title, company, location, URL)
    deduped_jobs: List[NormalizedJobListing] = []
    seen_hashes: Set[str] = set()

    for j in extracted_jobs:
        norm_key = f"{j.title.lower()}|{j.company_name.lower()}|{j.location.lower()}|{j.job_posting_url.lower()}"
        if norm_key not in seen_hashes:
            seen_hashes.add(norm_key)
            deduped_jobs.append(j)
        if len(deduped_jobs) >= max_jobs:
            break

    # Format into serializable previews
    preview_items = []
    for idx, dj in enumerate(deduped_jobs):
        preview_items.append({
            "temp_id": f"web-{idx+1}-{hash(dj.job_posting_url) % 10000000}",
            "title": dj.title,
            "company_name": dj.company_name or derived_company,
            "location": dj.location or "Remote",
            "workplace_type": dj.workplace_type or "remote",
            "employment_type": dj.employment_type or "Full-time",
            "salary": dj.salary or "Competitive",
            "description": dj.description,
            "skills": dj.skills or [],
            "job_posting_url": dj.job_posting_url,
            "posted_at": dj.posted_at.isoformat() if dj.posted_at else None,
            "deadline": dj.deadline.isoformat() if dj.deadline else None,
            "source_website": clean_url,
        })

    duration_ms = round((time.time() - start_time) * 1000)
    company_final = preview_items[0]["company_name"] if preview_items else derived_company

    notes_msg = (
        f"Discovered {len(preview_items)} position(s) via {extraction_method}."
        if preview_items
        else "No open positions could be automatically extracted from this page. Ensure the URL links directly to open requisitions."
    )

    return {
        "success": True if preview_items else False,
        "source_url": clean_url,
        "company_name": company_final,
        "jobs_discovered": len(preview_items),
        "jobs": preview_items,
        "scan_duration_ms": duration_ms,
        "notes": notes_msg,
        "error": None if preview_items else "No job listings found on the specified page.",
    }
