import twilio from 'twilio'

/**
 * Verifies Twilio's X-Twilio-Signature header using Twilio's own
 * officially maintained SDK, rather than a hand-rolled reimplementation
 * of their signing algorithm. This is what stops anyone who isn't
 * Twilio from hitting these webhooks to trigger paid Claude API calls
 * or spoofed SMS sends.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string,
): boolean {
  if (!signature) return false
  return twilio.validateRequest(authToken, signature, url, params)
}

export async function parseTwilioForm(req: Request): Promise<Record<string, string>> {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    params[key] = String(value)
  }
  return params
}
