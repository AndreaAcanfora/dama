import { defineConfig } from 'vitest/config';

// Unit tests only; the Playwright suite in e2e/ runs separately.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
