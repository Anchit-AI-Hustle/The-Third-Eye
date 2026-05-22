# FINANCIAL_MODULE: verify encryption and disclaimer presence
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ─── Accounts ────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    account_type: Literal["checking", "savings", "credit_card", "investment", "loan"]
    institution: Optional[str] = None
    balance: Optional[Decimal] = None
    currency: str = "USD"


class AccountResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    account_type: str
    institution: Optional[str]
    balance: Optional[Decimal]
    currency: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Transactions ────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    amount: Decimal
    currency: str = "USD"
    description: Optional[str] = None
    category: Optional[str] = None
    transaction_date: datetime


class TransactionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    account_id: uuid.UUID
    amount: Decimal
    currency: str
    description: Optional[str]
    category: Optional[str]
    transaction_date: datetime
    is_recurring: bool

    model_config = {"from_attributes": True}


class TransactionImportResponse(BaseModel):
    inserted: int
    skipped_duplicates: int
    failed: int
    categories_assigned: dict[str, int]


# ─── Budgets ─────────────────────────────────────────────────────────────────

class BudgetCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    amount: Decimal
    period: Literal["weekly", "monthly", "quarterly", "annual"] = "monthly"


class BudgetResponse(BaseModel):
    id: uuid.UUID
    category: str
    amount: Decimal
    period: str
    actual_spent: Decimal
    remaining: Decimal
    percent_used: float

    model_config = {"from_attributes": True}


# ─── Subscriptions ───────────────────────────────────────────────────────────

class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    name: str
    amount: Decimal
    billing_period: str
    next_billing_date: Optional[datetime]
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Summary / Forecast ──────────────────────────────────────────────────────

class CategorySpend(BaseModel):
    category: str
    amount: Decimal
    percent_of_total: float


class FinanceSummary(BaseModel):
    net_worth: Decimal
    total_income: Decimal
    total_expenses: Decimal
    cash_flow: Decimal
    period_start: datetime
    period_end: datetime
    spending_by_category: list[CategorySpend]
    transaction_count: int


class ForecastPoint(BaseModel):
    date: datetime
    projected_balance: Decimal
    projected_income: Decimal
    projected_expenses: Decimal


class ForecastResponse(BaseModel):
    period_days: int
    starting_balance: Decimal
    ending_balance: Decimal
    total_projected_income: Decimal
    total_projected_expenses: Decimal
    timeline: list[ForecastPoint]
    confidence: Literal["high", "medium", "low"]
