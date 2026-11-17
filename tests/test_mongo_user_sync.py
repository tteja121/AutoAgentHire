"""
Test MongoDB Atlas User & Google Auth Synchronization.
Verifies that UserRepository correctly bridges MongoDB Atlas and SQLite,
ensuring Google OAuth users are persisted and retrieved from MongoDB Atlas.
"""

from unittest.mock import MagicMock, patch
from backend.database.crud import UserRepository
from backend.database.connection import SessionLocal
from backend.database.models_complete import User


def test_user_repository_mongodb_fallback():
    """Verify UserRepository can query and restore users from MongoDB Atlas mock."""
    db = SessionLocal()
    try:
        mock_mongo_user = {
            "id": 9999,
            "uuid": "test-uuid-9999",
            "email": "mongo_candidate@test.com",
            "hashed_password": "fake_hashed_pw",
            "full_name": "Mongo Candidate",
            "role": "candidate",
            "is_active": True,
            "is_verified": True,
            "custom_user_id": "CAND-9999",
        }

        with patch("backend.database.mongo.mongo_manager._is_available", return_value=True), \
             patch("backend.database.mongo.mongo_manager.find_user_by_email", return_value=mock_mongo_user):
            
            user = UserRepository.get_by_email(db, "mongo_candidate@test.com")
            assert user is not None
            assert user.email == "mongo_candidate@test.com"
            assert user.role == "candidate"
            assert user.full_name == "Mongo Candidate"

            # Clean up test user
            db.delete(user)
            db.commit()
    finally:
        db.close()


def test_user_repository_create_mirrors_to_mongo():
    """Verify UserRepository.create mirrors new accounts to MongoDB Atlas."""
    db = SessionLocal()
    try:
        saved_docs = []
        def fake_save_user(doc):
            saved_docs.append(doc)
            return doc

        with patch("backend.database.mongo.mongo_manager._is_available", return_value=True), \
             patch("backend.database.mongo.mongo_manager.save_user", side_effect=fake_save_user):
            
            user = UserRepository.create(
                db,
                email="new_mongo_user@test.com",
                hashed_password="hashed_pw_test",
                full_name="New Mongo User",
                role="candidate",
            )
            assert user is not None
            assert len(saved_docs) == 1
            assert saved_docs[0]["email"] == "new_mongo_user@test.com"

            # Clean up test user
            db.delete(user)
            db.commit()
    finally:
        db.close()
