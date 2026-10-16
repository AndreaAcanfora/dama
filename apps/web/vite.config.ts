import { existsSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/; set BASE_PATH there, keep / locally.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __HAS_MODEL__: JSON.stringify(existsSync(new URL('./public/models/dama.onnx', import.meta.url))) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Dama italiana',
        short_name: 'Dama',
        description: 'Dama italiana contro il computer o un amico, anche offline.',
        lang: 'it',
        theme_color: '#17352e',
        background_color: '#17352e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The Maestro model and runtime are large: cached on first use instead of precached.
        runtimeCaching: [
          {
            urlPattern: /\.(onnx|wasm)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'maestro', expiration: { maxEntries: 6 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
});
