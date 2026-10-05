const { test, expect } = require('@playwright/test');

const GAME_URL='https://misael546.github.io/NeonCore/neoncore/12345/v1/?ci=';
const SESSIONS_URL='https://misael546.github.io/NeonCore/sessions/?ci=';
const ROOT_URL='https://misael546.github.io/NeonCore/?ci=';

async function waitForLiveGame(page, errors) {
  await expect(page.locator('#game')).toBeVisible({timeout:30000});
  await expect(page.locator('#connectionOverlay')).toBeHidden({timeout:45000});
  await expect.poll(async()=>page.evaluate(()=>window.NEON_CORE_BUILD),{timeout:15000,intervals:[500,1000]}).toBe('BUILD-31');
  await expect(page.locator('#moveJoy')).toBeVisible({timeout:30000});
  await expect(page.locator('#aimJoy')).toBeVisible({timeout:10000});
  if(errors.length)throw new Error('Errores de navegador: '+errors.join(' | '));
}

test('sala #1: conexión, controles y disparo',async({page})=>{
  const errors=[],sockets=[];
  page.on('websocket',ws=>sockets.push(ws.url()));
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/i.test(m.text()))errors.push('CONSOLE: '+m.text());});
  await page.goto(GAME_URL+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await waitForLiveGame(page,errors);
  expect(sockets.some(u=>/neon-core-multiplayer\.onrender\.com\/ws/.test(u))).toBeTruthy();

  const box=await page.locator('#moveJoy').boundingBox();
  if(box){
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    await page.mouse.move(cx,cy);await page.mouse.down();
    await page.mouse.move(cx+Math.min(55,box.width*.45),cy,{steps:10});
    await page.waitForTimeout(700);await page.mouse.up();
  }else{
    await page.keyboard.down('d');await page.waitForTimeout(700);await page.keyboard.up('d');
  }

  const before=Number((await page.locator('#ammo').innerText()).trim());
  await page.keyboard.down('Space');await page.waitForTimeout(800);await page.keyboard.up('Space');
  await expect.poll(async()=>Number((await page.locator('#ammo').innerText()).trim()),{timeout:5000,intervals:[250,500]}).toBeLessThan(before);
  if(errors.length)throw new Error('Errores detectados: '+errors.join(' | '));
});

test('sala #1: salir y volver a entrar reconecta',async({page})=>{
  const errors=[],sockets=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/i.test(m.text()))errors.push('CONSOLE: '+m.text());});
  page.on('websocket',ws=>sockets.push(ws.url()));
  await page.goto(GAME_URL+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await waitForLiveGame(page,errors);
  const first=sockets.length;expect(first).toBeGreaterThan(0);

  await page.goto(SESSIONS_URL+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await expect(page.locator('.room[data-room="12345"]')).toBeVisible({timeout:15000});
  await page.locator('.room[data-room="12345"]').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/neoncore/12345/v1/');
  await waitForLiveGame(page,errors);
  expect(sockets.length).toBeGreaterThan(first);
  if(errors.length)throw new Error('Errores durante reingreso: '+errors.join(' | '));
});

test('menu público táctil: abrir sala desde el selector',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.goto(SESSIONS_URL+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await expect(page.locator('.room[data-room="12345"]')).toBeVisible({timeout:15000});
  await expect(page.locator('#quickPlay')).toHaveCount(0);
  await page.locator('#username').fill('PruebaMenu');
  await expect.poll(async()=>page.locator('.room[data-room="12345"] .roomCount').innerText(),{timeout:20000,intervals:[500,1000]}).toMatch(/^\d+\/16 JUGADORES$/);
  await page.locator('.room[data-room="12345"]').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/?room=12345');
  await context.close();
});

test('menu principal: JUGAR abre la Sala 1 actual',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/i.test(m.text()))errors.push('CONSOLE: '+m.text());});
  await page.goto(ROOT_URL+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await expect(page.locator('#name')).toBeVisible({timeout:15000});
  await page.locator('#name').fill('PruebaNeon');
  await page.locator('#play').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/neoncore/12345/v1/');
  await waitForLiveGame(page,errors);
  await context.close();
});

test('SHOP: interfaz principal disponible',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/i.test(m.text()))errors.push('CONSOLE: '+m.text());});
  await page.goto(GAME_URL+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await waitForLiveGame(page,errors);
  const health=await page.request.get('https://neon-core-multiplayer.onrender.com/health?ci='+Date.now());
  expect(health.ok()).toBeTruthy();
  const h=await health.json();
  expect(h.version).toBe('BUILD-31');
  expect(h.diagnostics.bossTarget).toBe(1);
  expect(h.diagnostics.eliteTarget).toBe(10);
  await expect(page.locator('.shopTab[data-shop-section="arsenal"]')).toBeVisible({timeout:15000});
  await expect(page.locator('.shopTab[data-shop-section="skins"]')).toBeVisible({timeout:15000});
  await expect(page.locator('.shopTab[data-shop-section="redeem"]')).toBeVisible({timeout:15000});
  if(errors.length)throw new Error('Errores SHOP: '+errors.join(' | '));
});

test('mobile emulation: interfaz táctil y controles visibles',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/i.test(m.text()))errors.push('CONSOLE: '+m.text());});
  await page.goto(ROOT_URL+'room=12345&mobileci='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/neoncore/12345/v1/');
  await waitForLiveGame(page,errors);
  const body=await page.locator('body').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight}));
  expect(body.scrollWidth).toBeLessThanOrEqual(body.width+2);
  expect(body.scrollHeight).toBeLessThanOrEqual(body.height+2);
  await context.close();
  if(errors.length)throw new Error('Errores mobile: '+errors.join(' | '));
});
