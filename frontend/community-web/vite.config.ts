import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/community/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5175, proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } },
  build: { outDir: '../../backend/app/static/community', emptyOutDir: true },
})
