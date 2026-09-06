import Anthropic from '@anthropic-ai/sdk'
import { createBooking, getAvailability, isCalConfigured } from './calcom.mts'
import type { BusinessProfile } from './business-store.mts'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const BOOKING_TOOLS: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description:
      'Get REAL open appointment slots for one calendar date. Always call this before telling the customer any specific available time — never invent times when this tool is available.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The date to check, as YYYY-MM-DD.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description:
      'Create a REAL appointment booking. Only call this after the customer has picked a specific time returned by check_availability, and you have their name, phone number, and email.',
    input_schema: {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          description: 'The exact slot start time, copied verbatim from a check_availability result.',
        },
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['startTime', 'name', 'phone', 'email'],
    },
  },
]

async function runTool(
  toolUse: Anthropic.ToolUseBlock,
  business: BusinessProfile,
): Promise<Record<string, unknown>> {
  try {
    if (toolUse.name === 'check_availability') {
      const input = toolUse.input as { date?: unknown }
      if (typeof input.date !== 'string') return { error: 'invalid_input' }
      const slots = await getAvailability(business, input.date)
      return { slots }
    }
    if (toolUse.name === 'book_appointment') {
      const input = toolUse.input as { startTime?: unknown; name?: unknown; phone?: unknown; email?: unknown }
      if (
        typeof input.startTime !== 'string' ||
        typeof input.name !== 'string' ||
        typeof input.phone !== 'string'
      ) {
        return { error: 'invalid_input' }
      }
      const result = await createBooking(business, {
        startTime: input.startTime,
        name: input.name,
        phone: input.phone,
        email: typeof input.email === 'string' ? input.email : undefined,
      })
      return result
    }
    return { error: 'unknown_tool' }
  } catch (error) {
    console.error(`Tool "${toolUse.name}" failed:`, error)
    return { error: 'tool_failed' }
  }
}

/**
 * Calls Claude with the given system prompt (build one with
 * buildSystemPrompt from ./persona.mts). Returns null (rather than
 * throwing) when no API key is configured, so callers can fall back
 * gracefully instead of treating "not set up yet" as an error.
 *
 * When the business has Cal.com configured (see ./calcom.mts), this
 * gives Claude real booking tools and runs the multi-turn tool loop;
 * otherwise it's a single call with no tools, identical to before —
 * businesses without Cal.com configured are completely unaffected.
 */
export async function getAiReply(
  messages: ChatMessage[],
  systemPrompt: string,
  business: BusinessProfile,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const anthropic = new Anthropic({ apiKey })
  const model = process.env.CHAT_MODEL || 'claude-sonnet-5'
  const useTools = isCalConfigured(business)
  const tools = useTools ? BOOKING_TOOLS : undefined

  let working: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }))

  const MAX_TOOL_ROUNDS = 4
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: working,
      tools,
    })

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )

    if (toolUses.length === 0 || round === MAX_TOOL_ROUNDS) {
      const textBlock = response.content.find((block) => block.type === 'text')
      return textBlock && 'text' in textBlock ? textBlock.text : null
    }

    working.push({ role: 'assistant', content: response.content })
    const resultBlocks: Anthropic.ToolResultBlockParam[] = []
    for (const toolUse of toolUses) {
      const result = await runTool(toolUse, business)
      resultBlocks.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) })
    }
    working.push({ role: 'user', content: resultBlocks })
  }

  return null
}
