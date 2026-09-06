import { MessageCircleMore } from 'lucide-react'

function Footer() {
  return (
    <footer className="border-t border-ink-50/10 bg-navy-950 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-ink-300 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
            <MessageCircleMore className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <span className="font-display font-semibold text-ink-50">Recepta AI</span>
        </div>
        <p>© {new Date().getFullYear()} Recepta AI. Your front desk, automated.</p>
      </div>
    </footer>
  )
}

export default Footer
