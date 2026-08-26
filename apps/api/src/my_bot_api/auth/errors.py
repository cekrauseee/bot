from dataclasses import dataclass


@dataclass(slots=True)
class AuthError(Exception):
    code: str
    message: str
    status_code: int
    retry_after_seconds: int | None = None

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)


def invalid_code_error() -> AuthError:
    return AuthError(
        code="invalid_code",
        message="That code is incorrect or has expired. Request a new code and try again.",
        status_code=400,
    )
