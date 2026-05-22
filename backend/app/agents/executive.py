"""
Executive Agent — planning, prioritization, and delegation to specialist agents.
Default fallback agent for general queries.
"""

import re

import structlog

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.router.model_router import TaskType, model_router

log = structlog.get_logger()

# When Executive sees these signals in a query, it delegates to Research
RESEARCH_DELEGATION_PATTERNS = [
    re.compile(r"\b(latest|recent|current|today'?s|this\s+week'?s)\s+(news|events|stock|price|weather|update)", re.IGNORECASE),
    re.compile(r"\b(who\s+is|what\s+is|when\s+did)\s+[A-Z]", re.IGNORECASE),
    re.compile(r"\b(competitor|market\s+share|stock\s+price)\s+", re.IGNORECASE),
]


class ExecutiveAgent(BaseAgent):
    name = "executive"
    description = "Plans, prioritizes, and routes tasks; default fallback for general chat."
    capabilities = ["routing", "planning", "general_chat", "task_creation", "synthesis"]
    required_permission_level = 1

    async def can_handle(self, task: AgentTask) -> bool:
        return True  # Executive is the fallback for everything

    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        # Decide whether to delegate to research
        if self._needs_research(task.content) and task.delegation_depth == 0:
            return await self._delegate_to_research_and_compose(task, context)

        return await self._answer_directly(task, context)

    def _needs_research(self, content: str) -> bool:
        return any(p.search(content) for p in RESEARCH_DELEGATION_PATTERNS)

    async def _delegate_to_research_and_compose(
        self, task: AgentTask, context: AgentContext
    ) -> AgentResult:
        # Import here to avoid circular imports
        from app.agents.orchestrator import orchestrator

        research_result = await orchestrator.delegate(
            from_agent=self,
            to_agent_name="research",
            task=task,
            context=context,
        )

        if not research_result.success:
            # Research failed — fall back to direct answer
            log.warning("research_delegation_failed", error=research_result.error)
            return await self._answer_directly(task, context)

        # Compose: take research findings and frame them through executive's voice
        compose_prompt = (
            f"User asked: {task.content}\n\n"
            f"Research findings:\n{research_result.content}\n\n"
            "Write a concise, helpful response that combines the research findings with "
            "any relevant context. Cite sources where the research provided them."
        )

        synthesis, log_entry = await model_router.complete(
            task_type=TaskType.SIMPLE_CHAT,
            messages=[
                {"role": "system", "content": self._build_system_prompt(context)},
                {"role": "user", "content": compose_prompt},
            ],
            user_id=str(task.user_id),
            privacy_mode=context.privacy_mode,
        )

        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=synthesis,
            success=True,
            delegated_to="research",
            metadata={
                "model_used": log_entry.model_used,
                "latency_ms": log_entry.latency_ms,
                "delegation_path": ["executive", "research"],
                "research_metadata": research_result.metadata,
            },
        )

    async def _answer_directly(self, task: AgentTask, context: AgentContext) -> AgentResult:
        task_type = self._classify_task(task.content)
        messages = [
            {"role": "system", "content": self._build_system_prompt(context)},
            {"role": "user", "content": task.content},
        ]

        response_text, log_entry = await model_router.complete(
            task_type=task_type,
            messages=messages,
            user_id=str(task.user_id),
            privacy_mode=context.privacy_mode,
        )

        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=response_text,
            success=True,
            metadata={
                "model_used": log_entry.model_used,
                "latency_ms": log_entry.latency_ms,
                "estimated_cost_usd": log_entry.estimated_cost_usd,
                "task_type": str(task_type),
            },
        )

    def _classify_task(self, content: str) -> TaskType:
        lower = content.lower()
        if any(k in lower for k in ["code", "function", "script", "debug", "python", "javascript"]):
            return TaskType.CODE_GENERATION
        if any(k in lower for k in ["summarize", "summary", "tldr"]):
            return TaskType.DOCUMENT_SUMMARIZATION
        if any(k in lower for k in ["analyze", "reason", "compare", "strategy"]):
            return TaskType.COMPLEX_REASONING
        return TaskType.SIMPLE_CHAT

    def _build_system_prompt(self, context: AgentContext) -> str:
        prompt = (
            "You are JARVIS, an AI-powered personal operating system assistant. "
            "You are helpful, precise, and efficient. You have access to the user's "
            "memory context, tasks, and knowledge base. Always be direct and "
            "actionable. Never fabricate information you don't have."
        )
        if context.memory_context:
            prompt += f"\n\n{context.memory_context}"
        return prompt


executive_agent = ExecutiveAgent()
