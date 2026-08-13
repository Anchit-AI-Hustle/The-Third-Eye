"""Finance module: encryption, disclaimer, category rules, detection, forecasting."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError
from types import SimpleNamespace

from app.finance import service as svc
from app.finance.disclaimer import (
    DISCLAIMER_MARKER,
    append_disclaimer,
    has_disclaimer,
    with_disclaimer,
)
from app.finance.encryption import (
    decrypt_decimal,
    decrypt_str,
    encrypt_decimal,
    encrypt_str,
)
from app.finance.models import Account, Budget, FinancialSnapshot, Subscription, Transaction
from app.finance.schemas import (
    AccountCreate,
    AccountResponse,
    BudgetCreate,
    BudgetResponse,
    CategorySpend,
    FinanceSummary,
    ForecastPoint,
    ForecastResponse,
    SubscriptionResponse,
    TransactionCreate,
    TransactionImportResponse,
)

NOW = datetime.now(timezone.utc)


# ─── Encryption ──────────────────────────────────────────────────────────────


def test_encrypt_str_round_trips():
    assert decrypt_str(encrypt_str("hello")) == "hello"


def test_encrypt_str_output_is_not_plaintext():
    token = encrypt_str("sensitive")
    assert "sensitive" not in token


def test_encrypt_str_is_non_deterministic():
    # Fernet embeds a random IV, so the same input must not produce the same
    # ciphertext — otherwise equal balances would be linkable in the database.
    assert encrypt_str("100.00") != encrypt_str("100.00")


def test_encrypt_str_passes_none_through():
    assert encrypt_str(None) is None


def test_decrypt_str_passes_none_through():
    assert decrypt_str(None) is None


def test_decrypt_str_returns_none_on_tampered_token():
    token = encrypt_str("100")
    tampered = ("A" if token[0] != "A" else "B") + token[1:]
    assert decrypt_str(tampered) is None


def test_decrypt_str_returns_none_on_garbage():
    assert decrypt_str("not-a-fernet-token") is None


@pytest.mark.parametrize("value", [Decimal("0"), Decimal("-12.34"), Decimal("999999.99"), 5, 2.5])
def test_encrypt_decimal_round_trips(value):
    assert decrypt_decimal(encrypt_decimal(value)) == Decimal(value)


def test_encrypt_decimal_passes_none_through():
    assert encrypt_decimal(None) is None
    assert decrypt_decimal(None) is None


def test_decrypt_decimal_returns_none_on_undecryptable_token():
    assert decrypt_decimal("not-a-fernet-token") is None


def test_decrypt_decimal_returns_none_when_plaintext_is_not_a_number():
    assert decrypt_decimal(encrypt_str("not-a-number")) is None


# ─── Disclaimer ──────────────────────────────────────────────────────────────


def test_append_disclaimer_adds_marker():
    assert has_disclaimer(append_disclaimer("Your net worth is $10."))


def test_append_disclaimer_is_idempotent():
    once = append_disclaimer("Spending is up.")
    assert append_disclaimer(once) == once


def test_append_disclaimer_on_empty_text_returns_bare_disclaimer():
    out = append_disclaimer("")
    assert DISCLAIMER_MARKER in out
    assert out == out.strip()


def test_has_disclaimer_is_false_for_plain_and_none():
    assert not has_disclaimer("just a number")
    assert not has_disclaimer(None)


class _Result:
    def __init__(self, content):
        self.content = content


@pytest.mark.asyncio
async def test_with_disclaimer_appends_to_agent_result():
    @with_disclaimer
    async def run():
        return _Result("You spent $40 on coffee.")

    assert has_disclaimer((await run()).content)


@pytest.mark.asyncio
async def test_with_disclaimer_tolerates_none_result():
    @with_disclaimer
    async def run():
        return None

    assert await run() is None


@pytest.mark.asyncio
async def test_with_disclaimer_ignores_result_without_string_content():
    @with_disclaimer
    async def run():
        return _Result(42)

    assert (await run()).content == 42


@pytest.mark.asyncio
async def test_with_disclaimer_preserves_function_name():
    @with_disclaimer
    async def analyze_spending():
        return _Result("x")

    assert analyze_spending.__name__ == "analyze_spending"


# ─── Category detection ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "description,expected",
    [
        ("STARBUCKS STORE 123", "food_drink"),
        ("WHOLE FOODS MKT", "groceries"),
        ("UBER TRIP", "transportation"),
        ("NETFLIX.COM", "subscriptions"),
        ("RENT PAYMENT", "housing"),
        ("COMCAST INTERNET", "utilities"),
        ("CVS PHARMACY", "healthcare"),
        ("TARGET T-1234", "shopping"),
        ("STEAM GAMES", "entertainment"),
        ("MARRIOTT HOTEL", "travel"),
        ("PAYROLL DEPOSIT", "income"),
        ("VENMO CASHOUT", "transfers"),
        ("ATM FEE", "fees"),
    ],
)
def test_detect_category_matches_known_merchants(description, expected):
    assert svc.detect_category(description) == expected


def test_detect_category_is_case_insensitive():
    assert svc.detect_category("netflix") == svc.detect_category("NETFLIX")


@pytest.mark.parametrize("value", [None, "", "ACME WIDGETS LLC"])
def test_detect_category_falls_back_to_uncategorized(value):
    assert svc.detect_category(value) == "uncategorized"


def test_detect_category_prefers_the_earlier_rule_on_overlap():
    # "uber eats" is food_drink and sits above transportation's "uber".
    assert svc.detect_category("UBER EATS ORDER") == "food_drink"


# ─── Description normalisation and interval maths ────────────────────────────


def test_normalize_description_strips_long_digit_runs_and_case():
    assert svc._normalize_description("NETFLIX 123456") == "netflix"


def test_normalize_description_keeps_short_digit_runs():
    assert "123" in svc._normalize_description("STORE 123")


def test_normalize_description_collapses_whitespace():
    assert svc._normalize_description("A   B\tC") == "a b c"


def test_normalize_description_handles_none_and_empty():
    assert svc._normalize_description(None) == ""
    assert svc._normalize_description("") == ""


def test_interval_consistency_is_zero_for_perfectly_regular_dates():
    dates = [NOW + timedelta(days=30 * i) for i in range(5)]
    assert svc._interval_consistency(dates) == pytest.approx(0.0, abs=1e-9)


def test_interval_consistency_bails_out_below_three_dates():
    assert svc._interval_consistency([NOW, NOW + timedelta(days=30)]) == 1.0


def test_interval_consistency_bails_out_when_dates_collapse_to_one_interval():
    same = [NOW, NOW, NOW, NOW + timedelta(days=30)]
    assert svc._interval_consistency(same) == 1.0


def test_interval_consistency_rises_with_irregularity():
    regular = [NOW + timedelta(days=30 * i) for i in range(5)]
    irregular = [NOW, NOW + timedelta(days=2), NOW + timedelta(days=40), NOW + timedelta(days=45)]
    assert svc._interval_consistency(irregular) > svc._interval_consistency(regular)


# ─── Persistence helpers ─────────────────────────────────────────────────────


async def _account(db, user, balance="1000"):
    return await svc.create_account(
        db,
        user_id=user.id,
        name="Checking",
        account_type="checking",
        institution="Test Bank",
        balance=Decimal(balance),
    )


async def _txn(db, user, account, amount, when, description="ACME", category=None):
    return await svc.create_transaction(
        db,
        user_id=user.id,
        account_id=account.id,
        amount=Decimal(amount),
        transaction_date=when,
        description=description,
        category=category,
    )


# ─── Accounts ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_account_encrypts_the_balance(db, test_user):
    account = await _account(db, test_user, "2500.50")
    assert "2500.50" not in (account.balance_encrypted or "")
    assert svc.account_balance(account) == Decimal("2500.50")


@pytest.mark.asyncio
async def test_create_account_allows_a_null_balance(db, test_user):
    account = await svc.create_account(
        db, user_id=test_user.id, name="Card", account_type="credit_card",
        institution=None, balance=None,
    )
    assert account.balance_encrypted is None
    assert svc.account_balance(account) == Decimal("0")


@pytest.mark.asyncio
async def test_list_accounts_scopes_to_the_owner(db, test_user):
    await _account(db, test_user)
    stranger = uuid.uuid4()
    assert await svc.list_accounts(db, user_id=stranger) == []
    assert len(await svc.list_accounts(db, user_id=test_user.id)) == 1


@pytest.mark.asyncio
async def test_list_accounts_hides_inactive_accounts(db, test_user):
    account = await _account(db, test_user)
    account.is_active = False
    await db.flush()
    assert await svc.list_accounts(db, user_id=test_user.id) == []


# ─── Transactions ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_transaction_encrypts_the_amount(db, test_user):
    account = await _account(db, test_user)
    txn = await _txn(db, test_user, account, "-42.75", NOW)
    assert "42.75" not in txn.amount_encrypted
    assert svc.transaction_amount(txn) == Decimal("-42.75")


@pytest.mark.asyncio
async def test_create_transaction_infers_category_when_omitted(db, test_user):
    account = await _account(db, test_user)
    txn = await _txn(db, test_user, account, "-5", NOW, description="STARBUCKS")
    assert txn.category == "food_drink"


@pytest.mark.asyncio
async def test_create_transaction_respects_an_explicit_category(db, test_user):
    account = await _account(db, test_user)
    txn = await _txn(db, test_user, account, "-5", NOW, description="STARBUCKS", category="custom")
    assert txn.category == "custom"


@pytest.mark.asyncio
async def test_list_transactions_filters_by_category_and_window(db, test_user):
    account = await _account(db, test_user)
    await _txn(db, test_user, account, "-5", NOW - timedelta(days=1), category="food_drink")
    await _txn(db, test_user, account, "-9", NOW - timedelta(days=40), category="travel")

    assert len(await svc.list_transactions(db, user_id=test_user.id, category="food_drink")) == 1
    recent = await svc.list_transactions(db, user_id=test_user.id, start=NOW - timedelta(days=7))
    assert len(recent) == 1
    old = await svc.list_transactions(db, user_id=test_user.id, end=NOW - timedelta(days=30))
    assert len(old) == 1


@pytest.mark.asyncio
async def test_list_transactions_paginates_newest_first(db, test_user):
    account = await _account(db, test_user)
    for i in range(5):
        await _txn(db, test_user, account, "-1", NOW - timedelta(days=i), description=f"TXN {i}")

    page = await svc.list_transactions(db, user_id=test_user.id, limit=2)
    assert len(page) == 2
    assert page[0].transaction_date >= page[1].transaction_date

    second = await svc.list_transactions(db, user_id=test_user.id, limit=2, offset=2)
    assert {t.id for t in page}.isdisjoint({t.id for t in second})


def test_transaction_amount_defaults_to_zero_when_undecryptable():
    assert svc.transaction_amount(Transaction(amount_encrypted="garbage")) == Decimal("0")


# ─── Recurring detection ─────────────────────────────────────────────────────


def _fake_txn(description, amount, when):
    return Transaction(
        amount_encrypted=encrypt_decimal(Decimal(amount)) or "",
        description=description,
        transaction_date=when,
    )


def test_detect_recurring_groups_finds_a_steady_monthly_charge():
    txns = [_fake_txn("NETFLIX", "15.99", NOW - timedelta(days=30 * i)) for i in range(4)]
    groups = svc.detect_recurring_groups(txns)
    assert [g.key for g in groups] == ["netflix"]


def test_detect_recurring_groups_needs_at_least_three_hits():
    txns = [_fake_txn("NETFLIX", "15.99", NOW - timedelta(days=30 * i)) for i in range(2)]
    assert svc.detect_recurring_groups(txns) == []


def test_detect_recurring_groups_rejects_irregular_timing():
    days = [0, 1, 2, 90]
    txns = [_fake_txn("SHOP", "15.99", NOW - timedelta(days=d)) for d in days]
    assert svc.detect_recurring_groups(txns) == []


def test_detect_recurring_groups_rejects_a_wildly_varying_amount():
    amounts = ["10", "50", "200", "3"]
    txns = [
        _fake_txn("SHOP", a, NOW - timedelta(days=30 * i)) for i, a in enumerate(amounts)
    ]
    assert svc.detect_recurring_groups(txns) == []


def test_detect_recurring_groups_ignores_blank_descriptions():
    txns = [_fake_txn(None, "15.99", NOW - timedelta(days=30 * i)) for i in range(4)]
    assert svc.detect_recurring_groups(txns) == []


def test_detect_recurring_groups_skips_groups_without_positive_amounts():
    txns = [_fake_txn("REFUND", "0", NOW - timedelta(days=30 * i)) for i in range(4)]
    assert svc.detect_recurring_groups(txns) == []


@pytest.mark.asyncio
async def test_detect_and_persist_subscriptions_saves_and_flags(db, test_user):
    account = await _account(db, test_user)
    for i in range(4):
        await _txn(db, test_user, account, "15.99", NOW - timedelta(days=30 * i), description="NETFLIX")

    saved = await svc.detect_and_persist_subscriptions(db, user_id=test_user.id)
    assert len(saved) == 1
    assert saved[0].billing_period == "monthly"
    assert svc.subscription_amount(saved[0]) == Decimal("15.99")

    txns = await svc.list_transactions(db, user_id=test_user.id)
    assert all(t.is_recurring for t in txns)


@pytest.mark.asyncio
async def test_detect_and_persist_subscriptions_labels_a_weekly_cadence(db, test_user):
    account = await _account(db, test_user)
    for i in range(5):
        await _txn(db, test_user, account, "9.00", NOW - timedelta(days=7 * i), description="GYM")

    saved = await svc.detect_and_persist_subscriptions(db, user_id=test_user.id)
    assert saved[0].billing_period == "weekly"


@pytest.mark.asyncio
async def test_detect_and_persist_subscriptions_labels_a_quarterly_cadence(db, test_user):
    account = await _account(db, test_user)
    # Three charges 85 days apart: the minimum the detector accepts, and the most
    # that still fits inside its 180-day scan window.
    for i in range(3):
        await _txn(db, test_user, account, "50.00", NOW - timedelta(days=85 * i), description="INSURANCE")

    saved = await svc.detect_and_persist_subscriptions(db, user_id=test_user.id)
    assert saved[0].billing_period == "quarterly"


@pytest.mark.asyncio
async def test_detect_and_persist_subscriptions_ignores_transactions_past_the_scan_window(db, test_user):
    account = await _account(db, test_user)
    start = svc.SCAN_WINDOW_DAYS + 20
    for i in range(4):
        await _txn(db, test_user, account, "15.99", NOW - timedelta(days=start + 30 * i), description="OLD")

    assert await svc.detect_and_persist_subscriptions(db, user_id=test_user.id) == []


@pytest.mark.asyncio
async def test_detect_and_persist_subscriptions_labels_an_annual_cadence(db, test_user):
    account = await _account(db, test_user)
    # Only reachable because the scan window spans two annual cycles.
    for i in range(3):
        await _txn(db, test_user, account, "99.00", NOW - timedelta(days=365 * i), description="DOMAIN RENEWAL")

    saved = await svc.detect_and_persist_subscriptions(db, user_id=test_user.id)
    assert saved[0].billing_period == "annual"


@pytest.mark.asyncio
async def test_list_subscriptions_hides_inactive(db, test_user):
    account = await _account(db, test_user)
    for i in range(4):
        await _txn(db, test_user, account, "15.99", NOW - timedelta(days=30 * i), description="NETFLIX")
    saved = await svc.detect_and_persist_subscriptions(db, user_id=test_user.id)

    assert len(await svc.list_subscriptions(db, user_id=test_user.id)) == 1
    saved[0].is_active = False
    await db.flush()
    assert await svc.list_subscriptions(db, user_id=test_user.id) == []


def test_subscription_amount_defaults_to_zero_when_undecryptable():
    assert svc.subscription_amount(Subscription(amount_encrypted="garbage")) == Decimal("0")


# ─── Summary ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_compute_summary_splits_income_from_expenses(db, test_user):
    account = await _account(db, test_user, "1000")
    await _txn(db, test_user, account, "3000", NOW - timedelta(days=2), category="income")
    await _txn(db, test_user, account, "-200", NOW - timedelta(days=1), category="groceries")
    await _txn(db, test_user, account, "-100", NOW - timedelta(days=1), category="travel")

    summary = await svc.compute_summary(db, user_id=test_user.id)
    assert summary["total_income"] == Decimal("3000")
    assert summary["total_expenses"] == Decimal("300")
    assert summary["cash_flow"] == Decimal("2700")
    assert summary["net_worth"] == Decimal("1000")
    assert summary["transaction_count"] == 3


@pytest.mark.asyncio
async def test_compute_summary_ranks_categories_by_spend(db, test_user):
    account = await _account(db, test_user)
    await _txn(db, test_user, account, "-50", NOW - timedelta(days=1), category="groceries")
    await _txn(db, test_user, account, "-150", NOW - timedelta(days=1), category="travel")

    rows = (await svc.compute_summary(db, user_id=test_user.id))["spending_by_category"]
    assert [r["category"] for r in rows] == ["travel", "groceries"]
    assert rows[0]["percent_of_total"] == pytest.approx(75.0)


@pytest.mark.asyncio
async def test_compute_summary_handles_a_user_with_no_activity(db, test_user):
    summary = await svc.compute_summary(db, user_id=test_user.id)
    assert summary["total_expenses"] == Decimal("0")
    assert summary["spending_by_category"] == []
    assert summary["transaction_count"] == 0


@pytest.mark.asyncio
async def test_compute_summary_honours_an_explicit_window(db, test_user):
    account = await _account(db, test_user)
    await _txn(db, test_user, account, "-10", NOW - timedelta(days=100))

    summary = await svc.compute_summary(
        db, user_id=test_user.id, start=NOW - timedelta(days=365), end=NOW
    )
    assert summary["transaction_count"] == 1


@pytest.mark.asyncio
async def test_compute_summary_buckets_uncategorised_spend(db, test_user):
    account = await _account(db, test_user)
    txn = await _txn(db, test_user, account, "-10", NOW - timedelta(days=1))
    txn.category = None
    await db.flush()

    rows = (await svc.compute_summary(db, user_id=test_user.id))["spending_by_category"]
    assert rows[0]["category"] == "uncategorized"


# ─── Forecast ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_forecast_projects_a_timeline_of_the_requested_length(db, test_user):
    account = await _account(db, test_user, "500")
    await _txn(db, test_user, account, "-90", NOW - timedelta(days=1))

    out = await svc.forecast(db, user_id=test_user.id, period_days=30)
    assert len(out["timeline"]) == 30
    assert out["starting_balance"] == Decimal("500")
    assert out["ending_balance"] == out["timeline"][-1]["projected_balance"]


@pytest.mark.asyncio
async def test_forecast_with_no_history_holds_the_balance_flat(db, test_user):
    await _account(db, test_user, "500")
    out = await svc.forecast(db, user_id=test_user.id, period_days=10)
    assert out["ending_balance"] == Decimal("500")
    assert out["confidence"] == "low"


@pytest.mark.asyncio
async def test_forecast_of_zero_days_returns_the_starting_balance(db, test_user):
    await _account(db, test_user, "500")
    out = await svc.forecast(db, user_id=test_user.id, period_days=0)
    assert out["timeline"] == []
    assert out["ending_balance"] == Decimal("500")


@pytest.mark.asyncio
async def test_forecast_confidence_rises_with_history(db, test_user):
    account = await _account(db, test_user)
    for i in range(61):
        await _txn(db, test_user, account, "-1", NOW - timedelta(days=i % 89), description=f"T{i}")

    assert (await svc.forecast(db, user_id=test_user.id, period_days=30))["confidence"] == "high"
    assert (await svc.forecast(db, user_id=test_user.id, period_days=90))["confidence"] == "medium"
    assert (await svc.forecast(db, user_id=test_user.id, period_days=200))["confidence"] == "low"


@pytest.mark.asyncio
async def test_forecast_medium_confidence_band(db, test_user):
    account = await _account(db, test_user)
    for i in range(31):
        await _txn(db, test_user, account, "-1", NOW - timedelta(days=i % 89), description=f"T{i}")

    assert (await svc.forecast(db, user_id=test_user.id, period_days=60))["confidence"] == "medium"


# ─── Budgets ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_budget_encrypts_the_amount(db, test_user):
    budget = await svc.create_budget(db, user_id=test_user.id, category="groceries", amount=Decimal("400"))
    assert "400" not in budget.amount_encrypted
    assert svc.budget_amount(budget) == Decimal("400")


def test_budget_amount_defaults_to_zero_when_undecryptable():
    assert svc.budget_amount(Budget(amount_encrypted="garbage")) == Decimal("0")


@pytest.mark.asyncio
async def test_list_budgets_with_actuals_counts_only_spend_in_category(db, test_user):
    account = await _account(db, test_user)
    await svc.create_budget(db, user_id=test_user.id, category="groceries", amount=Decimal("400"))
    await _txn(db, test_user, account, "-100", NOW - timedelta(days=1), category="groceries")
    await _txn(db, test_user, account, "-999", NOW - timedelta(days=1), category="travel")
    await _txn(db, test_user, account, "50", NOW - timedelta(days=1), category="groceries")

    row = (await svc.list_budgets_with_actuals(db, user_id=test_user.id))[0]
    assert row["actual_spent"] == Decimal("100")
    assert row["remaining"] == Decimal("300")
    assert row["percent_used"] == pytest.approx(25.0)


@pytest.mark.asyncio
async def test_list_budgets_with_actuals_excludes_spend_before_the_period(db, test_user):
    account = await _account(db, test_user)
    await svc.create_budget(db, user_id=test_user.id, category="groceries", amount=Decimal("400"), period="weekly")
    await _txn(db, test_user, account, "-100", NOW - timedelta(days=30), category="groceries")

    row = (await svc.list_budgets_with_actuals(db, user_id=test_user.id))[0]
    assert row["actual_spent"] == Decimal("0")


@pytest.mark.asyncio
@pytest.mark.parametrize("period", ["weekly", "monthly", "quarterly", "annual", "fortnightly"])
async def test_list_budgets_with_actuals_accepts_every_period(db, test_user, period):
    await svc.create_budget(db, user_id=test_user.id, category="x", amount=Decimal("10"), period=period)
    rows = await svc.list_budgets_with_actuals(db, user_id=test_user.id)
    assert rows[0]["period"] == period


@pytest.mark.asyncio
async def test_list_budgets_with_actuals_avoids_dividing_by_a_zero_budget(db, test_user):
    await svc.create_budget(db, user_id=test_user.id, category="x", amount=Decimal("0"))
    row = (await svc.list_budgets_with_actuals(db, user_id=test_user.id))[0]
    assert row["percent_used"] == 0.0


# ─── Models ──────────────────────────────────────────────────────────────────


def test_finance_tables_are_named_as_expected():
    assert Account.__tablename__ == "accounts"
    assert Transaction.__tablename__ == "transactions"
    assert Budget.__tablename__ == "budgets"
    assert Subscription.__tablename__ == "subscriptions"
    assert FinancialSnapshot.__tablename__ == "financial_snapshots"


@pytest.mark.asyncio
async def test_financial_snapshot_stores_only_encrypted_totals(db, test_user):
    snap = FinancialSnapshot(
        user_id=test_user.id,
        snapshot_date=NOW,
        net_worth_encrypted=encrypt_decimal(Decimal("1234.56")),
        total_assets_encrypted=encrypt_decimal(Decimal("2000")),
        total_liabilities_encrypted=encrypt_decimal(Decimal("765.44")),
    )
    db.add(snap)
    await db.flush()
    await db.refresh(snap)

    assert "1234.56" not in snap.net_worth_encrypted
    assert decrypt_decimal(snap.net_worth_encrypted) == Decimal("1234.56")


# ─── Schemas ─────────────────────────────────────────────────────────────────


def test_account_create_rejects_an_unknown_account_type():
    with pytest.raises(ValidationError):
        AccountCreate(name="X", account_type="crypto_wallet")


def test_account_create_rejects_a_blank_name():
    with pytest.raises(ValidationError):
        AccountCreate(name="", account_type="checking")


def test_account_create_defaults_currency_and_optional_fields():
    account = AccountCreate(name="Checking", account_type="checking")
    assert account.currency == "USD"
    assert account.institution is None and account.balance is None


def test_account_response_reads_from_orm_attributes():
    account = Account(
        id=uuid.uuid4(), user_id=uuid.uuid4(), name="Checking", account_type="checking",
        institution=None, currency="USD", is_active=True,
    )
    account.created_at = NOW
    payload = AccountResponse.model_validate({**account.__dict__, "balance": Decimal("10")})
    assert payload.name == "Checking"


def test_transaction_create_requires_an_amount_and_date():
    with pytest.raises(ValidationError):
        TransactionCreate(account_id=uuid.uuid4())


def test_transaction_create_keeps_decimal_precision():
    txn = TransactionCreate(
        account_id=uuid.uuid4(), amount=Decimal("-12.345"), transaction_date=NOW
    )
    assert txn.amount == Decimal("-12.345")


def test_transaction_import_response_counts_each_outcome():
    out = TransactionImportResponse(
        inserted=3, skipped_duplicates=1, failed=0, categories_assigned={"food_drink": 2}
    )
    assert out.categories_assigned["food_drink"] == 2


def test_budget_create_rejects_an_unknown_period():
    with pytest.raises(ValidationError):
        BudgetCreate(category="groceries", amount=Decimal("100"), period="daily")


def test_budget_create_defaults_to_monthly():
    assert BudgetCreate(category="groceries", amount=Decimal("100")).period == "monthly"


def test_budget_response_carries_the_computed_actuals():
    row = BudgetResponse(
        id=uuid.uuid4(), category="groceries", amount=Decimal("400"), period="monthly",
        actual_spent=Decimal("100"), remaining=Decimal("300"), percent_used=25.0,
    )
    assert row.remaining == Decimal("300")


def test_subscription_response_allows_an_unknown_next_billing_date():
    sub = SubscriptionResponse(
        id=uuid.uuid4(), name="Netflix", amount=Decimal("15.99"),
        billing_period="monthly", next_billing_date=None, is_active=True,
    )
    assert sub.next_billing_date is None


def test_finance_summary_nests_category_spend():
    summary = FinanceSummary(
        net_worth=Decimal("1000"), total_income=Decimal("10"), total_expenses=Decimal("4"),
        cash_flow=Decimal("6"), period_start=NOW, period_end=NOW, transaction_count=2,
        spending_by_category=[
            CategorySpend(category="groceries", amount=Decimal("4"), percent_of_total=100.0)
        ],
    )
    assert summary.spending_by_category[0].category == "groceries"


def test_forecast_response_rejects_an_unknown_confidence():
    with pytest.raises(ValidationError):
        ForecastResponse(
            period_days=1, starting_balance=Decimal("0"), ending_balance=Decimal("0"),
            total_projected_income=Decimal("0"), total_projected_expenses=Decimal("0"),
            timeline=[], confidence="certain",
        )


def test_forecast_response_accepts_a_projected_timeline():
    out = ForecastResponse(
        period_days=1, starting_balance=Decimal("0"), ending_balance=Decimal("1"),
        total_projected_income=Decimal("1"), total_projected_expenses=Decimal("0"),
        timeline=[
            ForecastPoint(
                date=NOW, projected_balance=Decimal("1"),
                projected_income=Decimal("1"), projected_expenses=Decimal("0"),
            )
        ],
        confidence="high",
    )
    assert out.timeline[0].projected_balance == Decimal("1")


# ─── Encryption key validation ───────────────────────────────────────────────


def test_fernet_rejects_a_key_that_is_not_valid_fernet(monkeypatch):
    from app.finance import encryption

    encryption._fernet.cache_clear()
    monkeypatch.setattr(
        encryption, "get_settings",
        lambda: SimpleNamespace(financial_encryption_key="not-a-fernet-key"),
    )
    try:
        with pytest.raises(RuntimeError, match="not a valid Fernet key"):
            encryption._fernet()
    finally:
        encryption._fernet.cache_clear()
