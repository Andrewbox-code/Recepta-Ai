export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function twimlResponse(innerXml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${innerXml}</Response>`, {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  })
}
