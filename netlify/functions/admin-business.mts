import { timingSafeEqual } from 'node:crypto'
import { deleteBusiness, listBusinesses, setBusiness, type BusinessProfile } from './_lib/business-store.mts'

function isAuthorized(req: Request): boolean {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return false
  const provided = req.headers.get('x-admin-key') || ''
  const expected = Buffer.from(adminKey)
  const actual = Buffer.from(provided)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isOptionalShortString(value: unknown, maxLength: number): boolean {
  return value === undefined || value === '' || (typeof value === 'string' && value.length <= maxLength)
}

function isValidProfile(value: unknown): value is BusinessProfile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.name === 'string' &&
    v.name.length > 0 &&
    v.name.length <= 200 &&
    typeof v.facts === 'string' &&
    v.facts.length > 0 &&
    v.facts.length <= 4000 &&
    isOptionalShortString(v.forwardNumber, 32) &&
    isOptionalShortString(v.calApiKey, 200) &&
    isOptionalShortString(v.calEventTypeId, 32) &&
    isOptionalShortString(v.calTimezone, 64)
  )
}

/** Drops empty-string optional fields so they're stored as "unset"
 * rather than as an empty string that would otherwise pass truthy
 * checks like isCalConfigured(). */
function cleanProfile(profile: BusinessProfile): BusinessProfile {
  const cleaned: BusinessProfile = { name: profile.name, facts: profile.facts }
  if (profile.forwardNumber) cleaned.forwardNumber = profile.forwardNumber
  if (profile.calApiKey) cleaned.calApiKey = profile.calApiKey
  if (profile.calEventTypeId) cleaned.calEventTypeId = profile.calEventTypeId
  if (profile.calTimezone) cleaned.calTimezone = profile.calTimezone
  return cleaned
}

/**
 * A small, key-protected admin API for managing which businesses this
 * deployment answers for — this is what lets you add a new customer
 * without editing any code. Used by public/admin.html.
 *
 * GET             -> list all configured businesses
 * POST ?key=...   -> create or update the business at that key (a
 *                    Twilio phone number for calls/texts, e.g.
 *                    +15551234567)
 * DELETE ?key=... -> remove a business
 *
 * Every request must carry the ADMIN_KEY (set in Netlify's environment
 * variables) in an X-Admin-Key header. Disabled entirely (503) if
 * ADMIN_KEY isn't set, so this can never be an accidentally-open door.
 */
export default async (req: Request): Promise<Response> => {
  if (!process.env.ADMIN_KEY) {
    return json({ error: 'not_configured' }, 503)
  }
  if (!isAuthorized(req)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const url = new URL(req.url)
  const key = url.searchParams.get('key')?.trim()

  if (req.method === 'GET') {
    const businesses = await listBusinesses()
    return json({ businesses }, 200)
  }

  if (req.method === 'POST') {
    if (!key) return json({ error: 'missing_key' }, 400)
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }
    if (!isValidProfile(body)) {
      return json({ error: 'invalid_profile' }, 400)
    }
    await setBusiness(key, cleanProfile(body))
    return json({ ok: true }, 200)
  }

  if (req.method === 'DELETE') {
    if (!key) return json({ error: 'missing_key' }, 400)
    await deleteBusiness(key)
    return json({ ok: true }, 200)
  }

  return json({ error: 'method_not_allowed' }, 405)
}
