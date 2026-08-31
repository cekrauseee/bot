import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

import type { RuntimeToolRequest } from './contracts.js'
import { RuntimeError, toPublicError } from './errors.js'
import { parseRuntimeRequest } from './validation.js'
import { RuntimeService } from './service.js'

const MAX_BODY_BYTES = 2_500_000

export interface RuntimeHttpOptions {
  readonly service: RuntimeService
  readonly serviceToken?: string
  readonly isReady?: () => boolean
}

export function createRuntimeServer(options: RuntimeHttpOptions): Server {
  return createServer(async (request, response) => {
    const controller = new AbortController()
    const abort = () => {
      if (!response.writableEnded) controller.abort()
    }
    request.once('aborted', abort)
    response.once('close', abort)
    try {
      await route(request, response, options, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      const publicError = toPublicError(error)
      sendJson(response, publicError.status, { error: publicErrorPayload(publicError) })
    } finally {
      request.off('aborted', abort)
      response.off('close', abort)
    }
  })
}

async function route(request: IncomingMessage, response: ServerResponse, options: RuntimeHttpOptions, signal: AbortSignal): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok', service: 'runtime' })
    return
  }
  if (request.method === 'GET' && request.url === '/ready') {
    const ready = options.isReady?.() ?? false
    sendJson(response, ready ? 200 : 503, {
      status: ready ? 'ready' : 'unavailable',
      service: 'runtime',
      ...(ready ? {} : { reason: 'provider_credentials_missing' }),
    })
    return
  }
  if (request.method !== 'POST' || request.url !== '/tools') {
    sendJson(response, 404, { error: { code: 'not_found', message: 'Not found.', retryable: false } })
    return
  }
  if (!options.serviceToken || !validBearer(request.headers.authorization, options.serviceToken)) {
    sendJson(response, options.serviceToken ? 401 : 503, { error: options.serviceToken ? { code: 'unauthorized', message: 'Unauthorized.', retryable: false } : { code: 'runtime_unavailable', message: 'The runtime is temporarily unavailable.', retryable: true } })
    return
  }
  const contentType = request.headers['content-type']
  if (!contentType || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) throw new RuntimeError('invalid_request', 'Content-Type must be application/json.', 400)
  const body = await readBody(request)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new RuntimeError('invalid_request', 'Request body must be valid JSON.', 400)
  }
  const runtimeRequest = parseRuntimeRequest(parsed)
  const result = await options.service.execute(runtimeRequest, signal)
  sendJson(response, 200, result)
}

function validBearer(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice(7))
  const actual = Buffer.from(expected)
  return provided.length === actual.length && timingSafeEqual(provided, actual)
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_BODY_BYTES) {
        reject(new RuntimeError('invalid_request', 'Request body is too large.', 413))
        request.destroy()
        return
      }
      chunks.push(buffer)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => reject(new RuntimeError('invalid_request', 'Request body could not be read.', 400)))
  })
}

function publicErrorPayload(error: RuntimeError): { code: string; message: string; retryable: boolean } {
  return { code: error.code, message: error.message, retryable: error.retryable }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent || response.destroyed || response.writableEnded) return
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}

export function requestFromJson(value: unknown): RuntimeToolRequest {
  return parseRuntimeRequest(value)
}
