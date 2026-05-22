import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.middleware import get_current_user
from app.auth.models import User
from app.agents.executive import executive_agent
from app.agents.base import AgentContext, AgentTask
from app.database import AsyncSession, get_db
from app.memory.service import (
    format_memory_context,
    retrieve_relevant_memories,
    store_episodic,
)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32_000)
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    session_id: str
    model_used: str
    latency_ms: int
    memories_used: int


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatResponse:
    session_id = request.session_id or str(uuid.uuid4())

    # Retrieve relevant memories
    memories = await retrieve_relevant_memories(
        db,
        user_id=current_user.id,
        query=request.message,
    )
    memory_context = format_memory_context(memories)

    # Build agent context
    context = AgentContext(
        user_id=current_user.id,
        session_id=session_id,
        memory_context=memory_context,
        permission_level=current_user.max_permission_level,
        privacy_mode=current_user.privacy_mode,
    )

    task = AgentTask(
        user_id=current_user.id,
        task_type="chat",
        content=request.message,
    )

    result = await executive_agent.run(task, context)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result.error or "Agent execution failed",
        )

    # Store both turns in episodic memory (fire and forget pattern)
    await store_episodic(db, user_id=current_user.id, role="user", content=request.message, session_id=session_id)
    await store_episodic(db, user_id=current_user.id, role="assistant", content=result.content, session_id=session_id)

    return ChatResponse(
        message=result.content,
        session_id=session_id,
        model_used=result.metadata.get("model_used", "unknown"),
        latency_ms=result.metadata.get("latency_ms", 0),
        memories_used=len(memories),
    )
