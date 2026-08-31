# 004 — Cascade the loaded message tail within a bounded budget

- **Status**: DONE
- **Commit**: `94f4844`
- **Severity**: MEDIUM
- **Category**: Cohesion, performance, and missed opportunity
- **Estimated scope**: 2–4 files, localized transcript entrance logic

## Problem

`ChatMessageList` snapshots every message present at its first mount as initial content:

```tsx
// apps/web/src/features/chat/components/messages/chat-message-list.tsx:21 — current
const [initialMessageIds] = useState(
  () => new Set(messages.map((message) => message.id)),
)
```

Only a user text bubble appended after that snapshot receives an entrance:

```tsx
// apps/web/src/features/chat/components/messages/chat-message-list.tsx:84 — current
return message.role === "user" && block.type === "text" ? (
  <MessageBubble
    key={block.id}
    variant="solid"
    animateIn={!initialMessageIds.has(message.id)}
  >
```

Loaded histories therefore appear all at once. A naive cascade across every message is not acceptable: `MessageScroller` measures message DOM for its navigation rail and observes content growth:

```ts
// apps/web/src/features/chat/components/messages/message-scroller.tsx:204 — current
const syncRailItems = useCallback(() => {
  if (navigation !== "rail") return
  // ...query and measure every message
```

```ts
// apps/web/src/features/chat/components/messages/message-scroller.tsx:306 — current
useEffect(() => {
  const content = contentRef.current
  if (!content || typeof ResizeObserver === "undefined") return

  const observer = new ResizeObserver(() => {
    scheduleRailSync()
    // ...
  })
```

Long seeded conversations can contain many rows and rich assistant blocks. Cascading the full history would create a long attention queue, amplify observer work, and violate the 300 ms UI budget.

## Target

When a ready transcript pane enters because a conversation was opened or changed:

- the pane-level transition from Plan 003 provides overall continuity;
- at most the final four message rows cascade from oldest to newest within that tail;
- all earlier rows render immediately and statically;
- for histories with one to four rows, every row participates;
- live token updates, reasoning blocks, tool rows, and rerenders within the same conversation do not replay the history cascade;
- existing newly sent user-bubble feedback remains unchanged;
- conversation exit is owned by the pane, not by individual message rows.

Use the exact shared values from `features/chat/motion/conversation-motion.ts`:

- row enter duration: `180 ms`;
- row stagger: `30 ms`;
- maximum rows: `4`;
- initial transform: `translateY(6px)`;
- final transform: `translateY(0px)`;
- opacity: `0 -> 1`;
- easing: existing `EASE_OUT` (`[0.16, 1, 0.3, 1]`);
- final row completion: `3 * 30 ms + 180 ms = 270 ms` maximum.

Under reduced motion:

- set stagger to `0`;
- remove transform entirely;
- fade all participating rows from opacity `0 -> 1` together over `120 ms`;
- keep the complete semantic message tree available; this is visual sequencing only.

Use full `transform` strings, not Motion `y` shorthand, and do not animate height/gap/padding or add persistent `will-change`.

## Repo conventions to follow

- Keep `MessageScroller` as the only owner of scrolling, live-edge following, rail navigation, and DOM observers.
- Reuse the generic `Message` component's existing `initial`, `animate`, and `transition` props; do not add a second wrapper around every message.
- Preserve current message IDs as React keys and accessibility labels.
- Preserve the current live user-bubble entrance. Initial history IDs already prevent that bubble animation from double-running on loaded content.
- The generic `Message` currently defines an unconditional default exit transform. Add an explicit `animateOut?: boolean` (default `true` to preserve other consumers), and pass `animateOut={false}` from `ChatMessageList` so Plan 003's pane is the only exit animator during conversation navigation.
- Import `useReducedMotion` from `motion/react` and shared values from the feature motion module created in Plan 003.
- Keep the message/body geometry (`max-w-3xl`, gaps, padding, user max width) unchanged.

## Steps

1. Add and export a pure helper beside `ChatMessageList` or in `features/chat/motion/conversation-motion.ts`:

   ```ts
   export function historyCascadeStartIndex(messageCount: number, maxRows = 4) {
     return Math.max(0, messageCount - maxRows)
   }
   ```

2. Extend `ChatMessageList` with an explicit `revealHistory?: boolean` prop. Plan 003's newly mounted ready pane passes `true`; ordinary rerenders and streaming updates retain the same list instance and do not restart it.
3. In `ChatMessageList`, read reduced-motion once and calculate:
   - `cascadeStart = historyCascadeStartIndex(messages.length, 4)`;
   - `tailIndex = messageIndex - cascadeStart` for participating rows;
   - `delay = reduce ? 0 : tailIndex * 0.03`.
4. Pass motion props directly to each participating `Message`:

   ```tsx
   initial={
     reduce
       ? { opacity: 0 }
       : { opacity: 0, transform: 'translateY(6px)' }
   }
   animate={
     reduce
       ? { opacity: 1 }
       : { opacity: 1, transform: 'translateY(0px)' }
   }
   transition={{
     duration: reduce ? 0.12 : 0.18,
     ease: EASE_OUT,
     delay,
   }}
   ```

   Rows before `cascadeStart`, or all rows when `revealHistory` is false, receive the current static defaults rather than animation props.
5. In `Message`, gate its existing default `exit` target behind `animateOut` (or an equivalently explicit supported opt-out). In `ChatMessageList`, disable row exits for every transcript message; keep the pane-level 120 ms fade as the sole navigation exit.
6. Keep `initialMessageIds` scoped to the mounted conversation list so subsequently appended user messages retain the existing bubble animation. Do not use changing message length/title/status as a React key.
7. Add pure unit tests for `historyCascadeStartIndex` and delay derivation:
   - 0 rows -> no participants;
   - 1–4 rows -> start at 0;
   - 5 rows -> start at 1;
   - 100 rows -> start at 96;
   - four-row delays -> `0`, `0.03`, `0.06`, `0.09`;
   - reduced motion -> all delays `0`.
8. Do not add snapshot tests for Motion DOM timing. Use the rendered verification below.

## Boundaries

- Do NOT animate more than four message rows for a loaded conversation.
- Do NOT stagger sidebar rows, tokens, blocks within one assistant response, citations, code lines, or streaming deltas.
- Do NOT animate message exit individually during conversation navigation; Plan 003 owns the pane exit.
- Do NOT leave `Message`'s current default exit active inside the transcript pane; explicitly opt every transcript row out.
- Do NOT key `ChatMessageList` by message count, title, loading status, or stream status. Its intentional conversation-pane mount is sufficient.
- Do NOT replace or duplicate `MessageScroller` observers/scroll behavior.
- Do NOT use keyframes, `mode="wait"`, Motion `x`/`y` shorthand, layout-property animation, or persistent `will-change`.
- Do NOT exceed a 270 ms total tail sequence.
- If Plan 003 does not provide a newly mounted ready pane per conversation identity, stop and fix that boundary instead of inventing effect counters in `ChatMessageList`.

## Verification

- **Mechanical**:
  - `npm run web:lint`
  - `npm run web:typecheck`
  - `npm run web:test`
  - `npm run web:build`
  - `git diff --check`
- **Feel check**:
  - open histories with 1, 2, 4, 5, and many messages; only the last four rows cascade, top-to-bottom, and the last settles by 270 ms;
  - at 10% playback speed, verify each participating row starts 6 px below with opacity 0 and does not change layout while moving;
  - switch A -> B -> C rapidly; B's partial cascade does not queue or block C, and old rows do not animate individually on exit;
  - inspect the animation timeline during navigation and confirm exactly one pane exit rather than one exit per message row;
  - append/stream a new response in the same conversation; the loaded-history cascade does not replay on message/block/token updates;
  - navigate back to cached A; its newly entered transcript gets one bounded tail cascade, not a cascade on every state update;
  - enable reduced motion: participating rows fade together for 120 ms with no translation or stagger.
- **Performance/scroll check**:
  - use a long seeded conversation and inspect the Performance/Animations panels; no layout-property animation, long task, repeated full-history cascade, or scroll jump;
  - rail navigation and automatic initial scroll still target the correct messages;
  - the scroller remains responsive while rich assistant content and code blocks render.
- **Done when**: a loaded conversation gains the requested cascade impression, its sequence is bounded to four tail rows and 270 ms, streaming never replays it, and reduced-motion/performance behavior remains stable.
