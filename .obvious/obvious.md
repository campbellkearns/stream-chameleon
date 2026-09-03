# stream-chameleon — Agent Guide

One-click Twitch stream profile manager: a local-first PWA for creating and
applying stream profiles (category, title, tags). Deployed on Netlify.

## Stack

- **Runtime:** Node 20 (npm 10; committed lockfile `package-lock.json`)
- **Framework:** React 19 + Vite 7 + TypeScript 5.6 (SPA, `react-router-dom` v7)
- **Styling:** Tailwind CSS 4 (`@tailwindcss/vite`)
- **PWA:** `vite-plugin-pwa` (manifest + Workbox runtime caching)
- **Storage:** IndexedDB via `src/lib/db/` — works fully offline, no server DB
- **External API:** Twitch Helix (`api.twitch.tv`) + Twitch OAuth (`id.twitch.tv`)
  — optional at runtime; app degrades gracefully without credentials
- **Tests:** Playwright e2e (`tests/`) against a live dev server
- **Lint:** ESLint 9 flat config
- **Deploy:** Netlify (`netlify.toml`, `npm run build` → `dist`)

## Commands

```bash
npm install                 # deps (lockfile: package-lock.json)
npm run dev                 # Vite dev server → http://localhost:5173
npm run lint                # ESLint (passes clean)
npx tsc --noEmit            # typecheck (15 pre-existing errors, see Notes)
npm test                    # Playwright e2e (all 4 projects)
npx playwright test --project=chromium   # e2e, desktop chromium only
npm run build               # production build → dist/
```

Playwright starts/reuses the dev server itself (`webServer` in
`playwright.config.ts`, base URL `http://localhost:5173`).

## Env vars (all optional for local dev)

| Var | Purpose |
|---|---|
| `VITE_TWITCH_CLIENT_ID` | Twitch app client ID; empty ⇒ API actions disabled, UI still works |
| `VITE_API_BASE_URL` | Override Twitch API base URL |
| `VITE_DEBUG` | Debug logging |

See `.env.example`. No secrets are required to run or test locally.

## Codebase map

See `codebase-map.md`. Routes: `/` (Dashboard), `/profile/new`,
`/profile/:id/edit`, `/support`, `/auth`, `/auth/callback`.

## Local Verification Summary

Verified 2026-09-03 during onboarding (sandbox `cmp_fBDF7K99`):

- `npm run dev` → Vite ready, serving on **http://localhost:5173** (HTTP 200)
- Primary flow (browser automation, headless chromium): dashboard loads →
  "New Profile" → fill form (name, description, title template, category
  "Just Chatting" via search dropdown, tags) → submit → redirect to dashboard →
  profile listed. Screenshots captured; **0 console errors**.
- `npm run lint` → clean pass
- `npx tsc --noEmit` → 15 pre-existing errors (build does not gate on tsc)
- `npx playwright test` → 124/176 passed; 52 pre-existing failures (see Notes)

Quick health check: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/`
(expect `200`).

## Snapshot

- Sandbox: `cmp_fBDF7K99` (repo sandbox, session `ig5ftccd0bfdr2g90bh0d`)
- Snapshot built: 2026-09-03T15:24:59Z — deps installed, Playwright browsers +
  system libs present, dev stack verified working.

## Notes / known issues

- **Pre-existing e2e failures (52/176):** test-code bugs, not app failures —
  e.g. strict-mode violations (`locator('text=No profiles yet')` matches 2
  elements in `tests/profile-crud.spec.ts:53`), plus known issues documented in
  `tests/README.md` (EXE-24: service worker never registered in `src/main.tsx`;
  EXE-25: PNG favicons missing). The app's primary flows work — verified by
  direct browser automation.
- **tsc errors are pre-existing** on `main`; `npm run build` (esbuild) does not
  typecheck, so they do not block the build.
- Sandbox gotcha: a prebuilt `node_modules/` may be root-owned —
  `sudo chown -R user:user node_modules` before npm/vite write to it.
