const { test, expect } = require('@playwright/test');

test('menu principal: JUGAR entra directamente a Sala 1', async ({ browser }) => {
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

  await page.waitForTimeout(1500);
  console.log('MENU_DIAG', await page.evaluate(() => {
    const b = document.getElementById('nameBox');
    return {
      href: location.href,
      search: location.search,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      style: b ? b.getAttribute('style') : null,
      display: b ? getComputedStyle(b).display : null,
      visibility: b ? getComputedStyle(b).visibility : null,
      opacity: b ? getComputedStyle(b).opacity : null,
      rect: b ? (() => { const r=b.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })() : null,
      parent: b?.parentElement ? getComputedStyle(b.parentElement).display : null
    };
  }));
  await expect.poll(async () => page.locator('#nameBox').evaluate(el => ({display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})), {timeout:15000}).toMatchObject({display:'flex',visibility:'visible'});
  await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#publicRoomsBtn')).toContainText('JUGAR');
  await expect(page.locator('#menuSessionsBtn')).toHaveCount(0);
  await expect(page.locator('#chatToggle')).toBeHidden();

  await page.locator('#username').fill('SmokeSala1');
  await page.locator('#publicRoomsBtn').click();

  await expect(page.locator('#nameBox')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#neonDiag')).toContainText('DIAG', { timeout: 30000 });
  await expect.poll(async () => page.locator('#neonDiag').innerText(), {
    timeout: 45000,
    intervals: [500, 1000, 2000]
  }).toMatch(/game:true.*room:12345/);

  expect(sockets.some(url => /neon-core-multiplayer\.onrender\.com\/ws/.test(url))).toBeTruthy();
  await expect(page.locator('#connectionOverlay')).toBeHidden({ timeout: 10000 });

  if (errors.length) throw new Error('Errores en menú/Sala 1:\n' + errors.join('\n'));
  await context.close();
});
