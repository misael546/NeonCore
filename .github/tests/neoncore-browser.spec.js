const { test, expect } = require('@playwright/test');
const fs = require('fs');

const RELEASE = JSON.parse(fs.readFileSync('release.json','utf8'));
const GAME_PATH = String(RELEASE.clientPath || '').replace(/^\/+/, '');
const CURRENT_VERSION = String(RELEASE.clientVersion || RELEASE.releaseId || '');

test('portal and Projects are stable', async ({ page }) => {
  await page.goto('https://misael546.github.io/NeonCore/?ci=' + Date.now(), {waitUntil:'domcontentloaded', timeout:45000});
  await expect(page.locator('#projects')).toBeVisible({timeout:15000});
  await page.locator('#projects').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/proyectos/');
  await expect(page.locator('.card h2')).toContainText('DarkPixel Online');
});

test('DarkPixel Online client: V1 marker and protected Google entry', async ({ page }) => {
  await page.goto('https://misael546.github.io/NeonCore/'+GAME_PATH+'?ci=' + Date.now(), {waitUntil:'domcontentloaded', timeout:45000});
  await expect.poll(async()=>page.evaluate(()=>window.NEON_CORE_VERSION),{timeout:15000,intervals:[500,1000]}).toBe(CURRENT_VERSION);
  await expect(page.locator('#googleGate')).toBeVisible({timeout:15000});
  await expect(page.locator('#googleButton')).toBeVisible({timeout:15000});
  await expect(page.locator('#googleButton iframe')).toHaveCount(1,{timeout:20000});
  await expect(page.locator('#googleStatus')).toContainText('Inicia sesión para entrar a DarkPixel Online.',{timeout:20000});
  await expect(page.locator('#game')).toBeVisible({timeout:15000});
  await expect(page.locator('body')).toContainText('DARKPIXEL ONLINE');
  await expect(page.locator('body')).not.toContainText('NEON CORE');
});

test('mobile: Projects navigation remains usable', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.goto('https://misael546.github.io/NeonCore/proyectos/?ci=' + Date.now(), {waitUntil:'domcontentloaded',timeout:45000});
  await expect(page.locator('.card h2')).toContainText('DarkPixel Online');
  await page.locator('#open').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/proyectos/darkpixel-online/');
  await context.close();
});
