import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.agents.base import AgentResult
from app.auth.models import User
from app.auth.service import create_access_token


def auth_headers(user: User) -> dict:
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_chat_requires_auth(client: AsyncClient):
    response = await client.post("/api/v1/chat", json={"message": "hello"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_chat_returns_response(client: AsyncClient, test_user: User):
    mock_result = AgentResult(
        task_id=uuid.uuid4(),
        agent_name="executive",
        content="Hello! I'm JARVIS.",
        success=True,
        metadata={"model_used": "gemini-1.5-flash", "latency_ms": 250, "estimated_cost_usd": 0.001},
    )

    with (
        patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user),
        patch("app.api.chat.retrieve_relevant_memories", new_callable=AsyncMock, return_value=[]),
        patch("app.api.chat.store_episodic", new_callable=AsyncMock),
        patch("app.agents.executive.ExecutiveAgent.run", new_callable=AsyncMock, return_value=mock_result),
    ):
        response = await client.post(
            "/api/v1/chat",
            json={"message": "Hello JARVIS"},
            headers=auth_headers(test_user),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Hello! I'm JARVIS."
    assert data["model_used"] == "gemini-1.5-flash"
    assert "session_id" in data
    assert data["memories_used"] == 0


@pytest.mark.asyncio
async def test_chat_with_session_id(client: AsyncClient, test_user: User):
    session_id = str(uuid.uuid4())
    mock_result = AgentResult(
        task_id=uuid.uuid4(),
        agent_name="executive",
        content="Continuing our session.",
        success=True,
        metadata={"model_used": "gemini-1.5-flash", "latency_ms": 100, "estimated_cost_usd": 0.0},
    )

    with (
        patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user),
        patch("app.api.chat.retrieve_relevant_memories", new_callable=AsyncMock, return_value=[]),
        patch("app.api.chat.store_episodic", new_callable=AsyncMock),
        patch("app.agents.executive.ExecutiveAgent.run", new_callable=AsyncMock, return_value=mock_result),
    ):
        response = await client.post(
            "/api/v1/chat",
            json={"message": "Continue", "session_id": session_id},
            headers=auth_headers(test_user),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_id


@pytest.mark.asyncio
async def test_chat_agent_failure_returns_503(client: AsyncClient, test_user: User):
    mock_result = AgentResult(
        task_id=uuid.uuid4(),
        agent_name="executive",
        content="",
        success=False,
        error="AI provider unavailable",
    )

    with (
        patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user),
        patch("app.api.chat.retrieve_relevant_memories", new_callable=AsyncMock, return_value=[]),
        patch("app.agents.executive.ExecutiveAgent.run", new_callable=AsyncMock, return_value=mock_result),
    ):
        response = await client.post(
            "/api/v1/chat",
            json={"message": "This will fail"},
            headers=auth_headers(test_user),
        )

    assert response.status_code == 503


@pytest.mark.asyncio
async def test_chat_message_too_long(client: AsyncClient, test_user: User):
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        response = await client.post(
            "/api/v1/chat",
            json={"message": "x" * 33_000},
            headers=auth_headers(test_user),
        )
    assert response.status_code == 422
