import pytest
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient


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
