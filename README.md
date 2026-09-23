# ParFront — Golf Automation Landing Page

Landing page for an AI automation agency serving golf instructors, small
golf courses, and driving ranges. Built with React, TypeScript, Vite, and
Tailwind CSS.

## What it covers

- Pain-first hero, problem section, and an interactive "what we automate"
  module picker (lead follow-up, no-show reduction, review generation,
  FAQ chatbot)
- ROI before/after section, pricing tiers, placeholder testimonials, and
  a lead capture form for booking a free automation audit

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
   **Import an existing project** → pick this repo.
3. Build command: `npm run build`. Publish directory: `dist`. Deploy.
4. Every submission on the "Book a free automation audit" form now shows
   up under your Netlify site's **Forms** tab, and Netlify can email you
   on each new submission (Site settings → Forms → Notifications).

No Formspree, no database, no server code — the form in
`src/components/AuditForm.tsx` already posts to Netlify's forms endpoint,
and `index.html` has the hidden static form Netlify needs to register it
at build time. This only activates on Netlify; on any other host (or in
local dev) the form still works from the visitor's point of view, it just
doesn't have anywhere to deliver submissions yet — swap in your own
backend (Formspree, a Zapier webhook, your CRM's API) by changing the
`fetch` call in `handleSubmit`.

### Custom domain

Once deployed, Netlify's **Domain settings** tab walks you through
pointing a domain you own at the site (or buying one through Netlify).
This step needs your own domain registrar login, so it isn't something
that can be done for you — but it's a five-minute, no-code step once the
site is live.

## Live demo

A snapshot of this page is also published at
`https://claude.ai/code/artifact/82e7e9b5-f103-4b7d-9695-382d2ccf2a26` for
sharing the look and feel quickly. That link is a static preview only —
its form does not deliver anywhere — so use a real Netlify (or other)
deployment for anything you plan to send prospects to for lead capture.

## Golf game prototype

`golf/` is a separate, self-contained project: a browser 3D golf game prototype that uses a gesture-based swing. See [`golf/README.md`](golf/README.md).
