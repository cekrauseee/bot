from my_bot_api.auth.security import (
    generate_opaque_token,
    generate_otp_code,
    hash_otp,
    hash_session_token,
)


def test_generated_codes_are_six_decimal_digits() -> None:
    codes = {generate_otp_code() for _ in range(100)}

    assert all(len(code) == 6 and code.isdecimal() for code in codes)
    assert len(codes) > 90


def test_hashes_bind_secrets_to_their_context() -> None:
    first = hash_otp(challenge_id="challenge-a", code="123456", pepper="pepper")
    second = hash_otp(challenge_id="challenge-b", code="123456", pepper="pepper")

    assert first != second
    assert len(hash_session_token(generate_opaque_token())) == 32
