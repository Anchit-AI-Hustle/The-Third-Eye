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


# ─── complete(): retry, failover, logging ────────────────────────────────────


class _Boom(Exception):
    pass


@pytest.mark.asyncio
async def test_complete_returns_text_and_a_log_entry(monkeypatch):
    router = ModelRouter()

    async def fake_dispatch(model, messages):
        return "hello", 1000, 500, {}

    monkeypatch.setattr(router, "_dispatch", fake_dispatch)
    text, entry = await router.complete(
        task_type=TaskType.SIMPLE_CHAT, messages=[{"role": "user", "content": "hi"}]
    )
    assert text == "hello"
    assert entry.prompt_tokens == 1000
    assert entry.completion_tokens == 500
    assert entry.attempts == 1
    assert entry.citations == [] and entry.search_queries == []


@pytest.mark.asyncio
async def test_complete_prices_the_call_from_the_model_rates(monkeypatch):
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT)

    async def fake_dispatch(m, messages):
        return "x", 1000, 1000, {}

    monkeypatch.setattr(router, "_dispatch", fake_dispatch)
    _, entry = await router.complete(task_type=TaskType.SIMPLE_CHAT, messages=[])
    assert entry.estimated_cost_usd == pytest.approx(
        model.cost_per_1k_input + model.cost_per_1k_output
    )


@pytest.mark.asyncio
async def test_complete_records_the_user_and_task(monkeypatch):
    router = ModelRouter()

    async def fake_dispatch(model, messages):
        return "x", 0, 0, {}

    monkeypatch.setattr(router, "_dispatch", fake_dispatch)
    _, entry = await router.complete(
        task_type=TaskType.SIMPLE_CHAT, messages=[], user_id="u-1"
    )
    assert entry.user_id == "u-1"
    assert str(TaskType.SIMPLE_CHAT) == entry.task_type


@pytest.mark.asyncio
async def test_complete_carries_grounding_metadata_into_the_log(monkeypatch):
    router = ModelRouter()

    async def fake_dispatch(model, messages):
        return "x", 0, 0, {
            "citations": [{"title": "T", "url": "u", "domain": "d"}],
            "search_queries": ["q"],
        }

    monkeypatch.setattr(router, "_dispatch", fake_dispatch)
    _, entry = await router.complete(task_type=TaskType.SIMPLE_CHAT, messages=[])
    assert entry.search_queries == ["q"]
    assert entry.citations[0]["url"] == "u"


@pytest.mark.asyncio
async def test_complete_retries_the_primary_before_succeeding(monkeypatch):
    router = ModelRouter()
    calls = {"n": 0}

    async def flaky(model, messages):
        calls["n"] += 1
        if calls["n"] < 3:
            raise _Boom("transient")
        return "recovered", 0, 0, {}

    monkeypatch.setattr(router, "_dispatch", flaky)
    monkeypatch.setattr("app.router.model_router.wait_exponential", lambda **kw: None)

    text, entry = await router.complete(task_type=TaskType.SIMPLE_CHAT, messages=[])
    assert text == "recovered"
    assert entry.attempts == 3


@pytest.mark.asyncio
async def test_complete_fails_over_to_the_fallback_model(monkeypatch):
    router = ModelRouter()
    primary = router.select_model(TaskType.SIMPLE_CHAT)
    seen: list[str] = []

    async def only_fallback_works(model, messages):
        seen.append(model.model_id)
        if model.model_id == primary.model_id:
            raise _Boom("primary down")
        return "from fallback", 0, 0, {}

    monkeypatch.setattr(router, "_dispatch", only_fallback_works)
    text, entry = await router.complete(task_type=TaskType.SIMPLE_CHAT, messages=[])

    assert text == "from fallback"
    assert entry.model_used == router._get_fallback(TaskType.SIMPLE_CHAT).model_id
    assert seen.count(primary.model_id) == 3  # exhausted its retries first


@pytest.mark.asyncio
async def test_complete_raises_when_both_models_are_down(monkeypatch):
    router = ModelRouter()

    async def always_fails(model, messages):
        raise _Boom("everything is down")

    monkeypatch.setattr(router, "_dispatch", always_fails)
    with pytest.raises(_Boom):
        await router.complete(task_type=TaskType.SIMPLE_CHAT, messages=[])


# ─── _dispatch provider routing ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dispatch_routes_each_provider_to_its_adapter(monkeypatch):
    router = ModelRouter()
    routed: list[str] = []

    for provider, method in [
        (Provider.GOOGLE, "_call_google"),
        (Provider.GOOGLE_GROUNDED, "_call_google_grounded"),
        (Provider.OPENAI, "_call_openai"),
        (Provider.ANTHROPIC, "_call_anthropic"),
        (Provider.OLLAMA, "_call_ollama"),
    ]:
        async def marker(model, messages, _m=method):
            routed.append(_m)
            return "", 0, 0, {}

        monkeypatch.setattr(router, method, marker)

    for provider in [
        Provider.GOOGLE, Provider.GOOGLE_GROUNDED, Provider.OPENAI,
        Provider.ANTHROPIC, Provider.OLLAMA,
    ]:
        model = next(m for m in MODELS.values() if m.provider == provider)
        await router._dispatch(model, [])

    assert routed == [
        "_call_google", "_call_google_grounded", "_call_openai",
        "_call_anthropic", "_call_ollama",
    ]


@pytest.mark.asyncio
async def test_dispatch_rejects_an_unknown_provider():
    router = ModelRouter()
    model = SimpleNamespace(provider="carrier-pigeon", model_id="x")
    with pytest.raises(NotImplementedError, match="carrier-pigeon"):
        await router._dispatch(model, [])


# ─── Provider adapters (SDKs stubbed) ────────────────────────────────────────


def _usage(prompt=11, completion=22):
    return SimpleNamespace(prompt_token_count=prompt, candidates_token_count=completion)


@pytest.mark.asyncio
async def test_call_google_converts_roles_and_reads_usage(monkeypatch):
    import google.generativeai as genai

    captured = {}

    class FakeModel:
        def __init__(self, model_id):
            captured["model_id"] = model_id

        def generate_content(self, messages, generation_config=None):
            captured["messages"] = messages
            return SimpleNamespace(text="answer", usage_metadata=_usage())

    monkeypatch.setattr(genai, "configure", lambda **kw: captured.update(configured=True))
    monkeypatch.setattr(genai, "GenerativeModel", FakeModel)

    router = ModelRouter()
    model = MODELS["gemini-2.5-flash"]
    text, prompt_tokens, completion_tokens, extra = await router._call_google(
        model,
        [
            {"role": "system", "content": "be terse"},
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
    )

    assert (text, prompt_tokens, completion_tokens, extra) == ("answer", 11, 22, {})
    assert captured["configured"] is True
    assert captured["model_id"] == "gemini-2.5-flash"
    # System prompts are pulled out; assistant becomes "model".
    assert [m["role"] for m in captured["messages"]] == ["user", "model"]


@pytest.mark.asyncio
async def test_call_google_defaults_missing_usage_counts_to_zero(monkeypatch):
    import google.generativeai as genai

    class FakeModel:
        def __init__(self, model_id):
            pass

        def generate_content(self, messages, generation_config=None):
            return SimpleNamespace(text="answer", usage_metadata=SimpleNamespace())

    monkeypatch.setattr(genai, "configure", lambda **kw: None)
    monkeypatch.setattr(genai, "GenerativeModel", FakeModel)

    _, prompt_tokens, completion_tokens, _ = await ModelRouter()._call_google(
        MODELS["gemini-2.5-flash"], [{"role": "user", "content": "hi"}]
    )
    assert (prompt_tokens, completion_tokens) == (0, 0)


def _grounded_response(text="grounded", chunks=None, queries=None, raises=False):
    class Resp:
        usage_metadata = _usage()
        candidates = [
            SimpleNamespace(
                grounding_metadata=SimpleNamespace(
                    web_search_queries=queries or [],
                    grounding_chunks=chunks or [],
                )
            )
        ]

        @property
        def text(self):
            if raises:
                raise RuntimeError("no text part")
            return text

    return Resp()


def _stub_grounded_client(monkeypatch, response):
    from google import genai as google_genai

    async def generate_content(**kwargs):
        return response

    class FakeClient:
        def __init__(self, api_key=None):
            self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))

    monkeypatch.setattr(google_genai, "Client", FakeClient)


@pytest.mark.asyncio
async def test_call_google_grounded_collects_citations_and_queries(monkeypatch):
    chunks = [
        SimpleNamespace(web=SimpleNamespace(uri="https://a.test/1", title="A", domain="a.test")),
        SimpleNamespace(web=SimpleNamespace(uri="https://b.test/2", title=None, domain="b.test")),
    ]
    _stub_grounded_client(monkeypatch, _grounded_response(chunks=chunks, queries=["weather"]))

    text, _, _, extra = await ModelRouter()._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY],
        [{"role": "system", "content": "cite"}, {"role": "user", "content": "weather?"}],
    )

    assert text == "grounded"
    assert extra["search_queries"] == ["weather"]
    assert [c["url"] for c in extra["citations"]] == ["https://a.test/1", "https://b.test/2"]
    # Falls back to the domain when the source has no title.
    assert extra["citations"][1]["title"] == "b.test"


@pytest.mark.asyncio
async def test_call_google_grounded_deduplicates_sources(monkeypatch):
    same = SimpleNamespace(web=SimpleNamespace(uri="https://a.test/1", title="A", domain="a.test"))
    _stub_grounded_client(monkeypatch, _grounded_response(chunks=[same, same]))

    _, _, _, extra = await ModelRouter()._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "q"}]
    )
    assert len(extra["citations"]) == 1


@pytest.mark.asyncio
async def test_call_google_grounded_skips_chunks_without_a_usable_source(monkeypatch):
    chunks = [
        SimpleNamespace(web=None),
        SimpleNamespace(web=SimpleNamespace(uri=None, title="x", domain="d")),
    ]
    _stub_grounded_client(monkeypatch, _grounded_response(chunks=chunks))

    _, _, _, extra = await ModelRouter()._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "q"}]
    )
    assert extra["citations"] == []


@pytest.mark.asyncio
async def test_call_google_grounded_returns_empty_text_when_no_text_part(monkeypatch):
    # A blocked or search-only turn makes .text raise; an empty answer beats a 500.
    _stub_grounded_client(monkeypatch, _grounded_response(raises=True))

    text, _, _, _ = await ModelRouter()._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "q"}]
    )
    assert text == ""


@pytest.mark.asyncio
async def test_call_google_grounded_handles_a_response_without_candidates(monkeypatch):
    class Resp:
        text = "plain"
        usage_metadata = _usage()
        candidates = []

    _stub_grounded_client(monkeypatch, Resp())
    _, _, _, extra = await ModelRouter()._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "q"}]
    )
    assert extra == {"citations": [], "search_queries": []}


@pytest.mark.asyncio
async def test_call_google_grounded_handles_missing_grounding_metadata(monkeypatch):
    class Resp:
        text = "plain"
        usage_metadata = _usage()
        candidates = [SimpleNamespace(grounding_metadata=None)]

    _stub_grounded_client(monkeypatch, Resp())
    _, _, _, extra = await ModelRouter()._call_google_grounded(
        MODELS[GROUNDED_MODEL_KEY], [{"role": "user", "content": "q"}]
    )
    assert extra["citations"] == []


@pytest.mark.asyncio
async def test_call_openai_returns_text_and_usage(monkeypatch):
    import openai

    async def create(**kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="oai"))],
            usage=SimpleNamespace(prompt_tokens=7, completion_tokens=9),
        )

    class FakeClient:
        def __init__(self, api_key=None):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    monkeypatch.setattr(openai, "AsyncOpenAI", FakeClient)

    text, prompt_tokens, completion_tokens, extra = await ModelRouter()._call_openai(
        MODELS["gpt-4o-mini"], [{"role": "user", "content": "hi"}]
    )
    assert (text, prompt_tokens, completion_tokens, extra) == ("oai", 7, 9, {})


@pytest.mark.asyncio
async def test_call_openai_tolerates_a_null_message_and_absent_usage(monkeypatch):
    import openai

    async def create(**kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=None))], usage=None
        )

    class FakeClient:
        def __init__(self, api_key=None):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    monkeypatch.setattr(openai, "AsyncOpenAI", FakeClient)

    text, prompt_tokens, completion_tokens, _ = await ModelRouter()._call_openai(
        MODELS["gpt-4o-mini"], []
    )
    assert (text, prompt_tokens, completion_tokens) == ("", 0, 0)


@pytest.mark.asyncio
async def test_call_anthropic_splits_the_system_prompt_out(monkeypatch):
    import anthropic

    captured = {}

    async def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(text="claude")],
            usage=SimpleNamespace(input_tokens=3, output_tokens=4),
        )

    class FakeClient:
        def __init__(self, api_key=None):
            self.messages = SimpleNamespace(create=create)

    monkeypatch.setattr(anthropic, "AsyncAnthropic", FakeClient)

    text, prompt_tokens, completion_tokens, _ = await ModelRouter()._call_anthropic(
        MODELS["claude-haiku-4-5-20251001"],
        [{"role": "system", "content": "be brief"}, {"role": "user", "content": "hi"}],
    )

    assert (text, prompt_tokens, completion_tokens) == ("claude", 3, 4)
    assert captured["system"] == "be brief"
    assert [m["role"] for m in captured["messages"]] == ["user"]


@pytest.mark.asyncio
async def test_call_anthropic_defaults_the_system_prompt_to_empty(monkeypatch):
    import anthropic

    captured = {}

    async def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(content=[], usage=SimpleNamespace(input_tokens=0, output_tokens=0))

    class FakeClient:
        def __init__(self, api_key=None):
            self.messages = SimpleNamespace(create=create)

    monkeypatch.setattr(anthropic, "AsyncAnthropic", FakeClient)

    text, _, _, _ = await ModelRouter()._call_anthropic(
        MODELS["claude-haiku-4-5-20251001"], [{"role": "user", "content": "hi"}]
    )
    assert text == ""
    assert captured["system"] == ""


@pytest.mark.asyncio
async def test_call_ollama_posts_to_the_configured_host(monkeypatch):
    import httpx

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            captured["raised"] = True

        def json(self):
            return {
                "message": {"content": "local"},
                "prompt_eval_count": 5,
                "eval_count": 6,
            }

    class FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None):
            captured["url"] = url
            captured["payload"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    text, prompt_tokens, completion_tokens, extra = await ModelRouter()._call_ollama(
        MODELS["llama3"], [{"role": "user", "content": "hi"}]
    )

    assert (text, prompt_tokens, completion_tokens, extra) == ("local", 5, 6, {})
    assert captured["url"].endswith("/api/chat")
    assert captured["payload"]["stream"] is False


@pytest.mark.asyncio
async def test_call_ollama_defaults_a_sparse_response(monkeypatch):
    import httpx

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None):
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    text, prompt_tokens, completion_tokens, _ = await ModelRouter()._call_ollama(
        MODELS["llama3"], []
    )
    assert (text, prompt_tokens, completion_tokens) == ("", 0, 0)


@pytest.mark.asyncio
async def test_embed_returns_one_vector_per_input(monkeypatch):
    import openai

    captured = {}

    async def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.1, 0.2]), SimpleNamespace(embedding=[0.3, 0.4])]
        )

    class FakeClient:
        def __init__(self, api_key=None):
            self.embeddings = SimpleNamespace(create=create)

    monkeypatch.setattr(openai, "AsyncOpenAI", FakeClient)

    vectors = await ModelRouter().embed(["a", "b"])
    assert vectors == [[0.1, 0.2], [0.3, 0.4]]
    assert captured["model"] == "text-embedding-3-small"
