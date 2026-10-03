const { test, expect } = require('@playwright/test');

test('menu principal: JUGAR abre el cliente completo de Sala 1 v172', async ({ browser }) => {
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

  await expect(page.locator('#stableMainMenu')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#stableMainMenuName')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#stableMainMenuPlay')).toContainText('JUGAR');
  await expect(page.locator('#menuSessionsBtn')).toHaveCount(0);

  await page.locator('#stableMainMenuName').fill('SmokeSala1');
  await page.locator('#stableMainMenuPlay').click();

  await expect.poll(async () => page.url(), {
    timeout: 15000,
    intervals: [250, 500]
  }).toContain('/NeonCore/neoncore/12345/v172/');

  await expect.poll(async () => page.evaluate(() => window.NEON_CORE_BUILD), {
    timeout: 15000,
    intervals: [500, 1000]
  }).toBe('20261003-017-player-kills-table');

  await expect(page.locator('#moveJoy')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#fire')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#connectionOverlay')).toBeHidden({ timeout: 30000 });

  // La tabla de jugadores ya no muestra PTS: muestra kills de mobs y de jugadores.
  await expect.poll(async () => page.locator('#playersList').innerText(), {
    timeout: 15000,
    intervals: [500, 1000]
  }).toContain('👾');
  await expect(page.locator('#playersList')).not.toContainText('pts');

  expect(sockets.some(url => /neon-core-multiplayer\.onrender\.com\/ws/.test(url))).toBeTruthy();

  if (errors.length) throw new Error('Errores en menú/Sala 1 v172:\n' + errors.join('\n'));
  await context.close();
});
