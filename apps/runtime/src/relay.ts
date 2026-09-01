import type { BrowserFrameRelay, Frame, FramePublishResult } from './contracts.js'
import { ControlLeaseError } from './errors.js'

type Waiter = (frame: Frame | undefined) => void

export class InMemoryFrameRelay implements BrowserFrameRelay {
  readonly trusted = false
  private readonly queue: Frame[] = []
  private readonly waiters: Waiter[] = []
  private handoffLeaseId: string | null = null
  private dropped = 0

  constructor(private readonly capacity = 2) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('frame relay capacity must be positive.')
  }

  async publish(frame: Frame): Promise<FramePublishResult> {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(frame)
      return { accepted: true, dropped: this.dropped }
    }
    if (this.queue.length >= this.capacity) {
      this.queue.shift()
      this.dropped += 1
    }
    this.queue.push(frame)
    return { accepted: true, dropped: this.dropped }
  }

  subscribe(): AsyncIterable<Frame> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<Frame> => {
        return {
          next: (): Promise<IteratorResult<Frame>> => {
            const frame = this.queue.shift()
            if (frame) return Promise.resolve({ done: false, value: frame })
            return new Promise((resolve) => this.waiters.push((nextFrame) => resolve(nextFrame ? { done: false, value: nextFrame } : { done: true, value: undefined })))
          },
          return: (): Promise<IteratorResult<Frame>> => {
            const index = this.waiters.length - 1
            if (index >= 0) this.waiters.splice(index, 1)[0]?.(undefined)
            return Promise.resolve({ done: true, value: undefined })
          },
        }
      },
    }
  }

  async requestHandoff(leaseId: string): Promise<void> {
    if (this.handoffLeaseId && this.handoffLeaseId !== leaseId) throw new ControlLeaseError()
    this.handoffLeaseId = leaseId
  }

  async releaseHandoff(leaseId: string): Promise<void> {
    if (this.handoffLeaseId !== leaseId) throw new ControlLeaseError()
    this.handoffLeaseId = null
  }
}
