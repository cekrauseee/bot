export type SeedMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  activities?: Record<string, unknown>[]
  model?: 'gpt-5.6-sol' | 'gpt-5.6-luna'
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  speed?: 'standard' | 'fast'
  durationSeconds?: number
  minuteOffset: number
}

export type SeedConversation = {
  key: string
  title: string
  daysAgo: number
  messages: SeedMessage[]
}

const markdown = (...lines: string[]) => lines.join('\n')

const curatedSeedConversations: SeedConversation[] = [
  {
    key: 'markdown-reference',
    title: 'Markdown component reference',
    daysAgo: 0,
    messages: [
      {
        key: 'md-request',
        role: 'user',
        content:
          'Create a compact Markdown reference that exercises every element our chat renderer supports.',
        minuteOffset: 0,
      },
      {
        key: 'md-answer',
        role: 'assistant',
        reasoning:
          'I grouped the examples by reading pattern so the rendered result is useful as a visual fixture, not merely a syntax checklist.',
        activities: [
          {
            id: 'md-step-outline',
            type: 'step',
            label: 'Assemble renderer coverage',
            status: 'complete',
          },
        ],
        content: markdown(
          '# Markdown reference',
          '',
          'This paragraph combines **strong emphasis**, *subtle emphasis*, ~~removed text~~, and `inline code`.',
          '',
          '> A useful interface makes structure visible without making the content feel heavy.',
          '',
          '## Lists',
          '',
          '- Keep each item focused.',
          '  - Preserve semantic order.',
          '  - Keep labels concise.',
          '- Finish with an explicit outcome.',
          '',
          '1. Inspect the current state.',
          '2. Make the smallest coherent change.',
          '3. Verify the complete flow.',
          '',
          '- [x] Persist the conversation',
          '- [x] Render GitHub-flavored Markdown',
          '- [ ] Review both appearances',
          '',
          '## Comparison',
          '',
          '| Element | Best use | Example |',
          '| --- | --- | --- |',
          '| Paragraph | Explanation | A complete thought |',
          '| List | Related items | Requirements |',
          '| Table | Exact comparison | Options |',
          '',
          '## TypeScript',
          '',
          '```typescript',
          'type Release = {',
          '  ready: boolean',
          '  checks: string[]',
          '}',
          '',
          "const release: Release = { ready: true, checks: ['lint', 'test'] }",
          '```',
          '',
          '## Command',
          '',
          '```bash',
          'npm run api:typecheck',
          '```',
          '',
          '---',
          '',
          'Read the [CommonMark specification](https://spec.commonmark.org/) for the syntax baseline.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 18,
        minuteOffset: 1,
      },
      {
        key: 'md-followup',
        role: 'user',
        content:
          'Add JSON and diff examples, plus both inline and display math.',
        minuteOffset: 4,
      },
      {
        key: 'md-extensions',
        role: 'assistant',
        reasoning:
          'I kept the samples small and valid so code highlighting, overflow, links, and math delimiters can all be inspected in one turn.',
        activities: [
          {
            id: 'md-tool-preview',
            type: 'tool',
            action: 'Rendered',
            target: 'Markdown fixture',
            status: 'complete',
          },
        ],
        content: markdown(
          '## JSON payload',
          '',
          '```json',
          '{',
          '  "conversationId": "local-only",',
          '  "status": "completed",',
          '  "features": ["markdown", "history", "streaming"]',
          '}',
          '```',
          '',
          '## Focused diff',
          '',
          '```diff',
          '- const persistence = "provider"',
          '+ const persistence = "application database"',
          '```',
          '',
          'Inline math: the retry budget is $r = 3$.',
          '',
          'Display math:',
          '',
          '$$',
          'T_{total} = T_{queue} + T_{stream} + T_{persist}',
          '$$',
          '',
          'The fixture now covers structured data, a before-and-after change, and formulas.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 14,
        minuteOffset: 5,
      },
      {
        key: 'md-review-request',
        role: 'user',
        content:
          'Which renderer edge cases should I inspect after adding these examples?',
        minuteOffset: 9,
      },
      {
        key: 'md-review-answer',
        role: 'assistant',
        reasoning:
          'I focused the review on boundaries that commonly regress when rich content moves through a streaming message renderer.',
        activities: [
          {
            id: 'md-review-step',
            type: 'step',
            label: 'Review rich-content edges',
            status: 'complete',
          },
        ],
        content: markdown(
          'Check four things:',
          '',
          '- long code lines scroll without widening the page;',
          '- tables remain readable at narrow widths;',
          '- links are visibly interactive and open safely;',
          '- math delimiters do not interfere with ordinary dollar amounts.',
          '',
          'Then compare a streaming answer with its completed version. The final Markdown should remain identical after persistence and reload.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 13,
        minuteOffset: 10,
      },
    ],
  },
  {
    key: 'history-design',
    title: 'Design resilient chat history',
    daysAgo: 1,
    messages: [
      {
        key: 'history-request',
        role: 'user',
        content: 'What should a resilient persisted chat history guarantee?',
        minuteOffset: 0,
      },
      {
        key: 'history-answer',
        role: 'assistant',
        reasoning:
          'I separated the application persistence boundary from the model-provider boundary and focused on guarantees the existing services can enforce.',
        activities: [
          {
            id: 'history-search',
            type: 'search',
            query:
              'PostgreSQL transactions persisted chat history ordered messages',
            results: [
              {
                id: 'postgres-transactions',
                title: 'PostgreSQL transaction processing',
                domain: 'postgresql.org',
                url: 'https://www.postgresql.org/docs/current/tutorial-transactions.html',
              },
            ],
          },
          {
            id: 'history-trace',
            type: 'trace',
            kind: 'architecture',
            label: 'Followed user turn through API and AI boundary',
          },
        ],
        content: markdown(
          'A durable history should provide four guarantees:',
          '',
          '1. **Application-owned identity:** conversation and message IDs belong to the product database.',
          '2. **Complete transcripts:** continuation sends ordered `user` and completed `assistant` content.',
          '3. **Atomic turns:** the user message and assistant placeholder are created together.',
          '4. **Recoverable streaming:** partial output is saved when a request is cancelled.',
          '',
          '### Recommendation',
          '',
          'Rebuild each provider request from persisted roles and content. Keep provider response IDs optional metadata; local IDs should never be sent as provider conversation identifiers.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 32,
        minuteOffset: 2,
      },
      {
        key: 'history-risk-question',
        role: 'user',
        content:
          'What breaks if a local message ID is treated as a provider response ID?',
        minuteOffset: 6,
      },
      {
        key: 'history-risk-answer',
        role: 'assistant',
        content: markdown(
          'The provider may try to resolve an identifier it never created, so generation can fail before it starts even though the local transcript is valid.',
          '',
          '**Safe boundary:** local UUIDs identify database rows and UI elements; the model request contains ordered roles and content; provider storage remains disabled unless the architecture deliberately changes.',
        ),
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        speed: 'fast',
        durationSeconds: 7,
        minuteOffset: 7,
      },
      {
        key: 'history-retry-question',
        role: 'user',
        content: 'How should a retry avoid duplicating the user turn?',
        minuteOffset: 11,
      },
      {
        key: 'history-retry-answer',
        role: 'assistant',
        reasoning:
          'I treated retry as recovery of one logical turn, not permission to append another user message.',
        activities: [
          {
            id: 'history-retry-trace',
            type: 'trace',
            kind: 'recovery',
            label: 'Matched retry to existing assistant placeholder',
          },
        ],
        content: markdown(
          'Give each turn one application-owned assistant placeholder. On retry, lock the conversation, inspect that placeholder, and either resume its recoverable state or create a new explicit attempt linked by metadata.',
          '',
          'Never insert the same user content again merely because the network request was retried. The transcript should tell one story, with the retry outcome replacing or clearly following the failed assistant attempt.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 21,
        minuteOffset: 12,
      },
    ],
  },
  {
    key: 'release-plan',
    title: 'Plan a reliable release',
    daysAgo: 3,
    messages: [
      {
        key: 'release-request',
        role: 'user',
        content:
          'Turn the next persistence change into a release plan another engineer can execute without guessing.',
        minuteOffset: 0,
      },
      {
        key: 'release-answer',
        role: 'assistant',
        reasoning:
          'I ordered the plan by dependency and made product verification a first-class release gate.',
        activities: [
          {
            id: 'release-step-contract',
            type: 'step',
            label: 'Confirm persistence contract',
            status: 'complete',
            meta: 'Database and AI boundary',
          },
          {
            id: 'release-step-checks',
            type: 'step',
            label: 'Run focused and integration checks',
            status: 'complete',
            meta: 'API, AI, and web',
          },
        ],
        content: markdown(
          '## Release plan',
          '',
          '### 1. Data contract',
          '',
          '- Apply the conversation migration.',
          '- Seed only completed alternating turns.',
          '- Confirm a seeded conversation accepts a new turn.',
          '',
          '### 2. Automated verification',
          '',
          '```bash',
          'npm run api:typecheck',
          'npm run api:test',
          'npm run api:test:integration',
          'npm run web:test',
          '```',
          '',
          '### 3. Product verification',
          '',
          '- Open conversations from every sidebar date group.',
          '- Inspect headings, lists, tables, links, and code blocks.',
          '- Continue one seeded conversation and reload.',
          '- Repeat at a narrow width and in dark appearance.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 28,
        minuteOffset: 2,
      },
      {
        key: 'release-gate-question',
        role: 'user',
        content: 'Give me one release gate I can paste into the pull request.',
        minuteOffset: 5,
      },
      {
        key: 'release-gate-answer',
        role: 'assistant',
        content:
          '> Release only after an idempotent seed run, successful continuation from seeded history, full repository verification, and rendered chat QA all pass.',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 5,
        minuteOffset: 6,
      },
      {
        key: 'release-rollback-question',
        role: 'user',
        content:
          'What is the rollback decision if the migration passes but continuation fails?',
        minuteOffset: 10,
      },
      {
        key: 'release-rollback-answer',
        role: 'assistant',
        reasoning:
          'I separated schema safety from product-flow safety: a green migration does not prove the end-to-end contract.',
        activities: [
          {
            id: 'release-rollback-step',
            type: 'step',
            label: 'Evaluate continuation failure',
            status: 'complete',
            meta: 'Stop promotion if persisted history cannot continue',
          },
        ],
        content: markdown(
          'Stop promotion and preserve the evidence. First determine whether the failure is data-specific or affects every conversation; then compare the API payload with the persisted schema.',
          '',
          'If existing rows are at risk, roll back the application release or apply a forward-compatible repair. Do not delete seeded or user data simply to make the happy path green.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 18,
        minuteOffset: 11,
      },
    ],
  },
  {
    key: 'database-review',
    title: 'Review a PostgreSQL migration',
    daysAgo: 10,
    messages: [
      {
        key: 'db-request',
        role: 'user',
        content:
          'Review the conversation schema for ordering, ownership, and concurrent streaming risks.',
        minuteOffset: 0,
      },
      {
        key: 'db-answer',
        role: 'assistant',
        reasoning:
          'I checked foreign-key ownership, deterministic ordering, and the constraint that serializes active assistant turns.',
        activities: [
          {
            id: 'db-tool-schema',
            type: 'tool',
            action: 'Reviewed',
            target: 'apps/api/src/db/schema.ts',
            additions: 0,
            deletions: 0,
          },
          {
            id: 'db-trace-index',
            type: 'trace',
            kind: 'database',
            label: 'Checked active-turn constraint',
            detail: 'One streaming assistant message per conversation',
          },
        ],
        content: markdown(
          'The core shape is sound:',
          '',
          '- `conversations.user_id` establishes ownership and cascades deletion;',
          '- `messages.conversation_id` keeps the transcript relational;',
          '- `(created_at, id)` provides stable ordering when timestamps tie;',
          '- a partial unique index prevents two streaming assistant rows in one conversation.',
          '',
          'A representative guard is:',
          '',
          '```text',
          'UNIQUE (conversation_id)',
          "WHERE role = 'assistant' AND status = 'streaming'",
          '```',
          '',
          'The transaction creating a user turn and assistant placeholder should lock the owned conversation so application checks and database constraints agree.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'xhigh',
        speed: 'standard',
        durationSeconds: 46,
        minuteOffset: 3,
      },
      {
        key: 'db-order-question',
        role: 'user',
        content: 'Why use the ID as a secondary ordering key?',
        minuteOffset: 7,
      },
      {
        key: 'db-order-answer',
        role: 'assistant',
        content:
          'Two rows can share a timestamp during fixtures or bulk writes. Sorting by `created_at` and then UUID gives the query a stable total order instead of relying on PostgreSQL row-return order.',
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        speed: 'fast',
        durationSeconds: 6,
        minuteOffset: 8,
      },
      {
        key: 'db-concurrency-question',
        role: 'user',
        content:
          'How would you prove two simultaneous sends cannot create competing active turns?',
        minuteOffset: 12,
      },
      {
        key: 'db-concurrency-answer',
        role: 'assistant',
        reasoning:
          'The proof needs both the application transaction and the database constraint exercised under real concurrency.',
        activities: [
          {
            id: 'db-concurrency-trace',
            type: 'trace',
            kind: 'concurrency',
            label: 'Two requests contend for one conversation',
          },
          {
            id: 'db-concurrency-tool',
            type: 'tool',
            action: 'Tested',
            target: 'PostgreSQL partial unique index',
            status: 'complete',
          },
        ],
        content: markdown(
          'Start two requests against the same owned conversation with a barrier before insertion. Both may pass an initial read, but only one transaction can retain the active assistant row.',
          '',
          'The test should assert one successful turn, one deterministic conflict or application error, and no orphaned `streaming` row. Run it against PostgreSQL rather than an in-memory substitute.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'xhigh',
        speed: 'standard',
        durationSeconds: 39,
        minuteOffset: 13,
      },
    ],
  },
  {
    key: 'auth-flow',
    title: 'Map the authentication flow',
    daysAgo: 18,
    messages: [
      {
        key: 'auth-request',
        role: 'user',
        content:
          'Explain how authentication should connect the web app, Node API, and session store.',
        minuteOffset: 0,
      },
      {
        key: 'auth-answer',
        role: 'assistant',
        reasoning:
          'I kept the explanation aligned with the existing split: the web app presents screens, while the Node API owns users and sessions.',
        activities: [
          {
            id: 'auth-step-boundary',
            type: 'step',
            label: 'Map ownership boundaries',
            status: 'complete',
          },
          {
            id: 'auth-trace-session',
            type: 'trace',
            kind: 'request',
            label: 'Browser → API → session cookie → user',
          },
        ],
        content: markdown(
          '## Ownership map',
          '',
          '| Concern | Owner | Result |',
          '| --- | --- | --- |',
          '| Sign-in UI | `apps/web` | Redirect or form interaction |',
          '| OAuth and callbacks | `apps/api` | Verified identity |',
          '| Session persistence | Node API database | Revocable session row |',
          '| Conversation access | Node API repository | User-scoped query |',
          '',
          'The browser should hold only the session cookie. Every conversation query must derive its user from the authenticated request, then apply `user_id` ownership in the database.',
          '',
          '```typescript',
          'const user = await auth.requireUser(request)',
          'const rows = await repository.listConversations(user.id)',
          '```',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 24,
        minuteOffset: 2,
      },
      {
        key: 'auth-security-question',
        role: 'user',
        content:
          'What should be tested before calling this flow production-ready?',
        minuteOffset: 6,
      },
      {
        key: 'auth-security-answer',
        role: 'assistant',
        content: markdown(
          '- [ ] Expired and revoked sessions are rejected.',
          '- [ ] A user cannot read another user’s conversation by changing an ID.',
          '- [ ] OAuth callback errors do not create a session.',
          '- [ ] Logout invalidates the server-side session.',
          '',
          'The most important negative test is an authenticated request with a valid-looking conversation ID owned by somebody else: it should return the same not-found boundary as any inaccessible record.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 12,
        minuteOffset: 7,
      },
      {
        key: 'auth-cookie-question',
        role: 'user',
        content: 'Which cookie properties matter for the session boundary?',
        minuteOffset: 11,
      },
      {
        key: 'auth-cookie-answer',
        role: 'assistant',
        reasoning:
          'I limited this to properties that protect the existing server-side session design and leave room for deployment configuration.',
        activities: [
          {
            id: 'auth-cookie-tool',
            type: 'tool',
            action: 'Reviewed',
            target: 'session cookie configuration',
            status: 'complete',
          },
        ],
        content: markdown(
          'Use an opaque, server-validated cookie with `HttpOnly` and an appropriate `SameSite` policy. Set `Secure` in HTTPS environments, scope the path narrowly, and give the session an explicit expiry.',
          '',
          'The cookie should not contain conversation data or authorization claims that the API cannot revoke. Test the exact production proxy arrangement because cookie flags are meaningful only when the request and deployment scheme match.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 17,
        minuteOffset: 12,
      },
    ],
  },
  {
    key: 'streaming-recovery',
    title: 'Recover a cancelled stream',
    daysAgo: 27,
    messages: [
      {
        key: 'stream-request',
        role: 'user',
        content:
          'Design the failure path when a user cancels an assistant response halfway through streaming.',
        minuteOffset: 0,
      },
      {
        key: 'stream-answer',
        role: 'assistant',
        reasoning:
          'I followed both sides of the stream: the browser abort signal and the API generator cleanup must converge on one persisted terminal state.',
        activities: [
          {
            id: 'stream-trace-sse',
            type: 'trace',
            kind: 'stream',
            label: 'SSE abort signal observed',
          },
          {
            id: 'stream-tool-repository',
            type: 'tool',
            action: 'Inspected',
            target: 'apps/api/src/db/repository.ts',
          },
        ],
        content: markdown(
          '## Cancellation path',
          '',
          '1. The browser aborts the request when the user stops generation.',
          '2. The API stops consuming provider events and catches the disconnect.',
          '3. The accumulated text and reasoning are written to the assistant row.',
          '4. The row becomes `completed` with the partial content, or an explicit error state if no usable output exists.',
          '',
          'Do not leave a permanent `streaming` row behind. A later continuation must see a stable transcript and the UI must be able to explain that the answer ended early.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'xhigh',
        speed: 'standard',
        durationSeconds: 51,
        minuteOffset: 3,
      },
      {
        key: 'stream-test-question',
        role: 'user',
        content: 'Which test catches the subtle generator-cleanup bug?',
        minuteOffset: 8,
      },
      {
        key: 'stream-test-answer',
        role: 'assistant',
        content: markdown(
          'Use a real streaming integration test that disconnects the client after a few events, then query PostgreSQL directly.',
          '',
          '```typescript',
          'await client.close()',
          "expect(await repository.getMessage(assistantId)).toMatchObject({ status: 'completed' })",
          '```',
          '',
          'A mock that only returns a finished array will miss disconnect cleanup and can falsely report success.',
        ),
        model: 'gpt-5.6-luna',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 19,
        minuteOffset: 9,
      },
      {
        key: 'stream-reconnect-question',
        role: 'user',
        content:
          'What should the UI show if the client reconnects after the partial answer was saved?',
        minuteOffset: 13,
      },
      {
        key: 'stream-reconnect-answer',
        role: 'assistant',
        reasoning:
          'I treated reload as a read of persisted truth, then made the incomplete outcome legible without inventing missing tokens.',
        activities: [
          {
            id: 'stream-reconnect-trace',
            type: 'trace',
            kind: 'reconnect',
            label: 'Reloaded persisted assistant state',
          },
          {
            id: 'stream-reconnect-step',
            type: 'step',
            label: 'Render recoverable partial answer',
            status: 'complete',
          },
        ],
        content: markdown(
          'Render the saved text as a completed message with a concise indication that generation stopped early. Offer a deliberate retry or continuation action, but do not silently replay the provider stream.',
          '',
          'The important invariant is that the message remains readable after reload and the next user turn includes the partial assistant content only if the product contract says it is part of the transcript.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 20,
        minuteOffset: 14,
      },
    ],
  },
  {
    key: 'ai-boundary',
    title: 'Keep the AI boundary replaceable',
    daysAgo: 39,
    messages: [
      {
        key: 'ai-request',
        role: 'user',
        content:
          'Where should provider-specific model behavior live in this monorepo?',
        minuteOffset: 0,
      },
      {
        key: 'ai-answer',
        role: 'assistant',
        reasoning:
          'I preserved the current polyglot boundary: Node owns product workflows, while Python owns model interaction and provider details.',
        activities: [
          {
            id: 'ai-search-docs',
            type: 'search',
            query: 'myBot monorepo Node Elysia Python FastAPI AI boundary',
            results: [
              {
                id: 'fastapi-docs',
                title: 'FastAPI documentation',
                domain: 'fastapi.tiangolo.com',
                url: 'https://fastapi.tiangolo.com/',
              },
            ],
          },
          {
            id: 'ai-step-contract',
            type: 'step',
            label: 'Define a provider-neutral request',
            status: 'complete',
          },
        ],
        content: markdown(
          '## Suggested split',
          '',
          '- `apps/web`: chat composition, navigation, and rendered process states.',
          '- `apps/api`: authentication, ownership, conversation persistence, and streaming transport.',
          '- `apps/ai`: FastAPI boundary for model calls, provider adapters, and model-specific events.',
          '- `packages/*`: reusable concerns such as email templates.',
          '',
          'The API should exchange a small event contract with the AI service. Provider names, request IDs, and retry details stay behind that boundary; the database stores product-facing content and activity metadata.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 34,
        minuteOffset: 2,
      },
      {
        key: 'ai-contract-question',
        role: 'user',
        content: 'What belongs in the event contract for a streaming answer?',
        minuteOffset: 6,
      },
      {
        key: 'ai-contract-answer',
        role: 'assistant',
        content: markdown(
          'At minimum:',
          '',
          '| Event | Purpose |',
          '| --- | --- |',
          '| `text.delta` | Append visible answer text |',
          '| `reasoning.delta` | Append optional reasoning text |',
          '| `step` | Update search or tool activity |',
          '| `done` | Mark the assistant turn complete |',
          '| `error` | Persist a recoverable failure |',
          '',
          'Each event should carry enough data to update one assistant row without exposing provider internals. This keeps the web renderer stable when the underlying model changes.',
        ),
        model: 'gpt-5.6-luna',
        reasoningEffort: 'medium',
        speed: 'fast',
        durationSeconds: 11,
        minuteOffset: 7,
      },
      {
        key: 'ai-error-question',
        role: 'user',
        content: 'How should an AI provider error cross the boundary?',
        minuteOffset: 11,
      },
      {
        key: 'ai-error-answer',
        role: 'assistant',
        reasoning:
          'I separated safe user-facing context from provider-specific diagnostics that belong in server logs or structured metadata.',
        activities: [
          {
            id: 'ai-error-trace',
            type: 'trace',
            kind: 'error',
            label: 'Normalized provider failure at AI boundary',
          },
        ],
        content: markdown(
          'Emit a stable `error` event with a user-safe code, a short message, and whether retry is appropriate. Keep raw provider payloads out of the browser and avoid turning transient upstream details into a public contract.',
          '',
          'The Node API can persist the normalized error alongside any partial content. The web renderer then has one predictable state to display, regardless of which provider failed.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        speed: 'standard',
        durationSeconds: 23,
        minuteOffset: 12,
      },
    ],
  },
  {
    key: 'local-development',
    title: 'Make local development repeatable',
    daysAgo: 62,
    messages: [
      {
        key: 'local-request',
        role: 'user',
        content:
          'Give me a short local workflow for changing the API without accidentally depending on stale infrastructure.',
        minuteOffset: 0,
      },
      {
        key: 'local-answer',
        role: 'assistant',
        reasoning:
          'I made the workflow explicit about ownership so a reset cannot disturb unrelated Compose projects or hide a configuration mismatch.',
        activities: [
          {
            id: 'local-step-inspect',
            type: 'step',
            label: 'Inspect checkout and ports',
            status: 'complete',
          },
          {
            id: 'local-tool-compose',
            type: 'tool',
            action: 'Checked',
            target: 'Compose project, service, config hash, health',
          },
        ],
        content: markdown(
          '## Safe loop',
          '',
          '1. Confirm the active checkout and branch.',
          '2. Inspect which process owns the API port.',
          '3. Reuse a container only when project, service, config hash, and health all match.',
          '4. Start the smallest required services.',
          '5. Run the focused API checks before browser work.',
          '',
          '```bash',
          'npm run infra:start',
          'npm run api:typecheck',
          'npm run api:test',
          '```',
          '',
          'If infrastructure is ambiguous, stop and inspect it. A broad Docker reset can remove data or affect another project, so it is not a substitute for diagnosis.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 22,
        minuteOffset: 2,
      },
      {
        key: 'local-reset-question',
        role: 'user',
        content: 'How do I know whether a database reset is actually needed?',
        minuteOffset: 7,
      },
      {
        key: 'local-reset-answer',
        role: 'assistant',
        content: markdown(
          'A reset is justified only when the schema or volume state cannot be repaired with the project’s migration workflow.',
          '',
          '- Check migration status and the actual database URL.',
          '- Compare the running service configuration with the current Compose file.',
          '- Preserve `.env` files and unrelated volumes.',
          '- Prefer a targeted project-owned reset, then rerun migrations.',
          '',
          'The evidence should be a reproducible mismatch, not simply “the API feels stale.”',
        ),
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        speed: 'fast',
        durationSeconds: 8,
        minuteOffset: 8,
      },
      {
        key: 'local-fixture-question',
        role: 'user',
        content:
          'What makes seeded conversations useful for checking the UI locally?',
        minuteOffset: 12,
      },
      {
        key: 'local-fixture-answer',
        role: 'assistant',
        reasoning:
          'I connected fixture design to the actual verification surface: dates, message continuity, rich Markdown, and process metadata.',
        activities: [
          {
            id: 'local-fixture-step',
            type: 'step',
            label: 'Exercise populated local workspace',
            status: 'complete',
          },
          {
            id: 'local-fixture-trace',
            type: 'trace',
            kind: 'verification',
            label: 'Seed → API → browser renderer',
          },
        ],
        content: markdown(
          'A useful fixture has varied ages for sidebar grouping, alternating turns for continuation, and enough answer shapes to exercise the renderer.',
          '',
          '- Open a recent conversation and an older one.',
          '- Verify the title and ordering after reload.',
          '- Inspect reasoning and process activities on substantive turns.',
          '- Continue one fixture and confirm the new turn appears after the seeded transcript.',
          '',
          'Fixtures should be deterministic and replaceable. They make local product checks repeatable without pretending that they validate external provider behavior.',
        ),
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        speed: 'standard',
        durationSeconds: 26,
        minuteOffset: 13,
      },
    ],
  },
]

type WorkflowBlueprint = {
  key: string
  title: string
  daysAgo: number
  subject: string
  artifact: string
  system: string
  risk: string
  outcome: string
  searchQuery: string
}

const workflowBlueprints: WorkflowBlueprint[] = [
  {
    key: 'sidebar-interaction',
    title: 'Simplify the conversation sidebar',
    daysAgo: 0,
    subject: 'the conversation sidebar interaction',
    artifact: 'apps/web/src/features/chat/components/chat-sidebar.tsx',
    system: 'the responsive chat shell',
    risk: 'hover, focus, and collapsed states can expose competing controls or move the primary action',
    outcome:
      'one stable hit target with predictable keyboard, pointer, and narrow-width behavior',
    searchQuery: 'WAI-ARIA disclosure navigation focus keyboard interaction',
  },
  {
    key: 'duplicate-stream-events',
    title: 'Trace duplicate streaming messages',
    daysAgo: 0,
    subject: 'duplicate assistant content during streaming',
    artifact: 'apps/web/src/features/chat/services/conversation-api.ts',
    system: 'the SSE event reducer and persisted transcript',
    risk: 'a delta can be applied twice when reconnect and completion paths converge',
    outcome:
      'exactly-once visible content across streaming, completion, and reload',
    searchQuery: 'server sent events reconnect idempotent event handling',
  },
  {
    key: 'cancelled-sse',
    title: 'Handle cancelled SSE streams',
    daysAgo: 1,
    subject: 'cancelled response streams',
    artifact: 'apps/api/src/modules/conversations.ts',
    system: 'the Node API streaming lifecycle',
    risk: 'an aborted browser request can leave a streaming row or lose readable partial output',
    outcome:
      'a durable partial response with deterministic recovery and no orphaned active turn',
    searchQuery: 'AbortSignal server sent events cleanup streaming response',
  },
  {
    key: 'node-api-migration',
    title: 'Sequence the Node API migration',
    daysAgo: 1,
    subject: 'the migration from the legacy API boundary to Node and Elysia',
    artifact: 'apps/api/src/app.ts',
    system: 'the polyglot monorepo service boundary',
    risk: 'moving routes without preserving ownership and error contracts can split one workflow across incompatible services',
    outcome:
      'Node owns product workflows while Python remains a narrow model-interaction service',
    searchQuery:
      'Elysia validation lifecycle error handling official documentation',
  },
  {
    key: 'react-email-otp',
    title: 'Build the OTP email locally',
    daysAgo: 2,
    subject: 'the passwordless OTP email template',
    artifact: 'packages/email/src/otp-email.tsx',
    system: 'the local React Email package and Resend transport',
    risk: 'provider-hosted copy can drift from the product and make local review impossible',
    outcome:
      'a repository-owned, testable email with transport kept behind the API',
    searchQuery: 'React Email render transactional email accessibility',
  },
  {
    key: 'otp-reservation',
    title: 'Harden OTP reservation and retries',
    daysAgo: 2,
    subject: 'OTP reservation, delivery, and verification',
    artifact: 'apps/api/src/modules/otp.ts',
    system: 'the passwordless authentication workflow',
    risk: 'consuming a code before delivery or masking provider errors can lock out a valid user',
    outcome:
      'reserve, deliver, finalize, and verify as explicit recoverable states',
    searchQuery:
      'one time password retry rate limit secure verification guidance',
  },
  {
    key: 'dark-mode-review',
    title: 'Review chat dark appearance',
    daysAgo: 3,
    subject: 'dark appearance across the chat workspace',
    artifact: 'apps/web/src/index.css',
    system: 'Tailwind semantic color tokens',
    risk: 'hardcoded surface colors can flatten hierarchy and fail contrast outside the light theme',
    outcome:
      'the same information hierarchy in light, dark, and increased-contrast settings',
    searchQuery: 'WCAG contrast non text UI components dark mode',
  },
  {
    key: 'mobile-chat-layout',
    title: 'Verify the mobile chat layout',
    daysAgo: 4,
    subject: 'the chat workspace at narrow widths',
    artifact: 'apps/web/src/features/chat/components/chat-workspace.tsx',
    system: 'the responsive message list, sidebar, and composer',
    risk: 'wide Markdown, fixed controls, or safe-area omissions can create horizontal overflow',
    outcome:
      'a 390-pixel flow with readable messages, reachable controls, and stable scrolling',
    searchQuery: 'CSS safe area inset mobile viewport responsive overflow',
  },
  {
    key: 'api-rate-limits',
    title: 'Design API rate limits',
    daysAgo: 5,
    subject: 'rate limiting for authentication and chat endpoints',
    artifact: 'apps/api/src/middleware/rate-limit.ts',
    system: 'the authenticated Node API',
    risk: 'one global limit can punish normal chat usage while remaining too permissive for OTP abuse',
    outcome:
      'endpoint-specific budgets with safe retry guidance and observable enforcement',
    searchQuery: 'OWASP rate limiting authentication API retry after',
  },
  {
    key: 'docker-ownership',
    title: 'Protect local Docker ownership',
    daysAgo: 6,
    subject: 'local infrastructure discovery and reuse',
    artifact: 'scripts/infrastructure.mjs',
    system: 'project-owned Docker Compose services',
    risk: 'a port match alone can reuse or stop infrastructure owned by another checkout',
    outcome:
      'reuse only after project, service, configuration, and health all match',
    searchQuery: 'Docker Compose project labels config hash healthcheck',
  },
  {
    key: 'postgres-backups',
    title: 'Plan PostgreSQL backup recovery',
    daysAgo: 8,
    subject: 'backup and restore for conversation data',
    artifact: 'apps/api/src/db/schema.ts',
    system: 'the production PostgreSQL datastore',
    risk: 'a successful backup command does not prove that messages, ownership, and ordering can be restored',
    outcome:
      'a rehearsed restore with integrity checks and an explicit recovery objective',
    searchQuery: 'PostgreSQL backup restore verification pg_dump official',
  },
  {
    key: 'feature-boundaries',
    title: 'Refactor chat feature boundaries',
    daysAgo: 10,
    subject: 'business logic leaking into page components',
    artifact: 'apps/web/src/features/chat',
    system: 'the feature-based frontend architecture',
    risk: 'page-owned state and transport logic make behavior hard to test and reuse',
    outcome:
      'pages compose features while hooks and services own interaction and data flow',
    searchQuery: 'React feature based architecture hooks service boundaries',
  },
  {
    key: 'markdown-bundle',
    title: 'Reduce the Markdown bundle',
    daysAgo: 12,
    subject: 'the rich Markdown renderer bundle',
    artifact:
      'apps/web/src/features/chat/components/messages/markdown-response.tsx',
    system: 'the Vite production build and lazy response renderer',
    risk: 'syntax highlighting and math support can dominate the initial chat payload',
    outcome:
      'rich completed responses without delaying the first usable workspace render',
    searchQuery: 'Vite code splitting dynamic import chunk optimization',
  },
  {
    key: 'flaky-integration-test',
    title: 'Diagnose a flaky integration test',
    daysAgo: 14,
    subject: 'an intermittent conversation continuation failure',
    artifact: 'apps/api/tests/conversations.integration.test.ts',
    system: 'the PostgreSQL-backed API test suite',
    risk: 'timing-based assertions can hide a real concurrency defect or create noise unrelated to behavior',
    outcome:
      'a deterministic barrier-based test that proves the intended transaction boundary',
    searchQuery:
      'PostgreSQL concurrent transaction integration test deterministic barrier',
  },
  {
    key: 'pull-request-review',
    title: 'Prepare a focused pull request',
    daysAgo: 17,
    subject: 'a persistence and renderer pull request',
    artifact: 'the current Git diff and verification output',
    system: 'the repository review workflow',
    risk: 'mixing unrelated edits or overstating verification increases review cost and weakens trust',
    outcome:
      'a scoped diff, evidence-backed summary, and explicit remaining risk',
    searchQuery:
      'GitHub pull request review small focused changes best practices',
  },
  {
    key: 'keyboard-navigation',
    title: 'Audit keyboard navigation',
    daysAgo: 20,
    subject: 'keyboard and screen-reader behavior in chat controls',
    artifact: 'apps/web/src/features/chat/components',
    system: 'the composer, sidebar, menus, and process disclosure',
    risk: 'custom interaction states can trap focus or expose unlabeled icon-only controls',
    outcome:
      'logical tab order, visible focus, semantic labels, and predictable disclosure behavior',
    searchQuery: 'WAI ARIA disclosure pattern keyboard focus visible',
  },
  {
    key: 'conversation-cache',
    title: 'Investigate stale conversation lists',
    daysAgo: 24,
    subject: 'stale sidebar data after creating or renaming a conversation',
    artifact: 'apps/web/src/features/chat/hooks/use-conversations.ts',
    system: 'the client cache and conversation API',
    risk: 'optimistic updates and background refresh can reorder or overwrite a newer local state',
    outcome:
      'one cache identity with explicit mutation, reconciliation, and invalidation rules',
    searchQuery: 'SWR mutation optimistic update race condition rollback',
  },
  {
    key: 'request-observability',
    title: 'Add conversation observability',
    daysAgo: 28,
    subject: 'diagnostics for an end-to-end chat turn',
    artifact: 'apps/api/src/modules/conversations.ts',
    system: 'browser, API, AI service, and PostgreSQL request boundaries',
    risk: 'logs without shared identifiers cannot distinguish queue, model, network, and persistence latency',
    outcome:
      'privacy-safe structured events correlated by one application turn ID',
    searchQuery:
      'OpenTelemetry trace context HTTP streaming spans semantic conventions',
  },
  {
    key: 'tool-approval-flow',
    title: 'Design tool approval states',
    daysAgo: 32,
    subject: 'approval before a consequential agent tool runs',
    artifact: 'apps/web/src/features/chat/components/tools/tool-approval.tsx',
    system: 'the agent response event model',
    risk: 'an ambiguous approval can authorize a broader action than the user intended',
    outcome:
      'specific scope, clear consequences, durable decision state, and safe retry behavior',
    searchQuery: 'human in the loop tool approval UX security scope',
  },
  {
    key: 'file-uploads',
    title: 'Plan secure file uploads',
    daysAgo: 38,
    subject: 'attachments in a persisted conversation',
    artifact: 'apps/api/src/modules/attachments.ts',
    system: 'the web composer, object storage, and conversation database',
    risk: 'trusting names or MIME headers can expose unsafe content or orphan storage objects',
    outcome:
      'validated uploads with explicit ownership, lifecycle, and rendering contracts',
    searchQuery: 'OWASP file upload cheat sheet content type validation',
  },
  {
    key: 'model-routing',
    title: 'Evaluate model routing',
    daysAgo: 45,
    subject: 'routing between fast and deep-reasoning model options',
    artifact: 'apps/ai/src/my_bot_ai/features/agent/service.py',
    system: 'the provider-neutral AI boundary',
    risk: 'silent routing changes can alter latency, cost, and answer quality without a product decision',
    outcome:
      'explicit model selection with measured defaults and preserved user intent',
    searchQuery: 'LLM routing evaluation latency cost quality methodology',
  },
  {
    key: 'session-security',
    title: 'Review session security',
    daysAgo: 55,
    subject: 'session creation, rotation, and revocation',
    artifact: 'apps/api/src/modules/session.ts',
    system: 'the browser and Node authentication boundary',
    risk: 'long-lived or unrotated credentials increase the impact of token disclosure',
    outcome:
      'revocable server-side sessions with narrow cookie scope and explicit expiration',
    searchQuery: 'OWASP session management cookie rotation expiration',
  },
  {
    key: 'incident-postmortem',
    title: 'Write a streaming incident review',
    daysAgo: 75,
    subject:
      'a production incident that left assistant turns in a streaming state',
    artifact: 'incident notes, API logs, and affected database rows',
    system: 'the complete conversation delivery path',
    risk: 'a narrative focused on one symptom can miss the retry and cleanup conditions that made impact persist',
    outcome:
      'a blameless timeline, verified causes, repair owners, and measurable prevention work',
    searchQuery:
      'site reliability incident postmortem timeline corrective actions',
  },
  {
    key: 'dependency-upgrade',
    title: 'Upgrade foundational dependencies',
    daysAgo: 110,
    subject: 'a coordinated Vite, React, and Elysia dependency upgrade',
    artifact: 'package.json and package-lock.json',
    system: 'the JavaScript workspace and Turborepo task graph',
    risk: 'upgrading by version number alone can miss migrations, peer constraints, and changed runtime behavior',
    outcome:
      'a staged upgrade justified by official guidance and verified through product flows',
    searchQuery: 'Vite React Elysia migration guide latest stable release',
  },
]

const longReasoningSummary = (
  blueprint: Pick<
    WorkflowBlueprint,
    'title' | 'subject' | 'system' | 'risk' | 'outcome'
  >,
  phase: string,
  evidence: string,
) =>
  markdown(
    `I started by treating ${blueprint.subject} as part of ${blueprint.system}, not as an isolated component. For the ${phase} phase, I mapped the visible symptom to the state and ownership boundaries that can actually produce it, then separated confirmed evidence from assumptions that still need a direct check.`,
    '',
    `The main failure mode is that ${blueprint.risk}. I therefore followed the data and interaction path in both directions, checked the relevant artifact, and compared the happy path with cancellation, retry, stale state, and narrow-width behavior. ${evidence}`,
    '',
    `The response is organized around a verifiable outcome: ${blueprint.outcome}. I kept the recommendation bounded to the current architecture, called out the decision points explicitly, and ended with checks that another engineer can reproduce without relying on hidden context.`,
  )

const processActivities = (
  blueprint: WorkflowBlueprint,
  phase: string,
  index: number,
): Record<string, unknown>[] => {
  const prefix = `${blueprint.key}-${phase}`
  const artifact =
    blueprint.artifact.startsWith('apps/') ||
    blueprint.artifact.startsWith('packages/') ||
    blueprint.artifact.startsWith('scripts/') ||
    blueprint.artifact === 'package.json'
      ? `/workspace/${blueprint.artifact}`
      : '/workspace'
  const activity = (
    suffix: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id: `${prefix}-${suffix}`,
    ...value,
  })
  const context = activity('request', {
    type: 'trace',
    kind: 'request',
    label: `Mapped ${blueprint.subject}`,
    detail: blueprint.system,
  })
  const risk = activity('reasoning', {
    type: 'text',
    content: `The critical edge is that ${blueprint.risk}. I kept that boundary visible while narrowing the change.`,
  })
  const result = activity('result', {
    type: 'step',
    label:
      index === 5
        ? 'Prepared the final handoff'
        : 'Recorded the next verifiable result',
    status: 'complete',
    meta: blueprint.outcome,
  })

  if (index === 0) {
    return [
      context,
      activity('delegate', {
        type: 'trace',
        kind: 'child',
        label: 'Delegated repository discovery',
        detail:
          'A focused agent mapped the relevant files and ownership boundaries',
        status: 'completed',
      }),
      activity('list-feature', {
        type: 'tool',
        action: 'filesystem_list',
        target:
          artifact === '/workspace'
            ? artifact
            : artifact.slice(0, artifact.lastIndexOf('/')),
        status: 'completed',
      }),
      activity('list-root', {
        type: 'tool',
        action: 'filesystem_list',
        target: '/workspace',
        status: 'completed',
      }),
      activity('read-owner', {
        type: 'tool',
        action: 'filesystem_read',
        target: artifact,
        status: 'completed',
      }),
      activity('read-contract', {
        type: 'tool',
        action: 'filesystem_read',
        target: '/workspace/package.json',
        status: 'completed',
      }),
      risk,
      activity('search-contract', {
        type: 'search',
        query: blueprint.searchQuery,
        status: 'completed',
        moreCount: 3,
      }),
      activity('search-edge', {
        type: 'search',
        query: `${blueprint.subject} cancellation retry edge cases`,
        status: 'completed',
        moreCount: 1,
      }),
      result,
    ]
  }

  if (index === 1) {
    return [
      context,
      risk,
      activity('question', {
        type: 'tool',
        action: 'ask_user',
        target: 'Confirm the implementation boundary',
        status: 'completed',
      }),
      activity('constraint-owner', {
        type: 'trace',
        kind: 'architecture',
        label: 'Preserved the owning boundary',
        detail: blueprint.system,
      }),
      activity('read-owner', {
        type: 'tool',
        action: 'filesystem_read',
        target: artifact,
        status: 'completed',
      }),
      activity('read-guidance', {
        type: 'tool',
        action: 'filesystem_read',
        target: '/workspace/AGENTS.md',
        status: 'completed',
      }),
      activity('decision', {
        type: 'step',
        label: 'Requested approval before implementation',
        status: 'complete',
      }),
      result,
    ]
  }

  if (index === 2) {
    return [
      context,
      activity('approval', {
        type: 'trace',
        kind: 'approval',
        label: 'Received approval for the scoped implementation',
        detail: 'Implementation and focused validation only',
      }),
      activity('write-owner', {
        type: 'tool',
        action: 'filesystem_write',
        target: artifact,
        status: 'completed',
        additions: 42,
        deletions: 17,
      }),
      activity('write-test', {
        type: 'tool',
        action: 'filesystem_write',
        target: '/workspace/apps/api/tests/seed.test.ts',
        status: 'completed',
        additions: 28,
        deletions: 4,
      }),
      risk,
      activity('format', {
        type: 'tool',
        action: 'shell_exec',
        target:
          'npm exec prettier -- --write apps/api/src/db/seed-data.ts apps/api/tests/seed.test.ts',
        status: 'completed',
      }),
      activity('diff-check', {
        type: 'tool',
        action: 'shell_exec',
        target: 'git diff --check',
        status: 'completed',
      }),
      result,
    ]
  }

  if (index === 3) {
    return [
      context,
      activity('seed-test', {
        type: 'tool',
        action: 'shell_exec',
        target: 'npm run test --workspace=@my-bot/api -- seed.test.ts',
        status: 'completed',
      }),
      activity('web-test', {
        type: 'tool',
        action: 'shell_exec',
        target:
          'npm run test --workspace=@my-bot/web -- response-process.test.ts',
        status: 'completed',
      }),
      activity('typecheck', {
        type: 'tool',
        action: 'shell_exec',
        target: 'npm run typecheck --workspace=@my-bot/web',
        status: 'completed',
      }),
      risk,
      activity('browser-open', {
        type: 'tool',
        action: 'browser_open',
        target: 'http://localhost:5173/conversations/seed',
        status: 'completed',
      }),
      activity('browser-snapshot', {
        type: 'tool',
        action: 'browser_snapshot',
        status: 'completed',
      }),
      activity('browser-click', {
        type: 'tool',
        action: 'browser_click',
        target: 'Process disclosure',
        status: 'completed',
      }),
      activity('browser-close', {
        type: 'tool',
        action: 'browser_close',
        status: 'completed',
      }),
      result,
    ]
  }

  if (index === 4) {
    return [
      context,
      activity('browser-open-failed', {
        type: 'tool',
        action: 'browser_open',
        target: 'http://localhost:5173/conversations/seed',
        status: 'failed',
      }),
      activity('browser-snapshot-failed', {
        type: 'tool',
        action: 'browser_snapshot',
        status: 'failed',
      }),
      risk,
      activity('browser-open', {
        type: 'tool',
        action: 'browser_open',
        target: 'http://localhost:5173/conversations/seed',
        status: 'completed',
      }),
      activity('browser-snapshot', {
        type: 'tool',
        action: 'browser_snapshot',
        status: 'completed',
      }),
      activity('browser-close', {
        type: 'tool',
        action: 'browser_close',
        status: 'completed',
      }),
      activity('search-recovery', {
        type: 'search',
        query: `${blueprint.subject} recovery strategy`,
        status: 'completed',
      }),
      activity('search-concurrency', {
        type: 'search',
        query: `${blueprint.subject} concurrent state ownership`,
        status: 'completed',
      }),
      result,
    ]
  }

  return [
    context,
    activity('read-owner', {
      type: 'tool',
      action: 'filesystem_read',
      target: artifact,
      status: 'completed',
    }),
    activity('read-test', {
      type: 'tool',
      action: 'filesystem_read',
      target: '/workspace/apps/api/tests/seed.test.ts',
      status: 'completed',
    }),
    activity('status', {
      type: 'tool',
      action: 'shell_exec',
      target: 'git status --short',
      status: 'completed',
    }),
    activity('focused-checks', {
      type: 'tool',
      action: 'shell_exec',
      target: 'npm run test --workspace=@my-bot/api -- seed.test.ts',
      status: 'completed',
    }),
    activity('review', {
      type: 'trace',
      kind: 'child',
      label: 'Delegated a focused verification pass',
      detail: 'Checked the seed contract and process-family coverage',
      status: 'completed',
    }),
    risk,
    result,
  ]
}

const assistantMessage = (
  blueprint: WorkflowBlueprint,
  index: number,
  phase: string,
  content: string,
  minuteOffset: number,
  evidence: string,
): SeedMessage => ({
  key: `${blueprint.key}-${phase}-answer`,
  role: 'assistant',
  reasoning: longReasoningSummary(blueprint, phase, evidence),
  activities: processActivities(blueprint, phase, index),
  content,
  model: index === 1 || index === 4 ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
  reasoningEffort:
    index === 0 ? 'high' : index === 2 || index === 4 ? 'xhigh' : 'medium',
  speed: index === 1 || index === 4 ? 'fast' : 'standard',
  durationSeconds: [74, 48, 126, 91, 163, 58][index],
  minuteOffset,
})

const buildWorkflowConversation = (
  blueprint: WorkflowBlueprint,
): SeedConversation => ({
  key: blueprint.key,
  title: blueprint.title,
  daysAgo: blueprint.daysAgo,
  messages: [
    {
      key: `${blueprint.key}-diagnose-request`,
      role: 'user',
      content: `Investigate ${blueprint.subject}. I want the actual cause and the complete path involved, not a superficial patch.`,
      minuteOffset: 0,
    },
    assistantMessage(
      blueprint,
      0,
      'diagnosis',
      markdown(
        `## Diagnosis`,
        '',
        `The issue sits at the boundary between **${blueprint.system}** and the behavior represented in \`${blueprint.artifact}\`.`,
        '',
        'I traced three layers:',
        '',
        `1. the state that initiates ${blueprint.subject};`,
        '2. the transport or interaction that carries that state;',
        '3. the persisted or rendered result that must remain stable after reload.',
        '',
        `The highest-risk condition is clear: ${blueprint.risk}. That explains why a local happy-path check can pass while the complete workflow still fails.`,
        '',
        '### Evidence to preserve',
        '',
        `- owning artifact: \`${blueprint.artifact}\`;`,
        `- system boundary: ${blueprint.system};`,
        '- before/after state for the same logical operation;',
        '- one reproducible edge case with timestamps and identifiers.',
      ),
      2,
      'The initial pass found enough evidence to describe the failure boundary without yet assuming the implementation shape.',
    ),
    {
      key: `${blueprint.key}-constraints-request`,
      role: 'user',
      content:
        'Before changing anything, list the constraints you will preserve and the tradeoffs that need an explicit decision.',
      minuteOffset: 6,
    },
    assistantMessage(
      blueprint,
      1,
      'constraints',
      markdown(
        '## Constraints',
        '',
        `I will preserve the public behavior of ${blueprint.system} while isolating the change to \`${blueprint.artifact}\` and its direct consumers.`,
        '',
        '| Boundary | Preserve | Verify |',
        '| --- | --- | --- |',
        '| Product | Existing copy and interaction hierarchy | Completed user flow |',
        '| Data | Ownership and deterministic ordering | Reload and continuation |',
        '| Failure | Readable state after interruption | Cancel and retry |',
        '| Delivery | No unrelated dependency or schema change | Focused diff |',
        '',
        '### Explicit tradeoff',
        '',
        `The simplest implementation is acceptable only if it still produces ${blueprint.outcome}. If that requires changing retention, authentication, provider storage, or a public contract, I will stop at the decision boundary instead of choosing silently.`,
        '',
        '**Approval needed:** should I proceed with the scoped implementation and focused checks, while leaving publication and external changes untouched?',
      ),
      8,
      'I converted the diagnosis into constraints that can reject an attractive but incomplete fix before implementation begins.',
    ),
    {
      key: `${blueprint.key}-implement-request`,
      role: 'user',
      content:
        'Yes. Proceed with the scoped implementation and focused checks. Keep publication and external changes out of scope, and show me what changed.',
      minuteOffset: 13,
    },
    assistantMessage(
      blueprint,
      2,
      'implementation',
      markdown(
        '## Implementation',
        '',
        'I used your approval as a narrow boundary: implementation and focused checks are authorized; publication and unrelated changes are not.',
        '',
        `I changed the owning path in \`${blueprint.artifact}\` so ${blueprint.outcome}. The implementation keeps state transitions explicit and leaves unrelated product behavior untouched.`,
        '',
        '```typescript',
        'type OperationState =',
        "  | { status: 'idle' }",
        "  | { status: 'working'; startedAt: number }",
        "  | { status: 'complete'; duration: number }",
        "  | { status: 'error'; recoverable: boolean }",
        '```',
        '',
        '### Change shape',
        '',
        '- one owner computes the transition;',
        '- consumers receive serializable state;',
        '- completion and cancellation persist an explicit terminal result;',
        '- retries reuse the logical operation rather than duplicating it.',
        '',
        `This directly removes the condition where ${blueprint.risk}.`,
      ),
      15,
      'The patch was intentionally centered on one state owner and one serializable contract so transport and presentation cannot diverge.',
    ),
    {
      key: `${blueprint.key}-verify-request`,
      role: 'user',
      content:
        'Do not stop at static checks. Verify the complete behavior, including persistence or rendered state where relevant.',
      minuteOffset: 22,
    },
    assistantMessage(
      blueprint,
      3,
      'verification',
      markdown(
        '## Verification',
        '',
        'I checked the change at the narrowest useful level first, then followed the same operation through the complete product path.',
        '',
        '- [x] Type and lint checks',
        '- [x] Focused unit coverage',
        '- [x] Integration boundary',
        '- [x] Reload or reconnect behavior',
        '- [x] Failure-state readability',
        '',
        '```bash',
        'npm run check',
        'npm run db:seed',
        '```',
        '',
        `The observed result matches the target: ${blueprint.outcome}. I also confirmed that the verification does not depend on a provider-only identifier or an unowned local service.`,
      ),
      25,
      'The verification distinguishes compilation, integration, and product acceptance instead of treating one green command as proof of the whole story.',
    ),
    {
      key: `${blueprint.key}-edges-request`,
      role: 'user',
      content:
        'Push on the edge cases. What would still break under cancellation, concurrency, stale data, or a narrow viewport?',
      minuteOffset: 33,
    },
    assistantMessage(
      blueprint,
      4,
      'hardening',
      markdown(
        '## Edge-case review',
        '',
        `The remaining risks are variations of the same boundary: ${blueprint.risk}.`,
        '',
        '| Scenario | Expected behavior | Guard |',
        '| --- | --- | --- |',
        '| Cancellation | Save or show one readable terminal state | Abort-aware finalization |',
        '| Concurrent action | Only one active owner wins | Transaction or state-machine constraint |',
        '| Stale response | Newer state remains authoritative | Versioned reconciliation |',
        '| Narrow viewport | Content wraps without moving controls | Intrinsic sizing and overflow containment |',
        '| Reload | The same transcript and status return | Application-owned persistence |',
        '',
        '> A successful happy path is evidence for one path, not proof that the state model is complete.',
        '',
        'I added or retained checks at each boundary so a regression fails close to its cause.',
      ),
      36,
      'I challenged the implementation with independent failure classes and checked that each one converges on an explicit state rather than an implicit timeout.',
    ),
    {
      key: `${blueprint.key}-handoff-request`,
      role: 'user',
      content:
        'Give me the final handoff: outcome, evidence, remaining risk, and the next safe action.',
      minuteOffset: 44,
    },
    assistantMessage(
      blueprint,
      5,
      'handoff',
      markdown(
        '## Handoff',
        '',
        `**Outcome:** ${blueprint.outcome}.`,
        '',
        `**Scope:** the implementation is centered on \`${blueprint.artifact}\` and the direct ${blueprint.system} path. No unrelated product direction or external-provider contract was changed.`,
        '',
        '**Evidence:**',
        '',
        '- the focused automated checks pass;',
        '- the complete operation reaches one terminal state;',
        '- reload preserves the expected transcript or interface state;',
        '- cancellation and retry do not duplicate the logical action;',
        '- the rendered result remains usable at the target narrow width.',
        '',
        `**Remaining risk:** production traffic may expose a timing or integration condition not represented locally, especially because ${blueprint.risk}. Keep structured diagnostics around this boundary during rollout.`,
        '',
        '**Next safe action:** review the scoped diff, run the same verification against the intended deployment environment, and only then authorize publication or migration work.',
      ),
      47,
      'The final handoff separates completed work from deployment authorization and makes the residual risk observable rather than burying it in a success claim.',
    ),
  ],
})

const enrichCuratedConversation = (
  conversation: SeedConversation,
): SeedConversation => ({
  ...conversation,
  messages: conversation.messages.map((message, index) => {
    if (message.role !== 'assistant') return message
    const phase = `turn-${Math.floor(index / 2) + 1}`
    const blueprint = {
      key: conversation.key,
      daysAgo: conversation.daysAgo,
      artifact: 'apps/api/src/db/seed-data.ts',
      searchQuery: `${conversation.title} implementation guidance`,
      title: conversation.title,
      subject: conversation.title.toLowerCase(),
      system: 'the persisted chat fixture and response renderer',
      risk: 'a short happy-path fixture can hide ordering, overflow, grouping, and continuation regressions',
      outcome:
        'a dense, realistic conversation that remains stable after seeding and reload',
    }
    const baselineActivities = processActivities(
      blueprint,
      phase,
      [0, 3, 4][Math.floor(index / 2)] ?? 5,
    )

    return {
      ...message,
      reasoning: longReasoningSummary(
        blueprint,
        phase,
        message.reasoning ??
          'The original fixture did not include a reasoning summary.',
      ),
      activities: [...baselineActivities, ...(message.activities ?? [])],
      durationSeconds: Math.max(message.durationSeconds ?? 1, 32 + index * 7),
    }
  }),
})

export const seedConversations: SeedConversation[] = [
  ...curatedSeedConversations.map(enrichCuratedConversation),
  ...workflowBlueprints.map(buildWorkflowConversation),
]

export const seedMessageCount = seedConversations.reduce(
  (total, conversation) => total + conversation.messages.length,
  0,
)
