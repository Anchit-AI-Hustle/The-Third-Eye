"""
Token-based chunker — 512 token chunks with 50 token overlap.
Prefers paragraph and sentence boundaries; falls back to hard token cuts.
"""

import re
from dataclasses import dataclass

import tiktoken

CHUNK_SIZE_TOKENS = 512
CHUNK_OVERLAP_TOKENS = 50
ENCODING_NAME = "cl100k_base"  # matches text-embedding-3-small

_encoding = tiktoken.get_encoding(ENCODING_NAME)


@dataclass(frozen=True)
class Chunk:
    index: int
    content: str
    token_count: int


def count_tokens(text: str) -> int:
    return len(_encoding.encode(text))


def chunk_text(
    text: str,
    *,
    chunk_size: int = CHUNK_SIZE_TOKENS,
    overlap: int = CHUNK_OVERLAP_TOKENS,
) -> list[Chunk]:
    if not text.strip():
        return []

    # Try paragraph-aware splitting first
    paragraphs = _split_paragraphs(text)
    chunks: list[Chunk] = []
    buffer: list[str] = []
    buffer_tokens = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)

        if para_tokens > chunk_size:
            # Flush current buffer
            if buffer:
                chunks.append(_make_chunk(len(chunks), buffer))
                buffer, buffer_tokens = _carry_overlap(buffer, overlap)

            # Split oversized paragraph by sentences then by tokens
            for sub in _split_oversized(para, chunk_size, overlap):
                chunks.append(Chunk(index=len(chunks), content=sub, token_count=count_tokens(sub)))
            continue

        if buffer_tokens + para_tokens > chunk_size and buffer:
            chunks.append(_make_chunk(len(chunks), buffer))
            buffer, buffer_tokens = _carry_overlap(buffer, overlap)

        buffer.append(para)
        buffer_tokens += para_tokens

    if buffer:
        chunks.append(_make_chunk(len(chunks), buffer))

    return chunks


def _split_paragraphs(text: str) -> list[str]:
    # Normalize line endings, split on blank lines
    text = text.replace("\r\n", "\n")
    parts = re.split(r"\n\s*\n", text)
    return [p.strip() for p in parts if p.strip()]


def _split_sentences(text: str) -> list[str]:
    # Simple sentence splitter — good enough for chunking
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    return [p.strip() for p in parts if p.strip()]


def _split_oversized(text: str, chunk_size: int, overlap: int) -> list[str]:
    sentences = _split_sentences(text)
    results: list[str] = []
    buffer: list[str] = []
    buffer_tokens = 0

    for sent in sentences:
        sent_tokens = count_tokens(sent)
        if sent_tokens > chunk_size:
            if buffer:
                results.append(" ".join(buffer))
                buffer, buffer_tokens = [], 0
            # Hard token cut for the oversized sentence
            results.extend(_hard_token_split(sent, chunk_size, overlap))
            continue

        if buffer_tokens + sent_tokens > chunk_size and buffer:
            results.append(" ".join(buffer))
            buffer, buffer_tokens = [], 0

        buffer.append(sent)
        buffer_tokens += sent_tokens

    if buffer:
        results.append(" ".join(buffer))

    return results


def _hard_token_split(text: str, chunk_size: int, overlap: int) -> list[str]:
    tokens = _encoding.encode(text)
    if not tokens:
        return []

    step = max(1, chunk_size - overlap)
    pieces = []
    for start in range(0, len(tokens), step):
        chunk_tokens = tokens[start : start + chunk_size]
        if not chunk_tokens:
            break
        pieces.append(_encoding.decode(chunk_tokens))
        if start + chunk_size >= len(tokens):
            break
    return pieces


def _carry_overlap(buffer: list[str], overlap_tokens: int) -> tuple[list[str], int]:
    """Carry the tail end of `buffer` (≈ overlap_tokens) into the next chunk."""
    if overlap_tokens <= 0 or not buffer:
        return [], 0

    joined = "\n\n".join(buffer)
    tokens = _encoding.encode(joined)
    if len(tokens) <= overlap_tokens:
        return [joined], len(tokens)

    tail_tokens = tokens[-overlap_tokens:]
    tail_text = _encoding.decode(tail_tokens)
    return [tail_text], overlap_tokens


def _make_chunk(idx: int, buffer: list[str]) -> Chunk:
    content = "\n\n".join(buffer)
    return Chunk(index=idx, content=content, token_count=count_tokens(content))
