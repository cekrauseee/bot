import hashlib
import hmac
import secrets


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_opaque_token(size: int = 32) -> str:
    return secrets.token_urlsafe(size)


def hash_otp(*, challenge_id: str, code: str, pepper: str) -> str:
    return hmac.new(
        pepper.encode(),
        f"{challenge_id}:{code}".encode(),
        hashlib.sha256,
    ).hexdigest()


def keyed_identifier(value: str, *, pepper: str) -> str:
    return hmac.new(pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


def hash_session_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()
