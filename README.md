# Recepta AI — Your AI Front Desk

Landing page + live interactive demo for **Recepta AI**, an AI front desk for
local service businesses (salons, dental/med spas, contractors, auto shops,
gyms, vets). It answers website chat and texts back every missed call 24/7,
qualifies the lead, and books it straight into the business's calendar.
Built with React, TypeScript, Vite, and Tailwind CSS.

See [`BUILD_BRIEF.md`](./BUILD_BRIEF.md) for the full product vision, the
monetization plan, and the phased roadmap — hand that file to a Claude Code
session any time you want to keep building this out.

## What's live in this MVP

- Pain-first hero and problem section aimed at missed-call/missed-chat leads
- A **real, working live demo** (`src/components/LiveDemo.tsx` +
  `netlify/functions/chat.mts`) — the chat widget calls a real Claude-powered
  backend once you add an API key (see below). If the key isn't set, or the
  function isn't reachable (e.g. plain `npm run dev`/`vite preview`), it
  falls back to a realistic scripted conversation automatically — the site
  always works, it just isn't "live AI" until configured
- How-it-works, target-industries, and founding-partner pricing sections
- A lead-capture form (`src/components/WaitlistForm.tsx`) for founding
  partners, wired to Netlify Forms with zero extra backend

## Enabling real AI conversations

The live demo is backed by a real Netlify Function (`netlify/functions/chat.mts`)
that calls the Claude API. To turn it on:

1. Deploy this site on Netlify (see below).
2. In your Netlify site: **Site configuration → Environment variables** →
   add `ANTHROPIC_API_KEY` with a key from
   [console.anthropic.com](https://console.anthropic.com).
3. Redeploy. The widget's status line will switch to "Live AI · online now"
   once it gets a real response.

Optionally set `CHAT_MODEL` (defaults to `claude-sonnet-5`) to use a
cheaper/faster model like `claude-haiku-4-5-20251001` if this gets enough
public traffic that cost matters. See `.env.example` for both variables,
and `npx netlify-cli dev` to run the function locally (plain `npm run dev`
does not run Netlify Functions, so the widget will use the scripted
fallback in local dev unless you use `netlify dev`).

## Enabling real missed-call text-back (Twilio)

Beyond the website chat widget, this repo also has a real backend for
Recepta AI's other core pitch — texting back missed calls and carrying on
an SMS conversation — via three more Netlify Functions:

- `netlify/functions/twilio-voice.mts` — handles an incoming call: rings
  that business's forwarding number if one is set, or texts back
  immediately if not
- `netlify/functions/twilio-voice-status.mts` — fires when that ring
  attempt finishes; anything other than "answered" triggers a text-back
- `netlify/functions/sms.mts` — handles the resulting SMS conversation
  with real Claude replies and short-term memory per phone number (via
  Netlify Blobs, zero extra setup — provisioned automatically once
  deployed on Netlify)

Every one of these verifies Twilio's `X-Twilio-Signature` header (using
Twilio's own SDK, not a hand-rolled check) before doing anything, so only
genuine requests from Twilio can trigger a paid API call or an SMS send.

**This deployment can serve more than one business at once.** Whichever
Twilio number a call or text comes in on decides which business's name,
hours, pricing, and forwarding number get used — that mapping lives in
Netlify Blobs and is managed at `/admin.html` (see below), not in code or
env vars. A number nobody has configured yet just answers as the site's
own demo persona.

To turn it on:

1. Set `ADMIN_KEY` in your Netlify environment variables to some long
   random string — this is the password for `/admin.html`.
2. Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (from
   [console.twilio.com](https://console.twilio.com)) to the same place —
   one Twilio account can hold every business's number, so this is a
   one-time setup, not per-customer.
3. Redeploy once so those take effect.
4. For each new customer: buy them a Twilio number (in the same Twilio
   account), then open `https://YOUR-SITE.netlify.app/admin.html`, enter
   your admin key, and add the business — that Twilio number, their
   name, hours/pricing/services in plain English, and (optionally) a
   real number to ring before texting back.
5. In that Twilio number's configuration, set:
   - **A call comes in** → Webhook, `https://YOUR-SITE.netlify.app/.netlify/functions/twilio-voice`, HTTP POST
   - **A message comes in** → Webhook, `https://YOUR-SITE.netlify.app/.netlify/functions/sms`, HTTP POST
6. Call the number to test — the text-back sends from that same number,
   never a different one, even with other businesses configured.

Only steps 1-3 are one-time setup. Onboarding customer #2, #3, etc. is
just step 4 and 5 again — no redeploy, no code changes.

## Putting the chat widget on a customer's own website

`public/widget.js` is a small, dependency-free embeddable chat bubble.
Give a customer this snippet to paste into their own site's HTML,
anywhere:

```html
<script src="https://YOUR-SITE.netlify.app/widget.js" data-business="+15551234567"></script>
```

`data-business` must exactly match that business's key in `/admin.html`
(the same Twilio number). The widget figures out where to send messages
from its own `src`, so the same snippet works unmodified on any
customer's site — no other configuration needed. It calls
`netlify/functions/chat.mts` across origins (that function sends CORS
headers specifically so this works), so it needs `ANTHROPIC_API_KEY` set
to give real replies, same as the landing page's own demo widget.

Verified with a real cross-origin browser test (one local server acting
as "the customer's site," a separate one acting as this deployment) —
the widget loads, opens, sends, and receives correctly across origins
with no CORS errors.

## Real calendar booking (Cal.com)

If a business has a Cal.com API key and event type ID set in
`/admin.html`, the AI gets two real tools — `check_availability` and
`book_appointment` — and Claude decides when to use them mid-conversation
(see `netlify/functions/_lib/anthropic-client.mts` and `_lib/calcom.mts`).
With those set, it checks real open slots instead of inventing them, and
a confirmed booking is an actual Cal.com booking. Without them, nothing
changes — it behaves exactly as before (talks about booking, doesn't
create anything).

**This one honestly needs a live test before you rely on it.** Everything
else in this repo has been exercised against a real implementation of
its dependency (Twilio's own SDK, Netlify's own local Blobs server) —
this sandbox has no network access to `api.cal.com` and no test account,
so the Cal.com request/response shapes here are built from their
documented v2 API but unverified live. The first time you set a real
`calApiKey`/`calEventTypeId` on a business, test an actual booking
end-to-end and treat any mismatch as expected, not a sign something else
is broken.

To set it up: create a free account at [cal.com](https://cal.com), set
up an event type (the kind of appointment being booked), get an API key
from Settings → Developer → API Keys, and find the event type's numeric
ID (in its URL or via Cal.com's API). Enter both in `/admin.html` for
that business.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
npm run lint      # run oxlint
```

## Deploying it for real

The `npm run build` output in `dist/` is a static site — it runs on any
static host. **Netlify** is the fastest path because the lead form works
out of the box with zero extra backend:

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** →
   **Import an existing project** → pick this repo and branch. Netlify
   reads `netlify.toml` in this repo automatically, so build command,
   publish directory, and the functions folder are already configured —
   just confirm and deploy.
3. Every submission on the "Claim your founding-partner spot" form now
   shows up under your Netlify site's **Forms** tab, and Netlify can email
   you on each new submission (Site settings → Forms → Notifications).
4. Add `ANTHROPIC_API_KEY` (see "Enabling real AI conversations" below) to
   make the live demo run on real AI instead of its scripted fallback.

No Formspree, no database, no server code — the form in
`src/components/WaitlistForm.tsx` already posts to Netlify's forms
endpoint, and `index.html` has the hidden static form Netlify needs to
register it at build time. This only activates on Netlify; on any other
host (or in local dev) the form still works from the visitor's point of
view, it just doesn't have anywhere to deliver submissions yet.

### Custom domain

Once deployed, Netlify's **Domain settings** tab walks you through
pointing a domain you own at the site (or buying one through Netlify).
This step needs your own domain registrar login, so it isn't something
that can be done for you — but it's a five-minute, no-code step once the
site is live.

## Next steps

This repo is the MVP: a landing page proving the pitch with a working
interactive demo, and a way to capture interested leads. It is **not yet**
running real AI conversations, real SMS, or real billing — see
[`BUILD_BRIEF.md`](./BUILD_BRIEF.md) for exactly what to build next and in
what order, prioritized by what gets this to paying customers fastest.
