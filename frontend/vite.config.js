import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 빌드 결과를 아무 경로에서나 열 수 있게 (artifact 공유용)
  server: {
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
