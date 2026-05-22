import pytest

from app.router.model_router import ModelRouter, TaskType, Provider


def test_model_selection_simple_chat():
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT)
    assert model.provider == Provider.GOOGLE
    assert "flash" in model.model_id.lower()


def test_model_selection_financial_analysis():
    router = ModelRouter()
    model = router.select_model(TaskType.FINANCIAL_ANALYSIS)
    # Financial analysis must never use Gemini Flash
    assert "flash" not in model.model_id.lower()
    assert model.provider in (Provider.GOOGLE, Provider.OPENAI)


def test_model_selection_privacy_mode():
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT, privacy_mode=True)
    assert model.provider == Provider.OLLAMA
    assert model.model_id == "llama3"


def test_model_selection_local_offline():
    router = ModelRouter()
    model = router.select_model(TaskType.LOCAL_OFFLINE)
    assert model.provider == Provider.OLLAMA


def test_model_selection_code_generation():
    router = ModelRouter()
    model = router.select_model(TaskType.CODE_GENERATION)
    assert model.provider == Provider.OPENAI
    assert "mini" in model.model_id.lower()


def test_all_task_types_have_route():
    router = ModelRouter()
    for task_type in TaskType:
        model = router.select_model(task_type)
        assert model is not None
        assert model.model_id


def test_model_has_cost_info():
    router = ModelRouter()
    model = router.select_model(TaskType.SIMPLE_CHAT)
    assert model.cost_per_1k_input >= 0
    assert model.cost_per_1k_output >= 0


def test_fallback_selection():
    router = ModelRouter()
    fallback = router._get_fallback(TaskType.SIMPLE_CHAT)
    assert fallback.provider == Provider.OPENAI
    assert fallback.model_id == "gpt-4o-mini"
