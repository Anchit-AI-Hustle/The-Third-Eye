"""
Google ID token verification for /api/v1/auth/session.

Regression context: the endpoint decoded the posted token HS256 with
NEXTAUTH_SECRET, while Google signs ID tokens RS256 with its own key. PyJWT
raised InvalidAlgorithmError before it even looked at the signature, so the
exchange failed for every user and the frontend silently never held a backend
token. These tests pin the correct checks and that the old shape is rejected.

No test touches the network: the JWKS client is substituted with one built from
a locally generated key pair.
"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth import service
from app.config import get_settings

settings = get_settings()

CLIENT_ID = "test-client-id.apps.googleusercontent.com"
KEY_ID = "test-key-1"

# Captured before the autouse fixture below replaces it, so the real factory can
# still be exercised. Constructing a PyJWKClient performs no network I/O —
# fetching is deferred until a key is actually requested.
_REAL_JWKS_FACTORY = service._google_jwks_client


@pytest.fixture(scope="module")
def rsa_keys():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return key, private_pem


@pytest.fixture(autouse=True)
def google_verification(monkeypatch, rsa_keys):
    """Point the verifier at our own key and set the expected audience."""
    key, _ = rsa_keys
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID, raising=False)

    class _StubSigningKey:
        def __init__(self, public_key):
            self.key = public_key

    class _StubJwksClient:
        def __init__(self, public_key):
            self._public_key = public_key

        def get_signing_key_from_jwt(self, token):
            # Mirror the real client: the key id must be one we know about.
            header = jwt.get_unverified_header(token)
            if header.get("kid") != KEY_ID:
                raise jwt.PyJWKClientError(f"Unable to find a signing key for {header.get('kid')!r}")
            return _StubSigningKey(self._public_key)

    monkeypatch.setattr(
        service, "_google_jwks_client", lambda: _StubJwksClient(key.public_key())
    )


def google_token(rsa_keys, *, kid: str = KEY_ID, **overrides) -> str:
    _, private_pem = rsa_keys
    now = datetime.now(timezone.utc)
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "oauth@example.com",
        "email_verified": True,
        "name": "OAuth User",
        "picture": "https://example.com/a.png",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    claims.update(overrides)
    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": kid})


# ─── Accepted ────────────────────────────────────────────────────────────────


def test_accepts_a_valid_google_id_token(rsa_keys):
    payload = service.verify_google_id_token(google_token(rsa_keys))
    assert payload.email == "oauth@example.com"
    assert payload.name == "OAuth User"
    assert payload.picture == "https://example.com/a.png"


def test_accepts_the_bare_issuer_spelling(rsa_keys):
    # Google uses both; neither may be rejected.
    payload = service.verify_google_id_token(google_token(rsa_keys, iss="accounts.google.com"))
    assert payload.email == "oauth@example.com"


# ─── Rejected ────────────────────────────────────────────────────────────────


def test_rejects_a_token_minted_for_another_client(rsa_keys):
    # Without the aud check, any Google app's token would authenticate here.
    with pytest.raises(jwt.InvalidAudienceError):
        service.verify_google_id_token(google_token(rsa_keys, aud="someone-else.apps.googleusercontent.com"))


def test_rejects_an_unexpected_issuer(rsa_keys):
    with pytest.raises(jwt.InvalidIssuerError):
        service.verify_google_id_token(google_token(rsa_keys, iss="https://evil.example.com"))


def test_rejects_an_expired_token(rsa_keys):
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    with pytest.raises(jwt.ExpiredSignatureError):
        service.verify_google_id_token(
            google_token(
                rsa_keys,
                iat=int(past.timestamp()),
                exp=int((past + timedelta(hours=1)).timestamp()),
            )
        )


def test_rejects_a_token_signed_by_an_unknown_key(rsa_keys):
    with pytest.raises(jwt.PyJWKClientError):
        service.verify_google_id_token(google_token(rsa_keys, kid="not-a-google-key"))


def test_rejects_a_token_signed_with_a_different_key(rsa_keys):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    now = datetime.now(timezone.utc)
    forged = jwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "1",
            "email": "attacker@example.com",
            "email_verified": True,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=1)).timestamp()),
        },
        other_pem,
        algorithm="RS256",
        headers={"kid": KEY_ID},
    )
    with pytest.raises(jwt.InvalidSignatureError):
        service.verify_google_id_token(forged)


def test_rejects_an_hs256_token_forged_with_the_shared_secret(rsa_keys):
    # An attacker who learned NEXTAUTH_SECRET must not be able to mint a token
    # this verifier accepts — algorithm confusion is the classic JWT hole.
    now = datetime.now(timezone.utc)
    forged = jwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "1",
            "email": "attacker@example.com",
            "email_verified": True,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=1)).timestamp()),
        },
        settings.nextauth_secret,
        algorithm="HS256",
        headers={"kid": KEY_ID},
    )
    with pytest.raises(jwt.InvalidAlgorithmError):
        service.verify_google_id_token(forged)


def test_rejects_an_unverified_email(rsa_keys):
    # Users are looked up by email, so an unconfirmed address could be used to
    # claim someone else's account.
    with pytest.raises(jwt.InvalidTokenError):
        service.verify_google_id_token(google_token(rsa_keys, email_verified=False))


def test_rejects_a_token_with_no_email(rsa_keys):
    with pytest.raises(jwt.InvalidTokenError):
        service.verify_google_id_token(google_token(rsa_keys, email=None))


def test_rejects_a_token_missing_required_claims(rsa_keys):
    _, private_pem = rsa_keys
    partial = jwt.encode(
        {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "email": "a@b.com"},
        private_pem,
        algorithm="RS256",
        headers={"kid": KEY_ID},
    )
    with pytest.raises(jwt.MissingRequiredClaimError):
        service.verify_google_id_token(partial)


def test_refuses_to_verify_when_no_client_id_is_configured(monkeypatch, rsa_keys):
    # Fails closed: an unset audience must reject, never accept blindly.
    monkeypatch.setattr(settings, "google_client_id", "", raising=False)
    with pytest.raises(jwt.InvalidTokenError, match="not configured"):
        service.verify_google_id_token(google_token(rsa_keys))


# ─── The two verifiers stay independent ──────────────────────────────────────


def test_nextauth_verifier_still_rejects_a_google_token(rsa_keys):
    # This is the original bug, pinned: the endpoint used to call only this.
    with pytest.raises(jwt.InvalidAlgorithmError):
        service.verify_nextauth_token(google_token(rsa_keys))


def test_jwks_client_is_built_once_against_googles_certs_url():
    # Rebuilding per request would refetch Google's keys on every sign-in.
    original = service._jwks_client
    service._jwks_client = None
    try:
        first = _REAL_JWKS_FACTORY()
        second = _REAL_JWKS_FACTORY()
        assert first is second
        assert service.GOOGLE_CERTS_URL == "https://www.googleapis.com/oauth2/v3/certs"
        assert first.uri == service.GOOGLE_CERTS_URL
    finally:
        service._jwks_client = original


def test_nextauth_verifier_still_accepts_its_own_tokens():
    # The API middleware depends on this path; it must not have been disturbed.
    now = int(datetime.now(timezone.utc).timestamp())
    token = jwt.encode(
        {"sub": "a@b.com", "email": "a@b.com", "iat": now, "exp": now + 3600},
        settings.nextauth_secret,
        algorithm="HS256",
    )
    assert service.verify_nextauth_token(token).email == "a@b.com"
