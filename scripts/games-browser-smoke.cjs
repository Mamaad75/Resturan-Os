/* Uses a built Next server. Override CHROMIUM_EXECUTABLE_PATH for local runners. */
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
async function main() {
  const server = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '-H',
      '127.0.0.1',
      '-p',
      '3199',
    ],
    {
      cwd: path.resolve(__dirname, '../apps/web'),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Next server did not become ready')),
        30000,
      );
      server.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Next exited ${code}`));
      });
      server.stdout.on('data', (b) => {
        if (b.toString().includes('Ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.stderr.on('data', (b) => process.stderr.write(b));
    });
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3199/r/demo/games');
    await page.getByRole('heading', { name: 'امروز کدام بازی؟' }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'Mobile page overflows horizontally',
    );
    await page.getByRole('button', { name: /دوز دور میز/ }).click();
    for (const i of [1, 4, 2, 5, 3])
      await page
        .getByRole('button', { name: `خانه ${i}`, exact: true })
        .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'بازیکن اول برنده شد!' })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /جفت خوشمزه/ }).click();
    await page.getByRole('button', { name: 'کارت ۱', exact: true }).click();
    await page.getByRole('button', { name: 'کارت ۲', exact: true }).click();
    await page.getByRole('button', { name: 'بستن بازی' }).click();
    await page.getByRole('button', { name: /ذهن آماده/ }).click();
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('پاسخ تو').fill('100');
      await page.getByRole('button', { name: 'ثبت پاسخ' }).click();
    }
    await page.getByRole('status').filter({ hasText: 'دستت گرم شد' }).waitFor();
    await page.keyboard.press('Escape');
    if (process.env.GAMES_SCREENSHOT_PATH)
      await page.screenshot({
        path: process.env.GAMES_SCREENSHOT_PATH,
        fullPage: true,
      });
    await page.setViewportSize({ width: 1280, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'Desktop overflow',
    );
    const keys = [];
    await page.route('**/public/orders/track/*/games', async (route) => {
      const key = route.request().headers()['x-game-key'];
      assert.match(
        key ?? '',
        /^[a-f0-9]{64}$/,
        'Reward profile requires the browser player credential',
      );
      keys.push(key);
      await route.fulfill({
        json: {
          success: true,
          data: {
            restaurantName: 'رستوران آزمایشی',
            slug: 'demo',
            enabled: true,
            eligible: true,
            reason: null,
            xp: 120,
            level: 2,
            points: 20,
            remainingToday: 2,
            sessions: [],
            coupons: [],
            rules: {
              isEnabled: true,
              dailyLimit: 2,
              pointsPerWin: 10,
              couponCost: 50,
              couponMaxDiscount: 20000,
              couponMinOrder: 100000,
            },
          },
        },
      });
    });
    await page.goto(
      `http://localhost:3199/order/track/${'a'.repeat(48)}/games`,
    );
    await page.getByText('رستوران آزمایشی', { exact: false }).waitFor();
    await page.reload();
    await page.getByText('رستوران آزمایشی', { exact: false }).waitFor();
    assert(keys.length >= 2);
    assert(
      keys.every((key) => key === keys[0]),
      'Player credential must survive a reload',
    );
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log(
      'PASS: three practice games, modal keyboard handling, mobile/desktop layout, no runtime errors',
    );
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
