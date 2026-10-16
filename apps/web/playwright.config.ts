import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:4179', locale: 'it-IT' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @dama/server build && PORT=8788 MAX_ROOMS_PER_IP=1000 node ../server/dist/server.mjs',
      port: 8788,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'VITE_WS_URL=ws://localhost:8788 pnpm vite build && pnpm vite preview --port 4179 --strictPort',
      port: 4179,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
