import { useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'

const industries = [
  'Salon / spa',
  'Dental / med spa',
  'Contractor / home services',
  'Auto shop',
  'Gym / studio',
  'Vet / pet care',
  'Something else',
]

type FormState = {
  name: string
  business: string
  email: string
  phone: string
  industry: string
}

const initialState: FormState = {
  name: '',
  business: '',
  email: '',
  phone: '',
  industry: industries[0],
}

function encodeFormData(data: Record<string, string>) {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&')
}

function WaitlistForm() {
  const [form, setForm] = useState<FormState>(initialState)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      // Netlify Forms: captured automatically once this site is deployed
      // on Netlify, with zero extra backend. See README for setup.
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData({ 'form-name': 'founding-partner-waitlist', ...form }),
      })
    } catch {
      // Not deployed on Netlify (e.g. local dev, or a different host) —
      // fall through to the confirmation screen either way.
    }
    setSubmitted(true)
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <section id="waitlist" className="bg-navy-900 py-20 text-ink-50 md:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            Get started
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Ready to get set up?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-300">
            Tell us about your business and we'll follow up personally to get
            your AI front desk set up — no obligation.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border border-ink-50/10 bg-navy-850 p-8 md:p-10">
          {submitted ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-400/15 text-mint-300">
                <CheckCircle2 className="h-7 w-7" strokeWidth={2} />
              </span>
              <h3 className="mt-5 font-display text-2xl font-semibold">
                Thanks, {form.name.split(' ')[0] || 'there'}!
              </h3>
              <p className="mt-2 max-w-sm text-ink-300">
                We've got your details for {form.business || 'your business'}. A
                member of the team will reach out within one business day to get
                you set up.
              </p>
              <button
                type="button"
                onClick={() => {
                  setForm(initialState)
                  setSubmitted(false)
                }}
                className="mt-6 text-sm font-semibold text-mint-400 underline underline-offset-4 hover:text-mint-300"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              name="founding-partner-waitlist"
              data-netlify="true"
              netlify-honeypot="bot-field"
              className="grid grid-cols-1 gap-5 sm:grid-cols-2"
            >
              <input type="hidden" name="form-name" value="founding-partner-waitlist" />
              <p className="hidden">
                <label>
                  Leave this field blank: <input name="bot-field" tabIndex={-1} autoComplete="off" />
                </label>
              </p>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor="name" className="text-sm font-medium text-ink-300">
                  Your name
                </label>
                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Jamie Rivera"
                  className="rounded-xl border border-ink-50/15 bg-navy-950/60 px-4 py-3 text-ink-50 placeholder:text-ink-300/40 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor="business" className="text-sm font-medium text-ink-300">
                  Business name
                </label>
                <input
                  id="business"
                  required
                  value={form.business}
                  onChange={(e) => updateField('business', e.target.value)}
                  placeholder="Bright Smile Dental"
                  className="rounded-xl border border-ink-50/15 bg-navy-950/60 px-4 py-3 text-ink-50 placeholder:text-ink-300/40 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor="email" className="text-sm font-medium text-ink-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="jamie@brightsmile.com"
                  className="rounded-xl border border-ink-50/15 bg-navy-950/60 px-4 py-3 text-ink-50 placeholder:text-ink-300/40 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor="phone" className="text-sm font-medium text-ink-300">
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="rounded-xl border border-ink-50/15 bg-navy-950/60 px-4 py-3 text-ink-50 placeholder:text-ink-300/40 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="industry" className="text-sm font-medium text-ink-300">
                  Type of business
                </label>
                <select
                  id="industry"
                  value={form.industry}
                  onChange={(e) => updateField('industry', e.target.value)}
                  className="rounded-xl border border-ink-50/15 bg-navy-950/60 px-4 py-3 text-ink-50 outline-none focus:border-violet-400"
                >
                  {industries.map((industry) => (
                    <option key={industry} value={industry} className="bg-navy-900">
                      {industry}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="mt-2 rounded-full bg-violet-500 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-violet-400 sm:col-span-2"
              >
                Get Started
              </button>
              <p className="text-center text-xs text-ink-300/60 sm:col-span-2">
                We'll never share your info or spam you.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

export default WaitlistForm
