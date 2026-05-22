"""
Tests for agent framework: registry, orchestrator, delegation, circular guard.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.agents.orchestrator import (
    MAX_DELEGATION_DEPTH,
    Orchestrator,
    orchestrator,
)
from app.agents.registry import AgentRegistry, registry


# ─── Fixtures ─────────────────────────────────────────────────────────────────

class _StubAgent(BaseAgent):
    def __init__(self, name: str, capabilities: list[str], level: int = 1):
        self.name = name
        self.description = f"Stub {name}"
        self.capabilities = capabilities
        self.required_permission_level = level
        self.run_called = False

    async def can_handle(self, task: AgentTask) -> bool:
        return True

    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        self.run_called = True
        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=f"result-from-{self.name}",
            success=True,
            metadata={"depth": task.delegation_depth},
        )


@pytest.fixture
def fresh_registry():
    """Provide an isolated registry, restore the singleton after the test."""
    saved = dict(registry._agents)
    registry.clear()
    yield registry
    registry.clear()
    for name, agent in saved.items():
        registry._agents[name] = agent


@pytest.fixture
def context() -> AgentContext:
    return AgentContext(
        user_id=uuid.uuid4(),
        session_id="test-session",
        permission_level=4,
    )


# ─── Registry ─────────────────────────────────────────────────────────────────

def test_registry_register_and_get(fresh_registry):
    agent = _StubAgent("test", ["search"])
    fresh_registry.register(agent)
    assert fresh_registry.get("test") is agent
    assert fresh_registry.get("missing") is None


def test_registry_list_capable(fresh_registry):
    a1 = _StubAgent("alpha", ["search", "summarize"])
    a2 = _StubAgent("beta", ["search"])
    a3 = _StubAgent("gamma", ["other"])
    fresh_registry.register(a1)
    fresh_registry.register(a2)
    fresh_registry.register(a3)

    search_capable = fresh_registry.list_capable("search")
    assert {a.name for a in search_capable} == {"alpha", "beta"}

    other_capable = fresh_registry.list_capable("other")
    assert [a.name for a in other_capable] == ["gamma"]


def test_registry_idempotent_register(fresh_registry):
    agent = _StubAgent("test", ["search"])
    fresh_registry.register(agent)
    fresh_registry.register(agent)
    assert len(fresh_registry.list_all()) == 1


def test_registry_clear(fresh_registry):
    fresh_registry.register(_StubAgent("a", []))
    fresh_registry.register(_StubAgent("b", []))
    fresh_registry.clear()
    assert fresh_registry.list_all() == []


# ─── Orchestrator dispatch / intent routing ───────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrator_routes_task_management_to_productivity(fresh_registry, context):
    productivity = _StubAgent("productivity", ["task_management"])
    executive = _StubAgent("executive", ["chat"])
    fresh_registry.register(productivity)
    fresh_registry.register(executive)

    task = AgentTask(user_id=context.user_id, content="Create a task to buy milk")
    result = await orchestrator.dispatch(task, context)

    assert productivity.run_called
    assert not executive.run_called
    assert result.agent_name == "productivity"


@pytest.mark.asyncio
async def test_orchestrator_routes_document_query_to_knowledge(fresh_registry, context):
    knowledge = _StubAgent("knowledge", ["document_qa"])
    executive = _StubAgent("executive", ["chat"])
    fresh_registry.register(knowledge)
    fresh_registry.register(executive)

    task = AgentTask(user_id=context.user_id, content="What does my document say about pricing?")
    result = await orchestrator.dispatch(task, context)

    assert knowledge.run_called
    assert result.agent_name == "knowledge"


@pytest.mark.asyncio
async def test_orchestrator_routes_web_search_to_research(fresh_registry, context):
    research = _StubAgent("research", ["web_search"])
    executive = _StubAgent("executive", ["chat"])
    fresh_registry.register(research)
    fresh_registry.register(executive)

    task = AgentTask(user_id=context.user_id, content="Search the web for AI trends")
    result = await orchestrator.dispatch(task, context)

    assert research.run_called
    assert result.agent_name == "research"


@pytest.mark.asyncio
async def test_orchestrator_falls_back_to_executive(fresh_registry, context):
    executive = _StubAgent("executive", ["chat"])
    fresh_registry.register(executive)

    task = AgentTask(user_id=context.user_id, content="Just say hello")
    result = await orchestrator.dispatch(task, context)

    assert executive.run_called
    assert result.agent_name == "executive"


@pytest.mark.asyncio
async def test_orchestrator_returns_error_when_no_agents(fresh_registry, context):
    task = AgentTask(user_id=context.user_id, content="anything")
    result = await orchestrator.dispatch(task, context)
    assert result.success is False
    assert "No agents registered" in (result.error or "")


@pytest.mark.asyncio
async def test_orchestrator_enforces_permission_level(fresh_registry):
    # Agent requires level 4, user has only level 1
    secret_agent = _StubAgent("secret", ["danger"], level=4)
    executive = _StubAgent("executive", ["chat"])
    fresh_registry.register(secret_agent)
    fresh_registry.register(executive)

    low_perm_ctx = AgentContext(
        user_id=uuid.uuid4(), session_id="s", permission_level=1
    )
    task = AgentTask(user_id=low_perm_ctx.user_id, content="hello")
    result = await orchestrator.dispatch(task, low_perm_ctx)
    # Executive (level 1) should still serve — not the level-4 agent
    assert result.success is True
    assert result.agent_name == "executive"


# ─── Delegation ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrator_delegate_increments_depth(fresh_registry, context):
    target = _StubAgent("target", ["any"])
    sender = _StubAgent("sender", ["any"])
    fresh_registry.register(target)
    fresh_registry.register(sender)

    task = AgentTask(user_id=context.user_id, content="hello", delegation_depth=0)
    result = await orchestrator.delegate(
        from_agent=sender, to_agent_name="target", task=task, context=context
    )

    assert result.success is True
    assert result.delegated_to == "target"
    assert result.metadata["depth"] == 1


@pytest.mark.asyncio
async def test_orchestrator_blocks_circular_delegation_at_depth_3(fresh_registry, context):
    target = _StubAgent("target", ["any"])
    sender = _StubAgent("sender", ["any"])
    fresh_registry.register(target)
    fresh_registry.register(sender)

    task = AgentTask(
        user_id=context.user_id,
        content="hello",
        delegation_depth=MAX_DELEGATION_DEPTH,
    )
    result = await orchestrator.delegate(
        from_agent=sender, to_agent_name="target", task=task, context=context
    )

    assert result.success is False
    assert "Maximum delegation depth" in (result.error or "")
    assert not target.run_called


@pytest.mark.asyncio
async def test_orchestrator_delegate_to_unknown_agent_returns_error(fresh_registry, context):
    sender = _StubAgent("sender", ["any"])
    fresh_registry.register(sender)

    task = AgentTask(user_id=context.user_id, content="x", delegation_depth=0)
    result = await orchestrator.delegate(
        from_agent=sender, to_agent_name="nonexistent", task=task, context=context
    )

    assert result.success is False
    assert "Unknown delegation target" in (result.error or "")


# ─── Executive → Research delegation (composed answer) ────────────────────────

@pytest.mark.asyncio
async def test_executive_delegates_to_research_and_composes(fresh_registry, context):
    from app.agents.executive import ExecutiveAgent
    from app.router.model_router import RouterLogEntry

    research = _StubAgent("research", ["web_search"])
    exec_agent = ExecutiveAgent()
    fresh_registry.register(research)
    fresh_registry.register(exec_agent)

    fake_log = RouterLogEntry(
        task_type="simple_chat",
        model_used="gemini-1.5-flash",
        provider="google",
        prompt_tokens=10,
        completion_tokens=20,
        latency_ms=100,
        estimated_cost_usd=0.001,
        attempts=1,
    )

    task = AgentTask(
        user_id=context.user_id,
        content="What is the latest news on quantum computing?",
    )

    with patch(
        "app.router.model_router.model_router.complete",
        new_callable=AsyncMock,
        return_value=("Composed answer with research synthesis.", fake_log),
    ):
        result = await exec_agent.run(task, context)

    assert result.success is True
    assert result.agent_name == "executive"
    assert result.delegated_to == "research"
    assert "delegation_path" in result.metadata
    assert result.metadata["delegation_path"] == ["executive", "research"]
    assert research.run_called


@pytest.mark.asyncio
async def test_executive_answers_directly_without_research_signal(fresh_registry, context):
    from app.agents.executive import ExecutiveAgent
    from app.router.model_router import RouterLogEntry

    research = _StubAgent("research", ["web_search"])
    exec_agent = ExecutiveAgent()
    fresh_registry.register(research)
    fresh_registry.register(exec_agent)

    fake_log = RouterLogEntry(
        task_type="simple_chat",
        model_used="gemini-1.5-flash",
        provider="google",
        prompt_tokens=10,
        completion_tokens=20,
        latency_ms=100,
        estimated_cost_usd=0.001,
        attempts=1,
    )

    task = AgentTask(user_id=context.user_id, content="Hello, how are you?")

    with patch(
        "app.router.model_router.model_router.complete",
        new_callable=AsyncMock,
        return_value=("Hello! I'm doing well.", fake_log),
    ):
        result = await exec_agent.run(task, context)

    assert result.success is True
    assert result.delegated_to is None
    assert not research.run_called
