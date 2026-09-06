import { getBusiness } from './_lib/business-store.mts'
import { missedCallOpener } from './_lib/messages.mts'
import { sendSms } from './_lib/twilio-sms.mts'
import { parseTwilioForm, verifyTwilioSignature } from './_lib/twilio-verify.mts'
import { escapeXml, twimlResponse } from './_lib/twiml.mts'

/**
 * Twilio Voice webhook: fires the moment someone calls a business's
 * Twilio number. Looks up which business owns the number that was
 * called ("To") so one deployment can serve many businesses. If that
 * business has a forwardNumber configured, tries to ring it first (see
 * twilio-voice-status.mts for what happens if that goes unanswered). If
 * not, there's no one to ring, so it texts the caller back immediately.
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

  const business = await getBusiness(params.To)
  const caller = params.From

  if (!business.forwardNumber) {
    if (caller && params.To) {
      await sendSms(caller, params.To, missedCallOpener(business.name)).catch((error) =>
        console.error('Text-back send failed:', error),
      )
    }
    return twimlResponse('<Say>Thanks for calling. We are texting you right now so we can help.</Say><Hangup/>')
  }

  const statusCallback = new URL('/.netlify/functions/twilio-voice-status', req.url).toString()
  return twimlResponse(
    `<Dial timeout="18" action="${escapeXml(statusCallback)}"><Number>${escapeXml(business.forwardNumber)}</Number></Dial>`,
  )
}
