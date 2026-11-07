import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Octet Draw (vendor/octet-draw) runs inside this page. Its stylesheets were written for a window of its own, so
// every rule in them is scoped to the .octet-host element the Draw panel renders: :root, html and body become that
// element, and every other selector is put under it. index.css keeps SynthPath's own rules out of it (@scope).
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
  base: './', // 빌드 결과를 아무 경로에서나 열 수 있게 (artifact 공유용)
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
    // 같은 Wi-Fi의 다른 컴퓨터에서도 열 수 있게 0.0.0.0에 바인드한다. /api는 이 서버가 대신
    // 호출하므로 백엔드는 127.0.0.1에 그대로 두면 된다 (CORS도 필요 없음)
    host: true,
    // 프론트는 /api/* 로 호출 → FastAPI(:8000)로 프록시
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
