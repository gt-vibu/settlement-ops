/**
 * Display formatting.
 *
 * Money arrives from the API as a STRING of integer minor units - never a JS number,
 * because a large value would silently lose precision crossing that boundary. Formatting
 * therefore works on the string/bigint, and the fractional part is assembled by string
 * slicing rather than by dividing.
 *
 * This module formats financial truth for display. It never derives it.
 */

const MINOR_UNIT_DIGITS: Record<string, number> = { INR: 2 }

const SYMBOL: Record<string, string> = { INR: "\u20B9" }

export function formatMoney(
  amountMinor: string,
  currency: string,
  options: { signed?: boolean } = {}
): string {
  const digits = MINOR_UNIT_DIGITS[currency] ?? 2
  const negative = amountMinor.startsWith("-")
  const raw = negative ? amountMinor.slice(1) : amountMinor
  const padded = raw.padStart(digits + 1, "0")
  const whole = padded.slice(0, padded.length - digits)
  const fraction = padded.slice(padded.length - digits)

  // Indian digit grouping: last three, then pairs.
  const grouped =
    currency === "INR"
      ? whole.replace(/\B(?=(\d{2})+(?!\d)(?=\d{3}))/g, ",").replace(/\B(?=\d{3}$)/, ",")
      : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

  const symbol = SYMBOL[currency] ?? ""
  const sign = negative ? "-" : options.signed ? "+" : ""
  return `${sign}${symbol}${grouped}.${fraction}`
}

export function isZeroMinor(amountMinor: string): boolean {
  return /^-?0+$/.test(amountMinor)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function formatRelativeAge(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return "<1h"
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/** Deterministic reason codes are backend vocabulary; render them readably. */
export function humanizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase())
}
