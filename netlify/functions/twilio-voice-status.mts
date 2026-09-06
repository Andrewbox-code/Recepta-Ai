import { getBusiness } from './_lib/business-store.mts'
import { missedCallOpener } from './_lib/messages.mts'
import { sendSms } from './_lib/twilio-sms.mts'
import { parseTwilioForm, verifyTwilioSignature } from './_lib/twilio-verify.mts'
import { twimlResponse } from './_lib/twiml.mts'

/**
 * Twilio's callback once a <Dial> to the business's forward number
 * finishes (answered, no answer, busy, or failed). Anything other than
 * "completed" means the call went unanswered, so this texts the caller
 * back immediately instead of leaving them with a missed call. Looks
 * the business up by "To" again, same as twilio-voice.mts, since this
 * is a separate request from Twilio.
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

  const dialStatus = params.DialCallStatus
  const caller = params.From
  const business = await getBusiness(params.To)

  if (dialStatus !== 'completed' && caller && params.To) {
    await sendSms(caller, params.To, missedCallOpener(business.name)).catch((error) =>
      console.error('Text-back send failed:', error),
    )
    return twimlResponse('<Say>Sorry we missed you — we just texted you so we can help from there.</Say><Hangup/>')
  }

  return twimlResponse('<Hangup/>')
}
