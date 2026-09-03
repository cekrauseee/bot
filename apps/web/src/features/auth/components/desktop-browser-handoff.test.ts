import { describe, expect, it } from "vitest"

import { desktopCallbackUrl } from "@/features/auth/desktop-callback"

const transactionId = "t".repeat(32)

describe("desktopCallbackUrl", () => {
  it("accepts only the exact desktop callback for the active transaction", () => {
    expect(
      desktopCallbackUrl(
        `mybot://auth/callback?transaction_id=${transactionId}`,
        transactionId
      )
    ).toBe(`mybot://auth/callback?transaction_id=${transactionId}`)

    for (const value of [
      `https://auth/callback?transaction_id=${transactionId}`,
      `mybot://other/callback?transaction_id=${transactionId}`,
      `mybot://auth/other?transaction_id=${transactionId}`,
      `mybot://auth/callback?transaction_id=${"x".repeat(32)}`,
      `mybot://auth/callback?transaction_id=${transactionId}&next=https://evil.test`,
      `mybot://auth/callback?transaction_id=${transactionId}#fragment`,
    ]) {
      expect(() => desktopCallbackUrl(value, transactionId)).toThrow(
        "Invalid desktop callback URL"
      )
    }
  })
})
