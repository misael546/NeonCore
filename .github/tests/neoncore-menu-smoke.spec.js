const { test, expect } = require('@playwright/test');
const fs = require('fs');

const RELEASE = JSON.parse(fs.readFileSync('release.json','utf8'));
const GAME_PATH = String(RELEASE.clientPath || '').replace(/^\/+/, '');

test('portal principal: Projects abre el índice de proyectos', async ({ page }) => {
  await page.goto('https://misael546.github.io/NeonCore/?ci=' + Date.now(), {waitUntil:'domcontentloaded', timeout:45000});
  await expect(page.locator('#projects')).toBeVisible({timeout:15000});
  await expect(page.locator('body')).toContainText('SOFTWARE DEVELOPMENT');
  await page.locator('#projects').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/proyectos/');
  await expect(page.locator('.card h2')).toContainText('DarkPixel Online');
});

test('Projects: DarkPixel Online abre el cliente sin sala ni versión en la URL', async ({ page }) => {
  await page.goto('https://misael546.github.io/NeonCore/proyectos/?ci=' + Date.now(), {waitUntil:'domcontentloaded', timeout:45000});
  await expect(page.locator('.card h2')).toContainText('DarkPixel Online');
  await page.locator('#open').click();
  await expect.poll(async()=>page.url(),{timeout:15000,intervals:[250,500]}).toContain('/NeonCore/proyectos/darkpixel-online/');
  expect(page.url()).not.toContain('/12345/');
  expect(page.url()).not.toMatch(/\/V[0-9]+\//);
  await expect(page.locator('#googleGate')).toBeVisible({timeout:15000});
});

test('DarkPixel Online: entrada V2 y Google Identity están presentes', async ({ page }) => {
  await page.goto('https://misael546.github.io/NeonCore/'+GAME_PATH+'?ci=' + Date.now(), {waitUntil:'domcontentloaded', timeout:45000});
  await expect.poll(async()=>page.evaluate(()=>window.NEON_CORE_VERSION),{timeout:15000,intervals:[500,1000]}).toBe(String(RELEASE.version));
  await expect(page.locator('#googleGate')).toBeVisible({timeout:15000});
  await expect(page.locator('#googleButton')).toBeVisible({timeout:15000});
  await expect(page.locator('#googleButton iframe')).toHaveCount(1,{timeout:20000});
  await expect(page.locator('#googleStatus')).toContainText('Inicia sesión para entrar a DarkPixel Online.',{timeout:20000});
  await expect(page.locator('body')).not.toContainText('NEON CORE');
  await expect(page.locator('body')).toContainText('DARKPIXEL ONLINE');
});
