"""
Executive Agent — default entry point for all user requests.
Routes to specialist agents (Phase 2) or handles directly via ModelRouter.
"""

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.router.model_router import TaskType, model_router


class ExecutiveAgent(BaseAgent):
    name = "executive"
    description = "Plans, prioritizes, and routes tasks to specialist agents."
    capabilities = ["routing", "planning", "general_chat", "task_creation"]
    required_permission_level = 1

    async def can_handle(self, task: AgentTask) -> bool:
        return True  # Executive handles everything as fallback

    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        messages = self._build_messages(task, context)

        task_type = self._classify_task(task.content)

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
        """
        Lightweight heuristic classification. Phase 2 will replace this
        with a proper intent classifier.
        """
        lower = content.lower()
        if any(k in lower for k in ["code", "function", "script", "debug", "python", "javascript"]):
            return TaskType.CODE_GENERATION
        if any(k in lower for k in ["summarize", "summary", "tldr", "document"]):
            return TaskType.DOCUMENT_SUMMARIZATION
        if any(k in lower for k in ["analyze", "reason", "explain", "compare", "strategy"]):
            return TaskType.COMPLEX_REASONING
        return TaskType.SIMPLE_CHAT

    def _build_messages(self, task: AgentTask, context: AgentContext) -> list[dict]:
        system_prompt = (
            "You are JARVIS, an AI-powered personal operating system assistant. "
            "You are helpful, precise, and efficient. You have access to the user's "
            "memory context, tasks, and knowledge base. "
            "Always be direct and actionable. "
            "Never fabricate information you don't have."
        )

        if context.memory_context:
            system_prompt += f"\n\n{context.memory_context}"

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task.content},
        ]


executive_agent = ExecutiveAgent()
