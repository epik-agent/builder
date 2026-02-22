import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Vendored brand package – remove this alias once @epik-agent/brand
      // is installable from GitHub Packages (requires GH_TOKEN).
      '@epik-agent/brand/brand.css': resolve(__dirname, 'src/brand/brand.css'),
      '@epik-agent/brand': resolve(__dirname, 'src/brand/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/main.tsx'],
    },
  },
})
