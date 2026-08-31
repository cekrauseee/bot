# Conversation loading and motion plan

- **Baseline commit**: `94f4844`
- **Status**: implemented and verified locally
- **Scope**: authenticated web chat navigation, loading states, title/transcript transitions, and loaded-history entrance motion

## Architectural decision

The URL remains the only source of truth for which conversation is active. A route resolves to either the new-conversation state or one `conversationId`; project slugs are canonical URL metadata, not conversation identity.

Application state owns data and operation state, not a second selected-conversation value:

```text
route conversationId
        |
        v
active conversation key -----> keyed detail/turn record
        |                              |
        |                              +--> load operation id
        |                              +--> turn operation id
        |
        +--> catalog lookup ----------> immediate summary title/project
```

`ChatFeature`, `ChatWorkspace`, sidebar chrome, header chrome, and the single composer instance remain mounted across conversation navigation. Only the transcript pane is keyed and replaceable. Catalog/project loading is independent from conversation-detail loading.

No external state library is needed. Use an application-owned reducer/controller with serializable records and refs only for abort controllers. Every async completion and SSE event carries `{ conversationKey, operationId }`; a reducer ignores an event that no longer matches the target record.

## Vetted findings

| # | Severity | Category | Location | Finding | Planned correction |
|---|---|---|---|---|---|
| 1 | HIGH | State ownership / interruptibility | `apps/web/src/features/chat/services/conversation-api.ts:518` | One state slot owns catalog, active detail, loading, and streaming. `send()` reads a route ref updated by an effect, creating a window where the rendered route and POST target can disagree; late stream callbacks can also mutate the current slot. | Plan 001: derive identity from the route, split resource state, key records, and reject stale operations. |
| 2 | HIGH | Purpose / loading | `apps/web/src/features/chat/services/conversation-api.ts:540`, `apps/web/src/features/chat/components/sidebar/chat-sidebar.tsx:121` | Route changes reload catalog, projects, and detail together. Empty arrays are rendered as real empty states while data is still pending, and session loading is a blank page. | Plan 002: independent resource statuses and route-aware, geometry-matched skeletons. |
| 3 | MEDIUM | Missed opportunity / cohesion | `apps/web/src/features/chat/components/workspace/chat-workspace.tsx:127`, `apps/web/src/features/chat/components/workspace/chat-header.tsx:44` | The old title can remain beside the new route while the transcript/composer are replaced by loading copy; both swaps are instantaneous. | Plan 003: stable chrome plus keyed, interruptible title and pane transitions. |
| 4 | MEDIUM | Cohesion / performance | `apps/web/src/features/chat/components/messages/chat-message-list.tsx:21` | Loaded histories are treated as initial static content; only subsequently appended user bubbles animate. Animating every row of a long history would overload the scroller's observers. | Plan 004: cascade at most the final four rows within a 270 ms budget. |
| 5 | MEDIUM | Accessibility | `apps/web/src/features/chat/components/workspace/chat-workspace.tsx:105`, `apps/web/src/components/motion/animated-sidebar.tsx:681` | `ChatWorkspace` wraps an inset that is already a `<main>`, producing nested main landmarks. Loading semantics are inconsistent between session, sidebar, and transcript. | Plan 002: retain one main landmark and scope `aria-busy`/status text per resource. |

## Missed opportunities selected for this pass

- Preserve the old transcript only as an inert 120 ms exit layer, then reveal the target conversation without ever treating old data as the new route's state.
- Resolve a selected conversation's title immediately from the catalog and animate only the title text, not the whole header.
- Make loading placeholders match the eventual sidebar rows, title, messages, and composer geometry so the transition communicates continuity.
- Reuse the installed Motion/beUI easing vocabulary. Do not use beUI `TextCascade` for arbitrary conversation titles: its per-letter timeline grows with title length and is better reserved for short labels.

## Execution order

```text
001 state ownership
  -> 002 route-aware skeletons and stable composer
      -> 003 title/transcript presence transitions
          -> 004 bounded message cascade
```

| Plan | Title | Severity | Status | Depends on |
|---|---|---|---|---|
| [001](001-stabilize-conversation-state.md) | Stabilize conversation identity and async ownership | HIGH | DONE | — |
| [002](002-add-route-aware-chat-skeletons.md) | Add route-aware chat skeletons without false empty states | HIGH | DONE | 001 |
| [003](003-transition-conversation-surfaces.md) | Transition title and transcript while chrome remains mounted | MEDIUM | DONE | 001, 002 |
| [004](004-cascade-loaded-message-tail.md) | Cascade the loaded message tail within a bounded budget | MEDIUM | DONE | 003 |

## Scope boundaries

- Do not key or remount `ChatFeature`, `ChatWorkspace`, `ChatShell`, `ChatSidebar`, `ChatHeader`, or `ChatComposer` by `conversationId`.
- Do not add Redux, Zustand, TanStack Query, or another state/data dependency.
- Do not implement per-conversation draft persistence yet. Preserve the one mounted composer and its current in-memory text across A -> B navigation; bind submission to B once B is active and ready.
- Preserve the current product decision to stop a streaming turn when navigating away. Background/multi-conversation streaming is a separate product decision.
- Do not change API payloads, authentication, database behavior, sidebar geometry, typography, or chat copy except for loading/error/not-found copy required by these states.
- Do not broadly retune existing motion primitives or replace the upstream beUI `EASE_OUT` token (`[0.16, 1, 0.3, 1]`).
- Do not add decorative skeleton shimmer beyond the standard `Skeleton` pulse; disable that pulse under reduced motion.

## Final acceptance evidence

- Static: `npm run web:lint`, `npm run web:typecheck`, `npm run web:test`, `npm run web:build`, `node --test scripts/tests/web-architecture.test.mjs`, and `git diff --check` all pass.
- State: immediate send after A -> B targets B; late A deltas/failure cannot write into B; `/` -> `turn.started` rekeys the same optimistic turn without a detail reload.
- Loading: no false sidebar empty state, no centered `Loading conversation...` copy, no skeleton flash for a detail that resolves in less than 150 ms, and distinct 404 versus retryable failure UI.
- Mounting: composer DOM identity and typed value survive A -> B; only transcript identity changes.
- Motion: rapid A -> B -> C is interruptible; title/pane motion finishes within 300 ms; no queued `mode="wait"`; reduced motion removes translation/stagger and retains a short opacity transition.
- Rendered QA: desktop light/dark, 390 px and 320 px, keyboard navigation, browser back/forward, direct deep link, long title/history, streaming interruption, slow network, 404, retry, reduced-motion emulation, and console errors.
