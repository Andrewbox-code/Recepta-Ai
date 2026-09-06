import { Dumbbell, Hammer, Heart, PawPrint, Scissors, Wrench } from 'lucide-react'

const industries = [
  { icon: Scissors, label: 'Salons & spas' },
  { icon: Heart, label: 'Dental & med spas' },
  { icon: Hammer, label: 'Contractors' },
  { icon: Wrench, label: 'Auto shops' },
  { icon: Dumbbell, label: 'Gyms & studios' },
  { icon: PawPrint, label: 'Vets & pet care' },
]

function Industries() {
  return (
    <section id="industries" className="border-y border-ink-50/10 bg-navy-900/60 py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            Built for local service businesses
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            If people call or message you to book, this is for you.
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-6">
          {industries.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-3 rounded-2xl border border-ink-50/10 bg-navy-850 px-4 py-6 text-center"
            >
              <Icon className="h-6 w-6 text-violet-300" strokeWidth={2} />
              <span className="text-sm font-medium text-ink-100">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Industries
