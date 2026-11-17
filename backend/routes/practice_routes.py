"""
Practice API Routes for AutoAgentHire
Provides endpoints for AI Mock Interviews, Technical Assessments,
Resume-Tailored Practice, and Performance Analytics.
"""

import os
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.database.connection import get_db
from backend.database.models_complete import (
    User,
    PracticeSession,
    PracticeQuestion,
    PracticeAnswer,
)
from backend.auth.dependencies import get_current_user_optional
from backend.llm.gemini_service import get_gemini_service
from backend.services.ats_intelligence_service import sanitize_resume_text
from backend.routes.ats_routes import extract_text_from_pdf, extract_text_from_docx
from backend.services.practice_service import (
    get_candidate_practice_profile,
    generate_interview_questions,
    generate_technical_test_questions,
    adapt_next_interview_question,
    evaluate_interview_answer,
    evaluate_technical_test_answer,
    finalize_practice_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/practice", tags=["Practice"])


def _resolve_candidate(user: Optional[User], db: Session) -> User:
    """Helper to get current authenticated user or fallback candidate in dev."""
    if user:
        return user
    candidate = (
        db.query(User)
        .filter(User.role.in_(["candidate", "applicant"]))
        .order_by(User.id.desc())
        .first()
    )
    if not candidate:
        candidate = db.query(User).order_by(User.id.asc()).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to access Practice.",
        )
    return candidate


# ─── Pydantic Request Models ─────────────────────────────────────────────────

class StartInterviewRequest(BaseModel):
    category: str = "mixed"  # technical, hr, project, resume, domain, mixed
    practice_type: Optional[str] = None  # ai_technical_interview, hr_interview, resume_based_interview
    domain: Optional[str] = None
    target_designation: Optional[str] = None
    experience_level: Optional[str] = None
    difficulty: str = "medium"  # beginner, intermediate, advanced, expert (or easy, medium, hard)
    total_questions: int = 10
    mode: str = "custom"  # "custom" or "resume"
    selected_skills: Optional[List[str]] = None
    resume_data: Optional[Dict[str, Any]] = None


class SubmitInterviewAnswerRequest(BaseModel):
    question_id: int
    candidate_answer: str
    time_spent_seconds: Optional[int] = None


class StartTechnicalTestRequest(BaseModel):
    test_type: str = "mcq"  # mcq, coding, sql, debugging, mixed, domain_assessment
    practice_type: Optional[str] = None
    domain: Optional[str] = None
    target_designation: Optional[str] = None
    experience_level: Optional[str] = None
    difficulty: str = "medium"
    selected_skills: Optional[List[str]] = None
    total_questions: int = 10
    duration_minutes: int = 15
    mode: str = "custom"  # "custom" or "resume"
    resume_data: Optional[Dict[str, Any]] = None


class SaveTestAnswerRequest(BaseModel):
    question_id: int
    candidate_answer: str
    code_language: Optional[str] = None


class SubmitTestItem(BaseModel):
    question_id: int
    candidate_answer: str
    code_language: Optional[str] = None


class SubmitTechnicalTestRequest(BaseModel):
    answers: Optional[List[SubmitTestItem]] = None
    time_spent_seconds: Optional[int] = None


# ═══════════════════════════════════════════════════════════════════════════════
# STATUS & RESUME UPLOAD (ISOLATED)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/gemini-status")
def get_practice_gemini_status():
    """
    Safe configuration status endpoint reporting whether Gemini AI is configured.
    CRITICAL SECURITY GUARANTEE: Never exposes the API key value.
    """
    service = get_gemini_service()
    return service.get_status()


@router.post("/upload-resume")
async def upload_practice_resume(
    file: UploadFile = File(...),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Upload resume specifically for Practice test & interview generation.
    CRITICAL REQUIREMENT:
    Extracts skills, experience, projects, education, technical domains, and suggested designations.
    DOES NOT modify the candidate's User profile or authoritative account details.
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".pdf") or filename.endswith(".docx") or filename.endswith(".txt")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a PDF, DOCX, or TXT resume."
        )

    upload_dir = "uploads/resumes/practice"
    os.makedirs(upload_dir, exist_ok=True)
    temp_path = os.path.join(upload_dir, f"temp_practice_{file.filename}")

    try:
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Resume file exceeds 10 MB limit.")

        with open(temp_path, "wb") as f:
            f.write(content)

        resume_text = ""
        if filename.endswith(".pdf"):
            resume_text = extract_text_from_pdf(temp_path)
        elif filename.endswith(".docx"):
            resume_text = extract_text_from_docx(temp_path)
        elif filename.endswith(".txt"):
            try:
                resume_text = content.decode("utf-8", errors="ignore")
            except Exception:
                resume_text = ""

        safe_text = sanitize_resume_text(resume_text)
        if len(safe_text.strip()) < 30:
            raise HTTPException(status_code=400, detail="Could not extract readable text from uploaded file.")

        gemini = get_gemini_service()
        analysis = gemini.analyze_resume(safe_text)

        # Collate skills
        skills_obj = analysis.get("skills", {})
        tech = skills_obj.get("technical", []) if isinstance(skills_obj, dict) else []
        prof = skills_obj.get("professional", []) if isinstance(skills_obj, dict) else []
        dom = skills_obj.get("domain", []) if isinstance(skills_obj, dict) else []
        all_skills = list(dict.fromkeys(tech + prof + dom))

        # Identify relevant technical domains
        domain_keywords = {
            "Full Stack Development": ["react", "node", "javascript", "full stack", "fullstack", "typescript", "express"],
            "Frontend Development": ["react", "vue", "angular", "css", "html", "tailwind", "frontend"],
            "Backend Development": ["fastapi", "django", "flask", "spring", "backend", "microservices", "api", "rest"],
            "Python Development": ["python", "pandas", "numpy", "fastapi", "django", "flask", "pytest"],
            "Java Development": ["java", "spring boot", "spring", "hibernate", "maven", "jvm"],
            "Data Science": ["data science", "pandas", "numpy", "machine learning", "scikit-learn", "statistics"],
            "Artificial Intelligence": ["ai", "deep learning", "neural networks", "pytorch", "tensorflow", "llm"],
            "Machine Learning": ["machine learning", "ml", "classification", "regression", "clustering", "nlp"],
            "Cybersecurity": ["security", "penetration testing", "cryptography", "owasp", "soc", "siem"],
            "Cloud Computing": ["aws", "azure", "gcp", "cloud", "lambda", "ec2", "s3"],
            "DevOps": ["docker", "kubernetes", "ci/cd", "terraform", "ansible", "jenkins", "devops"],
            "Data Analytics": ["sql", "tableau", "power bi", "analytics", "bi", "excel", "dashboards"],
            "Software Testing": ["selenium", "playwright", "cypress", "qa", "test automation", "unit testing", "jest"],
        }

        text_lower = safe_text.lower()
        matched_domains = []
        for domain_name, kws in domain_keywords.items():
            if any(kw in text_lower for kw in kws):
                matched_domains.append(domain_name)
        if not matched_domains:
            matched_domains = ["Full Stack Development", "Backend Development"]

        from backend.services.ats_intelligence_service import calculate_recommended_designations
        suggested_designations = calculate_recommended_designations(
            candidate_skills=all_skills,
            total_experience_str=analysis.get("total_experience", "2+ years"),
            resume_text=safe_text,
        )

        return {
            "status": "success",
            "filename": file.filename,
            "skills": all_skills,
            "skill_categories": skills_obj,
            "experience": analysis.get("total_experience", "Fresher / Entry-Level (0-1 year)"),
            "employment_history": analysis.get("employment_history", []),
            "projects": analysis.get("key_projects", []),
            "education": analysis.get("education", []),
            "technical_domains": matched_domains[:5],
            "suggested_designations": suggested_designations[:6],
            "ai_powered": analysis.get("ai_powered", False),
            "model_used": analysis.get("model_used"),
        }
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/profile")
def get_practice_profile(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Returns candidate's parsed resume profile, skills, experience level,
    and historical practice statistics to power the Practice launchpad.
    """
    candidate = _resolve_candidate(current_user, db)
    return get_candidate_practice_profile(int(candidate.id), db)


# ─── 1. AI INTERVIEW SIMULATOR ───────────────────────────────────────────────

@router.post("/interview/start")
def start_interview_session(
    body: StartInterviewRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Initializes a new AI mock interview session, extracts candidate resume profile,
    generates tailored questions via Gemini AI, and returns the first question.
    """
    candidate = _resolve_candidate(current_user, db)
    profile = get_candidate_practice_profile(int(candidate.id), db)

    total_q = max(1, min(body.total_questions, 30))

    # Resolve category based on practice_type
    effective_category = body.category.lower()
    if body.practice_type:
        pt = body.practice_type.lower()
        if "hr" in pt:
            effective_category = "hr"
        elif "resume" in pt:
            effective_category = "resume"
        elif "technical" in pt:
            effective_category = "technical"

    cat_label = effective_category.replace("_", " ").title()
    title = f"{cat_label} Mock Interview"

    # Resolve skills and projects depending on mode:
    # If custom mode: strictly use manually entered skills!
    # If resume mode: use extracted resume info.
    if body.mode == "custom":
        skills_to_use = body.selected_skills or []
        projects_to_use = []
        domain_to_use = body.domain or "Software Engineering"
        designation_to_use = body.target_designation or "Software Engineer"
        exp_to_use = body.experience_level or "Mid-Level"
    else:
        # Resume mode
        resume_data = body.resume_data or {}
        skills_to_use = resume_data.get("skills") or profile.get("skills", [])[:10]
        projects_to_use = resume_data.get("projects") or profile.get("projects", [])
        domain_to_use = body.domain or (resume_data.get("technical_domains", ["Software Engineering"])[0] if resume_data.get("technical_domains") else profile.get("target_designation"))
        designation_to_use = body.target_designation or (resume_data.get("suggested_designations", ["Software Engineer"])[0] if resume_data.get("suggested_designations") else profile.get("target_designation"))
        exp_to_use = body.experience_level or resume_data.get("experience") or profile.get("experience_level")

    session = PracticeSession(
        user_id=candidate.id,
        title=title,
        session_type="interview",
        interview_category=effective_category,
        domain=domain_to_use,
        target_designation=designation_to_use,
        experience_level=exp_to_use,
        difficulty=body.difficulty.lower(),
        selected_skills=skills_to_use,
        total_questions=total_q,
        duration_minutes=total_q * 3,
        status="in_progress",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Fetch recent past questions to prevent duplicate questions across sessions
    recent_past = (
        db.query(PracticeQuestion.question_text)
        .join(PracticeSession, PracticeQuestion.session_id == PracticeSession.id)
        .filter(PracticeSession.user_id == candidate.id)
        .order_by(PracticeQuestion.id.desc())
        .limit(50)
        .all()
    )
    excluded = [q[0] for q in recent_past if q[0]]

    # Generate questions dynamically via Gemini (or fallback), excluding duplicates
    raw_questions = generate_interview_questions(
        category=effective_category,
        domain=session.domain,
        target_designation=session.target_designation,
        experience_level=session.experience_level,
        candidate_skills=skills_to_use,
        candidate_projects=projects_to_use,
        total_questions=total_q,
        difficulty=session.difficulty,
        excluded_questions=excluded,
    )

    db_questions: List[PracticeQuestion] = []
    for idx, q_data in enumerate(raw_questions):
        q = PracticeQuestion(
            session_id=session.id,
            question_index=idx + 1,
            question_type=q_data.get("question_type", "conceptual"),
            domain=q_data.get("domain", session.domain),
            skill=q_data.get("skill"),
            difficulty=q_data.get("difficulty", session.difficulty),
            question_text=q_data.get("question_text", f"Interview Question {idx + 1}"),
            code_snippet=q_data.get("code_snippet"),
            evaluation_criteria=q_data.get("evaluation_criteria", []),
            max_marks=q_data.get("max_marks", 10),
        )
        db.add(q)
        db_questions.append(q)

    db.commit()

    first_q = db_questions[0]
    return {
        "session_id": session.id,
        "uuid": session.uuid,
        "title": session.title,
        "category": session.interview_category,
        "total_questions": len(db_questions),
        "current_question_index": 1,
        "question": {
            "id": first_q.id,
            "question_index": first_q.question_index,
            "question_type": first_q.question_type,
            "skill": first_q.skill,
            "domain": first_q.domain,
            "difficulty": first_q.difficulty,
            "question_text": first_q.question_text,
            "code_snippet": first_q.code_snippet,
            "max_marks": first_q.max_marks,
        },
    }


@router.post("/interview/{session_id}/answer")
def submit_interview_answer(
    session_id: int,
    body: SubmitInterviewAnswerRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Evaluates candidate's response to an interview question using Gemini AI,
    records the score and feedback, and returns either the next question or the final report.
    """
    candidate = _resolve_candidate(current_user, db)
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.user_id == candidate.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    question = (
        db.query(PracticeQuestion)
        .filter(PracticeQuestion.id == body.question_id, PracticeQuestion.session_id == session.id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found in this session.")

    # Evaluate answer via AI
    eval_result = evaluate_interview_answer(
        question_text=question.question_text,
        evaluation_criteria=question.evaluation_criteria or [],
        candidate_answer=body.candidate_answer,
        skill=question.skill or "General",
        category=session.interview_category or "technical",
    )

    # Store or update answer
    answer = (
        db.query(PracticeAnswer)
        .filter(PracticeAnswer.session_id == session.id, PracticeAnswer.question_id == question.id)
        .first()
    )
    if not answer:
        answer = PracticeAnswer(
            session_id=session.id,
            question_id=question.id,
        )

    answer.candidate_answer = body.candidate_answer
    answer.score = eval_result["score"]
    answer.is_correct = eval_result["is_correct"]
    answer.evaluation = eval_result["evaluation"]
    answer.strengths = eval_result["strengths"]
    answer.mistakes = eval_result["mistakes"]
    answer.missing_concepts = eval_result["missing_concepts"]
    answer.suggested_improvement = eval_result["suggested_improvement"]
    answer.better_answer_example = eval_result["better_answer_example"]
    answer.follow_up_question = eval_result["follow_up_question"]
    db.add(answer)

    if body.time_spent_seconds:
        current_spent = int(session.time_spent_seconds or 0)
        session.time_spent_seconds = current_spent + body.time_spent_seconds

    db.commit()

    # Check for next unanswered question
    all_questions = (
        db.query(PracticeQuestion)
        .filter(PracticeQuestion.session_id == session.id)
        .order_by(PracticeQuestion.question_index.asc())
        .all()
    )
    answered_ids = {
        a.question_id
        for a in db.query(PracticeAnswer).filter(PracticeAnswer.session_id == session.id).all()
    }

    next_q = next((q for q in all_questions if q.id not in answered_ids), None)

    # If there is a next question, adaptively tune it based on candidate's answer and evaluation
    if next_q:
        already_asked = [q.question_text for q in all_questions if q.id in answered_ids]
        adapt_next_interview_question(
            session=session,
            answered_question=question,
            candidate_answer=body.candidate_answer,
            eval_result=eval_result,
            upcoming_question=next_q,
            already_asked_texts=already_asked,
        )
        db.commit()
        db.refresh(next_q)

    is_completed = next_q is None
    summary_report = None
    if is_completed:
        finalize_practice_session(session, db)
        summary_report = session.summary_feedback

    return {
        "evaluation": eval_result,
        "is_completed": is_completed,
        "answered_count": len(answered_ids),
        "total_questions": len(all_questions),
        "next_question": {
            "id": next_q.id,
            "question_index": next_q.question_index,
            "question_type": next_q.question_type,
            "skill": next_q.skill,
            "domain": next_q.domain,
            "difficulty": next_q.difficulty,
            "question_text": next_q.question_text,
            "code_snippet": next_q.code_snippet,
            "max_marks": next_q.max_marks,
        } if next_q else None,
        "summary_report": summary_report,
    }


@router.post("/interview/{session_id}/finish")
def finish_interview_session(
    session_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Manually concludes an interview session, calculates final score and report.
    """
    candidate = _resolve_candidate(current_user, db)
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.user_id == candidate.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    finalized = finalize_practice_session(session, db)
    return {
        "status": "completed",
        "overall_score": finalized.overall_score,
        "summary_feedback": finalized.summary_feedback,
    }


# ─── 2. TECHNICAL ASSESSMENT ARENA ──────────────────────────────────────────

@router.post("/test/start")
def start_technical_test(
    body: StartTechnicalTestRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Starts a timed technical test (MCQ, Coding, SQL, Debugging, or Mixed).
    Generates test questions with verified answer keys stored securely on backend.
    SECURITY GUARANTEE: Questions sent to frontend have correct_answer and explanation stripped.
    """
    candidate = _resolve_candidate(current_user, db)
    profile = get_candidate_practice_profile(candidate.id, db)

    total_q = max(1, min(body.total_questions, 30))
    duration = max(5, min(body.duration_minutes, 120))
    test_label = body.test_type.upper()
    title = f"{test_label} Technical Assessment"

    skills = body.selected_skills or profile.get("skills", [])[:6] or ["Full Stack", "SQL", "Python"]

    session = PracticeSession(
        user_id=candidate.id,
        title=title,
        session_type="technical_test",
        test_type=body.test_type.lower(),
        domain=body.domain or "Software Engineering",
        difficulty=body.difficulty.lower(),
        selected_skills=skills,
        total_questions=total_q,
        duration_minutes=duration,
        status="in_progress",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Fetch recent past questions to prevent duplicate test questions across sessions
    recent_past = (
        db.query(PracticeQuestion.question_text)
        .join(PracticeSession, PracticeQuestion.session_id == PracticeSession.id)
        .filter(PracticeSession.user_id == candidate.id)
        .order_by(PracticeQuestion.id.desc())
        .limit(50)
        .all()
    )
    excluded = [q[0] for q in recent_past if q[0]]

    # Generate questions with verified answers, avoiding duplicates
    raw_questions = generate_technical_test_questions(
        test_type=body.test_type,
        domain=session.domain,
        selected_skills=skills,
        difficulty=session.difficulty,
        total_questions=total_q,
        excluded_questions=excluded,
    )

    sanitized_questions: List[Dict[str, Any]] = []
    for idx, q_data in enumerate(raw_questions):
        q = PracticeQuestion(
            session_id=session.id,
            question_index=idx + 1,
            question_type=q_data.get("question_type", body.test_type),
            domain=q_data.get("domain", session.domain),
            skill=q_data.get("skill"),
            difficulty=q_data.get("difficulty", session.difficulty),
            question_text=q_data.get("question_text", f"Assessment Question {idx + 1}"),
            code_snippet=q_data.get("code_snippet"),
            options=q_data.get("options"),
            correct_answer=q_data.get("correct_answer"),  # Stored secretly in DB
            explanation=q_data.get("explanation"),        # Stored secretly in DB
            test_cases=q_data.get("test_cases", []),
            max_marks=q_data.get("max_marks", 10),
        )
        db.add(q)
        db.flush()

        # Sanitize for candidate client: NEVER send correct_answer or explanation during active test!
        sanitized_questions.append({
            "id": q.id,
            "question_index": q.question_index,
            "question_type": q.question_type,
            "skill": q.skill,
            "difficulty": q.difficulty,
            "question_text": q.question_text,
            "code_snippet": q.code_snippet,
            "options": q.options,
            "max_marks": q.max_marks,
        })

    db.commit()

    return {
        "session_id": session.id,
        "uuid": session.uuid,
        "title": session.title,
        "test_type": session.test_type,
        "duration_minutes": session.duration_minutes,
        "total_questions": len(sanitized_questions),
        "questions": sanitized_questions,
    }


@router.post("/test/{session_id}/answer")
def save_test_answer(
    session_id: int,
    body: SaveTestAnswerRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Saves an in-progress answer during an active technical test (auto-save).
    """
    candidate = _resolve_candidate(current_user, db)
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.user_id == candidate.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found.")

    question = (
        db.query(PracticeQuestion)
        .filter(PracticeQuestion.id == body.question_id, PracticeQuestion.session_id == session.id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found in this session.")

    answer = (
        db.query(PracticeAnswer)
        .filter(PracticeAnswer.session_id == session.id, PracticeAnswer.question_id == question.id)
        .first()
    )
    if not answer:
        answer = PracticeAnswer(
            session_id=session.id,
            question_id=question.id,
        )

    answer.candidate_answer = body.candidate_answer
    answer.code_language = body.code_language
    db.add(answer)
    db.commit()

    return {"status": "saved", "question_id": question.id}


@router.post("/test/{session_id}/submit")
def submit_technical_test(
    session_id: int,
    body: SubmitTechnicalTestRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Finalizes and scores the technical assessment.
    Evaluates all submitted answers against the database answer keys and evaluation criteria.
    Returns the comprehensive scorecard, detailed explanations, and answers breakdown.
    """
    candidate = _resolve_candidate(current_user, db)
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.user_id == candidate.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found.")

    if body.time_spent_seconds:
        session.time_spent_seconds = body.time_spent_seconds

    # If answers were passed in the submission payload, ensure they are stored
    if body.answers:
        for item in body.answers:
            ans = (
                db.query(PracticeAnswer)
                .filter(PracticeAnswer.session_id == session.id, PracticeAnswer.question_id == item.question_id)
                .first()
            )
            if not ans:
                ans = PracticeAnswer(session_id=session.id, question_id=item.question_id)
            ans.candidate_answer = item.candidate_answer
            ans.code_language = item.code_language
            db.add(ans)
        db.commit()

    # Evaluate each question
    questions = (
        db.query(PracticeQuestion)
        .filter(PracticeQuestion.session_id == session.id)
        .order_by(PracticeQuestion.question_index.asc())
        .all()
    )

    detailed_results = []
    for q in questions:
        ans = (
            db.query(PracticeAnswer)
            .filter(PracticeAnswer.session_id == session.id, PracticeAnswer.question_id == q.id)
            .first()
        )
        cand_text = ans.candidate_answer if ans else ""
        eval_res = evaluate_technical_test_answer(q, cand_text)

        if not ans:
            ans = PracticeAnswer(session_id=session.id, question_id=q.id)

        ans.score = eval_res["score"]
        ans.is_correct = eval_res["is_correct"]
        ans.evaluation = eval_res["evaluation"]
        ans.strengths = eval_res.get("strengths", [])
        ans.mistakes = eval_res.get("mistakes", [])
        ans.suggested_improvement = eval_res.get("suggested_improvement", "")
        db.add(ans)

        detailed_results.append({
            "question_id": q.id,
            "question_index": q.question_index,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "skill": q.skill,
            "candidate_answer": cand_text,
            "correct_answer": q.correct_answer,  # Now revealed upon submission
            "explanation": q.explanation,        # Now revealed upon submission
            "is_correct": eval_res["is_correct"],
            "score": eval_res["score"],
            "max_marks": q.max_marks,
            "evaluation": eval_res["evaluation"],
            "strengths": eval_res.get("strengths", []),
            "mistakes": eval_res.get("mistakes", []),
        })

    db.commit()

    # Finalize session scoring
    finalized = finalize_practice_session(session, db)

    return {
        "status": "completed",
        "session_id": finalized.id,
        "overall_score": finalized.overall_score,
        "summary_feedback": finalized.summary_feedback,
        "total_questions": len(questions),
        "results": detailed_results,
    }


# ─── 3. PRACTICE SESSIONS HISTORY & REVIEWS ──────────────────────────────────

@router.get("/sessions")
def list_practice_sessions(
    session_type: Optional[str] = Query(None, description="interview or technical_test"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Lists historical practice sessions for the candidate with pagination and filtering.
    """
    candidate = _resolve_candidate(current_user, db)
    query = db.query(PracticeSession).filter(PracticeSession.user_id == candidate.id)

    if session_type:
        query = query.filter(PracticeSession.session_type == session_type.lower())

    total_count = query.count()
    sessions = (
        query.order_by(desc(PracticeSession.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "sessions": [
            {
                "id": s.id,
                "uuid": s.uuid,
                "title": s.title,
                "session_type": s.session_type,
                "interview_category": s.interview_category,
                "test_type": s.test_type,
                "domain": s.domain,
                "status": s.status,
                "overall_score": s.overall_score,
                "total_questions": s.total_questions,
                "answered_questions": s.answered_questions,
                "duration_minutes": s.duration_minutes,
                "time_spent_seconds": s.time_spent_seconds,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in sessions
        ],
    }


@router.get("/sessions/{session_id}")
def get_practice_session_detail(
    session_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Retrieves full transcript, questions, answers, and evaluations for a practice session.
    """
    candidate = _resolve_candidate(current_user, db)
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.user_id == candidate.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found.")

    questions = (
        db.query(PracticeQuestion)
        .filter(PracticeQuestion.session_id == session.id)
        .order_by(PracticeQuestion.question_index.asc())
        .all()
    )

    answers_map = {
        a.question_id: a
        for a in db.query(PracticeAnswer).filter(PracticeAnswer.session_id == session.id).all()
    }

    is_active_test = session.session_type == "technical_test" and session.status == "in_progress"

    transcript = []
    for q in questions:
        ans = answers_map.get(q.id)
        transcript.append({
            "question_id": q.id,
            "question_index": q.question_index,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "skill": q.skill,
            "difficulty": q.difficulty,
            "options": q.options,
            "correct_answer": None if is_active_test else q.correct_answer,
            "explanation": None if is_active_test else q.explanation,
            "max_marks": q.max_marks,
            "candidate_answer": ans.candidate_answer if ans else None,
            "is_correct": ans.is_correct if ans else None,
            "score": ans.score if ans else 0.0,
            "evaluation": ans.evaluation if ans else None,
            "strengths": ans.strengths if ans else [],
            "mistakes": ans.mistakes if ans else [],
            "suggested_improvement": ans.suggested_improvement if ans else None,
            "better_answer_example": ans.better_answer_example if ans else None,
            "follow_up_question": ans.follow_up_question if ans else None,
        })

    return {
        "session": {
            "id": session.id,
            "uuid": session.uuid,
            "title": session.title,
            "session_type": session.session_type,
            "interview_category": session.interview_category,
            "test_type": session.test_type,
            "domain": session.domain,
            "difficulty": session.difficulty,
            "status": session.status,
            "overall_score": session.overall_score,
            "total_questions": session.total_questions,
            "answered_questions": session.answered_questions,
            "time_spent_seconds": session.time_spent_seconds,
            "summary_feedback": session.summary_feedback,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        },
        "transcript": transcript,
    }


@router.delete("/sessions/{session_id}")
def delete_practice_session(
    session_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Deletes a practice session from candidate history.
    """
    candidate = _resolve_candidate(current_user, db)
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.user_id == candidate.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found.")

    db.delete(session)
    db.commit()
    return {"status": "deleted", "id": session_id}


# ─── 4. PERFORMANCE ANALYTICS ────────────────────────────────────────────────

@router.get("/analytics")
def get_practice_analytics(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Aggregates overall performance metrics, domain strengths, and score history.
    """
    candidate = _resolve_candidate(current_user, db)
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == candidate.id, PracticeSession.status == "completed")
        .order_by(PracticeSession.created_at.asc())
        .all()
    )

    total_sessions = len(sessions)
    if total_sessions == 0:
        return {
            "total_sessions": 0,
            "average_score": 0,
            "interview_sessions": 0,
            "test_sessions": 0,
            "total_practice_minutes": 0,
            "skill_readiness_index": 0,
            "recent_scores": [],
            "category_breakdown": {},
        }

    scores = [s.overall_score for s in sessions if s.overall_score is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    interview_count = sum(1 for s in sessions if s.session_type == "interview")
    test_count = sum(1 for s in sessions if s.session_type == "technical_test")
    total_seconds = sum(s.time_spent_seconds or 0 for s in sessions)

    recent_scores = [
        {
            "id": s.id,
            "title": s.title,
            "score": s.overall_score,
            "type": s.session_type,
            "date": s.completed_at.strftime("%b %d") if s.completed_at else s.created_at.strftime("%b %d"),
        }
        for s in sessions[-8:]
    ]

    return {
        "total_sessions": total_sessions,
        "average_score": avg_score,
        "interview_sessions": interview_count,
        "test_sessions": test_count,
        "total_practice_minutes": round(total_seconds / 60, 1),
        "skill_readiness_index": min(100, int(avg_score * 0.95 + min(total_sessions * 2, 15))),
        "recent_scores": recent_scores,
    }
