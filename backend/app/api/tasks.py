import uuid
from datetime import datetime, timezone
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.auth.models import User
from app.database import get_db
from app.tasks.models import Task, Project
from app.tasks.schemas import (
    ProjectCreate,
    ProjectResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)

router = APIRouter()


# ─── Tasks ───────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
) -> List[TaskResponse]:
    query = select(Task).where(Task.user_id == current_user.id).order_by(Task.created_at.desc())
    if status:
        query = query.where(Task.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    task = Task(user_id=current_user.id, **data.model_dump())
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    updates = data.model_dump(exclude_unset=True)
    if updates.get("status") == "done" and not task.completed_at:
        updates["completed_at"] = datetime.now(timezone.utc)

    for key, value in updates.items():
        setattr(task, key, value)

    await db.flush()
    await db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await db.delete(task)


# ─── Projects ─────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[ProjectResponse]:
    result = await db.execute(
        select(Project).where(Project.user_id == current_user.id).order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    project = Project(user_id=current_user.id, **data.model_dump())
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project
