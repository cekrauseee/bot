# 002 — Add route-aware chat skeletons without false empty states

- **Status**: DONE
- **Commit**: `94f4844`
- **Severity**: HIGH
- **Category**: Purpose, accessibility, and missed opportunity
- **Estimated scope**: 9–13 files, one shadcn primitive plus application-owned loading components

## Problem

Session/module loading is visually blank and has no accessible status text:

```tsx
// apps/web/src/app/components/route-fallback.tsx:1 — current
export function RouteFallback() {
  return <main className="min-h-svh bg-background" aria-hidden="true" />
}
```

```tsx
// apps/web/src/pages/chat/page.tsx:21 — current
if (isLoading) {
  return <main className="min-h-svh bg-background" aria-busy="true" />
}
```

One global loading branch removes both transcript and composer, then mounts them again when loading completes:

```tsx
// apps/web/src/features/chat/components/workspace/chat-workspace.tsx:132 — current
<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
  <span aria-live="polite" className="sr-only">{status}</span>
  {loading ? (
    <div className="grid min-h-0 flex-1 place-items-center" aria-busy="true">
      <p role="status" className="text-sm text-muted-foreground">
        Loading conversation…
      </p>
    </div>
  ) : loadError ? (
    // ...
  ) : empty ? (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-12">
      {composer}
    </div>
  ) : (
    <>
      <div className="min-h-0 flex-1">
        <ChatMessageList messages={messages} />
      </div>
      {composer}
    </>
  )}
</div>
```

The current `empty` calculation also conflates the base route with an existing conversation that happens to have zero messages:

```ts
// apps/web/src/features/chat/components/workspace/chat-workspace.tsx:83 — current
const empty = !loading && !loadError && messages.length === 0
```

While catalog/project data is pending, empty arrays render as real product statements:

```tsx
// apps/web/src/features/chat/components/sidebar/chat-sidebar.tsx:121 — current
{projects.length ? (
  <ProjectList ... />
) : (
  <Empty ...>
    // "No projects yet"
  </Empty>
)}
```

```tsx
// apps/web/src/features/chat/components/sidebar/chat-sidebar.tsx:198 — current
{!recentConversations.length ? (
  <Empty ...>
    // "No recent conversations"
  </Empty>
) : null}
```

Finally, `ChatWorkspace` creates a `<main>` around `AnimatedSidebarInset`, which is itself a `<motion.main>`:

```tsx
// apps/web/src/features/chat/components/workspace/chat-workspace.tsx:105 — current
<main className="min-h-svh bg-background">
```

```tsx
// apps/web/src/components/motion/animated-sidebar.tsx:689 — current
<motion.main
  data-slot="sidebar-inset"
```

## Target

Render loading by resource and route identity, not by message count:

| Situation | Sidebar | Header | Transcript | Composer |
|---|---|---|---|---|
| Session pending, base `/` | structural sidebar skeleton | mobile-only empty header geometry | empty/new workspace geometry | centered composer skeleton |
| Session pending, conversation URL | structural sidebar skeleton | title skeleton | message skeleton | bottom composer skeleton |
| Authenticated, catalog pending | project/recent skeleton rows | driven by active detail/summary | independent | one real composer |
| Authenticated base `/` | skeleton or real catalog | existing mobile behavior | no transcript | one real centered composer, enabled |
| Direct existing conversation pending | skeleton or real catalog | summary title if available, otherwise title skeleton | message skeleton | same real bottom composer, editable but submit-disabled |
| A -> B detail pending | active B row immediately; catalog stays real | B summary title immediately | A exits; show B skeleton only after 150 ms if still pending | same real composer, editable but submit-disabled |
| Ready existing conversation with zero messages | real catalog | conversation title | empty transcript area | bottom composer, not centered |
| Cached refresh | real catalog/content with scoped `aria-busy` and compact Updating status | real title | keep real transcript visible for the entire refresh; never mount a skeleton | real composer |
| 404 | real catalog | requested/summary title | Conversation not found recovery | same real composer remains mounted but submit-disabled for that missing ID |
| 5xx/network | real catalog | requested/summary title | retryable transcript error | composer submit-disabled |

Use the shadcn `Skeleton` primitive, added through the configured CLI, and keep the generated source application-owned:

```bash
cd apps/web
npx shadcn@latest add skeleton --dry-run
npx shadcn@latest add skeleton
```

The generated primitive's pulse must be reduced-motion safe:

```tsx
className={cn(
  "rounded-md bg-muted motion-safe:animate-pulse motion-reduce:animate-none",
  className,
)}
```

Skeleton groups use one presence transition; individual bars do not each fly in:

- initial app/session/catalog/detail loading: show immediately;
- uncached subsequent detail navigation: wait `150 ms` before mounting the skeleton to avoid a flash on fast responses;
- cached refresh: never mount a skeleton, even after 150 ms; retain the ready pane with scoped busy/update status;
- enter: opacity `0 -> 1`, `160 ms`, existing `EASE_OUT` (`[0.16, 1, 0.3, 1]`);
- exit: opacity `1 -> 0`, `120 ms`, existing `EASE_OUT`;
- no position/scale change for skeleton groups;
- reduced motion keeps the same short opacity transition but disables the infinite pulse.

Match existing geometry instead of inventing decorative cards:

- expanded desktop sidebar: `17rem` / 272 px (`ChatWorkspace` already passes this);
- collapsed rail: existing `4.25rem` / 68 px token from `AnimatedSidebar`;
- header: existing `min-h-14` / 56 px;
- sidebar group label: existing `h-7` / 28 px;
- sidebar row placeholders: `min-h-9` / 36 px, matching `ConversationRow`;
- initial catalog: two project rows and five recent rows, with varied title widths but identical row padding/alignment;
- transcript: the existing `max-w-3xl`, horizontal padding, message gaps, and bottom alignment; use three representative rows (user, assistant text lines, user) rather than generic centered bars;
- composer skeleton: match the current `max-w-3xl`, rounded-2xl prompt frame, two text rows, and action row. It is used only before authentication; after authentication the actual composer stays mounted.

Every skeleton shape is `aria-hidden="true"`. Each independently pending resource has one stable `role="status"` string and scopes `aria-busy="true"` to its region. Do not announce every placeholder.

## Repo conventions to follow

- The project is Vite + React + Tailwind 4 with Base UI/shadcn and an `@beui` registry. The current config resolves UI primitives to `apps/web/src/components/ui` and global CSS to `apps/web/src/index.css`.
- Use semantic `bg-muted`/`text-muted-foreground`; do not add raw light/dark colors.
- Use the shadcn `Skeleton`, not hand-written `animate-pulse` divs.
- Keep application-specific compositions under `apps/web/src/features/chat/components/loading/`; do not put chat layout into the generic UI primitive.
- Preserve sidebar text/icon axes and widths. The established values are text x = 26 px, rail icon center x = 34 px, expanded width 272 px, collapsed width 68 px.
- Use `EASE_OUT` from `apps/web/src/lib/ease.ts`; do not add a parallel curve or retune the upstream beUI token.
- Use Motion's `AnimatePresence`/`motion` already installed; do not add another animation package.

## Steps

1. From `apps/web`, preview and add `skeleton` with the shadcn CLI. Read the generated file after installation, then change only its animation class to the reduced-motion-safe class shown above.
2. Start the integrated feature motion module at `apps/web/src/features/chat/motion/conversation-motion.ts` with the skeleton delay/enter/exit values and the existing `EASE_OUT` import. Add application-owned loading compositions under `apps/web/src/features/chat/components/loading/`:
   - `chat-shell-skeleton.tsx` with `variant="new" | "conversation"` for session/route fallback;
   - `chat-sidebar-skeleton.tsx` for catalog/project loading;
   - `conversation-skeleton.tsx` for title/message geometry;
   - `loading-presence.tsx` for the exact 150/160/120 ms behavior and reduced-motion branch, importing those values from the feature motion module. Key and cancel its delay timer on ready, error, unmount, and route change so a stale B timer cannot mount over C.
3. Add a chat-specific `ChatRouteFallback` and assign it only to the protected root chat route. Read the URL through React Router location/match APIs and pass only `variant="new" | "conversation"` to `ChatShellSkeleton`. Keep `/sign` on its existing auth/neutral fallback so lazy-loading the sign page never flashes chat chrome. Do not parse or store an ID in skeleton state.
4. In `ChatPage`, replace blank session branches with the same route-aware `ChatShellSkeleton` and one accessible status, `Loading your workspace…`. Preserve the existing sign-in redirect and retryable session error.
5. Consume Plan 001's catalog status in `ChatSidebar`:
   - pending initial catalog -> group labels plus skeleton rows;
   - ready empty catalog -> current `Empty` components and copy;
   - refreshing -> keep real rows, set sidebar region busy, and expose a compact status without replacing rows;
   - error without cached data -> sidebar-scoped error/retry, not a transcript takeover.
6. Refactor `ChatWorkspace` around route identity:
   - `centered` is true only for the explicit new-conversation route, never because `messages.length === 0`;
   - render a single `ChatComposer` instance in a stable composer region for all authenticated states;
   - existing-conversation loading/error/not-found changes only the transcript region;
   - change the outer `<main>` to a non-landmark wrapper so `AnimatedSidebarInset` remains the one main landmark.
7. Extend `PromptInput`/`ChatComposer` with a submission-only disabled state:
   - existing detail pending/error means the textarea stays mounted, focused/editable, and retains its current internal value;
   - the submit action and Enter submission are disabled until the rendered active conversation record is ready;
   - streaming continues to use the current `loading`/stop behavior;
   - do not add a controlled draft store or per-conversation values.
8. Add transcript-scoped ready states:
   - `not-found`: `Conversation not found` plus a New conversation action;
   - retryable error: existing error copy semantics plus Try again;
   - cached refresh failure: keep content and show a non-blocking scoped alert/retry.
9. Add unit/architecture tests for the state matrix where pure rendering decisions can be extracted. Keep rendered animation behavior for browser QA in the verification section; do not add a component-test stack solely for this plan.

## Boundaries

- Do NOT show project/recent empty-state copy until catalog status is `ready`.
- Do NOT show transcript skeletons on the base `/` route.
- Do NOT show the chat-shell skeleton on `/sign` or `/login`.
- Do NOT center the composer based on message count; use route identity.
- Do NOT unmount the authenticated composer during detail loading, error, refresh, or A -> B navigation.
- Do NOT implement per-conversation drafts or persist draft text. One currently mounted uncontrolled composer is the intended interim behavior.
- Do NOT let a pending detail submit to an unknown/not-ready target.
- Do NOT replace cached content with a skeleton during refresh; retain content and scoped updating/error feedback.
- Do NOT add shimmer gradients, custom keyframes, raw colors, or skeleton-specific shadows.
- Do NOT alter the 272/68 px sidebar geometry, group names/copy, prompt copy, or existing empty-state product copy.
- If Plan 001 has not landed or does not expose independent catalog/detail statuses, stop; do not recreate a second loading-state system inside components.

## Verification

- **Mechanical**:
  - `npm run web:lint`
  - `npm run web:typecheck`
  - `npm run web:test`
  - `npm run web:build`
  - `node --test scripts/tests/web-architecture.test.mjs`
  - `git diff --check`
- **Feel check**:
  - cold-load `/` and a direct `/conversations/:id` with network throttling; the skeleton geometry must already resemble the eventual route and must never show the wrong transcript/base composition;
  - at 10% playback speed, confirm a skeleton group enters once and exits once; bars do not independently slide or scale;
  - switch A -> cached B: no skeleton flash; switch A -> uncached slow B: skeleton appears only after 150 ms;
  - enable reduced motion: placeholder pulse stops, position never changes, and the 120/160 ms opacity continuity remains;
  - type text in A, switch to B while B loads, then back to A: the one composer DOM node and current text remain; submit is unavailable until the rendered target is ready.
- **Accessibility/layout check**:
  - one main landmark only;
  - one named loading status per pending resource, placeholder shapes hidden from the accessibility tree;
  - no false empty announcements;
  - desktop expanded/collapsed sidebar, 390 px, 320 px, 200% zoom, light, and dark retain the existing axes and avoid overflow.
- **Done when**: loading never blanks stable chrome, base and conversation routes have distinct correct skeletons, catalog/detail states cannot impersonate empty content, and the real authenticated composer no longer remounts on conversation loading/navigation.
