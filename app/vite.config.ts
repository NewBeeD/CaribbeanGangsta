import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok free-tier URLs change on every restart, so allow the whole domain.
    allowedHosts: ['.ngrok-free.app'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // jsdom is available for later component tests via
    // per-file `// @vitest-environment jsdom` or a matching config block.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
