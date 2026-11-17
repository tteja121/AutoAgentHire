"""
Unit and Integration Tests for Dynamic Gemini Practice Assessment Engine
Tests dynamic non-repeated question generation, deduplication, adaptive interview next-question flow,
and active test answer key security.
"""

import unittest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models_complete import Base, User, PracticeSession, PracticeQuestion, PracticeAnswer
from backend.services.practice_service import (
    generate_interview_questions,
    generate_technical_test_questions,
    adapt_next_interview_question,
    evaluate_interview_answer,
    evaluate_technical_test_answer,
)
from backend.routes.practice_routes import (
    start_interview_session,
    submit_interview_answer,
    start_technical_test,
    get_practice_session_detail,
    StartInterviewRequest,
    SubmitInterviewAnswerRequest,
    StartTechnicalTestRequest,
)


class TestDynamicGeminiPractice(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Seed test candidate
        self.candidate = User(
            email="dynamic_candidate@test.com",
            full_name="Dynamic Candidate",
            role="candidate",
            hashed_password="fakehash",
            default_job_role="Senior Full Stack Engineer",
        )
        self.db.add(self.candidate)
        self.db.commit()
        self.db.refresh(self.candidate)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)

    def test_01_interview_question_deduplication_with_exclusion_list(self):
        """
        Verify that generate_interview_questions strictly avoids any questions
        present in the excluded_questions list.
        """
        excluded = [
            "Can you explain the difference between synchronous and asynchronous execution in web applications? When would you prefer asynchronous architecture?",
            "How do database indexes improve query performance, and what are the trade-offs or overheads associated with creating too many indexes?",
        ]

        questions = generate_interview_questions(
            category="technical",
            domain="Full Stack",
            target_designation="Full Stack Developer",
            experience_level="Senior (5+ yrs)",
            candidate_skills=["Python", "FastAPI", "React", "PostgreSQL"],
            candidate_projects=[],
            total_questions=5,
            difficulty="hard",
            excluded_questions=excluded,
        )

        self.assertEqual(len(questions), 5)
        for q in questions:
            for exc in excluded:
                self.assertNotEqual(
                    q["question_text"].strip().lower(),
                    exc.strip().lower(),
                    f"Excluded question was unexpectedly returned: {q['question_text']}"
                )

    def test_02_technical_test_deduplication_with_exclusion_list(self):
        """
        Verify that generate_technical_test_questions avoids questions in excluded_questions list.
        """
        excluded = [
            "What is the time complexity of searching for an element in an unsorted array of size N versus looking up a key in a hash table with good hash distribution?",
        ]

        questions = generate_technical_test_questions(
            test_type="mcq",
            domain="Full Stack Development",
            selected_skills=["Algorithms", "Data Structures"],
            difficulty="medium",
            total_questions=4,
            excluded_questions=excluded,
        )

        self.assertEqual(len(questions), 4)
        for q in questions:
            for exc in excluded:
                self.assertNotEqual(
                    q["question_text"].strip().lower(),
                    exc.strip().lower(),
                    f"Excluded technical question was unexpectedly returned: {q['question_text']}"
                )

    def test_03_adapt_next_interview_question_on_skill_gap(self):
        """
        Verify that when candidate answer has missing concepts or low score,
        adapt_next_interview_question adapts the upcoming question to target the gap.
        """
        session = PracticeSession(
            user_id=self.candidate.id,
            title="Technical Interview",
            session_type="interview",
            interview_category="technical",
            domain="Backend Development",
            target_designation="Backend Engineer",
            experience_level="Mid-Level",
            difficulty="medium",
            total_questions=3,
            duration_minutes=15,
            status="in_progress",
        )
        self.db.add(session)
        self.db.commit()

        q1 = PracticeQuestion(
            session_id=session.id,
            question_index=1,
            question_type="conceptual",
            domain="Backend",
            skill="Database Transactions",
            difficulty="medium",
            question_text="Explain ACID properties in database transactions.",
            max_marks=10,
        )
        q2 = PracticeQuestion(
            session_id=session.id,
            question_index=2,
            question_type="conceptual",
            domain="Backend",
            skill="Caching",
            difficulty="medium",
            question_text="Original question about caching strategies.",
            max_marks=10,
        )
        self.db.add_all([q1, q2])
        self.db.commit()

        # Simulate low score evaluation with missing concepts
        low_eval = {
            "score": 4.5,
            "is_correct": False,
            "strengths": ["Mentioned Atomicity"],
            "missing_concepts": ["Isolation levels", "Durability WAL logging"],
            "suggested_improvement": "Review transaction isolation anomalies like phantom reads.",
            "follow_up_question": "What is the difference between Read Committed and Serializable isolation?",
        }

        adapted = adapt_next_interview_question(
            session=session,
            answered_question=q1,
            candidate_answer="ACID stands for atomicity, consistency, isolation and durability.",
            eval_result=low_eval,
            upcoming_question=q2,
            already_asked_texts=[q1.question_text],
        )

        self.assertIsNotNone(adapted.get("question_text"))
        self.assertNotEqual(q2.question_text, "Original question about caching strategies.")
        self.assertIn("Isolation levels", q2.question_text)
        self.assertEqual(q2.difficulty, "easy")

    def test_04_adapt_next_interview_question_on_high_performance(self):
        """
        Verify that when candidate scores high, adapt_next_interview_question
        escalates the next question to hard / high-scale distributed systems.
        """
        session = PracticeSession(
            user_id=self.candidate.id,
            title="Senior Technical Interview",
            session_type="interview",
            interview_category="technical",
            domain="Distributed Systems",
            target_designation="Staff Engineer",
            experience_level="Senior (5+ yrs)",
            difficulty="medium",
            total_questions=3,
            duration_minutes=15,
            status="in_progress",
        )
        self.db.add(session)
        self.db.commit()

        q1 = PracticeQuestion(
            session_id=session.id,
            question_index=1,
            question_type="conceptual",
            domain="Distributed Systems",
            skill="Raft Consensus",
            difficulty="medium",
            question_text="Explain leader election in Raft consensus.",
            max_marks=10,
        )
        q2 = PracticeQuestion(
            session_id=session.id,
            question_index=2,
            question_type="conceptual",
            domain="Distributed Systems",
            skill="Message Queues",
            difficulty="medium",
            question_text="Original question about Kafka partitions.",
            max_marks=10,
        )
        self.db.add_all([q1, q2])
        self.db.commit()

        high_eval = {
            "score": 9.5,
            "is_correct": True,
            "strengths": ["Deep understanding of randomized election timers and split-vote mitigation"],
            "missing_concepts": [],
            "suggested_improvement": "Exemplary answer.",
            "follow_up_question": "How does joint consensus handle membership changes?",
        }

        adapted = adapt_next_interview_question(
            session=session,
            answered_question=q1,
            candidate_answer="Raft uses randomized timers between 150-300ms to elect a leader...",
            eval_result=high_eval,
            upcoming_question=q2,
            already_asked_texts=[q1.question_text],
        )

        self.assertIsNotNone(adapted.get("question_text"))
        self.assertEqual(q2.difficulty, "hard")
        self.assertIn("high concurrency", q2.question_text.lower())

    def test_05_active_test_detail_sanitizes_correct_answers(self):
        """
        CRITICAL SECURITY REQUIREMENT: get_practice_session_detail MUST NOT expose
        correct_answer or explanation when a technical test session is in_progress!
        """
        session = PracticeSession(
            user_id=self.candidate.id,
            title="Timed Assessment",
            session_type="technical_test",
            test_type="mcq",
            domain="Full Stack Development",
            difficulty="medium",
            total_questions=1,
            duration_minutes=15,
            status="in_progress",
        )
        self.db.add(session)
        self.db.commit()

        q = PracticeQuestion(
            session_id=session.id,
            question_index=1,
            question_type="mcq",
            domain="Full Stack",
            skill="HTTP",
            difficulty="medium",
            question_text="What HTTP status indicates Forbidden?",
            options=["401 Unauthorized", "403 Forbidden", "404 Not Found", "500 Server Error"],
            correct_answer="403 Forbidden",
            explanation="403 Forbidden means client authenticated but lacks permissions.",
            max_marks=10,
        )
        self.db.add(q)
        self.db.commit()

        # Query session detail while in_progress
        detail = get_practice_session_detail(session_id=session.id, current_user=self.candidate, db=self.db)
        transcript = detail["transcript"]
        self.assertEqual(len(transcript), 1)
        self.assertIsNone(transcript[0]["correct_answer"], "correct_answer was leaked during active test!")
        self.assertIsNone(transcript[0]["explanation"], "explanation was leaked during active test!")

        # After session is completed, correct_answer and explanation should be revealed
        session.status = "completed"
        self.db.commit()

        detail_completed = get_practice_session_detail(session_id=session.id, current_user=self.candidate, db=self.db)
        transcript_completed = detail_completed["transcript"]
        self.assertEqual(transcript_completed[0]["correct_answer"], "403 Forbidden")
        self.assertIsNotNone(transcript_completed[0]["explanation"])


if __name__ == "__main__":
    unittest.main()
