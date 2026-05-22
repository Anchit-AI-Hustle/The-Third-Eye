"""
AI Model Router — selects the optimal model for a task type.
Routing rules are defined in ARCHITECTURE.md and enforced here.
"""

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import structlog
from tenacity import (
    AsyncRetrying,
    RetryError,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()


class TaskType(StrEnum):
    SIMPLE_CHAT = "simple_chat"
    DOCUMENT_SUMMARIZATION = "document_summarization"
    COMPLEX_REASONING = "complex_reasoning"
    CODE_GENERATION = "code_generation"
    EMBEDDINGS = "embeddings"
    FINANCIAL_ANALYSIS = "financial_analysis"
    LOCAL_OFFLINE = "local_offline"


class Provider(StrEnum):
    GOOGLE = "google"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


@dataclass
class ModelConfig:
    provider: Provider
    model_id: str
    # Approximate cost per 1k input tokens in USD
    cost_per_1k_input: float = 0.0
    # Approximate cost per 1k output tokens in USD
    cost_per_1k_output: float = 0.0
    max_context_tokens: int = 128_000
    supports_streaming: bool = True


# ─── Model registry ─────────────────────────────────────────────────────────

MODELS: dict[str, ModelConfig] = {
    "gemini-1.5-flash": ModelConfig(
        Provider.GOOGLE, "gemini-1.5-flash",
        cost_per_1k_input=0.000075, cost_per_1k_output=0.0003,
    ),
    "gemini-1.5-pro": ModelConfig(
        Provider.GOOGLE, "gemini-1.5-pro",
        cost_per_1k_input=0.00125, cost_per_1k_output=0.005,
    ),
    "gpt-4o-mini": ModelConfig(
        Provider.OPENAI, "gpt-4o-mini",
        cost_per_1k_input=0.00015, cost_per_1k_output=0.0006,
    ),
    "gpt-4o": ModelConfig(
        Provider.OPENAI, "gpt-4o",
        cost_per_1k_input=0.005, cost_per_1k_output=0.015,
    ),
    "claude-haiku-4-5-20251001": ModelConfig(
        Provider.ANTHROPIC, "claude-haiku-4-5-20251001",
        cost_per_1k_input=0.00025, cost_per_1k_output=0.00125,
    ),
    "text-embedding-3-small": ModelConfig(
        Provider.OPENAI, "text-embedding-3-small",
        cost_per_1k_input=0.00002, cost_per_1k_output=0.0,
        supports_streaming=False,
    ),
    "text-embedding-004": ModelConfig(
        Provider.GOOGLE, "text-embedding-004",
        cost_per_1k_input=0.00001, cost_per_1k_output=0.0,
        supports_streaming=False,
    ),
    "llama3": ModelConfig(
        Provider.OLLAMA, "llama3",
        cost_per_1k_input=0.0, cost_per_1k_output=0.0,
    ),
}

# ─── Routing table ──────────────────────────────────────────────────────────
# (primary, fallback) — "never use" is enforced by omission

ROUTING_TABLE: dict[TaskType, tuple[str, str]] = {
    TaskType.SIMPLE_CHAT: ("gemini-1.5-flash", "gpt-4o-mini"),
    TaskType.DOCUMENT_SUMMARIZATION: ("gemini-1.5-flash", "claude-haiku-4-5-20251001"),
    TaskType.COMPLEX_REASONING: ("gemini-1.5-pro", "gpt-4o"),
    TaskType.CODE_GENERATION: ("gpt-4o-mini", "gemini-1.5-flash"),
    TaskType.EMBEDDINGS: ("text-embedding-3-small", "text-embedding-004"),
    TaskType.FINANCIAL_ANALYSIS: ("gemini-1.5-pro", "gpt-4o"),
    TaskType.LOCAL_OFFLINE: ("llama3", "llama3"),
}


@dataclass
class RouterLogEntry:
    task_type: str
    model_used: str
    provider: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    estimated_cost_usd: float
    attempts: int
    user_id: str | None = None


class ModelRouter:
    """
    Selects the optimal AI model for a given task.
    Implements retry with exponential backoff and automatic failover.
    """

    def select_model(
        self,
        task_type: TaskType,
        *,
        context_tokens: int = 0,
        privacy_mode: bool = False,
        force_local: bool = False,
    ) -> ModelConfig:
        if privacy_mode or force_local:
            return MODELS["llama3"]

        primary_key, _ = ROUTING_TABLE[task_type]
        return MODELS[primary_key]

    def _get_fallback(self, task_type: TaskType) -> ModelConfig:
        _, fallback_key = ROUTING_TABLE[task_type]
        return MODELS[fallback_key]

    async def complete(
        self,
        *,
        task_type: TaskType,
        messages: list[dict],
        user_id: str | None = None,
        context_tokens: int = 0,
        privacy_mode: bool = False,
        stream: bool = False,
    ) -> tuple[str, RouterLogEntry]:
        """
        Calls the AI provider and returns (response_text, log_entry).
        Retries primary model up to 3 times, then fails over to fallback.
        """
        primary = self.select_model(task_type, context_tokens=context_tokens, privacy_mode=privacy_mode)
        fallback = self._get_fallback(task_type)

        for model in [primary, fallback]:
            try:
                response_text, log_entry = await self._call_with_retry(
                    model=model,
                    messages=messages,
                    task_type=task_type,
                    user_id=user_id,
                )
                log.info(
                    "model_router_success",
                    model=model.model_id,
                    latency_ms=log_entry.latency_ms,
                    cost=log_entry.estimated_cost_usd,
                )
                return response_text, log_entry
            except RetryError:
                log.warning("model_router_failover", from_model=model.model_id, to_model=fallback.model_id)
                if model == fallback:
                    raise

        raise RuntimeError("All model providers exhausted")

    async def _call_with_retry(
        self,
        *,
        model: ModelConfig,
        messages: list[dict],
        task_type: TaskType,
        user_id: str | None,
    ) -> tuple[str, RouterLogEntry]:
        attempts = 0

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            reraise=True,
        ):
            with attempt:
                attempts += 1
                t0 = time.monotonic()
                response_text, prompt_tokens, completion_tokens = await self._dispatch(model, messages)
                latency_ms = int((time.monotonic() - t0) * 1000)

                cost = (
                    prompt_tokens / 1000 * model.cost_per_1k_input
                    + completion_tokens / 1000 * model.cost_per_1k_output
                )

                entry = RouterLogEntry(
                    task_type=str(task_type),
                    model_used=model.model_id,
                    provider=str(model.provider),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    latency_ms=latency_ms,
                    estimated_cost_usd=cost,
                    attempts=attempts,
                    user_id=user_id,
                )
                return response_text, entry

        raise RuntimeError("Unreachable")

    async def _dispatch(
        self, model: ModelConfig, messages: list[dict]
    ) -> tuple[str, int, int]:
        """Routes the actual API call to the correct provider SDK."""
        if model.provider == Provider.GOOGLE:
            return await self._call_google(model, messages)
        if model.provider == Provider.OPENAI:
            return await self._call_openai(model, messages)
        if model.provider == Provider.ANTHROPIC:
            return await self._call_anthropic(model, messages)
        if model.provider == Provider.OLLAMA:
            return await self._call_ollama(model, messages)
        raise NotImplementedError(f"Provider {model.provider} not implemented")

    async def _call_google(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int]:
        import google.generativeai as genai

        genai.configure(api_key=settings.google_ai_api_key)
        genai_model = genai.GenerativeModel(model.model_id)

        # Convert OpenAI-style messages to Gemini format
        gemini_messages = []
        system_parts = []
        for m in messages:
            if m["role"] == "system":
                system_parts.append(m["content"])
            elif m["role"] == "user":
                gemini_messages.append({"role": "user", "parts": [m["content"]]})
            elif m["role"] == "assistant":
                gemini_messages.append({"role": "model", "parts": [m["content"]]})

        response = await asyncio.to_thread(
            genai_model.generate_content,
            gemini_messages,
            generation_config={"max_output_tokens": 4096},
        )
        text = response.text
        # Gemini usage metadata
        usage = response.usage_metadata
        prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
        return text, prompt_tokens, completion_tokens

    async def _call_openai(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model=model.model_id,
            messages=messages,
            max_tokens=4096,
        )
        text = response.choices[0].message.content or ""
        prompt_tokens = response.usage.prompt_tokens if response.usage else 0
        completion_tokens = response.usage.completion_tokens if response.usage else 0
        return text, prompt_tokens, completion_tokens

    async def _call_anthropic(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int]:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        non_system = [m for m in messages if m["role"] != "system"]

        response = await client.messages.create(
            model=model.model_id,
            max_tokens=4096,
            system=system,
            messages=non_system,
        )
        text = response.content[0].text if response.content else ""
        prompt_tokens = response.usage.input_tokens
        completion_tokens = response.usage.output_tokens
        return text, prompt_tokens, completion_tokens

    async def _call_ollama(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int]:
        import httpx

        payload = {"model": model.model_id, "messages": messages, "stream": False}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()

        text = data.get("message", {}).get("content", "")
        prompt_tokens = data.get("prompt_eval_count", 0)
        completion_tokens = data.get("eval_count", 0)
        return text, prompt_tokens, completion_tokens

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Batch embedding generation using text-embedding-3-small."""
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]


# Singleton
model_router = ModelRouter()
