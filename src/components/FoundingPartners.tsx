import { Handshake, ShieldCheck, TrendingUp } from 'lucide-react'

const perks = [
  {
    icon: Handshake,
    title: 'Direct line to the builder',
    body: 'Launch customers get a direct channel to shape what gets built next — request features, get them shipped fast.',
  },
  {
    icon: ShieldCheck,
    title: 'One price, no subscription',
    body: "Pay once and it's set up for good — no monthly bill, no price creeping up on you later.",
  },
  {
    icon: TrendingUp,
    title: 'White-glove setup',
    body: "We personally set up your AI front desk's knowledge, tone, and booking flow with you — not a self-serve wizard.",
  },
]

function FoundingPartners() {
  return (
    <section className="border-y border-ink-50/10 bg-navy-900/60 py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            Why join now
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            We're onboarding our first 15 businesses by hand.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-300">
            Recepta AI is brand new — which means launch customers get more
            personal attention and a lower one-time price than anyone who
            joins later.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {perks.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-ink-50/10 bg-navy-850 p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-400/15 text-mint-300">
                <Icon className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-ink-300">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default FoundingPartners
