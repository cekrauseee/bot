# 003 — Transition title and transcript while chrome remains mounted

- **Status**: DONE
- **Commit**: `94f4844`
- **Severity**: MEDIUM
- **Category**: Missed opportunity, cohesion, and interruptibility
- **Estimated scope**: 5–8 files, two small application-owned motion components

## Problem

During a route change, Plan 001's predecessor sets global loading while retaining the prior title/messages. The header keeps rendering that prior title until detail commits:

```ts
// apps/web/src/features/chat/services/conversation-api.ts:544 — current
setState((current) => ({ ...current, loading: true, loadError: '', turnError: '' }))
```

```tsx
// apps/web/src/features/chat/components/workspace/chat-workspace.tsx:127 — current
<ChatHeader
  title={title}
  projectName={activeProjectName}
  mobileOnly={!activeConversationId}
/>
```

The title itself is a plain text replacement:

```tsx
// apps/web/src/features/chat/components/workspace/chat-header.tsx:44 — current
<h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
  {title}
</h1>
```

The complete content region then switches among loading, error, empty, and transcript branches with no presence semantics:

```tsx
// apps/web/src/features/chat/components/workspace/chat-workspace.tsx:134 — current
{loading ? (
  // loading copy
) : loadError ? (
  // error
) : empty ? (
  // centered composer
) : (
  // transcript + composer
)}
```

Animating the whole workspace would hide the symptom by remounting/fading stable controls. It would not fix identity and would make the sidebar/header/composer feel unstable.

## Target

Animate only two semantic boundaries after Plans 001 and 002 have made their state correct:

1. the conversation identity inside the existing header;
2. the replaceable transcript pane inside stable workspace/composer chrome.

Extend the feature motion module started by Plan 002, `apps/web/src/features/chat/motion/conversation-motion.ts`, and keep all values semantic and exact:

```ts
import { EASE_OUT } from '@/lib/ease'

export const CONVERSATION_MOTION = {
  title: {
    enterDuration: 0.16,
    exitDuration: 0.12,
    offset: 4,
    blur: 2,
  },
  pane: {
    enterDuration: 0.18,
    exitDuration: 0.12,
    offset: 6,
  },
  skeleton: {
    delayMs: 150,
    enterDuration: 0.16,
    exitDuration: 0.12,
  },
  message: {
    enterDuration: 0.18,
    stagger: 0.03,
    maxCascadeRows: 4,
  },
  ease: EASE_OUT,
} as const
```

Use the existing upstream beUI `EASE_OUT` value `[0.16, 1, 0.3, 1]`; do not replace it with another curve.

### Conversation identity transition

- Keep the `<header>`, sidebar trigger, layout, and semantic `<h1>` mounted.
- Use the route conversation key, not a component key on the header.
- Resolve title/project immediately from Plan 001's catalog summary; a title skeleton is used only when no summary/detail title exists.
- Visual exit: opacity `1 -> 0`, `transform: translateY(-4px)`, `filter: blur(0px) -> blur(2px)`, `120 ms`, `EASE_OUT`.
- Visual enter: opacity `0 -> 1`, `transform: translateY(4px) -> translateY(0px)`, `filter: blur(2px) -> blur(0px)`, `160 ms`, `EASE_OUT`.
- Use `AnimatePresence initial={false} mode="popLayout"` so the existing title does not animate on page boot and old/new widths do not push each other.
- Under reduced motion: opacity only, `120 ms`, no transform, blur, or delay.
- Keep exactly one accessible title value. Mark overlapping visual motion layers `aria-hidden="true"` and expose the current title once in the semantic heading (for example, a visually hidden current-value span). Do not create two readable heading strings during exit.

Do not install/use beUI `TextCascade` for the header. The public component cascades every character with a per-letter delay; arbitrary long conversation titles can run beyond the 300 ms UI budget. The target intentionally follows the installed beUI Motion/easing vocabulary without using the wrong primitive.

### Transcript pane transition

- The containing transcript region remains mounted and keeps its dimensions.
- Key only the pane layer by `conversationKey + paneKind`, where `paneKind` is `loading | ready | error | not-found`. Map cached `refreshing` and cached refresh failures to `ready` so real content remains mounted; use `error` only when no usable detail exists. The shell/header/sidebar/composer never receive this key.
- Position entering/exiting pane layers in the same `relative min-h-0 flex-1` region so overlap cannot move the composer.
- Use `AnimatePresence initial={false} mode="sync"`; never `mode="wait"`. Navigation and active-row feedback must not wait for animation.
- Ready-pane exit: opacity `1 -> 0`, `120 ms`, `EASE_OUT`. Do not slide the old conversation across the screen.
- Ready-pane enter: opacity `0 -> 1`, `transform: translateY(6px) -> translateY(0px)`, `180 ms`, `EASE_OUT`.
- Skeleton/error/not-found presence uses the same 120/160 ms opacity behavior from Plan 002; no position change for skeletons.
- Under reduced motion: opacity only, `120 ms`, no translation.
- Use `useIsPresent()` in the pane layer. As soon as a layer begins exiting, set `aria-hidden` and `inert` so the prior conversation can be seen briefly but cannot receive focus, clicks, selection, or screen-reader navigation.
- Announce current loading/error state from the stable resource status region built in Plan 002, not from exiting layers.

Only animate `opacity`, `transform`, and the title's `2px` filter. Do not animate width, height, margin, padding, top, left, or scroll position. Do not add persistent `will-change`; add it later only if browser profiling proves first-frame stutter.

## Repo conventions to follow

- Import Motion APIs from `motion/react`, matching the rest of the repository.
- Reuse `EASE_OUT` from `apps/web/src/lib/ease.ts`; `EASE_IN_OUT` and `EASE_DRAWER` already match the app's existing beUI vocabulary.
- Keep animation meaning under `features/chat/motion`; reusable low-level primitives remain under `components/motion`.
- Follow the existing reduced-motion pattern in `apps/web/src/features/chat/components/messages/message.tsx:80` and the stable `initial={false}` pattern in `apps/web/src/components/motion/action-swap.tsx:230`.
- Preserve the current header height, typography, truncation, folder icon, project separator, and mobile-only behavior.
- Preserve `MessageScroller` as the owner of transcript scrolling; the presence wrapper sits outside it and does not manipulate scroll.

## Steps

1. Extend `apps/web/src/features/chat/motion/conversation-motion.ts` with the exact title, pane, and message constants above. Confirm Plan 002's loading presence imports the existing skeleton values from the same module.
2. Add `apps/web/src/features/chat/components/workspace/conversation-title.tsx`:
   - props: `conversationKey`, `title`, optional `projectName`, and `loadingTitle`;
   - keep one semantic heading/current string;
   - render project/title visual layers inside keyed `AnimatePresence`;
   - use full `transform` strings and the exact enter/exit/reduced-motion targets above;
   - retain truncation for long project/title strings and stable header height.
3. Replace only the identity block inside `ChatHeader` with `ConversationTitle`. Keep `ChatHeader` and `AnimatedSidebarTrigger` unkeyed.
4. Add `apps/web/src/features/chat/components/workspace/conversation-pane-presence.tsx`:
   - stable relative wrapper;
   - keyed `AnimatePresence initial={false} mode="sync"` layers;
   - a child `PresenceLayer` using `useIsPresent()` to set outgoing `inert`/`aria-hidden`;
   - exact ready/skeleton/error/reduced variants described above.
5. In `ChatWorkspace`, map Plan 001/002's active resource view to one `paneKind` and render it through `ConversationPanePresence`. Keep the one composer outside the keyed layer.
6. Confirm no parent receives `key={conversationId}` and no animation waits before navigation, active-row state, abort, or request initiation.
7. Add pure tests for pane-key derivation and title fallback selection. Do not snapshot Motion's implementation details; verify state semantics and keys.

## Boundaries

- Do NOT animate or remount the full page, `ChatFeature`, `ChatWorkspace`, `ChatShell`, `ChatSidebar`, `ChatHeader`, or `ChatComposer`.
- Do NOT queue transitions with `mode="wait"` or timers that delay navigation.
- Do NOT install `@beui/text-cascade` or introduce a character-by-character title animation.
- Do NOT reuse `ActionSwapRollText` unchanged for the header; its 90% vertical roll is designed for compact control labels, not arbitrary conversation identities.
- Do NOT animate layout properties or scroll position.
- Do NOT fade stable sidebar/header/composer chrome during A -> B.
- Do NOT add blur beyond `2px` or any duration above `180 ms` in this plan.
- Do NOT add composer center-to-dock motion; preserving its mounted identity is in scope, a large spatial movement is not.
- If Plans 001 and 002 have not produced keyed correct state and a stable composer, stop instead of animating the old global loading branch.

## Verification

- **Mechanical**:
  - `npm run web:lint`
  - `npm run web:typecheck`
  - `npm run web:test`
  - `npm run web:build`
  - `git diff --check`
- **Feel check**:
  - open A, select B, then C before B finishes. The active sidebar row and URL change immediately; no transition queues; only the most recent current pane is interactive;
  - at 10% speed, title exits upward by exactly 4 px and enters from 4 px below, while the header box/sidebar trigger do not move;
  - at 10% speed, old transcript fades for 120 ms and the ready target rises 6 px over 180 ms; composer geometry does not move or blink;
  - switch between same-project, different-project, very short-title, and truncated long-title conversations; breadcrumb/title never double-expose readable content or change header height;
  - direct-load a slow conversation: skeleton exits into ready content once; initial stable chrome does not perform a decorative page entrance;
  - enable reduced motion and repeat: title/pane retain a brief opacity transition, with no translation, blur, or queued delay.
- **Interaction/accessibility check**:
  - during an exit, Tab/click/screen-reader traversal cannot reach the outgoing transcript;
  - exactly one current h1 value and one main landmark are exposed;
  - browser Back/Forward uses the same transition and never restores stale interactive content.
- **Done when**: title and transcript changes communicate continuity within 180 ms, rapid navigation remains interruptible, outgoing content is inert, and all stable chrome—including the composer DOM identity—survives the swap.
