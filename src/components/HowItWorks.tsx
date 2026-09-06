import { CalendarCheck2, MessageSquareText, PlugZap } from 'lucide-react'

const steps = [
  {
    icon: PlugZap,
    title: 'Connect in one afternoon',
    body: 'We plug into your website chat and your business line — no new number to give out, no app for customers to download.',
  },
  {
    icon: MessageSquareText,
    title: 'AI handles the conversation',
    body: 'It answers questions, quotes pricing, and qualifies the lead in natural language — trained on your hours, services, and policies.',
  },
  {
    icon: CalendarCheck2,
    title: 'It books straight to your calendar',
    body: "Confirmed appointments land in your calendar automatically. You get a text the moment a hot lead comes in that needs a human touch.",
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            How it works
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Live in an afternoon. Working while you sleep.
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-mint-400/15 text-mint-300">
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span className="font-display text-sm font-semibold text-ink-300">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-ink-300">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
