from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl


class ErrorDetail(BaseModel):
    code: str
    message: str
    retry_after_seconds: int | None = None


class OtpRequest(BaseModel):
    email: EmailStr


class OtpChallengeResponse(BaseModel):
    challenge_id: str
    expires_in_seconds: int
    resend_after_seconds: int


class OtpVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=32, max_length=128)
    code: str = Field(pattern=r"^\d{6}$")


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    first_name: str | None
    last_name: str | None
    avatar_url: HttpUrl | None


class AuthResponse(BaseModel):
    user: UserResponse
