import twilio from 'twilio'

/**
 * `from` must be the specific business's own Twilio number (the number
 * that was actually called/texted, i.e. Twilio's "To" on the inbound
 * request) — not a single shared number. With more than one business
 * configured, sending from the wrong number would text customers back
 * from a number they never called.
 */
export async function sendSms(to: string, from: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN

  if (!sid || !token) {
    throw new Error('Twilio is not fully configured (need TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)')
  }

  const client = twilio(sid, token)
  await client.messages.create({ to, from, body })
}
