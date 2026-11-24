import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('Set TEST_DATABASE_URL to a migrated disposable database.');
const origin = 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: 'test/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: origin, trace: 'retain-on-failure', colorScheme: 'light' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node dist-server/server/main.js',
    env: { DATABASE_URL: testDb, APP_ORIGIN: origin, PORT: '4173', NODE_ENV: 'test' },
    url: origin + '/api/health/ready',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
