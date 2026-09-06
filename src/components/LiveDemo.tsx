import { useEffect, useRef, useState } from 'react'
import { Bot, Send, User } from 'lucide-react'

type Message = {
  from: 'ai' | 'user'
  text: string
}

type ApiMessage = {
  role: 'user' | 'assistant'
  content: string
}

const openingMessage: Message = {
  from: 'ai',
  text:
    "Hi! Thanks for reaching out to Bright Smile Dental. I'm the AI front desk — I can check availability, answer quick questions, or get you booked. What can I help with?",
}

const quickReplies = [
  'Do you have anything open tomorrow?',
  'How much is a cleaning?',
  'What are your hours?',
  'Someone can call me back',
]

function randomDelayMs(): number {
  return 700 + Math.random() * 500
}

function scriptedReply(input: string): string {
  const text = input.toLowerCase()

  if (/(appointment|book|available|open|tomorrow|today|schedule|slot)/.test(text)) {
    return "I've got 10:30am and 2:15pm open tomorrow. Which works better? I just need your name and phone number and you're all set — I'll text a confirmation right away."
  }
  if (/(price|cost|how much|\$)/.test(text)) {
    return "A standard cleaning runs $89–$129 depending on your plan — I can pull your exact quote once I know if you have insurance on file. Want me to check a time to come in?"
  }
  if (/(hour|open|close|when)/.test(text)) {
    return "We're open Mon–Fri 8am–6pm and Sat 9am–2pm — but I'm here to help 24/7, even outside those hours. Want to grab a spot on the calendar now?"
  }
  if (/(call|human|person|talk to someone|agent)/.test(text)) {
    return "Totally — I've flagged this for the team to call you back within the hour. In the meantime, can I grab your name and best number?"
  }
  if (/(emergency|pain|hurts|urgent)/.test(text)) {
    return "I'm sorry you're dealing with that — I've marked this as urgent and we can usually fit same-day emergency visits. What's the best number to reach you at right now?"
  }
  if (/^(hi|hey|hello)\b/.test(text)) {
    return 'Hey there! What can I help you get sorted today — booking, pricing, or a quick question?'
  }
  return "Got it — let me get that sorted for you. Could I grab your name and phone number so I can follow up (or text you the details) right away?"
}

async function fetchLiveReply(history: ApiMessage[]): Promise<string> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`chat function returned ${res.status}`)
    const data = (await res.json()) as { reply?: string }
    if (!data.reply) throw new Error('chat function returned no reply')
    return data.reply
  } finally {
    window.clearTimeout(timeout)
  }
}

function LiveDemo() {
  const [messages, setMessages] = useState<Message[]>([openingMessage])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [liveAi, setLiveAi] = useState<boolean | null>(null)
  const apiUnavailable = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || typing) return

    const nextMessages = [...messages, { from: 'user', text: trimmed } as Message]
    setMessages(nextMessages)
    setInput('')
    setTyping(true)

    if (apiUnavailable.current) {
      window.setTimeout(() => {
        setMessages((prev) => [...prev, { from: 'ai', text: scriptedReply(trimmed) }])
        setTyping(false)
      }, randomDelayMs())
      return
    }

    try {
      const history: ApiMessage[] = nextMessages.map((m) => ({
        role: m.from === 'user' ? 'user' : 'assistant',
        content: m.text,
      }))
      const reply = await fetchLiveReply(history)
      setMessages((prev) => [...prev, { from: 'ai', text: reply }])
      setLiveAi(true)
    } catch {
      apiUnavailable.current = true
      setLiveAi(false)
      await new Promise((resolve) => window.setTimeout(resolve, randomDelayMs()))
      setMessages((prev) => [...prev, { from: 'ai', text: scriptedReply(trimmed) }])
    } finally {
      setTyping(false)
    }
  }

  return (
    <section id="demo" className="py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-mint-400">
            See it in action
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            This is what your customers get. Try it yourself.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-300">
            A live, interactive preview of a Recepta AI front desk. Type a message
            or tap a suggestion below.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-ink-50/10 bg-navy-850 shadow-2xl shadow-violet-950/40">
          <div className="flex items-center gap-3 border-b border-ink-50/10 bg-navy-800 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
              <Bot className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-50">Bright Smile Dental — AI Front Desk</p>
              <p className="flex items-center gap-1.5 text-xs text-mint-400">
                <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
                {liveAi ? 'Live AI · online now' : 'Online now'}
              </p>
            </div>
          </div>

          <div ref={scrollRef} className="flex h-96 flex-col gap-3 overflow-y-auto px-5 py-5">
            {messages.map((message, i) => (
              <div
                key={i}
                className={`flex items-end gap-2 ${message.from === 'user' ? 'flex-row-reverse self-end' : 'self-start'}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    message.from === 'user' ? 'bg-mint-400/20 text-mint-300' : 'bg-violet-500/20 text-violet-300'
                  }`}
                >
                  {message.from === 'user' ? (
                    <User className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <Bot className="h-3.5 w-3.5" strokeWidth={2.5} />
                  )}
                </span>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    message.from === 'user'
                      ? 'rounded-br-sm bg-mint-400/15 text-ink-50'
                      : 'rounded-bl-sm bg-navy-700 text-ink-100'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-end gap-2 self-start">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
                  <Bot className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-navy-700 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-300 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-300 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-300" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-ink-50/10 bg-navy-800 px-5 py-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickReplies.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border border-ink-50/15 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-violet-400/50 hover:text-ink-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-full border border-ink-50/15 bg-navy-950/60 px-4 py-2.5 text-sm text-ink-50 placeholder:text-ink-300/50 outline-none focus:border-violet-400"
              />
              <button
                type="submit"
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition hover:bg-violet-400"
              >
                <Send className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </form>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-300/60">
          {liveAi
            ? "You're talking to real Claude-powered conversation AI, trained on this demo practice's hours, pricing, and calendar."
            : 'Your live agent runs on real conversation AI, trained on your business\'s hours, pricing, and calendar.'}
        </p>
      </div>
    </section>
  )
}

export default LiveDemo
