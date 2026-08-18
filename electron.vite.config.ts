import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve(import.meta.dirname, 'src/shared')
const renderer = resolve(import.meta.dirname, 'src/renderer')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: resolve(import.meta.dirname, 'src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: resolve(import.meta.dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: renderer,
    resolve: { alias: { '@renderer': resolve(renderer, 'src'), '@shared': shared } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(renderer, 'index.html') } },
  },
})
