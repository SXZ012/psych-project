import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/login/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@report-kit': fileURLToPath(new URL('../shared/report-kit', import.meta.url)) } },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static/assets': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: { outDir: '../../backend/app/static/terminal', emptyOutDir: true },
})
