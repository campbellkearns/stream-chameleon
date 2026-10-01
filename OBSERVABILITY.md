# Observability for Stream Chameleon

## Why this matters here specifically

Stream Chameleon is a **client-only PWA** — no backend of its own. It runs entirely in the
user's browser, talks directly to Twitch's API/OAuth endpoints (`netlify.toml` CSP
whitelists only `api.twitch.tv` and `id.twitch.tv`), persists profiles in IndexedDB, and
layers a service worker on top for offline use. That architecture changes what
"observability" means:

- There's no server to tail logs on. Every error, slow request, or broken auth flow
  happens on a device you'll never see, and today the only trace of it is whatever the
  user notices and (maybe) tells you.
- Errors are already being caught in useful shapes (`useAPIHealth`, `APIStatus.tsx`,
  the Twitch health-check plumbing) but they die in local component state — nothing
  escapes the browser.
- The app already models "is Twitch reachable" as first-class state. That's 80% of an
  observability signal already built; it just isn't going anywhere.
- Offline-first + service worker + IndexedDB means there are several classes of bugs
  (stale cache, failed sync, IndexedDB write failures, SW update races) that are
  *invisible in dev* and only show up on real devices in real network conditions.

So the case for observability isn't "we're at scale and need to find the needle in the
haystack" — it's "this app's failure modes are structurally invisible to me right now,
and I have zero users to report them."

## What it would give you before you have users

1. **Error visibility with zero user base.** Frontend error tracking (Sentry or similar)
   turns "a bug happened to someone, somewhere, and I'll never know" into an actionable
   ticket with a stack trace, breadcrumbs, browser/OS, and the state leading up to it.
   For a pre-launch app this is the highest-leverage addition — it's the difference
   between shipping blind and shipping with a safety net.
2. **Real-world validation of the offline/PWA story.** The offline mode and service
   worker caching are the app's most technically interesting (and most fragile) features.
   Instrumenting SW lifecycle events, IndexedDB failures, and sync-on-reconnect gives you
   proof the offline story actually works outside Playwright, on real devices with real
   flaky connections.
3. **Twitch API/OAuth reliability signal.** `useAPIHealth` already polls Twitch every 5
   minutes and classifies response times. Right now that data is thrown away once the
   component unmounts. Piping it (even just health-check pings, auth failures, 4xx/5xx
   rates from `twitchAPI.ts`) into a dashboard tells you whether outages are Twitch's
   fault or yours — important since your CSP and OAuth flow are both attack surface and
   fragility surface.
4. **Product-shaped analytics once you do have users.** Funnel data (auth → create
   profile → apply profile → switch category) tells you where real users drop off,
   which categories/templates get used, and whether the PWA install prompt converts —
   all things you can't guess from a static demo.
5. **Portfolio value.** For a job search, "I instrumented a client-only PWA with
   error tracking, RUM, and product analytics, and made deliberate calls about what
   *not* to track given zero backend and a strict CSP" is a much stronger story than
   the app existing without any of that. It signals you think about production
   readiness, not just features.

## Constraints from the current architecture

- **No backend = no server-side aggregation point.** Everything must be shipped from
  the browser directly to a third-party ingestion endpoint, or to a lightweight
  Netlify Function you add later. This pushes you toward vendor SDKs (Sentry, PostHog,
  etc.) rather than a self-hosted stack (Prometheus/Grafana don't have anything to
  scrape).
- **CSP is already locked down** (`connect-src 'self' https://api.twitch.tv
  https://id.twitch.tv`). Any observability vendor's ingestion domain has to be added
  explicitly to `connect-src` in `netlify.toml`, or events will be silently blocked by
  the browser — this is a real gotcha, not a formality, and worth testing after adding
  any SDK.
- **PWA/offline-first means events can't assume connectivity.** A user hits an error
  while offline; the event needs to queue and flush on reconnect, or you lose exactly
  the failures (offline mode bugs) you most want to see. Most vendor SDKs handle this
  with an internal retry queue, but verify it rather than assume it.
- **No user base yet = privacy/compliance surface is small, so add it now.** There's no
  migration pain, no existing users to notify, no legacy PII in old events. This is the
  cheapest observability will ever be to bolt on — waiting until after launch means
  doing it under a live user base and probably a privacy policy update.
- **OAuth tokens and profile data are sensitive.** Whatever you pick, scrub Twitch
  access tokens, refresh tokens, and profile contents from error payloads and session
  replays before they leave the browser. Sentry/PostHog both support `beforeSend`
  scrubbing — use it from day one, not as a retrofit.
- **Bundle size matters for a PWA.** You're optimizing for install size and offline
  cache footprint; pick SDKs with tree-shakeable, small clients (Sentry's browser SDK
  and PostHog's are both reasonable) rather than a heavyweight APM agent.

## Suggested approach, given "pre-launch + portfolio"

Recommendation: **start with error tracking, add lightweight product analytics once
you're actually inviting users, skip infra-style observability entirely.**

1. **Sentry (or a comparable frontend error tracker) — do this first.** Wire it into
   `main.tsx` as a top-level error boundary plus manual capture in the catch blocks
   already present in `twitchAPI.ts` and `useAPIHealth.ts`. This is small, cheap, and
   immediately useful even with one user (you, testing).
2. **Feed `useAPIHealth` results into it too.** You already compute availability and
   response time every 5 minutes — send degraded/unavailable events as breadcrumbs or
   custom events instead of only rendering them in `APIStatus.tsx`. Free signal you're
   already computing.
3. **Add PostHog (or similar) once you're ready to let real people use it**, for
   funnel/retention analytics — not before, since analytics with zero users is just
   noise and adds attack surface for no benefit yet. Design the events now if you want
   (e.g. `profile_created`, `profile_applied`, `category_search_used`,
   `pwa_installed`), but don't wire the SDK in until there's someone to measure.
4. **Skip full RUM/APM (Datadog, New Relic, etc.) for now.** That tooling is built for
   multi-service backends with real traffic; here it's overkill and a cost line for a
   pre-revenue side project. Revisit only if you add a backend/serverless layer.
5. **When you do add it, document the choice in the README.** For a portfolio piece,
   a short "Observability" section explaining what's tracked, what's scrubbed, and why
   is itself a signal of engineering maturity to anyone reviewing the repo.

## Suggested first step

Add Sentry's browser SDK, wrap `App.tsx` in its `ErrorBoundary`, capture exceptions in
the existing `catch` blocks in `twitchAPI.ts` / `twitchAuth.ts`, add
`beforeSend` scrubbing for tokens, and add the Sentry ingestion origin to
`connect-src` in `netlify.toml`. That's a half-day task that immediately converts
"silent failures on devices I can't see" into actionable bug reports — the single
highest-leverage change available given the current architecture and user count.
