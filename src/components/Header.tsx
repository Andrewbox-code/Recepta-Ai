import { MessageCircleMore } from 'lucide-react'

const links = [
  { href: '#demo', label: 'Live demo' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#industries', label: 'Who it’s for' },
  { href: '#pricing', label: 'Pricing' },
]

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-50/10 bg-navy-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
            <MessageCircleMore className="h-4.5 w-4.5" strokeWidth={2.25} />
          </span>
          Recepta <span className="text-violet-300">AI</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-ink-300 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-ink-50">
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="#pricing"
          className="rounded-full bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
        >
          Get Recepta AI
        </a>
      </div>
    </header>
  )
}

export default Header
