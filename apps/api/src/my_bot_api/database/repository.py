import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from my_bot_api.models import OAuthIdentity, Session, User


class IdentityConflictError(RuntimeError):
    """Raised when an OAuth subject is already linked to another user."""


def normalize_email(email: str) -> str:
    return email.strip().casefold()


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def find_user_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self.session.scalar(select(User).where(User.id == user_id))

    async def find_user_by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == normalize_email(email)))

    async def get_or_create_email_user(
        self,
        email: str,
        *,
        first_name: str | None = None,
        last_name: str | None = None,
        avatar_url: str | None = None,
        email_verified_at: datetime | None = None,
    ) -> User:
        normalized = normalize_email(email)
        existing = await self.find_user_by_email(normalized)
        if existing is not None:
            if email_verified_at is not None and existing.email_verified_at is None:
                existing.email_verified_at = email_verified_at
                await self.session.flush()
            return existing

        candidate = User(
            email=normalized,
            first_name=first_name,
            last_name=last_name,
            avatar_url=avatar_url,
            email_verified_at=email_verified_at,
        )
        try:
            async with self.session.begin_nested():
                self.session.add(candidate)
                await self.session.flush()
        except IntegrityError:
            # Another request won the unique-email race. The savepoint keeps the
            # caller's transaction usable while we read its committed row.
            existing = await self.find_user_by_email(normalized)
            if existing is None:
                raise
            return existing
        return candidate

    async def find_identity(self, provider: str, provider_subject: str) -> OAuthIdentity | None:
        return await self.session.scalar(
            select(OAuthIdentity).where(
                OAuthIdentity.provider == provider,
                OAuthIdentity.provider_subject == provider_subject,
            )
        )

    async def get_or_create_google_user(
        self,
        *,
        provider_subject: str,
        email: str,
        email_verified: bool,
        first_name: str | None = None,
        last_name: str | None = None,
        avatar_url: str | None = None,
        provider_email: str | None = None,
        email_verified_at: datetime | None = None,
    ) -> User:
        if not email_verified:
            raise ValueError("Google email must be verified")
        identity = await self.find_identity("google", provider_subject)
        verified_at = email_verified_at or datetime.now(UTC)
        if identity is not None:
            user = await self.find_user_by_id(identity.user_id)
            if user is None:
                raise IdentityConflictError("OAuth identity references a missing user")
            self._update_profile(user, first_name, last_name, avatar_url, provider_email)
            if provider_email is not None:
                identity.provider_email = normalize_email(provider_email)
            if user.email_verified_at is None:
                user.email_verified_at = verified_at
            await self.session.flush()
            return user

        user = await self.get_or_create_email_user(
            email,
            first_name=first_name,
            last_name=last_name,
            avatar_url=avatar_url,
            email_verified_at=verified_at,
        )
        self._update_profile(user, first_name, last_name, avatar_url, provider_email)
        await self.get_or_create_identity(
            user,
            provider="google",
            provider_subject=provider_subject,
            provider_email=provider_email,
            email_verified=True,
        )
        await self.session.flush()
        return user

    @staticmethod
    def _update_profile(
        user: User,
        first_name: str | None,
        last_name: str | None,
        avatar_url: str | None,
        provider_email: str | None,
    ) -> None:
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        if avatar_url is not None:
            user.avatar_url = avatar_url

    async def get_or_create_google_identity(
        self,
        user: User,
        provider_subject: str,
        *,
        provider_email: str | None = None,
        email_verified: bool,
    ) -> OAuthIdentity:
        return await self.get_or_create_identity(
            user,
            provider="google",
            provider_subject=provider_subject,
            provider_email=provider_email,
            email_verified=email_verified,
        )

    async def get_or_create_identity(
        self,
        user: User,
        *,
        provider: str,
        provider_subject: str,
        provider_email: str | None = None,
        email_verified: bool,
    ) -> OAuthIdentity:
        if not email_verified:
            raise ValueError("an OAuth identity requires a verified email")
        query = select(OAuthIdentity).where(
            OAuthIdentity.provider == provider,
            OAuthIdentity.provider_subject == provider_subject,
        )
        existing = await self.session.scalar(query)
        if existing is not None:
            if existing.user_id != user.id:
                raise IdentityConflictError("OAuth identity is linked to another user") from None
            return existing

        candidate = OAuthIdentity(
            user_id=user.id,
            provider=provider,
            provider_subject=provider_subject,
            provider_email=normalize_email(provider_email) if provider_email else None,
        )
        try:
            async with self.session.begin_nested():
                self.session.add(candidate)
                await self.session.flush()
        except IntegrityError:
            existing = await self.session.scalar(query)
            if existing is None:
                raise
            if existing.user_id != user.id:
                raise IdentityConflictError("OAuth identity is linked to another user") from None
            return existing
        return candidate

    async def create_session(
        self, user: User | uuid.UUID, token_hash: bytes, expires_at: datetime
    ) -> Session:
        user_id = user.id if isinstance(user, User) else user
        session = Session(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.session.add(session)
        await self.session.flush()
        return session

    async def resolve_active_session(
        self, token_hash: bytes, *, now: datetime | None = None
    ) -> Session | None:
        current = now or datetime.now(UTC)
        return await self.session.scalar(
            select(Session).options(selectinload(Session.user)).where(
                Session.token_hash == token_hash,
                Session.revoked_at.is_(None),
                Session.expires_at > current,
            )
        )

    async def touch_session(
        self,
        session_id: uuid.UUID,
        *,
        now: datetime | None = None,
        throttle: timedelta = timedelta(minutes=5),
    ) -> bool:
        current = now or datetime.now(UTC)
        result = await self.session.execute(
            update(Session)
            .where(
                Session.id == session_id,
                Session.revoked_at.is_(None),
                or_(Session.last_seen_at.is_(None), Session.last_seen_at <= current - throttle),
            )
            .values(last_seen_at=current)
        )
        return result.rowcount == 1

    async def revoke_session(self, session_id: uuid.UUID, *, at: datetime | None = None) -> bool:
        result = await self.session.execute(
            update(Session)
            .where(Session.id == session_id, Session.revoked_at.is_(None))
            .values(revoked_at=at or datetime.now(UTC))
        )
        return result.rowcount == 1

    async def revoke_all_user_sessions(
        self, user_id: uuid.UUID, *, at: datetime | None = None
    ) -> int:
        result = await self.session.execute(
            update(Session)
            .where(and_(Session.user_id == user_id, Session.revoked_at.is_(None)))
            .values(revoked_at=at or datetime.now(UTC))
        )
        return result.rowcount or 0
