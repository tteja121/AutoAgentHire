"""
Candidate Job Matching Service.
Implements a consistent, explainable 6-factor scoring model to evaluate candidate resumes
against real active job listings (Greenhouse, Lever, Ashby, Workable, Recruiter postings).
Persists match results, breakdowns, and application status per authenticated candidate.
"""
import re
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Set

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from backend.database.models_complete import (
    User,
    Resume,
    ImportedJobListing,
    JobPosting,
    JobApplication,
    Application,
    CandidateJobMatch,
)

logger = logging.getLogger(__name__)

# Canonical skill mappings to normalize variations
CANONICAL_SKILLS: Dict[str, str] = {
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "py": "Python",
    "python": "Python",
    "react": "React",
    "react.js": "React",
    "reactjs": "React",
    "node": "Node.js",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "express": "Express.js",
    "express.js": "Express.js",
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "vue": "Vue.js",
    "vue.js": "Vue.js",
    "vuejs": "Vue.js",
    "angular": "Angular",
    "next": "Next.js",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "aws": "AWS",
    "amazon web services": "AWS",
    "gcp": "Google Cloud",
    "google cloud platform": "Google Cloud",
    "google cloud": "Google Cloud",
    "azure": "Microsoft Azure",
    "microsoft azure": "Microsoft Azure",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "docker": "Docker",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "sqlite": "SQLite",
    "graphql": "GraphQL",
    "rest": "REST APIs",
    "restful": "REST APIs",
    "rest api": "REST APIs",
    "rest apis": "REST APIs",
    "api": "REST APIs",
    "apis": "REST APIs",
    "ci/cd": "CI/CD",
    "cicd": "CI/CD",
    "git": "Git",
    "github": "GitHub",
    "html": "HTML5",
    "html5": "HTML5",
    "css": "CSS3",
    "css3": "CSS3",
    "tailwind": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "redux": "Redux",
    "zustand": "Zustand",
    "sql": "SQL",
    "nosql": "NoSQL",
    "c++": "C++",
    "cpp": "C++",
    "c#": "C#",
    "csharp": "C#",
    ".net": ".NET",
    "dotnet": ".NET",
    "java": "Java",
    "golang": "Go",
    "go": "Go",
    "rust": "Rust",
    "ruby": "Ruby",
    "rails": "Ruby on Rails",
    "ruby on rails": "Ruby on Rails",
    "php": "PHP",
    "laravel": "Laravel",
    "devops": "DevOps",
    "terraform": "Terraform",
    "linux": "Linux",
    "bash": "Bash",
    "shell": "Shell Scripting",
    "machine learning": "Machine Learning",
    "ml": "Machine Learning",
    "ai": "Artificial Intelligence",
    "artificial intelligence": "Artificial Intelligence",
    "deep learning": "Deep Learning",
    "nlp": "Natural Language Processing",
    "sales": "Sales",
    "business development": "Business Development",
    "account management": "Account Management",
    "communication": "Effective Communication",
    "leadership": "Technical Leadership",
    "project management": "Project Management",
    "agile": "Agile / Scrum",
    "scrum": "Agile / Scrum",
    "testing": "Automated Testing",
    "jest": "Jest",
    "cypress": "Cypress",
    "playwright": "Playwright",
}


def normalize_skill(skill_name: str) -> str:
    """Normalize a skill token into its canonical display format."""
    cleaned = (skill_name or "").strip().lower()
    return CANONICAL_SKILLS.get(cleaned, (skill_name or "").strip().title())


def extract_skills_from_text(text: str) -> Set[str]:
    """Identify recognizable technology and professional skills in freeform text."""
    if not text:
        return set()
    found: Set[str] = set()
    t_lower = f" {text.lower()} "
    # Check multi-word keys first, then single words
    sorted_patterns = sorted(CANONICAL_SKILLS.keys(), key=lambda x: len(x), reverse=True)
    for raw_skill in sorted_patterns:
        # Word boundary search
        pattern = r'(?<![a-zA-Z0-9_#+])' + re.escape(raw_skill) + r'(?![a-zA-Z0-9_#+])'
        if re.search(pattern, t_lower):
            found.add(CANONICAL_SKILLS[raw_skill])
    return found


def parse_experience_years(exp_str: Optional[str]) -> float:
    """Extract numeric years of experience from string description."""
    if not exp_str:
        return 1.0
    s = exp_str.lower()
    if any(k in s for k in ["fresher", "entry", "intern", "student", "0-1", "0 year"]):
        return 0.5
    matches = re.findall(r'(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)', s)
    if matches:
        try:
            return float(matches[0])
        except Exception:
            pass
    # Standalone numbers
    nums = re.findall(r'\b(\d{1,2})\b', s)
    if nums:
        try:
            return float(nums[0])
        except Exception:
            pass
    return 2.0


class CandidateJobMatchingService:
    """
    Evaluates candidate resumes against real platform job postings
    using a 6-factor deterministic scoring model.
    """

    @classmethod
    def score_candidate_job(
        cls,
        candidate_profile: Dict[str, Any],
        job: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Calculate compatibility score (0-100) and breakdown using:
        - Required technical skills: 35%
        - Relevant experience: 25%
        - Responsibilities & role alignment: 20%
        - Education & qualifications: 10%
        - Location & work arrangement: 5%
        - Additional relevant skills: 5%
        """
        # 1. Prepare candidate data
        candidate_skills_raw = candidate_profile.get("skills") or []
        candidate_skills_normalized = {normalize_skill(s) for s in candidate_skills_raw if s}
        candidate_exp_str = str(candidate_profile.get("total_experience") or candidate_profile.get("years_of_experience") or "")
        candidate_years = parse_experience_years(candidate_exp_str)
        candidate_title = (candidate_profile.get("current_job_title") or candidate_profile.get("job_title") or "").lower()
        candidate_summary = (candidate_profile.get("summary") or candidate_profile.get("professional_summary") or "").lower()
        candidate_location = (candidate_profile.get("location") or "").lower()
        candidate_education = candidate_profile.get("education") or []
        resume_raw_text = (candidate_profile.get("raw_text") or "").lower()

        # Augment skills with skills found in raw resume text
        text_skills = extract_skills_from_text(resume_raw_text)
        candidate_all_skills = candidate_skills_normalized.union(text_skills)
        candidate_skills_lower = {s.lower() for s in candidate_all_skills}

        # 2. Prepare job data
        j_title = job.get("title") or "Position"
        j_title_lower = j_title.lower()
        j_desc = job.get("description") or ""
        j_desc_lower = j_desc.lower()
        j_company = job.get("company_name") or job.get("company") or "Company"
        j_loc = (job.get("location") or "Remote").lower()
        j_workplace = (job.get("workplace_type") or "").lower()
        if not j_workplace:
            j_workplace = "remote" if "remote" in j_loc else ("hybrid" if "hybrid" in j_loc else "on-site")

        # Extract job required skills
        job_skills_raw = job.get("skills") or []
        job_skills_set: Set[str] = set()
        if isinstance(job_skills_raw, list):
            for s in job_skills_raw:
                if s and isinstance(s, str):
                    job_skills_set.add(normalize_skill(s))
        elif isinstance(job_skills_raw, str):
            for part in re.split(r'[,|;/]+', job_skills_raw):
                clean = part.strip()
                if clean:
                    job_skills_set.add(normalize_skill(clean))

        # Also extract skills mentioned in the job description
        desc_skills = extract_skills_from_text(j_desc)
        all_job_skills = job_skills_set.union(desc_skills)
        if not all_job_skills:
            # Fallback if job has no explicit skills listed
            all_job_skills = {"Software Engineering", "Problem Solving", "Communication"}

        # ── FACTOR 1: Required Technical Skills Match (35%) ──────────────────
        matching_skills_list = []
        missing_skills_list = []

        for req in all_job_skills:
            req_norm = normalize_skill(req)
            req_lower = req_norm.lower()
            if req_lower in candidate_skills_lower or req_lower in resume_raw_text or req_lower in candidate_summary:
                matching_skills_list.append(req_norm)
            else:
                missing_skills_list.append(req_norm)

        total_req_count = max(len(all_job_skills), 3)
        tech_match_ratio = min(1.0, len(matching_skills_list) / total_req_count)
        # Give partial credit if candidate has strong general tech skills
        if tech_match_ratio < 0.4 and len(candidate_all_skills) >= 5:
            tech_match_ratio = min(0.65, tech_match_ratio + 0.25)
        technical_score = round(tech_match_ratio * 35.0, 1)

        # ── FACTOR 2: Relevant Experience Match (25%) ────────────────────────
        is_senior_job = any(w in j_title_lower or w in j_desc_lower for w in ["senior", "lead", "staff", "principal", "architect", "5+ years", "7+ years", "8+ years"])
        is_mid_job = any(w in j_title_lower or w in j_desc_lower for w in ["mid", "intermediate", "3+ years", "4+ years"])
        is_entry_job = any(w in j_title_lower or w in j_desc_lower for w in ["junior", "associate", "entry", "intern", "graduate"])

        exp_compatibility = "Direct Experience Alignment: Background fits role expectations."
        if is_senior_job:
            if candidate_years >= 5:
                exp_score = 25.0
                exp_compatibility = "Strong Senior Fit: Proven career trajectory matches senior level."
            elif candidate_years >= 2.5:
                exp_score = 18.0
                exp_compatibility = "Growth Potential: Mid-level background transitioning into senior scope."
            else:
                exp_score = 11.0
                exp_compatibility = "Reach Opportunity: Requires senior scope; candidate brings foundational skills."
        elif is_mid_job:
            if candidate_years >= 2.5:
                exp_score = 25.0
                exp_compatibility = "Direct Match: Candidate experience level directly aligns with vacancy."
            elif candidate_years >= 1:
                exp_score = 20.0
                exp_compatibility = "Well-Suited: Candidate has hands-on experience ready for mid-level responsibilities."
            else:
                exp_score = 14.0
                exp_compatibility = "Growth Opportunity: Fast-learner profile for accelerating into mid-level role."
        elif is_entry_job:
            exp_score = 25.0
            exp_compatibility = "Excellent Level Match: Ideal match for candidate's current stage."
        else:
            # Standard job
            if candidate_years >= 3:
                exp_score = 25.0
                exp_compatibility = "Solid Alignment: Verified background matches role requirements."
            elif candidate_years >= 1:
                exp_score = 21.0
                exp_compatibility = "Direct Level Fit: Suitable for role execution."
            else:
                exp_score = 16.0
                exp_compatibility = "Entry-Level Fit: Foundational competencies ready for deployment."

        # ── FACTOR 3: Job Responsibilities and Role Alignment (20%) ──────────
        role_alignment_score = 0.0
        # Title token overlap
        j_tokens = set(re.findall(r'\b[a-z]{3,}\b', j_title_lower)) - {"and", "for", "the", "with", "from"}
        c_title_tokens = set(re.findall(r'\b[a-z]{3,}\b', candidate_title))
        c_summary_tokens = set(re.findall(r'\b[a-z]{3,}\b', candidate_summary))

        title_overlap = j_tokens.intersection(c_title_tokens)
        summary_overlap = j_tokens.intersection(c_summary_tokens)

        if title_overlap:
            role_alignment_score = 18.0 + min(2.0, len(title_overlap) * 0.5)
        elif summary_overlap:
            role_alignment_score = 14.0 + min(4.0, len(summary_overlap) * 1.0)
        else:
            # Check domain overlap (e.g. engineer, developer, analyst, sales)
            role_categories = ["engineer", "developer", "designer", "product", "sales", "marketing", "data", "analyst"]
            matching_cats = [cat for cat in role_categories if cat in j_title_lower and (cat in candidate_title or cat in candidate_summary or cat in resume_raw_text)]
            if matching_cats:
                role_alignment_score = 15.0
            else:
                role_alignment_score = 10.0

        # ── FACTOR 4: Education & Qualifications (10%) ───────────────────────
        edu_score = 8.0  # default fair baseline
        has_degrees = len(candidate_education) > 0 or any(deg in resume_raw_text for deg in ["bachelor", "master", "degree", "b.s", "b.tech", "m.s", "computer science", "engineering"])
        requires_degree = any(term in j_desc_lower for term in ["degree in", "bachelor", "master's", "b.s.", "m.s."])

        if requires_degree:
            edu_score = 10.0 if has_degrees else 5.0
        else:
            edu_score = 10.0 if has_degrees else 8.5

        # ── FACTOR 5: Preferred Location and Work Arrangement (5%) ────────────
        loc_score = 3.0
        if j_workplace == "remote" or "remote" in j_loc or "anywhere" in j_loc:
            loc_score = 5.0
        elif candidate_location and any(part in j_loc for part in candidate_location.split(",") if part.strip()):
            loc_score = 5.0
        elif j_workplace == "hybrid":
            loc_score = 4.0
        else:
            loc_score = 3.0

        # ── FACTOR 6: Additional Relevant Skills (5%) ────────────────────────
        additional_skills_count = len(candidate_all_skills)
        add_score = min(5.0, 2.0 + (additional_skills_count * 0.3))

        # ── TOTAL SCORE CALCULATION ──────────────────────────────────────────
        total_score_raw = technical_score + exp_score + role_alignment_score + edu_score + loc_score + add_score
        final_score = int(round(max(35, min(98, total_score_raw))))

        # ── SUITABILITY REASON & IMPROVEMENTS ────────────────────────────────
        if matching_skills_list:
            top_skills = ", ".join(matching_skills_list[:4])
            suitability_reason = (
                f"Strong proficiency in {top_skills}. {exp_compatibility} "
                f"Location compatibility is optimal for {j_workplace.title()} work."
            )
        else:
            suitability_reason = (
                f"Foundational alignment for {j_title} at {j_company}. "
                f"Developing skills in {', '.join(missing_skills_list[:3]) or 'specialized tooling'} will significantly increase your interview probability."
            )

        suggestions = []
        if missing_skills_list:
            suggestions.append(f"Emphasize practical experience or side-projects with {', '.join(missing_skills_list[:3])}.")
        suggestions.append(f"Tailor your resume summary to align with {j_company}'s engineering values.")

        return {
            "match_percentage": final_score,
            "matching_skills": matching_skills_list,
            "missing_skills": missing_skills_list[:6],
            "experience_compatibility": exp_compatibility,
            "suitability_reason": suitability_reason,
            "improvement_suggestions": suggestions,
            "score_breakdown": {
                "technical_skills": technical_score,
                "experience": exp_score,
                "role_alignment": role_alignment_score,
                "education": edu_score,
                "location_workplace": loc_score,
                "additional_skills": add_score,
            },
        }

    @classmethod
    def calculate_and_persist_candidate_matches(
        cls,
        user_id: int,
        db: Session,
        resume_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Calculates match scores against all active platform and imported jobs,
        stores/updates records in candidate_job_matches, and returns formatted matched jobs.
        """
        # 1. Retrieve the latest active resume for this candidate
        resume_query = db.query(Resume).filter(Resume.user_id == user_id)
        if resume_id:
            resume = resume_query.filter(Resume.id == resume_id).first()
        else:
            resume = resume_query.filter(Resume.is_active == True).order_by(Resume.id.desc()).first()
            if not resume:
                resume = resume_query.order_by(Resume.id.desc()).first()

        if not resume:
            logger.warning(f"No resume found for candidate user_id={user_id}. Cannot compute matches.")
            return []

        # 2. Extract profile details
        parsed = resume.parsed_data or {}
        candidate_skills = resume.skills or []
        if isinstance(candidate_skills, list) and not candidate_skills:
            skills_obj = parsed.get("skills", {})
            if isinstance(skills_obj, dict):
                candidate_skills = (
                    skills_obj.get("technical", []) +
                    skills_obj.get("professional", []) +
                    skills_obj.get("domain", [])
                )

        candidate_profile = {
            "skills": candidate_skills,
            "total_experience": parsed.get("total_experience") or f"{resume.years_of_experience or 1}+ years",
            "years_of_experience": resume.years_of_experience,
            "current_job_title": resume.current_job_title or parsed.get("current_job_title"),
            "summary": resume.summary or parsed.get("professional_summary"),
            "location": resume.location or parsed.get("location"),
            "education": resume.education or parsed.get("education", []),
            "raw_text": resume.raw_text or "",
        }

        # 3. Retrieve all real active jobs from SQLite
        # A: Imported job listings (Greenhouse, Lever, Ashby, Workable)
        imported_jobs = (
            db.query(ImportedJobListing)
            .filter(ImportedJobListing.status == "active")
            .all()
        )

        # B: Platform Recruiter postings
        recruiter_jobs = (
            db.query(JobPosting)
            .filter(JobPosting.status.in_(["approved", "active", "published"]))
            .all()
        )

        all_target_jobs = []
        for imp in imported_jobs:
            all_target_jobs.append({
                "id": imp.id,
                "job_type": "imported",
                "source": imp.provider or "imported",
                "title": imp.title,
                "company_name": imp.company_name,
                "company_logo_url": imp.company_logo_url,
                "description": imp.description or "",
                "location": imp.location or "Remote",
                "workplace_type": imp.workplace_type or "remote",
                "employment_type": imp.employment_type or "Full-time",
                "salary": imp.salary or "Competitive",
                "skills": imp.skills or [],
                "job_posting_url": imp.job_posting_url,
                "posted_at": imp.posted_at.isoformat() if imp.posted_at else None,
            })

        for rec in recruiter_jobs:
            all_target_jobs.append({
                "id": rec.id,
                "job_type": "recruiter",
                "source": "recruiter",
                "title": rec.title,
                "company_name": rec.company_name,
                "company_logo_url": rec.company_logo_url,
                "description": rec.description or "",
                "location": rec.location or "Remote",
                "workplace_type": "remote" if "remote" in (rec.location or "").lower() else "on-site",
                "employment_type": rec.job_type or "Full-time",
                "salary": rec.salary_description or "Competitive",
                "skills": [s.strip() for s in (rec.skills or "").split(",") if s.strip()],
                "job_posting_url": None,
                "posted_at": rec.created_at.isoformat() if rec.created_at else None,
            })

        if not all_target_jobs:
            logger.info("No active jobs in database to match against.")
            return []

        # 4. Check candidate application status for these jobs
        applied_recruiter_ids = set()
        job_apps = db.query(JobApplication.job_posting_id).filter(JobApplication.candidate_id == user_id).all()
        for app in job_apps:
            applied_recruiter_ids.add(app[0])

        applied_agent_job_urls = set()
        try:
            from backend.database.models_complete import AgentRun
            agent_apps = (
                db.query(Application.job_url)
                .join(AgentRun, Application.agent_run_id == AgentRun.id)
                .filter(AgentRun.user_id == user_id)
                .all()
            )
            for a in agent_apps:
                if a and a[0]:
                    applied_agent_job_urls.add(a[0])
        except Exception as _app_err:
            logger.warning(f"Note checking applied agent job URLs: {_app_err}")

        # 5. Calculate scores and upsert into candidate_job_matches
        now = datetime.now(timezone.utc)
        results: List[Dict[str, Any]] = []

        for target_job in all_target_jobs:
            score_data = cls.score_candidate_job(candidate_profile, target_job)

            is_applied = False
            if target_job["job_type"] == "recruiter" and target_job["id"] in applied_recruiter_ids:
                is_applied = True
            elif target_job.get("job_posting_url") and target_job["job_posting_url"] in applied_agent_job_urls:
                is_applied = True

            # Check if match record already exists in database
            existing_match = (
                db.query(CandidateJobMatch)
                .filter(
                    CandidateJobMatch.user_id == user_id,
                    CandidateJobMatch.job_id == target_job["id"],
                    CandidateJobMatch.job_type == target_job["job_type"],
                )
                .first()
            )

            if existing_match:
                existing_match.resume_id = resume.id
                existing_match.match_percentage = score_data["match_percentage"]
                existing_match.score_breakdown = score_data["score_breakdown"]
                existing_match.matching_skills = score_data["matching_skills"]
                existing_match.missing_skills = score_data["missing_skills"]
                existing_match.suitability_reason = score_data["suitability_reason"]
                existing_match.improvement_suggestions = score_data["improvement_suggestions"]
                existing_match.experience_compatibility = score_data["experience_compatibility"]
                if is_applied and not existing_match.applied:
                    existing_match.applied = True
                    existing_match.applied_at = now
                existing_match.updated_at = now
            else:
                new_match = CandidateJobMatch(
                    user_id=user_id,
                    resume_id=resume.id,
                    job_id=target_job["id"],
                    job_type=target_job["job_type"],
                    job_title=target_job["title"],
                    company_name=target_job["company_name"],
                    company_logo_url=target_job.get("company_logo_url"),
                    location=target_job["location"],
                    workplace_type=target_job["workplace_type"],
                    employment_type=target_job["employment_type"],
                    salary=target_job["salary"],
                    job_posting_url=target_job.get("job_posting_url"),
                    source=target_job["source"],
                    match_percentage=score_data["match_percentage"],
                    score_breakdown=score_data["score_breakdown"],
                    matching_skills=score_data["matching_skills"],
                    missing_skills=score_data["missing_skills"],
                    suitability_reason=score_data["suitability_reason"],
                    improvement_suggestions=score_data["improvement_suggestions"],
                    experience_compatibility=score_data["experience_compatibility"],
                    applied=is_applied,
                    applied_at=now if is_applied else None,
                )
                db.add(new_match)

            results.append({
                "id": str(target_job["id"]),
                "job_id": target_job["id"],
                "job_type": target_job["job_type"],
                "title": target_job["title"],
                "company": target_job["company_name"],
                "company_logo_url": target_job.get("company_logo_url"),
                "location": target_job["location"],
                "workplace_type": target_job["workplace_type"],
                "employment_type": target_job["employment_type"],
                "salary_range": target_job["salary"],
                "salary": target_job["salary"],
                "job_posting_url": target_job.get("job_posting_url"),
                "source": target_job["source"],
                "match_percentage": score_data["match_percentage"],
                "matching_skills": score_data["matching_skills"],
                "missing_skills": score_data["missing_skills"],
                "experience_compatibility": score_data["experience_compatibility"],
                "suitability_reason": score_data["suitability_reason"],
                "improvement_suggestions": score_data["improvement_suggestions"],
                "score_breakdown": score_data["score_breakdown"],
                "description": target_job["description"][:350] + ("..." if len(target_job["description"]) > 350 else ""),
                "posted_at": target_job.get("posted_at"),
                "applied": is_applied,
            })

        db.commit()

        # Sort descending by match percentage
        results.sort(key=lambda x: x["match_percentage"], reverse=True)
        return results

    @classmethod
    def get_candidate_matches(
        cls,
        user_id: int,
        db: Session,
        min_threshold: Optional[int] = None,
        category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves matching jobs for the candidate from candidate_job_matches table.
        If no matches exist yet, calculates them on-the-fly.
        """
        existing_matches = (
            db.query(CandidateJobMatch)
            .filter(CandidateJobMatch.user_id == user_id)
            .order_by(desc(CandidateJobMatch.match_percentage))
            .all()
        )

        if not existing_matches:
            # Calculate and save
            return cls.calculate_and_persist_candidate_matches(user_id=user_id, db=db)

        # Format output
        formatted: List[Dict[str, Any]] = []
        for m in existing_matches:
            formatted.append({
                "id": str(m.job_id),
                "job_id": m.job_id,
                "job_type": m.job_type,
                "title": m.job_title,
                "company": m.company_name,
                "company_logo_url": m.company_logo_url,
                "location": m.location,
                "workplace_type": m.workplace_type,
                "employment_type": m.employment_type,
                "salary_range": m.salary or "Competitive",
                "salary": m.salary or "Competitive",
                "job_posting_url": m.job_posting_url,
                "source": m.source,
                "match_percentage": m.match_percentage,
                "matching_skills": m.matching_skills or [],
                "missing_skills": m.missing_skills or [],
                "experience_compatibility": m.experience_compatibility or "Compatible Experience",
                "suitability_reason": m.suitability_reason or "Strong qualification profile.",
                "improvement_suggestions": m.improvement_suggestions or [],
                "score_breakdown": m.score_breakdown or {},
                "description": f"Role at {m.company_name} ({m.location}).",
                "posted_at": m.created_at.isoformat() if m.created_at else None,
                "applied": m.applied,
            })

        # Apply in-memory filters if specified
        clean_thresh = int(min_threshold) if isinstance(min_threshold, (int, float)) and not hasattr(min_threshold, "default") else None
        if clean_thresh is not None:
            formatted = [j for j in formatted if j["match_percentage"] >= clean_thresh]

        clean_cat = str(category).lower().strip() if isinstance(category, str) and not hasattr(category, "default") and category.strip() else None
        if clean_cat:
            if clean_cat == "90plus":
                formatted = [j for j in formatted if j["match_percentage"] >= 90]
            elif clean_cat in ("80to89", "80plus"):
                formatted = [j for j in formatted if 80 <= j["match_percentage"] < 90]
            elif clean_cat == "applied":
                formatted = [j for j in formatted if j["applied"]]

        return formatted

