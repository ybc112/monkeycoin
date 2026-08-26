import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        launchpad: path.resolve(import.meta.dirname, 'launchpad.html'),
        sniper: path.resolve(import.meta.dirname, 'sniper.html'),
      },
    },
  },
  server: {
    proxy: {
      '/snowball-api': {
        target: 'http://36.151.145.15',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
