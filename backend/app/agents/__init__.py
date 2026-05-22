"""
Agent registration — all agents register themselves at import time.
The orchestrator queries the registry by name or capability.
"""

from app.agents.registry import registry
from app.agents.executive import executive_agent
from app.agents.research import research_agent
from app.agents.knowledge import knowledge_agent
from app.agents.productivity import productivity_agent

registry.register(executive_agent)
registry.register(research_agent)
registry.register(knowledge_agent)
registry.register(productivity_agent)
