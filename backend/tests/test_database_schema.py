from app.database import build_engine_kwargs


def test_build_engine_kwargs_public_schema_no_connect_args():
    kwargs = build_engine_kwargs("postgresql+asyncpg://u:p@h/db", "production", "public")
    assert "connect_args" not in kwargs
    assert kwargs["pool_size"] == 10


def test_build_engine_kwargs_custom_schema_sets_search_path():
    kwargs = build_engine_kwargs("postgresql+asyncpg://u:p@h/db", "production", "backend_app")
    assert kwargs["connect_args"] == {"server_settings": {"search_path": "backend_app"}}


def test_build_engine_kwargs_sqlite_ignores_schema():
    # SQLite has no schema/search_path concept and rejects pool-sizing kwargs.
    kwargs = build_engine_kwargs("sqlite+aiosqlite:///:memory:", "test", "backend_app")
    assert "connect_args" not in kwargs
    assert "pool_size" not in kwargs
