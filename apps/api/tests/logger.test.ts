import { describe, expect, it, vi } from 'vitest'
import { Writable } from 'node:stream'
import { createLogger, requestHeaders, requestIds, safeError, sanitizeLogFields, trackedResponse, validRequestId } from '../src/logger.js'

describe('structured logging safety', () => {
  it('accepts bounded ids and replaces malformed incoming values', () => {
    expect(validRequestId('req-123')).toBe(true)
    expect(validRequestId('x'.repeat(129))).toBe(false)
    const ids = requestIds(new Request('http://localhost/health', { headers: { 'x-request-id': 'bad value' } }))
    expect(ids.requestId).not.toBe('bad value')
    expect(requestHeaders(ids)).toEqual({ 'x-request-id': ids.requestId, 'x-correlation-id': ids.correlationId })
  })

  it('removes sensitive and payload-shaped fields recursively', () => {
    expect(sanitizeLogFields({
      user_id: 'u1', authorization: 'secret',
      nested: { prompt: 'private', code: 'provider_error', ok: true, rows: [{ email: 'private', safe: 1 }] },
      code: '123456', operational_code: 'provider_error',
    })).toEqual({ user_id: 'u1', nested: { code: 'provider_error', ok: true, rows: [{ safe: 1 }] }, operational_code: 'provider_error' })
    expect(safeError(new Error('private payload'))).toMatchObject({ error_name: 'Error', error_category: 'unknown', error_summary: 'An unexpected error occurred.', retryable: true })
    expect(JSON.stringify(safeError(new Error('private payload')))).not.toContain('private payload')
    expect(safeError(Object.assign(new Error('provider body'), { code: 'operation_failed' }))).toMatchObject({ error_category: 'provider', error_code: 'operation_failed', retryable: true })
    const previous = process.env.LOG_STACKS
    process.env.LOG_STACKS = 'true'
    try {
      expect(safeError(new Error('private stack message')).error_stack).not.toContain('private stack message')
    } finally {
      if (previous === undefined) delete process.env.LOG_STACKS
      else process.env.LOG_STACKS = previous
    }
  })

  it('emits production records with the shared schema and recursive redaction', async () => {
    let serialized = ''
    const destination = new Writable({ write(chunk, _encoding, callback) { serialized += chunk.toString(); callback() } })
    const logger = createLogger({ environment: 'production' }, destination)
    logger.info({
      event: 'operational_event',
      nested: { authorization: 'secret', safe: true },
      rows: [{ content: 'private', safe: 'value' }],
    }, 'operational message')
    await new Promise<void>((resolve) => setImmediate(resolve))
    const record = JSON.parse(serialized) as Record<string, unknown>
    expect(record).toMatchObject({
      level: 'info', service: 'my_bot_api', environment: 'production',
      schema_version: 1,
      event: 'operational_event', message: 'operational message',
      nested: { safe: true }, rows: [{ safe: 'value' }],
    })
    expect(record.timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(JSON.stringify(record)).not.toContain('secret')
    destination.end()
  })

  it('completes exactly once after a streamed response ends or is cancelled', async () => {
    const complete = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close() } })
    const response = trackedResponse(new Response(body, { status: 200 }), complete)
    await response.arrayBuffer()
    expect(complete).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledWith(200, 'success')
  })
})
