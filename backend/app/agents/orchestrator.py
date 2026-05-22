"""
Orchestrator — intent routing and agent delegation.
Routes user requests to the most capable agent and enforces a max
delegation depth of 3 to prevent circular delegation.
"""

import re
from dataclasses import dataclass

import structlog

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.agents.registry import registry

log = structlog.get_logger()

MAX_DELEGATION_DEPTH = 3


class CircularDelegationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Intent:
    name: str
    agent_name: str  # the name of the agent that handles this intent
    confidence: float


# Intent patterns — order matters; first match wins.
# Each tuple: (intent_name, agent_name, regex pattern)
INTENT_PATTERNS: list[tuple[str, str, re.Pattern]] = [
    (
        "task_management",
        "productivity",
        re.compile(
            r"\b(create|add|make|new|finish|complete|done|update|delete|remove)\s+(task|todo|reminder|to-do)|\b(my\s+(tasks|todos|to-do|schedule)|what'?s\s+on\s+my\s+(plate|todo|list))",
            re.IGNORECASE,
        ),
    ),
    (
        "document_qa",
        "knowledge",
        re.compile(
            r"\b(in\s+(my|the)\s+(document|file|pdf|notes)|what\s+does\s+(my|the)\s+(document|pdf|file)|search\s+(my\s+)?(documents|knowledge)|from\s+(my|the)\s+(document|pdf|file))",
            re.IGNORECASE,
        ),
    ),
    (
        "web_research",
        "research",
        re.compile(
            r"\b(search\s+(the\s+)?web|look\s+up\s+online|google\s+for|find\s+out\s+(the\s+)?latest|what'?s\s+the\s+latest|recent\s+news|current\s+(price|status|market)|who\s+is)",
            re.IGNORECASE,
        ),
    ),
]


class Orchestrator:
    """Routes tasks to specialist agents; supports bounded delegation."""

    async def dispatch(self, task: AgentTask, context: AgentContext) -> AgentResult:
        intent = self._classify_intent(task.content)
        log.info("orchestrator_dispatch", intent=intent.name, agent=intent.agent_name)

        agent = registry.get(intent.agent_name)
        if agent is None:
            agent = registry.get("executive")
        if agent is None:
            return AgentResult(
                task_id=task.id,
                agent_name="orchestrator",
                content="",
                success=False,
                error="No agents registered",
            )

        return await self._run_agent(agent, task, context)

    async def delegate(
        self,
        *,
        from_agent: BaseAgent,
        to_agent_name: str,
        task: AgentTask,
        context: AgentContext,
    ) -> AgentResult:
        if task.delegation_depth >= MAX_DELEGATION_DEPTH:
            log.warning(
                "circular_delegation_blocked",
                from_agent=from_agent.name,
                to_agent=to_agent_name,
                depth=task.delegation_depth,
            )
            return AgentResult(
                task_id=task.id,
                agent_name=from_agent.name,
                content="",
                success=False,
                error=f"Maximum delegation depth ({MAX_DELEGATION_DEPTH}) reached",
            )

        target = registry.get(to_agent_name)
        if target is None:
            return AgentResult(
                task_id=task.id,
                agent_name=from_agent.name,
                content="",
                success=False,
                error=f"Unknown delegation target: {to_agent_name}",
            )

        child_task = AgentTask(
            user_id=task.user_id,
            task_type=task.task_type,
            content=task.content,
            metadata={**task.metadata, "delegated_from": from_agent.name},
            parent_task_id=task.id,
            delegation_depth=task.delegation_depth + 1,
        )

        result = await self._run_agent(target, child_task, context)
        result.delegated_to = target.name
        return result

    async def _run_agent(
        self, agent: BaseAgent, task: AgentTask, context: AgentContext
    ) -> AgentResult:
        if context.permission_level < agent.required_permission_level:
            return AgentResult(
                task_id=task.id,
                agent_name=agent.name,
                content="",
                success=False,
                error=f"Permission level {agent.required_permission_level} required",
            )
        return await agent.run(task, context)

    def _classify_intent(self, content: str) -> Intent:
        for intent_name, agent_name, pattern in INTENT_PATTERNS:
            if pattern.search(content):
                return Intent(name=intent_name, agent_name=agent_name, confidence=0.9)
        # Fallback to executive for general chat / planning
        return Intent(name="general", agent_name="executive", confidence=0.5)


orchestrator = Orchestrator()
