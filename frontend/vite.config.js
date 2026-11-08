import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Octet Draw (vendor/octet-draw) runs inside this page. Its stylesheets were written for a window of its own, so
// every rule in them is scoped to the .octet-host element the Draw panel renders: :root, html and body become that
// element, and every other selector is put under it. index.css keeps SynPath's own rules out of it (@scope).
const OCTET = fileURLToPath(new URL('./vendor/octet-draw/', import.meta.url))
const HOST = '.octet-host'
const scopeSelector = (s) => (/^(:root|html|body)\b/.test(s) ? s.replace(/^(:root|html|body)/, HOST) : `${HOST} ${s}`)
const octetScope = {
  postcssPlugin: 'octet-scope',
  Once(root) {
    if (!root.source?.input.file?.startsWith(OCTET)) return
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
      rule.selectors = rule.selectors.map(scopeSelector)
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // so the build output can be opened from any path (for sharing as an artifact)
  css: { postcss: { plugins: [octetScope] } },
  // Octet's own build options (vendor/octet-draw/vite.config.ts): no tester feedback link, and Indigo left out of
  // pre-bundling, which breaks the relative URL it uses to find its .wasm file.
  define: { __FEEDBACK__: 'false' },
  // Octet's packages are pre-bundled up front, so the first Draw does not make the dev server reload the page.
  optimizeDeps: {
    exclude: ['indigo-ketcher'],
    include: ['@phosphor-icons/react', '@tauri-apps/api/core', '@tauri-apps/api/window', '@tauri-apps/api/webviewWindow'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
  server: {
    // Bind to 0.0.0.0 so other computers on the same Wi-Fi can open it too. This server makes the /api calls on their
    // behalf, so the backend can stay on 127.0.0.1 (no CORS needed either)
    host: true,
    // The frontend calls /api/* -> proxied to FastAPI (:8000)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
