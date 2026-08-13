"""Agent behaviour: delegation limits, task extraction, RAG answers, web research."""

import uuid
from contextlib import asynccontextmanager

import pytest

from app.agents import knowledge as knowledge_mod
from app.agents import productivity as productivity_mod
from app.agents import research as research_mod
from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.agents.executive import ExecutiveAgent
from app.agents.knowledge import knowledge_agent
from app.agents.productivity import productivity_agent
from app.agents.research import ResearchAgent, SearchHit, research_agent
from app.router.model_router import RouterLogEntry, TaskType
from app.tasks.models import Task


def _context(**over):
    return AgentContext(
        user_id=over.pop("user_id", uuid.uuid4()),
        session_id="s-1",
        **over,
    )


def _task(content="hello", **over):
    return AgentTask(content=content, task_type=over.pop("task_type", "chat"), **over)


def _log_entry():
    return RouterLogEntry(
        task_type="simple_chat", model_used="test-model", provider="test",
        prompt_tokens=1, completion_tokens=1, latency_ms=5,
        estimated_cost_usd=0.0, attempts=1,
    )


def _stub_completion(monkeypatch, module, text="synthesized"):
    async def fake_complete(**kwargs):
        return text, _log_entry()

    monkeypatch.setattr(module.model_router, "complete", fake_complete)


def _use_test_session(monkeypatch, module, db):
    """Point a module's AsyncSessionLocal at the test session without closing it."""

    @asynccontextmanager
    async def session():
        yield db

    monkeypatch.setattr(module, "AsyncSessionLocal", session)


# ─── BaseAgent.delegate ──────────────────────────────────────────────────────


class _Recorder(BaseAgent):
    name = "recorder"
    description = "records"
    capabilities = []
    required_permission_level = 1

    def __init__(self):
        self.seen: list[AgentTask] = []

    async def can_handle(self, task):
        return True

    async def run(self, task, context):
        self.seen.append(task)
        return AgentResult(task_id=task.id, agent_name=self.name, content="ok", success=True)


@pytest.mark.asyncio
async def test_delegate_increments_depth_and_links_the_parent():
    parent = _Recorder()
    target = _Recorder()
    task = _task()

    result = await parent.delegate(task, target, _context())

    assert result.delegated_to == "recorder"
    delegated = target.seen[0]
    assert delegated.delegation_depth == 1
    assert delegated.parent_task_id == task.id
    assert delegated.content == task.content


@pytest.mark.asyncio
async def test_delegate_refuses_once_the_depth_limit_is_reached():
    parent = _Recorder()
    target = _Recorder()
    task = _task(delegation_depth=BaseAgent.MAX_DELEGATION_DEPTH)

    result = await parent.delegate(task, target, _context())

    assert result.success is False
    assert "circular delegation" in result.error
    assert target.seen == []  # never invoked


# ─── ProductivityAgent ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_productivity_handles_task_and_chat_types():
    assert await productivity_agent.can_handle(_task(task_type="task_management"))
    assert await productivity_agent.can_handle(_task(task_type="chat"))
    assert not await productivity_agent.can_handle(_task(task_type="research"))


@pytest.mark.parametrize(
    "content,expected",
    [
        ("create a task to buy milk", "buy milk"),
        ("Add todo: file the taxes", "file the taxes"),
        ("remind me to call mum.", "call mum"),
        ("make a new reminder for standup", "standup"),
        ("add todo:buy milk", "buy milk"),
        ("Create task: ship the release", "ship the release"),
    ],
)
def test_productivity_extracts_a_task_title(content, expected):
    assert productivity_agent._extract_task_title(content) == expected


@pytest.mark.parametrize("content", ["what should I do today?", "how many tasks do I have"])
def test_productivity_finds_no_title_in_a_question(content):
    assert productivity_agent._extract_task_title(content) is None


def test_productivity_rejects_an_absurdly_long_title():
    assert productivity_agent._extract_task_title("create a task to " + "x" * 600) is None


@pytest.mark.asyncio
async def test_productivity_creates_the_task_it_detected(db, test_user, monkeypatch):
    _use_test_session(monkeypatch, productivity_mod, db)

    result = await productivity_agent.run(
        _task("create a task to water the plants", user_id=test_user.id), _context()
    )

    assert result.success
    assert result.metadata["action"] == "task_created"
    assert "water the plants" in result.content

    from sqlalchemy import select

    saved = (await db.execute(select(Task))).scalars().all()
    assert [t.title for t in saved] == ["water the plants"]
    assert saved[0].status == "todo"


@pytest.mark.asyncio
async def test_productivity_reports_an_empty_task_list(db, test_user, monkeypatch):
    _use_test_session(monkeypatch, productivity_mod, db)

    result = await productivity_agent.run(
        _task("what should I focus on?", user_id=test_user.id), _context()
    )
    assert result.metadata["open_count"] == 0
    assert "no open tasks" in result.content.lower()


@pytest.mark.asyncio
async def test_productivity_summarizes_open_tasks_through_the_model(db, test_user, monkeypatch):
    _use_test_session(monkeypatch, productivity_mod, db)
    _stub_completion(monkeypatch, productivity_mod, "Focus on the urgent one.")

    for i in range(3):
        db.add(Task(user_id=test_user.id, title=f"Task {i}", status="todo", priority="high"))
    await db.flush()

    result = await productivity_agent.run(
        _task("what should I focus on?", user_id=test_user.id), _context()
    )

    assert result.content == "Focus on the urgent one."
    assert result.metadata["open_count"] == 3
    assert result.metadata["model_used"] == "test-model"


@pytest.mark.asyncio
async def test_productivity_ignores_completed_tasks(db, test_user, monkeypatch):
    _use_test_session(monkeypatch, productivity_mod, db)

    db.add(Task(user_id=test_user.id, title="Done", status="done", priority="low"))
    await db.flush()

    result = await productivity_agent.run(
        _task("anything open?", user_id=test_user.id), _context()
    )
    assert result.metadata["open_count"] == 0


# ─── KnowledgeAgent ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_knowledge_handles_document_and_chat_types():
    assert await knowledge_agent.can_handle(_task(task_type="document_qa"))
    assert await knowledge_agent.can_handle(_task(task_type="chat"))
    assert not await knowledge_agent.can_handle(_task(task_type="task_management"))


@pytest.mark.asyncio
async def test_knowledge_says_so_when_nothing_matches(db, monkeypatch):
    _use_test_session(monkeypatch, knowledge_mod, db)

    async def no_chunks(*args, **kwargs):
        return []

    monkeypatch.setattr(knowledge_mod, "retrieve_chunks", no_chunks)

    result = await knowledge_agent.run(_task("what is in my docs?"), _context())
    assert result.success
    assert result.metadata["chunks_retrieved"] == 0
    assert "don't have any documents" in result.content


@pytest.mark.asyncio
async def test_knowledge_answers_with_sources(db, monkeypatch):
    _use_test_session(monkeypatch, knowledge_mod, db)
    _stub_completion(monkeypatch, knowledge_mod, "The answer is 42 [1].")

    doc_id = uuid.uuid4()

    async def one_chunk(*args, **kwargs):
        return [{
            "document_id": doc_id,
            "document_title": "Handbook",
            "chunk_index": 3,
            "content": "the answer is 42",
            "score": 0.91,
        }]

    monkeypatch.setattr(knowledge_mod, "retrieve_chunks", one_chunk)

    result = await knowledge_agent.run(_task("what is the answer?"), _context())

    assert result.content == "The answer is 42 [1]."
    assert result.metadata["chunks_retrieved"] == 1
    source = result.metadata["sources"][0]
    assert source["document_title"] == "Handbook"
    assert source["document_id"] == str(doc_id)


# ─── ResearchAgent ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_research_handles_its_task_types():
    assert await research_agent.can_handle(_task(task_type="research"))
    assert await research_agent.can_handle(_task(task_type="web_search"))
    assert not await research_agent.can_handle(_task(task_type="document_qa"))


@pytest.mark.asyncio
async def test_research_explains_when_no_api_key_and_no_grounding(monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.setattr(research_mod.settings, "enable_google_grounding", False)

    result = await research_agent.run(_task("who won?"), _context())
    assert result.success
    assert result.metadata["reason"] == "no_api_key"
    assert "SERPER_API_KEY" in result.content


@pytest.mark.asyncio
async def test_research_falls_back_to_grounded_search_without_a_key(monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.setattr(research_mod.settings, "enable_google_grounding", True)

    called = {}

    async def fake_grounded(self, task, context):
        called["yes"] = True
        return AgentResult(task_id=task.id, agent_name="research", content="grounded", success=True)

    monkeypatch.setattr(ResearchAgent, "_run_grounded", fake_grounded)

    result = await research_agent.run(_task("who won?"), _context())
    assert called == {"yes": True}
    assert result.content == "grounded"


@pytest.mark.asyncio
async def test_research_reports_a_failed_search(monkeypatch):
    monkeypatch.setenv("SERPER_API_KEY", "k")

    async def boom(self, *, query, api_key):
        raise RuntimeError("serper is down")

    monkeypatch.setattr(ResearchAgent, "_search", boom)

    result = await research_agent.run(_task("who won?"), _context())
    assert result.success is False
    assert "serper is down" in result.error


@pytest.mark.asyncio
async def test_research_reports_an_empty_result_set(monkeypatch):
    monkeypatch.setenv("SERPER_API_KEY", "k")

    async def none(self, *, query, api_key):
        return []

    monkeypatch.setattr(ResearchAgent, "_search", none)

    result = await research_agent.run(_task("who won?"), _context())
    assert result.success
    assert result.metadata["result_count"] == 0


@pytest.mark.asyncio
async def test_research_synthesizes_hits_and_lists_sources(monkeypatch):
    monkeypatch.setenv("SERPER_API_KEY", "k")
    _stub_completion(monkeypatch, research_mod, "They won [1].")

    async def two_hits(self, *, query, api_key):
        return [
            SearchHit(title="Result A", link="https://a.test", snippet="a"),
            SearchHit(title="Result B", link="https://b.test", snippet="b"),
        ]

    monkeypatch.setattr(ResearchAgent, "_search", two_hits)

    result = await research_agent.run(_task("who won?"), _context())
    assert result.content == "They won [1]."
    assert [s["url"] for s in result.metadata["sources"]] == ["https://a.test", "https://b.test"]


@pytest.mark.asyncio
async def test_research_search_parses_serper_and_caps_at_five(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "organic": [
                    {"title": f"T{i}", "link": f"https://x.test/{i}", "snippet": f"s{i}"}
                    for i in range(9)
                ]
            }

    class FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(research_mod.httpx, "AsyncClient", FakeClient)

    hits = await research_agent._search(query="q", api_key="secret")
    assert len(hits) == 5
    assert hits[0].title == "T0"
    assert captured["headers"]["X-API-KEY"] == "secret"
    assert captured["json"]["q"] == "q"


@pytest.mark.asyncio
async def test_research_search_tolerates_a_response_without_organic(monkeypatch):
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

        async def post(self, url, headers=None, json=None):
            return FakeResponse()

    monkeypatch.setattr(research_mod.httpx, "AsyncClient", FakeClient)
    assert await research_agent._search(query="q", api_key="k") == []


def test_research_synthesis_prompt_numbers_each_hit():
    prompt = research_agent._build_synthesis_prompt(
        "who won?", [SearchHit(title="A", link="https://a.test", snippet="snip")]
    )
    assert "Query: who won?" in prompt
    assert "[1] A" in prompt
    # Exact-line match rather than a substring test: CodeQL reads `url in text`
    # as URL sanitization, and this is stricter anyway.
    assert any(line.strip() == "https://a.test" for line in prompt.splitlines())


# ─── ExecutiveAgent classification ───────────────────────────────────────────


@pytest.mark.parametrize(
    "content,expected",
    [
        ("write a python function", TaskType.CODE_GENERATION),
        ("debug this script", TaskType.CODE_GENERATION),
        ("summarize this article", TaskType.DOCUMENT_SUMMARIZATION),
        ("give me a tldr", TaskType.DOCUMENT_SUMMARIZATION),
        ("analyze the market", TaskType.COMPLEX_REASONING),
        ("compare these options", TaskType.COMPLEX_REASONING),
        ("hello there", TaskType.SIMPLE_CHAT),
    ],
)
def test_executive_classifies_the_task(content, expected):
    assert ExecutiveAgent()._classify_task(content) == expected


def test_executive_system_prompt_includes_memory_when_present():
    agent = ExecutiveAgent()
    assert "recalled fact" in agent._build_system_prompt(
        _context(memory_context="recalled fact")
    )


def test_executive_system_prompt_omits_an_empty_memory_block():
    prompt = ExecutiveAgent()._build_system_prompt(_context())
    assert prompt.endswith("information you don't have.")


@pytest.mark.asyncio
async def test_executive_handles_every_task_type():
    assert await ExecutiveAgent().can_handle(_task(task_type="anything"))


# ─── AgentRegistry ───────────────────────────────────────────────────────────


def _stub_agent(name, capabilities=(), level=1):
    class Stub(BaseAgent):
        description = "stub"

        async def can_handle(self, task):
            return True

        async def run(self, task, context):
            return AgentResult(
                task_id=task.id, agent_name=self.name, content=self.name, success=True
            )

    Stub.name = name
    Stub.capabilities = list(capabilities)
    Stub.required_permission_level = level
    return Stub()


def test_registry_registers_and_retrieves():
    from app.agents.registry import AgentRegistry

    reg = AgentRegistry()
    agent = _stub_agent("alpha")
    reg.register(agent)
    assert reg.get("alpha") is agent
    assert reg.get("missing") is None


def test_registry_re_registration_replaces_without_error():
    from app.agents.registry import AgentRegistry

    reg = AgentRegistry()
    reg.register(_stub_agent("alpha"))
    second = _stub_agent("alpha")
    reg.register(second)
    assert reg.get("alpha") is second
    assert len(reg.list_all()) == 1


def test_registry_lists_all_and_filters_by_capability():
    from app.agents.registry import AgentRegistry

    reg = AgentRegistry()
    reg.register(_stub_agent("a", ["search"]))
    reg.register(_stub_agent("b", ["planning"]))

    assert {a.name for a in reg.list_all()} == {"a", "b"}
    assert [a.name for a in reg.list_capable("search")] == ["a"]
    assert reg.list_capable("nothing") == []


def test_registry_clear_empties_it():
    from app.agents.registry import AgentRegistry

    reg = AgentRegistry()
    reg.register(_stub_agent("a"))
    reg.clear()
    assert reg.list_all() == []


# ─── Orchestrator ────────────────────────────────────────────────────────────


@pytest.fixture
def isolated_registry(monkeypatch):
    from app.agents.registry import AgentRegistry
    from app.agents import orchestrator as orch_mod

    reg = AgentRegistry()
    monkeypatch.setattr(orch_mod, "registry", reg)
    return reg


@pytest.mark.parametrize(
    "content,expected_agent",
    [
        ("create a task to buy milk", "productivity"),
        ("what's on my plate", "productivity"),
        ("what does the document say", "knowledge"),
        ("search my documents", "knowledge"),
        ("search the web for news", "research"),
        ("who is the prime minister", "research"),
        ("hello, how are you", "executive"),
    ],
)
def test_orchestrator_classifies_intent(content, expected_agent):
    from app.agents.orchestrator import orchestrator as orch

    assert orch._classify_intent(content).agent_name == expected_agent


def test_orchestrator_falls_back_to_general_with_lower_confidence():
    from app.agents.orchestrator import orchestrator as orch

    intent = orch._classify_intent("just chatting")
    assert intent.name == "general"
    assert intent.confidence == 0.5


@pytest.mark.asyncio
async def test_orchestrator_dispatches_to_the_matching_agent(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    isolated_registry.register(_stub_agent("productivity"))
    result = await Orchestrator().dispatch(_task("create a task to x"), _context())
    assert result.agent_name == "productivity"


@pytest.mark.asyncio
async def test_orchestrator_falls_back_to_executive_when_the_target_is_absent(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    isolated_registry.register(_stub_agent("executive"))
    result = await Orchestrator().dispatch(_task("create a task to x"), _context())
    assert result.agent_name == "executive"


@pytest.mark.asyncio
async def test_orchestrator_reports_when_nothing_is_registered(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    result = await Orchestrator().dispatch(_task("anything"), _context())
    assert result.success is False
    assert result.error == "No agents registered"


@pytest.mark.asyncio
async def test_orchestrator_enforces_the_permission_level(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    isolated_registry.register(_stub_agent("executive", level=4))
    result = await Orchestrator().dispatch(_task("hi"), _context(permission_level=1))
    assert result.success is False
    assert "Permission level 4 required" in result.error


@pytest.mark.asyncio
async def test_orchestrator_delegate_runs_the_target_and_tags_the_result(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    source = _stub_agent("executive")
    isolated_registry.register(_stub_agent("research"))

    result = await Orchestrator().delegate(
        from_agent=source, to_agent_name="research", task=_task(), context=_context()
    )
    assert result.delegated_to == "research"
    assert result.success


@pytest.mark.asyncio
async def test_orchestrator_delegate_rejects_an_unknown_target(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    result = await Orchestrator().delegate(
        from_agent=_stub_agent("executive"),
        to_agent_name="nonexistent",
        task=_task(),
        context=_context(),
    )
    assert result.success is False
    assert "Unknown delegation target: nonexistent" in result.error


@pytest.mark.asyncio
async def test_orchestrator_delegate_blocks_at_the_depth_limit(isolated_registry):
    from app.agents.orchestrator import MAX_DELEGATION_DEPTH, Orchestrator

    isolated_registry.register(_stub_agent("research"))
    result = await Orchestrator().delegate(
        from_agent=_stub_agent("executive"),
        to_agent_name="research",
        task=_task(delegation_depth=MAX_DELEGATION_DEPTH),
        context=_context(),
    )
    assert result.success is False
    assert "Maximum delegation depth" in result.error


@pytest.mark.asyncio
async def test_orchestrator_delegate_records_the_source_on_the_child_task(isolated_registry):
    from app.agents.orchestrator import Orchestrator

    seen = {}

    class Capturing(BaseAgent):
        name = "research"
        description = ""
        capabilities: list = []
        required_permission_level = 1

        async def can_handle(self, task):
            return True

        async def run(self, task, context):
            seen["task"] = task
            return AgentResult(task_id=task.id, agent_name=self.name, content="", success=True)

    isolated_registry.register(Capturing())
    await Orchestrator().delegate(
        from_agent=_stub_agent("executive"),
        to_agent_name="research",
        task=_task(),
        context=_context(),
    )
    assert seen["task"].metadata["delegated_from"] == "executive"
    assert seen["task"].delegation_depth == 1


# ─── ExecutiveAgent run paths ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_executive_answers_directly_when_no_research_is_needed(monkeypatch):
    from app.agents import executive as exec_mod

    _stub_completion(monkeypatch, exec_mod, "direct answer")
    result = await ExecutiveAgent().run(_task("hello there"), _context())

    assert result.content == "direct answer"
    assert result.delegated_to is None
    assert result.metadata["model_used"] == "test-model"


@pytest.mark.asyncio
async def test_executive_delegates_research_then_composes(monkeypatch):
    from app.agents import executive as exec_mod
    from app.agents import orchestrator as orch_mod

    _stub_completion(monkeypatch, exec_mod, "composed answer")

    async def fake_delegate(**kwargs):
        return AgentResult(
            task_id=kwargs["task"].id, agent_name="research",
            content="findings", success=True, metadata={"result_count": 2},
        )

    monkeypatch.setattr(orch_mod.orchestrator, "delegate", fake_delegate)

    result = await ExecutiveAgent().run(_task("what's the latest news on AI"), _context())

    assert result.content == "composed answer"
    assert result.delegated_to == "research"
    assert result.metadata["delegation_path"] == ["executive", "research"]
    assert result.metadata["research_metadata"] == {"result_count": 2}


@pytest.mark.asyncio
async def test_executive_answers_directly_when_research_delegation_fails(monkeypatch):
    from app.agents import executive as exec_mod
    from app.agents import orchestrator as orch_mod

    _stub_completion(monkeypatch, exec_mod, "fallback answer")

    async def failed_delegate(**kwargs):
        return AgentResult(
            task_id=kwargs["task"].id, agent_name="research",
            content="", success=False, error="search down",
        )

    monkeypatch.setattr(orch_mod.orchestrator, "delegate", failed_delegate)

    result = await ExecutiveAgent().run(_task("what's the latest news on AI"), _context())
    assert result.content == "fallback answer"
    assert result.delegated_to is None


@pytest.mark.asyncio
async def test_executive_does_not_delegate_when_already_delegated(monkeypatch):
    from app.agents import executive as exec_mod

    _stub_completion(monkeypatch, exec_mod, "direct")
    result = await ExecutiveAgent().run(
        _task("what's the latest news on AI", delegation_depth=1), _context()
    )
    assert result.delegated_to is None


# ─── ResearchAgent grounded path ─────────────────────────────────────────────


def _grounded_log_entry(citations=None, queries=None):
    entry = _log_entry()
    entry.citations = citations or []
    entry.search_queries = queries or []
    return entry


@pytest.mark.asyncio
async def test_grounded_search_reports_citations_as_a_performed_search(monkeypatch):
    citations = [{"title": "Source", "url": "https://s.test", "domain": "s.test"}]

    async def fake_complete(**kwargs):
        assert kwargs["task_type"] == TaskType.GROUNDED_SEARCH
        return "grounded answer", _grounded_log_entry(citations, ["q"])

    monkeypatch.setattr(research_mod.model_router, "complete", fake_complete)

    result = await research_agent._run_grounded(_task("who won?"), _context())
    assert result.success
    assert result.content == "grounded answer"
    assert result.metadata["search_performed"] is True


@pytest.mark.asyncio
async def test_grounded_search_without_citations_is_still_a_success(monkeypatch):
    # privacy_mode and the ungrounded fallback both answer without citations.
    async def fake_complete(**kwargs):
        return "unsourced answer", _grounded_log_entry()

    monkeypatch.setattr(research_mod.model_router, "complete", fake_complete)

    result = await research_agent._run_grounded(_task("who won?"), _context())
    assert result.success
    assert result.metadata["search_performed"] is False


@pytest.mark.asyncio
async def test_grounded_search_reports_a_provider_failure(monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(research_mod.model_router, "complete", boom)

    result = await research_agent._run_grounded(_task("who won?"), _context())
    assert result.success is False
    assert "gemini unavailable" in result.error
