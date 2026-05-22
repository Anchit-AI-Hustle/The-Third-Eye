"""
Knowledge Agent — answers questions from the user's document knowledge base.
Uses RAG retrieval + LLM synthesis with source citations.
"""

import structlog

from app.agents.base import AgentContext, AgentResult, AgentTask, BaseAgent
from app.database import AsyncSessionLocal
from app.knowledge.retriever import format_chunks_for_context, retrieve_chunks
from app.router.model_router import TaskType, model_router

log = structlog.get_logger()


class KnowledgeAgent(BaseAgent):
    name = "knowledge"
    description = "Answers questions from the user's uploaded documents."
    capabilities = ["document_qa", "rag", "summarization"]
    required_permission_level = 1

    async def can_handle(self, task: AgentTask) -> bool:
        return task.task_type in ("document_qa", "chat")

    async def run(self, task: AgentTask, context: AgentContext) -> AgentResult:
        async with AsyncSessionLocal() as db:
            chunks = await retrieve_chunks(
                db,
                user_id=task.user_id,
                query=task.content,
                top_k=5,
            )

        if not chunks:
            return AgentResult(
                task_id=task.id,
                agent_name=self.name,
                content=(
                    "I don't have any documents that match this question. "
                    "Upload relevant files to your knowledge base first."
                ),
                success=True,
                metadata={"sources": [], "chunks_retrieved": 0},
            )

        context_block = format_chunks_for_context(chunks)

        system = (
            "You are a precise research assistant. Answer the user's question "
            "using ONLY the document excerpts provided. Cite sources by [#] from "
            "the passages. If the documents don't answer the question, say so."
        )

        synthesis, log_entry = await model_router.complete(
            task_type=TaskType.DOCUMENT_SUMMARIZATION,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"{context_block}\n\nQuestion: {task.content}"},
            ],
            user_id=str(task.user_id),
            privacy_mode=context.privacy_mode,
        )

        sources = [
            {
                "document_id": str(c["document_id"]),
                "document_title": c["document_title"],
                "chunk_index": c["chunk_index"],
                "score": c["score"],
            }
            for c in chunks
        ]

        return AgentResult(
            task_id=task.id,
            agent_name=self.name,
            content=synthesis,
            success=True,
            metadata={
                "sources": sources,
                "chunks_retrieved": len(chunks),
                "model_used": log_entry.model_used,
                "latency_ms": log_entry.latency_ms,
            },
        )


knowledge_agent = KnowledgeAgent()
