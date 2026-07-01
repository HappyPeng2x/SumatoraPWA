import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'sqlite3.wasm', 'sqlite3-opfs-async-proxy.js'],
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
  ],

  optimizeDeps: {
    // Let Vite load @sqlite.org/sqlite-wasm as-is so import.meta.url
    // resolves correctly inside the package's WASM loader
    exclude: ['@sqlite.org/sqlite-wasm'],
  },

  server: {
    proxy: {
      // Dev proxy: /dictionaries/* → local Python file server on :8000
      // Run: cd ~/StudioProjects/SumatoraDictionary/app/src/main/assets/dictionaries && python3 -m http.server 8000
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
