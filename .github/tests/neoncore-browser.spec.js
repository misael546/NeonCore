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
  await page.waitForTimeout(5000);
  const googleDiag=await page.evaluate(()=>({
    status:document.getElementById('googleStatus')?.textContent||'',
    buttonHtml:document.getElementById('googleButton')?.innerHTML||'',
    googlePresent:!!window.google,
    googleAccounts:!!window.google?.accounts,
    googleId:!!window.google?.accounts?.id,
    clientId:window.googleClientId||'',
    gate:document.getElementById('googleGate')?.style.display||''
  }));
  const networkDiag=await page.evaluate(async()=>{
    const resources=performance.getEntriesByType('resource').map(x=>x.name).filter(x=>/google|onbelmo/i.test(x));
    const belmo={};
    try{
      const res=await fetch('https://neoncore-da6f.onbelmo.uk/auth/google/config',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      belmo.exactNoQuery={ok:true,status:res.status,text:(await res.text()).slice(0,500)};
    }catch(error){belmo.exactNoQuery={ok:false,error:String(error?.message||error)};}
    try{
      const res=await fetch('https://neoncore-da6f.onbelmo.uk/auth/google/config?diag='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      belmo.withQuery={ok:true,status:res.status,text:(await res.text()).slice(0,500)};
    }catch(error){belmo.withQuery={ok:false,error:String(error?.message||error)};}
    return {
      resources,
      belmo,
      scripts:[...document.scripts].map(s=>s.src||'inline').filter(x=>/google|gsi|onbelmo/i.test(x))
    };
  });
  const sourceDiag=await page.evaluate(()=>({
    href:location.href,
    title:document.title,
    hasInitGoogle:document.documentElement.innerHTML.includes('function initGoogleLogin'),
    hasGoogleConfig:document.documentElement.innerHTML.includes('/auth/google/config'),
    hasBelmo:document.documentElement.innerHTML.includes('neoncore-da6f.onbelmo.uk'),
    hasGoogleScript:document.documentElement.innerHTML.includes('accounts.google.com/gsi/client'),
    hasCurrentSocket:document.documentElement.innerHTML.includes('wss://neoncore-da6f.onbelmo.uk/ws'),
    versionMatch:(document.documentElement.innerHTML.match(/var v="([^"]+)"/)||[])[1]||'',
    gateText:document.getElementById('googleGate')?.textContent||''
  }));
  console.log('[GOOGLE-DIAGNOSTIC]',JSON.stringify({google:googleDiag,network:networkDiag,source:sourceDiag}));
  await expect(page.locator('#googleButton iframe')).toHaveCount(1,{timeout:15000});
  await expect(page.locator('#googleStatus')).toContainText('Inicia sesión para entrar a DarkPixel Online.',{timeout:15000});
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
