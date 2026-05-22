# FINANCIAL_MODULE: verify encryption and disclaimer presence
"""
Regulatory disclaimer for financial AI responses.
All AI-generated financial content MUST carry this disclaimer.
"""

from functools import wraps
from typing import Awaitable, Callable

DISCLAIMER = (
    "\n\n---\n"
    "⚠️  *JARVIS OS is not a licensed financial advisor. The information above "
    "is for analysis and visualization only and should not be construed as "
    "financial, investment, tax, or legal advice. Consult a qualified "
    "professional before making financial decisions.*"
)

DISCLAIMER_MARKER = "JARVIS OS is not a licensed financial advisor"


def append_disclaimer(text: str) -> str:
    """Idempotent: appends the disclaimer iff not already present."""
    if not text:
        return DISCLAIMER.strip()
    if DISCLAIMER_MARKER in text:
        return text
    return text + DISCLAIMER


def has_disclaimer(text: str) -> bool:
    return DISCLAIMER_MARKER in (text or "")


def with_disclaimer(func: Callable[..., Awaitable]):
    """Decorator: appends the disclaimer to the `content` field of an AgentResult."""

    @wraps(func)
    async def wrapper(*args, **kwargs):
        result = await func(*args, **kwargs)
        if result is not None and hasattr(result, "content") and isinstance(result.content, str):
            result.content = append_disclaimer(result.content)
        return result

    return wrapper
