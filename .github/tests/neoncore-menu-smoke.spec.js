const { test, expect } = require('@playwright/test');
const fs = require('fs');
const RELEASE = JSON.parse(fs.readFileSync('release.json','utf8'));
const GAME_PATH = String(RELEASE.clientPath||'').replace(/^\/+/, '');
const CURRENT_BUILD = String(RELEASE.clientBuild||RELEASE.releaseId||'');

test('menu principal: JUGAR abre el cliente completo de Sala 1 actual', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const errors = [];
  const sockets = [];

  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !/favicon/i.test(msg.text())) errors.push('CONSOLE: ' + msg.text());
  });
  page.on('websocket', ws => sockets.push(ws.url()));

  await page.goto('https://misael546.github.io/NeonCore/?menuSmoke=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await expect(page.locator('#name')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#play')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#play')).toContainText('JUGAR');
  await expect(page.locator('#menuSessionsBtn')).toHaveCount(0);

  await page.locator('#name').fill('SmokeSala1');
  await page.locator('#play').click();

  await expect.poll(async () => page.url(), {
    timeout: 15000,
    intervals: [250, 500]
  }).toContain('/NeonCore/'+GAME_PATH);

  await expect.poll(async () => page.evaluate(() => window.NEON_CORE_BUILD), {
    timeout: 15000,
    intervals: [500, 1000]
  }).toBe(CURRENT_BUILD);

  await expect(page.locator('#moveJoy')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#connectionOverlay')).toBeHidden({ timeout: 30000 });
  expect(await page.evaluate(() => window.NEON_CORE_BUILD)).toBe(CURRENT_BUILD);

  await expect.poll(async () => page.locator('#playersList').innerText(), {
    timeout: 15000,
    intervals: [500, 1000]
  }).toContain('👾');
  await expect(page.locator('#playersList')).not.toContainText('pts');

  expect(sockets.some(url => /neon-core-multiplayer\.onrender\.com\/ws/.test(url))).toBeTruthy();

  if (errors.length) throw new Error('Errores en menú/Sala 1 actual:\n' + errors.join('\n'));
  await context.close();
});
