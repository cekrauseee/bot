# 001 — Stabilize conversation identity and async ownership

- **Status**: DONE
- **Commit**: `94f4844`
- **Severity**: HIGH
- **Category**: Interruptibility and state ownership
- **Estimated scope**: 8–11 files, medium refactor with pure reducer tests

## Problem

The router already preserves the parent chat component. Its dynamic children are null components, so keying or rebuilding the route tree is not the fix:

```tsx
// apps/web/src/app/router.tsx:12 — current
children: [
  { index: true, Component: () => null },
  { path: 'conversations/:conversationId', Component: () => null },
  { path: 'projects/:projectId/:conversationId', Component: () => null },
],
```

The actual problem is one mutable state slot for three resources and every conversation:

```ts
// apps/web/src/features/chat/services/conversation-api.ts:72 — current
export type ConversationState = {
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  messages: ChatMessage[]
  title: string
  loading: boolean
  streaming: boolean
  loadError: string
  turnError: string
  status: string
  activeAssistantId?: string
  activeConversationId?: string
}
```

Every route change reloads catalog, projects, and detail as one operation:

```ts
// apps/web/src/features/chat/services/conversation-api.ts:540 — current
const load = useCallback(async (id = routeConversationRef.current) => {
  loadAbortRef.current?.abort()
  const controller = new AbortController()
  loadAbortRef.current = controller
  setState((current) => ({ ...current, loading: true, loadError: '', turnError: '' }))
  try {
    const [list, projects, detail] = await Promise.all([
      request<{ conversations: ConversationSummary[] }>('/conversations', {
        signal: controller.signal,
      }),
      request<{ projects: ProjectSummary[] }>('/projects', {
        signal: controller.signal,
      }),
      id
        ? request<ConversationDetail>(`/conversations/${id}`, { signal: controller.signal })
        : Promise.resolve(undefined),
    ])
```

Most importantly, submission reads `routeConversationRef`, whose value is synchronized only in a passive effect. After the URL/render changes to B, a submit can still POST to A before the effect runs. Stream callbacks and the catch block then write into the same global message slot without an operation/conversation guard:

```ts
// apps/web/src/features/chat/services/conversation-api.ts:524 — current
const routeConversationRef = useRef(conversationId)

useEffect(() => {
  routeConversationRef.current = conversationId
}, [conversationId])
```

```ts
// apps/web/src/features/chat/services/conversation-api.ts:603 — current
streamConversationRef.current = routeConversationRef.current
// ...
const id = routeConversationRef.current
const path = id ? `/conversations/${id}/turns` : '/conversations/turns'
```

```ts
// apps/web/src/features/chat/services/conversation-api.ts:646 — current
await readEventStream(response, (event) => {
  if (event.type === 'turn.started') {
    streamConversationRef.current = event.data.conversation.id
    onStartedRef.current?.(event.data.conversation.id)
  }
  setState((current) => applyStreamEvent(current, event))
})
```

Stopping before sidebar navigation narrows the race but does not cover browser back/forward or already-delivered callbacks:

```ts
// apps/web/src/features/chat/chat-feature.tsx:90 — current
const leaveCurrentConversation = (navigate: () => void) => {
  if (conversation.streaming) conversation.stop()
  navigate()
}
```

## Target

Use one source of truth per concern:

- `conversationId` from the URL is the only active conversation identity.
- Project slug is URL metadata used for canonical paths, never a second identity.
- Catalog/project data has an independent resource state and loads once per authenticated app lifetime, with explicit refresh.
- Conversation data is stored in serializable records keyed by conversation ID, plus one explicit new-conversation record.
- `activeConversation` is derived during render from the route and records; it is never copied into state.
- `send(activeKey, ...)` receives the rendered route identity synchronously. It never reads a route ref.
- Every detail load and turn captures an opaque `operationId`; reducer actions carry `{ key, operationId }`, and stale actions return the current state unchanged.
- Abort controllers live in refs keyed by operation, not in serializable state.
- Navigating away preserves the existing stop-on-navigation behavior. Aborted/late events may finalize A's record only when their operation still owns A; they can never update B.
- A new turn begins in the explicit new record. On `turn.started`, perform one atomic handoff: move/rekey that optimistic record to the server ID, move the same operation/abort-controller ownership with it, create a fresh empty new-conversation record, add/update the catalog summary, then replace the URL. Mark `{ from: 'new', to: id, operationId }` as the same active operation so the route-change effect neither aborts it nor fetches detail.
- Cached ready details render immediately when returning to a conversation during the same app lifetime.

Use explicit resource statuses instead of booleans:

```ts
type ResourceStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'error'
  | 'not-found'

type OperationState = {
  operationId?: string
  status: ResourceStatus
  error: string
}

type ConversationRecord = {
  id?: string
  title: string
  messages: ChatMessage[]
  detail: OperationState
  turn: OperationState
  activeAssistantId?: string
}

type ConversationControllerState = {
  catalog: {
    conversations: ConversationSummary[]
    projects: ProjectSummary[]
    status: ResourceStatus
    error: string
  }
  newConversation: ConversationRecord
  conversationsById: Record<string, ConversationRecord>
}
```

The reducer guard is mandatory for success, failure, abort finalization, and every SSE event:

```ts
if (record.turn.operationId !== action.operationId) return state
```

Preserve HTTP status so detail `404` becomes `not-found`; network/5xx remain retryable `error`:

```ts
class ConversationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
```

## Repo conventions to follow

- Keep `ChatFeature` as the application-owned stateful feature boundary and `ChatWorkspace` presentational. This is the established contract in `apps/web/src/features/chat/chat-feature.tsx:41` and `apps/web/src/features/chat/components/workspace/chat-workspace.tsx:18`.
- Keep pages importing only `@/features/chat`; update `scripts/tests/web-architecture.test.mjs` if new feature folders are introduced.
- Keep state/model modules serializable and free of React/component imports.
- Preserve the existing `conversationPath()` canonical URL helper in `apps/web/src/features/chat/conversation-path.ts:3`; extend it with pure route-resolution helpers rather than duplicating path assembly.
- Use `useReducer`, `useCallback`, and refs already available in React. Do not add a state/data dependency.
- Keep API/SSE parsing tests in the current Node Vitest environment (`apps/web/vitest.config.ts:3`). Extract pure reducer/controller functions so races can be tested without jsdom.

## Steps

1. In `apps/web/src/features/chat/services/conversation-api.ts`, separate transport from React ownership:
   - keep `request`, detail/catalog/project/turn requests, `readEventStream`, event validation, and message mapping here;
   - export a status-preserving `ConversationApiError`;
   - remove the monolithic `useConversation` after its callers have migrated;
   - retain the current payloads, credentials, error copy, and SSE protocol.
2. Add `apps/web/src/features/chat/state/conversation-controller.ts` with serializable state, selectors, action types, and a pure reducer:
   - separate catalog and keyed records;
   - provide `selectActiveConversation(state, routeIdentity)`;
   - guard load and turn actions by operation ID;
   - implement atomic new-record rekey on `turn.started`, create a fresh empty new record, and retain the live operation on the returned ID;
   - update only the addressed record for deltas/completion/failure.
3. Add `apps/web/src/features/chat/hooks/use-conversation-controller.ts`:
   - derive `{ kind: 'new' } | { kind: 'existing'; id }` directly from the `conversationId` prop on every render;
   - load the catalog independently once, with an explicit reload path;
   - ensure an existing detail automatically only when its keyed record is `idle`; `error` requires the explicit retry action so persistent failures cannot create a request loop;
   - keep one abort controller per active load/turn operation in refs;
   - abort and stop the prior active turn on a genuine route-identity change, preserving current behavior;
   - recognize the atomic `new -> returned id` handoff by operation ID, move controller ownership to the returned ID, and skip abort/detail-load for that one replacement;
   - pass the captured route identity and operation ID into every reducer dispatch;
   - expose `send(activeIdentity, prompt, model, reasoning, speed)` and `stop(activeIdentity)`.
4. In `apps/web/src/features/chat/chat-feature.tsx`:
   - replace `useConversation(conversationId, onConversationStarted)` with the controller;
   - derive the active view from `conversationId` and controller selectors;
   - make the submit callback close over the current render's active identity and pass it explicitly;
   - keep model/reasoning/fast-mode preferences global as they are now;
   - preserve canonical project-slug replacement, but make it depend on catalog readiness and ensure it does not trigger a detail reload for the same ID.
5. Make project/conversation mutations route-safe:
   - `createProject`, `moveToProject`, and `remove` update catalog/records only when their requests resolve;
   - do not navigate from the async continuation that initiated a move/delete;
   - after state changes, derive canonical replacement or deleted-active recovery from the current URL identity in render/effect state, so a completion started on A cannot redirect after the user has moved to B.
6. Preserve the current route tree and stable parent mount. Do not add `key={conversationId}` to `ChatPage`, `ChatFeature`, `ChatWorkspace`, or their shell.
7. Update `ChatWorkspace` props from ambiguous booleans/flat fields to explicit `catalog` and `activeConversation` view objects. The loading UI itself belongs to Plan 002.
8. Add pure tests beside the controller covering:
   - A load resolving after B became active updates only A's record;
   - late A delta/completion/failure after abort never changes B;
   - send created from B uses B even if a prior route ref/controller value was A;
   - `/` optimistic turn rekeys to the returned server ID and continues streaming without detail fetch;
   - that handoff retains the same abort controller/operation, does not call abort, and leaves a fresh empty record when returning to `/`;
   - a stale operation ID is ignored for every terminal path;
   - cached A remains ready after A -> B -> A;
   - catalog error does not erase a ready detail and detail error does not erase catalog data;
   - 404 maps to `not-found`, while 5xx/network maps to `error`;
   - a persistent 500 performs one request per route entry/explicit retry and never loops merely because status is `error`;
   - slow move(A) then navigate B updates A's catalog entry but stays on B;
   - slow delete(A) then navigate B removes A but stays on B; deleting the currently rendered A recovers to `/` only while A is still current.
9. Update `docs/architecture.md`, `docs/modules/web.md`, and `scripts/tests/web-architecture.test.mjs` to name the new ownership boundary and guard against reintroducing active-selection state outside the route/controller.

## Boundaries

- Do NOT change route URLs or rename the public `conversationId` parameter.
- Do NOT key/remount the whole chat tree to make state reset.
- Do NOT store `activeConversationId` as a second selected value in the controller.
- Do NOT retain more than in-memory records for this browser session; no localStorage, IndexedDB, or server draft/cache work.
- Do NOT implement per-conversation drafts. Plan 002 keeps the current single composer instance mounted.
- Do NOT allow background streaming after navigation; preserve stop-on-navigation until that product decision is explicitly revisited.
- Do NOT change the backend contract, database, auth flow, model/reasoning behavior, sidebar grouping, or copy unrelated to resource errors.
- If the SSE contract or route shape differs from the code stamped at commit `94f4844`, stop and refresh this plan instead of improvising.

## Verification

- **Mechanical**:
  - `npm run web:lint`
  - `npm run web:typecheck`
  - `npm run web:test`
  - `npm run web:build`
  - `node --test scripts/tests/web-architecture.test.mjs`
  - `git diff --check`
- **Race check**:
  - navigate A -> B and submit immediately after B renders; inspect the request path and confirm `/conversations/B/turns`;
  - start a turn in A, navigate to B, and deliver/observe late A delta/failure callbacks; B's title, messages, status, and error remain unchanged;
  - start on `/`, submit, receive `turn.started`, and confirm the optimistic rows continue under the returned ID with one replace-navigation, no abort, and no duplicate detail load;
  - delay move/delete mutations, navigate A -> B before they resolve, and confirm their catalog updates never navigate away from B.
- **Navigation check**:
  - use sidebar, browser Back/Forward, recents/project canonicalization, and deletion of the active conversation;
  - A -> B -> A uses cached A data without catalog reload or stale B content.
- **Done when**: route identity is the only active selection, all async writes are record/operation guarded, catalog and detail failures are independent, and no test can reproduce a cross-conversation write or wrong POST target.
