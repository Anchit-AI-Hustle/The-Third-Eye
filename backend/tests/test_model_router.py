from types import SimpleNamespace
from typing import ClassVar

import pytest

from app.router.model_router import (
    GROUNDED_MODEL_KEY,
    MODELS,
    ROUTING_TABLE,
    ModelRouter,
    Provider,
    RouterLogEntry,
    TaskType,
)

# Model ids Google has shut down. Routing to any of these fails at call time,
# so the registry must never reference them again.
RETIRED_MODEL_IDS = {
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "text-embedding-004",
    "embedding-001",
}


def test_model_selection_simple_chat():
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT)
    assert model.provider == Provider.GOOGLE
    assert "flash" in model.model_id.lower()


def test_model_selection_financial_analysis():
    router = ModelRouter()
    model = router.select_model(TaskType.FINANCIAL_ANALYSIS)
    # Financial analysis must never use Gemini Flash
    assert "flash" not in model.model_id.lower()
    assert model.provider in (Provider.GOOGLE, Provider.OPENAI)


def test_model_selection_privacy_mode():
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT, privacy_mode=True)
    assert model.provider == Provider.OLLAMA
    assert model.model_id == "llama3"


def test_model_selection_local_offline():
    router = ModelRouter()
    model = router.select_model(TaskType.LOCAL_OFFLINE)
    assert model.provider == Provider.OLLAMA


def test_model_selection_code_generation():
    router = ModelRouter()
    model = router.select_model(TaskType.CODE_GENERATION)
    assert model.provider == Provider.OPENAI
    assert "mini" in model.model_id.lower()


def test_all_task_types_have_route():
    router = ModelRouter()
    for task_type in TaskType:
        model = router.select_model(task_type)
        assert model is not None
        assert model.model_id


def test_model_has_cost_info():
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT)
    assert model.cost_per_1k_input >= 0
    assert model.cost_per_1k_output >= 0


def test_fallback_selection():
    router = ModelRouter()
    fallback = router._get_fallback(TaskType.SIMPLE_CHAT)
    assert fallback.provider == Provider.OPENAI
    assert fallback.model_id == "gpt-4o-mini"


def test_no_retired_google_models_in_registry():
    for key, cfg in MODELS.items():
        assert cfg.model_id not in RETIRED_MODEL_IDS, f"{key} points at retired {cfg.model_id}"


def test_no_retired_google_models_in_routing_table():
    for task_type, (primary, fallback) in ROUTING_TABLE.items():
        for key in (primary, fallback):
            assert MODELS[key].model_id not in RETIRED_MODEL_IDS, f"{task_type} → retired {key}"


# ─── Grounded search route ──────────────────────────────────────────────────


def test_grounded_search_routes_to_grounded_provider():
    router = ModelRouter()
    model = router.select_model(TaskType.GROUNDED_SEARCH)
    assert model.provider == Provider.GOOGLE_GROUNDED


def test_grounded_search_falls_back_to_ungrounded_google():
    router = ModelRouter()
    fallback = router._get_fallback(TaskType.GROUNDED_SEARCH)
    # Fallback must still be able to answer, just without live search.
    assert fallback.provider == Provider.GOOGLE


def test_grounded_search_respects_privacy_mode():
    router = ModelRouter()
    model = router.select_model(TaskType.GROUNDED_SEARCH, privacy_mode=True)
    assert model.provider == Provider.OLLAMA


def test_log_entry_has_no_citations_by_default():
    entry = RouterLogEntry(
        task_type="simple_chat", model_used="m", provider="google",
        prompt_tokens=1, completion_tokens=1, latency_ms=1,
        estimated_cost_usd=0.0, attempts=1,
    )
    assert entry.citations == []
    assert entry.search_queries == []


def _fake_grounded_response(chunks, queries=("q1",), text="answer"):
    meta = SimpleNamespace(grounding_chunks=chunks, web_search_queries=list(queries))
    return SimpleNamespace(
        text=text,
        candidates=[SimpleNamespace(grounding_metadata=meta)],
        usage_metadata=SimpleNamespace(prompt_token_count=11, candidates_token_count=7),
    )


def _web(uri, title=None, domain=None):
    return SimpleNamespace(web=SimpleNamespace(uri=uri, title=title, domain=domain))


@pytest.fixture
def patch_genai(monkeypatch):
    """Patch google.genai.Client so the grounded path runs without network."""
    captured = {}

    def _install(response):
        async def _generate_content(*, model, contents, config):
            captured["model"] = model
            captured["contents"] = contents
            captured["config"] = config
            return response

        class FakeClient:
            def __init__(self, *a, **kw):
                captured["api_key"] = kw.get("api_key")
                self.aio = SimpleNamespace(
                    models=SimpleNamespace(generate_content=_generate_content)
                )

        import google.genai
        monkeypatch.setattr(google.genai, "Client", FakeClient)
        return captured

    return _install


async def test_grounded_call_extracts_citations_and_queries(patch_genai):
    captured = patch_genai(_fake_grounded_response(
        [_web("https://a.example/1", "A", "a.example")],
        queries=["who won"],
    ))
    router = ModelRouter()
    text, prompt_tokens, completion_tokens, extra = await router._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY],
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}],
    )

    assert text == "answer"
    assert (prompt_tokens, completion_tokens) == (11, 7)
    assert extra["citations"] == [
        {"title": "A", "url": "https://a.example/1", "domain": "a.example"}
    ]
    assert extra["search_queries"] == ["who won"]
    # The google_search tool must actually be attached, or nothing is grounded.
    assert captured["config"].tools
    # System prompts belong in system_instruction, not the turn list.
    assert captured["config"].system_instruction == "sys"
    assert [c.role for c in captured["contents"]] == ["user"]


async def test_grounded_call_dedupes_and_skips_chunks_without_uri(patch_genai):
    patch_genai(_fake_grounded_response([
        _web("https://a.example/1", "A"),
        _web("https://a.example/1", "A duplicate"),
        _web(None, "no uri"),
        SimpleNamespace(web=None),
    ]))
    router = ModelRouter()
    _, _, _, extra = await router._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "hi"}]
    )
    assert [c["url"] for c in extra["citations"]] == ["https://a.example/1"]


async def test_grounded_call_handles_missing_grounding_metadata(patch_genai):
    """An ungrounded answer must not crash the route."""
    patch_genai(SimpleNamespace(
        text="ungrounded",
        candidates=[SimpleNamespace(grounding_metadata=None)],
        usage_metadata=SimpleNamespace(prompt_token_count=1, candidates_token_count=2),
    ))
    router = ModelRouter()
    text, _, _, extra = await router._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "hi"}]
    )
    assert text == "ungrounded"
    assert extra["citations"] == []


async def test_grounded_call_survives_blocked_text(patch_genai):
    """response.text raises when there is no text part; return empty, not 500."""
    class Blocked:
        candidates: ClassVar[list] = []
        usage_metadata = SimpleNamespace(prompt_token_count=3, candidates_token_count=0)

        @property
        def text(self):
            raise ValueError("no text part")

    patch_genai(Blocked())
    router = ModelRouter()
    text, _, _, extra = await router._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "hi"}]
    )
    assert text == ""
    assert extra["citations"] == []
