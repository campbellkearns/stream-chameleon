import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Separate from vite.config.ts: unit tests don't need the PWA/Tailwind
// plugins, and jsdom is only required here, not for the app build.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
        // Scope to src/ unit tests only — top-level tests/ holds the Playwright E2E suite.
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
