export function desktopCallbackUrl(value: string, transactionId: string) {
  const url = new URL(value)
  const keys = [...url.searchParams.keys()]
  if (
    url.protocol !== "mybot:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.hash ||
    keys.length !== 1 ||
    keys[0] !== "transaction_id" ||
    url.searchParams.get("transaction_id") !== transactionId
  ) {
    throw new Error("Invalid desktop callback URL")
  }
  return url.toString()
}
