"""
Integration tests for Notification API endpoints.
Tests /api/user/notifications, /api/user/notifications/{id}/read,
/api/user/notifications/mark-all-read, and account isolation across authenticated users.
"""
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.main import app
from backend.auth.jwt import create_access_token
from backend.database.connection import get_db_session
from backend.database.models_complete import User, Notification
from backend.database.crud import NotificationRepository

client = TestClient(app)


@pytest.fixture(scope="module")
def setup_api_users():
    """Create test users and auth headers for integration testing."""
    with get_db_session() as db:
        user1 = db.query(User).filter(User.email == "notif_user1@test.com").first()
        if not user1:
            user1 = User(
                email="notif_user1@test.com",
                hashed_password="pbkdf2_sha256$test_dummy_hash",
                role="candidate",
                full_name="Notification User 1",
                is_active=True,
                is_verified=True,
            )
            db.add(user1)
            db.commit()
            db.refresh(user1)

        user2 = db.query(User).filter(User.email == "notif_user2@test.com").first()
        if not user2:
            user2 = User(
                email="notif_user2@test.com",
                hashed_password="pbkdf2_sha256$test_dummy_hash",
                role="candidate",
                full_name="Notification User 2",
                is_active=True,
                is_verified=True,
            )
            db.add(user2)
            db.commit()
            db.refresh(user2)

        # Clear any prior notifications for clean test run
        NotificationRepository.clear_all(db, user1.id)
        NotificationRepository.clear_all(db, user2.id)

        token1 = create_access_token({"sub": user1.email})
        token2 = create_access_token({"sub": user2.email})

        headers1 = {"Authorization": f"Bearer {token1}"}
        headers2 = {"Authorization": f"Bearer {token2}"}

        return {
            "user1": user1,
            "user2": user2,
            "headers1": headers1,
            "headers2": headers2,
        }


def test_api_get_notifications_auto_seeds(setup_api_users):
    headers1 = setup_api_users["headers1"]

    resp = client.get("/api/user/notifications", headers=headers1)
    assert resp.status_code == 200
    data = resp.json()
    assert "notifications" in data
    assert data["unread_count"] == 3
    assert len(data["notifications"]) == 4


def test_api_mark_notification_read_persistence(setup_api_users):
    headers1 = setup_api_users["headers1"]

    # 1. Fetch initial notifications
    resp = client.get("/api/user/notifications", headers=headers1)
    notifs = resp.json()["notifications"]
    unread_item = next(n for n in notifs if not n["read"])
    notif_id = unread_item["id"]

    # 2. Mark as read
    post_resp = client.post(f"/api/user/notifications/{notif_id}/read", headers=headers1)
    assert post_resp.status_code == 200
    post_data = post_resp.json()
    assert post_data["success"] is True
    assert post_data["read"] is True
    assert post_data["unread_count"] == 2

    # 3. Simulate page refresh / reload: GET /api/user/notifications again
    refresh_resp = client.get("/api/user/notifications", headers=headers1)
    assert refresh_resp.status_code == 200
    refresh_data = refresh_resp.json()
    assert refresh_data["unread_count"] == 2

    refreshed_item = next(n for n in refresh_data["notifications"] if n["id"] == notif_id)
    assert refreshed_item["read"] is True, "Notification must remain read after reload"


def test_api_account_isolation(setup_api_users):
    headers1 = setup_api_users["headers1"]
    headers2 = setup_api_users["headers2"]

    # User 1 has notifications
    resp1 = client.get("/api/user/notifications", headers=headers1)
    notifs1 = resp1.json()["notifications"]
    user1_notif_id = notifs1[0]["id"]

    # User 2 attempts to mark User 1's notification as read
    cross_resp = client.post(f"/api/user/notifications/{user1_notif_id}/read", headers=headers2)
    assert cross_resp.status_code == 404, "User 2 cannot access or mark User 1's notification"

    # User 2 attempts to delete User 1's notification
    cross_del = client.delete(f"/api/user/notifications/{user1_notif_id}", headers=headers2)
    assert cross_del.status_code == 404, "User 2 cannot delete User 1's notification"


def test_api_mark_all_read(setup_api_users):
    headers1 = setup_api_users["headers1"]

    resp = client.post("/api/user/notifications/mark-all-read", headers=headers1)
    assert resp.status_code == 200
    assert resp.json()["unread_count"] == 0

    # Verify on refresh
    refresh_resp = client.get("/api/user/notifications", headers=headers1)
    assert refresh_resp.json()["unread_count"] == 0
    assert all(n["read"] is True for n in refresh_resp.json()["notifications"])
