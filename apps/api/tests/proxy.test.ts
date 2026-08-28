import { describe, expect, it } from 'vitest'
import { clientIp, nodeSocketPeer } from '../src/app.js'
import { loadSettings } from '../src/config.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test', TRUSTED_PROXY_HOSTS: '10.0.0.1' })

describe('proxy identity', () => {
  it('uses the injected socket peer and accepts one XFF value from a trusted proxy', () => {
    const request = new Request('http://localhost', { headers: { 'x-forwarded-for': '203.0.113.4' } })
    expect(clientIp(request, settings, () => '10.0.0.1')).toBe('203.0.113.4')
    expect(clientIp(request, settings, () => '198.51.100.8')).toBe('198.51.100.8')
  })

  it('uses the actual Node socket peer and ignores spoofable peer headers', () => {
    const request = new Request('http://localhost', { headers: { 'x-peer-ip': '203.0.113.4' } }) as Request & { runtime: unknown }
    request.runtime = { node: { req: { socket: { remoteAddress: '198.51.100.8' } } } }
    expect(nodeSocketPeer(request)).toBe('198.51.100.8')
    expect(clientIp(request, settings)).toBe('198.51.100.8')
  })

  it('rejects multi-hop, malformed, and empty forwarding values', () => {
    for (const forwarded of ['203.0.113.4, 198.51.100.9', 'not-an-ip', '']) {
      const request = new Request('http://localhost', { headers: { 'x-forwarded-for': forwarded } })
      expect(clientIp(request, settings, '10.0.0.1')).toBe('10.0.0.1')
    }
  })
})
