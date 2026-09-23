import { Clock, PhoneMissed, MessageSquareOff } from 'lucide-react'

const points = [
  {
    icon: PhoneMissed,
    title: 'Calls go to voicemail',
    body: 'Front desk is busy, it\'s after hours, or nobody\'s free to pick up — the caller hangs up and books your competitor instead.',
  },
  {
    icon: MessageSquareOff,
    title: 'Website chats go unanswered',
    body: 'A visitor asks a question at 9pm. Nobody replies until tomorrow. By then they\'ve already found someone else.',
  },
  {
    icon: Clock,
    title: 'Follow-up takes too long',
    body: 'Every minute a lead waits, the odds they book with you drop. Manual follow-up just can\'t move fast enough.',
  },
]

function Problem() {
  return (
    <section className="border-y border-ink-50/10 bg-navy-900/60 py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            The problem
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Every missed call is a customer you already earned — and lost.
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {points.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-ink-50/10 bg-navy-850 p-7"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
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

export default Problem
