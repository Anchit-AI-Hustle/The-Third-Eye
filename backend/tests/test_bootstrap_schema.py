from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.bootstrap_schema import main


class _FakeConn:
    def __init__(self):
        self.executed: list = []

    async def execute(self, stmt):
        self.executed.append(stmt)

    async def commit(self):
        pass


class _FakeEngine:
    def __init__(self):
        self.conn = _FakeConn()
        self.disposed = False

    def connect(self):
        return self

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *exc):
        return False

    async def dispose(self):
        self.disposed = True


@pytest.mark.asyncio
async def test_bootstrap_schema_noop_for_public_schema(monkeypatch):
    monkeypatch.setattr(
        "app.bootstrap_schema.get_settings",
        lambda: SimpleNamespace(db_schema="public"),
    )
    with patch("app.bootstrap_schema.create_async_engine") as mock_create:
        await main()
    mock_create.assert_not_called()


@pytest.mark.asyncio
async def test_bootstrap_schema_creates_dedicated_schema(monkeypatch):
    fake_settings = SimpleNamespace(
        db_schema="backend_app", database_url="postgresql+asyncpg://u:p@h/db"
    )
    monkeypatch.setattr("app.bootstrap_schema.get_settings", lambda: fake_settings)
    fake_engine = _FakeEngine()

    with patch(
        "app.bootstrap_schema.create_async_engine", return_value=fake_engine
    ) as mock_create:
        await main()

    mock_create.assert_called_once_with(fake_settings.database_url)
    assert fake_engine.disposed is True
    assert len(fake_engine.conn.executed) == 1
