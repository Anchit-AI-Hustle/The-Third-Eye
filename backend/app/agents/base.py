"""
Base agent contract — all agents implement this interface.
"""

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class AgentTask:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    user_id: uuid.UUID = field(default_factory=uuid.uuid4)
    task_type: str = ""
    content: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    parent_task_id: Optional[uuid.UUID] = None
    delegation_depth: int = 0


@dataclass
class AgentContext:
    user_id: uuid.UUID
    session_id: str
    memory_context: str = ""
    permission_level: int = 1
    privacy_mode: bool = False


@dataclass
class AgentResult:
    task_id: uuid.UUID
    agent_name: str
    content: str
    success: bool
    metadata: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    delegated_to: Optional[str] = None


class BaseAgent(ABC):
    name: str
    description: str
    capabilities: list[str]
    required_permission_level: int  # 1-4

    MAX_DELEGATION_DEPTH = 3

    @abstractmethod
    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        """Execute the task and return a result."""
        ...

    @abstractmethod
    async def can_handle(self, task: AgentTask) -> bool:
        """Returns True if this agent can handle the given task."""
        ...

    async def delegate(
        self, task: AgentTask, target_agent: "BaseAgent", context: AgentContext
    ) -> AgentResult:
        if task.delegation_depth >= self.MAX_DELEGATION_DEPTH:
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content="",
                success=False,
                error="Maximum delegation depth reached — circular delegation detected",
            )

        delegated_task = AgentTask(
            user_id=task.user_id,
            task_type=task.task_type,
            content=task.content,
            metadata=task.metadata,
            parent_task_id=task.id,
            delegation_depth=task.delegation_depth + 1,
        )
        result = await target_agent.run(delegated_task, context)
        result.delegated_to = target_agent.name
        return result
