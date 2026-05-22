import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    file_type: Optional[str]
    file_size_bytes: Optional[int]
    processing_status: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(5, ge=1, le=20)
    document_ids: Optional[list[uuid.UUID]] = None


class SearchResult(BaseModel):
    document_id: uuid.UUID
    document_title: str
    chunk_index: int
    content: str
    score: float


class KnowledgeSearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    latency_ms: int


class DocumentUploadResponse(BaseModel):
    id: uuid.UUID
    title: str
    processing_status: str
    message: str
