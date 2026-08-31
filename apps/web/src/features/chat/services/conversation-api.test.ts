import { describe, expect, it } from 'vitest'

import {
  agentRunSocketUrl,
  answerForQuestion,
  applyStreamEvent,
  initialConversationState,
  mapBrowserFrame,
  mapQuestionRequest,
  mapModelCatalog,
  mapApiMessage,
  parseEventSequence,
  parseSseBuffer,
  parseSocketMessage,
  readEventStream,
  rehydrateConversationDetail,
  type ConversationState,
} from './conversation-api'

const turnId = '00000000-0000-4000-8000-000000000001'
const runId = '00000000-0000-4000-8000-000000000002'
const frame = (sequence: number, type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({
    version: 2,
    sequence: String(sequence),
    run_id: runId,
    turn_id: turnId,
    type,
    data,
  })}\n\n`

const response = (body: string, cuts = [3, 11, 29]) => new Response(
  new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(body)
      let offset = 0
      for (const size of cuts) {
        controller.enqueue(bytes.slice(offset, Math.min(bytes.length, offset + size)))
        offset += size
      }
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset))
      controller.close()
    },
  }),
)

describe('conversation SSE protocol', () => {
  it('maps the provider-aware model capability catalog', () => {
    expect(mapModelCatalog({
      models: [
        {
          id: 'gpt-5.6-terra',
          provider: 'openai',
          label: 'GPT-5.6 Terra',
          reasoning_efforts: {
            options: ['low', 'medium', 'high', 'xhigh', 'max'],
            default: 'medium',
          },
          processing_modes: { options: ['standard', 'fast'], default: 'standard' },
        },
        {
          id: 'grok-4.6',
          provider: 'xai',
          label: 'Grok 4.6',
          reasoning_efforts: {
            options: ['low', 'medium', 'high', 'xhigh'],
            default: 'high',
          },
          processing_modes: { options: ['standard'], default: 'standard' },
        },
      ],
    })).toMatchObject([
      {
        value: 'gpt-5.6-terra',
        provider: 'openai',
        processingModes: ['standard', 'fast'],
      },
      {
        value: 'grok-4.6',
        provider: 'xai',
        defaultReasoningEffort: 'high',
        processingModes: ['standard'],
      },
    ])
  })

  it('restores the persisted processing duration from message timestamps', () => {
    const message = mapApiMessage({
      id: 'assistant',
      role: 'assistant',
      content: 'Final answer.',
      reasoning: 'Checked the request.',
      status: 'completed',
      error_message: null,
      model: 'gpt-5.6-sol',
      reasoning_effort: 'medium',
      speed: 'standard',
      activities: [],
      created_at: '2026-08-29T12:00:00.000Z',
      updated_at: '2026-08-29T12:00:18.000Z',
    })

    expect(message.processDuration).toBe(18)
  })

  it('keeps a process disclosure for completed answers without reported reasoning', () => {
    const message = mapApiMessage({
      id: 'assistant',
      role: 'assistant',
      content: 'A concise answer.',
      reasoning: null,
      status: 'completed',
      error_message: null,
      model: 'gpt-5.6-luna',
      reasoning_effort: 'low',
      speed: 'fast',
      activities: [],
      created_at: '2026-08-29T12:00:00.000Z',
      updated_at: '2026-08-29T12:00:04.000Z',
    })

    expect(message.processDuration).toBe(4)
    expect(message.blocks[0]).toMatchObject({
      type: 'activity',
      items: [{ type: 'step', label: 'Generated the response' }],
    })
  })

  it('parses CRLF, multiline JSON, and incomplete chunks', () => {
    const payload = JSON.stringify({
      version: 2,
      sequence: '0',
      run_id: runId,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: 'Hello' },
    }, null, 2)
    const input = `event: text.delta\r\n${payload.split('\n').map((line) => `data: ${line}`).join('\r\n')}\r\n\r\npartial`
    const parsed = parseSseBuffer(input)
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0].sequence).toBe('0')
    expect(parsed.events[0].data).toEqual({ delta: 'Hello' })
    expect(parsed.remainder).toBe('partial')
  })

  it('accepts canonical decimal sequences beyond Number precision and rejects numeric wire values', () => {
    expect(parseEventSequence('9007199254740993')).toBe(9_007_199_254_740_993n)
    expect(() => parseEventSequence('01')).toThrow(/invalid/)
    expect(() => parseEventSequence(1)).toThrow(/invalid/)

    const numeric = `event: text.delta\ndata: ${JSON.stringify({
      version: 2,
      sequence: 1,
      run_id: runId,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: 'unsafe' },
    })}\n\n`
    expect(() => parseSseBuffer(numeric)).toThrow(/invalid/)
  })

  it('parses durable WebSocket events separately from transient browser frames', () => {
    const durable = parseSocketMessage(JSON.stringify({
      version: 2,
      sequence: '9007199254740993',
      run_id: runId,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: 'Hello' },
    }))
    expect(durable).toMatchObject({ sequence: '9007199254740993', type: 'text.delta' })

    const transient = parseSocketMessage(JSON.stringify({
      version: 2,
      run_id: runId,
      type: 'browser.frame',
      data: { jpegBase64: 'abc123' },
    }))
    expect(transient.type).toBe('browser.frame')
    expect(mapBrowserFrame(transient.data)).toEqual({
      src: 'data:image/jpeg;base64,abc123',
    })
    expect(mapBrowserFrame({
      base64: 'cG5n', mime_type: 'image/png', captured_at: '2026-08-30T17:00:00Z',
    })).toEqual({ src: 'data:image/png;base64,cG5n' })
    expect(agentRunSocketUrl(runId, '42', 'https://mybot.example')).toBe(
      `wss://mybot.example/agent-runs/${runId}/subscribe?after=42`,
    )
  })

  it('requires a strictly ordered terminal stream', async () => {
    const started = frame(0, 'turn.started', {
      conversation: {
        id: 'conversation', title: 'Title',
        created_at: '2026-08-28T12:00:00.000Z',
        updated_at: '2026-08-28T12:00:00.000Z',
      },
      user_message: {
        id: 'user', role: 'user', content: 'Hi', reasoning: null,
        status: 'completed', error_message: null, model: null,
        reasoning_effort: null, speed: null, activities: [],
        created_at: '2026-08-28T12:00:00.000Z',
        updated_at: '2026-08-28T12:00:00.000Z',
      },
      assistant_message: {
        id: 'assistant', role: 'assistant', content: '', reasoning: null,
        status: 'streaming', error_message: null, model: 'gpt-5.6-sol',
        reasoning_effort: 'medium', speed: 'standard', activities: [],
        created_at: '2026-08-28T12:00:00.001Z',
        updated_at: '2026-08-28T12:00:00.001Z',
      },
    })
    await expect(readEventStream(response(
      started + frame(1, 'text.delta', { delta: 'Hello' }),
    ), () => undefined)).rejects.toThrow(/before completion/)
    await expect(readEventStream(response(
      started + frame(0, 'turn.completed', {}),
    ), () => undefined)).rejects.toThrow(/invalid/)

    const seen: string[] = []
    await readEventStream(response(
      started + frame(1, 'turn.completed', {}),
    ), (event) => seen.push(event.type))
    expect(seen).toEqual(['turn.started', 'turn.completed'])
  })

  it('reconciles optimistic IDs and applies deltas immutably', () => {
    const optimistic: ConversationState = {
      ...initialConversationState,
      loading: false,
      streaming: true,
      messages: [
        { id: 'pending-user', role: 'user', status: 'complete', blocks: [] },
        { id: 'pending-assistant', role: 'assistant', status: 'streaming', blocks: [] },
      ],
      activeAssistantId: 'pending-assistant',
    }
    const started = parseSseBuffer(frame(0, 'turn.started', {
      conversation: {
        id: 'conversation', title: 'Title',
        created_at: '2026-08-28T12:00:00.000Z',
        updated_at: '2026-08-28T12:00:00.000Z',
      },
      user_message: {
        id: 'user', role: 'user', content: 'Hi', reasoning: null,
        status: 'completed', error_message: null, model: null,
        reasoning_effort: null, speed: null, activities: [],
        created_at: '2026-08-28T12:00:00.000Z',
        updated_at: '2026-08-28T12:00:00.000Z',
      },
      assistant_message: {
        id: 'assistant', role: 'assistant', content: '', reasoning: null,
        status: 'streaming', error_message: null, model: 'gpt-5.6-sol',
        reasoning_effort: 'medium', speed: 'standard', activities: [],
        created_at: '2026-08-28T12:00:00.001Z',
        updated_at: '2026-08-28T12:00:00.001Z',
      },
    })).events[0]
    const reconciled = applyStreamEvent(optimistic, started)
    const delta = parseSseBuffer(frame(1, 'text.delta', { delta: '**Hello**' })).events[0]
    const streamed = applyStreamEvent(reconciled, delta)

    expect(optimistic.messages[1].blocks).toEqual([])
    expect(reconciled.messages.map((message) => message.id)).toEqual(['user', 'assistant'])
    expect(streamed.messages[1].blocks).toContainEqual({
      id: 'assistant-text',
      type: 'text',
      content: '**Hello**',
    })
  })

  it('replaces partial text with the durable checkpoint before applying new deltas', () => {
    const state: ConversationState = {
      ...initialConversationState,
      activeAssistantId: 'assistant',
      activeRunId: runId,
      streaming: true,
      messages: [{
        id: 'assistant',
        role: 'assistant',
        status: 'streaming',
        blocks: [{ id: 'assistant-text', type: 'text', content: 'Partial and stale' }],
      }],
    }
    const checkpoint = parseSseBuffer(frame(8, 'turn.started', {
      checkpoint: {
        id: 'checkpoint-8',
        phase: 'runnable',
        content: 'Canonical checkpoint text',
        pending_question: null,
        resume_consumed: true,
      },
    })).events[0]
    const reconciled = applyStreamEvent(state, checkpoint)
    const delta = parseSseBuffer(frame(9, 'text.delta', { delta: ' continued' })).events[0]
    const continued = applyStreamEvent(reconciled, delta)

    expect(state.messages[0].blocks[0]).toMatchObject({ content: 'Partial and stale' })
    expect(continued.messages[0].blocks.find((block) => block.type === 'text')).toMatchObject({
      content: 'Canonical checkpoint text continued',
    })
  })

  it('updates the active process label and retires reasoning when final text starts', () => {
    const state: ConversationState = {
      ...initialConversationState,
      loading: false,
      streaming: true,
      activeAssistantId: 'assistant',
      messages: [{
        id: 'assistant',
        role: 'assistant',
        status: 'streaming',
        processLabel: 'Thinking…',
        processStartedAt: Date.now() - 5_000,
        blocks: [],
      }],
    }
    const event = (sequence: number, type: string, data: Record<string, unknown>) =>
      parseSseBuffer(frame(sequence, type, data)).events[0]

    const reasoning = applyStreamEvent(state, event(1, 'reasoning.delta', {
      delta: 'Checking sources.',
    }))
    expect(reasoning.messages[0].processLabel).toBe('Thinking…')

    const searching = applyStreamEvent(reasoning, event(2, 'step.started', {
      step: {
        id: 'search-1',
        kind: 'web_search',
        status: 'in_progress',
        label: 'Web search',
        query: 'current reference',
      },
    }))
    expect(searching.messages[0].processLabel).toBe('Searching the web…')

    const completedSearch = applyStreamEvent(searching, event(3, 'step.completed', {
      step: {
        id: 'search-1',
        kind: 'web_search',
        status: 'completed',
        label: 'Web search',
        query: 'current reference',
      },
    }))
    expect(completedSearch.messages[0].processLabel).toBe('Thinking…')

    const answering = applyStreamEvent(completedSearch, event(4, 'text.delta', {
      delta: 'Final answer.',
    }))
    expect(answering.messages[0].processLabel).toBeUndefined()
    expect(answering.messages[0].processStartedAt).toEqual(expect.any(Number))
    expect(answering.messages[0].processDuration).toBeGreaterThanOrEqual(5)
    expect(answering.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'reasoning',
      status: 'complete',
    }))
    expect(answering.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'activity',
      status: 'complete',
    }))
  })

  it('keeps one task plan outside message blocks while reducing tool activity and input', () => {
    const state: ConversationState = {
      ...initialConversationState,
      loading: false,
      streaming: true,
      activeAssistantId: 'assistant',
      messages: [{
        id: 'assistant',
        role: 'assistant',
        status: 'streaming',
        blocks: [],
      }],
    }
    const event = (sequence: number, type: string, data: Record<string, unknown>) =>
      parseSseBuffer(frame(sequence, type, data)).events[0]

    const planned = applyStreamEvent(state, event(1, 'plan.updated', {
      plan: [{ id: 'inspect', title: 'Inspect the seam', status: 'in_progress' }],
    }))
    const tooled = applyStreamEvent(planned, event(2, 'tool.started', {
      tool: { id: 'tool-1', name: 'read_file', label: 'Read model.ts', status: 'in_progress' },
    }))
    const waiting = applyStreamEvent(tooled, event(3, 'user.input_required', {
      question: {
        question_id: 'question-1',
        prompt: 'Which option should I use?',
        description: 'Choose every compatible target.',
        options: [
          { id: 'web', label: 'Web', description: 'Update the web client.' },
          { id: 'api', label: 'API', description: 'Update the application API.' },
        ],
        multiple: true,
        allow_custom: true,
      },
    }))

    expect(waiting.messages[0].blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'activity',
        items: [expect.objectContaining({ type: 'tool', action: 'read_file' })],
      }),
      expect.objectContaining({
        type: 'question',
        request: expect.objectContaining({
          id: 'question-1',
          runId,
          status: 'pending',
          questions: [expect.objectContaining({
            title: 'Which option should I use?',
            multiple: true,
            allowCustom: true,
            options: [
              { value: 'web', label: 'Web', description: 'Update the web client.' },
              { value: 'api', label: 'API', description: 'Update the application API.' },
            ],
          })],
        }),
      }),
    ]))
    expect(waiting.plan).toEqual([
      expect.objectContaining({ id: 'inspect', status: 'in-progress' }),
    ])
    expect(waiting.messages[0].blocks.some((block) => block.type === 'todo-list')).toBe(false)
    const revised = applyStreamEvent(waiting, event(4, 'plan.updated', {
      plan: [{ id: 'finish', title: 'Finish the task', status: 'pending' }],
    }))
    expect(revised.plan).toEqual([
      expect.objectContaining({ id: 'finish', title: 'Finish the task' }),
    ])
    expect(revised.messages).toBe(waiting.messages)
    expect(waiting.streaming).toBe(false)
    expect(waiting.activeRunId).toBe(runId)
    const cancelled = applyStreamEvent(waiting, event(5, 'turn.failed', {
      error: { code: 'cancelled', message: 'Turn cancelled.', retryable: false },
    }))
    expect(cancelled.activeRunId).toBeUndefined()
    expect(cancelled.messages[0].status).toBe('complete')
    expect(cancelled.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'question',
      request: expect.objectContaining({ status: 'cancelled', result: 'Run cancelled.' }),
    }))
  })

  it('preserves structured answer types without comma flattening', () => {
    const request = mapQuestionRequest({
      question_id: 'targets',
      title: 'Targets',
      description: 'Select the targets.',
      options: [{ id: 'web', label: 'Web' }, { id: 'api', label: 'API' }],
      multiple: true,
      allow_custom: true,
    }, runId)!

    expect(answerForQuestion(request, {
      targets: { selected: ['web', 'api'] },
    })).toEqual({ questionId: 'targets', answer: ['web', 'api'] })
    expect(answerForQuestion(request, {
      targets: { selected: ['web'], custom: 'A custom target' },
    })).toEqual({ questionId: 'targets', answer: 'A custom target' })
    expect(mapQuestionRequest({
      question_id: 'legacy-title',
      title: 'Legacy title payload',
    }, runId)?.questions[0].title).toBe('Legacy title payload')
  })

  it('rehydrates an active run before subscription', () => {
    const hydrated = rehydrateConversationDetail(initialConversationState, {
      id: 'conversation',
      title: 'Active conversation',
      project_id: null,
      created_at: '2026-08-30T12:00:00.000Z',
      updated_at: '2026-08-30T12:00:01.000Z',
      messages: [{
        id: 'assistant',
        role: 'assistant',
        content: 'Waiting.',
        reasoning: null,
        status: 'waiting',
        error_message: null,
        model: 'gpt-5.6-sol',
        reasoning_effort: 'medium',
        speed: 'standard',
        activities: [],
        created_at: '2026-08-30T12:00:00.000Z',
        updated_at: '2026-08-30T12:00:01.000Z',
      }],
      active_run: {
        id: runId,
        turn_id: turnId,
        status: 'waiting',
        last_event_sequence: '9007199254740993',
        plan: [{ id: 'inspect', title: 'Inspect', status: 'in_progress' }],
        pending_question: {
          question_id: 'continue',
          prompt: 'Continue?',
          description: 'Choose how to proceed.',
          options: [{ id: 'yes', label: 'Yes' }],
          multiple: false,
          allow_custom: false,
        },
        browser_projection: {
          id: 'browser',
          state: 'live',
          control: 'agent',
          title: 'Preview',
          url: 'https://example.com',
        },
      },
    })

    expect(hydrated).toMatchObject({
      activeRunId: runId,
      activeTurnId: turnId,
      activeAssistantId: 'assistant',
      lastSequence: '9007199254740993',
      streaming: false,
      browser: { id: 'browser', status: 'agent-control' },
    })
    expect(hydrated.messages[0].blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'question',
        request: expect.objectContaining({
          questions: [expect.objectContaining({ title: 'Continue?' })],
        }),
      }),
    ]))
    expect(hydrated.plan).toEqual([
      expect.objectContaining({ id: 'inspect', title: 'Inspect', status: 'in-progress' }),
    ])
    expect(hydrated.messages[0].blocks.some((block) => block.type === 'todo-list')).toBe(false)

    const resumed = applyStreamEvent({
      ...hydrated,
      browserFrame: { src: 'data:image/png;base64,cG5n' },
    }, parseSocketMessage(JSON.stringify({
      version: 2,
      sequence: '9007199254740994',
      run_id: runId,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: ' Resumed.' },
    })) as Parameters<typeof applyStreamEvent>[1])
    const completed = applyStreamEvent(resumed, parseSocketMessage(JSON.stringify({
      version: 2,
      sequence: '9007199254740995',
      run_id: runId,
      turn_id: turnId,
      type: 'turn.completed',
      data: {},
    })) as Parameters<typeof applyStreamEvent>[1])

    expect(completed.activeRunId).toBeUndefined()
    expect(completed.streaming).toBe(false)
    expect(completed.browser).toMatchObject({
      status: 'closed', message: 'Browser preview ended with the run.',
    })
    expect(completed.browserFrame).toBeUndefined()
    expect(completed.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'text',
      content: 'Waiting. Resumed.',
    }))
  })

  it('restores the task plan even when no run is active', () => {
    const restored = rehydrateConversationDetail(initialConversationState, {
      id: 'task',
      title: 'Persistent task',
      project_id: null,
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:00:00Z',
      messages: [],
      plan: [{ id: 'macro', title: 'Complete the macro plan', status: 'completed' }],
      active_run: null,
    })
    expect(restored.plan).toEqual([
      expect.objectContaining({ id: 'macro', status: 'completed' }),
    ])
    expect(restored.messages).toEqual([])
    expect(restored.activeRunId).toBeUndefined()
  })
})
