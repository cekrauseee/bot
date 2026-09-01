# Web Application

## Responsibility

`apps/web` renders the browser experience. It uses Vite 8, React 19, React Router 8 in Data Mode, Tailwind CSS 4, and local beUI source.

## Structure

- `src/app`: application providers, routing, and route fallbacks.
- `src/pages`: route-level composition organized by URL intent.
- `src/features`: product capabilities, their components, and hooks.
- `src/components/motion`: beUI registry source and motion-aware primitives.
- `src/components`: application-shared, domain-neutral UI components.
- `src/lib`: shared utilities and motion primitives required by beUI.

## Chat feature

`src/features/chat/index.ts` is the single public entrypoint used by `ChatPage`. The page maps `AuthUser` to the application-owned user view model. `ChatFeature` owns provider-aware model preferences and composes the keyed conversation controller with presentational components. The controller derives the active identity from the rendered `conversationId` route parameter. It loads the conversation, project, model, and active-run catalogs once, caches ready detail records by conversation ID, and requires an explicit retry after a detail error. Each record owns its current plan, active run, cursor, question, and browser projection. A route-independent subscription registry keeps one replay-backed WebSocket per active run, including waiting runs and conversations that are not currently rendered. The React-free transport service owns credentialed HTTP, status-preserving errors, SSE v2 and WebSocket validation, bigint cursors, and persisted-message mapping.

`/` keeps the composer centered only until `turn.started` returns the durable server conversation ID. That event immediately accepts the request, clears the submitted draft, replaces the URL, and atomically hands the optimistic record and live operation to the server ID; no model progress is required. Failures after durable creation remain on the addressable conversation and can be retried there. The base submit action uses beUI StatefulButton pending/error states with icon-only idle/loading feedback, destructive retry styling, accessible error details, and cancellation. Direct conversation URLs load durable history. Returning to a ready record reuses its in-memory detail. Guarded late callbacks cannot write into the newly rendered conversation.

Move and delete requests update catalog records when they resolve but do not navigate from their async continuations. Canonical project-path replacement and deleted-active recovery are derived from the current route after the catalog mutation, so a slow mutation for conversation A cannot redirect a user who already navigated to B. A new turn replaces `/` with its durable conversation URL on `turn.started`. Navigating away aborts only the local initiating SSE; the global run subscription and durable cloud execution continue. Stop calls the owned cancellation route. Returning uses the continuously updated record, while reload discovers all active runs from PostgreSQL and resumes each from its string cursor over WebSocket. The sidebar shows pinned conversations above Projects, followed by a single Recents list; deletion requires an in-product confirmation.

Pinned conversations retain their project association but appear only in Pinned. Pin controls appear on row hover or keyboard focus, with a filled active state; pinned rows can only be reordered within that section, by dragging or the Move up/Move down menu actions. The Pinned section animates its height and opacity through the shared collapsible panel, respecting reduced motion. Unpinning restores the original project or Recents location. Pin metadata uses a separate server timestamp so late catalog, detail, and stream responses cannot overwrite newer pin changes or change chat recency.

Project rows can be reordered by dragging within Projects or using Move up/Move down; the chosen order survives reload without changing expansion or conversation membership. Conversation actions support inline rename with Enter to save and Escape or blur to cancel, using the same input treatment as project renaming. Generated and manual title changes flow through the same metadata clock and render with beUI TextCascade in the header and sidebar; the component swaps immediately under reduced motion. Title and project-order clocks prevent delayed requests from undoing newer metadata. Primary keyboard focus outlines the entire conversation/project row; Tab then reaches its action buttons, while rename inputs keep their own inset focus. Trailing actions overlay a fading strip without reserving title width, and marquee overflow accounts for that covered area.

Catalog failures use a compact error surface with semantic destructive border/background, a short message, and a retry control. Retrying keeps that surface mounted in a neutral loading state and preserves cached conversations. beUI ActionSwap animates its label and status icon; sidebar content fades out before collapse and fades back in as the rail expands, with reduced-motion support. Collapsed-sidebar controls constrain both hit areas and tooltip anchors to the icon rail; catalog content is inert and scroll dividers are hidden there.

Assistant text is parsed as safe Markdown. The beUI streaming response surface owns completion actions and citations, while the beUI code block renders fenced code during and after streaming. Reasoning, web searches, runtime tools, and child agents remain process activity rather than final prose. `user.input_required` renders an accessible questionnaire in the assistant response and resumes with a string or string array without flattening. The task plan is one badge above the composer and never becomes a message block. Browser frames render as a docked narrow-layout preview or a floating wide-layout picture in picture; frames are transient and are cleared when the run ends.

The composer keeps one mounted input in a stable bottom dock and translates only its surface between the centered home state and the conversation position. This movement lasts 240 ms without delay; it captures the starting position before clearing the prompt and does not restart on streamed updates or the server-ID handoff. Reduced motion changes position immediately. Ephemeral pane and message render keys survive the first server-ID handoff without becoming a second routing identity. Response status uses a stable measured container: empty processing indicators wait 150 ms to avoid flashing on immediate failures, while errors appear without that delay. Failed responses use a compact icon/text/action grid, with the retry action beside the explanation when space permits. During retry, the same error surface and description remain visible with a busy StatefulButton until successful completion; another failure updates the description and destructive Retry again state in place. The latest retryable turn uses the original prompt and model options. Retrying replaces the failed assistant attempt rather than duplicating the user message.

Composer travel uses a native `transform` animation with a `cubic-bezier(0.3, 0, 0.12, 1)` curve; width-only sidebar changes do not restart it. A conversation-scoped entry clock starts with docking. Initially visible history rows join that timeline with bounded stagger offsets and compensate for time already spent rendering; history arriving after the 240 ms deadline gets its own short reveal without restarting the composer. Unrelated conversation navigation retains its normal reveal timing. Rich transcript snapshots use React deferred rendering so urgent composer updates can commit first. A snapshot from a different conversation or an unready initial load is never displayed as current content. Completed message rows are memoized, settled response headers avoid animated-height observers, and collapsed process rows mount only when opened, remaining present briefly for their closing transition.

The composer uses one stable `ComposerSubmitAction` and StatefulButton for send, pending, retry, and Stop. The shared primitive owns icon overlap, optional label transitions, and destructive error styling; icon-only states do not mount a text measurement slot. Loading disables actions by default, while Stop explicitly remains interactive. Model selection comes from `/models`; changing providers normalizes reasoning effort and processing mode to supported values, and the Fast toggle is hidden when the model exposes only standard processing. Composer and retry surfaces are memoized behind stable callbacks, and the controller owns the last submitted prompt. Accessible action labels and retry text are caller-configurable; the application does not yet have a locale framework.

## Authentication

The `/sign` route lazy-loads the public login page. Vite reads the canonical root `.env`, and the feature service sends credentialed requests to `VITE_API_BASE_URL`. Its hook manages email, OTP, resend countdown, pending, and error state without inferring whether an account exists.

The `/` and `/conversations/:conversationId` routes are protected by a server session check. Their shared signed-in layout exposes the real Sign out action. An HTTP 401 redirects to `/sign`; an unavailable API keeps a recoverable error state instead of treating the user as signed out. Sign out uses the beUI StatefulButton with a stable leading icon column, loading feedback, and a retry state styled with semantic destructive colors, without a separate error label. A successful request navigates directly to `/sign` without an intermediate success state.

## Interface motion

Page entrances, conversation titles, and loaded-message reveals share `src/lib/interface-motion.ts`: a 12 px upward entrance, opacity, and the existing ease-out curve. Conversation reveals use a 450 ms completion window with stagger starts capped at 120 ms. Reduced motion removes displacement and stagger and uses a 120 ms opacity transition. Layout resizing is immediate under reduced motion.

`PageEntrance` provides a static page frame. `PageEntranceItem` and `usePageEntrance` animate individual sections on mount: brand, form, and legal copy on sign-in; sidebar sections, header, and content in the workspace. Each stage takes 240 ms, with starts spaced 100 ms apart so entrances overlap; three stages finish in 440 ms. These boundaries are not keyed by conversation URL, so navigating between conversations preserves the shell and composer without replaying page entrances. External Google redirects remain browser navigations.

`AuthStepTransition` coordinates email and OTP panels with a measured, animated height and a short outgoing fade. Outgoing panels remain inert and hidden from assistive technology until removed; the active input receives focus. Successful OTP verification uses router navigation, followed by the protected workspace's existing server session check, without reloading the document.

OTP success and sign-out opt into React Router view transitions for a short crossfade between routes when supported by the browser. Reduced motion disables that route snapshot animation. `LoadingTransition` overlaps session and sidebar catalog skeletons with ready content, fading outgoing layers for 120 ms and incoming layers for 160 ms; outgoing layers are inert and do not contribute layout height. No artificial loading delay is added, and conversation navigation does not remount ready content.

Keep transitions restrained, interruptible, and responsive. Reuse these application-owned tokens rather than adding independent timing constants to each feature. Automated checks do not replace rendered verification of focus, narrow layouts, or animation timing.

## Theming

`next-themes` applies a class to the root element. The default theme is `system`, and the beUI theme toggle switches between explicit light and dark appearances. An inline head script applies the initial class before React starts to avoid an incorrect-theme flash.

Theme values live in `src/index.css` as OKLCH semantic tokens. Component code consumes roles such as `background`, `foreground`, `primary`, `muted`, `border`, and `ring`.

## beUI Workflow

Search, preview, and install components with `npx shadcn@latest` and the `@beui` namespace. Review every generated file and preserve the paths reported by `npx shadcn@latest info --json`.
