export function formatMessageTimestamp(
  createdAt: string,
  locale?: string,
  timeZone?: string,
) {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return null;

  const options = {
    ...(timeZone ? { timeZone } : {}),
  };
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    ...options,
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);

  return `${weekday}, ${time}`;
}
