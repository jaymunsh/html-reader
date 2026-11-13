import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run build:v2 && node tests/server/static-server.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/\.mobile\./, /update\.spec/] },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: [/\.mobile\./, /update\.spec/] },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testIgnore: [/\.desktop\./, /update\.spec/] },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] }, testIgnore: [/\.desktop\./, /update\.spec/] },
    {
      name: 'update',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174' },
      testMatch: /update\.spec/,
      workers: 1,
    },
  ],
});
