import type { BusinessProfile } from './business-store.mts'

/**
 * Talks to Cal.com's v2 API (api.cal.com/v2) to check real availability
 * and create real bookings.
 *
 * IMPORTANT: this is built against Cal.com's documented v2 API shape,
 * but has NOT been verified against a live Cal.com account — this
 * sandbox has no network access to api.cal.com and no test API key.
 * The first time a real business has calApiKey/calEventTypeId set, test
 * an actual booking end-to-end and expect to adjust field names here if
 * Cal.com's real responses don't match what's assumed below.
 */

const CAL_API_BASE = 'https://api.cal.com/v2'
const CAL_API_VERSION = '2024-08-13'
const DEFAULT_TIMEZONE = 'America/New_York'

export function isCalConfigured(business: BusinessProfile): boolean {
  return Boolean(business.calApiKey && business.calEventTypeId)
}

export type AvailabilitySlot = {
  start: string
}

/**
 * Returns real open slots for one calendar day (YYYY-MM-DD). Returns an
 * empty array (never throws) if Cal.com isn't configured or the request
 * fails — callers should tell the AI "couldn't check availability right
 * now" rather than let a booking tool call crash the conversation.
 */
export async function getAvailability(business: BusinessProfile, date: string): Promise<AvailabilitySlot[]> {
  if (!isCalConfigured(business)) return []

  const timeZone = business.calTimezone || DEFAULT_TIMEZONE
  const params = new URLSearchParams({
    eventTypeId: String(business.calEventTypeId),
    start: `${date}T00:00:00.000Z`,
    end: `${date}T23:59:59.999Z`,
    timeZone,
  })

  const res = await fetch(`${CAL_API_BASE}/slots?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${business.calApiKey}`,
      'cal-api-version': CAL_API_VERSION,
    },
  })

  if (!res.ok) {
    console.error(`Cal.com availability check failed (${res.status}):`, await res.text().catch(() => ''))
    return []
  }

  const data = (await res.json().catch(() => null)) as { data?: Record<string, AvailabilitySlot[]> } | null
  const daySlots = data?.data?.[date]
  return Array.isArray(daySlots) ? daySlots : []
}

export type BookingResult = { booked: true; startTime: string } | { booked: false; reason: string }

export async function createBooking(
  business: BusinessProfile,
  details: { startTime: string; name: string; phone: string; email?: string },
): Promise<BookingResult> {
  if (!isCalConfigured(business)) {
    return { booked: false, reason: 'Calendar booking is not set up for this business yet.' }
  }

  const timeZone = business.calTimezone || DEFAULT_TIMEZONE

  const res = await fetch(`${CAL_API_BASE}/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${business.calApiKey}`,
      'cal-api-version': CAL_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventTypeId: Number(business.calEventTypeId),
      start: details.startTime,
      attendee: {
        name: details.name,
        phoneNumber: details.phone,
        email: details.email || undefined,
        timeZone,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`Cal.com booking failed (${res.status}):`, text)
    return { booked: false, reason: `The calendar didn't accept that booking (${res.status}).` }
  }

  const data = (await res.json().catch(() => null)) as { data?: { start?: string } } | null
  return { booked: true, startTime: data?.data?.start || details.startTime }
}
