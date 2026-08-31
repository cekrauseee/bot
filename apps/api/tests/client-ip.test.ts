import { describe, expect, it } from 'vitest'
import { clientIp, nodeSocketPeer } from '../src/app.js'

describe('client identity', () => {
  it('uses the injected socket peer and ignores forwarding headers', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.4' },
    })
    expect(clientIp(request, () => '198.51.100.8')).toBe('198.51.100.8')
  })

  it('uses the Node socket peer and falls back to unknown', () => {
    const request = new Request('http://localhost') as Request & { runtime: unknown }
    request.runtime = { node: { req: { socket: { remoteAddress: '198.51.100.8' } } } }
    expect(nodeSocketPeer(request)).toBe('198.51.100.8')
    expect(clientIp(request)).toBe('198.51.100.8')
    expect(clientIp(new Request('http://localhost'), undefined)).toBe('unknown')
  })
})
