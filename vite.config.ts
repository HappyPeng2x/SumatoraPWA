import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-64.png', 'logo-header.png', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'sqlite3.wasm', 'sqlite3-opfs-async-proxy.js'],
      manifest: {
        name: 'Sumatora Dictionary',
        short_name: 'Sumatora',
        description: 'Offline Japanese dictionary powered by JMDict',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        runtimeCaching: [
          {
            // Dictionary .db.gz files are stored in OPFS — don't cache in SW
            urlPattern: /\.db\.gz$/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: true },
    }),
    // Enables `wrangler dev`/`wrangler deploy` to build+serve this Vite
    // project as Cloudflare static assets (see wrangler.jsonc) — added when
    // deploying to Cloudflare Pages/Workers, see ui-parity-and-remote-search-plan.md.
    cloudflare(),
  ],

  optimizeDeps: {
    // Let Vite load @sqlite.org/sqlite-wasm as-is so import.meta.url
    // resolves correctly inside the package's WASM loader
    exclude: ['@sqlite.org/sqlite-wasm'],
  },

  server: {
    proxy: {
      // Dev proxy: /dictionaries/* → local Python file server on :8000.
      // Serve a directory containing the schema-v2 packs (sumatora_core.db.gz,
      // sumatora_gloss_eng.db.gz, ...) plus a dictionaries.xml manifest with
      // matching sha256 attributes — see ui-parity-and-remote-search-plan.md.
      // e.g.: cd <packs dir> && python3 -m http.server 8000
      '/dictionaries': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/dictionaries/, ''),
        changeOrigin: true,
      },
    },
  },

  worker: {
    format: 'es',
  },
})
