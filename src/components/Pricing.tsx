import { Check } from 'lucide-react'

// Set VITE_PAYMENT_LINK_URL in Netlify's environment variables once
// you've created a Stripe Payment Link (see README's "Selling it"
// section) — the button below will link straight to checkout. Until
// then, it sends people to the contact form instead. Doing this as an
// env var (not hardcoded here) means changing the link or price later
// is a Netlify settings change, not a code edit.
const PAYMENT_LINK_URL = import.meta.env.VITE_PAYMENT_LINK_URL || ''

const LAUNCH_PRICE = '$697'
const REGULAR_PRICE = '$997'
const LAUNCH_SPOTS = 15

const features = [
  'A working AI chat widget installed on their website',
  'Missed-call text-back and SMS, set up on their own number',
  'Personally configured with their real hours, pricing, and services',
  'Real calendar booking if they use (or set up) Cal.com',
  'No subscription, no recurring bill from us — ever',
]

function Pricing() {
  const ctaHref = PAYMENT_LINK_URL || '#waitlist'

  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            Simple, one-time pricing
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Pay once. It's theirs for good.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-300">
            No monthly plan to manage, no surprise bill next month. One price
            for a fully set-up AI front desk.
          </p>
        </div>

        <div className="mt-12 rounded-3xl border border-violet-400/40 bg-violet-500/10 p-8 shadow-xl shadow-violet-950/40 md:p-10">
          <span className="w-fit rounded-full bg-violet-500 px-3 py-1 text-xs font-semibold text-white">
            Launch price — first {LAUNCH_SPOTS} businesses
          </span>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold">{LAUNCH_PRICE}</span>
            <span className="text-lg text-ink-300 line-through">{REGULAR_PRICE}</span>
            <span className="text-ink-300">one-time</span>
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-100">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint-400" strokeWidth={2.5} />
                {feature}
              </li>
            ))}
          </ul>
          <a
            href={ctaHref}
            className="mt-8 block rounded-full bg-violet-500 px-6 py-3.5 text-center text-base font-semibold text-white transition hover:bg-violet-400"
          >
            Get Started — {LAUNCH_PRICE} one-time
          </a>
          <p className="mt-4 text-center text-xs text-ink-300/70">
            One payment, full setup. No subscription, no surprise bill next
            month — ever.
          </p>
        </div>
      </div>
    </section>
  )
}

export default Pricing
