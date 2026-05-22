"""
Productivity Agent — task suggestions, schedule awareness, task creation.
"""

import re
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.database import AsyncSessionLocal
from app.router.model_router import TaskType, model_router
from app.tasks.models import Task

log = structlog.get_logger()

CREATE_TASK_PATTERNS = [
    re.compile(r"(?:create|add|make|new)\s+(?:a\s+)?(?:task|todo|to-do|reminder)(?:\s+(?:to|for|called|named|:)\s+)?(.+)", re.IGNORECASE),
    re.compile(r"(?:remind\s+me\s+to)\s+(.+)", re.IGNORECASE),
]


class ProductivityAgent(BaseAgent):
    name = "productivity"
    description = "Manages tasks, reminders, and schedule awareness."
    capabilities = ["task_management", "scheduling", "prioritization"]
    required_permission_level = 2

    async def can_handle(self, task: AgentTask) -> bool:
        return task.task_type in ("task_management", "chat")

    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        # Detect task creation intent first
        title = self._extract_task_title(task.content)
        if title:
            return await self._create_task(task=task, title=title)

        # Otherwise summarize / suggest based on existing tasks
        return await self._summarize_tasks(task=task, context=context)

    def _extract_task_title(self, content: str) -> str | None:
        for pattern in CREATE_TASK_PATTERNS:
            match = pattern.search(content)
            if match:
                title = match.group(1).strip().rstrip(".!?")
                if title and len(title) < 500:
                    return title
        return None

    async def _create_task(self, *, task: AgentTask, title: str) -> AgentResult:
        async with AsyncSessionLocal() as db:
            new_task = Task(
                user_id=task.user_id,
                title=title,
                status="todo",
                priority="medium",
            )
            db.add(new_task)
            await db.commit()
            await db.refresh(new_task)

        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=f"Created task: \"{title}\". You can view it on the Tasks page.",
            success=True,
            metadata={"action": "task_created", "task_id": str(new_task.id), "title": title},
        )

    async def _summarize_tasks(self, *, task: AgentTask, context: AgentContext) -> AgentResult:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Task)
                .where(Task.user_id == task.user_id, Task.status.in_(["todo", "in_progress"]))
                .order_by(Task.created_at.desc())
                .limit(50)
            )
            open_tasks = result.scalars().all()

        if not open_tasks:
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content="You have no open tasks. Want me to create one?",
                success=True,
                metadata={"action": "summarize", "open_count": 0},
            )

        task_lines = [
            f"- [{t.priority}] {t.title} ({t.status})" for t in open_tasks[:20]
        ]
        prompt = (
            f"User question: {task.content}\n\n"
            f"Their open tasks ({len(open_tasks)} total, first 20 shown):\n"
            + "\n".join(task_lines)
        )

        synthesis, log_entry = await model_router.complete(
            task_type=TaskType.SIMPLE_CHAT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a productivity coach. Look at the user's tasks "
                        "and answer their question concisely. Suggest priorities "
                        "where useful but don't overload them."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            user_id=str(task.user_id),
            privacy_mode=context.privacy_mode,
        )

        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=synthesis,
            success=True,
            metadata={
                "action": "summarize",
                "open_count": len(open_tasks),
                "model_used": log_entry.model_used,
                "latency_ms": log_entry.latency_ms,
            },
        )


productivity_agent = ProductivityAgent()
