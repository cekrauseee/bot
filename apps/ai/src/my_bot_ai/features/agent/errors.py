"""Safe agent errors that may be translated at the service boundary."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PublicAgentError:
    code: str
    message: str
    retryable: bool


class AgentServiceError(Exception):
    """Base exception carrying only a stable, non-sensitive public error."""

    public_error = PublicAgentError("agent_error", "The agent run failed.", True)


class ProviderMissingError(AgentServiceError):
    public_error = PublicAgentError(
        "provider_missing", "The selected AI provider is not configured.", False
    )


class InvalidResumeError(AgentServiceError):
    public_error = PublicAgentError(
        "invalid_resume", "The run is not waiting for that question.", False
    )


class CheckpointMissingError(AgentServiceError):
    public_error = PublicAgentError(
        "checkpoint_missing",
        "The durable agent checkpoint is missing.",
        False,
    )


class RuntimeCallError(AgentServiceError):
    def __init__(
        self,
        code: str = "runtime_error",
        message: str = "The runtime tool failed.",
        retryable: bool = True,
    ) -> None:
        self.public_error = PublicAgentError(code, message, retryable)
        super().__init__(message)


class RuntimeRecoveryRequiredError(AgentServiceError):
    public_error = PublicAgentError(
        "manual_recovery_required",
        "A runtime operation has an ambiguous outcome and requires user review.",
        False,
    )


class RuntimeIdempotencyConflictError(AgentServiceError):
    public_error = PublicAgentError(
        "idempotency_conflict",
        "A runtime operation identifier was reused with different inputs.",
        False,
    )
