export function redactSensitiveText(value: string): string {
  return value.replace(/((?:password|passwd|token|secret|cookie|authorization|credential|api[_-]?key|access[_-]?token|oidc[_-]?token|set-cookie)\s*["']?\s*[:=]\s*["']?)[^\s,"';]+/gi, '$1[REDACTED]')
}
