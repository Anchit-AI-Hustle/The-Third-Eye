"""
Agent registry — singleton storing all available agents.
Agents register themselves at import time; orchestrator queries by name or capability.
"""

import threading
from typing import Optional

from app.agents.base import BaseAgent


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, BaseAgent] = {}
        self._lock = threading.Lock()

    def register(self, agent: BaseAgent) -> None:
        with self._lock:
            if agent.name in self._agents:
                # Idempotent re-registration is allowed (module reload during tests)
                pass
            self._agents[agent.name] = agent

    def get(self, name: str) -> Optional[BaseAgent]:
        return self._agents.get(name)

    def list_all(self) -> list[BaseAgent]:
        return list(self._agents.values())

    def list_capable(self, capability: str) -> list[BaseAgent]:
        return [a for a in self._agents.values() if capability in a.capabilities]

    def clear(self) -> None:
        with self._lock:
            self._agents.clear()


registry = AgentRegistry()
