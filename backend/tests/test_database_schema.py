import ssl

from app.database import build_engine_kwargs


def test_build_engine_kwargs_remote_public_schema_sets_ssl():
    kwargs = build_engine_kwargs("postgresql+asyncpg://u:p@h/db", "production", "public")
    assert kwargs["pool_size"] == 10
    assert isinstance(kwargs["connect_args"]["ssl"], ssl.SSLContext)
    assert kwargs["connect_args"]["ssl"].verify_mode == ssl.CERT_NONE
    assert "statement_cache_size" not in kwargs["connect_args"]
    assert "server_settings" not in kwargs["connect_args"]


def test_build_engine_kwargs_custom_schema_sets_search_path():
    kwargs = build_engine_kwargs("postgresql+asyncpg://u:p@h/db", "production", "backend_app")
    assert kwargs["connect_args"]["server_settings"] == {"search_path": "backend_app"}
    assert isinstance(kwargs["connect_args"]["ssl"], ssl.SSLContext)


def test_build_engine_kwargs_pooler_disables_prepared_statements():
    kwargs = build_engine_kwargs(
        "postgresql+asyncpg://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/db",
        "production",
        "public",
    )
    assert kwargs["connect_args"]["statement_cache_size"] == 0
    assert isinstance(kwargs["connect_args"]["ssl"], ssl.SSLContext)


def test_build_engine_kwargs_localhost_skips_ssl():
    kwargs = build_engine_kwargs(
        "postgresql+asyncpg://u:p@localhost:5432/db", "production", "backend_app"
    )
    assert "ssl" not in kwargs["connect_args"]
    assert kwargs["connect_args"]["server_settings"] == {"search_path": "backend_app"}


def test_build_engine_kwargs_sqlite_ignores_schema():
    # SQLite has no schema/search_path concept and rejects pool-sizing kwargs.
    kwargs = build_engine_kwargs("sqlite+aiosqlite:///:memory:", "test", "backend_app")
    assert "connect_args" not in kwargs
    assert "pool_size" not in kwargs
