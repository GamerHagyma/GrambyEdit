import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: '/GrambyEdit/',
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globalSetup: ['tests/global-setup.ts'],
  },
});
