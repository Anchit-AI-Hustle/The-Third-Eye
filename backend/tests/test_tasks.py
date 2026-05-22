import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.service import create_access_token


def auth_headers(user: User) -> dict:
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        response = await client.post(
            "/api/v1/tasks",
            json={"title": "Write unit tests", "priority": "high"},
            headers=auth_headers(test_user),
        )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Write unit tests"
    assert data["status"] == "todo"
    assert data["priority"] == "high"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_tasks_empty(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        response = await client.get("/api/v1/tasks", headers=auth_headers(test_user))

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_task_not_found(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        response = await client.get(
            f"/api/v1/tasks/{uuid.uuid4()}",
            headers=auth_headers(test_user),
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_task_status(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        create_resp = await client.post(
            "/api/v1/tasks",
            json={"title": "Complete me"},
            headers=auth_headers(test_user),
        )
        assert create_resp.status_code == 201
        task_id = create_resp.json()["id"]

        update_resp = await client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"status": "done"},
            headers=auth_headers(test_user),
        )

    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["status"] == "done"
    assert data["completed_at"] is not None


@pytest.mark.asyncio
async def test_delete_task(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        create_resp = await client.post(
            "/api/v1/tasks",
            json={"title": "Delete me"},
            headers=auth_headers(test_user),
        )
        task_id = create_resp.json()["id"]

        delete_resp = await client.delete(
            f"/api/v1/tasks/{task_id}",
            headers=auth_headers(test_user),
        )
        assert delete_resp.status_code == 204

        get_resp = await client.get(
            f"/api/v1/tasks/{task_id}",
            headers=auth_headers(test_user),
        )
        assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_tasks_require_auth(client: AsyncClient):
    response = await client.get("/api/v1/tasks")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        response = await client.post(
            "/api/v1/projects",
            json={"name": "JARVIS OS", "color": "#5B8DEF"},
            headers=auth_headers(test_user),
        )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "JARVIS OS"
    assert data["color"] == "#5B8DEF"
