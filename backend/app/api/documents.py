import uuid
from typing import Annotated, List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.auth.models import User
from app.database import AsyncSessionLocal, get_db
from app.knowledge.ingestion import detect_file_type, UnsupportedFileTypeError
from app.knowledge.models import Document
from app.knowledge.pipeline import ingest_document
from app.knowledge.schemas import DocumentResponse, DocumentUploadResponse

router = APIRouter()

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/documents/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> DocumentUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    try:
        file_type = detect_file_type(file.filename)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_FILE_SIZE_BYTES // 1024 // 1024}MB)",
        )

    doc = Document(
        user_id=current_user.id,
        title=file.filename,
        file_type=file_type,
        file_size_bytes=len(contents),
        processing_status="pending",
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    document_id = doc.id
    background_tasks.add_task(_process_document, document_id, contents, file_type)

    return DocumentUploadResponse(
        id=doc.id,
        title=doc.title,
        processing_status="pending",
        message="Document accepted; processing in background.",
    )


async def _process_document(document_id: uuid.UUID, contents: bytes, file_type: str) -> None:
    """Background task: parse → chunk → embed → store."""
    import io

    async with AsyncSessionLocal() as db:
        try:
            await ingest_document(
                db,
                document_id=document_id,
                file=io.BytesIO(contents),
                file_type=file_type,
            )
            await db.commit()
        except Exception:
            await db.rollback()


@router.get("/documents/", response_model=List[DocumentResponse])
async def list_documents(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[DocumentResponse]:
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DocumentResponse:
    result = await db.execute(
        select(Document).where(
            Document.id == document_id, Document.user_id == current_user.id
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(
        select(Document).where(
            Document.id == document_id, Document.user_id == current_user.id
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
