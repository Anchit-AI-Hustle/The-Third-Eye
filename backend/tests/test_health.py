import pytest
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.config import get_settings


@pytest.mark.asyncio
async def test_health_check_structure(client: AsyncClient):
    with (
        patch("app.api.health.check_db_connection", new_callable=AsyncMock, return_value=True),
        patch("redis.asyncio.from_url") as mock_redis,
    ):
        mock_instance = AsyncMock()
        mock_instance.ping = AsyncMock()
        mock_instance.aclose = AsyncMock()
        mock_redis.return_value = mock_instance

        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert "environment" in data
    assert "services" in data
    assert "postgres" in data["services"]
    assert "redis" in data["services"]


@pytest.mark.asyncio
async def test_health_degraded_when_db_down(client: AsyncClient):
    with (
        patch("app.api.health.check_db_connection", new_callable=AsyncMock, return_value=False),
        patch("redis.asyncio.from_url") as mock_redis,
    ):
        mock_instance = AsyncMock()
        mock_redis.return_value = mock_instance

        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "degraded"
    assert data["services"]["postgres"] == "error"


@pytest.mark.asyncio
async def test_consolidation_trigger_disabled_by_default(client: AsyncClient):
    # INTERNAL_CRON_SECRET unset in the test environment — the endpoint must
    # not be callable at all, and must not reveal it exists.
    response = await client.post("/internal/run-consolidation")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_consolidation_trigger_rejects_wrong_secret(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "internal_cron_secret", "correct-secret")
    response = await client.post(
        "/internal/run-consolidation", headers={"X-Cron-Secret": "wrong-secret"}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_consolidation_trigger_runs_with_correct_secret(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "internal_cron_secret", "correct-secret")
    with patch(
        "app.api.health.run_consolidation", new_callable=AsyncMock, return_value=[object(), object()]
    ) as mock_run:
        response = await client.post(
            "/internal/run-consolidation", headers={"X-Cron-Secret": "correct-secret"}
        )
    mock_run.assert_awaited_once()
    assert response.status_code == 200
    assert response.json() == {"users_processed": 2}
