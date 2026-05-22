import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    status: Literal["todo", "in_progress", "done", "cancelled"] = "todo"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    due_date: Optional[datetime] = None
    project_id: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    status: Optional[Literal["todo", "in_progress", "done", "cancelled"]] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    due_date: Optional[datetime] = None
    project_id: Optional[uuid.UUID] = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    project_id: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    status: str
    priority: str
    due_date: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ProjectResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    status: str
    color: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
