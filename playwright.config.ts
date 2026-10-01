import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Stream Chameleon
 * Tests the PWA functionality, offline mode, and core features
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testIgnore: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports for PWA testing
    {
      name: 'Mobile Chrome',
      testIgnore: /pwa\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      testIgnore: /pwa\.spec\.ts/,
      use: { ...devices['iPhone 12'] },
    },
    // PWA specs run against a production build via `vite preview`: the
    // manifest and service worker only exist in build output (dev serves
    // /manifest.webmanifest as text/html through the SPA fallback), so
    // installability is only honestly testable there.
    {
      name: 'pwa-preview-chromium',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174' },
    },
    {
      name: 'pwa-preview-webkit',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:4174' },
    },
    {
      name: 'pwa-preview-mobile-chrome',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Pixel 5'], baseURL: 'http://localhost:4174' },
    },
    {
      name: 'pwa-preview-mobile-safari',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['iPhone 12'], baseURL: 'http://localhost:4174' },
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npx vite preview --port 4174 --strictPort',
      port: 4174,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
