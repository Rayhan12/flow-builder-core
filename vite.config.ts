/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'shared/**/*.{test,spec}.ts',
      'server/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.{ts,tsx}',
    ],
    // Emulator-backed tests share one Auth/Firestore instance. Serialise files and
    // give hooks headroom so parallel clearFirestore / rules init do not time out.
    testTimeout: process.env.FIRESTORE_EMULATOR_HOST ? 15_000 : 5_000,
    hookTimeout: process.env.FIRESTORE_EMULATOR_HOST ? 20_000 : 10_000,
    fileParallelism: !process.env.FIRESTORE_EMULATOR_HOST,
  },
})
