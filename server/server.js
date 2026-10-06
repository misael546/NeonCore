/* V82 · melee, cuadrícula, cansancio, skins y combate por objetivo */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const storage = require('./storage');
const cosmetics = require('./cosmetics');
const crypto = require('crypto');
const { GOOGLE_CLIENT_ID, verifyGoogleCredential } = require('./google-auth');
const memoryAccountsByGoogle = new Map();

const PORT = Number(process.env.PORT || 10000);

const WORLD = { w: 6000, h: 4400 };
const MAX_PLAYERS = 16;
const SAFE_ZONE = { x: 3012, y: 2220, r: 300 };

let UNIFIED_RELEASE_MANIFEST = {
  game: 'Neon Core',
  releaseId: 'unknown',
  version: 'unknown',
  clientVersion: 'unknown',
  serverVersion: 'unknown',
  databaseSchema: 1
};

try {
  const manifestCandidates = [
    path.join(__dirname, 'release.json'),
    path.join(__dirname, '..', 'release.json')
  ];
  const manifestPath = manifestCandidates.find(candidate => fs.existsSync(candidate)) || manifestCandidates[0];
  UNIFIED_RELEASE_MANIFEST = {
    ...UNIFIED_RELEASE_MANIFEST,
    ...JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  };
} catch (error) {
  console.warn('[RELEASE] No se pudo cargar release.json:', error?.message || error);
}

const RELEASE_ID = String(UNIFIED_RELEASE_MANIFEST.version || UNIFIED_RELEASE_MANIFEST.releaseId || 'unknown');
const DATABASE_SCHEMA_VERSION = Math.max(3, Number(UNIFIED_RELEASE_MANIFEST.databaseSchema) || 3);
const SERVER_VERSION = RELEASE_ID;
const SERVER_UPDATE_MESSAGE = 'NUEVA ACTUALIZACIÓN DISPONIBLE. Neon Core volverá al menú para cargar la nueva versión.';

const BASE_INVENTORY_SLOTS = 16;
const BACKPACK_EXTRA_SLOTS = 16;
const INVENTORY_SLOTS = BASE_INVENTORY_SLOTS;
const MAX_INVENTORY_SLOTS = BASE_INVENTORY_SLOTS + BACKPACK_EXTRA_SLOTS;
const INVENTORY_STACK_MAX = 500;
const PICKUP_RADIUS = 85;
const DROP_LIFETIME_MS = 10 * 60 * 1000;

const MELEE_MAX_LEVEL = 1000;
const MELEE_XP_PER_HIT = 10;
const MELEE_GRID_SIZE = 24;
const MELEE_GRID_HALF = MELEE_GRID_SIZE / 2;
const MELEE_COOLDOWN_MS = 650;
function gridCell(x){return Math.floor((Number(x)||0)/MELEE_GRID_SIZE);}
function gridCenter(cell){return Number(cell)*MELEE_GRID_SIZE+MELEE_GRID_HALF;}
const MAX_FATIGUE = 100;
const SPECIAL_ATTACK_FATIGUE = 20;
const SPECIAL_COOLDOWN_MS = 3000;
const FATIGUE_REGEN_PER_SEC = 7;

const MERCHANT_NPC = { x: 3252, y: 2220, r: 24 };
const MERCHANT_INTERACTION_RADIUS = 180;
const BANK_ENABLED = false;

const WEAPONS = {
  sword_neo:{name:'ESPADA BÁSICA',cost:100,power:10,fireRate:650,maxAmmo:0,range:48,arc:1.05,type:'melee',forSale:true,skin:'https://opengameart.org/sites/default/files/sword4_1.png'},
  sword_pulse:{name:'ESPADA PULSO',cost:1200,power:280,fireRate:720,maxAmmo:0,range:48,arc:1.10,type:'melee',forSale:false,skin:'https://opengameart.org/sites/default/files/sword-3_0.png'},
  sword_void:{name:'ESPADA VACÍO',cost:4500,power:520,fireRate:760,maxAmmo:0,range:48,arc:1.15,type:'melee',forSale:false,skin:'https://opengameart.org/sites/default/files/sword2_8.png'},
  sword_solar:{name:'ESPADA SOLAR',cost:15000,power:850,fireRate:820,maxAmmo:0,range:48,arc:1.20,type:'melee',forSale:false,skin:'https://opengameart.org/sites/default/files/sword_39.png'},
  sword_omega:{name:'ESPADA OMEGA',cost:50000,power:1400,fireRate:900,maxAmmo:0,range:48,arc:1.25,type:'melee',forSale:false,skin:'https://opengameart.org/sites/default/files/katana_2.png'}
};
const SHOP_FIREARM_IDS = Object.freeze([]);
const SHOP_SWORD_IDS = Object.freeze(['sword_neo']);
const SHOP_SKIN_IDS = Object.freeze(['pixel_cyan','rust_core','toxic_orb','plasma_violet','aurora','nebula_prism','eclipse_gold','celestial','angel_seraph','demon_infernal','eternal_void','gm_core']);
const BACKPACK_ITEM_ID = 'backpack_basic';
const BACKPACK_ITEM = Object.freeze({
  id: BACKPACK_ITEM_ID, name:'MOCHILA BÁSICA', rarity:'Común', category:'backpack',
  equipSlot:'backpack', priceGold:250, priceDiamonds:0, slotsBonus:16, stackable:false
});
const SHOP_STOCK = new Map([[BACKPACK_ITEM_ID,10]]);

function getItemDefinition(itemId){
  const id=String(itemId||'');
  if(id===BACKPACK_ITEM_ID)return BACKPACK_ITEM;
  const weapon=WEAPONS[id];
  if(weapon&&weapon.forSale!==false){
    return {
      id,name:weapon.name,rarity:weapon.type==='melee'?'Arma blanca':'Arma',
      category:'weapon',equipSlot:'weapon',weaponType:weapon.type,
      priceGold:Number(weapon.cost)||0,priceDiamonds:0,stackable:false,
      power:Number(weapon.power)||0,fireRate:Number(weapon.fireRate)||650,
      range:Number(weapon.range)||1000,arc:Number(weapon.arc)||0
    };
  }
  if(SHOP_SKIN_IDS.includes(id)){
    const armor=cosmetics.getSkin(id);
    if(!armor)return null;
    return {
      id,name:armor.name,rarity:armor.rarity,category:'skin',equipSlot:'skin',
      priceGold:Number(armor.priceGold)||0,priceDiamonds:Number(armor.priceDiamonds)||0,
      stackable:false,skinRating:Number(armor.skinRating)||0
    };
  }
  return null;
}
function publicItemCatalog(){
  return [
    getItemDefinition(BACKPACK_ITEM_ID),
    ...SHOP_SWORD_IDS.map(getItemDefinition)
  ].filter(Boolean).map(item=>({...item}));
}

const HP_REGEN_PER_SEC = 3;
const SAFE_ZONE_HP_REGEN_PER_SEC = 30;
const NAME_MAX_LENGTH = 20;
const WORLD_WALL_COUNT = 24;
const WORLD_WALL_SEED = 739281;
const WALL_RESPAWN_MS = 5 * 60 * 1000;
const MOB_TARGET_COUNT = 24;
const ELITE_TARGET_COUNT = 10;
const MOB_RESPAWN_MS = 8 * 1000;
const MOB_RESPAWN_JITTER_MS = 4 * 1000;
const BOSS_RESPAWN_MS = 120 * 1000;
const BOSS_GOLD_REWARD = 15000;
const BOSS_XP_REWARD = 5000;
const BOSS_HP = 60000;
const BOSS_NAME = 'DESTRUCTOR ESTELAR';
const BOSS_AGGRO_RANGE = 1250;
const BOSS_ATTACK_RANGE = 980;
const BOSS_PROJECTILE_DAMAGE = 260;
const BOSS_PROJECTILE_SPEED = 440;
const BOSS_PROJECTILE_COOLDOWN_MS = 3000;
const BOSS_AOE_DAMAGE = 240;
const BOSS_AOE_RADIUS = 42;
const BOSS_AOE_WARNING_MS = 1600;
const BOSS_AOE_COOLDOWN_MS = 6200;
const BOSS_AOE_RANGE = 780;
const AUTOSAVE_MS = 10000;
const DEATH_HP_LOSS = 0.10;
const DEATH_DAMAGE_LOSS = 0.05;
const DEATH_DEFENSE_LOSS = 0.05;
const DEATH_GOLD_LOSS = 0;
const DEATH_XP_LOSS = 0.10;
const TICK_MS = 100;
const ENEMY_SYNC_MS = 160;
const ENEMY_ATTACK_COOLDOWN_MS = 700;
const PLAYER_BROADCAST_MS = 100;
const HP_REGEN_BROADCAST_MS = 250;

const SERVER_STARTED_AT = Date.now();

const clients = new Map();
const savedPlayers = new Map();
const memoryAccountsByToken=new Map();
const memoryRecoveryByCode=new Map();
const memoryAccountNames=new Map();
const RESERVED_ACCOUNT_NAMES=new Set(['admin','administrator','owner','system','staff','support','moderator','mod','gm','gamemaster','game-master','god','neoncore','developer','dev']);
function normalizeAccountName(name){return String(name||'').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,NAME_MAX_LENGTH);}
function accountNameKey(name){return normalizeAccountName(name).toLocaleLowerCase('en-US');}
function isReservedAccountName(name){const key=accountNameKey(name).replace(/[ _-]+/g,'');return RESERVED_ACCOUNT_NAMES.has(key)||key.startsWith('admin')||key.startsWith('owner');}
function sanitizeAccountToken(token){return String(token||'').trim().slice(0,128);}
function newMemoryAccount(name){const cleanName=normalizeAccountName(name),accountId='acc_'+crypto.randomUUID().replace(/-/g,''),accountToken=crypto.randomBytes(32).toString('base64url'),raw=crypto.randomBytes(12).toString('hex').toUpperCase(),recoveryCode='NEON-'+raw.slice(0,8)+'-'+raw.slice(8,16)+'-'+raw.slice(16,24),a={accountId,accountToken,name:cleanName,playerSaveKey:accountId,recoveryCode,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};memoryAccountsByToken.set(accountToken,a);memoryAccountNames.set(accountNameKey(cleanName),a);memoryRecoveryByCode.set(recoveryCode.replace(/[^A-Z0-9]/g,''),a);return {ok:true,created:true,...a};}
async function authenticateGoogleAccount(idToken){
  const google=await verifyGoogleCredential(idToken);
  if(!google.ok)return google;
  const existing=await storage.findAccountByGoogleSub(google.sub);
  if(existing)return {ok:true,created:false,...existing,googleSub:google.sub,email:google.email};
  const mem=memoryAccountsByGoogle.get(google.sub);
  if(mem)return {ok:true,created:false,...mem,googleSub:google.sub,email:google.email};
  const tempName='Cuenta-'+google.sub.slice(-10).replace(/[^A-Za-z0-9]/g,'');
  if(storage.enabled){
    const created=await storage.createAccountWithGoogle(tempName,google.sub);
    if(created?.ok)return {...created,googleSub:google.sub,email:google.email};
    if(created?.reason==='duplicate'){const again=await storage.findAccountByGoogleSub(google.sub);if(again)return {ok:true,created:false,...again,googleSub:google.sub,email:google.email};}
    return created;
  }
  const accountToken=crypto.randomBytes(32).toString('base64url');
  const accountId='acc_'+crypto.randomUUID().replace(/-/g,'');
  const a={ok:true,created:true,accountId,accountToken,name:tempName,playerSaveKey:accountId,googleSub:google.sub,email:google.email,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  memoryAccountsByToken.set(accountToken,a);memoryAccountNames.set(accountNameKey(tempName),a);memoryAccountsByGoogle.set(google.sub,a);
  return a;
}
async function changePlayerName(ws,newName){
  const p=clients.get(ws);if(!p||!p.joined)return;
  const clean=normalizeAccountName(newName);if(clean.length<2)return send(ws,{type:'rename_result',ok:false,message:'El nombre debe tener al menos 2 caracteres.'});
  if(isReservedAccountName(clean))return send(ws,{type:'rename_result',ok:false,message:'Ese nombre está reservado.'});
  if(accountNameKey(clean)===accountNameKey(p.name))return send(ws,{type:'rename_result',ok:false,message:'Ese ya es tu nombre actual.'});
  for(const other of clients.values()){if(other!==p&&other?.name&&accountNameKey(other.name)===accountNameKey(clean))return send(ws,{type:'rename_result',ok:false,message:'Ese nombre ya está ocupado.'});}
  const owner=await storage.findAccountByName(clean);if(owner&&owner.accountId!==p.accountId)return send(ws,{type:'rename_result',ok:false,message:'Ese nombre ya está ocupado.'});
  const cost=1000;if((Number(p.diamonds)||0)<cost)return send(ws,{type:'rename_result',ok:false,message:'Necesitas 1,000 💎 para cambiar tu nombre.',diamonds:Number(p.diamonds)||0,cost});
  if(storage.enabled){const result=await storage.renameAccount(p.accountId,clean);if(!result.ok)return send(ws,{type:'rename_result',ok:false,message:result.reason==='name_taken'?'Ese nombre ya está ocupado.':'No se pudo guardar el nuevo nombre.'});}
  else {const old=memoryAccountsByToken.get(p.accountToken);if(old){memoryAccountNames.delete(accountNameKey(old.name));old.name=clean;old.updatedAt=new Date().toISOString();memoryAccountNames.set(accountNameKey(clean),old);}}
  p.diamonds=Math.max(0,(Number(p.diamonds)||0)-cost);p.name=clean;p.nameLocked=true;await persistPlayer(p);send(ws,{type:'rename_result',ok:true,name:p.name,diamonds:p.diamonds,cost});sendStats(p);if(p.room)sendPlayerList(p.room);
}
async function finalizeNewAccountName(p,requestedName){
  const clean=normalizeAccountName(requestedName);if(clean.length<2)return {ok:false,reason:'invalid_name'};
  if(isReservedAccountName(clean))return {ok:false,reason:'name_reserved'};
  const key=accountNameKey(clean);
  for(const other of clients.values()){if(other!==p&&other?.name&&accountNameKey(other.name)===key)return {ok:false,reason:'name_taken'};}
  const existing=await storage.findAccountByName(clean);if(existing&&existing.accountId!==p.accountId)return {ok:false,reason:'name_taken'};
  if(!storage.enabled){const old=memoryAccountsByToken.get(p.accountToken);if(memoryAccountNames.has(key)&&memoryAccountNames.get(key)!==old)return {ok:false,reason:'name_taken'};if(old){memoryAccountNames.delete(accountNameKey(old.name));old.name=clean;old.updatedAt=new Date().toISOString();memoryAccountNames.set(key,old);}}
  else {const renamed=await storage.renameAccount(p.accountId,clean);if(!renamed.ok)return renamed;}
  p.name=clean;p.nameLocked=true;return {ok:true};
}
async function authenticateOrCreateAccount(requestedName,accountToken,legacySaveKey){
  const token=sanitizeAccountToken(accountToken);
  if(token){
    const db=await storage.findAccountByToken(token);
    if(db){const recovery=await storage.ensureAccountRecovery(db.accountId);return {ok:true,created:false,...db,recoveryCode:recovery?.recoveryCode||''};}
    const mem=memoryAccountsByToken.get(token);
    if(mem)return {ok:true,created:false,...mem};
    return {ok:false,reason:'account_invalid'};
  }
  let legacy=null;
  if(legacySaveKey){try{legacy=await loadSavedPlayer(legacySaveKey,'');}catch{}}
  const desiredName=normalizeAccountName(legacy?.data?.name||requestedName)||'Jugador';
  if(!legacy?.data&&isReservedAccountName(desiredName))return {ok:false,reason:'name_reserved'};
  const key=accountNameKey(desiredName);
  for(const otherP of clients.values()){if(otherP?.accountId&&otherP.name&&accountNameKey(otherP.name)===key)return {ok:false,reason:'name_taken'};}
  const existing=await storage.findAccountByName(desiredName);
  if(existing)return {ok:false,reason:'name_taken'};
  if(!storage.enabled){if(memoryAccountNames.has(key))return {ok:false,reason:'name_taken'};return newMemoryAccount(desiredName);}
  const created=await storage.createAccount(desiredName);
  if(!created?.ok)return created;
  const recovery=await storage.ensureAccountRecovery(created.accountId);
  return {...created,recoveryCode:recovery?.recoveryCode||''};
}


const rooms = new Map();
const roomEnemies = new Map();
const roomEnemyRespawns = new Map();
const roomBossProjectiles = new Map();
const roomWalls = new Map();
const roomWallRespawns = new Map();
const roomDrops = new Map();

const PUBLIC_ROOMS = ['12345'];

rooms.set('OPEN', new Set());
roomEnemies.set('OPEN', []);
roomEnemyRespawns.set('OPEN', []);
roomBossProjectiles.set('OPEN', []);
roomWalls.set('OPEN', null);
roomWallRespawns.set('OPEN', []);
roomDrops.set('OPEN', []);

for (const code of PUBLIC_ROOMS) {
  rooms.set(code, new Set());
  roomEnemies.set(code, []);
  roomEnemyRespawns.set(code, []);
  roomBossProjectiles.set(code, []);
  roomWalls.set(code, null);
  roomWallRespawns.set(code, []);
  roomDrops.set(code, []);
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function maxHpForLevel(level) {
  const lv=clamp(Number(level)||1,1,1000);
  return 150+Math.floor((lv-1)*18);
}

function speedForLevel(level) {
  const lv=clamp(Number(level)||1,1,1000);
  return 225+Math.min(180,Math.floor((lv-1)*4.5));
}

function xpToNextLevel(level) {
  return 100 * Math.max(1, Number(level) || 1);
}

function masteryXpToNextLevel(level) {
  return 100 * Math.max(1, Number(level) || 1);
}

function masteryLevelFromXp(xp) {
  let level = 1;
  let remaining = Math.max(0, Number(xp) || 0);

  while (level < 1000 && remaining >= masteryXpToNextLevel(level)) {
    remaining -= masteryXpToNextLevel(level);
    level += 1;
  }

  return level;
}

function masteryXpIntoLevel(xp) {
  let level = 1;
  let remaining = Math.max(0, Number(xp) || 0);

  while (level < 1000 && remaining >= masteryXpToNextLevel(level)) {
    remaining -= masteryXpToNextLevel(level);
    level += 1;
  }

  return remaining;
}


function inSafeZone(x, y, pad = 0) {
  return Math.hypot(x - SAFE_ZONE.x, y - SAFE_ZONE.y) <= SAFE_ZONE.r + pad;
}

function makeCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(ws, message) {
  if (!ws || ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error('[WS SEND]', error?.message || error);
    return false;
  }
}

function roomPlayers(room) {
  return [...(room || [])].map((ws) => clients.get(ws)).filter(Boolean);
}

function publicPlayer(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    angle: p.angle,
    hp: p.hp,
    maxHp: maxHpForLevel(p.level),
    alive: p.alive,
    level: p.level,
    score: p.score,
    kills: p.kills,
    xp: p.xp,
    pvpKills: p.pvpKills,
    damage: p.damage,
    defense: p.defense,
    damageXp: p.damageXp,
    defenseXp: p.defenseXp,
    fireRate: p.fireRate,
    speed: p.speed,
    color: p.color,
    weapon: p.weapon,
    meleeLevel: masteryLevelFromXp(p.meleeXp||0),
    meleeXp: Math.max(0,Number(p.meleeXp)||0),
    fatigue: Math.max(0,Math.min(Number(p.maxFatigue)||MAX_FATIGUE,Number(p.fatigue)||0)),
    maxFatigue: Number(p.maxFatigue)||MAX_FATIGUE,
    comboCount: Math.max(0,Number(p.comboCount)||0),
    equippedSkin: cosmetics.getSkin(p.equippedSkin)?.id || (cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : 'core_default'),
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : '',
    equippedBackpack: p.equippedBackpack || ''
  };
}

function publicPlayers(room) {
  return roomPlayers(room).map(publicPlayer);
}

function sendPlayerList(code) {
  const room = rooms.get(code);
  if (!room) return;
  broadcastRoom(code, {
    type: 'player_list',
    players: publicPlayers(room)
  });
}

function sendStats(p) {
  if (!p?.ws) return;

  const nextKills = p.kills % 5 === 0 ? 5 : 5 - (p.kills % 5);
  const maxAmmo = 0;

  send(p.ws, {
    type: 'server_stats',
    name: p.name,
    nameLocked: !!p.nameLocked,
    kills: p.kills,
    pvpKills: p.pvpKills,
    score: p.score,
    xp: p.xp,
    level: p.level,
    damage: Number(p.damage) || 1,
    meleeLevel: masteryLevelFromXp(p.meleeXp||0),
    meleeXp: Math.max(0,Number(p.meleeXp)||0),
        defense: Number(p.defense) || 0,
    defenseLevel: masteryLevelFromXp(p.defenseXp),
    defenseXp: Math.max(0,Number(p.defenseXp)||0),
    defenseXpIntoLevel: masteryXpIntoLevel(p.defenseXp),
    defenseXpNeed: masteryXpToNextLevel(masteryLevelFromXp(p.defenseXp)),
    fireRate: p.fireRate,
    speed: p.speed,
    maxHp: maxHpForLevel(p.level),
    xpNeed: xpToNextLevel(p.level),
    killsToLevel: nextKills,
    gold: p.gold || 0,
    diamonds: p.diamonds || 0,
    meleeLevel: masteryLevelFromXp(p.meleeXp||0),
    meleeXp: Math.max(0,Number(p.meleeXp)||0),
    meleeXpIntoLevel: masteryXpIntoLevel(p.meleeXp||0),
    meleeXpNeed: masteryXpToNextLevel(masteryLevelFromXp(p.meleeXp||0)),
    fatigue: Math.max(0,Math.min(Number(p.maxFatigue)||MAX_FATIGUE,Number(p.fatigue)||0)),
    maxFatigue: Number(p.maxFatigue)||MAX_FATIGUE,
    comboCount: Math.max(0,Number(p.comboCount)||0),
    inventory: inventoryPayload(p),
    inventoryCapacity: inventoryCapacity(p),
    weapon: p.weapon,
    ownedWeapons: normalizeOwnedWeapons(p.ownedWeapons, p.weapon || 'sword_neo'),
    merchantNpc: MERCHANT_NPC,
    bankEnabled: BANK_ENABLED,
    equippedSkin: cosmetics.getSkin(p.equippedSkin)?.id || 'core_default',
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : '',
    equippedBackpack: p.equippedBackpack || '',
    ownedSkins: [...new Set(['core_default',...cosmetics.normalizeOwnedSkins(p.ownedSkins)])],
    ownedSkins: cosmetics.normalizeOwnedSkins(p.ownedSkins),
    redeemedCodes: cosmetics.normalizeRedeemedCodes(p.redeemedCodes),
    skinRating: 0
  });
}
function capturePlayerData(p) {
  return {
    name: p.name,
    nameLocked: !!p.nameLocked,
    accountId: String(p.accountId || p.saveKey || '').slice(0, 96),
    level: p.level,
    hp: p.hp,
    damage: p.damage,
    defense: p.defense,
    fireRate: p.fireRate,
    speed: p.speed,
    score: p.score,
    kills: p.kills,
    xp: p.xp,
    pvpKills: p.pvpKills,
    gold: p.gold || 0,
    diamonds: p.diamonds || 0,
    inventory: inventoryPayload(p),
    weapon: WEAPONS[p.weapon] ? p.weapon : 'sword_neo',
    ownedWeapons: normalizeOwnedWeapons(p.ownedWeapons, p.weapon || ''),
    bankedGold: Math.max(0, Number(p.bankedGold) || 0),
    bankedDiamonds: Math.max(0, Number(p.bankedDiamonds) || 0),
    damageXp: Math.max(0, Number(p.damageXp) || 0),
    defenseXp: Math.max(0, Number(p.defenseXp) || 0),
    damagePenalty: Math.max(0, Number(p.damagePenalty) || 0),
    defensePenalty: Math.max(0, Number(p.defensePenalty) || 0),
    ownedSkins: cosmetics.normalizeOwnedSkins(p.ownedSkins),
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : 'core_default',
    ownedSkins: cosmetics.normalizeOwnedSkins(p.ownedSkins),
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : '',
    equippedBackpack: p.equippedBackpack || '',
    redeemedCodes: cosmetics.normalizeRedeemedCodes(p.redeemedCodes)
  };
}

function persistPlayer(p) {
  if (!p?.saveKey) return Promise.resolve(null);

  const write = async () => {
    const data = capturePlayerData(p);
    savedPlayers.set(p.saveKey, data);

    try {
      await storage.ready;
      await storage.savePlayerData(p.saveKey, data);
    } catch (error) {
      console.error('[STORAGE SAVE]', error?.message || error);
    }

    p.lastPersistAt = Date.now();
    return data;
  };

  p.persistChain = (p.persistChain || Promise.resolve()).then(write, write);
  return p.persistChain;
}

async function loadSavedPlayer(saveKey, playerName = '') {
  if (!saveKey) return null;

  const cached = savedPlayers.get(saveKey);
  if (cached) return { data: { ...cached }, migrated: false };

  try {
    await storage.ready;

    const data = await storage.loadPlayerData(saveKey);
    if (data) {
      savedPlayers.set(saveKey, data);
      return { data: { ...data }, migrated: false };
    }

    // Migración entre orígenes (por ejemplo github.io -> dominio corto):
    // si el navegador genera un saveKey nuevo, recuperamos el único perfil
    // existente que tenga exactamente el mismo nombre.
  } catch (error) {
    console.error('[STORAGE LOAD]', error?.message || error);
  }

  return null;
}

function inventoryCapacity(p){return p?.equippedBackpack===BACKPACK_ITEM_ID?MAX_INVENTORY_SLOTS:BASE_INVENTORY_SLOTS;}
function emptyInventory(capacity=MAX_INVENTORY_SLOTS){return Array.from({length:Math.max(BASE_INVENTORY_SLOTS,Math.min(MAX_INVENTORY_SLOTS,Number(capacity)||BASE_INVENTORY_SLOTS))},()=>null);}
function normalizeInventory(value,capacity=MAX_INVENTORY_SLOTS){
  const cap=Math.max(BASE_INVENTORY_SLOTS,Math.min(MAX_INVENTORY_SLOTS,Math.floor(Number(capacity)||BASE_INVENTORY_SLOTS)));
  const out=emptyInventory(cap),src=Array.isArray(value)?value:[];
  for(const raw of src){
    if(!raw)continue;
    const itemId=String(raw.itemId||raw.id||'');
    const def=getItemDefinition(itemId);if(!def)continue;
    let remaining=Math.max(0,Math.floor(Number(raw.qty)||0));if(remaining<=0)continue;
    const stackable=def.stackable===true,maxStack=stackable?Math.max(1,Number(def.stackMax)||INVENTORY_STACK_MAX):1;
    if(stackable)for(let i=0;i<out.length&&remaining>0;i++){const slot=out[i];if(slot&&slot.itemId===itemId&&slot.qty<maxStack){const take=Math.min(remaining,maxStack-slot.qty);slot.qty+=take;remaining-=take;}}
    while(remaining>0){const idx=out.findIndex(slot=>!slot);if(idx<0)break;const take=Math.min(remaining,maxStack);out[idx]={itemId,qty:take};remaining-=take;if(!stackable)remaining=0;}
  }
  return out;
}
function inventoryTotal(p,itemId=''){if(!p)return 0;p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));let total=0;for(const slot of p.inventory)if(slot&&slot.itemId===itemId)total+=Math.max(0,Number(slot.qty)||0);return total;}
function addInventoryItem(p,itemId,qty){
  if(!p)return Math.max(0,Math.floor(Number(qty)||0));
  const def=getItemDefinition(itemId);let remaining=Math.max(0,Math.floor(Number(qty)||0));if(!def||remaining<=0)return remaining;
  p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));
  const maxStack=def.stackable?Math.max(1,Number(def.stackMax)||INVENTORY_STACK_MAX):1;
  if(def.stackable)for(let i=0;i<p.inventory.length&&remaining>0;i++){const slot=p.inventory[i];if(slot&&slot.itemId===def.id&&slot.qty<maxStack){const take=Math.min(remaining,maxStack-slot.qty);slot.qty+=take;remaining-=take;}}
  while(remaining>0){const idx=p.inventory.findIndex(slot=>!slot);if(idx<0)break;const take=def.stackable?Math.min(remaining,maxStack):1;p.inventory[idx]={itemId:def.id,qty:take};remaining-=take;}
  return remaining;
}
function removeInventoryAmount(p,itemId,qty){
  if(!p)return 0;p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));let remaining=Math.max(0,Math.floor(Number(qty)||0)),removed=0;
  for(let i=0;i<p.inventory.length&&remaining>0;i++){const slot=p.inventory[i];if(!slot||slot.itemId!==String(itemId))continue;const take=Math.min(remaining,Math.max(0,Number(slot.qty)||0));slot.qty-=take;removed+=take;remaining-=take;if(slot.qty<=0)p.inventory[i]=null;}
  return removed;
}
function inventoryPayload(p){return p.inventory.slice(0,inventoryCapacity(p)).map(slot=>slot?{itemId:slot.itemId,qty:slot.qty}:null);}
function sendInventoryState(p,message=''){
  if(!p?.ws)return;
  send(p.ws,{type:'inventory_state',message,inventory:inventoryPayload(p),slots:inventoryCapacity(p),stackMax:INVENTORY_STACK_MAX,inventoryCapacity:inventoryCapacity(p),equippedBackpack:p.equippedBackpack||'',equippedWeapon:p.weapon||'',equippedSkin:p.equippedSkin||'',itemCatalog:publicItemCatalog(),shopStock:Object.fromEntries(SHOP_STOCK)});
}
function syncOwnedCollections(p){
  const weapons=new Set(Array.isArray(p.ownedWeapons)?p.ownedWeapons:[]),armors=new Set(Array.isArray(p.ownedSkins)?p.ownedSkins:[]);
  if(p.weapon)weapons.add(p.weapon);if(p.equippedSkin)armors.add(p.equippedSkin);
  for(const slot of p.inventory||[]){if(!slot)continue;const def=getItemDefinition(slot.itemId);if(def?.category==='weapon')weapons.add(slot.itemId);if(def?.category==='armor')armors.add(slot.itemId);}
  p.ownedWeapons=normalizeOwnedWeapons([...weapons],p.weapon||'');p.ownedSkins=cosmetics.normalizeOwnedSkins([...armors]);
}
function findFreeInventorySlot(p){p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));return p.inventory.findIndex(slot=>!slot);}
function equipInventoryItem(p,slotIndex){
  if(!p)return {ok:false,message:'Jugador no encontrado.'};
  const idx=Math.floor(Number(slotIndex));if(!Number.isInteger(idx)||idx<0||idx>=inventoryCapacity(p))return {ok:false,message:'Espacio inválido.'};
  p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));const slot=p.inventory[idx];if(!slot)return {ok:false,message:'Ese espacio está vacío.'};
  const def=getItemDefinition(slot.itemId);if(!def?.equipSlot)return {ok:false,message:'Ese objeto no se puede equipar.'};
  if(def.equipSlot==='weapon'){const previous=p.weapon||'';p.weapon=def.id;p.equippedWeaponSkin='';p.inventory[idx]=previous&&previous!==def.id?{itemId:previous,qty:1}:null;}
  else if(def.equipSlot==='armor'){const previous=p.equippedSkin||'';p.equippedSkin=def.id;p.inventory[idx]=previous&&previous!==def.id?{itemId:previous,qty:1}:null;}
  else if(def.equipSlot==='backpack'){const previous=p.equippedBackpack||'';p.equippedBackpack=def.id;const expanded=inventoryCapacity(p);p.inventory.length=expanded;while(p.inventory.length<expanded)p.inventory.push(null);p.inventory[idx]=previous&&previous!==def.id?{itemId:previous,qty:1}:null;}
  p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));syncOwnedCollections(p);applyCombatStats(p);return {ok:true};
}
function unequipEquipment(p,slot){
  if(!p)return {ok:false,message:'Jugador no encontrado.'};
  const equipSlot=String(slot||'');let itemId='';
  if(equipSlot==='weapon'){itemId=p.weapon||'';p.weapon='';}
  else if(equipSlot==='armor'){itemId=p.equippedSkin||'';p.equippedSkin='';}
  else if(equipSlot==='backpack'){
    if(p.equippedBackpack===BACKPACK_ITEM_ID)for(const slotItem of (p.inventory||[]).slice(BASE_INVENTORY_SLOTS))if(slotItem)return {ok:false,message:'No hay espacio para quitar la mochila. Vacía los espacios adicionales primero.'};
    itemId=p.equippedBackpack||'';p.equippedBackpack='';
  }else return {ok:false,message:'Equipo inválido.'};
  if(itemId){p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));const idx=findFreeInventorySlot(p);if(idx<0){if(equipSlot==='weapon')p.weapon=itemId;else if(equipSlot==='armor')p.equippedSkin=itemId;else p.equippedBackpack=itemId;return {ok:false,message:'No hay espacio libre en el inventario.'};}p.inventory[idx]={itemId,qty:1};}
  p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));syncOwnedCollections(p);applyCombatStats(p);return {ok:true};
}
function dropItem(roomCode,p,itemId,qty,x,y){
  const list=roomDrops.get(roomCode)||[];
  const id=String(itemId||'');
  const drop={
    id:'d_'+Math.random().toString(36).slice(2,10),
    itemId:id,
    name:id==='gold'?'ORO':id==='ammo'?'MUNICIÓN':'OBJETO',
    qty:Math.max(1,Math.floor(Number(qty)||0)),
    x:clamp(Number(x)||0,35,WORLD.w-35),
    y:clamp(Number(y)||0,35,WORLD.h-35),
    createdAt:Date.now()
  };
  list.push(drop);roomDrops.set(roomCode,list);return drop;
}
function spawnGoldDrops(roomCode,amount,x,y){
  let remaining=Math.max(0,Math.floor(Number(amount)||0));
  const drops=[];
  let index=0;
  while(remaining>0){
    const qty=Math.min(INVENTORY_STACK_MAX,remaining);
    const angle=(index%12)*(Math.PI*2/12);
    const radius=index===0?0:38+((index%4)*16);
    const centerX=Number(x)||0;
    const centerY=Number(y)||0;
    drops.push(dropItem(roomCode,null,'gold',qty,
      clamp(centerX+Math.cos(angle)*radius,35,WORLD.w-35),
      clamp(centerY+Math.sin(angle)*radius,35,WORLD.h-35)));
    remaining-=qty;index++;
  }
  return drops;
}
function sendDropState(roomCode){broadcastRoom(roomCode,{type:'drop_state',drops:(roomDrops.get(roomCode)||[]).map(d=>({...d}))});}
function cleanupDrops(roomCode){const now=Date.now(),list=roomDrops.get(roomCode)||[],next=list.filter(d=>now-(Number(d.createdAt)||now)<DROP_LIFETIME_MS);if(next.length!==list.length){roomDrops.set(roomCode,next);sendDropState(roomCode);}}
function dropInventoryItem(ws,slotIndex){
  const p=clients.get(ws);if(!p||!p.room||!p.alive)return;
  const idx=Math.floor(Number(slotIndex));if(!Number.isInteger(idx)||idx<0||idx>=inventoryCapacity(p))return;
  p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));const slot=p.inventory[idx];if(!slot)return sendInventoryState(p,'Ese espacio está vacío.');
  if(slot.itemId===p.weapon||slot.itemId===p.equippedSkin||slot.itemId===p.equippedBackpack)return sendInventoryState(p,'Ese objeto está equipado.');
  const qty=Math.max(1,Math.floor(Number(slot.qty)||1));p.inventory[idx]=null;
  dropItem(p.room,p,slot.itemId,qty,p.x,p.y);void persistPlayer(p);
  sendInventoryState(p,'Soltaste '+qty+' '+(getItemDefinition(slot.itemId)?.name||'objeto')+' en el suelo.');sendDropState(p.room);
}
function pickupNearby(ws){
  const p=clients.get(ws);if(!p||!p.room||!p.alive)return;
  cleanupDrops(p.room);
  const list=roomDrops.get(p.room)||[];
  let bestIndex=-1,bestDistance=Infinity;
  for(let i=0;i<list.length;i++){
    const d=list[i],distance=Math.hypot(p.x-d.x,p.y-d.y);
    if(distance<=95&&distance<bestDistance){bestDistance=distance;bestIndex=i;}
  }
  if(bestIndex<0)return sendInventoryState(p,'No hay objetos cerca.');
  const drop=list[bestIndex];
  if(String(drop.itemId)==='gold'){
    const amount=Math.max(1,Math.min(INVENTORY_STACK_MAX,Math.floor(Number(drop.qty)||0)));
    p.gold=Math.max(0,Number(p.gold)||0)+amount;
    list.splice(bestIndex,1);
    roomDrops.set(p.room,list);
    void persistPlayer(p);
    send(ws,{type:'currency_pickup',amount,gold:p.gold});
    sendStats(p);
    sendDropState(p.room);
    return;
  }
  const before=inventoryTotal(p,drop.itemId);
  const leftover=addInventoryItem(p,drop.itemId,drop.qty);
  const added=inventoryTotal(p,drop.itemId)-before;
  if(added<=0)return sendInventoryState(p,'La mochila está llena.');
  drop.qty=leftover;
  if(drop.qty<=0)list.splice(bestIndex,1);
  roomDrops.set(p.room,list);
  void persistPlayer(p);
  sendInventoryState(p,'Recogiste '+added+' '+drop.name+'.');
  sendDropState(p.room);
}
function normalizeOwnedWeapons(value, fallbackWeapon = '') {
  return ['sword_neo'];
}

function weaponSkinAttackBonus(p) {
  // Las armas ya incluyen su aspecto y su ATAQUE. Las antiguas skins de arma
  // quedan ignoradas para compatibilidad con partidas guardadas.
  return 0;
}


function skinDefenseBonus(){return 0;}
function defenseLevelFromXp(xp){return masteryLevelFromXp(xp);}
function defenseXpIntoCurrentLevel(xp){return masteryXpIntoLevel(xp);}

function applyCombatStats(p){p.weapon='sword_neo';const item=WEAPONS.sword_neo;const meleeLevel=masteryLevelFromXp(p.meleeXp||0);p.meleeLevel=meleeLevel;p.power=Math.max(0,Number(item.power)||0);p.powerAttackBonus=Number(item.power)||0;p.damage=Math.max(1,meleeLevel+Number(item.power||0));p.fireRate=Number(item.fireRate)||700;p.defense=Math.max(0,defenseLevelFromXp(p.defenseXp)-1);p.speed=speedForLevel(p.level);p.ammo=0;}

function addDamageXp(p,amount){if(!p)return;const gain=Math.max(0,Math.floor(Number(amount)||0));p.meleeXp=Math.max(0,Number(p.meleeXp)||0)+gain;p.meleeLevel=masteryLevelFromXp(p.meleeXp);applyCombatStats(p);}

function addDefenseXp(p,amount){
  if(!p)return;
  p.defenseXp=Math.max(0,Number(p.defenseXp)||0)+Math.max(0,Math.floor(Number(amount)||0));
  applyCombatStats(p);
}

function applyMasteryDeathLoss(p) {
  // La muerte quita una parte del progreso de daño y defensa.
  // Si el progreso perdido cruza un nivel de maestría, el atributo baja.
  const damageLevel = masteryLevelFromXp(p.damageXp);
  const defenseLevel = masteryLevelFromXp(p.defenseXp);
  const damageIntoLevel = masteryXpIntoLevel(p.damageXp);
  const defenseIntoLevel = masteryXpIntoLevel(p.defenseXp);

  const damageLoss = Math.max(1, Math.floor(masteryXpToNextLevel(damageLevel) * DEATH_DAMAGE_LOSS));
  p.damageXp = Math.max(0, Number(p.damageXp || 0) - damageLoss);

  // Si estaba en el nivel 1 de maestría, nunca baja por debajo de 1.
  // Si pierde el progreso que tenía dentro de su nivel, vuelve al nivel anterior
  // y conserva el progreso restante desde 0 de ese nivel.
  if (damageLevel > 1 && damageIntoLevel < damageLoss) {
    p.damageXp = Math.max(0, p.damageXp);
  }
  // Defensa no pierde experiencia ni nivel al morir; viene del skin.
  applyCombatStats(p);
}

function applyDeathPenalty(p) {
  // Cada muerte pierde 10% del XP necesario para el nivel actual.
  // Si el XP cae por debajo de 0, baja un nivel y el XP queda en 0.
  let level = clamp(Number(p.level) || 1, 1, 1000);
  let xp = Math.max(0, Number(p.xp) || 0);
  const xpLoss = Math.max(1, Math.floor(xpToNextLevel(level) * DEATH_XP_LOSS));

  xp -= xpLoss;

  if (xp < 0) {
    level = Math.max(1, level - 1);
    xp = 0;
  }

  p.level = level;
  p.xp = xp;

  // El progreso de maestría también recibe su penalización de muerte.
  applyMasteryDeathLoss(p);

  // La vida se restaura completa al reaparecer; la muerte ya no deja al
  // jugador con HP reducido en la zona segura.
  p.hp = maxHpForLevel(level);
  p.gold = Math.max(0, Math.floor((Number(p.gold) || 0) * (1 - DEATH_GOLD_LOSS)));

  // Nunca acumular penalizaciones de ataque/defensa por morir.
  p.damagePenalty = 0;
  p.defensePenalty = 0;
  applyCombatStats(p);
}

function respawnAfterDeath(p) {
  if (!p?.room) return;
  const spawn = spawnPosition(p.room);
  p.x = spawn.x;
  p.y = spawn.y;
  p.angle = 0;
  p.alive = true;
  p.frozen = false;
  p.lastShot = 0;
        p.lastSpecialAt = 0;
        p.defenseTrainingTargetId = '';
  p.lastStateAt = Date.now();
  p.stateViolations = 0;
  applyCombatStats(p);
}

function markPlayerDead(p) {
  if (!p?.room) return false;

  const spawn = spawnPosition(p.room);

  // Respawn automático inmediato en la zona segura.
  p.x = spawn.x;
  p.y = spawn.y;
  p.angle = 0;
  p.alive = true;
  p.frozen = false;
  p.lastShot = 0;
  p.lastStateAt = Date.now();
  p.stateViolations = 0;

  applyDeathPenalty(p);

  // Al reaparecer conserva exactamente la munición que ya tenía.
  p.hp = maxHpForLevel(p.level);
  p.alive = true;
  p.frozen = false;

  void persistPlayer(p);
  return true;
}

function levelUpIfNeeded(p) {
  let changed = false;

  while (p.level < 1000 && p.xp >= xpToNextLevel(p.level)) {
    p.xp -= xpToNextLevel(p.level);
    p.level += 1;
    changed = true;
  }

  if (changed) {
    p.hp = Math.min(maxHpForLevel(p.level), Math.max(1, p.hp));
    applyCombatStats(p);
  }
}

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createWorldWalls() {
  const random = seededRandomFactory(WORLD_WALL_SEED);
  const walls = [];

  for (let i = 0; i < WORLD_WALL_COUNT; i++) {
    let created = null;

    for (let attempt = 0; attempt < 80 && !created; attempt++) {
      const w = Math.round(32 + random() * 28);
      const h = Math.round(32 + random() * 28);
      const x = Math.round(120 + random() * (WORLD.w - 240));
      const y = Math.round(120 + random() * (WORLD.h - 240));

      if (Math.hypot(x - SAFE_ZONE.x, y - SAFE_ZONE.y) < SAFE_ZONE.r + 120) {
        continue;
      }

      let overlaps = false;
      for (const wall of walls) {
        const overlapX = Math.abs(x - wall.x) < (w + wall.w) / 2 + 12;
        const overlapY = Math.abs(y - wall.y) < (h + wall.h) / 2 + 12;
        if (overlapX && overlapY) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        created = {
          id: 'w' + (i + 1),
          x,
          y,
          w,
          h,
          hp: 80,
          maxHp: 80,
          rewardEligible: true
        };
      }
    }

    if (created) walls.push(created);
  }

  // B121: estructuras iniciales alrededor de la zona segura para que el
  // jugador tenga cobertura y referencias visibles desde el spawn.
  const starterStructures = [
    { x: 3000, y: 1650, w: 70, h: 46 },
    { x: 3000, y: 2750, w: 70, h: 46 },
    { x: 2450, y: 2200, w: 46, h: 72 },
    { x: 3550, y: 2200, w: 46, h: 72 }
  ];
  for (const structure of starterStructures) {
    if (!walls.some(w => w.x === structure.x && w.y === structure.y)) {
      walls.push({
        id: 'starter_' + (walls.length + 1),
        ...structure,
        hp: 80,
        maxHp: 80,
        rewardEligible: false
      });
    }
  }

  return walls;
}

const WORLD_WALLS = createWorldWalls();

function restoreDueWalls(code, broadcast = false) {
  const queue = roomWallRespawns.get(code) || [];
  if (!queue.length) return 0;
  const now = Date.now();
  const walls = roomWalls.get(code) || [];
  const pending = [];
  let restored = 0;
  for (const entry of queue) {
    if (Number(entry?.respawnAt) <= now && entry?.wall) {
      const template = entry.wall;
      if (!walls.some((wall) => wall.id === template.id)) {
        const wall = { ...template, hp: template.maxHp };
        walls.push(wall);
        restored++;
        if (broadcast) broadcastRoom(code, { type: 'wall_respawn', wall });
      }
    } else {
      pending.push(entry);
    }
  }
  roomWallRespawns.set(code, pending);
  return restored;
}

function ensureRoomWalls(code) {
  restoreDueWalls(code, false);
  if (!roomWalls.has(code) || !Array.isArray(roomWalls.get(code))) {
    roomWalls.set(
      code,
      WORLD_WALLS.map((wall) => ({ ...wall }))
    );
  }
  return roomWalls.get(code);
}

function sendWallState(code) {
  broadcastRoom(code, {
    type: 'wall_state',
    walls: ensureRoomWalls(code)
  });
}

function collidesWithWall(x, y, radius, walls) {
  for (const wall of walls || []) {
    const closestX = clamp(x, wall.x - wall.w / 2, wall.x + wall.w / 2);
    const closestY = clamp(y, wall.y - wall.h / 2, wall.y + wall.h / 2);
    if (Math.hypot(x - closestX, y - closestY) < radius + 2) return wall;
  }
  return null;
}

function hasLineOfSight(x1, y1, x2, y2, walls) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  if (distance <= 1) return true;
  const dirX = dx / distance;
  const dirY = dy / distance;
  for (const wall of walls || []) {
    const hit = rayAabbDistance(x1, y1, dirX, dirY, wall);
    if (hit >= 0 && hit < distance - 12) return false;
  }
  return true;
}

function rayAabbDistance(originX, originY, dirX, dirY, wall) {
  const minX = wall.x - wall.w / 2;
  const maxX = wall.x + wall.w / 2;
  const minY = wall.y - wall.h / 2;
  const maxY = wall.y + wall.h / 2;

  let txMin = -Infinity;
  let txMax = Infinity;
  let tyMin = -Infinity;
  let tyMax = Infinity;

  if (Math.abs(dirX) < 1e-9) {
    if (originX < minX || originX > maxX) return Infinity;
  } else {
    const tx1 = (minX - originX) / dirX;
    const tx2 = (maxX - originX) / dirX;
    txMin = Math.min(tx1, tx2);
    txMax = Math.max(tx1, tx2);
  }

  if (Math.abs(dirY) < 1e-9) {
    if (originY < minY || originY > maxY) return Infinity;
  } else {
    const ty1 = (minY - originY) / dirY;
    const ty2 = (maxY - originY) / dirY;
    tyMin = Math.min(ty1, ty2);
    tyMax = Math.max(ty1, ty2);
  }

  const entry = Math.max(txMin, tyMin);
  const exit = Math.min(txMax, tyMax);

  if (exit < 0 || entry > exit) return Infinity;
  return entry >= 0 ? entry : exit >= 0 ? 0 : Infinity;
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.000001) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function rayCircleDistance(originX, originY, dirX, dirY, targetX, targetY, radius) {
  // Devuelve la primera distancia positiva donde un rayo normalizado
  // atraviesa el círculo de colisión del objetivo.
  const dx = targetX - originX;
  const dy = targetY - originY;
  const projection = dx * dirX + dy * dirY;
  if (projection < 0) return Infinity;

  const perpendicularSq = Math.max(
    0,
    dx * dx + dy * dy - projection * projection
  );
  const radiusSq = radius * radius;
  if (perpendicularSq > radiusSq) return Infinity;

  const offset = Math.sqrt(Math.max(0, radiusSq - perpendicularSq));
  const hit = projection - offset;
  return hit >= 0 ? hit : projection + offset;
}

function randomEnemySpawnPoint(radius = 24) {
  for (let attempt = 0; attempt < 160; attempt++) {
    const x = clamp(140 + Math.random() * (WORLD.w - 280), 100, WORLD.w - 100);
    const y = clamp(140 + Math.random() * (WORLD.h - 280), 100, WORLD.h - 100);
    if (inSafeZone(x, y, 90)) continue;
    if (collidesWithWall(x, y, radius, WORLD_WALLS)) continue;
    return { x, y };
  }
  return { x: 900, y: 900 };
}

function enemyLevelForSpawn(x,y,kind='drone'){
  const distanceFromSafe=Math.hypot(Number(x)-SAFE_ZONE.x,Number(y)-SAFE_ZONE.y);
  const regionLevel=1+Math.floor(Math.max(0,distanceFromSafe-SAFE_ZONE.r)/420);
  const kindBonus=kind==='boss'?8:kind==='elite'?3:0;
  return clamp(regionLevel+kindBonus,1,30);
}
function enemyStats(kind,level=1) {
  const lv=Math.max(1,Math.round(Number(level)||1));
  if(kind==='boss'){
    return {
      r:54,hp:BOSS_HP+Math.max(0,lv-1)*900,speed:58+Math.max(0,lv-1)*1.4,damage:0,
      name:'COLOSO DE ARENA',areaRadius:BOSS_AGGRO_RANGE,aggroRadius:BOSS_AGGRO_RANGE,
      attackRange:BOSS_ATTACK_RANGE,leashRadius:Infinity,attackCooldown:0,shape:'boss'
    };
  }
  if(kind==='elite'){
    return {
      r:26,hp:360+Math.max(0,lv-1)*34,speed:70+Math.max(0,lv-1)*1.1,
      damage:12+Math.max(0,lv-1)*1.15,areaRadius:320,aggroRadius:560,leashRadius:500,
      attackCooldown:Math.max(520,760-Math.max(0,lv-1)*5),shape:'hex',name:'GUARDIÁN DE DUNAS'
    };
  }
  return {
    r:20,hp:90+Math.max(0,lv-1)*16,speed:68+Math.max(0,lv-1)*1.0,
    damage:8+Math.max(0,lv-1)*0.75,areaRadius:180,aggroRadius:400,leashRadius:390,
    attackCooldown:Math.max(560,820-Math.max(0,lv-1)*5),
    shape:['square','triangle','hex'][Math.floor(Math.random()*3)],name:'ESCARABAJO DE ARENA'
  };
}

function createEnemy(kind='drone'){
  const spawn=randomEnemySpawnPoint(kind==='boss'?54:kind==='elite'?30:22);
  const level=enemyLevelForSpawn(spawn.x,spawn.y,kind);
  const stats=enemyStats(kind,level);
  const now=Date.now();
  return {
    id:Math.random().toString(36).slice(2,10),
    x:spawn.x,y:spawn.y,homeX:spawn.x,homeY:spawn.y,
    areaRadius:stats.areaRadius,aggroRadius:stats.aggroRadius,leashRadius:stats.leashRadius,
    patrolTargetX:spawn.x,patrolTargetY:spawn.y,
    patrolUntil:now+1200+Math.random()*3200,
    r:stats.r,hp:stats.hp,maxHp:stats.hp,speed:stats.speed,damage:stats.damage,
    attackCooldown:stats.attackCooldown,lastAttackAt:0,lastBossShotAt:0,lastBossAreaAt:0,lastBossAttackAt:0,
    bossArea:null,kind,name:stats.name||'',level,shape:stats.shape
  };
}

function scheduleEnemyRespawn(code, kind) {
  const queue = roomEnemyRespawns.get(code) || [];
  const delay = kind === 'boss'
    ? BOSS_RESPAWN_MS
    : MOB_RESPAWN_MS + Math.floor(Math.random() * MOB_RESPAWN_JITTER_MS);
  queue.push({ respawnAt: Date.now() + delay, kind });
  roomEnemyRespawns.set(code, queue);
}

function pendingEnemyKindCount(code, kind) {
  return (roomEnemyRespawns.get(code) || []).filter((entry) => entry.kind === kind).length;
}

function restoreDueEnemies(code, broadcast = false) {
  const queue = roomEnemyRespawns.get(code) || [];
  if (!queue.length) return 0;

  const now = Date.now();
  const enemies = roomEnemies.get(code) || [];
  const pending = [];
  let restored = 0;

  for (const entry of queue) {
    if (Number(entry?.respawnAt) <= now && entry?.kind) {
      const enemy = createEnemy(entry.kind);
      enemies.push(enemy);
      restored++;

      if (broadcast) {
        broadcastRoom(code, { type: 'enemy_respawn', enemy });
      }
    } else {
      pending.push(entry);
    }
  }

  roomEnemyRespawns.set(code, pending);
  return restored;
}

function despawnEnemy(code, enemy, reason = 'leash') {
  if (enemy?.kind === 'boss') return;
  const enemies = roomEnemies.get(code) || [];
  const index = enemies.findIndex((item) => item.id === enemy.id);
  if (index < 0) return;

  const removed = enemies.splice(index, 1)[0];
  scheduleEnemyRespawn(code, removed.kind);
  broadcastRoom(code, {
    type: 'enemy_vanish',
    id: removed.id,
    reason
  });
}

function choosePatrolTarget(enemy, walls) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 20 + Math.random() * Math.max(20, enemy.areaRadius);
    const x = clamp(enemy.homeX + Math.cos(angle) * distance, 60, WORLD.w - 60);
    const y = clamp(enemy.homeY + Math.sin(angle) * distance, 60, WORLD.h - 60);

    if (enemy.kind !== 'boss' && inSafeZone(x, y, enemy.r + 14)) continue;
    if (collidesWithWall(x, y, enemy.r, walls)) continue;

    enemy.patrolTargetX = x;
    enemy.patrolTargetY = y;
    enemy.patrolUntil = Date.now() + 1800 + Math.random() * 3000;
    return;
  }

  enemy.patrolTargetX = enemy.homeX;
  enemy.patrolTargetY = enemy.homeY;
  enemy.patrolUntil = Date.now() + 1500;
}

function moveEnemyToward(enemy,tx,ty,dt,walls){if(enemy.kind==='boss'){const distance=Math.max(1,Math.hypot(tx-enemy.x,ty-enemy.y));const dx=(tx-enemy.x)/distance,dy=(ty-enemy.y)/distance;const step=enemy.speed*dt;const nx=clamp(enemy.x+dx*step,35,WORLD.w-35),ny=clamp(enemy.y+dy*step,35,WORLD.h-35);if(!collidesWithWall(nx,ny,enemy.r,walls)){enemy.x=nx;enemy.y=ny;}return;}const cx=gridCell(enemy.x),cy=gridCell(enemy.y),tcx=gridCell(tx),tcy=gridCell(ty);const man=Math.abs(tcx-cx)+Math.abs(tcy-cy);if(man<=1){enemy.x=gridCenter(cx);enemy.y=gridCenter(cy);enemy.vx=0;enemy.vy=0;return;}const now=Date.now();if(now<(enemy.gridMoveAt||0))return;let nx=cx,ny=cy;if(Math.abs(tcx-cx)>=Math.abs(tcy-cy))nx+=Math.sign(tcx-cx);else ny+=Math.sign(tcy-cy);const px=clamp(gridCenter(nx),MELEE_GRID_SIZE,WORLD.w-MELEE_GRID_SIZE),py=clamp(gridCenter(ny),MELEE_GRID_SIZE,WORLD.h-MELEE_GRID_SIZE);if(!collidesWithWall(px,py,enemy.r,walls)){enemy.x=px;enemy.y=py;enemy.gridMoveAt=now+420;enemy.vx=(nx-cx)*MELEE_GRID_SIZE/0.42;enemy.vy=(ny-cy)*MELEE_GRID_SIZE/0.42;}}

function ensureRoomEnemies(code) {
  if (!roomEnemies.has(code)) roomEnemies.set(code, []);
  if (!roomEnemyRespawns.has(code)) roomEnemyRespawns.set(code, []);
  if (!roomBossProjectiles.has(code)) roomBossProjectiles.set(code, []);

  restoreDueEnemies(code, false);

  const list = roomEnemies.get(code);
  const regularCount = list.filter((enemy) => enemy.kind === 'drone').length;
  const eliteCount = list.filter((enemy) => enemy.kind === 'elite').length;
  const pendingDrones = pendingEnemyKindCount(code, 'drone');
  const pendingElites = pendingEnemyKindCount(code, 'elite');

  for (let i = regularCount + pendingDrones; i < MOB_TARGET_COUNT; i++) {
    list.push(createEnemy('drone'));
  }

  for (let i = eliteCount + pendingElites; i < ELITE_TARGET_COUNT; i++) {
    list.push(createEnemy('elite'));
  }

  if (!list.some((enemy) => enemy.kind === 'boss') && pendingEnemyKindCount(code, 'boss') === 0) {
    list.push(createEnemy('boss'));
  }

  return list;
}

function sendEnemyState(code) {
  const room = rooms.get(code);
  if (!room || !room.size) return;

  const enemies = ensureRoomEnemies(code);
  const projectiles = roomBossProjectiles.get(code) || [];
  const warnings = enemies
    .filter((enemy) => enemy.kind === 'boss' && enemy.bossArea)
    .map((enemy) => enemy.bossArea);

  broadcastRoom(code, {
    type: 'enemy_state',
    enemies,
    bossProjectiles: projectiles,
    bossWarnings: warnings
  });
}

function broadcastRoom(code, message, except = null) {
  const room = rooms.get(code);
  if (!room || !room.size) return;

  const data = JSON.stringify(message);

  for (const ws of room) {
    if (ws === except || ws.readyState !== 1) continue;
    try {
      ws.send(data);
    } catch (error) {
      console.error('[WS BROADCAST]', error?.message || error);
    }
  }
}

async function leaveRoom(ws) {
  const p = clients.get(ws);
  if (!p || !p.room) {
    if (p?.saveKey) void persistPlayer(p);
    return;
  }

  const code = p.room;

  if (p.saveKey) {
    await persistPlayer(p);
  }

  const room = rooms.get(code);
  if (room) {
    room.delete(ws);

    if (room.size === 0 && code !== 'OPEN' && !PUBLIC_ROOMS.includes(code)) {
      rooms.delete(code);
      roomEnemies.delete(code);
      roomEnemyRespawns.delete(code);
      roomBossProjectiles.delete(code);
      roomWalls.delete(code);
      roomWallRespawns.delete(code);
      roomDrops.delete(code);
    } else {
      broadcastRoom(code, {
        type: 'player_leave',
        id: p.id
      });
      sendPlayerList(code);
    }
  }

  p.room = '';
}

async function joinRoom(ws, requestedCode, create = false) {
  const p = clients.get(ws);
  if (!p) return;

  let code = String(requestedCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);

  if (create || !code) {
    code = makeCode();
    rooms.set(code, new Set());
    roomEnemies.set(code, []);
    roomEnemyRespawns.set(code, []);
    roomBossProjectiles.set(code, []);
    roomWalls.set(code, WORLD_WALLS.map((wall) => ({ ...wall })));
  }

  const room = rooms.get(code);

  if (!room) {
    send(ws, { type: 'room_error', reason: 'room_not_found', message: 'Sala no encontrada' });
    return;
  }

  if (room.size >= MAX_PLAYERS) {
    send(ws, { type: 'room_error', reason: 'room_full', message: 'Sala llena' });
    return;
  }

  await leaveRoom(ws);

  room.add(ws);
  ensureRoomEnemies(code);
  ensureRoomWalls(code);
  restoreDueWalls(code, false);

  p.room = code;

  const spawn = spawnPosition(code);

  // Cada entrada a una sala inicia en la zona segura, sin importar la posición anterior.
  p.x = spawn.x;
  p.y = spawn.y;
  p.hp = maxHpForLevel(p.level);

  p.angle = 0;
  p.alive = true;
  p.hasSaved = false;
  p.lastStateAt = Date.now();
  p.stateViolations = 0;
  p.lastShot = 0;

  p.x = clamp(p.x, 35, WORLD.w - 35);
  p.y = clamp(p.y, 35, WORLD.h - 35);
  p.hp = clamp(Number(p.hp) || maxHpForLevel(p.level), 1, maxHpForLevel(p.level));
  applyCombatStats(p);

  send(ws, {
    type: 'room_joined',
    code,
    name: p.name,
    nameLocked: !!p.nameLocked,
    players: publicPlayers(room),
    enemies: ensureRoomEnemies(code),
    walls: ensureRoomWalls(code),
    drops: (roomDrops.get(code)||[]).map(d=>({...d})),
    safeZone: SAFE_ZONE,
    spawnProtectionMs: 5000
  });

  sendStats(p);
  sendInventoryState(p);
  sendDropState(p.room);

  broadcastRoom(
    code,
    {
      type: 'player_join',
      player: publicPlayer(p)
    },
    ws
  );

  sendPlayerList(code);
}

function spawnPosition(code) {
  const room = rooms.get(code) || new Set();
  const index = room.size;

  const spots = [
    [3000,2208],[2976,2208],[3024,2208],[3000,2184],[3000,2232],
    [2976,2184],[3024,2184],[2976,2232],[3024,2232],[2952,2208],
    [3048,2208],[3000,2160],[3000,2256],[2952,2184],[3048,2232]
  ];

  const spot = spots[index % spots.length];
  return { x: spot[0], y: spot[1] };
}

function findPlayer(id, room) {
  for (const ws of room || []) {
    const p = clients.get(ws);
    if (p && p.id === id) return { ws, p };
  }
  return null;
}

function sendItemShopState(p,message='',openOnly=false){
  if(!p?.ws)return;
  send(p.ws,{type:'item_shop_state',message,openOnly:!!openOnly,near:merchantNearby(p),items:publicItemCatalog(),stock:Object.fromEntries(SHOP_STOCK),gold:Math.max(0,Number(p.gold)||0),diamonds:Math.max(0,Number(p.diamonds)||0),inventory:inventoryPayload(p),inventoryCapacity:inventoryCapacity(p),equippedWeapon:p.weapon||'',equippedSkin:p.equippedSkin||'',equippedBackpack:p.equippedBackpack||'',merchantNpc:MERCHANT_NPC});
}
function buyShopItem(ws,itemId){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return send(ws,{type:'item_shop_result',ok:false,message:'No puedes comprar ahora.'});
  if(!merchantNearby(p))return send(ws,{type:'item_shop_result',ok:false,message:'Párate sobre el SHOP.'});
  const id=String(itemId||''),item=getItemDefinition(id);if(!item)return send(ws,{type:'item_shop_result',ok:false,message:'Ese objeto no está a la venta.'});
  const stock=SHOP_STOCK.get(id);if(stock!==undefined&&stock<=0)return send(ws,{type:'item_shop_result',ok:false,message:'Ese objeto se agotó por ahora.'});
  const owned=inventoryTotal(p,id)+(p.weapon===id?1:0)+(p.equippedSkin===id?1:0)+(p.equippedBackpack===id?1:0);
  if(item.category!=='consumable'&&owned>0)return send(ws,{type:'item_shop_result',ok:false,message:'Ya tienes '+item.name+' en tu equipo o inventario.'});
  const goldCost=Math.max(0,Number(item.priceGold)||0),diamondCost=Math.max(0,Number(item.priceDiamonds)||0);
  const gold=Math.max(0,Number(p.gold)||0),diamonds=Math.max(0,Number(p.diamonds)||0);
  if(gold<goldCost||diamonds<diamondCost)return send(ws,{type:'item_shop_result',ok:false,message:'No tienes suficiente moneda para '+item.name+'.'});
  if(addInventoryItem(p,id,1)!==0)return send(ws,{type:'item_shop_result',ok:false,message:'No hay espacio en el inventario.'});
  p.gold=gold-goldCost;p.diamonds=diamonds-diamondCost;
  if(stock!==undefined)SHOP_STOCK.set(id,Math.max(0,stock-1));
  syncOwnedCollections(p);void persistPlayer(p);
  send(ws,{type:'item_shop_result',ok:true,message:'Compraste '+item.name+'. Ve al inventario para equiparlo.',gold:p.gold,diamonds:p.diamonds,stock:SHOP_STOCK.get(id),inventory:inventoryPayload(p),inventoryCapacity:inventoryCapacity(p),equippedWeapon:p.weapon||'',equippedSkin:p.equippedSkin||'',equippedBackpack:p.equippedBackpack||'',stockItem:id});
  sendStats(p);sendPlayerList(p.room);
}
function sellInventoryItem(ws,slotIndex,qtyRequested=1){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return send(ws,{type:'item_shop_result',ok:false,message:'No puedes vender ahora.'});
  if(!merchantNearby(p))return send(ws,{type:'item_shop_result',ok:false,message:'Párate sobre el SHOP.'});
  const idx=Math.floor(Number(slotIndex));if(!Number.isInteger(idx)||idx<0||idx>=inventoryCapacity(p))return send(ws,{type:'item_shop_result',ok:false,message:'Espacio inválido.'});
  p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));const slot=p.inventory[idx];if(!slot)return send(ws,{type:'item_shop_result',ok:false,message:'Ese espacio está vacío.'});
  if(slot.itemId===p.weapon||slot.itemId===p.equippedSkin||slot.itemId===p.equippedBackpack)return send(ws,{type:'item_shop_result',ok:false,message:'No puedes vender un objeto equipado.'});
  const item=getItemDefinition(slot.itemId);if(!item)return send(ws,{type:'item_shop_result',ok:false,message:'Objeto no reconocido.'});
  const available=Math.max(1,Math.floor(Number(slot.qty)||1)),qty=item.stackable?Math.max(1,Math.min(available,Math.floor(Number(qtyRequested)||1))):1;
  const goldValue=Math.max(0,Math.floor(qty*(Number(item.sellPriceGold)||0))),diamondValue=Math.max(0,Math.floor((Number(item.priceDiamonds)||0)*0.6));
  if(item.priceDiamonds>0){p.diamonds=Math.max(0,Number(p.diamonds)||0)+Math.max(1,diamondValue);}
  else p.gold=Math.max(0,Number(p.gold)||0)+Math.max(1,goldValue||Math.floor((Number(item.priceGold)||0)*0.6));
  removeInventoryAmount(p,item.id,qty);
  if(item.id===BACKPACK_ITEM_ID)SHOP_STOCK.set(item.id,(SHOP_STOCK.get(item.id)||0)+1);
  syncOwnedCollections(p);void persistPlayer(p);
  send(ws,{type:'item_shop_result',ok:true,message:'Vendiste '+qty+' '+item.name+'.',gold:p.gold,diamonds:p.diamonds,stock:SHOP_STOCK.get(item.id),inventory:inventoryPayload(p),inventoryCapacity:inventoryCapacity(p),equippedWeapon:p.weapon||'',equippedSkin:p.equippedSkin||'',equippedBackpack:p.equippedBackpack||''});
  sendStats(p);
}
function handleEquipInventory(ws,slotIndex){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return send(ws,{type:'inventory_result',ok:false,message:'No puedes cambiar equipo ahora.'});
  const result=equipInventoryItem(p,slotIndex);if(!result.ok)return send(ws,{type:'inventory_result',ok:false,message:result.message});
  void persistPlayer(p);sendInventoryState(p,'Equipo actualizado.');sendStats(p);sendPlayerList(p.room);
}
function handleUnequipEquipment(ws,slot){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return send(ws,{type:'inventory_result',ok:false,message:'No puedes cambiar equipo ahora.'});
  const result=unequipEquipment(p,slot);if(!result.ok)return send(ws,{type:'inventory_result',ok:false,message:result.message});
  void persistPlayer(p);sendInventoryState(p,'Equipo actualizado.');sendStats(p);sendPlayerList(p.room);
}

function shopBuy(ws, requestedWeapon) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) return send(ws, { type: 'shop_result', ok: false, message: 'No puedes usar el arsenal ahora.' });
  if (!merchantNearby(p)) return send(ws, { type: 'shop_result', ok: false, message: 'Párate sobre el SHOP.' });

  const weaponId = String(requestedWeapon || '');
  const item = WEAPONS[weaponId];
  if (!item || item.forSale === false) return send(ws, { type: 'shop_result', ok: false, message: 'Arma no disponible para venta.' });

  p.ownedWeapons = normalizeOwnedWeapons(p.ownedWeapons, p.weapon || '');

  if (p.weapon === weaponId) {
    p.weapon = null;
    applyCombatStats(p);
    void persistPlayer(p);
    send(ws, {
      type: 'shop_result',
      ok: true,
      message: 'Arsenal desequipado · PODER del arma retirado.',
      weapon: null,
      ownedWeapons: p.ownedWeapons,
      equippedWeaponSkin: '',
      damage: p.damage,
      defense: p.defense,
      fireRate: p.fireRate,
      maxAmmo: 0,
      ammo: p.ammo,
      gold: p.gold || 0
    });
    sendStats(p);
    sendPlayerList(p.room);
    return;
  }

  const owned = p.ownedWeapons.includes(weaponId);
  if (!owned) {
    const gold = Math.max(0, Number(p.gold) || 0);
    if (gold < item.cost) return send(ws, { type: 'shop_result', ok: false, message: 'Necesitas ' + item.cost + ' de oro para ' + item.name + '.' });
    p.gold = gold - item.cost;
    p.ownedWeapons.push(weaponId);
  }

  p.weapon = weaponId;
  p.equippedWeaponSkin = '';
  applyCombatStats(p);
  void persistPlayer(p);
  send(ws, {
    type: 'shop_result',
    ok: true,
    message: (owned ? 'Equipada ' : 'Comprada y equipada ') + item.name + ' · PODER ' + item.power + '.',
    weapon: p.weapon,
    ownedWeapons: p.ownedWeapons,
    equippedWeaponSkin: '',
    gold: p.gold,
    ammo: p.ammo,
    maxAmmo: 0,
    damage: p.damage,
    defense: p.defense,
    fireRate: p.fireRate,
    speed: p.speed
  });
  sendStats(p);
  sendPlayerList(p.room);
}
function buyWeaponSkin(ws, skinId) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) return cosmeticShopError(ws, 'No puedes usar skins de arma ahora.');
  if (!merchantNearby(p)) return cosmeticShopError(ws, 'Párate sobre el SHOP.');

  const skin = cosmetics.getWeaponSkin(skinId);
  if (!skin) return cosmeticShopError(ws, 'Skin de arma no disponible.');
  if (!p.weapon || skin.weaponId !== p.weapon) return cosmeticShopError(ws, 'Equipa primero el arma compatible.');

  p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(p.ownedWeaponSkins);
  if (p.ownedWeaponSkins.includes(skin.id)) {
    p.equippedWeaponSkin = p.equippedWeaponSkin === skin.id ? '' : skin.id;
  } else {
    const gold = Math.max(0, Number(p.gold) || 0);
    const diamonds = Math.max(0, Number(p.diamonds) || 0);
    if (skin.priceDiamonds > 0) {
      if (diamonds < skin.priceDiamonds) return cosmeticShopError(ws, 'Necesitas ' + skin.priceDiamonds + ' diamantes.');
      p.diamonds = diamonds - skin.priceDiamonds;
    } else if (skin.priceGold > 0) {
      if (gold < skin.priceGold) return cosmeticShopError(ws, 'Necesitas ' + skin.priceGold + ' de oro.');
      p.gold = gold - skin.priceGold;
    } else {
      return cosmeticShopError(ws, 'Esta skin de arma no tiene un precio válido.');
    }
    p.ownedWeaponSkins.push(skin.id);
    p.equippedWeaponSkin = skin.id;
  }

  applyCombatStats(p);
  void persistPlayer(p);
  sendCosmeticState(p, p.equippedWeaponSkin ? 'Diseño de arma equipado: ' + skin.name + '.' : 'Diseño de arma desequipado · bonificación retirada.');
  sendStats(p);
  sendPlayerList(p.room);
}

function equipWeaponSkin(ws, skinId) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) return cosmeticShopError(ws, 'No puedes cambiar el diseño del arma ahora.');
  if (!merchantNearby(p)) return cosmeticShopError(ws, 'Acércate al SHOP.');

  const id = String(skinId || '');
  p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(p.ownedWeaponSkins);
  if (id === '') {
    applyCombatStats(p);
    void persistPlayer(p);
    sendCosmeticState(p, 'Diseño de arma desequipado · bonificación retirada.');
    sendStats(p);
    sendPlayerList(p.room);
    return;
  }

  const skin = cosmetics.getWeaponSkin(id);
  if (!skin || !p.ownedWeaponSkins.includes(id) || skin.weaponId !== p.weapon) {
    return cosmeticShopError(ws, 'Diseño de arma no disponible para tu arsenal equipado.');
  }

  p.equippedWeaponSkin = id;
  applyCombatStats(p);
  void persistPlayer(p);
  sendCosmeticState(p, 'Diseño de arma equipado: ' + skin.name + '.');
  sendStats(p);
  sendPlayerList(p.room);
}

function merchantNearby(p) {
  return !!p && Math.hypot(p.x - MERCHANT_NPC.x, p.y - MERCHANT_NPC.y) <= MERCHANT_INTERACTION_RADIUS;
}

function sendCosmeticState(p,message='Tienda lista.',unlockedSkin='',unlockedWeapon='',unlockedWeaponSkin=''){
  if(!p?.ws)return;
  send(p.ws,{type:'cosmetic_state',message,
    unlockedSkin:cosmetics.getSkin(unlockedSkin)?unlockedSkin:'',
    equippedSkin:cosmetics.getSkin(p.equippedSkin)?p.equippedSkin:'core_default',
    ownedSkins:cosmetics.normalizeOwnedSkins(p.ownedSkins),
    ownedWeapons:normalizeOwnedWeapons(p.ownedWeapons,p.weapon||''),weapon:p.weapon,
    weaponSkinCatalog:cosmetics.publicWeaponCatalog(),merchantNpc:MERCHANT_NPC,
    catalog:cosmetics.publicCatalog(),skinCatalog:cosmetics.publicCatalog().filter(s=>SHOP_SKIN_IDS.includes(s.id)),
    realMoneyOffers:cosmetics.publicRealMoneyOffers(),realMoneyEnabled:false});
}
function cosmeticShopError(ws,message){send(ws,{type:'cosmetic_result',ok:false,message:String(message||'No se pudo completar la operación.')});}
function buyCosmeticSkin(ws,skinId){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return cosmeticShopError(ws,'No puedes comprar skins ahora.');
  if(!merchantNearby(p))return cosmeticShopError(ws,'Párate sobre el MERCADER.');
  const id=String(skinId||''),skin=cosmetics.getSkin(id);
  if(!skin||!SHOP_SKIN_IDS.includes(id))return cosmeticShopError(ws,'Skin no disponible para venta.');
  p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
  if(p.ownedSkins.includes(id)){p.equippedSkin=id;void persistPlayer(p);sendCosmeticState(p,'Skin equipada: '+skin.name);sendStats(p);sendPlayerList(p.room);return;}
  const gold=Math.max(0,Number(p.gold)||0),diamonds=Math.max(0,Number(p.diamonds)||0);
  if(skin.priceDiamonds>0){if(diamonds<skin.priceDiamonds)return cosmeticShopError(ws,'Necesitas '+skin.priceDiamonds+' diamantes.');p.diamonds=diamonds-skin.priceDiamonds;}
  else if(skin.priceGold>0){if(gold<skin.priceGold)return cosmeticShopError(ws,'Necesitas '+skin.priceGold+' de oro.');p.gold=gold-skin.priceGold;}
  else return cosmeticShopError(ws,'Esta skin no tiene precio válido.');
  p.ownedSkins=cosmetics.normalizeOwnedSkins([...p.ownedSkins,id]);p.equippedSkin=id;void persistPlayer(p);
  sendCosmeticState(p,'¡Compraste la skin '+skin.name+' y quedó equipada!');sendStats(p);sendPlayerList(p.room);
}
function equipCosmeticSkin(ws,skinId){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return cosmeticShopError(ws,'No puedes cambiar de skin ahora.');
  if(!merchantNearby(p))return cosmeticShopError(ws,'Acércate al MERCADER.');
  const id=String(skinId||'');p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
  if(!id||!cosmetics.getSkin(id)||!p.ownedSkins.includes(id))return cosmeticShopError(ws,'Skin bloqueada.');
  p.equippedSkin=p.equippedSkin===id?'core_default':id;void persistPlayer(p);
  sendCosmeticState(p,p.equippedSkin===id?'Skin equipada.':'Skin retirada.');sendStats(p);sendPlayerList(p.room);
}
async function redeemCosmeticCode(ws, rawCode, fromServerChat=false) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) return cosmeticShopError(ws, 'No puedes usar códigos ahora.');
  if (!fromServerChat && !merchantNearby(p)) return cosmeticShopError(ws, 'Acércate al MERCADER.');

  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  if (!code) return cosmeticShopError(ws, 'Escribe un código.');

  const reward = cosmetics.REDEEM_CODES[code];
  if (!reward) return cosmeticShopError(ws, 'Código no válido.');
  if (reward.enabled === false) return cosmeticShopError(ws, 'Ese código está desactivado temporalmente.');

  p.redeemedCodes = cosmetics.normalizeRedeemedCodes(p.redeemedCodes);
  if (!reward.repeatable && p.redeemedCodes.includes(code)) {
    return cosmeticShopError(ws, 'Ese código ya fue usado en esta cuenta.');
  }

  p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
  p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
  p.ownedWeapons=normalizeOwnedWeapons(p.ownedWeapons,p.weapon||'');
  p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(p.ownedWeaponSkins);

  let unlockedSkin = '', unlockedWeapon = '', unlockedWeaponSkin = '';
  const unlockedSkins=[];
  const unlockedWeapons=[];

  if (reward.allSkins) {
    p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
    p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
    for(const armorId of Object.keys(cosmetics.SKINS)){if(!p.ownedSkins.includes(armorId))p.ownedSkins.push(armorId);unlockedSkins.push(armorId);}
  }

  if (reward.allItems) {
    for (const itemId of [BACKPACK_ITEM_ID, ...SHOP_SWORD_IDS]) {
      if(!p.inventory.some(slot=>slot&&slot.itemId===itemId)){
        addInventoryItem(p,itemId,1);
      }
    }
  }

  if (reward.allWeapons) {
    for (const weaponId of Object.keys(WEAPONS)) {
      if (!p.ownedWeapons.includes(weaponId)) p.ownedWeapons.push(weaponId);
      unlockedWeapons.push(weaponId);
    }
    const preferredWeapon = 'sword_neo';
    p.weapon = preferredWeapon;
    unlockedWeapon = preferredWeapon;
  }

  if(reward.skinId){
    const armor=cosmetics.getSkin(reward.skinId);if(!armor)return cosmeticShopError(ws,'Código sin recompensa de skin válida.');
    unlockedSkin=armor.id;if(!p.ownedSkins.includes(armor.id))p.ownedSkins.push(armor.id);p.equippedSkin=armor.id;
  }

  if (reward.weaponId) {
    const weapon = String(reward.weaponId);
    if (!WEAPONS[weapon]) return cosmeticShopError(ws, 'Código sin recompensa de arma válida.');
    unlockedWeapon = weapon;
    if (!p.ownedWeapons.includes(weapon)) p.ownedWeapons.push(weapon);
    p.weapon = weapon;
  }

  if (reward.weaponSkinId) {
    const weaponSkin = cosmetics.getWeaponSkin(reward.weaponSkinId);
    if (!weaponSkin) return cosmeticShopError(ws, 'Código sin recompensa de skin de arma válida.');
    if (!p.ownedWeapons.includes(weaponSkin.weaponId)) p.ownedWeapons.push(weaponSkin.weaponId);
    p.weapon = weaponSkin.weaponId;
    unlockedWeaponSkin = weaponSkin.id;
    if (!p.ownedWeaponSkins.includes(weaponSkin.id)) p.ownedWeaponSkins.push(weaponSkin.id);
    p.equippedWeaponSkin = weaponSkin.id;
  }

  if (!reward.allSkins && !reward.allWeapons && !reward.allItems && !unlockedSkin && !unlockedWeapon && !unlockedWeaponSkin) {
    return cosmeticShopError(ws, 'El código no tiene una recompensa válida.');
  }

  if (!reward.repeatable) p.redeemedCodes.push(code);

  p.ownedSkins = cosmetics.normalizeOwnedSkins(p.ownedSkins);
  p.ownedWeapons = normalizeOwnedWeapons(p.ownedWeapons, p.weapon || '');
  p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(p.ownedWeaponSkins);
  applyCombatStats(p);
  await persistPlayer(p);

  const totalUnlocked=unlockedSkins.length+unlockedWeapons.length;
  const message=reward.allSkins||reward.allWeapons||reward.allItems?reward.message+' ('+totalUnlocked+' objetos disponibles para probar).':reward.message;
  sendCosmeticState(p,message,unlockedSkin,unlockedWeapon,unlockedWeaponSkin);sendStats(p);
  sendPlayerList(p.room);
}
function buyPremiumItemStub(ws, sku) {
  const offer = cosmetics.REAL_MONEY_OFFERS.find((item) => item.sku === String(sku || ''));
  send(ws, {
    type: 'premium_purchase_result',
    ok: false,
    enabled: false,
    sku: offer?.sku || '',
    priceUsd: Number(offer?.priceUsd) || 1,
    message: offer
      ? 'SOBERANO DEL NÚCLEO · $1 USD. El cobro real todavía no está conectado; usa el código de regalo de prueba.'
      : 'Producto premium no disponible.'
  });
}

async function depositBank(ws) {
  send(ws, {
    type: 'bank_result',
    ok: false,
    enabled: false,
    message: 'Banco desactivado. Tus recursos y progreso se guardan automáticamente.'
  });
}

async function withdrawBank(ws) {
  send(ws, {
    type: 'bank_result',
    ok: false,
    enabled: false,
    message: 'Banco desactivado. Tus recursos y progreso se guardan automáticamente.'
  });
}

function handleShotV2(ws,cellX,cellY,requestedAngle,targetId,isSpecial=false){
  const p=clients.get(ws);if(!p||!p.room||!p.alive)return;
  const sword=WEAPONS[p.weapon]||WEAPONS.sword_neo,now=Date.now();
  const special=!!isSpecial;
  if(special){
    if(now-(p.lastSpecialAt||0)<SPECIAL_COOLDOWN_MS)return send(ws,{type:'melee_result',ok:false,reason:'special_cooldown',cooldown:SPECIAL_COOLDOWN_MS});
    if((Number(p.fatigue)||0)<SPECIAL_ATTACK_FATIGUE)return send(ws,{type:'melee_result',ok:false,reason:'fatigue',fatigue:p.fatigue,maxFatigue:MAX_FATIGUE});
  }else if(now-(p.lastShot||0)<Math.max(MELEE_COOLDOWN_MS,Number(sword.fireRate)||650)){
    return send(ws,{type:'melee_result',ok:false,reason:'cooldown'});
  }
  const room=rooms.get(p.room);if(!room)return;
  const cx=Math.round(Number.isFinite(Number(cellX))?Number(cellX):gridCell(p.x)),cy=Math.round(Number.isFinite(Number(cellY))?Number(cellY):gridCell(p.y));
  const px=gridCell(p.x),py=gridCell(p.y);
  if(Math.abs(cx-px)+Math.abs(cy-py)>1)return send(ws,{type:'melee_result',ok:false,reason:'not_adjacent'});

  if(special)p.lastSpecialAt=now; else p.lastShot=now;
  p.angle=Number.isFinite(Number(requestedAngle))?Number(requestedAngle):p.angle;
  applyCombatStats(p);

  const enemies=ensureRoomEnemies(p.room);
  const requestedTarget=String(targetId||"");
  let targetEnemy=requestedTarget?enemies.find(e=>e&&!e.dead&&e.kind!=='boss'&&String(e.id||'')===requestedTarget)||null:null;
  if(targetEnemy&&Math.abs(gridCell(targetEnemy.x)-px)+Math.abs(gridCell(targetEnemy.y)-py)>1)targetEnemy=null;
  if(!targetEnemy){
    for(const e of enemies){
      if(e.kind==='boss'||e.dead)continue;
      if(Math.abs(gridCell(e.x)-px)+Math.abs(gridCell(e.y)-py)<=1){targetEnemy=e;break;}
    }
  }

  const basicDamage=Math.max(1,Math.round(Number(p.meleeLevel||1)+Number(sword.power||0)));
  const specialDamage=Math.max(basicDamage+1,Math.round(basicDamage*2.2));
  const damage=special?specialDamage:basicDamage;
  let hit=false,hitX=p.x,hitY=p.y,hitTargetId='',hitTargets=[];
  if(special){
    for(const e of enemies){
      if(e.kind==='boss'||e.dead)continue;
      const ex=gridCell(e.x),ey=gridCell(e.y);
      if(Math.max(Math.abs(ex-px),Math.abs(ey-py))>1)continue;
      e.hp=clamp(e.hp-damage,0,e.maxHp);e.lastHitAt=now;hit=true;hitX=e.x;hitY=e.y;hitTargets.push(e.id);addDamageXp(p,MELEE_XP_PER_HIT);
      if(e.hp<=0){
        const reward=Math.max(1,Math.round(120+e.level*18));p.gold=(Number(p.gold)||0)+reward;p.kills=(Number(p.kills)||0)+1;p.xp=(Number(p.xp)||0)+Math.max(20,e.level*12);levelUpIfNeeded(p);despawnEnemy(p.room,e,'defeated');
      }
    }
  }else if(targetEnemy){
    targetEnemy.hp=clamp(targetEnemy.hp-damage,0,targetEnemy.maxHp);targetEnemy.lastHitAt=now;hit=true;hitX=targetEnemy.x;hitY=targetEnemy.y;hitTargetId=targetEnemy.id;hitTargets=[targetEnemy.id];addDamageXp(p,MELEE_XP_PER_HIT);
    // One successful hit activates defense training against this mob until it dies/disappears.
    p.defenseTrainingTargetId=String(targetEnemy.id||'');
    if(targetEnemy.hp<=0){
      const reward=Math.max(1,Math.round(120+targetEnemy.level*18));p.gold=(Number(p.gold)||0)+reward;p.kills=(Number(p.kills)||0)+1;p.xp=(Number(p.xp)||0)+Math.max(20,targetEnemy.level*12);levelUpIfNeeded(p);p.defenseTrainingTargetId='';despawnEnemy(p.room,targetEnemy,'defeated');
    }
  }

  let targetPlayer=null;
  for(const ws2 of room){
    const other=clients.get(ws2);if(!other||other===p||!other.alive||inSafeZone(other.x,other.y,24))continue;
    if(Math.abs(gridCell(other.x)-px)+Math.abs(gridCell(other.y)-py)<=1){targetPlayer={ws:ws2,p:other};break;}
  }
  if(targetPlayer&&!special){
    const actual=Math.max(1,Math.round(damage-Math.max(0,Number(targetPlayer.p.defense)||0)*.55));
    targetPlayer.p.hp=clamp(targetPlayer.p.hp-actual,0,maxHpForLevel(targetPlayer.p.level));hit=true;hitX=targetPlayer.p.x;hitY=targetPlayer.p.y;hitTargetId=targetPlayer.p.id;addDamageXp(p,MELEE_XP_PER_HIT);
    send(targetPlayer.ws,{type:'pvp_damage',amount:actual,hp:targetPlayer.p.hp,maxHp:maxHpForLevel(targetPlayer.p.level),attacker:p.name});
    if(targetPlayer.p.hp<=0&&targetPlayer.p.alive&&!targetPlayer.p.frozen)markPlayerDead(targetPlayer.p);
  }

  if(special)p.fatigue=clamp((Number(p.fatigue)||0)-SPECIAL_ATTACK_FATIGUE,0,MAX_FATIGUE);
  send(ws,{type:'melee_result',ok:true,hit,targetId:hitTargetId,targets:hitTargets,damage,isCombo:special,special, fatigue:p.fatigue,maxFatigue:MAX_FATIGUE,meleeLevel:p.meleeLevel,x:hitX,y:hitY});
  broadcastRoom(p.room,{type:'melee_effect',attackerId:p.id,x:p.x,y:p.y,angle:p.angle,sword:p.weapon,hit,hitX,hitY,isCombo:special,special,targets:hitTargets});
  sendStats(p);if(targetPlayer)sendStats(targetPlayer.p);
}

function createPlayer(ws) {
  const id = Math.random().toString(36).slice(2, 10);

  const player = {
    id,
    name: '',
    nameLocked: false,
    accountId: '',
    accountTokenHash: '',
    saveKey: '',
    x: SAFE_ZONE.x,
    y: SAFE_ZONE.y,
    angle: 0,
    hp: 100,
    level: 1,
    damage: 141,
    power: 140,
    defense: 0,
    damagePenalty: 0,
    defensePenalty: 0,
    fireRate: 650,
    score: 0,
    kills: 0,
    xp: 0,
    damageXp: 0,
    defenseXp: 0,
    pvpKills: 0,
    gold: 0,
    diamonds: 0,
    bankedGold: 0,
    bankedDiamonds: 0,
    ownedSkins: cosmetics.normalizeOwnedSkins([]),
    equippedSkin: 'core_default',
    ownedSkins: [],
    equippedSkin: '',
    ownedWeapons: ['sword_neo'],
    equippedWeaponSkin: '',
    ownedWeaponSkins: [],
    redeemedCodes: [],
    inventory: emptyInventory(),
    ammo: 0,
    starterAmmoGranted: false,
    meleeXp: 0,
    meleeLevel: 1,
    fatigue: MAX_FATIGUE,
    maxFatigue: MAX_FATIGUE,
    defenseTrainingTargetId: '',
    lastSpecialAt: 0,
    powerAttackBonus: 0,
    weapon: 'sword_neo',
    color: '#39e7ff',
    room: '',
    alive: true,
    frozen: false,
    lastShot: Date.now() + 180,
    speed: 225,
    lastStateAt: Date.now(),
    stateViolations: 0,
    lastChatAt: 0,
    lastPersistAt: 0,
    lastEnemySyncAt: 0,
    persistChain: Promise.resolve(),
    hasSaved: false,
    joined: false,
    googleSub: '',
    accountEmail: '',
    pendingGoogleAuth: false,
    pendingRoomMode: 'join',
    pendingRoomCode: '12345',
    ws
  };

  return player;
}

const recoveryAttemptsByIp = new Map();
function recoveryClientKey(req){const forwarded=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();return forwarded||String(req.socket?.remoteAddress||'unknown').slice(0,80);}
function recoveryAllowed(req){const key=recoveryClientKey(req),now=Date.now(),row=recoveryAttemptsByIp.get(key)||{start:now,count:0};if(now-row.start>10*60*1000){row.start=now;row.count=0;}row.count++;recoveryAttemptsByIp.set(key,row);return row.count<=12;}
function readRequestBody(req,maxBytes=1024){return new Promise((resolve,reject)=>{let size=0,body='';req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>maxBytes){reject(new Error('payload_too_large'));try{req.destroy();}catch{};return;}body+=chunk.toString('utf8');});req.on('end',()=>resolve(body));req.on('error',reject);});}

const httpServer = http.createServer(async (req, res) => {
  const pathname = String(req.url || '').split('?')[0];

  if (pathname === '/account/recover' && req.method === 'OPTIONS') {
    res.writeHead(204, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});
    return res.end();
  }

  if (pathname === '/account/recover' && req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    if(!recoveryAllowed(req)){res.writeHead(429,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({ok:false,reason:'rate_limited',message:'Demasiados intentos de recuperación. Intenta más tarde.'}));}
    try{
      await storage.ready;
      const body=JSON.parse(await readRequestBody(req));
      const recovered=await storage.recoverAccountByCode(String(body?.code||''));
      if(!recovered){res.writeHead(401,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({ok:false,reason:'invalid_code',message:'El código de recuperación no es válido.'}));}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({ok:true,accountId:recovered.accountId,name:recovered.name,accountToken:recovered.accountToken}));
    }catch(error){
      console.error('[ACCOUNT RECOVER HTTP]',error?.message||error);
      res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({ok:false,reason:'invalid_request',message:'Solicitud de recuperación inválida.'}));
    }
  }



  if (pathname === '/auth/google/config' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ok:Boolean(GOOGLE_CLIENT_ID),clientId:GOOGLE_CLIENT_ID}));
  }

  if (pathname === '/client') {
    try {
      const manifestClientPath = String(UNIFIED_RELEASE_MANIFEST.clientPath || '/NeonCore/neoncore/12345/V82/index.html').replace(/^\/NeonCore\//, '').replace(/^\/+/, '');
      const clientPath = path.join(__dirname, '..', manifestClientPath);
      const html = fs.readFileSync(clientPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(html);
    } catch (error) {
      res.writeHead(503, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end('Neon Core client temporarily unavailable.');
    }
  }

  if (pathname === '/rooms') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    return res.end(JSON.stringify({
      ok: true,
      version: SERVER_VERSION,
      maxPlayers: MAX_PLAYERS,
      rooms: PUBLIC_ROOMS.map((code) => ({
        code,
        players: roomPlayers(rooms.get(code)).length,
        maxPlayers: MAX_PLAYERS
      }))
    }));
  }

  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });

    return res.end(
      JSON.stringify({
        ok: true,
        game: 'Neon Core',
        players: clients.size,
        rooms: rooms.size,
        pvp: true,
        version: SERVER_VERSION,
        releaseId: RELEASE_ID,
        clientVersion: String(UNIFIED_RELEASE_MANIFEST.clientVersion || RELEASE_ID),
        startedAt: SERVER_STARTED_AT,
        storage: storage.enabled ? 'postgres' : 'memory',
        databaseReleaseId: String(storage.releaseInfo?.releaseId || ''),
        databaseSchema: Number(storage.releaseInfo?.schemaVersion) || DATABASE_SCHEMA_VERSION,
        databaseUpdatedAt: Number(storage.releaseInfo?.updatedAt) || 0,
        status: 'online',
        diagnostics: {
          rooms: rooms.size,
          players: clients.size,
          publicRooms: PUBLIC_ROOMS.length,
          walls: WORLD_WALLS.length,
          enemyTarget: MOB_TARGET_COUNT + ELITE_TARGET_COUNT + 1,
          eliteTarget: ELITE_TARGET_COUNT,
          bossTarget: 1,
          bankEnabled: BANK_ENABLED,
          storageConfigured: Boolean(process.env.DATABASE_URL),
          storageReady: storage.enabled
        }
      })
    );
  }

  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Not Found');
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: 16 * 1024
});

wss.on('connection', async (ws) => {
  const player = createPlayer(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  clients.set(ws, player);

  try {
    await storageReady;
  } catch {}

  send(ws, {
    type: 'connected',
    id: player.id,
    releaseId: RELEASE_ID,
    clientVersion: String(UNIFIED_RELEASE_MANIFEST.clientVersion || RELEASE_ID),
    databaseReleaseId: String(storage.releaseInfo?.releaseId || ''),
    databaseSchema: Number(storage.releaseInfo?.schemaVersion) || DATABASE_SCHEMA_VERSION,
    startedAt: SERVER_STARTED_AT
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const p = clients.get(ws);

      if (!p || !msg || typeof msg.type !== 'string') return;

      if (msg.type === 'join') {
        if (p.joined) {
          send(ws, { type: 'room_error', message: 'Esta conexión ya está vinculada a una partida.' });
          return;
        }

        const requestedName=normalizeAccountName(msg.name||'Jugador')||'Jugador';
        const googleIdToken=String(msg.googleIdToken||'').trim();
        if(!googleIdToken){send(ws,{type:'room_error',reason:'google_required',message:'Debes iniciar sesión con Google para entrar a NeonCore.'});return;}
        const googleAccount=await authenticateGoogleAccount(googleIdToken);
        if(!googleAccount?.ok){send(ws,{type:'room_error',reason:'google_invalid',message:googleAccount?.reason==='not_configured'?'Google aún no está configurado en el servidor.':'No se pudo validar tu cuenta de Google.'});return;}
        const legacySaveKey=String(msg.saveKey||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
        const accountToken=sanitizeAccountToken(msg.accountToken);
        let account;
        try{account=googleAccount;account.accountToken=String(account.accountToken||'');}
        catch(error){
          console.error('[ACCOUNT AUTH]',error?.stack||error);
          send(ws,{type:'room_error',reason:'account_error',message:'No se pudo validar la cuenta. Intenta de nuevo.'});return;
        }
        if(!account?.ok){
          const accountMessages={
            account_invalid:'La credencial de cuenta no es válida. No se creará otra cuenta automáticamente.',
            name_reserved:'Ese nombre está reservado por Neon Core.',
            name_taken:'Ese nombre ya está ocupado. Elige otro nombre.',
            storage_error:'No se pudo guardar la cuenta. Intenta de nuevo.'
          };
          send(ws,{type:'room_error',reason:account.reason||'account_error',message:accountMessages[account.reason]||'No se pudo crear o validar la cuenta.'});return;
        }
        p.accountId=String(account.accountId||'').slice(0,96);
        p.googleSub=String(account.googleSub||'').slice(0,128);
        p.accountEmail=String(account.email||'').slice(0,254);
        p.accountToken=String(account.accountToken||'').slice(0,128);
        p.saveKey=String(account.playerSaveKey||p.accountId||'').slice(0,96);
        p.name=normalizeAccountName(account.name||requestedName)||'Jugador';

        for(const [oldWs,oldP] of clients){
          if(oldWs===ws||!oldP?.accountId||oldP.accountId!==p.accountId)continue;
          try{oldP.frozen=true;}catch{}
          try{if(oldP.room)await leaveRoom(oldWs);else await persistPlayer(oldP);}catch(error){console.error('[WS ACCOUNT SESSION REPLACE]',error?.message||error);}
          clients.delete(oldWs);try{oldWs.close(4001,'replaced_account_session');}catch{}
        }

        const loadedProfile=await loadSavedPlayer(p.saveKey,'');
        let saved=loadedProfile?.data||null;
        p.migratedProfile=false;
        if(!saved&&account.created&&legacySaveKey&&legacySaveKey!==p.saveKey){
          try{
            const legacyProfile=await loadSavedPlayer(legacySaveKey,'');
            if(legacyProfile?.data){
              saved={...legacyProfile.data,accountId:p.accountId,name:p.name,nameLocked:true};
              p.migratedProfile=true;
              console.log('[ACCOUNT MIGRATION] Perfil legado vinculado a cuenta:',p.accountId);
            }
          }catch(error){console.error('[ACCOUNT MIGRATION LOAD]',error?.message||error);}
        }
        p.hasSaved=!!saved;

        if (saved) {
          const savedName = String(saved.name || '').trim().slice(0, NAME_MAX_LENGTH);
          if (savedName) p.name = savedName;
          p.nameLocked = true;
          p.accountId = p.accountId || String(saved.accountId || p.saveKey || '').slice(0, 96) || p.saveKey;

          // La posición nunca se persiste: cada nueva conexión empieza en la zona segura.
          p.level = clamp(Number(saved.level) || 1, 1, 1000);
          const savedHp = Number(saved.hp);
          p.hp = savedHp > 0 ? savedHp : maxHpForLevel(p.level);
          p.score = Number(saved.score) || 0;
          p.kills = Number(saved.kills) || 0;
          p.xp = Number(saved.xp) || 0;
          p.damageXp = Math.max(0, Number(saved.damageXp) || 0);
          p.defenseXp = Math.max(0, Number(saved.defenseXp) || 0);
          p.pvpKills = Number(saved.pvpKills) || 0;
          p.gold = Math.max(0, Number(saved.gold) || 0);
          p.diamonds = Math.max(0, Number(saved.diamonds) || 0);
          p.equippedBackpack = saved.equippedBackpack===BACKPACK_ITEM_ID ? BACKPACK_ITEM_ID : '';
          if(Array.isArray(saved.inventory)){p.inventory=normalizeInventory(saved.inventory,inventoryCapacity(p));}else{p.inventory=emptyInventory(inventoryCapacity(p));}
          p.bankedGold = Math.max(0, Number(saved.bankedGold) || 0);
          p.bankedDiamonds = Math.max(0, Number(saved.bankedDiamonds) || 0);
          const legacyOwnedSkins=Array.isArray(saved.ownedSkins)?saved.ownedSkins:[];
          const legacyArmorIds=legacyOwnedSkins.filter(id=>cosmetics.getSkin(id));
          p.ownedSkins=cosmetics.normalizeOwnedSkins(legacyOwnedSkins);
          p.equippedSkin=(cosmetics.getSkin(saved.equippedSkin)&&p.ownedSkins.includes(saved.equippedSkin))?saved.equippedSkin:'pixel_human';
          if(p.equippedSkin==='core_default')p.equippedSkin='pixel_human';
          p.ownedSkins=cosmetics.normalizeOwnedSkins([...(Array.isArray(saved.ownedSkins)?saved.ownedSkins:[]),...legacyArmorIds]);
          p.equippedSkin=cosmetics.getSkin(saved.equippedSkin)?.id||(cosmetics.getSkin(saved.equippedSkin)?.id||'');
          p.redeemedCodes = cosmetics.normalizeRedeemedCodes(saved.redeemedCodes);
          p.ownedWeapons = normalizeOwnedWeapons(saved.ownedWeapons, saved.weapon || '');
          p.weapon = WEAPONS[saved.weapon] ? saved.weapon : 'sword_neo';
          p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(saved.ownedWeaponSkins);
          p.equippedWeaponSkin = cosmetics.getWeaponSkin(saved.equippedWeaponSkin) && p.ownedWeaponSkins.includes(saved.equippedWeaponSkin) ? saved.equippedWeaponSkin : '';
          p.inventory=normalizeInventory(p.inventory,inventoryCapacity(p));
          const legacyItems=[...(p.ownedWeapons||[]),...(p.ownedSkins||[])];
          for(const legacyId of legacyItems){
            const def=getItemDefinition(legacyId);
            if(!def||def.category==='consumable')continue;
            if(legacyId===p.weapon||legacyId===p.equippedSkin)continue;
            if(inventoryTotal(p,legacyId)>0)continue;
            addInventoryItem(p,legacyId,1);
          }
          syncOwnedCollections(p);
          p.damagePenalty = Math.max(0, Number(saved.damagePenalty) || 0);
          p.defensePenalty = Math.max(0, Number(saved.defensePenalty) || 0);
        }

        if (!saved) { p.name = ''; p.nameLocked = false; }

        if (msg.color) {
          const color = String(msg.color);
          p.color = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#39e7ff';
        }
        applyCombatStats(p);
        p.joined = true;

        send(ws,{type:'account_authenticated',accountId:p.accountId,name:p.name||'',nameLocked:!!p.nameLocked,created:!!account.created,accountToken:String(account.accountToken||''),recoveryCode:'',googleEmail:p.accountEmail,needsName:!p.name||/^Cuenta-/.test(String(p.name))});
        if(!saved){p.pendingGoogleAuth=true;p.pendingRoomMode=msg.createRoom?'create':(msg.room?'join':'quick');p.pendingRoomCode=String(msg.room||'12345').slice(0,5);}


        if (msg.room) {
          await joinRoom(ws, msg.room, false);
        } else if (msg.createRoom) {
          await joinRoom(ws, '', true);
        } else {
          await joinRoom(ws, 'OPEN', false);
        }

        if (account.created || !saved || p.migratedProfile) {
          await persistPlayer(p);
          p.migratedProfile = false;
        }

        if (p.room) {
          broadcastRoom(
            p.room,
            {
              type: 'player_update',
              player: publicPlayer(p)
            },
            ws
          );
          sendPlayerList(p.room);
        }

        // Cada conexión recibe la versión vigente del servidor. Esto permite
        // que una pestaña antigua se actualice sola aunque GitHub Pages aún
        // tenga una copia en caché del HTML anterior.
        send(ws, {
          type: 'server_update_notice',
          serverVersion: SERVER_VERSION,
          version: SERVER_VERSION,
          clientVersion: String(UNIFIED_RELEASE_MANIFEST.clientVersion || RELEASE_ID),
          releaseId: RELEASE_ID,
          serverStartedAt: SERVER_STARTED_AT,
          message: SERVER_UPDATE_MESSAGE,
          required: true,
          clientPath: String(UNIFIED_RELEASE_MANIFEST.clientPath || '/neoncore/12345/V82/index.html')
        });

        return;
      }

      if (msg.type === 'change_name') {
        if(p.pendingGoogleAuth&&!String(p.name||'').trim()){
          const result=await finalizeNewAccountName(p,msg.name);
          if(!result.ok){send(ws,{type:'name_result',ok:false,reason:result.reason,message:result.reason==='name_taken'?'Ese nombre ya está ocupado.':result.reason==='name_reserved'?'Ese nombre está reservado.':'El nombre debe tener al menos 2 caracteres.'});return;}
          p.pendingGoogleAuth=false;p.hasSaved=false;p.nameLocked=true;p.name=normalizeAccountName(msg.name);applyCombatStats(p);await persistPlayer(p);send(ws,{type:'name_result',ok:true,name:p.name,free:true});sendPlayerList(p.room);return;
        }
        if(!p.frozen) await changePlayerName(ws,msg.name);
        return;
      }

      if (msg.type === 'set_name') {
        if(!p.pendingGoogleAuth)return;
        const result=await finalizeNewAccountName(p,msg.name);
        if(!result.ok){send(ws,{type:'name_result',ok:false,reason:result.reason,message:result.reason==='name_taken'?'Ese nombre ya está ocupado.':result.reason==='name_reserved'?'Ese nombre está reservado.':'El nombre debe tener al menos 2 caracteres.'});return;}
        p.pendingGoogleAuth=false;p.hasSaved=false;p.nameLocked=true;p.name=normalizeAccountName(msg.name);applyCombatStats(p);await persistPlayer(p);send(ws,{type:'name_result',ok:true,name:p.name,free:true});sendPlayerList(p.room);return;
      }

      if (msg.type === 'chat') {
        if (!p.room || p.frozen) return;

        const now = Date.now();
        if (now - (p.lastChatAt || 0) < 700) return;

        const text = String(msg.text || '')
          .replace(/[\u0000-\u001F\u007F]/g, ' ')
          .trim()
          .slice(0, 120);

        if (!text) return;

        // Server chat command: the permanent master test code is intentionally usable here.
        const commandMatch=text.match(/^\/code\s+([A-Z0-9_-]+)$/i);
        if(commandMatch){
          await redeemCosmeticCode(ws,commandMatch[1],true);
          return;
        }

        p.lastChatAt = now;
        broadcastRoom(p.room, {
          type: 'chat',
          id: p.id,
          name: p.name,
          text,
          at: now
        });

        return;
      }

      if (msg.type === 'create_room') {
        await joinRoom(ws, '', true);
        return;
      }

      if (msg.type === 'join_room') {
        await joinRoom(ws, msg.code, false);
        return;
      }

      if (msg.type === 'state') {
        if (!p.room || p.frozen || !p.alive) return;

        const nx = Number.isFinite(Number(msg.x)) ? Number(msg.x) : p.x;
        const ny = Number.isFinite(Number(msg.y)) ? Number(msg.y) : p.y;
        const now = Date.now();

        const elapsed = Math.max(
          0.05,
          Math.min(1, (now - p.lastStateAt) / 1000)
        );

        const distance = Math.hypot(nx - p.x, ny - p.y);
        const maxDistance = Math.max(60, p.speed * elapsed + 45);

        // El cliente puede avanzar localmente mientras un paquete tarda en llegar.
        // En vez de congelarlo o expulsarlo por una ráfaga de latencia, limitamos
        // el paso al máximo permitido y sincronizamos la posición aceptada.
        let acceptedX = nx;
        let acceptedY = ny;
        let movementClamped = false;

        if (distance > maxDistance) {
          const ratio = maxDistance / Math.max(distance, 0.0001);
          acceptedX = p.x + (nx - p.x) * ratio;
          acceptedY = p.y + (ny - p.y) * ratio;
          movementClamped = true;
        }

        const walls = ensureRoomWalls(p.room);

        // Resolver el movimiento por ejes. Si el destino completo choca con una
        // pared, conservamos el eje libre para evitar que una colisión diagonal
        // deje al jugador completamente inmóvil.
        let finalX = acceptedX;
        let finalY = acceptedY;
        let blockedX = false;
        let blockedY = false;

        if (collidesWithWall(finalX, finalY, 16, walls)) {
          if (collidesWithWall(finalX, p.y, 16, walls)) {
            finalX = p.x;
            blockedX = true;
          }
          if (collidesWithWall(finalX, finalY, 16, walls)) {
            if (collidesWithWall(p.x, finalY, 16, walls)) {
              finalY = p.y;
              blockedY = true;
            }
          }
        }

        // Si por alguna geometría el destino sigue dentro de una pared, no
        // aceptamos ese paquete, pero tampoco teletransportamos al jugador.
        if (collidesWithWall(finalX, finalY, 16, walls)) {
          finalX = p.x;
          finalY = p.y;
          blockedX = true;
          blockedY = true;
        }

        p.stateViolations = Math.max(0, p.stateViolations - 1);
        p.lastStateAt = now;
        // V82: una cuenta Google sin nombre permanece dentro de la zona segura.
        if(!p.nameLocked && !String(p.name||'').trim()){
          const dx=finalX-SAFE_ZONE.x,dy=finalY-SAFE_ZONE.y,d=Math.hypot(dx,dy),limit=Math.max(0,SAFE_ZONE.r-18);
          if(d>limit){const k=limit/Math.max(d,0.0001);finalX=SAFE_ZONE.x+dx*k;finalY=SAFE_ZONE.y+dy*k;movementClamped=true;}
        }
        p.x = clamp(finalX, 35, WORLD.w - 35);
        p.y = clamp(finalY, 35, WORLD.h - 35);

        const correctionDistance = Math.hypot(p.x - nx, p.y - ny);
        if (movementClamped || blockedX || blockedY || correctionDistance > 48) {
          send(ws, {
            type: 'state_sync',
            x: p.x,
            y: p.y,
            reason: blockedX || blockedY ? 'wall' : 'movement_clamped',
            serverTime: now
          });
        }

        if (Number.isFinite(Number(msg.angle))) {
          const angle = Number(msg.angle);
          if (Math.abs(angle) <= Math.PI * 4) {
            p.angle = Math.atan2(Math.sin(angle), Math.cos(angle));
          }
        }

        if (now - (p.lastPlayerBroadcastAt || 0) >= PLAYER_BROADCAST_MS) {
          p.lastPlayerBroadcastAt = now;
          broadcastRoom(
            p.room,
            {
              type: 'player_update',
              player: publicPlayer(p)
            },
            ws
          );
        }

        return;
      }

      if (msg.type === 'equip_inventory_item') {
        if (!p.frozen) handleEquipInventory(ws,msg.slotIndex);
        return;
      }
      if (msg.type === 'unequip_equipment') {
        if (!p.frozen) handleUnequipEquipment(ws,msg.slot);
        return;
      }
      if (msg.type === 'sell_inventory_item') {
        if (!p.frozen) sellInventoryItem(ws,msg.slotIndex,msg.qty);
        return;
      }
      if (msg.type === 'buy_item') {
        if (!p.frozen) buyShopItem(ws,msg.itemId);
        return;
      }
      if (msg.type === 'open_item_shop') {
        if (!p.frozen) sendItemShopState(p,'Items disponibles y venta de inventario.',true);
        return;
      }

      if (msg.type === 'open_inventory') {
        if (!p.frozen) sendInventoryState(p);
        return;
      }
      if (msg.type === 'drop_inventory_item') {
        if (!p.frozen) dropInventoryItem(ws, msg.slotIndex);
        return;
      }
      if (msg.type === 'pickup_nearby') {
        if (!p.frozen) pickupNearby(ws);
        return;
      }

      if (msg.type === 'melee_attack') { if (!p.frozen) handleShotV2(ws,msg.cellX,msg.cellY,msg.angle,msg.targetId,!!msg.special); return; }
      if (msg.type === 'grid_state') { if(!p.room||p.frozen||!p.alive)return; const cx=Number.isFinite(Number(msg.cellX))?Number(msg.cellX):gridCell(p.x),cy=Number.isFinite(Number(msg.cellY))?Number(msg.cellY):gridCell(p.y); const nx=clamp(gridCenter(cx),MELEE_GRID_HALF,WORLD.w-MELEE_GRID_HALF),ny=clamp(gridCenter(cy),MELEE_GRID_HALF,WORLD.h-MELEE_GRID_HALF); const dist=Math.hypot(nx-p.x,ny-p.y); if(dist<=MELEE_GRID_SIZE*1.45){p.x=nx;p.y=ny;if(Number.isFinite(Number(msg.angle)))p.angle=Number(msg.angle);p.lastStateAt=Date.now();broadcastRoom(p.room,{type:'player_update',player:publicPlayer(p)},ws);} return; }
      if (msg.type === 'fire') { return; }

      if (msg.type === 'deposit_bank') {
        if (!p.frozen) await depositBank(ws);
        return;
      }

      if (msg.type === 'withdraw_bank') {
        if (!p.frozen) await withdrawBank(ws);
        return;
      }

            if (msg.type === 'buy_weapon') {
        if (!p.frozen) buyShopItem(ws, msg.weapon);
        return;
      }

      if (msg.type === 'buy_weapon_skin') {
        if (!p.frozen) buyWeaponSkin(ws, msg.skinId);
        return;
      }

      if (msg.type === 'equip_weapon_skin') {
        if (!p.frozen) equipWeaponSkin(ws, msg.skinId);
        return;
      }

      if (msg.type === 'open_cosmetic_shop') {
        if (!p.frozen) sendCosmeticState(p);
        return;
      }

      if (msg.type === 'buy_skin') {
        if (!p.frozen) buyCosmeticSkin(ws, msg.skinId);
        return;
      }

      if (msg.type === 'equip_skin') {
        if (!p.frozen) equipCosmeticSkin(ws, msg.skinId);
        return;
      }

      if (msg.type === 'buy_armor') {
        if (!p.frozen) buyShopItem(ws, msg.armorId);
        return;
      }

      if (msg.type === 'equip_armor') {
        if (!p.frozen) equipCosmeticSkin(ws, msg.armorId);
        return;
      }

      if (msg.type === 'redeem_code') {
        if (!p.frozen) await redeemCosmeticCode(ws, msg.code);
        return;
      }

      if (msg.type === 'buy_premium_item') {
        if (!p.frozen) buyPremiumItemStub(ws, msg.sku);
        return;
      }

      if (msg.type === 'save_on_exit') {
        if (!p.room || !p.saveKey) return;
        p.exitSaveRequested = true;
        await persistPlayer(p);
        send(ws, { type: 'save_complete', savedAt: Date.now() });
        return;
      }

      if (msg.type === 'respawn') {
        if (!p.room || p.alive) return;

        const spawn = spawnPosition(p.room);

        p.x = spawn.x;
        p.y = spawn.y;
        p.angle = 0;
        p.alive = true;
        p.frozen = false;
        const checkpoint = null;

        if (checkpoint) {
          p.x = Number.isFinite(Number(checkpoint.x)) ? Number(checkpoint.x) : p.x;
          p.y = Number.isFinite(Number(checkpoint.y)) ? Number(checkpoint.y) : p.y;
          p.level = clamp(Number(checkpoint.level) || 1, 1, 1000);
          p.hp = Number(checkpoint.hp) > 0 ? Number(checkpoint.hp) : maxHpForLevel(p.level);
          p.score = Number(checkpoint.score) || 0;
          p.kills = Number(checkpoint.kills) || 0;
          p.xp = Number(checkpoint.xp) || 0;
          p.pvpKills = Number(checkpoint.pvpKills) || 0;
          p.gold = Math.max(0, Number(checkpoint.gold) || 0);
          p.diamonds = Math.max(0, Number(checkpoint.diamonds) || 0);
          p.weapon = WEAPONS[checkpoint.weapon] ? checkpoint.weapon : 'sword_neo';
        } else {
          p.hp = maxHpForLevel(p.level);
        }

        p.lastShot = 0;
        applyCombatStats(p);

        await persistPlayer(p);

        send(ws, {
          type: 'respawn_ok',
          x: p.x,
          y: p.y,
          hp: p.hp,
          maxHp: maxHpForLevel(p.level),
          speed: p.speed,
          weapon: p.weapon,
          enemies: ensureRoomEnemies(p.room),
          walls: ensureRoomWalls(p.room),
          safeZone: SAFE_ZONE,
          spawnProtectionMs: 5000
        });

        sendStats(p);
        broadcastRoom(p.room, {
          type: 'player_update',
          player: publicPlayer(p)
        }, ws);
        sendPlayerList(p.room);
      }
    } catch (error) {
      console.error('[WS MESSAGE]', error?.stack || error);
      try {
        send(ws, {
          type: 'server_error',
          message: 'El servidor rechazó una operación inválida.'
        });
      } catch {}
    }
  });

  ws.on('close', () => {
    void (async () => {
      try {
        const current = clients.get(ws);
        if (current?.saveKey) await persistPlayer(current);
        await leaveRoom(ws);
      } catch (error) {
        console.error('[WS CLOSE]', error?.message || error);
      } finally {
        clients.delete(ws);
      }
    })();
  });

  ws.on('error', (error) => {
    console.error('[WS ERROR]', error?.message || error);
  });
});

// V82: servidor autoritativo de cuadrícula. Los enemigos regulares avanzan casilla por casilla y se detienen a una casilla del objetivo.
setInterval(()=>{for(const [code,room] of rooms){if(!room||!room.size)continue;const enemies=roomEnemies.get(code)||[];const players=roomPlayers(room).filter(p=>p.alive&&!p.frozen);for(const e of enemies){if(e.kind==='boss'||e.dead)continue;let target=null,best=Infinity;for(const pl of players){if(inSafeZone(pl.x,pl.y,24))continue;const d=Math.hypot(pl.x-e.x,pl.y-e.y);if(d<=e.aggroRadius&&d<best){best=d;target=pl;}}if(target){const tcx=Math.round(target.x/MELEE_GRID_SIZE),tcy=Math.round(target.y/MELEE_GRID_SIZE),ecx=Math.round(e.x/MELEE_GRID_SIZE),ecy=Math.round(e.y/MELEE_GRID_SIZE);if(Math.abs(tcx-ecx)+Math.abs(tcy-ecy)<=1){e.x=egridCenter(cx);e.y=egridCenter(cy);e.vx=0;e.vy=0;} }}}},180);

startServerUpdateHeartbeat();

const storageReady = storage.initStorage(RELEASE_ID, DATABASE_SCHEMA_VERSION).catch((error) => {
  console.error('[STORAGE INIT]', error?.stack || error);
  return false;
});

storage.ready = storageReady;

setInterval(() => {
  for (const code of roomDrops.keys()) cleanupDrops(code);
  const now = Date.now();
  const dt = TICK_MS / 1000;

  for (const p of clients.values()) {
    if (!p.room || !p.alive || p.frozen) continue;

    const maxHp = maxHpForLevel(p.level);

    if (p.hp < maxHp) {
      const safe = inSafeZone(p.x, p.y, 24);
      const regenPerSecond = safe ? SAFE_ZONE_HP_REGEN_PER_SEC : HP_REGEN_PER_SEC;
      p.hp = Math.min(maxHp, p.hp + regenPerSecond * dt);

      if (now - (p.lastRegenBroadcastAt || 0) >= HP_REGEN_BROADCAST_MS) {
        p.lastRegenBroadcastAt = now;
        send(p.ws, {
          type: 'hp_regen',
          hp: p.hp,
          maxHp,
          safeZone: safe,
          regenPerSecond
        });
      }
    }

    const fatigueBefore=Math.max(0,Number(p.fatigue)||0);
    p.fatigue=Math.min(MAX_FATIGUE,fatigueBefore+FATIGUE_REGEN_PER_SEC*dt);
    if(Math.abs(p.fatigue-fatigueBefore)>.01 && now-(p.lastFatigueBroadcastAt||0)>=250){
      p.lastFatigueBroadcastAt=now;
      send(p.ws,{type:'fatigue_update',fatigue:p.fatigue,maxFatigue:MAX_FATIGUE,comboCount:Number(p.comboCount)||0});
    }
    if(Number(p.comboExpiresAt||0)>0 && now>Number(p.comboExpiresAt||0))p.comboCount=0;

    if (p.saveKey && now - p.lastPersistAt >= AUTOSAVE_MS) {
      void persistPlayer(p);
    }
  }
}, TICK_MS);

setInterval(() => {
  const now = Date.now();
  const dt = TICK_MS / 1000;

  for (const [code, room] of rooms) {
    if (!room.size) continue;

    restoreDueWalls(code, true);
    restoreDueEnemies(code, true);

    const enemies = ensureRoomEnemies(code);
    const walls = ensureRoomWalls(code);
    const players = roomPlayers(room).filter((p) => p.alive && !p.frozen);
    const bossProjectiles = roomBossProjectiles.get(code) || [];
    const boss = enemies.find((enemy) => enemy.kind === 'boss');

    if (boss) {
      let target = null;
      let best = boss.aggroRadius;

      for (const pl of players) {
        if (inSafeZone(pl.x, pl.y, 24)) continue;
        const d = Math.hypot(pl.x - boss.x, pl.y - boss.y);
        if (d < best) {
          best = d;
          target = pl;
        }
      }

      if (target) {
        if (best > 220) {
          moveEnemyToward(boss, target.x, target.y, dt, walls);
          best = Math.hypot(target.x - boss.x, target.y - boss.y);
        }

        if (
          best <= BOSS_ATTACK_RANGE &&
          now - boss.lastBossShotAt >= BOSS_PROJECTILE_COOLDOWN_MS &&
          hasLineOfSight(boss.x, boss.y, target.x, target.y, walls)
        ) {
          boss.lastBossShotAt = now;

          // El Destructor fija un punto de impacto. El proyectil viaja hasta el
          // centro del círculo de advertencia y EXPLOTA ahí; no atraviesa ni
          // aplica daño de contacto a jugadores o mobs durante el trayecto.
          const targetCellX=Math.round(target.x/MELEE_GRID_SIZE),targetCellY=Math.round(target.y/MELEE_GRID_SIZE);
          const impactX=targetCellX*MELEE_GRID_SIZE,impactY=targetCellY*MELEE_GRID_SIZE;
          const distance = Math.max(1, Math.hypot(impactX - boss.x, impactY - boss.y));
          const travelTime = distance / BOSS_PROJECTILE_SPEED;

          const bossLevel=Number(boss.level)||1;
          const warning = {
            id: 'ba_' + Math.random().toString(36).slice(2, 10),
            x: impactX,
            y: impactY,
            r: BOSS_AOE_RADIUS,
            damage: BOSS_AOE_DAMAGE + Math.max(0,bossLevel-1)*8,
            telegraphAt: now,
            hitAt: now + Math.max(450, Math.min(BOSS_AOE_WARNING_MS, travelTime * 1000))
          };

          boss.lastBossAttackAt=now;
        bossProjectiles.push({
            id: 'bp_' + Math.random().toString(36).slice(2, 10),
            targetId: target.id,
            x: boss.x,
            y: boss.y,
            vx: ((impactX - boss.x) / distance) * BOSS_PROJECTILE_SPEED,
            vy: ((impactY - boss.y) / distance) * BOSS_PROJECTILE_SPEED,
            impactX,
            impactY,
            r: 18,
            damage: BOSS_PROJECTILE_DAMAGE + Math.max(0,bossLevel-1)*10,
            range: distance,
            life: travelTime,
            warning
          });
        }
      } else if (
        !boss.patrolUntil ||
        now >= boss.patrolUntil ||
        Math.hypot(boss.patrolTargetX - boss.x, boss.patrolTargetY - boss.y) < 20
      ) {
        choosePatrolTarget(boss, walls);
      }

      if (!target) moveEnemyToward(boss, boss.patrolTargetX, boss.patrolTargetY, dt, walls);

      if (boss.bossArea && now >= boss.bossArea.hitAt) {
        const warning = boss.bossArea;

        for (const pl of players) {
          if (inSafeZone(pl.x, pl.y, 24)) continue;
          const d = Math.hypot(pl.x - warning.x, pl.y - warning.y);

          if (d <= Math.max(0, warning.r - pl.r * 0.35)) {
            const actualDamage = Math.max(
              20,
              Math.round((Number(warning.damage) || BOSS_AOE_DAMAGE) - Math.max(0, Number(pl.defense) || 0) * 0.5)
            );

            pl.hp = clamp(pl.hp - actualDamage, 0, maxHpForLevel(pl.level));
            addDefenseXp(pl,Math.max(8,Math.round(actualDamage*4)));

            const found = findPlayer(pl.id, room);
            if (found) {
              send(found.ws, {
                type: 'boss_aoe_hit',
                amount: actualDamage,
                hp: pl.hp,
                maxHp: maxHpForLevel(pl.level),
                x: warning.x,
                y: warning.y
              });
            }

            if (pl.hp <= 0 && pl.alive && !pl.frozen) {
              const lostScore = pl.score || 0;
              markPlayerDead(pl);
              const foundTarget = findPlayer(pl.id, room);

              if (foundTarget) {
                send(foundTarget.ws, {
                  type: 'pve_dead',
                  x: pl.x,
                  y: pl.y,
                  lostScore,
                  hp: pl.hp,
                  maxHp: maxHpForLevel(pl.level),
                  ammo: pl.ammo,
                  xp: pl.xp,
                  gold: pl.gold,
                  damage: pl.damage,
                  defense: pl.defense,
                  level: pl.level
                });
                sendStats(pl);
                send(foundTarget.ws, {
                  type: 'respawn_ok',
                  x: pl.x,
                  y: pl.y,
                  hp: pl.hp,
                  maxHp: maxHpForLevel(pl.level),
                  speed: pl.speed,
                  weapon: pl.weapon,
                  ammo: pl.ammo,
                  level: pl.level,
                  xp: pl.xp,
                  safeZone: SAFE_ZONE,
                  spawnProtectionMs: 5000
                });
                broadcastRoom(code, {
                  type: 'player_update',
                  player: publicPlayer(pl)
                }, foundTarget.ws);
                sendPlayerList(code);
              }
            }
          }
        }

        boss.bossArea = null;
      }
    }

    for (let i = bossProjectiles.length - 1; i >= 0; i--) {
      const projectile = bossProjectiles[i];
      const previousX = projectile.x;
      const previousY = projectile.y;
      const nextX = projectile.x + projectile.vx * dt;
      const nextY = projectile.y + projectile.vy * dt;
      const travel = Math.hypot(nextX - previousX, nextY - previousY);
      const dirX = (nextX - previousX) / Math.max(0.0001, travel);
      const dirY = (nextY - previousY) / Math.max(0.0001, travel);

      let nearestWallDistance = Infinity;
      for (const wall of walls) {
        const wallHit = rayAabbDistance(previousX, previousY, dirX, dirY, wall);
        if (wallHit >= 0 && wallHit <= travel + projectile.r) {
          nearestWallDistance = Math.min(nearestWallDistance, wallHit);
        }
      }

      // Las paredes sí bloquean el disparo. Si no hay obstáculo, el proyectil
      // termina exactamente en el centro de su círculo de advertencia.
      const remainingToImpact = Math.hypot(
        (Number(projectile.impactX) || projectile.x) - previousX,
        (Number(projectile.impactY) || projectile.y) - previousY
      );

      if (nearestWallDistance <= travel + projectile.r && nearestWallDistance <= remainingToImpact) {
        projectile.x = previousX + dirX * Math.max(0, nearestWallDistance);
        projectile.y = previousY + dirY * Math.max(0, nearestWallDistance);
        broadcastRoom(code, {
          type: 'boss_explosion',
          x: projectile.x,
          y: projectile.y,
          r: BOSS_AOE_RADIUS,
          blocked: true
        });
        bossProjectiles.splice(i, 1);
        continue;
      }

      projectile.x = nextX;
      projectile.y = nextY;
      projectile.life -= dt;
      projectile.range = Math.max(0, Number(projectile.range) || BOSS_ATTACK_RANGE) - travel;

      if (
        projectile.life > 0 &&
        projectile.range > 0 &&
        Math.hypot(projectile.x - (Number(projectile.impactX) || projectile.x), projectile.y - (Number(projectile.impactY) || projectile.y)) > 12
      ) {
        continue;
      }

      // Explosión server-authoritative: SOLO afecta a jugadores dentro del área.
      // Los demás mobs nunca son candidatos de daño.
      const impactX = Number(projectile.impactX) || projectile.x;
      const impactY = Number(projectile.impactY) || projectile.y;
      projectile.x = impactX;
      projectile.y = impactY;
      const impactRadius = BOSS_AOE_RADIUS;

      broadcastRoom(code, {
        type: 'boss_explosion',
        x: impactX,
        y: impactY,
        r: impactRadius,
        blocked: false
      });

      for (const pl of players) {
        if (inSafeZone(pl.x, pl.y, 24)) continue;
        const d = Math.hypot(pl.x - impactX, pl.y - impactY);
        if (d > impactRadius) continue;

        const actualDamage = Math.max(
          25,
          Math.round((Number(projectile.damage) || BOSS_PROJECTILE_DAMAGE) - Math.max(0, Number(pl.defense) || 0) * 0.5)
        );

        pl.hp = clamp(pl.hp - actualDamage, 0, maxHpForLevel(pl.level));
        addDefenseXp(pl,Math.max(8,Math.round(actualDamage*4)));
        const found = findPlayer(pl.id, room);

        if (found) {
          send(found.ws, {
            type: 'boss_projectile_hit',
            amount: actualDamage,
            hp: pl.hp,
            maxHp: maxHpForLevel(pl.level),
            x: impactX,
            y: impactY,
            radius: impactRadius
          });
        }

        if (pl.hp <= 0 && pl.alive && !pl.frozen) {
          const lostScore = pl.score || 0;
          markPlayerDead(pl);

          const foundTarget = findPlayer(pl.id, room);
          if (foundTarget) {
            send(foundTarget.ws, {
              type: 'pve_dead',
                  x: pl.x,
                  y: pl.y,
                  lostScore,
                  hp: pl.hp,
                  maxHp: maxHpForLevel(pl.level),
                  ammo: pl.ammo,
              xp: pl.xp,
              gold: pl.gold,
              damage: pl.damage,
              defense: pl.defense,
              level: pl.level
            });
            sendStats(pl);
            send(foundTarget.ws, {
                  type: 'respawn_ok',
                  x: pl.x,
                  y: pl.y,
                  hp: pl.hp,
                  maxHp: maxHpForLevel(pl.level),
                  speed: pl.speed,
                  weapon: pl.weapon,
                  ammo: pl.ammo,
                  level: pl.level,
                  xp: pl.xp,
                  safeZone: SAFE_ZONE,
                  spawnProtectionMs: 5000
                });
                broadcastRoom(code, {
              type: 'player_update',
              player: publicPlayer(pl)
            }, foundTarget.ws);
            sendPlayerList(code);
          }
        }
      }

      bossProjectiles.splice(i, 1);
    }

    for (const enemy of [...enemies]) {
      if (enemy.kind === 'boss') continue;

      const fromHome = Math.hypot(enemy.x - enemy.homeX, enemy.y - enemy.homeY);
      if (fromHome > enemy.leashRadius) {
        despawnEnemy(code, enemy, 'leash');
        continue;
      }

      let target = null;
      let best = enemy.aggroRadius;

      for (const pl of players) {
        if (inSafeZone(pl.x, pl.y, 24)) continue;
        const d = Math.hypot(pl.x - enemy.x, pl.y - enemy.y);
        if (d <= best) {
          best = d;
          target = pl;
        }
      }

      if (target) {
        moveEnemyToward(enemy, target.x, target.y, dt, walls);

        if (
          best <= MELEE_GRID_SIZE*1.45 &&
          now - (enemy.lastAttackAt || 0) >= (enemy.attackCooldown || ENEMY_ATTACK_COOLDOWN_MS) &&
          hasLineOfSight(enemy.x, enemy.y, target.x, target.y, walls)
        ) {
          enemy.lastAttackAt = now;
          const actualDamage = Math.max(
            1,
            Math.round(Math.max(
              2,
              Number(enemy.damage) - Math.max(0, Number(target.defense) || 0) * 0.55
            ) * dt)
          );

          target.hp = clamp(target.hp - actualDamage, 0, maxHpForLevel(target.level));
          if(String(target.defenseTrainingTargetId||'')){
            const trainingMob=enemies.find(e=>e&&!e.dead&&String(e.id||'')===String(target.defenseTrainingTargetId||''));
            if(trainingMob) addDefenseXp(target,Math.max(4,Math.round(actualDamage*5)));
            else target.defenseTrainingTargetId='';
          }

          const found = findPlayer(target.id, room);
          if (found) {
            send(found.ws, {
              type: 'pve_damage',
              amount: actualDamage,
              hp: target.hp,
              maxHp: maxHpForLevel(target.level),
              defense: target.defense
            });
          }

          if (target.hp <= 0 && target.alive && !target.frozen) {
            const lostScore = target.score || 0;
            markPlayerDead(target);

            const foundTarget = findPlayer(target.id, room);
            if (foundTarget) {
              send(foundTarget.ws, {
                type: 'pve_dead',
                x: target.x,
                y: target.y,
                lostScore,
                hp: target.hp,
                maxHp: maxHpForLevel(target.level),
                ammo: target.ammo,
                xp: target.xp,
                gold: target.gold,
                damage: target.damage,
                defense: target.defense,
                level: target.level
              });
              sendStats(target);
              send(foundTarget.ws, {
                type: 'respawn_ok',
                x: target.x,
                y: target.y,
                hp: target.hp,
                maxHp: maxHpForLevel(target.level),
                speed: target.speed,
                weapon: target.weapon,
                ammo: target.ammo,
                level: target.level,
                xp: target.xp,
                safeZone: SAFE_ZONE,
                spawnProtectionMs: 5000
              });
              broadcastRoom(code, {
                type: 'player_update',
                player: publicPlayer(target)
              }, foundTarget.ws);
              sendPlayerList(code);
            }
          }
        }

        continue;
      }

      if (
        !enemy.patrolUntil ||
        now >= enemy.patrolUntil ||
        Math.hypot(enemy.patrolTargetX - enemy.x, enemy.patrolTargetY - enemy.y) < 18
      ) {
        choosePatrolTarget(enemy, walls);
      }

      if (Math.hypot(enemy.x - enemy.homeX, enemy.y - enemy.homeY) > enemy.areaRadius * 0.92) {
        moveEnemyToward(enemy, enemy.homeX, enemy.homeY, dt, walls);
      } else {
        moveEnemyToward(enemy, enemy.patrolTargetX, enemy.patrolTargetY, dt, walls);
      }
    }

    const droneCount = enemies.filter((enemy) => enemy.kind === 'drone').length;
    const eliteCount = enemies.filter((enemy) => enemy.kind === 'elite').length;
    const pendingDrones = pendingEnemyKindCount(code, 'drone');
    const pendingElites = pendingEnemyKindCount(code, 'elite');

    for (let i = droneCount + pendingDrones; i < MOB_TARGET_COUNT; i++) {
      enemies.push(createEnemy('drone'));
    }
    for (let i = eliteCount + pendingElites; i < ELITE_TARGET_COUNT; i++) {
      enemies.push(createEnemy('elite'));
    }
    if (!enemies.some((enemy) => enemy.kind === 'boss') && pendingEnemyKindCount(code, 'boss') === 0) {
      enemies.push(createEnemy('boss'));
    }

    roomBossProjectiles.set(code, bossProjectiles);

    const enemyState = enemies.map((e) => ({
      id:e.id,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,r:e.r,kind:e.kind,shape:e.shape,
      speed:e.speed,damage:e.damage,level:e.level,name:e.name,homeX:e.homeX,homeY:e.homeY,
      areaRadius:e.areaRadius,vx:e.vx,vy:e.vy,angle:e.angle,walkPhase:e.walkPhase,attackPulse:e.attackPulse
    }));
    broadcastRoom(code, {
      type: 'enemy_state',
      enemies: enemyState,
      bossProjectiles,
      bossWarnings: bossProjectiles.map(projectile => projectile.warning).filter(Boolean)
    });
  }
}, ENEMY_SYNC_MS);

function announceServerUpdate() {
  const payload = {
    type: 'server_update_notice',
    serverVersion: SERVER_VERSION,
    version: SERVER_VERSION,
    clientVersion: String(UNIFIED_RELEASE_MANIFEST.clientVersion || RELEASE_ID),
    releaseId: RELEASE_ID,
    serverStartedAt: SERVER_STARTED_AT,
    message: SERVER_UPDATE_MESSAGE,
    required: true,
    clientPath: String(UNIFIED_RELEASE_MANIFEST.clientPath || 'neoncore/12345/V82/index.html')
  };
  for (const p of clients.values()) {
    send(p.ws, payload);
  }
}

var serverUpdateHeartbeat = null;
function startServerUpdateHeartbeat() {
  if (serverUpdateHeartbeat) clearInterval(serverUpdateHeartbeat);
  // Old clients may already be inside a room when a new version goes live.
  // Keep announcing the current version so those clients can migrate without
  // a manual refresh. Current clients ignore notices for their own version.
  serverUpdateHeartbeat = setInterval(() => {
    if (clients.size > 0) announceServerUpdate();
  }, 30000);
}

async function gracefulShutdown(signal) {
  // Avisar antes de persistir/cerrar para que los jugadores conectados sepan
  // que el reinicio corresponde a una actualización del servidor.
  announceServerUpdate();
  await new Promise((resolve) => setTimeout(resolve, 350));

  for (const p of clients.values()) {
    await persistPlayer(p);
  }
  try {
    await storage.closeStorage();
  } catch {}
  process.exit(0);
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

function runServerDiagnostics() {
  const problems = [];
  if (WORLD.w <= 0 || WORLD.h <= 0) problems.push('WORLD inválido');
  if (MAX_PLAYERS < 1) problems.push('MAX_PLAYERS inválido');
  if (PUBLIC_ROOMS.some((code) => !rooms.has(code))) problems.push('Sala pública ausente');
  if (WORLD_WALLS.length < 20) problems.push('Muy pocos muros');
  if (Object.keys(WEAPONS).length !== 5 || !Object.keys(WEAPONS).every(id => id.startsWith('sword_'))) problems.push('Catálogo de espadas incompleto');
  if (!(SAFE_ZONE_HP_REGEN_PER_SEC > HP_REGEN_PER_SEC)) problems.push('Curación de zona segura inválida');
  if (NAME_MAX_LENGTH < 3) problems.push('Límite de nombre inválido');
  if (!cosmetics.getSkin('core_default')) problems.push('Skin base ausente');
  if (Object.keys(cosmetics.SKINS).length < 8) problems.push('Catálogo de skins incompleto');
  if (!cosmetics.REDEEM_CODES.NEONSTART) problems.push('Código NEONSTART ausente');
  if (!cosmetics.REDEEM_CODES.NEONARMORY) problems.push('Código NEONARMORY ausente');
  if (!cosmetics.REDEEM_CODES.STARFORGE) problems.push('Código STARFORGE ausente');
  if (!cosmetics.REDEEM_CODES.SOBERANO2026) problems.push('Código SOBERANO2026 ausente');

  const testHit = rayCircleDistance(0, 0, 1, 0, 100, 0, 10);
  if (Math.abs(testHit - 90) > 0.001) problems.push('Colisión ray-circle inválida');
  if (!(BOSS_ATTACK_RANGE > 0 && BOSS_ATTACK_RANGE < 1200)) problems.push('Rango del destructor inválido');

  if (problems.length) {
    console.error('[DIAGNOSTIC] FAIL ' + problems.join(' | '));
    return false;
  }

  console.log(
    '[DIAGNOSTIC] PASS version=' + SERVER_VERSION +
    ' rooms=' + rooms.size +
    ' walls=' + WORLD_WALLS.length +
    ' swords=' + Object.keys(WEAPONS).length +
    ' armors=' + Object.keys(cosmetics.SKINS).length +
    ' storage=' + (storage.enabled ? 'postgres' : 'memory')
  );
  return true;
}

runServerDiagnostics();

const websocketHeartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);

httpServer.listen(PORT, () => {
  console.log(
    'Neon Core multiplayer server listening on ' +
      PORT +
      ' · version ' +
      SERVER_VERSION
  );
});
