import { getStore } from '@netlify/blobs'

export type BusinessProfile = {
  name: string
  facts: string
  forwardNumber?: string
  /** Cal.com API key (from their Cal.com account) and the numeric ID of
   * the event type to book against. Both must be set for the AI to
   * check real availability and make real bookings — without them, it
   * only ever talks about booking, same as before this existed. */
  calApiKey?: string
  calEventTypeId?: string
  /** IANA time zone (e.g. "America/New_York") used for bookings.
   * Defaults to America/New_York if unset. */
  calTimezone?: string
}

/** The persona shown on the landing page's own demo — used whenever no
 * real business is configured for a given key (phone number or web
 * chat slug). */
export const DEMO_BUSINESS: BusinessProfile = {
  name: 'Bright Smile Dental',
  facts: `- Hours: Mon–Fri 8am–6pm, Sat 9am–2pm, closed Sunday.
- A standard cleaning costs $89–$129 depending on insurance; exact pricing needs insurance details, which you can offer to check.
- You can offer plausible near-term openings (e.g. "tomorrow at 10:30am or 2:15pm") when someone wants to book — this is a demo, so invented but realistic availability is fine.`,
}

function getBusinessStore() {
  try {
    return getStore('businesses')
  } catch (error) {
    console.error('Business store unavailable:', error)
    return null
  }
}

/**
 * Looks up a business profile by key — a Twilio phone number for calls
 * and texts, or a chosen slug for web chat. This is the "name tag":
 * every function looks up which real business a call/text/chat belongs
 * to before answering, instead of always answering as the same one.
 * Falls back to the demo persona if nothing is configured for that key,
 * or if the store itself is unavailable, so a lookup failure never
 * breaks the conversation.
 */
export async function getBusiness(key: string | undefined | null): Promise<BusinessProfile> {
  if (!key) return DEMO_BUSINESS
  const store = getBusinessStore()
  if (!store) return DEMO_BUSINESS
  try {
    const profile = (await store.get(key, { type: 'json' })) as BusinessProfile | null
    return profile ?? DEMO_BUSINESS
  } catch (error) {
    console.error(`Business lookup failed for "${key}", using demo persona:`, error)
    return DEMO_BUSINESS
  }
}

export async function setBusiness(key: string, profile: BusinessProfile): Promise<void> {
  const store = getBusinessStore()
  if (!store) throw new Error('Business store unavailable')
  await store.setJSON(key, profile)
}

export async function deleteBusiness(key: string): Promise<void> {
  const store = getBusinessStore()
  if (!store) throw new Error('Business store unavailable')
  await store.delete(key)
}

export async function listBusinesses(): Promise<Array<{ key: string; profile: BusinessProfile }>> {
  const store = getBusinessStore()
  if (!store) return []
  const { blobs } = await store.list()
  const entries = await Promise.all(
    blobs.map(async (blob) => {
      const profile = (await store.get(blob.key, { type: 'json' })) as BusinessProfile | null
      return profile ? { key: blob.key, profile } : null
    }),
  )
  return entries.filter((entry): entry is { key: string; profile: BusinessProfile } => entry !== null)
}
