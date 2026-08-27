import pytest
from starlette.requests import Request
from starlette.responses import Response

from my_bot_api.auth.otp import OtpReservation
from my_bot_api.auth.schemas import OtpVerifyRequest
from my_bot_api.config import Settings
from my_bot_api.routers.auth import client_ip, verify_otp


def request_from(
    peer: str, *, forwarded: str | None = None, forwarded_headers: list[str] | None = None
) -> Request:
    headers = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    for forwarded_header in forwarded_headers or []:
        headers.append((b"x-forwarded-for", forwarded_header.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": headers,
            "client": (peer, 443),
            "server": ("api.example.com", 443),
            "scheme": "https",
        }
    )


def test_untrusted_peer_cannot_spoof_forwarded_client_ip() -> None:
    request = request_from("198.51.100.8", forwarded="203.0.113.4")

    assert client_ip(request, {"10.0.0.1"}) == "198.51.100.8"


def test_trusted_proxy_may_forward_one_client_ip() -> None:
    request = request_from("10.0.0.1", forwarded="203.0.113.4")

    assert client_ip(request, {"10.0.0.1"}) == "203.0.113.4"


def test_trusted_proxy_multi_hop_forwarding_is_ignored() -> None:
    request = request_from("10.0.0.1", forwarded="203.0.113.4, 198.51.100.9")

    assert client_ip(request, {"10.0.0.1"}) == "10.0.0.1"


def test_trusted_proxy_duplicate_forwarded_headers_are_ignored() -> None:
    request = request_from(
        "10.0.0.1",
        forwarded_headers=["203.0.113.4", "198.51.100.9"],
    )

    assert client_ip(request, {"10.0.0.1"}) == "10.0.0.1"


class FailingTransaction:
    async def __aenter__(self) -> object:
        raise RuntimeError("database unavailable")

    async def __aexit__(self, *_: object) -> None:
        return None


class FailingDatabase:
    def transaction(self) -> FailingTransaction:
        return FailingTransaction()


class ReservingOtp:
    def __init__(self) -> None:
        self.reservation = OtpReservation("challenge", "person@example.com", "reservation")
        self.released: list[OtpReservation] = []

    async def reserve(self, **_: object) -> OtpReservation:
        return self.reservation

    async def release(self, reservation: OtpReservation) -> bool:
        self.released.append(reservation)
        return True


@pytest.mark.asyncio
async def test_otp_verification_releases_reservation_when_persistence_fails() -> None:
    otp = ReservingOtp()
    container = type(
        "Container",
        (),
        {
            "otp": otp,
            "database": FailingDatabase(),
            "settings": Settings(environment="test"),
        },
    )()

    with pytest.raises(RuntimeError, match="database unavailable"):
        await verify_otp(
            OtpVerifyRequest(
                challenge_id="challenge-id-that-is-at-least-32-characters", code="123456"
            ),
            request_from("198.51.100.8"),
            Response(),
            container,
        )

    assert otp.released == [otp.reservation]
