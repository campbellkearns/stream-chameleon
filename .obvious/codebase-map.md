# Codebase Map — stream-chameleon

Single-page React app (Vite). No sub-apps, no server. Depth capped at 2.

| Path | Purpose |
|---|---|
| `src/` | App source (React 19 + TS) |
| `src/components/` | Shared UI: `APIStatus`, `CategorySearchDropdown`, `Layout` |
| `src/hooks/` | Data hooks: `useAPIHealth`, `useAuth`, `useCategories`, `useProfiles` |
| `src/lib/api/` | Twitch Helix API client (`twitchAPI.ts`) |
| `src/lib/auth/` | Twitch OAuth helpers |
| `src/lib/db/` | IndexedDB wrapper — local-first persistence layer |
| `src/lib/test/` | In-app console test utilities (auth, repositories, epic 3) |
| `src/pages/` | Route pages: `Dashboard`, `CreateProfile`, `EditProfile`, `AuthPage`, `AuthCallback`, `SupportPage` |
| `src/repositories/` | `ProfileRepository`, `CategoryRepository` over IndexedDB |
| `src/types/` | TS types, constants, `env.d.ts` (Vite env typings) |
| `tests/` | Playwright e2e specs (`profile-crud`, `offline-mode`, `dynamic-templating`, `category-search`, `pwa`) + README |
| `public/` | Static PWA assets: icons, apple splash screens, favicon |
| `index.html` | SPA entry (meta tags, PWA/SEO tags) |
| `vite.config.ts` | React, Tailwind 4, PWA plugin (manifest, Workbox caching), `@` alias to `src/` |
| `playwright.config.ts` | E2e config: 4 projects, `webServer` auto-starts `npm run dev` on :5173 |
| `netlify.toml` | Deploy: `npm run build` → `dist`, SPA redirect, cache/security headers |
| `.env.example` | Optional Vite env vars (Twitch client ID etc.) |
