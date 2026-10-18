"""
Unit and isolation tests for in-app user notifications.
Verifies read status persistence, count accuracy, and strict account isolation.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database.models_complete import Base, User, Notification
from backend.database.crud import NotificationRepository


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        # Create two distinct test users
        user_a = User(
            email="candidate_a@test.com",
            hashed_password="hashed_pw_a",
            full_name="Candidate A",
            role="candidate",
        )
        user_b = User(
            email="candidate_b@test.com",
            hashed_password="hashed_pw_b",
            full_name="Candidate B",
            role="candidate",
        )
        db.add_all([user_a, user_b])
        db.commit()
        db.refresh(user_a)
        db.refresh(user_b)
        yield db, user_a, user_b
    finally:
        db.close()


def test_seed_initial_notifications(test_db):
    db, user_a, user_b = test_db

    # User A initially has 0 notifications
    assert NotificationRepository.count_unread(db, user_a.id) == 0

    # Auto-seed initial notifications
    created = NotificationRepository.seed_initial_if_empty(db, user_a.id)
    assert len(created) == 4

    notifs = NotificationRepository.get_for_user(db, user_a.id)
    assert len(notifs) == 4

    # 3 unread, 1 already read in defaults
    unread = NotificationRepository.count_unread(db, user_a.id)
    assert unread == 3

    # Calling seed again should be idempotent
    created_again = NotificationRepository.seed_initial_if_empty(db, user_a.id)
    assert len(created_again) == 0
    assert len(NotificationRepository.get_for_user(db, user_a.id)) == 4


def test_mark_single_notification_read_persistence(test_db):
    db, user_a, _ = test_db
    NotificationRepository.seed_initial_if_empty(db, user_a.id)

    notifs = NotificationRepository.get_for_user(db, user_a.id)
    unread_notif = next(n for n in notifs if not n.is_read)
    target_id = unread_notif.id

    # Mark as read
    updated = NotificationRepository.mark_as_read(db, target_id, user_a.id)
    assert updated is not None
    assert updated.is_read is True

    # Re-fetch from DB to verify permanent persistence
    refetched = NotificationRepository.get_by_identifier(db, target_id, user_a.id)
    assert refetched.is_read is True

    # Unread count decreased by 1 (from 3 to 2)
    new_unread = NotificationRepository.count_unread(db, user_a.id)
    assert new_unread == 2


def test_mark_all_as_read(test_db):
    db, user_a, _ = test_db
    NotificationRepository.seed_initial_if_empty(db, user_a.id)
    assert NotificationRepository.count_unread(db, user_a.id) == 3

    marked = NotificationRepository.mark_all_as_read(db, user_a.id)
    assert marked == 3
    assert NotificationRepository.count_unread(db, user_a.id) == 0

    all_notifs = NotificationRepository.get_for_user(db, user_a.id)
    assert all(n.is_read for n in all_notifs)


def test_account_isolation_notifications(test_db):
    db, user_a, user_b = test_db

    # Seed User A and User B
    NotificationRepository.seed_initial_if_empty(db, user_a.id)
    NotificationRepository.seed_initial_if_empty(db, user_b.id)

    user_a_notifs = NotificationRepository.get_for_user(db, user_a.id)
    user_b_notifs = NotificationRepository.get_for_user(db, user_b.id)

    assert len(user_a_notifs) == 4
    assert len(user_b_notifs) == 4

    user_a_first = user_a_notifs[0]

    # User B should NOT be able to access User A's notification
    cross_access = NotificationRepository.get_by_identifier(db, user_a_first.id, user_b.id)
    assert cross_access is None

    # User B should NOT be able to mark User A's notification as read
    cross_mark = NotificationRepository.mark_as_read(db, user_a_first.id, user_b.id)
    assert cross_mark is None

    # User A's notification remains untouched
    original = NotificationRepository.get_by_identifier(db, user_a_first.id, user_a.id)
    assert original.is_read == user_a_first.is_read

    # User B marking all as read should NOT affect User A
    NotificationRepository.mark_all_as_read(db, user_b.id)
    assert NotificationRepository.count_unread(db, user_b.id) == 0
    assert NotificationRepository.count_unread(db, user_a.id) == 3


def test_clear_all_notifications_isolation(test_db):
    db, user_a, user_b = test_db
    NotificationRepository.seed_initial_if_empty(db, user_a.id)
    NotificationRepository.seed_initial_if_empty(db, user_b.id)

    # Clear User A's notifications
    cleared = NotificationRepository.clear_all(db, user_a.id)
    assert cleared == 4

    assert len(NotificationRepository.get_for_user(db, user_a.id)) == 0
    # User B's notifications must be completely intact
    assert len(NotificationRepository.get_for_user(db, user_b.id)) == 4
