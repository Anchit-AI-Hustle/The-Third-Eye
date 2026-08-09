"""
AI Model Router — selects the optimal model for a task type.
Routing rules are defined in ARCHITECTURE.md and enforced here.
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import StrEnum

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
    # Answers grounded in live Google Search results, with source citations.
    GROUNDED_SEARCH = "grounded_search"


class Provider(StrEnum):
    GOOGLE = "google"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    # Google AI agent capability: Gemini + the built-in google_search tool.
    # Distinct from GOOGLE because it uses the newer `google-genai` SDK and
    # returns grounding metadata, leaving the plain GOOGLE path untouched.
    GOOGLE_GROUNDED = "google_grounded"


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

# Registry key for the grounded route. The underlying Gemini model id comes
# from settings, so this key stays stable as models are refreshed.
GROUNDED_MODEL_KEY = "gemini-grounded"

MODELS: dict[str, ModelConfig] = {
    # Gemini 1.5 (flash, pro, flash-8b) was shut down on 2025-09-29 — calls to
    # those ids error out, so the flash/pro tiers point at 2.5.
    "gemini-2.5-flash": ModelConfig(
        Provider.GOOGLE, "gemini-2.5-flash",
        cost_per_1k_input=0.0003, cost_per_1k_output=0.0025,
    ),
    "gemini-2.5-pro": ModelConfig(
        Provider.GOOGLE, "gemini-2.5-pro",
        cost_per_1k_input=0.00125, cost_per_1k_output=0.010,
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
    # text-embedding-004 was shut down on 2026-01-14.
    "gemini-embedding-001": ModelConfig(
        Provider.GOOGLE, "gemini-embedding-001",
        cost_per_1k_input=0.00015, cost_per_1k_output=0.0,
        supports_streaming=False,
    ),
    "llama3": ModelConfig(
        Provider.OLLAMA, "llama3",
        cost_per_1k_input=0.0, cost_per_1k_output=0.0,
    ),
    # Model id is configurable so the grounded route can be pointed at a newer
    # Gemini without a code change. Token costs mirror the flash tier; note
    # that Google bills grounded requests for search usage on top of tokens,
    # so estimated_cost_usd is a floor for this route, not a total.
    GROUNDED_MODEL_KEY: ModelConfig(
        Provider.GOOGLE_GROUNDED, settings.google_grounded_model,
        cost_per_1k_input=0.0003, cost_per_1k_output=0.0025,
    ),
}

# ─── Routing table ──────────────────────────────────────────────────────────
# (primary, fallback) — "never use" is enforced by omission

ROUTING_TABLE: dict[TaskType, tuple[str, str]] = {
    TaskType.SIMPLE_CHAT: ("gemini-2.5-flash", "gpt-4o-mini"),
    TaskType.DOCUMENT_SUMMARIZATION: ("gemini-2.5-flash", "claude-haiku-4-5-20251001"),
    TaskType.COMPLEX_REASONING: ("gemini-2.5-pro", "gpt-4o"),
    TaskType.CODE_GENERATION: ("gpt-4o-mini", "gemini-2.5-flash"),
    TaskType.EMBEDDINGS: ("text-embedding-3-small", "gemini-embedding-001"),
    TaskType.FINANCIAL_ANALYSIS: ("gemini-2.5-pro", "gpt-4o"),
    TaskType.LOCAL_OFFLINE: ("llama3", "llama3"),
    # Fallback is the ungrounded flash model: it still answers, just without
    # live search or citations, which is the right degradation here.
    TaskType.GROUNDED_SEARCH: (GROUNDED_MODEL_KEY, "gemini-2.5-flash"),
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
    # Populated only by grounded routes: [{"title", "url", "domain"}, ...] and
    # the search queries Gemini actually issued. Empty for every other route.
    citations: list[dict[str, str]] = field(default_factory=list)
    search_queries: list[str] = field(default_factory=list)


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
                response_text, prompt_tokens, completion_tokens, extra = await self._dispatch(model, messages)
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
                    citations=extra.get("citations", []),
                    search_queries=extra.get("search_queries", []),
                )
                return response_text, entry

        raise RuntimeError("Unreachable")

    async def _dispatch(
        self, model: ModelConfig, messages: list[dict]
    ) -> tuple[str, int, int, dict]:
        """
        Routes the actual API call to the correct provider SDK.

        Returns (text, prompt_tokens, completion_tokens, extra) where `extra`
        carries provider-specific metadata — grounding citations today — and is
        empty for providers that have none.
        """
        if model.provider == Provider.GOOGLE:
            return await self._call_google(model, messages)
        if model.provider == Provider.GOOGLE_GROUNDED:
            return await self._call_google_grounded(model, messages)
        if model.provider == Provider.OPENAI:
            return await self._call_openai(model, messages)
        if model.provider == Provider.ANTHROPIC:
            return await self._call_anthropic(model, messages)
        if model.provider == Provider.OLLAMA:
            return await self._call_ollama(model, messages)
        raise NotImplementedError(f"Provider {model.provider} not implemented")

    async def _call_google(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int, dict]:
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
        return text, prompt_tokens, completion_tokens, {}

    async def _call_google_grounded(
        self, model: ModelConfig, messages: list[dict]
    ) -> tuple[str, int, int, dict]:
        """
        Google AI agent call: Gemini with the built-in google_search tool.

        Gemini decides whether to search, issues the queries itself, and
        returns grounding metadata naming the sources it used — so this needs
        no separate search API key, only GOOGLE_AI_API_KEY.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.google_ai_api_key)

        # Convert OpenAI-style messages to Gemini Content; system prompts move
        # to system_instruction, which has no role in the turn list.
        contents: list[types.Content] = []
        system_parts: list[str] = []
        for m in messages:
            role = m.get("role")
            if role == "system":
                system_parts.append(m["content"])
            elif role in ("user", "assistant"):
                contents.append(
                    types.Content(
                        role="user" if role == "user" else "model",
                        parts=[types.Part(text=m["content"])],
                    )
                )

        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            max_output_tokens=4096,
            system_instruction="\n\n".join(system_parts) or None,
        )

        response = await client.aio.models.generate_content(
            model=model.model_id,
            contents=contents,
            config=config,
        )

        # .text raises if the candidate carries no text part (e.g. blocked or
        # search-only turn); an empty answer is preferable to a 500 here.
        try:
            text = response.text or ""
        except Exception:
            text = ""

        usage = response.usage_metadata
        prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        completion_tokens = getattr(usage, "candidates_token_count", 0) or 0

        citations: list[dict[str, str]] = []
        search_queries: list[str] = []
        candidates = response.candidates or []
        if candidates:
            meta = candidates[0].grounding_metadata
            if meta:
                search_queries = list(meta.web_search_queries or [])
                seen: set[str] = set()
                for chunk in meta.grounding_chunks or []:
                    web = getattr(chunk, "web", None)
                    if not web or not web.uri or web.uri in seen:
                        continue
                    seen.add(web.uri)
                    citations.append({
                        "title": web.title or web.domain or web.uri,
                        "url": web.uri,
                        "domain": web.domain or "",
                    })

        log.info(
            "google_grounded_call",
            model=model.model_id,
            citation_count=len(citations),
            search_queries=search_queries,
        )
        return text, prompt_tokens, completion_tokens, {
            "citations": citations,
            "search_queries": search_queries,
        }

    async def _call_openai(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int, dict]:
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
        return text, prompt_tokens, completion_tokens, {}

    async def _call_anthropic(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int, dict]:
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
        return text, prompt_tokens, completion_tokens, {}

    async def _call_ollama(self, model: ModelConfig, messages: list[dict]) -> tuple[str, int, int, dict]:
        import httpx

        payload = {"model": model.model_id, "messages": messages, "stream": False}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()

        text = data.get("message", {}).get("content", "")
        prompt_tokens = data.get("prompt_eval_count", 0)
        completion_tokens = data.get("eval_count", 0)
        return text, prompt_tokens, completion_tokens, {}

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
