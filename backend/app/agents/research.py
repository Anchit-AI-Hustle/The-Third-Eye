"""
Research Agent — web search via Serper API.

Without SERPER_API_KEY, falls back to Google Search grounding (Gemini's
built-in google_search tool), which needs no extra key beyond
GOOGLE_AI_API_KEY. Only if that is disabled too does it report
"search unavailable".
"""

import os
from dataclasses import dataclass

import httpx
import structlog

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.config import get_settings
from app.router.model_router import TaskType, model_router

settings = get_settings()

log = structlog.get_logger()

SERPER_API_URL = "https://google.serper.dev/search"


@dataclass(frozen=True)
class SearchHit:
    title: str
    link: str
    snippet: str


class ResearchAgent(BaseAgent):
    name = "research"
    description = "Performs web search and returns synthesized findings."
    capabilities = ["web_search", "research", "fact_lookup"]
    required_permission_level = 2

    async def can_handle(self, task: AgentTask) -> bool:
        return task.task_type in ("research", "web_search", "chat")

    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        api_key = os.getenv("SERPER_API_KEY")
        if not api_key:
            if settings.enable_google_grounding:
                return await self._run_grounded(task, context)
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content=(
                    "Web search is currently unavailable. To enable it, set the "
                    "`SERPER_API_KEY` environment variable. I can still help "
                    "from my memory or your documents."
                ),
                success=True,
                metadata={"search_performed": False, "reason": "no_api_key"},
            )

        try:
            hits = await self._search(query=task.content, api_key=api_key)
        except Exception as e:
            log.error("research_search_failed", error=str(e))
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content="",
                success=False,
                error=f"Web search failed: {e}",
            )

        if not hits:
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content="No web results found.",
                success=True,
                metadata={"search_performed": True, "result_count": 0},
            )

        # Synthesize hits with an LLM
        synthesis_prompt = self._build_synthesis_prompt(task.content, hits)
        synthesis, log_entry = await model_router.complete(
            task_type=TaskType.DOCUMENT_SUMMARIZATION,
            messages=[
                {"role": "system", "content": "Synthesize the following web search results into a concise answer. Cite sources by [#]."},
                {"role": "user", "content": synthesis_prompt},
            ],
            user_id=str(task.user_id),
            privacy_mode=context.privacy_mode,
        )

        sources = [{"title": h.title, "url": h.link} for h in hits]
        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=synthesis,
            success=True,
            metadata={
                "search_performed": True,
                "result_count": len(hits),
                "sources": sources,
                "model_used": log_entry.model_used,
                "latency_ms": log_entry.latency_ms,
            },
        )

    async def _run_grounded(self, task: AgentTask, context: AgentContext) -> AgentResult:
        """
        Answer via Gemini's google_search tool. Gemini runs the searches and
        reports which sources it used, so sources come from grounding metadata
        rather than a separate search call.
        """
        try:
            answer, log_entry = await model_router.complete(
                task_type=TaskType.GROUNDED_SEARCH,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Answer the user's question using Google Search. Be concise "
                            "and factual, and state plainly if the search results do not "
                            "settle the question."
                        ),
                    },
                    {"role": "user", "content": task.content},
                ],
                user_id=str(task.user_id),
                privacy_mode=context.privacy_mode,
            )
        except Exception as e:
            log.error("research_grounded_failed", error=str(e))
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content="",
                success=False,
                error=f"Grounded search failed: {e}",
            )

        # privacy_mode routes to the local model, and the ungrounded fallback
        # has no citations either — so absence of citations is expected, not an
        # error. Report it so callers can tell a grounded answer from a guess.
        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=answer,
            success=True,
            metadata={
                "search_performed": bool(log_entry.citations),
                "search_provider": "google_grounding",
                "result_count": len(log_entry.citations),
                "sources": log_entry.citations,
                "search_queries": log_entry.search_queries,
                "model_used": log_entry.model_used,
                "latency_ms": log_entry.latency_ms,
            },
        )

    async def _search(self, *, query: str, api_key: str) -> list[SearchHit]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                SERPER_API_URL,
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                json={"q": query, "num": 5},
            )
            response.raise_for_status()
            data = response.json()

        organic = data.get("organic", [])
        return [
            SearchHit(
                title=item.get("title", ""),
                link=item.get("link", ""),
                snippet=item.get("snippet", ""),
            )
            for item in organic[:5]
        ]

    def _build_synthesis_prompt(self, query: str, hits: list[SearchHit]) -> str:
        lines = [f"Query: {query}", "", "Search results:"]
        for i, h in enumerate(hits, 1):
            lines.append(f"\n[{i}] {h.title}\n    {h.link}\n    {h.snippet}")
        lines.append("\nPlease synthesize these results into a clear, factual answer with citations.")
        return "\n".join(lines)


research_agent = ResearchAgent()
