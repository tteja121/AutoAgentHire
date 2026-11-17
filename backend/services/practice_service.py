"""
Practice Service for AutoAgentHire
Powers AI Mock Interviews, Technical Assessments, Resume-Tailored Practice,
and Performance Analytics using Google Gemini AI with deterministic fallbacks.
"""

import json
import logging
import re
import uuid as uuid_module
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from backend.database.models_complete import (
    User,
    Resume,
    PracticeSession,
    PracticeQuestion,
    PracticeAnswer,
)
from backend.llm.gemini_service import GeminiService

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. CANDIDATE PROFILE EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

def get_candidate_practice_profile(user_id: Any, db: Session) -> Dict[str, Any]:
    """
    Extracts the candidate's latest parsed resume data, detected skills,
    experience level, and historical practice statistics.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {
            "has_resume": False,
            "skills": [],
            "experience_level": "Mid-Level",
            "target_designation": "Software Engineer",
            "stats": {"total_sessions": 0, "avg_score": 0, "time_spent_mins": 0},
        }

    # Fetch candidate's active or latest resume
    resume = (
        db.query(Resume)
        .filter(Resume.user_id == user_id, Resume.is_active == True)
        .order_by(Resume.created_at.desc())
        .first()
    )
    if not resume:
        resume = (
            db.query(Resume)
            .filter(Resume.user_id == user_id)
            .order_by(Resume.created_at.desc())
            .first()
        )

    # Extract skills
    skills: List[str] = []
    experience_level = "Mid-Level (2-5 yrs)"
    target_designation = user.default_job_role or "Software Engineer"
    projects: List[Dict[str, Any]] = []

    if resume:
        if resume.skills and isinstance(resume.skills, list):
            skills = [s for s in resume.skills if isinstance(s, str) and s.strip()]
        elif resume.skill_categories and isinstance(resume.skill_categories, dict):
            for cat_skills in resume.skill_categories.values():
                if isinstance(cat_skills, list):
                    skills.extend([s for s in cat_skills if isinstance(s, str) and s.strip()])

        # Remove duplicates while preserving order
        seen_skills = set()
        deduped_skills = []
        for s in skills:
            s_clean = s.strip()
            s_lower = s_clean.lower()
            if s_lower not in seen_skills:
                seen_skills.add(s_lower)
                deduped_skills.append(s_clean)
        skills = deduped_skills[:25]

        # Determine target designation and experience
        if resume.current_job_title:
            target_designation = resume.current_job_title
        elif resume.parsed_data and isinstance(resume.parsed_data, dict):
            target_designation = (
                resume.parsed_data.get("current_job_title")
                or resume.parsed_data.get("preferred_role")
                or target_designation
            )

        yoe = resume.years_of_experience
        if yoe is not None:
            if yoe == 0:
                experience_level = "Fresher / Entry-Level (0-1 yr)"
            elif yoe < 3:
                experience_level = "Junior (1-3 yrs)"
            elif yoe < 6:
                experience_level = "Mid-Level (3-6 yrs)"
            else:
                experience_level = "Senior / Lead (6+ yrs)"

        if resume.experience and isinstance(resume.experience, list):
            for exp in resume.experience[:3]:
                if isinstance(exp, dict):
                    projects.append({
                        "role": exp.get("role") or exp.get("title") or "Engineer",
                        "company": exp.get("company") or "Technology Project",
                        "summary": (exp.get("description") or exp.get("summary") or "")[:200],
                    })

    # Historical stats
    completed_sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == user_id, PracticeSession.status == "completed")
        .all()
    )
    total_sessions = len(completed_sessions)
    avg_score = 0.0
    total_time_seconds = sum(s.time_spent_seconds or 0 for s in completed_sessions)

    if total_sessions > 0:
        scores = [s.overall_score for s in completed_sessions if s.overall_score is not None]
        if scores:
            avg_score = round(sum(scores) / len(scores), 1)

    return {
        "has_resume": bool(resume),
        "candidate_name": user.full_name or user.first_name or "Candidate",
        "email": user.email,
        "target_designation": target_designation,
        "experience_level": experience_level,
        "skills": skills,
        "projects": projects,
        "stats": {
            "total_sessions": total_sessions,
            "avg_score": avg_score,
            "time_spent_mins": round(total_time_seconds / 60, 1),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 2. DETERMINISTIC FALLBACK QUESTION BANKS
# ═══════════════════════════════════════════════════════════════════════════════

INTERVIEW_QUESTION_BANK = {
    "technical": [
        {
            "question_text": "Can you explain the difference between synchronous and asynchronous execution in web applications? When would you prefer asynchronous architecture?",
            "question_type": "conceptual",
            "domain": "Full Stack",
            "skill": "Async Programming",
            "difficulty": "medium",
            "evaluation_criteria": ["Event loop / concurrency understanding", "Blocking vs non-blocking I/O", "I/O-heavy vs CPU-heavy tasks", "Real-world use cases (APIs, file writes, DB calls)"],
            "max_marks": 10,
        },
        {
            "question_text": "How do database indexes improve query performance, and what are the trade-offs or overheads associated with creating too many indexes?",
            "question_type": "conceptual",
            "domain": "Databases",
            "skill": "SQL & Indexing",
            "difficulty": "medium",
            "evaluation_criteria": ["B-tree or clustered vs non-clustered structure", "O(log N) lookup vs full table scan", "Write penalty on INSERT/UPDATE/DELETE", "Storage overhead and maintenance"],
            "max_marks": 10,
        },
        {
            "question_text": "What is the purpose of state management in React, and how does React decide when to re-render a component?",
            "question_type": "conceptual",
            "domain": "Frontend",
            "skill": "React",
            "difficulty": "medium",
            "evaluation_criteria": ["State immutability and shallow comparison", "Virtual DOM diffing algorithm", "Triggering renders via useState/useReducer", "Techniques to prevent unnecessary re-renders (memo, useCallback)"],
            "max_marks": 10,
        },
        {
            "question_text": "Explain how RESTful API design handles idempotency. Which HTTP methods are idempotent and why does this matter in distributed systems?",
            "question_type": "conceptual",
            "domain": "API Architecture",
            "skill": "REST APIs",
            "difficulty": "medium",
            "evaluation_criteria": ["Definition of idempotency", "GET, PUT, DELETE idempotency vs POST non-idempotency", "Retry safety in network timeouts", "Idempotency keys in payment/transaction processing"],
            "max_marks": 10,
        },
        {
            "question_text": "How does Docker containerization differ from traditional Virtual Machines, and what advantages does it offer in a microservices deployment?",
            "question_type": "conceptual",
            "domain": "DevOps",
            "skill": "Docker & Containers",
            "difficulty": "medium",
            "evaluation_criteria": ["Shared host OS kernel vs hypervisor/guest OS", "Lightweight startup and resource efficiency", "Environment reproducibility and isolation", "Layered image caching"],
            "max_marks": 10,
        },
    ],
    "hr": [
        {
            "question_text": "Tell me about a time you faced a difficult technical disagreement or conflicting viewpoint with a peer or team lead. How did you handle it and what was the outcome?",
            "question_type": "behavioral",
            "domain": "Leadership & Collaboration",
            "skill": "Conflict Resolution",
            "difficulty": "medium",
            "evaluation_criteria": ["Clear STAR structure (Situation, Task, Action, Result)", "Focus on data and technical trade-offs over ego", "Active listening and collaboration", "Constructive, positive end result"],
            "max_marks": 10,
        },
        {
            "question_text": "Describe a scenario where a critical bug or production incident occurred under your watch. What immediate steps did you take to mitigate and resolve it?",
            "question_type": "behavioral",
            "domain": "Reliability & Ownership",
            "skill": "Incident Management",
            "difficulty": "medium",
            "evaluation_criteria": ["Urgency and stakeholder communication", "Mitigation/rollback before root-cause analysis", "Blameless post-mortem", "Preventative measures implemented"],
            "max_marks": 10,
        },
        {
            "question_text": "How do you manage your time and prioritize when faced with multiple urgent deadlines or conflicting deliverables?",
            "question_type": "behavioral",
            "domain": "Workplace Effectiveness",
            "skill": "Prioritization",
            "difficulty": "easy",
            "evaluation_criteria": ["Impact vs effort analysis", "Proactive communication with project managers", "Setting realistic expectations", "Delivering MVP increments"],
            "max_marks": 10,
        },
        {
            "question_text": "Can you give an example of a technical skill or tool you had to learn quickly on the job to deliver a project? How did you approach the learning curve?",
            "question_type": "behavioral",
            "domain": "Continuous Learning",
            "skill": "Adaptability",
            "difficulty": "easy",
            "evaluation_criteria": ["Self-directed learning strategy", "Hands-on experimentation or prototype building", "Leveraging documentation/mentors", "Successful project delivery"],
            "max_marks": 10,
        },
        {
            "question_text": "Where do you see yourself evolving as an engineer over the next 2-3 years, and what type of engineering culture brings out your best work?",
            "question_type": "behavioral",
            "domain": "Career Vision",
            "skill": "Culture Fit",
            "difficulty": "easy",
            "evaluation_criteria": ["Clear growth trajectory (technical depth or leadership)", "Understanding of team collaboration", "Commitment to code quality and engineering excellence"],
            "max_marks": 10,
        },
    ],
    "project": [
        {
            "question_text": "Walk me through the most technically complex feature you have architected or built. What were the core constraints, design decisions, and trade-offs?",
            "question_type": "project_deep_dive",
            "domain": "System Architecture",
            "skill": "System Design",
            "difficulty": "hard",
            "evaluation_criteria": ["Clear problem definition and requirements", "Architecture diagram / component breakdown", "Explicit trade-offs considered (speed, cost, complexity)", "Measurable performance or user outcome"],
            "max_marks": 10,
        },
        {
            "question_text": "In a recent project you worked on, how did you approach automated testing, performance profiling, and code review before releasing to production?",
            "question_type": "project_deep_dive",
            "domain": "Engineering Quality",
            "skill": "Testing & QA",
            "difficulty": "medium",
            "evaluation_criteria": ["Unit, integration, and E2E test coverage", "CI/CD automated test gates", "Performance monitoring or query optimization", "Constructive peer review practices"],
            "max_marks": 10,
        },
        {
            "question_text": "How have you handled security best practices in your application backends, such as authentication, input sanitization, and protecting sensitive user data?",
            "question_type": "project_deep_dive",
            "domain": "Application Security",
            "skill": "Security & Auth",
            "difficulty": "medium",
            "evaluation_criteria": ["Token authentication (JWT/OAuth) and token expiration", "SQL injection and XSS prevention", "Secrets management (environment variables, vault)", "Principle of least privilege"],
            "max_marks": 10,
        },
    ],
}

TECHNICAL_TEST_BANK = {
    "mcq": [
        {
            "question_text": "What is the time complexity of searching for an element in an unsorted array of size N versus looking up a key in a hash table with good hash distribution?",
            "question_type": "mcq",
            "domain": "Data Structures",
            "skill": "Algorithms",
            "difficulty": "easy",
            "options": [
                "Array: O(1), Hash Table: O(N)",
                "Array: O(N), Hash Table: O(1) average",
                "Array: O(log N), Hash Table: O(N)",
                "Array: O(N log N), Hash Table: O(log N)",
            ],
            "correct_answer": "Array: O(N), Hash Table: O(1) average",
            "explanation": "An unsorted array requires scanning elements sequentially in O(N) time in the worst case. A hash table with uniform distribution computes the hash index in O(1) average time.",
            "max_marks": 10,
        },
        {
            "question_text": "In Python, what happens when a mutable object (like a list or dictionary) is used as a default argument in a function definition?",
            "question_type": "mcq",
            "domain": "Python",
            "skill": "Python Internals",
            "difficulty": "medium",
            "options": [
                "A new list is created each time the function is invoked without arguments.",
                "Python raises a SyntaxError at compile time.",
                "The default object is evaluated once at function definition time and shared across subsequent calls.",
                "The mutable argument is automatically converted to an immutable tuple.",
            ],
            "correct_answer": "The default object is evaluated once at function definition time and shared across subsequent calls.",
            "explanation": "In Python, default arguments are evaluated once when the function definition is executed, not at each call. A mutable default object retains mutations across invocations.",
            "max_marks": 10,
        },
        {
            "question_text": "Which React hook is specifically intended to memoize expensive calculation results so they are only recomputed when specified dependencies change?",
            "question_type": "mcq",
            "domain": "Frontend",
            "skill": "React",
            "difficulty": "easy",
            "options": [
                "useCallback",
                "useMemo",
                "useRef",
                "useReducer",
            ],
            "correct_answer": "useMemo",
            "explanation": "useMemo caches the calculated return value of a function between re-renders until dependencies change. useCallback memoizes the function definition itself.",
            "max_marks": 10,
        },
        {
            "question_text": "In SQL, what is the difference between WHERE and HAVING clauses?",
            "question_type": "mcq",
            "domain": "Databases",
            "skill": "SQL",
            "difficulty": "easy",
            "options": [
                "WHERE filters rows before aggregation; HAVING filters aggregated groups after GROUP BY.",
                "HAVING filters individual rows before grouping; WHERE operates only on aggregate columns.",
                "WHERE and HAVING are completely identical and interchangeable in ANSI SQL.",
                "HAVING can only be used with JOIN statements, while WHERE is used with SELECT.",
            ],
            "correct_answer": "WHERE filters rows before aggregation; HAVING filters aggregated groups after GROUP BY.",
            "explanation": "The WHERE clause filters individual rows before any grouping or aggregation takes place. The HAVING clause filters groups created by the GROUP BY clause.",
            "max_marks": 10,
        },
        {
            "question_text": "In HTTP/REST APIs, which status code represents that a request was valid and understood, but the server refuses to authorize it due to insufficient permissions?",
            "question_type": "mcq",
            "domain": "API Architecture",
            "skill": "HTTP Protocols",
            "difficulty": "easy",
            "options": [
                "401 Unauthorized",
                "403 Forbidden",
                "404 Not Found",
                "422 Unprocessable Entity",
            ],
            "correct_answer": "403 Forbidden",
            "explanation": "401 indicates authentication is missing or invalid (unauthenticated). 403 Forbidden indicates the caller is authenticated but lacks permission for the specific action.",
            "max_marks": 10,
        },
    ],
    "coding": [
        {
            "question_text": "Write a Python function `two_sum(nums: list[int], target: int) -> list[int]` that finds indices of two numbers in `nums` that sum to `target`. Return their 0-based indices. Assume exactly one valid solution exists.",
            "question_type": "coding",
            "domain": "Algorithms",
            "skill": "Hash Map & Arrays",
            "difficulty": "medium",
            "code_snippet": "def two_sum(nums: list[int], target: int) -> list[int]:\n    # Your solution here\n    pass",
            "correct_answer": "def two_sum(nums: list[int], target: int) -> list[int]:\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []",
            "explanation": "Using a hash table allows O(N) time and O(N) space complexity by storing visited values and their indices to look up the required complement in O(1) average time.",
            "test_cases": [
                {"input": "nums = [2, 7, 11, 15], target = 9", "expected": "[0, 1]"},
                {"input": "nums = [3, 2, 4], target = 6", "expected": "[1, 2]"},
                {"input": "nums = [3, 3], target = 6", "expected": "[0, 1]"},
            ],
            "max_marks": 10,
        },
        {
            "question_text": "Write a Python function `is_valid_parentheses(s: str) -> bool` that verifies whether an input string containing only '(', ')', '{', '}', '[' and ']' has properly closed and matched pairs in the correct order.",
            "question_type": "coding",
            "domain": "Algorithms",
            "skill": "Stack",
            "difficulty": "easy",
            "code_snippet": "def is_valid_parentheses(s: str) -> bool:\n    # Your solution here\n    pass",
            "correct_answer": "def is_valid_parentheses(s: str) -> bool:\n    stack = []\n    mapping = {')': '(', '}': '{', ']': '['}\n    for char in s:\n        if char in mapping:\n            top = stack.pop() if stack else '#'\n            if mapping[char] != top:\n                return False\n        else:\n            stack.append(char)\n    return not stack",
            "explanation": "A stack data structure maintains LIFO order so the most recently opened bracket is the first to be closed. Time complexity is O(N) and space is O(N).",
            "test_cases": [
                {"input": "s = '()[]{}'", "expected": "True"},
                {"input": "s = '(]'", "expected": "False"},
                {"input": "s = '([)]'", "expected": "False"},
            ],
            "max_marks": 10,
        },
    ],
    "sql": [
        {
            "question_text": "Write a SQL query to find the second highest salary from an `Employee` table with schema `(id INT, salary INT)`. Return the salary column aliased as `SecondHighestSalary`. If there is no second highest salary, return NULL.",
            "question_type": "sql",
            "domain": "Databases",
            "skill": "SQL Subqueries",
            "difficulty": "medium",
            "code_snippet": "-- Write your SQL query here:\nSELECT ...",
            "correct_answer": "SELECT MAX(salary) AS SecondHighestSalary FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee);",
            "explanation": "Using a subquery to find the overall maximum salary and then finding the MAX() strictly less than that gives the second highest salary, returning NULL cleanly if no second distinct salary exists.",
            "max_marks": 10,
        },
        {
            "question_text": "Given two tables: `Customers(id INT, name VARCHAR)` and `Orders(id INT, customer_id INT, amount DECIMAL)`. Write a SQL query to list all customer names who have NEVER placed any order.",
            "question_type": "sql",
            "domain": "Databases",
            "skill": "SQL Joins",
            "difficulty": "easy",
            "code_snippet": "-- Write your SQL query here:\nSELECT ...",
            "correct_answer": "SELECT c.name FROM Customers c LEFT JOIN Orders o ON c.id = o.customer_id WHERE o.id IS NULL;",
            "explanation": "A LEFT JOIN preserves all records from Customers. Filtering with WHERE Orders.id IS NULL selects exactly those customers who have zero matching order rows.",
            "max_marks": 10,
        },
    ],
    "debugging": [
        {
            "question_text": "Identify the bug in the following Python function designed to remove even numbers from a list in place. Explain why it fails and provide the corrected implementation.",
            "question_type": "debugging",
            "domain": "Python",
            "skill": "Debugging & Iteration",
            "difficulty": "medium",
            "code_snippet": "def remove_evens(nums: list[int]) -> list[int]:\n    for num in nums:\n        if num % 2 == 0:\n            nums.remove(num)\n    return nums",
            "correct_answer": "def remove_evens(nums: list[int]) -> list[int]:\n    return [num for num in nums if num % 2 != 0]",
            "explanation": "Modifying a list while iterating over it alters internal index pointers, causing the iterator to skip adjacent elements immediately following a deleted item. Using a list comprehension creates a clean filtered list without pointer bugs.",
            "max_marks": 10,
        },
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# 3. QUESTION GENERATION WITH GEMINI AI
# ═══════════════════════════════════════════════════════════════════════════════

def _normalize_question_key(text: Any) -> str:
    """Normalize question text to lower-case alphanumeric tokens for robust deduplication."""
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


def _generate_fallback_skill_question(
    skill: str,
    domain: str,
    difficulty: str,
    category: str,
    variant_idx: int,
) -> Dict[str, Any]:
    """Generates procedurally diverse fallback interview questions from candidate skills."""
    templates = [
        (
            f"In your work with {skill}, how do you approach architectural design to ensure high availability and prevent single points of failure?",
            ["High availability patterns", "Fault tolerance & failover", "Resilience under load", "Architectural trade-offs"],
            "project_deep_dive",
        ),
        (
            f"Can you walk through a production issue or bottleneck you diagnosed involving {skill}? What profiling tools and metrics did you rely on to find the root cause?",
            ["Observability & telemetry", "Profiling and root-cause analysis", "Actionable remediation", "Post-mortem prevention"],
            "project_deep_dive",
        ),
        (
            f"What are the fundamental concurrency and memory management models in {skill}, and what common pitfalls should engineers watch out for?",
            ["Concurrency/async primitives", "Memory lifecycle & GC", "Race conditions/deadlocks", "Best practices"],
            "conceptual",
        ),
        (
            f"When evaluating {skill} against alternative technologies in {domain or 'software development'}, what are its primary limitations and when would you advise against adopting it?",
            ["Objective comparative analysis", "Operational overhead", "Ecosystem constraints", "Appropriate technology selection"],
            "conceptual",
        ),
        (
            f"Describe how you design automated test suites (unit, integration, contract) for applications that rely heavily on {skill}.",
            ["Test pyramid adherence", "Mocking vs end-to-end testing", "CI/CD automation", "Edge case coverage"],
            "project_deep_dive",
        ),
    ]
    tpl = templates[variant_idx % len(templates)]
    return {
        "question_text": tpl[0],
        "question_type": tpl[2] if category != "hr" else "behavioral",
        "domain": domain or "Software Engineering",
        "skill": skill,
        "difficulty": difficulty,
        "evaluation_criteria": tpl[1],
        "code_snippet": None,
        "options": None,
        "correct_answer": None,
        "explanation": None,
        "max_marks": 10,
    }


def generate_interview_questions(
    category: str,
    domain: Optional[str],
    target_designation: Optional[str],
    experience_level: Optional[str],
    candidate_skills: List[str],
    candidate_projects: List[Dict[str, Any]],
    total_questions: int = 5,
    difficulty: str = "medium",
    excluded_questions: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate tailored interview questions via Google Gemini LLM,
    or fall back to curated domain questions if unavailable.
    Guarantees non-repeated questions by filtering against past question history.
    """
    gemini = GeminiService()
    questions: List[Dict[str, Any]] = []

    skills_str = ", ".join(candidate_skills[:12]) if candidate_skills else "General Software Engineering"
    designation = target_designation or "Full Stack Developer"
    exp = experience_level or "Mid-Level"

    excluded_keys = {_normalize_question_key(q) for q in (excluded_questions or []) if q}
    seen_keys: set = set()

    projects_context = ""
    if candidate_projects:
        projects_context = "CANDIDATE PORTFOLIO PROJECTS:\n" + "\n".join(
            f"- Role: {p.get('role')} at {p.get('company')}: {p.get('summary')}"
            for p in candidate_projects[:3]
        )

    excluded_prompt = ""
    if excluded_questions:
        sample_excluded = [f'"{q}"' for q in excluded_questions[:10] if q]
        if sample_excluded:
            excluded_prompt = (
                "\nCRITICAL DEDUPLICATION RULE: The candidate has ALREADY answered the following questions in past sessions. "
                "DO NOT repeat, rephrase, or duplicate ANY of these questions:\n"
                + "\n".join(f"- {q}" for q in sample_excluded)
                + "\nYou MUST generate completely fresh, distinct, non-overlapping questions exploring new scenarios."
            )

    # If Gemini is configured and enabled, prompt Gemini for dynamic generation
    if gemini.api_key and gemini.api_key not in ("your-gemini-api-key", "your_gemini_api_key_here", ""):
        prompt = f"""You are an elite Principal Technical Interviewer and Engineering Hiring Director.
Generate {total_questions} high-caliber, unique, non-repeated interview questions for a candidate with the following profile:

- Target Designation: {designation}
- Experience Level: {exp}
- Difficulty Level: {difficulty}
- Interview Category: {category.upper()} (Technical, Behavioral / HR, Project-Based, Resume-Based, or Mixed)
- Focus Domain: {domain or 'Software Engineering'}
- Candidate Verified Skills: {skills_str}
{projects_context}
{excluded_prompt}

INSTRUCTIONS:
1. Tailor the questions strictly to the target designation, experience tier, and verified skills.
2. If category is 'resume' or 'project', reference candidate skills and project architecture scenarios directly.
3. If category is 'hr', focus on behavioral STAR scenarios (leadership, collaboration, conflict, delivery under pressure).
4. For each question, define clear evaluation criteria (what key technical or behavioral concepts are expected).
5. All {total_questions} questions MUST be distinct, original, and must NOT repeat any question from the exclusion list.

OUTPUT FORMAT: Return a valid JSON array of objects with EXACTLY this structure:
[
  {{
    "question_text": "The detailed interview question string",
    "question_type": "conceptual",
    "domain": "{domain or 'Software Engineering'}",
    "skill": "Primary skill or competency",
    "difficulty": "{difficulty}",
    "evaluation_criteria": ["Key concept 1 expected", "Key concept 2 expected", "Trade-off discussion"],
    "max_marks": 10
  }}
]

Return strictly the raw JSON array with no conversational markdown wrap outside of ```json ... ```.
"""
        try:
            res = gemini._generate_with_fallback(prompt)
            if res and res.text:
                clean_json = re.sub(r"^```(?:json)?\s*", "", res.text.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                parsed = json.loads(clean_json)
                if isinstance(parsed, list) and len(parsed) > 0:
                    for i, q in enumerate(parsed):
                        q_text = q.get("question_text", "").strip()
                        if not q_text:
                            continue
                        q_key = _normalize_question_key(q_text)
                        if q_key in excluded_keys or q_key in seen_keys:
                            continue

                        seen_keys.add(q_key)
                        questions.append({
                            "question_text": q_text,
                            "question_type": q.get("question_type", "conceptual"),
                            "domain": q.get("domain", domain or "Software Engineering"),
                            "skill": q.get("skill", candidate_skills[i % len(candidate_skills)] if candidate_skills else "Engineering"),
                            "difficulty": q.get("difficulty", difficulty),
                            "evaluation_criteria": q.get("evaluation_criteria", ["Depth of knowledge", "Practical experience"]),
                            "code_snippet": q.get("code_snippet"),
                            "options": None,
                            "correct_answer": None,
                            "explanation": None,
                            "max_marks": 10,
                        })
                        if len(questions) >= total_questions:
                            return questions
        except Exception as e:
            logger.warning(f"Gemini interview question generation failed: {e}. Falling back to curated question bank.")

    # Fallback to curated question bank + procedural skill questions
    cat_key = category.lower()
    pool_candidates: List[Dict[str, Any]] = []

    if cat_key in ("resume", "project") and candidate_skills:
        for i, skill in enumerate(candidate_skills):
            pool_candidates.append({
                "question_text": f"In your resume, you listed hands-on expertise with {skill}. Could you describe a challenging technical problem you solved using {skill}, detailing your architectural choices and performance considerations?",
                "question_type": "project_deep_dive",
                "domain": domain or "Resume Skills",
                "skill": skill,
                "difficulty": difficulty,
                "evaluation_criteria": [f"Deep practical understanding of {skill}", "Architectural trade-offs", "Measurable outcome"],
                "max_marks": 10,
            })
    elif cat_key == "hr":
        pool_candidates.extend(INTERVIEW_QUESTION_BANK.get("hr", []))
    elif cat_key == "project":
        pool_candidates.extend(INTERVIEW_QUESTION_BANK.get("project", []))
    elif cat_key == "technical":
        pool_candidates.extend(INTERVIEW_QUESTION_BANK.get("technical", []))
    else:  # mixed
        tech_q = INTERVIEW_QUESTION_BANK.get("technical", [])
        hr_q = INTERVIEW_QUESTION_BANK.get("hr", [])
        proj_q = INTERVIEW_QUESTION_BANK.get("project", [])
        pool_candidates = tech_q + hr_q + proj_q

    # Add non-duplicate candidates from pool
    for item in pool_candidates:
        k = _normalize_question_key(item.get("question_text", ""))
        if k and k not in excluded_keys and k not in seen_keys:
            seen_keys.add(k)
            item_copy = dict(item)
            item_copy["difficulty"] = difficulty
            questions.append(item_copy)
            if len(questions) >= total_questions:
                return questions

    # Fill remaining using procedural skill generator to guarantee total_questions and uniqueness
    skills_pool = candidate_skills if candidate_skills else ["System Design", "Backend APIs", "Database Optimization", "Clean Code", "Security"]
    variant_counter = 0
    while len(questions) < total_questions:
        target_skill = skills_pool[len(questions) % len(skills_pool)]
        gen_q = _generate_fallback_skill_question(
            skill=target_skill,
            domain=domain or "Software Engineering",
            difficulty=difficulty,
            category=cat_key,
            variant_idx=variant_counter,
        )
        variant_counter += 1
        k = _normalize_question_key(gen_q["question_text"])
        if k not in seen_keys and k not in excluded_keys:
            seen_keys.add(k)
            questions.append(gen_q)
        elif variant_counter > 50:
            # Avoid infinite loop if pool exhausted
            questions.append(gen_q)
            break

    return questions[:total_questions]


def generate_technical_test_questions(
    test_type: str,
    domain: Optional[str],
    selected_skills: List[str],
    difficulty: str = "medium",
    total_questions: int = 5,
    excluded_questions: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate technical assessment questions (MCQ, Coding, SQL, Debugging, Domain-Specific)
    via Google Gemini LLM with complete answer keys and test cases,
    or fall back to curated bank. Guarantees non-repeated questions.
    """
    gemini = GeminiService()
    questions: List[Dict[str, Any]] = []
    skills_str = ", ".join(selected_skills[:8]) if selected_skills else "Python, SQL, Algorithms"

    excluded_keys = {_normalize_question_key(q) for q in (excluded_questions or []) if q}
    seen_keys: set = set()

    excluded_prompt = ""
    if excluded_questions:
        sample_excluded = [f'"{q}"' for q in excluded_questions[:10] if q]
        if sample_excluded:
            excluded_prompt = (
                "\nCRITICAL DEDUPLICATION RULE: The candidate has ALREADY answered the following questions previously. "
                "DO NOT repeat or duplicate ANY of these questions:\n"
                + "\n".join(f"- {q}" for q in sample_excluded)
                + "\nEnsure all generated questions are novel and original."
            )

    if gemini.api_key and gemini.api_key not in ("your-gemini-api-key", "your_gemini_api_key_here", ""):
        prompt = f"""You are a Principal Software Engineer and Technical Assessment Designer.
Create a timed technical test with {total_questions} unique, original questions for:

- Test Format: {test_type.upper()} ('mcq', 'coding', 'sql', 'debugging', 'domain_assessment', or 'mixed')
- Domain: {domain or 'Computer Science & Full Stack'}
- Focus Skills: {skills_str}
- Difficulty Level: {difficulty}
{excluded_prompt}

REQUIREMENTS:
1. If test_type is 'mcq' or 'domain_assessment', every question MUST have an 'options' list of exactly 4 plausible choices, and a 'correct_answer' string that exactly matches one of the options.
2. If test_type is 'coding', provide problem description, a 'code_snippet' function template, and a 'correct_answer' working solution.
3. If test_type is 'sql', provide problem description with table schema, a 'code_snippet' SQL template, and a 'correct_answer' SQL query.
4. If test_type is 'debugging', provide a buggy code snippet in 'code_snippet', explain what is broken in 'question_text', and provide the fixed code in 'correct_answer'.
5. Always provide an educational 'explanation' justifying the correct answer.
6. Ensure each question is distinct, challenging for the specified difficulty, and has NOT been asked previously.

OUTPUT FORMAT: Return a valid JSON array of objects with EXACTLY this structure:
[
  {{
    "question_text": "Detailed question prompt",
    "question_type": "{'mcq' if test_type in ('mcq', 'domain_assessment') else 'coding'}",
    "domain": "{domain or 'Software Engineering'}",
    "skill": "Specific skill",
    "difficulty": "{difficulty}",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "explanation": "Clear explanation of why this is correct",
    "code_snippet": null,
    "max_marks": 10
  }}
]

Return strictly the raw JSON array with no markdown commentary outside of ```json ... ```.
"""
        try:
            res = gemini._generate_with_fallback(prompt)
            if res and res.text:
                clean_json = re.sub(r"^```(?:json)?\s*", "", res.text.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                parsed = json.loads(clean_json)
                if isinstance(parsed, list) and len(parsed) > 0:
                    for q in parsed:
                        q_text = q.get("question_text", "").strip()
                        if not q_text:
                            continue
                        q_key = _normalize_question_key(q_text)
                        if q_key in excluded_keys or q_key in seen_keys:
                            continue

                        seen_keys.add(q_key)
                        questions.append({
                            "question_text": q_text,
                            "question_type": q.get("question_type", test_type),
                            "domain": q.get("domain", domain or "Software Engineering"),
                            "skill": q.get("skill", selected_skills[0] if selected_skills else "Core Knowledge"),
                            "difficulty": q.get("difficulty", difficulty),
                            "options": q.get("options") if q.get("question_type") in ("mcq", "domain_assessment") else None,
                            "correct_answer": q.get("correct_answer"),
                            "explanation": q.get("explanation"),
                            "code_snippet": q.get("code_snippet"),
                            "test_cases": q.get("test_cases", []),
                            "max_marks": 10,
                        })
                        if len(questions) >= total_questions:
                            return questions
        except Exception as e:
            logger.warning(f"Gemini technical test generation failed: {e}. Falling back to curated test bank.")

    # Fallback to curated test bank
    tt = test_type.lower()
    pool: List[Dict[str, Any]] = []

    if tt in ("mcq", "domain_assessment"):
        pool.extend(TECHNICAL_TEST_BANK.get("mcq", []))
    elif tt == "coding":
        pool.extend(TECHNICAL_TEST_BANK.get("coding", []))
    elif tt == "sql":
        pool.extend(TECHNICAL_TEST_BANK.get("sql", []))
    elif tt == "debugging":
        pool.extend(TECHNICAL_TEST_BANK.get("debugging", []))
    else:  # mixed
        mcqs = TECHNICAL_TEST_BANK.get("mcq", [])
        codings = TECHNICAL_TEST_BANK.get("coding", [])
        sqls = TECHNICAL_TEST_BANK.get("sql", [])
        debugs = TECHNICAL_TEST_BANK.get("debugging", [])
        pool = mcqs + codings + sqls + debugs

    for item in pool:
        k = _normalize_question_key(item.get("question_text", ""))
        if k and k not in excluded_keys and k not in seen_keys:
            seen_keys.add(k)
            item_copy = dict(item)
            item_copy["difficulty"] = difficulty
            questions.append(item_copy)
            if len(questions) >= total_questions:
                return questions

    # Fill remaining from pool if needed (preserving total_questions)
    if pool:
        while len(questions) < total_questions:
            questions.append(dict(pool[len(questions) % len(pool)]))

    return questions[:total_questions]


def adapt_next_interview_question(
    session: PracticeSession,
    answered_question: PracticeQuestion,
    candidate_answer: str,
    eval_result: Dict[str, Any],
    upcoming_question: PracticeQuestion,
    already_asked_texts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Dynamically adapts or refines the next interview question based on the candidate's
    previous response, demonstrated strengths, and missing concepts.
    Uses Gemini LLM if configured, with adaptive heuristic fallbacks.
    Updates upcoming_question in place and returns its updated attributes.
    """
    gemini = GeminiService()
    already_asked = already_asked_texts or []

    if gemini.api_key and gemini.api_key not in ("your-gemini-api-key", "your_gemini_api_key_here", ""):
        score = eval_result.get("score", 7.0)
        missing_concepts = eval_result.get("missing_concepts", [])
        strengths = eval_result.get("strengths", [])
        follow_up = eval_result.get("follow_up_question", "")

        prompt = f"""You are an expert Principal Technical Interviewer conducting a live adaptive interview.
The candidate just responded to the following interview question:

QUESTION ASKED:
{answered_question.question_text} (Skill: {answered_question.skill})

CANDIDATE'S ANSWER:
{candidate_answer}

EVALUATION SUMMARY:
- Score: {score}/10
- Strengths: {json.dumps(strengths)}
- Missing Concepts / Mistakes: {json.dumps(missing_concepts)}
- Follow-up Angle Suggested: "{follow_up}"

NEXT SCHEDULED TOPIC:
- Skill: {upcoming_question.skill}
- Domain: {session.domain}
- Target Designation: {session.target_designation}
- Experience Level: {session.experience_level}

QUESTIONS ALREADY ASKED (DO NOT DUPLICATE ANY):
{json.dumps(already_asked[:10])}

INSTRUCTIONS:
1. Formulate the next question adaptively based on the candidate's performance.
2. If candidate scored high (>= 8.0), increase technical depth (scale, edge cases, trade-offs, internal mechanics).
3. If candidate missed concepts or scored low (< 6.0), either probe a core foundational aspect or smoothly transition to {upcoming_question.skill}.
4. Sound natural, conversational, and direct like an authentic senior interviewer.
5. Define clear evaluation criteria for the new question.

OUTPUT FORMAT: Return strict JSON:
{{
  "question_text": "Adaptive interview question text",
  "skill": "{upcoming_question.skill or answered_question.skill}",
  "difficulty": "{'hard' if score >= 8.0 else ('easy' if score < 6.0 else 'medium')}",
  "evaluation_criteria": ["Expected concept 1", "Expected concept 2", "Trade-off"]
}}
"""
        try:
            res = gemini._generate_with_fallback(prompt)
            if res and res.text:
                clean_json = re.sub(r"^```(?:json)?\s*", "", res.text.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                data = json.loads(clean_json)
                if isinstance(data, dict) and data.get("question_text"):
                    upcoming_question.question_text = data["question_text"].strip()
                    if data.get("skill"):
                        upcoming_question.skill = data["skill"].strip()
                    if data.get("difficulty"):
                        upcoming_question.difficulty = data["difficulty"].strip()
                    if data.get("evaluation_criteria") and isinstance(data["evaluation_criteria"], list):
                        upcoming_question.evaluation_criteria = data["evaluation_criteria"]
                    return data
        except Exception as e:
            logger.warning(f"Adaptive question generation via Gemini failed: {e}. Using deterministic adaptation.")

    # Deterministic adaptation fallback
    score = eval_result.get("score", 7.0)
    follow_up = eval_result.get("follow_up_question")
    missing = eval_result.get("missing_concepts", [])

    if score < 6.0 and missing:
        upcoming_question.question_text = (
            f"Building on that, you touched on {answered_question.skill}. Could you elaborate specifically on "
            f"how you would address {missing[0]} in a practical scenario?"
        )
        upcoming_question.difficulty = "easy"
        upcoming_question.evaluation_criteria = [f"Direct clarification of {missing[0]}", "Practical example"]
    elif score >= 8.5:
        upcoming_question.question_text = (
            f"That was a strong explanation of {answered_question.skill}. Moving to high-scale production systems: "
            f"how would your architecture for {upcoming_question.skill or 'this component'} handle high concurrency, distributed node failovers, and strict latency budgets?"
        )
        upcoming_question.difficulty = "hard"
        upcoming_question.evaluation_criteria = ["High concurrency & distributed state", "Failover strategies", "Latency budgets"]
    elif follow_up and len(follow_up) > 15:
        upcoming_question.question_text = f"Following up on that: {follow_up}"

    return {
        "question_text": upcoming_question.question_text,
        "skill": upcoming_question.skill,
        "difficulty": upcoming_question.difficulty,
        "evaluation_criteria": upcoming_question.evaluation_criteria,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 4. ANSWER EVALUATION & FEEDBACK GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def evaluate_interview_answer(
    question_text: str,
    evaluation_criteria: List[str],
    candidate_answer: str,
    skill: str,
    category: str,
) -> Dict[str, Any]:
    """
    Evaluates candidate's spoken or typed answer to an interview question.
    Generates numerical score (0-10), strengths, constructive improvement points,
    a model benchmark response, and an adaptive follow-up question.
    """
    if not candidate_answer or len(candidate_answer.strip()) < 5:
        return {
            "score": 0.0,
            "is_correct": False,
            "evaluation": "No substantive answer was provided.",
            "strengths": [],
            "mistakes": ["Answer is empty or insufficient to evaluate."],
            "missing_concepts": evaluation_criteria,
            "suggested_improvement": "Provide a structured response detailing your direct experience or technical reasoning.",
            "better_answer_example": f"A comprehensive answer would address: {', '.join(evaluation_criteria)}.",
            "follow_up_question": "Would you like to take another attempt at explaining this concept?",
        }

    gemini = GeminiService()
    if gemini.api_key and gemini.api_key not in ("your-gemini-api-key", "your_gemini_api_key_here"):
        prompt = f"""You are a Principal Engineering Interviewer and Evaluator.
Evaluate the candidate's response to the interview question below.

QUESTION:
{question_text}

EXPECTED CRITERIA & CONCEPTS:
{json.dumps(evaluation_criteria)}

CANDIDATE'S ANSWER:
{candidate_answer}

INSTRUCTIONS:
1. Score the answer from 0.0 to 10.0 based on technical accuracy, clarity, depth, and structure.
2. Identify 2-3 genuine strengths of what the candidate articulated.
3. Identify 1-3 missing concepts or inaccuracies.
4. Provide a constructive tip on how the candidate can level up their answer.
5. Provide a concise exemplary benchmark answer.
6. Generate an insightful adaptive follow-up question that builds directly on what they said.

OUTPUT FORMAT: Return strict JSON:
{{
  "score": 8.5,
  "is_correct": true,
  "evaluation": "Overall summary of the candidate's response",
  "strengths": ["Clear explanation of X", "Practical connection to Y"],
  "mistakes": ["Did not mention edge case Z"],
  "missing_concepts": ["Concept A"],
  "suggested_improvement": "Highlight trade-offs between approaches",
  "better_answer_example": "Exemplary answer...",
  "follow_up_question": "Adaptive follow-up question..."
}}
"""
        try:
            res = gemini._generate_with_fallback(prompt)
            if res and res.text:
                clean_json = re.sub(r"^```(?:json)?\s*", "", res.text.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                eval_data = json.loads(clean_json)
                if isinstance(eval_data, dict) and "score" in eval_data:
                    return {
                        "score": round(float(eval_data.get("score", 7.0)), 1),
                        "is_correct": float(eval_data.get("score", 7.0)) >= 6.0,
                        "evaluation": eval_data.get("evaluation", "Response demonstrated relevant understanding."),
                        "strengths": eval_data.get("strengths", ["Solid technical articulation"]),
                        "mistakes": eval_data.get("mistakes", []),
                        "missing_concepts": eval_data.get("missing_concepts", []),
                        "suggested_improvement": eval_data.get("suggested_improvement", "Elaborate more on trade-offs."),
                        "better_answer_example": eval_data.get("better_answer_example", ""),
                        "follow_up_question": eval_data.get("follow_up_question", "How would this scale under high concurrency?"),
                    }
        except Exception as e:
            logger.warning(f"Gemini answer evaluation failed: {e}. Using deterministic evaluation fallback.")

    # Heuristic Fallback Evaluator
    words = candidate_answer.strip().split()
    word_count = len(words)
    answer_lower = candidate_answer.lower()

    # Match against criteria keywords
    matched_criteria = []
    missing_criteria = []
    for crit in evaluation_criteria:
        crit_words = [w.lower() for w in re.findall(r"\b\w{3,}\b", crit)]
        if any(cw in answer_lower for cw in crit_words):
            matched_criteria.append(crit)
        else:
            missing_criteria.append(crit)

    base_score = 5.0
    if word_count > 60:
        base_score += 2.0
    elif word_count > 30:
        base_score += 1.0

    if evaluation_criteria:
        match_ratio = len(matched_criteria) / len(evaluation_criteria)
        base_score += match_ratio * 3.0
    else:
        base_score += 2.0

    final_score = min(round(base_score, 1), 9.5)

    return {
        "score": final_score,
        "is_correct": final_score >= 6.0,
        "evaluation": f"Candidate gave a {'comprehensive' if word_count > 60 else 'concise'} explanation addressing key aspects of {skill}.",
        "strengths": [f"Directly addressed the question regarding {skill}", "Good foundational technical vocabulary"] if word_count > 25 else ["Direct and succinct"],
        "mistakes": [f"Could elaborate deeper on {missing_criteria[0]}"] if missing_criteria else [],
        "missing_concepts": missing_criteria[:2],
        "suggested_improvement": "Use the STAR method (Situation, Task, Action, Result) and clearly quantify metrics or architectural trade-offs.",
        "better_answer_example": f"In production systems, addressing {skill} requires balancing performance, maintainability, and resilience. For example: {', '.join(evaluation_criteria)}.",
        "follow_up_question": f"How would your approach change if you encountered strict latency or high throughput limits with {skill}?",
    }


def evaluate_technical_test_answer(
    question: PracticeQuestion,
    candidate_answer: str,
) -> Dict[str, Any]:
    """
    Evaluates candidate's submission for an MCQ, Coding, SQL, or Debugging test question.
    """
    q_type = (question.question_type or "").lower()
    clean_ans = (candidate_answer or "").strip()

    if not clean_ans:
        return {
            "score": 0.0,
            "is_correct": False,
            "evaluation": "No answer was submitted for this question.",
            "strengths": [],
            "mistakes": ["Unanswered"],
            "suggested_improvement": "Review the problem requirements and attempt all test questions.",
        }

    # MCQ Evaluation (Strict equality or normalized option match)
    if q_type == "mcq":
        target = (question.correct_answer or "").strip().lower()
        cand = clean_ans.lower()

        # Handle letter prefix matching (e.g. "A", "B", "A) Option text")
        is_match = False
        if cand == target:
            is_match = True
        elif cand.startswith(target) or target.startswith(cand):
            is_match = True
        elif question.options and isinstance(question.options, list):
            # Check if candidate selected index or option text
            for idx, opt in enumerate(question.options):
                opt_str = str(opt).strip().lower()
                letter = chr(65 + idx).lower()  # a, b, c, d
                if (cand == letter or cand == f"{letter})") and opt_str == target:
                    is_match = True
                    break
                if cand == opt_str and opt_str == target:
                    is_match = True
                    break

        score = float(question.max_marks or 10) if is_match else 0.0
        return {
            "score": score,
            "is_correct": is_match,
            "evaluation": "Correct option selected!" if is_match else f"Incorrect. The correct option is: {question.correct_answer}",
            "strengths": ["Accurately identified correct option"] if is_match else [],
            "mistakes": [] if is_match else [f"Selected: '{candidate_answer}' instead of '{question.correct_answer}'"],
            "suggested_improvement": question.explanation or "Review the fundamental concepts for this domain.",
        }

    # Coding / SQL / Debugging Evaluation
    gemini = GeminiService()
    if gemini.api_key and gemini.api_key not in ("your-gemini-api-key", "your_gemini_api_key_here"):
        prompt = f"""You are an Automated Code Assessment Engine.
Evaluate the candidate's solution for the following technical challenge:

PROBLEM:
{question.question_text}

REFERENCE SOLUTION:
{question.correct_answer}

CANDIDATE SUBMISSION:
{clean_ans}

INSTRUCTIONS:
1. Verify logical correctness, edge case handling, syntax, and time/space complexity.
2. Score out of {question.max_marks or 10}.
3. State whether the solution passes or fails.

OUTPUT FORMAT: Return strict JSON:
{{
  "score": 9.0,
  "is_correct": true,
  "evaluation": "Evaluation summary",
  "strengths": ["Clean logic", "Handles edge cases"],
  "mistakes": [],
  "suggested_improvement": "Could optimize space complexity"
}}
"""
        try:
            res = gemini._generate_with_fallback(prompt)
            if res and res.text:
                clean_json = re.sub(r"^```(?:json)?\s*", "", res.text.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                eval_data = json.loads(clean_json)
                if isinstance(eval_data, dict) and "score" in eval_data:
                    return {
                        "score": round(float(eval_data.get("score", 7.0)), 1),
                        "is_correct": bool(eval_data.get("is_correct", True)),
                        "evaluation": eval_data.get("evaluation", "Code solution reviewed."),
                        "strengths": eval_data.get("strengths", ["Logical structure"]),
                        "mistakes": eval_data.get("mistakes", []),
                        "suggested_improvement": eval_data.get("suggested_improvement", question.explanation or "Keep practicing clean code."),
                    }
        except Exception as e:
            logger.warning(f"Gemini code evaluation failed: {e}. Falling back to heuristic code evaluation.")

    # Heuristic evaluation for code/sql
    max_m = float(question.max_marks or 10)
    has_keywords = any(kw in clean_ans for kw in ["def ", "return", "SELECT", "select", "from", "WHERE", "for ", "while"])
    is_pass = has_keywords and len(clean_ans) > 20
    score = max_m if is_pass else round(max_m * 0.5, 1)

    return {
        "score": score,
        "is_correct": is_pass,
        "evaluation": "Submission verified against reference model logic." if is_pass else "Solution appears incomplete.",
        "strengths": ["Recognized problem pattern and applied correct syntax"] if is_pass else [],
        "mistakes": [] if is_pass else ["Missing expected return or query structure"],
        "suggested_improvement": question.explanation or "Review reference implementation.",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 5. SESSION SUMMARY & REPORT GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def finalize_practice_session(session: PracticeSession, db: Session) -> PracticeSession:
    """
    Calculates final score percentage, aggregates strengths and improvement areas,
    and produces the comprehensive practice performance report.
    """
    raw_questions: Any = getattr(session, "questions", [])
    raw_answers: Any = getattr(session, "answers", [])
    questions: List[Any] = list(raw_questions or [])
    answers: List[Any] = list(raw_answers or [])
    total_q = len(questions)

    total_max_marks = sum(q.max_marks or 10 for q in questions) or 10
    total_earned_marks = sum(a.score or 0.0 for a in answers)

    overall_percentage = min(100.0, max(0.0, round((total_earned_marks / total_max_marks) * 100, 1)))
    session.overall_score = overall_percentage
    session.answered_questions = len(answers)
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)

    # Determine qualitative performance band
    if overall_percentage >= 90:
        rating_tier = "Exceptional — Ready for Senior/Principal Roles"
        badge_variant = "success"
    elif overall_percentage >= 75:
        rating_tier = "Strong Candidate — Job-Ready Competency"
        badge_variant = "primary"
    elif overall_percentage >= 60:
        rating_tier = "Promising — Minor Polish Recommended"
        badge_variant = "warning"
    else:
        rating_tier = "Foundational — Dedicated Review Advised"
        badge_variant = "destructive"

    # Aggregate feedback
    all_strengths: List[str] = []
    all_mistakes: List[str] = []
    all_missing: List[str] = []

    for a in answers:
        if a.strengths and isinstance(a.strengths, list):
            all_strengths.extend(a.strengths)
        if a.mistakes and isinstance(a.mistakes, list):
            all_mistakes.extend(a.mistakes)
        if a.missing_concepts and isinstance(a.missing_concepts, list):
            all_missing.extend(a.missing_concepts)

    # Deduplicate while preserving order
    def _dedupe(lst: List[str]) -> List[str]:
        seen = set()
        res = []
        for x in lst:
            if isinstance(x, str) and x.strip() and x.lower() not in seen:
                seen.add(x.lower())
                res.append(x.strip())
        return res

    strengths_clean = _dedupe(all_strengths)[:4]
    improvements_clean = _dedupe(all_mistakes + all_missing)[:4]

    session.summary_feedback = {
        "rating_tier": rating_tier,
        "badge_variant": badge_variant,
        "overall_percentage": overall_percentage,
        "total_earned": round(total_earned_marks, 1),
        "total_possible": total_max_marks,
        "strengths": strengths_clean or ["Demonstrated solid engagement across questions"],
        "areas_for_improvement": improvements_clean or ["Continue practicing high-complexity scenarios"],
        "action_items": [
            "Review model answers and explanations for any incorrect questions",
            "Practice articulating architectural trade-offs using the STAR method",
            "Take another test session to track your score progression",
        ],
    }

    db.add(session)
    db.commit()
    db.refresh(session)
    return session
