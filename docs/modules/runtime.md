# Agent Runtime

## Responsibility

`apps/runtime` executes filesystem, process, and browser operations outside the application API and model-provider process. It is a private Node.js service. The AI service is its only caller.

## Workspace and isolation

Each application user owns one global agent workspace. The runtime maps its stable workspace ID to one named persistent Vercel Sandbox, so conversations and project folders can share `/workspace` without making projects separate machines.

Each project has a persisted path under `/workspace/projects/`, generated from its initial slug and immutable ID. A run snapshots that path when it starts; projectless runs use `/workspace`. Renaming a project or moving its conversation does not redirect an existing run, including after recovery. Project metadata changes never move or delete files.

The directory is created lazily before the first filesystem or shell operation, using the unprivileged agent user. Creating project metadata or using only conversation/browser tools does not provision a project directory. Relative file paths and shell `cwd` values resolve from the run's `working_directory`; absolute paths anywhere inside `/workspace` remain available. Projects are starting directories, not isolation boundaries. The application does not expose a file explorer or a folder picker.

Model-controlled commands run as the dedicated unprivileged `mybot-agent` Linux user. That user owns `/workspace`, has no sudo access, and cannot read the root-owned operation journal under `/var/lib/mybot/runtime`. Shell commands use an executable plus an explicit argument list; the runtime does not interpolate shell syntax.

Browser controllers and agent-browser session names are scoped by `run_id`. Concurrent runs share files but do not share browser navigation, frames, or future control leases.

## Tool contract

`POST /tools` requires the runtime bearer token and a strict v2 request containing user, workspace, conversation, run, operation, tool, and argument fields. Its optional `working_directory` defaults to `/workspace` for older callers and must be a canonical absolute workspace path. Omitted filesystem-list paths and shell directories use that directory. The current model-visible tools are:

- list, read, and replace one file inside `/workspace`;
- execute one process with explicit `command`, `argv`, and `cwd`;
- open, inspect, click, type in, and close a run-scoped browser.

The runtime retains a private handoff foundation, but user-control tools are not exposed to models until the API and web application provide an authenticated lease channel.

## Durable operations

Every model tool call carries a deterministic `operation_id`. Before an external effect, the runtime creates an exclusive journal record. Completed operations replay their bounded normalized result. A started but incomplete shell or browser effect fails with `manual_recovery_required`; reads may run again, and an identical file replacement may converge safely. Reusing an operation ID with different inputs fails with `idempotency_conflict`.

Request cancellation propagates to the workspace queue and provider calls. A cancelled queued operation is checked again after acquiring its slot and after journal I/O, before dispatching any external effect. Already-started remote process termination remains subject to the provider's cancellation semantics.

Browser actions may attach a bounded PNG capture to their immediate response. The AI service removes the image before returning the tool result to the model and emits it as a transient frame. Frames cross API instances through Redis Pub/Sub and WebSocket fanout; they are never stored in PostgreSQL or the operation journal.

## Health

- `GET /health` is process liveness.
- `GET /ready` returns `503` until Vercel credentials are present. It checks configuration presence, not credential validity or an already-running browser.

The provider accepts Vercel OIDC credentials or an access token with project and team IDs. `AGENT_BROWSER_SNAPSHOT_ID` skips first-boot browser installation when a compatible snapshot exists.
