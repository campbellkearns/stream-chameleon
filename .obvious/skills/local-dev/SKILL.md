---
name: local-dev
description: How to bring stream-chameleon's local dev environment up and verify it works (npm + Vite + Playwright on port 5173)
---

# local-dev — stream-chameleon

Verified working 2026-09-03 on sandbox `cmp_fBDF7K99` (session
`ig5ftccd0bfdr2g90bh0d`, snapshot built 2026-09-03T15:24:59Z).

## Bring-up sequence

```bash
# 0. If node_modules/ exists but is root-owned (prebuilt sandbox image):
sudo chown -R user:user node_modules

# 1. Dependencies (npm is the repo's manager — package-lock.json is committed)
npm install --no-audit --no-fund

# 2. Playwright browsers + system libs (chromium & webkit cover all 4 projects)
npx playwright install chromium webkit
sudo npx playwright install-deps chromium webkit

# 3. Dev server — parse the port from output, do not assume
nohup npm run dev > /tmp/vite-dev.log 2>&1 &
# → "VITE v7.0.3 ready" → Local: http://localhost:5173/
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/   # expect 200
```

## Environment

No secrets needed. All env vars optional (`.env.example`):
`VITE_TWITCH_CLIENT_ID` (empty ⇒ Twitch API actions disabled, app + tests still
run), `VITE_API_BASE_URL`, `VITE_DEBUG`. IndexedDB makes the app fully
offline-capable — no DB/Redis/Docker services required.

## Verification

- **Primary flow (browser):** goto `/` → wait for `h1 "Stream Profiles"` →
  click "New Profile" → fill `input[name=name|description|title|tags]`,
  category via `input[placeholder*="Search for a category"]` → option
  `button[role=option]` → "Create Profile" → redirects to `/`, profile listed.
  A clean run shows **0 console errors**.
- **Lint:** `npm run lint` — passes clean.
- **Typecheck:** `npx tsc --noEmit` — 15 pre-existing errors on `main`
  (`Cannot find namespace 'JSX'`, unused imports). Build (`vite build`,
  esbuild-only) is NOT gated on tsc.
- **E2e:** `npx playwright test` — 124/176 pass. 52 pre-existing failures are
  test-code bugs (strict-mode violations, e.g.
  `tests/profile-crud.spec.ts:53` `text=No profiles yet` matches 2 elements)
  and documented known issues (EXE-24: no service worker registration in
  `src/main.tsx`; EXE-25: missing PNG favicons — see `tests/README.md`).
  Chromium-only: 31/44 pass. Do not treat these as environment breakage.

## Gotchas

- Prebuilt sandbox `node_modules/` can be root-owned → EACCES on `npm install`
  and Vite cache writes. Fix with `sudo chown -R user:user node_modules`.
- `bun.lock` may appear untracked in the worktree (prebuilt image artifact).
  Do not stage it — the repo's lockfile is `package-lock.json`.
- Playwright config reuses an already-running dev server
  (`reuseExistingServer: !CI`) — start one server, use it for everything.
- Netlify `[[redirects]]` serves `index.html` for all routes (BrowserRouter);
  locally Vite handles this natively.
