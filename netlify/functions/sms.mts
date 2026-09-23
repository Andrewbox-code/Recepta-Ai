import { getStore } from '@netlify/blobs'
import { getAiReply, type ChatMessage } from './_lib/anthropic-client.mts'
import { getBusiness } from './_lib/business-store.mts'
import { buildSystemPrompt, SMS_ADDENDUM } from './_lib/persona.mts'
import { parseTwilioForm, verifyTwilioSignature } from './_lib/twilio-verify.mts'
import { escapeXml, twimlResponse } from './_lib/twiml.mts'

const MAX_HISTORY = 10
const FALLBACK_REPLY = "Thanks for your message — we'll get back to you shortly."

/**
 * Twilio Messaging webhook: every inbound SMS to the business's Twilio
 * number (including the reply to a missed-call text-back) lands here.
 * Keeps a short rolling conversation per phone number in Netlify Blobs
 * (zero extra setup — provisioned automatically once deployed on
 * Netlify) so replies have real context, not just a one-off Q&A.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    return new Response('Not configured', { status: 503 })
  }

  const params = await parseTwilioForm(req)
  const signature = req.headers.get('x-twilio-signature')
  if (!verifyTwilioSignature(req.url, params, signature, authToken)) {
    return new Response('Invalid signature', { status: 403 })
  }

  const from = params.From
  const body = params.Body?.trim()
  if (!from || !body) {
    return twimlResponse('')
  }

  // Netlify Blobs gives conversations real memory, but a blip in it
  // should never take the whole text-back flow down — fall back to a
  // stateless single-turn reply if it's unavailable for any reason.
  let store: ReturnType<typeof getStore> | null = null
  let history: ChatMessage[] = []
  try {
    store = getStore('sms-conversations')
    const existing = (await store.get(from, { type: 'json' })) as ChatMessage[] | null
    history = Array.isArray(existing) ? existing : []
  } catch (error) {
    console.error('SMS history read failed, continuing without it:', error)
  }

  const withUserMessage: ChatMessage[] = [...history, { role: 'user' as const, content: body }].slice(
    -MAX_HISTORY,
  )

  // "To" is the Twilio number that was texted — looking the business up
  // by that number is the "name tag" that lets one deployment answer
  // correctly for many different businesses at once.
  const business = await getBusiness(params.To)

  let reply: string
  try {
    reply = (await getAiReply(withUserMessage, buildSystemPrompt(business) + SMS_ADDENDUM, business)) ?? FALLBACK_REPLY
  } catch (error) {
    console.error('SMS AI reply failed:', error)
    reply = FALLBACK_REPLY
  }

  const nextHistory: ChatMessage[] = [...withUserMessage, { role: 'assistant' as const, content: reply }].slice(
    -MAX_HISTORY,
  )
  if (store) {
    await store.setJSON(from, nextHistory).catch((error) => console.error('Failed to save SMS history:', error))
  }

  return twimlResponse(`<Message>${escapeXml(reply)}</Message>`)
}
