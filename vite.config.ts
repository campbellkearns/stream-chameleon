import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: "autoUpdate",
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
                cleanupOutdatedCaches: true,
                skipWaiting: true,
                clientsClaim: true,
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/api\.twitch\.tv\/.*/i,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "twitch-api-cache",
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 5, // 5 minutes
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/static-cdn\.jtvnw\.net\/.*/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "twitch-assets-cache",
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24, // 24 hours
                            },
                        },
                    },
                ],
            },
            includeAssets: [
                "favicon.svg",
                "favicon-16x16.png",
                "favicon-32x32.png",
                "apple-touch-icon.svg",
                "apple-splash-2778-1284.svg",
                "apple-splash-1170-2532.svg",
                "apple-splash-750-1334.svg",
                "pwa-192x192.svg",
                "pwa-512x512.svg",
                "pwa-512x512-maskable.svg",
            ],
            manifest: {
                id: "stream-chameleon-pwa",
                name: "Stream Chameleon - Stream Profile Manager",
                short_name: "Stream Chameleon",
                description: "One-click Twitch stream setup with custom profiles. Manage your streaming categories, titles, and tags instantly. Perfect for content creators who stream varied content.",
                theme_color: "#0d0e12",
                background_color: "#0d0e12",
                display: "standalone",
                display_override: ["window-controls-overlay", "standalone"],
                orientation: "portrait-primary",
                scope: "/",
                start_url: "/?utm_source=pwa",
                launch_handler: {
                    client_mode: "navigate-existing"
                },
                categories: ["productivity", "entertainment", "utilities", "lifestyle"],
                keywords: ["twitch", "streaming", "broadcast", "profile", "manager", "content creator"],
                lang: "en-US",
                dir: "ltr",
                prefer_related_applications: false,
                icons: [
                    {
                        src: "pwa-192x192.svg",
                        sizes: "192x192",
                        type: "image/svg+xml",
                        purpose: "any"
                    },
                    {
                        src: "pwa-512x512.svg",
                        sizes: "512x512",
                        type: "image/svg+xml",
                        purpose: "any"
                    },
                    {
                        src: "pwa-512x512-maskable.svg",
                        sizes: "512x512",
                        type: "image/svg+xml",
                        purpose: "maskable"
                    }
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
});