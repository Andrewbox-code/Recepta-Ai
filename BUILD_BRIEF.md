# Recepta AI — Build Brief

This file is written as a standing prompt. Paste the section below
("Prompt for a new session") into a fresh Claude Code session any time
you want to keep building this product — it has everything needed to pick
up the work with no extra context.

## Product

**Recepta AI** — an AI front desk for local service businesses (salons,
dental/med spas, contractors, auto shops, gyms, vets, and similar). It:

1. Answers website chat and texts back every missed call within seconds, 24/7
2. Qualifies the lead in natural conversation (what they need, urgency, budget)
3. Books the appointment straight into the business's calendar
4. Alerts the business owner immediately when a hot lead needs a human

## Why this and why now

Local service businesses lose real revenue every day to unanswered calls
and after-hours chats — and most have no realistic way to staff a 24/7
front desk. "AI receptionist" tools are one of the fastest-growing wedges
in applied AI for exactly this reason: clear, provable ROI (a booked
appointment vs. a missed one), a large addressable market (every local
service business), high willingness to pay ($200–1,000/mo), low churn
once it's handling real revenue, and a real reseller channel — marketing
agencies and consultants are actively white-labeling tools like this to
sell to their own local-business clients.

## Business model

- **Direct SaaS**: sell subscriptions straight to local businesses
  (Starter/Growth tiers, see `Pricing.tsx`)
- **Agency reseller channel**: white-label tier for agencies/consultants
  who resell to their own client base — this is usually the faster path
  to volume, since one agency deal can bring 10+ locations at once
- **Founding-partner motion**: the first ~20 customers get locked-in
  pricing and hands-on setup in exchange for being early — this builds
  the first real testimonials and case studies, which are currently
  missing from the landing page on purpose (no fake reviews)

## Current state (what's already built)

- React/Vite/Tailwind landing page (`src/`) with hero, problem, live
  interactive demo, how-it-works, target industries, pricing, and a
  founding-partner lead-capture form
- A **real Claude-powered backend** for the live demo
  (`netlify/functions/chat.mts`) — once `ANTHROPIC_API_KEY` is set in
  Netlify's environment variables, `src/components/LiveDemo.tsx` has real
  AI conversations, not a script. Without the key set (or when the
  function isn't reachable, e.g. plain local dev), it falls back
  automatically to a realistic scripted conversation so the site never
  breaks — see the README's "Enabling real AI conversations" section
- A **real missed-call text-back and SMS pipeline** via Twilio
  (`netlify/functions/twilio-voice.mts`, `twilio-voice-status.mts`,
  `sms.mts`) — an unanswered call gets texted back within seconds, and
  the resulting SMS conversation runs on the same Claude backend with
  short-term memory per phone number (Netlify Blobs). All three verify
  Twilio's request signature before doing anything, and every send is
  wrapped so a Twilio or Blobs hiccup degrades gracefully instead of
  crashing the webhook. Needs a Twilio account + phone number to
  activate — see the README's "Enabling real missed-call text-back"
  section for exact setup steps
- **Real multi-tenancy** (`netlify/functions/_lib/business-store.mts`,
  `admin-business.mts`, `public/admin.html`) — this one deployment can
  answer for many different businesses at once. Whichever Twilio number
  a call/text came in on decides whose name, hours, pricing, and
  forwarding number get used (stored in Netlify Blobs, looked up by
  number); an unconfigured number just gets the demo persona. Businesses
  are added/edited/removed at `/admin.html` (password-protected by
  `ADMIN_KEY`) with no code changes and no redeploy — this is what lets
  a second, third, and Nth customer get onboarded without a developer
  each time. Verified against Netlify's own local Blobs emulator:
  create/list/lookup/delete all confirmed working, and a call to a
  configured number correctly uses that business's own persona instead
  of the demo's.
- **An embeddable web chat widget** (`public/widget.js`) — a small,
  dependency-free `<script>` tag a customer pastes into their own site;
  it calls `chat.mts` cross-origin (which now sends CORS headers for
  this) using their business key. Verified with a real cross-origin
  browser test (two separate local servers simulating "the customer's
  site" and "this deployment") — loads, opens, sends, and receives
  correctly with no CORS errors.
- **Real calendar booking via Cal.com** (`_lib/calcom.mts`,
  `_lib/anthropic-client.mts`'s tool-use loop) — when a business has a
  Cal.com API key + event type ID set in `/admin.html`, Claude gets real
  `check_availability`/`book_appointment` tools and only tells customers
  about real open slots and real confirmed bookings. Without those two
  fields set, behavior is unchanged (talks about booking, doesn't create
  anything) — verified that businesses without Cal.com configured are
  completely unaffected, and that both Cal.com calls degrade gracefully
  (return "unavailable," never crash the conversation) when the API is
  unreachable. **Not verified against a live Cal.com account** — this
  sandbox has no network access to api.cal.com, so the request/response
  shapes are built from Cal.com's documented v2 API but genuinely
  untested live. Test a real booking together the first time a business
  has real Cal.com credentials.
- The lead form posts to Netlify Forms — zero backend, works the moment
  this is deployed on Netlify (see README for deploy steps)
- Nothing here yet handles billing — that's the roadmap below

## What's needed from the human to go further

- A Netlify account connected to this GitHub repo — deploy takes minutes
  (`netlify.toml` in this repo already configures the build + functions)
- An Anthropic API key from console.anthropic.com, set as
  `ANTHROPIC_API_KEY` in Netlify — turns the live demo into a real AI
  conversation (this is the one piece of Phase 3 already coded and
  waiting on a key)
- A domain name (optional but recommended before real outreach)
- A Twilio account, set as `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` in
  Netlify — one account covers every business's number, this is a
  one-time setup, not per-customer (this is Phase 4, already coded and
  waiting on an account, same as Phase 3 waited on an Anthropic key)
- An `ADMIN_KEY` (any long random string) set in Netlify, then a visit
  to `/admin.html` to actually add each real customer's business (their
  Twilio number, name, hours/pricing, forwarding number) — this is the
  step that turns "the code supports many businesses" into "this
  specific customer's calls actually work"
- A free Cal.com account per business that wants real calendar booking:
  an event type, an API key, and the event type's numeric ID, entered in
  `/admin.html` — this is the piece that needs a live test together
  before trusting it with a real customer (see "Current state" above)
- For Phase 8+: a Stripe account for billing — not needed to deploy,
  collect leads, run real AI web chat/SMS, or run real calendar booking
  today

## Roadmap, in priority order (revenue first, infrastructure second)

1. **Deploy + start driving traffic now.** The MVP as it stands is enough
   to validate demand. Deploy to Netlify, get a domain, and start putting
   this in front of real local businesses (outbound outreach, local
   Facebook/Nextdoor groups, referrals) before building anything else.
   Every founding-partner signup is a live buying signal.
2. **Turn outbound into a repeatable motion.** Draft (and keep iterating)
   cold email/DM scripts targeting the industries in `Industries.tsx`,
   pitching the live demo link directly. Track reply and signup rates per
   script/industry and double down on what converts.
3. **Real AI backend — done, pending a key.** `netlify/functions/chat.mts`
   already calls Claude server-side (the API key never reaches the
   client). Set `ANTHROPIC_API_KEY` in Netlify to turn it on.
4. **Missed-call text-back via Twilio — done, pending an account.**
   `netlify/functions/twilio-voice.mts`, `twilio-voice-status.mts`, and
   `sms.mts` handle the full flow: ring the business (if configured),
   text back on no-answer, and carry the SMS conversation on the same
   Claude backend with per-number memory. Every text-back sends from the
   specific business's own Twilio number (whichever number was actually
   called), never a shared/global one — set `TWILIO_ACCOUNT_SID`/
   `TWILIO_AUTH_TOKEN` to turn it on — see the README.
5. **Multi-tenancy — done.** One deployment now answers correctly for as
   many businesses as you add at `/admin.html`, looked up by whichever
   Twilio number was called or texted. Onboarding customer #2, #3, etc.
   no longer needs a code change or a redeploy — just a visit to
   `/admin.html` with their info and a Twilio number pointed at the same
   two webhook URLs.
6. **Embeddable web widget — done.** `public/widget.js` is a real,
   verified `<script>` tag any customer can paste into their own site,
   passing their business key so `chat.mts` answers as them across
   origins. Next evolution: right now it always uses the shared
   Recepta-branded look; a per-business color/greeting override in
   `/admin.html` would let it match each customer's site better.
7. **Calendar booking — built, needs a live test.** Claude gets real
   `check_availability`/`book_appointment` tools the moment a business
   has Cal.com credentials in `/admin.html`. This is the one piece in
   the whole repo that couldn't be verified against a live account from
   this sandbox — budget time to test a real booking together and fix
   any field-name mismatches against Cal.com's actual API responses
   before trusting it with a paying customer.
8. **Stripe billing.** Self-serve checkout for the Starter/Growth tiers;
   the Agency tier can stay a manual sales conversation.
9. **Case studies.** Once the first founding partners are live, replace
   the honest "no fake testimonials yet" framing in `FoundingPartners.tsx`
   with real quotes and results.

## Prompt for a new session

> I'm continuing work on Recepta AI, an AI front desk product for local
> service businesses, in this repo. Read `BUILD_BRIEF.md` and `README.md`
> for full context on the product, business model, and roadmap. The
> landing page is deployed (or ready to deploy) via Netlify, with a real
> Claude-powered backend for web chat and Twilio-powered missed-call
> text-back/SMS already built, real multi-tenancy so one deployment can
> serve many businesses (added/managed at `/admin.html`, no code changes
> needed per customer), an embeddable widget customers can put on their
> own site (`public/widget.js`), and Cal.com calendar booking tools
> wired into the AI (built but not yet verified against a live Cal.com
> account — see `BUILD_BRIEF.md`'s roadmap item 7). See "What's needed
> from the human" in `BUILD_BRIEF.md` for the few things still needed to
> flip each piece on. My priority is revenue: help me either
> (a) push the roadmap forward — pick the next unbuilt phase in
> `BUILD_BRIEF.md`'s roadmap and implement it, or (b) improve conversion
> on the existing landing page (copy, demo realism, pricing framing), or
> (c) draft outbound sales/outreach content to get real local businesses
> looking at this. Ask me which of these to focus on if it isn't obvious
> from what I've said, then do the work end-to-end — build it, test it,
> commit it, and tell me exactly what I still need to do on my end (like
> connecting an API key or a Stripe account) to make it real.
