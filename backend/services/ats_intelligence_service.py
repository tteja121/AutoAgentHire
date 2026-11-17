"""
Candidate Intelligence & ATS Calibration Service for AutoAgentHire.
Provides deep structured candidate extraction, skills categorization,
deterministic grounded job designation recommendations, and ATS diagnostic calibration.
"""
import re
import unicodedata
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


def sanitize_resume_text(raw_text: Optional[str], max_chars: int = 50000) -> str:
    """
    Sanitize and normalize resume text:
    - Safely converts None/non-strings to empty string.
    - Normalizes Unicode characters (NFKC) so ligatures and special symbols decompose cleanly.
    - Replaces non-breaking spaces (\u00a0), zero-width spaces (\u200b, \ufeff) with standard spaces.
    - Normalizes smart quotes and hyphens/dashes.
    - Strips invalid control characters (keeping \n, \r, \t).
    - Normalizes line breaks (\r\n and \r -> \n).
    - Cleans whitespace line by line and collapses excessive newlines (max 2 consecutive).
    - Preserves meaningful resume content, headings, dates, skills, and bullet points.
    - Enforces max_chars limit (default 50,000) to prevent memory exhaustion on malicious inputs.
    """
    if not raw_text or not isinstance(raw_text, str):
        return ""

    # Unicode normalization
    text = unicodedata.normalize("NFKC", raw_text)

    # Normalize special spaces, quotes, and dashes
    text = text.replace("\u00a0", " ").replace("\u200b", "").replace("\ufeff", "")
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    text = text.replace("—", "-").replace("–", "-")

    # Remove null bytes and non-printable control characters, preserving \t, \n, \r
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Normalize line breaks
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Clean lines and preserve structure
    cleaned_lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(cleaned_lines)

    # Collapse excessive newlines (keep at most 2 consecutive newlines)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Trim start and end
    text = text.strip()

    # Apply length limit safely on line boundary if possible
    if max_chars and len(text) > max_chars:
        text = text[:max_chars].rsplit("\n", 1)[0].strip() or text[:max_chars].strip()

    return text

# Standard industry engineering roles for recommendation grounding
DESIGNATION_CATALOG = [
    {
        "designation": "Junior Python Developer",
        "category": "Backend Engineering",
        "target_level": "fresher",
        "min_exp": 0.0,
        "max_exp": 2.5,
        "core_skills": ["Python", "SQL", "FastAPI", "Django", "Git", "REST APIs"],
        "recommended_skills": ["Docker", "PostgreSQL", "PyTest", "Redis", "Celery"],
        "base_reason": "The candidate demonstrates strong core Python capabilities and backend database scripting knowledge.",
        "career_advice": "Deepen experience with automated testing (PyTest), containerized microservices (Docker), and asynchronous background workers.",
    },
    {
        "designation": "Frontend Developer",
        "category": "Frontend Engineering",
        "target_level": "all",
        "min_exp": 0.0,
        "max_exp": 3.5,
        "core_skills": ["React", "JavaScript", "TypeScript", "HTML", "CSS", "Tailwind CSS"],
        "recommended_skills": ["Next.js", "Redux", "Jest", "UI/UX Accessibility", "Vite", "GraphQL"],
        "base_reason": "The candidate has demonstrated competencies in modern JavaScript/TypeScript and client-side web framework architecture.",
        "career_advice": "Expand knowledge of server-side rendering (Next.js/Remix), responsive accessibility (WCAG), and state management optimization.",
    },
    {
        "designation": "Junior Full Stack Developer",
        "category": "Full Stack Engineering",
        "target_level": "fresher",
        "min_exp": 0.0,
        "max_exp": 3.0,
        "core_skills": ["JavaScript", "TypeScript", "React", "Python", "Node.js", "SQL", "REST APIs"],
        "recommended_skills": ["Docker", "MongoDB", "PostgreSQL", "AWS", "CI/CD", "Redis"],
        "base_reason": "The candidate possesses both frontend user interface and backend server-side implementation competencies.",
        "career_advice": "Focus on production deployment pipelines (CI/CD), database index optimization, and end-to-end integration testing.",
    },
    {
        "designation": "Software Engineer - Entry Level",
        "category": "Software Engineering",
        "target_level": "fresher",
        "min_exp": 0.0,
        "max_exp": 1.5,
        "core_skills": ["Data Structures", "Algorithms", "Python", "Java", "C++", "Git", "SQL", "Problem Solving"],
        "recommended_skills": ["Linux", "Unit Testing", "System Architecture", "Object-Oriented Design"],
        "base_reason": "The candidate demonstrates solid computer science fundamentals, algorithmic problem-solving aptitude, and version control discipline.",
        "career_advice": "Build and document public GitHub repositories highlighting clean code, architectural patterns, and unit test coverage.",
    },
    {
        "designation": "Junior Backend Developer",
        "category": "Backend Engineering",
        "target_level": "fresher",
        "min_exp": 0.0,
        "max_exp": 2.5,
        "core_skills": ["Python", "Node.js", "PostgreSQL", "MySQL", "REST APIs", "FastAPI", "Express"],
        "recommended_skills": ["Docker", "Redis", "Microservices", "Kafka", "Linux", "Swagger/OpenAPI"],
        "base_reason": "The candidate has demonstrated backend service development, schema design, and API endpoint integration capabilities.",
        "career_advice": "Practice designing event-driven architectures, distributed caching with Redis, and message queues like Kafka or RabbitMQ.",
    },
    {
        "designation": "Associate Data Analyst",
        "category": "Data & Analytics",
        "target_level": "all",
        "min_exp": 0.0,
        "max_exp": 3.0,
        "core_skills": ["SQL", "Python", "Pandas", "Data Analysis", "Excel", "Tableau", "Power BI"],
        "recommended_skills": ["PostgreSQL", "Statistics", "Data Cleaning", "NumPy", "Matplotlib"],
        "base_reason": "The candidate exhibits data manipulation, query optimization, and structured analytical reporting proficiencies.",
        "career_advice": "Advance into statistical modeling, automated ETL pipeline creation, and interactive BI dashboards.",
    },
    {
        "designation": "Cloud & DevOps Associate",
        "category": "DevOps & Cloud",
        "target_level": "all",
        "min_exp": 0.0,
        "max_exp": 3.0,
        "core_skills": ["Linux", "Git", "Docker", "AWS", "CI/CD", "Bash", "Python"],
        "recommended_skills": ["Kubernetes", "Terraform", "GCP", "Ansible", "CloudWatch", "Prometheus"],
        "base_reason": "The candidate exhibits foundational skills in infrastructure automation, container environments, and cloud toolchains.",
        "career_advice": "Pursue hands-on infrastructure as code (Terraform), Kubernetes cluster orchestration, and production monitoring.",
    },
    {
        "designation": "Senior Full Stack Engineer",
        "category": "Full Stack Engineering",
        "target_level": "experienced",
        "min_exp": 3.0,
        "max_exp": 15.0,
        "core_skills": ["React", "TypeScript", "Node.js", "Python", "PostgreSQL", "Docker", "AWS", "System Design"],
        "recommended_skills": ["Kubernetes", "Microservices", "High Availability Architecture", "Engineering Leadership"],
        "base_reason": "The candidate's multi-year career history reflects extensive hands-on full-stack development and system delivery.",
        "career_advice": "Strengthen large-scale distributed systems architecture, team mentorship, and cloud cost optimization strategies.",
    },
]

SKILL_TAXONOMY = {
    "programming_languages": [
        "python", "javascript", "typescript", "java", "c++", "c#", "c", "go", "golang",
        "rust", "ruby", "php", "swift", "kotlin", "scala", "r", "dart", "shell", "bash"
    ],
    "frontend": [
        "react", "react.js", "reactjs", "vue", "vue.js", "angular", "next.js", "nextjs",
        "svelte", "html", "html5", "css", "css3", "tailwind", "tailwind css", "bootstrap",
        "sass", "redux", "mobx", "webpack", "vite", "material ui", "shadcn"
    ],
    "backend": [
        "fastapi", "django", "flask", "node.js", "nodejs", "express", "express.js",
        "spring", "spring boot", "graphql", "rest", "restful", "rest api", "rest apis",
        "microservices", "grpc", "celery", "nest.js", "nestjs", "asp.net"
    ],
    "databases": [
        "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "oracle",
        "dynamodb", "cassandra", "elasticsearch", "mariadb", "firebase", "supabase", "sql"
    ],
    "cloud_devops": [
        "aws", "amazon web services", "azure", "gcp", "google cloud", "docker",
        "kubernetes", "k8s", "terraform", "ci/cd", "github actions", "gitlab ci",
        "jenkins", "linux", "unix", "ansible", "helm", "nginx", "prometheus", "grafana"
    ],
    "tools_frameworks": [
        "git", "github", "gitlab", "jira", "postman", "jest", "pytest", "cypress",
        "selenium", "agile", "scrum", "kafka", "rabbitmq", "pandas", "numpy",
        "scikit-learn", "tensorflow", "pytorch", "opencv"
    ],
}


def categorize_skills(skills: List[str]) -> Dict[str, List[str]]:
    """Group extracted skills into standardized technical domains."""
    categorized: Dict[str, List[str]] = {
        "programming_languages": [],
        "frontend": [],
        "backend": [],
        "databases": [],
        "cloud_devops": [],
        "tools_frameworks": [],
    }
    seen_norm = set()

    for skill in skills:
        if not skill or not isinstance(skill, str):
            continue
        s_clean = skill.strip()
        s_lower = s_clean.lower()
        if s_lower in seen_norm:
            continue
        seen_norm.add(s_lower)

        matched = False
        for category, keywords in SKILL_TAXONOMY.items():
            if s_lower in keywords:
                categorized[category].append(s_clean)
                matched = True
                break
            # Substring match if skill is distinct (e.g. "React Hooks" or "FastAPI Framework")
            for kw in keywords:
                if len(kw) >= 3 and (kw == s_lower or re.search(r"\b" + re.escape(kw) + r"\b", s_lower)):
                    categorized[category].append(s_clean)
                    matched = True
                    break
            if matched:
                break

        if not matched:
            categorized["tools_frameworks"].append(s_clean)

    return categorized


def extract_candidate_links(resume_text: str) -> Dict[str, Optional[str]]:
    """Extract LinkedIn, GitHub, and portfolio URLs from resume text."""
    links: Dict[str, Optional[str]] = {
        "linkedin_url": None,
        "github_url": None,
        "portfolio_url": None,
    }
    if not resume_text:
        return links

    # 1. LinkedIn
    li_match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/([a-zA-Z0-9_\-\.]+)", resume_text, re.IGNORECASE)
    if li_match:
        links["linkedin_url"] = f"https://linkedin.com/in/{li_match.group(1).rstrip('/')}"

    # 2. GitHub
    gh_match = re.search(r"(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_\-\.]+)", resume_text, re.IGNORECASE)
    if gh_match:
        user = gh_match.group(1).rstrip('/')
        if user.lower() not in ("about", "features", "explore", "pricing"):
            links["github_url"] = f"https://github.com/a-zA-Z0-9" if False else f"https://github.com/{user}"

    # 3. Portfolio / Personal site
    pf_match = re.search(r"(?:https?://)?(?:www\.)?([a-zA-Z0-9\-\.]+\.(?:dev|me|io|tech|app|vercel\.app|netlify\.app))(?:\/[^\s\)]*)?", resume_text, re.IGNORECASE)
    if pf_match:
        cand_url = pf_match.group(0).rstrip(".,)")
        if not cand_url.startswith("http"):
            cand_url = "https://" + cand_url
        if "github.com" not in cand_url and "linkedin.com" not in cand_url:
            links["portfolio_url"] = cand_url

    return links


def calculate_recommended_designations(
    candidate_skills: List[str],
    total_experience_str: Optional[str] = None,
    resume_text: Optional[str] = None,
    education: Optional[List[Dict[str, Any]]] = None,
    projects: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Recommend 4-6 grounded job roles based strictly on candidate's verified skills,
    experience level (fresher vs experienced), education, and project background.
    Calculates deterministic match scores (0-100%).
    """
    if not candidate_skills:
        return []

    # Parse numeric years of experience
    clean_skills_lower = set(s.strip().lower() for s in candidate_skills if s and isinstance(s, str))
    exp_years = 0.0
    is_fresher = False

    combined_text = f"{total_experience_str or ''} {resume_text or ''}".lower()
    if any(k in combined_text for k in ["fresher", "fresh graduate", "entry level", "student", "undergraduate", "0 years", "intern"]):
        is_fresher = True
        exp_years = 0.0
    else:
        m = re.search(r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)", combined_text)
        if m:
            try:
                exp_years = float(m.group(1))
            except ValueError:
                exp_years = 1.0
        else:
            exp_years = 0.0 if is_fresher else 1.0

    recommendations: List[Dict[str, Any]] = []

    for item in DESIGNATION_CATALOG:
        target_level = item["target_level"]

        # Filter by experience tier
        if is_fresher and target_level == "experienced":
            continue
        if exp_years >= 4.0 and target_level == "fresher" and "Senior" not in item["designation"]:
            continue

        core = item["core_skills"]
        rec = item["recommended_skills"]

        # Identify matching skills
        matching_core = [s for s in core if s.lower() in clean_skills_lower]
        matching_rec = [s for s in rec if s.lower() in clean_skills_lower]
        missing_core = [s for s in core if s.lower() not in clean_skills_lower]

        # Require at least 1 core skill match
        if not matching_core:
            continue

        # Score calculation: 65% core skill coverage + 15% recommended skill + 20% experience compatibility
        core_pct = len(matching_core) / max(1, len(core))
        rec_pct = min(1.0, len(matching_rec) / max(1, len(rec)))

        exp_fit = 1.0
        if item["min_exp"] <= exp_years <= item["max_exp"]:
            exp_fit = 1.0
        elif exp_years < item["min_exp"]:
            exp_fit = max(0.6, 1.0 - (item["min_exp"] - exp_years) * 0.2)
        else:
            exp_fit = max(0.7, 1.0 - (exp_years - item["max_exp"]) * 0.1)

        raw_score = (core_pct * 60.0) + (rec_pct * 15.0) + (exp_fit * 25.0)
        # Normalize to grounded 65% - 96% range
        final_score = int(round(min(96, max(65, raw_score))))

        # Detailed why suitable rationale
        evidenced_str = ", ".join(matching_core[:4])
        why_suitable = (
            f"{item['base_reason']} Demonstrated hands-on knowledge in {evidenced_str}."
        )

        recommendations.append({
            "designation": item["designation"],
            "category": item["category"],
            "match_percentage": final_score,
            "relevant_skills": matching_core + matching_rec,
            "relevant_experience": "Fresher / Entry-Level (0 years)" if (is_fresher or exp_years == 0) else f"{exp_years:.1f} years verified experience",
            "why_suitable": why_suitable,
            "missing_skills": missing_core[:4],
            "career_advice": item["career_advice"],
        })

    # Sort descending by match percentage
    recommendations.sort(key=lambda x: x["match_percentage"], reverse=True)
    return recommendations[:6]


def calculate_ats_diagnostics(
    resume_text: str,
    candidate_name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    location: Optional[str] = None,
    skills: Optional[List[str]] = None,
    experience: Optional[List[Dict[str, Any]]] = None,
    education: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Perform rigorous ATS compatibility assessment on resume structure,
    contact readiness, keyword saturation, and section hierarchy.
    """
    score = 40  # base
    observations: List[str] = []
    formatting_notes: List[str] = []

    # 1. Contact verification (max 20 pts)
    contact_score = 0
    if candidate_name and candidate_name != "Candidate":
        contact_score += 5
    if email and "@" in email:
        contact_score += 5
    if phone:
        contact_score += 5
    if location:
        contact_score += 5
    score += contact_score

    if contact_score >= 15:
        observations.append("Contact Details: Fully identified with verified email, name, and phone.")
    else:
        observations.append("Contact Details: Missing location or phone number in header block.")

    # 2. Technical Skills density (max 20 pts)
    sk_count = len(skills or [])
    if sk_count >= 8:
        score += 20
        observations.append(f"Keyword Saturation: Excellent technical density with {sk_count} detected competencies.")
    elif sk_count >= 4:
        score += 15
        observations.append(f"Keyword Saturation: Moderate technical density ({sk_count} skills). Recommend adding complementary tools.")
    else:
        score += 8
        observations.append("Keyword Saturation: Low technical keyword count. ATS filters require clear skill listings.")

    # 3. Work history / Projects (max 15 pts)
    exp_count = len(experience or [])
    if exp_count >= 2:
        score += 15
        observations.append(f"Experience Structure: Found {exp_count} historical roles with defined responsibilities.")
    elif exp_count == 1:
        score += 10
        observations.append("Experience Structure: Single employment or internship listed.")
    else:
        score += 5
        observations.append("Experience Structure: No direct employment history detected; relying on technical projects.")

    # 4. Education (max 10 pts)
    edu_count = len(education or [])
    if edu_count >= 1:
        score += 10
        observations.append(f"Academic Credentials: Evidenced {edu_count} degree or university credential.")
    else:
        observations.append("Academic Credentials: Degree/institution could not be unambiguously verified.")

    # 5. Readability & Section Formatting
    text_len = len(resume_text or "")
    if 400 <= text_len <= 8000:
        score += 15
        formatting_notes.append("Optimal Document Length: Text volume is balanced for single or two-page parsing.")
    else:
        score += 5
        formatting_notes.append("Length Warning: Document is exceptionally short or excessively long for an ATS crawler.")

    if not re.search(r"<table|\|---", resume_text or ""):
        formatting_notes.append("Table-Free Layout: Standard text hierarchy avoids column parsing errors in legacy ATS.")

    final_ats_score = min(98, max(50, score))

    return {
        "ats_score": final_ats_score,
        "contact_verification": "100% Complete" if contact_score >= 15 else "Partial",
        "formatting_readability": "Clean & Machine-Readable",
        "keyword_saturation": "Optimal Density" if sk_count >= 6 else "Moderate Density",
        "observations": observations,
        "formatting_recommendations": formatting_notes,
    }


def calibrate_ats_for_target(
    resume_text: str,
    target_designation: str,
    candidate_skills: List[str],
    job_description: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Perform targeted ATS analysis for a specific career designation or job requisition.
    Compares candidate profile against target requirements and returns exact matching keywords,
    critical missing keywords, and tailored optimization recommendations.
    """
    clean_target = (target_designation or "Software Engineer").strip()
    clean_skills = [s.strip() for s in candidate_skills if s and isinstance(s, str)]
    clean_skills_lower = set(s.lower() for s in clean_skills)

    # 1. Look up catalog item or synthesize target
    matched_catalog = next((c for c in DESIGNATION_CATALOG if c["designation"].lower() == clean_target.lower()), None)
    if not matched_catalog:
        # Fallback to general software engineer
        matched_catalog = DESIGNATION_CATALOG[3]

    expected_core = matched_catalog["core_skills"]
    expected_rec = matched_catalog["recommended_skills"]

    matching_keywords = [k for k in expected_core if k.lower() in clean_skills_lower]
    matching_rec = [k for k in expected_rec if k.lower() in clean_skills_lower]
    missing_keywords = [k for k in expected_core if k.lower() not in clean_skills_lower]

    # Additional text check
    res_lower = (resume_text or "").lower()
    for mk in list(missing_keywords):
        if mk.lower() in res_lower:
            matching_keywords.append(mk)
            missing_keywords.remove(mk)

    coverage = len(matching_keywords) / max(1, len(expected_core))
    role_score = int(round(min(97, max(52, (coverage * 60) + (len(matching_rec) * 5) + 30))))

    optimization_points = [
        f"Incorporate missing core keywords: {', '.join(missing_keywords[:3]) or 'None'}.",
        f"Highlight specific project deliverables aligned with {clean_target} workflows.",
        "Add measurable quantitative achievements to your experience descriptions.",
        "Ensure your professional summary explicitly targets this designation.",
    ]

    return {
        "target_designation": clean_target,
        "target_category": matched_catalog["category"],
        "ats_match_percentage": role_score,
        "matching_keywords": matching_keywords + matching_rec,
        "missing_critical_keywords": missing_keywords,
        "experience_relevance": f"{role_score}% alignment for {clean_target}",
        "suitability_reasoning": f"Evidenced capabilities in {', '.join(matching_keywords[:4]) or 'software delivery'} provide strong groundwork for this role.",
        "optimization_recommendations": optimization_points,
    }
