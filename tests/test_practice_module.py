"""
Automated unit tests for AI-Powered Interview and Technical Practice Module
and Resume Parsing text extraction & sanitization pipeline.
Uses Python built-in unittest.
"""

import os
import unittest

os.environ["TESTING"] = "true"
os.environ["GEMINI_API_KEY"] = ""
os.environ["GOOGLE_API_KEY"] = ""

from backend.database.connection import SessionLocal, init_db
from backend.database.models_complete import (
    User,
    Resume,
    PracticeSession,
    PracticeQuestion,
    PracticeAnswer,
)
from backend.services.ats_intelligence_service import sanitize_resume_text
from backend.services.practice_service import (
    get_candidate_practice_profile,
    generate_interview_questions,
    generate_technical_test_questions,
    evaluate_interview_answer,
    evaluate_technical_test_answer,
    finalize_practice_session,
)
from backend.routes.practice_routes import (
    get_practice_profile,
    start_interview_session,
    submit_interview_answer,
    finish_interview_session,
    start_technical_test,
    submit_technical_test,
    list_practice_sessions,
    get_practice_session_detail,
    StartInterviewRequest,
    SubmitInterviewAnswerRequest,
    StartTechnicalTestRequest,
    SubmitTechnicalTestRequest,
    SubmitTestItem,
)


class TestPracticeModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def setUp(self):
        self.db = SessionLocal()
        self.user = self.db.query(User).filter(User.role.in_(["candidate", "applicant"])).first()
        if not self.user:
            self.user = self.db.query(User).first()

    def tearDown(self):
        self.db.close()

    def test_01_sanitize_resume_text(self):
        """Test text sanitization strips control chars, normalizes Unicode and whitespace."""
        dirty_text = "John Doe\r\n\r\nSenior\x00 Developer\u201cFull-Stack\u201d\n\n\n\nSkills: Python, React  "
        clean = sanitize_resume_text(dirty_text, max_chars=1000)
        self.assertNotIn("\x00", clean)
        self.assertNotIn("\r", clean)
        self.assertIn("John Doe", clean)
        self.assertIn("Senior Developer", clean)
        self.assertIn('"Full-Stack"', clean)
        self.assertNotIn("\n\n\n", clean)

    def test_02_practice_profile_extraction(self):
        """Verify candidate practice profile extraction with fallback defaults."""
        profile = get_candidate_practice_profile(self.user.id, self.db)
        self.assertIn("target_designation", profile)
        self.assertIn("experience_level", profile)
        self.assertIn("skills", profile)
        self.assertIn("stats", profile)
        self.assertIsInstance(profile["skills"], list)

    def test_03_generate_interview_questions_fallback(self):
        """Test question bank generation works reliably without crashing or requiring API key."""
        skills = ["Python", "FastAPI", "React", "PostgreSQL", "Docker"]
        questions = generate_interview_questions(
            category="technical",
            domain="Full Stack",
            target_designation="Full Stack Engineer",
            experience_level="Mid-Level",
            candidate_skills=skills,
            candidate_projects=[],
            total_questions=4,
        )

        self.assertEqual(len(questions), 4)
        for q in questions:
            self.assertIn("question_text", q)
            self.assertGreater(len(q["question_text"]), 15)
            self.assertIn("evaluation_criteria", q)
            self.assertEqual(q["max_marks"], 10)

    def test_04_generate_technical_test_questions(self):
        """Test technical assessment questions generation and answer key availability."""
        mcq_questions = generate_technical_test_questions(
            test_type="mcq",
            domain="Computer Science",
            selected_skills=["Algorithms", "Python"],
            total_questions=3,
        )

        self.assertEqual(len(mcq_questions), 3)
        for q in mcq_questions:
            self.assertEqual(q["question_type"], "mcq")
            self.assertIsInstance(q["options"], list)
            self.assertEqual(len(q["options"]), 4)
            self.assertIsNotNone(q["correct_answer"])
            self.assertIn("explanation", q)

    def test_05_evaluate_interview_answer(self):
        """Test evaluating interview answer produces score, strengths, and follow-up."""
        res = evaluate_interview_answer(
            question_text="How do database indexes improve query performance?",
            evaluation_criteria=["B-tree lookup", "O(log N)", "Trade-offs on writes"],
            candidate_answer="Database indexes use balanced trees such as B-trees to perform lookups in logarithmic O(log N) time instead of doing a full sequential table scan. The trade-off is additional storage and write overhead during insert and update operations.",
            skill="SQL",
            category="technical",
        )

        self.assertGreaterEqual(res["score"], 7.0)
        self.assertTrue(res["is_correct"])
        self.assertGreater(len(res["strengths"]), 0)
        self.assertIn("better_answer_example", res)

    def test_06_evaluate_technical_test_mcq(self):
        """Test MCQ automated grading against correct answer."""
        question = PracticeQuestion(
            question_text="Which React hook memoizes calculations?",
            question_type="mcq",
            options=["useCallback", "useMemo", "useRef", "useState"],
            correct_answer="useMemo",
            max_marks=10,
        )

        # Correct submission
        eval_correct = evaluate_technical_test_answer(question, "useMemo")
        self.assertTrue(eval_correct["is_correct"])
        self.assertEqual(eval_correct["score"], 10.0)

        # Incorrect submission
        eval_wrong = evaluate_technical_test_answer(question, "useRef")
        self.assertFalse(eval_wrong["is_correct"])
        self.assertEqual(eval_wrong["score"], 0.0)

    def test_07_api_interview_flow(self):
        """End-to-end test of Practice interview lifecycle."""
        # 1. Profile endpoint
        prof = get_practice_profile(current_user=self.user, db=self.db)
        self.assertIn("skills", prof)

        # 2. Start interview
        start_req = StartInterviewRequest(
            category="technical",
            difficulty="medium",
            total_questions=3,
        )
        start_data = start_interview_session(body=start_req, current_user=self.user, db=self.db)
        self.assertIn("session_id", start_data)
        self.assertIn("question", start_data)
        session_id = start_data["session_id"]
        q1 = start_data["question"]

        # 3. Submit answer to question 1
        ans_req = SubmitInterviewAnswerRequest(
            question_id=q1["id"],
            candidate_answer="In asynchronous programming, the event loop handles non-blocking I/O operations without stopping the execution thread.",
            time_spent_seconds=30,
        )
        ans_data = submit_interview_answer(session_id=session_id, body=ans_req, current_user=self.user, db=self.db)
        self.assertIn("evaluation", ans_data)
        self.assertIn("score", ans_data["evaluation"])

        # 4. Finalize interview
        fin_data = finish_interview_session(session_id=session_id, current_user=self.user, db=self.db)
        self.assertEqual(fin_data["status"], "completed")
        self.assertIn("overall_score", fin_data)

    def test_08_api_technical_test_security_sanitization(self):
        """
        CRITICAL SECURITY TEST: Ensure questions returned during active test
        DO NOT leak correct_answer, explanation, or secret rubrics before submission.
        """
        test_req = StartTechnicalTestRequest(
            test_type="mcq",
            difficulty="medium",
            total_questions=3,
            duration_minutes=10,
        )
        data = start_technical_test(body=test_req, current_user=self.user, db=self.db)
        session_id = data["session_id"]
        questions = data["questions"]

        for q in questions:
            # Verified: Client NEVER receives correct_answer or explanation during active test
            self.assertNotIn("correct_answer", q)
            self.assertNotIn("explanation", q)
            self.assertIn("options", q)

        # Submit test
        sub_req = SubmitTechnicalTestRequest(
            answers=[
                SubmitTestItem(question_id=q["id"], candidate_answer=q["options"][0])
                for q in questions
            ],
            time_spent_seconds=120,
        )
        result = submit_technical_test(session_id=session_id, body=sub_req, current_user=self.user, db=self.db)
        self.assertEqual(result["status"], "completed")
        self.assertIn("results", result)
        # Verified: After submission, answer keys and explanations are revealed for educational review
        for item in result["results"]:
            self.assertIn("correct_answer", item)
            self.assertIn("explanation", item)


if __name__ == "__main__":
    unittest.main()
