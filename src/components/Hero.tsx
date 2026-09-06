import { ArrowRight, Sparkles } from 'lucide-react'

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
      <div
        className="pointer-events-none absolute inset-x-0 top-[-10rem] -z-10 h-[40rem] bg-[radial-gradient(ellipse_at_top,_var(--color-violet-600)_0%,_transparent_60%)] opacity-30"
        aria-hidden="true"
      />
      <div className="mx-auto max-w-4xl px-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-300">
          <Sparkles className="h-4 w-4" strokeWidth={2.25} />
          One-time price — no subscription
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-ink-50 md:text-6xl">
          Your business never sleeps.
          <br />
          Now your front desk doesn't either.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-300 md:text-xl">
          Recepta AI answers every website chat and texts back every missed call in
          seconds — 24/7 — qualifies the lead, and books it straight into your
          calendar. No more voicemail. No more "we'll call you back."
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#demo"
            className="flex items-center gap-2 rounded-full bg-violet-500 px-7 py-3.5 text-base font-semibold text-white transition hover:bg-violet-400"
          >
            Try the live demo
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </a>
          <a
            href="#pricing"
            className="rounded-full border border-ink-50/15 px-7 py-3.5 text-base font-semibold text-ink-50 transition hover:bg-ink-50/5"
          >
            See the one-time price
          </a>
        </div>
        <p className="mt-5 text-sm text-ink-300/70">
          Built for salons, dental &amp; med spas, contractors, auto shops, gyms, and vets.
        </p>
      </div>
    </section>
  )
}

export default Hero
