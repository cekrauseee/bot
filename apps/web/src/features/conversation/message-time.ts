import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns"

export function formatMessageTimestamp(
  createdAt: string,
  now: Date = new Date()
) {
  const date = parseISO(createdAt)
  if (!isValid(date)) return null

  const daysAgo = differenceInCalendarDays(now, date)
  const time = format(date, "p")
  if (daysAgo === 0) return time
  if (daysAgo > 0 && daysAgo < 7) {
    return `${format(date, "EEEE")}, ${time}`
  }
  return `${format(date, "MMM d, yyyy")}, ${time}`
}
