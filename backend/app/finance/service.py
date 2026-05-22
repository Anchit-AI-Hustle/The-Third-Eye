# FINANCIAL_MODULE: verify encryption and disclaimer presence
"""
Financial service layer: CRUD, category detection, subscription detection, forecasting.
"""

import re
import statistics
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.finance.encryption import decrypt_decimal, encrypt_decimal
from app.finance.models import (
    Account,
    Budget,
    FinancialSnapshot,
    Subscription,
    Transaction,
)

log = structlog.get_logger()


# ─── Category detection (rule-based) ──────────────────────────────────────────

CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("food_drink", ["starbucks", "coffee", "cafe", "restaurant", "doordash", "grubhub", "uber eats", "chipotle", "mcdonald", "dominos"]),
    ("groceries", ["whole foods", "trader joe", "safeway", "costco", "kroger", "wegmans", "publix", "walmart"]),
    ("transportation", ["uber", "lyft", "taxi", "metro", "transit", "shell", "chevron", "exxon", "parking"]),
    ("subscriptions", ["netflix", "spotify", "hulu", "disney", "youtube premium", "apple.com/bill", "amazon prime", "icloud", "dropbox", "github"]),
    ("housing", ["rent", "mortgage", "landlord", "property mgmt"]),
    ("utilities", ["electric", "gas company", "water", "sewer", "internet", "comcast", "xfinity", "verizon", "att", "t-mobile"]),
    ("healthcare", ["pharmacy", "cvs", "walgreens", "doctor", "dental", "medical", "hospital"]),
    ("shopping", ["amazon", "ebay", "target", "best buy", "macy", "nordstrom", "etsy"]),
    ("entertainment", ["movie", "cinema", "concert", "ticketmaster", "steam", "playstation", "xbox"]),
    ("travel", ["airline", "hotel", "airbnb", "marriott", "hilton", "delta", "united", "southwest"]),
    ("income", ["payroll", "salary", "direct dep", "wages", "paycheck"]),
    ("transfers", ["transfer", "venmo", "zelle", "cash app", "paypal"]),
    ("fees", ["fee", "interest charge", "atm fee", "overdraft"]),
]


def detect_category(description: str | None) -> str:
    if not description:
        return "uncategorized"
    text = description.lower()
    for category, keywords in CATEGORY_RULES:
        if any(k in text for k in keywords):
            return category
    return "uncategorized"


# ─── Account CRUD ────────────────────────────────────────────────────────────

async def create_account(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    name: str,
    account_type: str,
    institution: str | None,
    balance: Decimal | None,
    currency: str = "USD",
) -> Account:
    account = Account(
        user_id=user_id,
        name=name,
        account_type=account_type,
        institution=institution,
        balance_encrypted=encrypt_decimal(balance) if balance is not None else None,
        currency=currency,
    )
    db.add(account)
    await db.flush()
    await db.refresh(account)
    return account


async def list_accounts(db: AsyncSession, *, user_id: uuid.UUID) -> list[Account]:
    result = await db.execute(
        select(Account).where(Account.user_id == user_id, Account.is_active == True).order_by(Account.created_at)
    )
    return list(result.scalars().all())


def account_balance(account: Account) -> Decimal:
    return decrypt_decimal(account.balance_encrypted) or Decimal("0")


# ─── Transaction CRUD ────────────────────────────────────────────────────────

async def create_transaction(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    amount: Decimal,
    transaction_date: datetime,
    description: str | None = None,
    category: str | None = None,
    currency: str = "USD",
) -> Transaction:
    if category is None:
        category = detect_category(description)
    txn = Transaction(
        user_id=user_id,
        account_id=account_id,
        amount_encrypted=encrypt_decimal(amount) or "",
        currency=currency,
        description=description,
        category=category,
        transaction_date=transaction_date,
    )
    db.add(txn)
    await db.flush()
    await db.refresh(txn)
    return txn


async def list_transactions(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
    category: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[Transaction]:
    query = select(Transaction).where(Transaction.user_id == user_id)
    if category:
        query = query.where(Transaction.category == category)
    if start:
        query = query.where(Transaction.transaction_date >= start)
    if end:
        query = query.where(Transaction.transaction_date <= end)
    query = query.order_by(Transaction.transaction_date.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


def transaction_amount(txn: Transaction) -> Decimal:
    return decrypt_decimal(txn.amount_encrypted) or Decimal("0")


# ─── Subscription detection ──────────────────────────────────────────────────

@dataclass(frozen=True)
class _Group:
    key: str
    transactions: list[Transaction]


def _normalize_description(desc: str | None) -> str:
    if not desc:
        return ""
    # Strip common transient bits: dates, transaction IDs, trailing whitespace
    text = re.sub(r"\d{4,}", "", desc.lower())
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _interval_consistency(dates: list[datetime]) -> float:
    """Returns the coefficient of variation of intervals between consecutive dates.
    Lower = more consistent."""
    if len(dates) < 3:
        return 1.0
    sorted_dates = sorted(dates)
    intervals = [
        (sorted_dates[i + 1] - sorted_dates[i]).days for i in range(len(sorted_dates) - 1)
    ]
    intervals = [i for i in intervals if i > 0]
    if len(intervals) < 2:
        return 1.0
    mean = statistics.mean(intervals)
    if mean == 0:
        return 1.0
    stdev = statistics.stdev(intervals)
    return stdev / mean


def detect_recurring_groups(transactions: list[Transaction]) -> list[_Group]:
    """Groups transactions by normalized description and filters to likely recurring."""
    grouped: dict[str, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        key = _normalize_description(txn.description)
        if key:
            grouped[key].append(txn)

    recurring: list[_Group] = []
    for key, txns in grouped.items():
        if len(txns) < 3:
            continue

        dates = [t.transaction_date for t in txns]
        cv = _interval_consistency(dates)
        if cv > 0.4:  # too irregular
            continue

        amounts = [transaction_amount(t) for t in txns]
        amounts = [a for a in amounts if a > 0]
        if len(amounts) < 2:
            continue
        mean_amt = statistics.mean(amounts)
        if mean_amt == 0:
            continue
        amt_cv = statistics.stdev(amounts) / mean_amt if len(amounts) > 1 else 0
        if amt_cv > 0.15:  # amount varies too much
            continue

        recurring.append(_Group(key=key, transactions=txns))

    return recurring


async def detect_and_persist_subscriptions(
    db: AsyncSession, *, user_id: uuid.UUID
) -> list[Subscription]:
    """Scan recent transactions and persist detected recurring subscriptions."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=180)
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.transaction_date >= cutoff,
        )
    )
    txns = list(result.scalars().all())
    groups = detect_recurring_groups(txns)

    saved: list[Subscription] = []
    for group in groups:
        amounts = [transaction_amount(t) for t in group.transactions]
        median_amount = statistics.median(amounts)
        dates = sorted([t.transaction_date for t in group.transactions])
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        mean_interval = statistics.mean(intervals) if intervals else 30

        billing_period = "monthly"
        if 6 <= mean_interval <= 8:
            billing_period = "weekly"
        elif 25 <= mean_interval <= 35:
            billing_period = "monthly"
        elif 80 <= mean_interval <= 100:
            billing_period = "quarterly"
        elif 350 <= mean_interval <= 380:
            billing_period = "annual"

        next_billing = dates[-1] + timedelta(days=int(mean_interval))

        sub = Subscription(
            user_id=user_id,
            name=group.key.title()[:255],
            amount_encrypted=encrypt_decimal(median_amount) or "",
            billing_period=billing_period,
            next_billing_date=next_billing,
            is_active=True,
        )
        db.add(sub)

        # Mark transactions as recurring
        for txn in group.transactions:
            txn.is_recurring = True

        saved.append(sub)

    await db.flush()
    return saved


# ─── Summary ─────────────────────────────────────────────────────────────────

async def compute_summary(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    start: datetime | None = None,
    end: datetime | None = None,
) -> dict:
    if end is None:
        end = datetime.now(timezone.utc)
    if start is None:
        start = end - timedelta(days=30)

    accounts = await list_accounts(db, user_id=user_id)
    net_worth = sum((account_balance(a) for a in accounts), Decimal("0"))

    txns = await list_transactions(db, user_id=user_id, start=start, end=end, limit=10_000)

    total_income = Decimal("0")
    total_expenses = Decimal("0")
    by_category: dict[str, Decimal] = defaultdict(Decimal)
    for txn in txns:
        amt = transaction_amount(txn)
        if amt > 0:
            total_income += amt
        else:
            abs_amt = -amt
            total_expenses += abs_amt
            by_category[txn.category or "uncategorized"] += abs_amt

    total_for_pct = total_expenses or Decimal("1")
    spending_by_category = [
        {
            "category": cat,
            "amount": amt,
            "percent_of_total": float(amt / total_for_pct * 100),
        }
        for cat, amt in sorted(by_category.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "net_worth": net_worth,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "cash_flow": total_income - total_expenses,
        "period_start": start,
        "period_end": end,
        "spending_by_category": spending_by_category,
        "transaction_count": len(txns),
    }


# ─── Forecasting ─────────────────────────────────────────────────────────────

async def forecast(
    db: AsyncSession, *, user_id: uuid.UUID, period_days: int
) -> dict:
    """
    Rolling 90-day mean per category, projected forward.
    Subscriptions added explicitly from the subscriptions table.
    """
    now = datetime.now(timezone.utc)
    history_start = now - timedelta(days=90)

    txns = await list_transactions(
        db, user_id=user_id, start=history_start, end=now, limit=10_000
    )

    daily_income = Decimal("0")
    daily_expense = Decimal("0")
    if txns:
        income_total = sum((transaction_amount(t) for t in txns if transaction_amount(t) > 0), Decimal("0"))
        expense_total = sum((-transaction_amount(t) for t in txns if transaction_amount(t) < 0), Decimal("0"))
        daily_income = income_total / 90
        daily_expense = expense_total / 90

    accounts = await list_accounts(db, user_id=user_id)
    starting_balance = sum((account_balance(a) for a in accounts), Decimal("0"))

    # Project forward
    timeline = []
    projected_balance = starting_balance
    for day in range(period_days):
        date = now + timedelta(days=day + 1)
        projected_balance += daily_income - daily_expense
        timeline.append({
            "date": date,
            "projected_balance": projected_balance,
            "projected_income": daily_income,
            "projected_expenses": daily_expense,
        })

    confidence: str = "low"
    if len(txns) > 60 and period_days <= 30:
        confidence = "high"
    elif len(txns) > 30 and period_days <= 90:
        confidence = "medium"

    return {
        "period_days": period_days,
        "starting_balance": starting_balance,
        "ending_balance": timeline[-1]["projected_balance"] if timeline else starting_balance,
        "total_projected_income": daily_income * period_days,
        "total_projected_expenses": daily_expense * period_days,
        "timeline": timeline,
        "confidence": confidence,
    }


# ─── Budgets ─────────────────────────────────────────────────────────────────

async def create_budget(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    category: str,
    amount: Decimal,
    period: str = "monthly",
) -> Budget:
    budget = Budget(
        user_id=user_id,
        category=category,
        amount_encrypted=encrypt_decimal(amount) or "",
        period=period,
    )
    db.add(budget)
    await db.flush()
    await db.refresh(budget)
    return budget


def budget_amount(budget: Budget) -> Decimal:
    return decrypt_decimal(budget.amount_encrypted) or Decimal("0")


async def list_budgets_with_actuals(
    db: AsyncSession, *, user_id: uuid.UUID
) -> list[dict]:
    result = await db.execute(select(Budget).where(Budget.user_id == user_id))
    budgets = list(result.scalars().all())

    now = datetime.now(timezone.utc)
    out = []
    for budget in budgets:
        period_days = {"weekly": 7, "monthly": 30, "quarterly": 90, "annual": 365}.get(budget.period, 30)
        start = now - timedelta(days=period_days)
        txns_result = await db.execute(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.category == budget.category,
                Transaction.transaction_date >= start,
            )
        )
        txns = list(txns_result.scalars().all())
        actual = sum((-transaction_amount(t) for t in txns if transaction_amount(t) < 0), Decimal("0"))
        amount = budget_amount(budget)
        remaining = amount - actual
        percent = float(actual / amount * 100) if amount else 0.0
        out.append({
            "id": budget.id,
            "category": budget.category,
            "amount": amount,
            "period": budget.period,
            "actual_spent": actual,
            "remaining": remaining,
            "percent_used": percent,
        })
    return out


# ─── Subscriptions listing ───────────────────────────────────────────────────

def subscription_amount(sub: Subscription) -> Decimal:
    return decrypt_decimal(sub.amount_encrypted) or Decimal("0")


async def list_subscriptions(db: AsyncSession, *, user_id: uuid.UUID) -> list[Subscription]:
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id, Subscription.is_active == True
        ).order_by(Subscription.next_billing_date)
    )
    return list(result.scalars().all())
