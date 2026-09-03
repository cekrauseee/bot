const destinationKey = "mybot.auth.destination"

function validDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null
  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}`
      : null
  } catch {
    return null
  }
}

export function rememberAuthDestination(pathname: string, search: string) {
  const destination = validDestination(`${pathname}${search}`)
  if (
    !destination ||
    destination === "/" ||
    destination === "/sign" ||
    destination === "/login"
  )
    return
  try {
    window.sessionStorage.setItem(destinationKey, destination)
  } catch {
    // Storage may be unavailable; the root route remains the fallback.
  }
}

export function consumeAuthDestination() {
  try {
    const destination = validDestination(
      window.sessionStorage.getItem(destinationKey)
    )
    window.sessionStorage.removeItem(destinationKey)
    return destination ?? "/"
  } catch {
    return "/"
  }
}
