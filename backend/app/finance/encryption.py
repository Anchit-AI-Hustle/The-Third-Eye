# FINANCIAL_MODULE: verify encryption and disclaimer presence
"""
Fernet-based AES-128-CBC + HMAC-SHA256 encryption for sensitive financial fields.
Key is sourced from FINANCIAL_ENCRYPTION_KEY at startup and never logged.
"""

from decimal import Decimal
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    settings = get_settings()
    key = settings.financial_encryption_key
    if isinstance(key, str):
        key = key.encode()
    try:
        return Fernet(key)
    except (ValueError, Exception) as e:
        raise RuntimeError(
            "FINANCIAL_ENCRYPTION_KEY is not a valid Fernet key. "
            "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        ) from e


def encrypt_str(plaintext: str) -> str:
    if plaintext is None:
        return None  # type: ignore
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_str(token: str) -> Optional[str]:
    if token is None:
        return None
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return None


def encrypt_decimal(value: Decimal | float | int | None) -> Optional[str]:
    if value is None:
        return None
    return encrypt_str(str(Decimal(value)))


def decrypt_decimal(token: Optional[str]) -> Optional[Decimal]:
    if token is None:
        return None
    plaintext = decrypt_str(token)
    if plaintext is None:
        return None
    try:
        return Decimal(plaintext)
    except Exception:
        return None
