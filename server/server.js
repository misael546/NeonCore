/* BUILD-18 · HUD limpia y configuraciones generales */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const storage = require('./storage');
const cosmetics = require('./cosmetics');

const PORT = Number(process.env.PORT || 10000);

const WORLD = { w: 6000, h: 4400 };
const MAX_PLAYERS = 16;
const SAFE_ZONE = { x: 3000, y: 2200, r: 300 };

let UNIFIED_RELEASE_MANIFEST = {
  game: 'Neon Core',
  releaseId: 'unknown',
  clientBuild: 'unknown',
  serverBuild: 'unknown',
  databaseSchema: 1
};

try {
  const manifestPath = path.join(__dirname, '..', 'release.json');
  UNIFIED_RELEASE_MANIFEST = {
    ...UNIFIED_RELEASE_MANIFEST,
    ...JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  };
} catch (error) {
  console.warn('[RELEASE] No se pudo cargar release.json:', error?.message || error);
}

const RELEASE_ID = String(UNIFIED_RELEASE_MANIFEST.releaseId || 'unknown');
const DATABASE_SCHEMA_VERSION = Math.max(1, Number(UNIFIED_RELEASE_MANIFEST.databaseSchema) || 1);
const SERVER_VERSION = RELEASE_ID;
const SERVER_UPDATE_MESSAGE = 'NUEVA ACTUALIZACIÓN DISPONIBLE. Neon Core se actualizará automáticamente en unos segundos. No cierres la pestaña.';

const AMMO_PACK_SIZE = 100;
const AMMO_PACK_COST = 75;
const INVENTORY_SLOTS = 16;
const INVENTORY_STACK_MAX = 500;
const MAX_AMMO = INVENTORY_SLOTS * INVENTORY_STACK_MAX;
const PICKUP_RADIUS = 85;
const DROP_LIFETIME_MS = 10 * 60 * 1000;
const PROJECTILE_SPEED = 1200;
const WEAPON_FIRE_RATE = 420;
const PROJECTILE_RANGE = 1000;

const PISTOLERO_MAX_LEVEL = 1000;
const PISTOLERO_XP_PER_HIT = 10;
const PISTOLERO_XP_PER_KILL = 40;

const SHOP_NPC = { x: 3250, y: 2200, r: 24 };
const SHOP_INTERACTION_RADIUS = 48;
const BANK_ENABLED = false;

const WEAPONS = {
  blaster: { name: 'BLASTER · NEONSTORM', cost: 0, power: 100, fireRate: 420, maxAmmo:8000, range: 1000 },
  pulse: { name: 'PULSE · PRISMA', cost: 500, power: 200, fireRate: 420, maxAmmo:8000, range: 1000 },
  cannon: { name: 'CANNON · SOLARIS', cost: 1500, power: 400, fireRate: 420, maxAmmo:8000, range: 1000 },
  railgun: { name: 'RAILGUN · ECLIPSE', cost: 6500, power: 743, fireRate: 420, maxAmmo:8000, range: 1000 },
  nova: { name: 'NOVA · SUPERNOVA', cost: 22000, power: 1486, fireRate: 420, maxAmmo:8000, range: 1000 },
  plasma: { name: 'PLASMA · INFERNO', cost: 60000, power: 2286, fireRate: 420, maxAmmo:8000, range: 1000 },
  vortex: { name: 'VORTEX · SHARD', cost: 150000, power: 3286, fireRate: 420, maxAmmo:8000, range: 1000 },
  quasar: { name: 'QUASAR · RAY', cost: 400000, power: 4429, fireRate: 420, maxAmmo:8000, range: 1000 },
  singularity: { name: 'SINGULARITY · CORE', cost: 900000, power: 6000, fireRate: 420, maxAmmo:8000, range: 1000 },
  omega: { name: 'OMEGA · ASCENSION', cost: 2000000, power: 8000, fireRate: 420, maxAmmo:8000, range: 1000 }
};

function damageForPower(power) {
  return Math.max(1, Math.round((Number(power) || 0) * 0.35));
}

const HP_REGEN_PER_SEC = 3;
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
const AUTOSAVE_MS = 5000;
const DEATH_HP_LOSS = 0.10;
const DEATH_DAMAGE_LOSS = 0.05;
const DEATH_DEFENSE_LOSS = 0.05;
const DEATH_GOLD_LOSS = 0;
const DEATH_XP_LOSS = 0.10;
const TICK_MS = 100;
const ENEMY_SYNC_MS = 120;
const ENEMY_ATTACK_COOLDOWN_MS = 700;

const SERVER_STARTED_AT = Date.now();

const clients = new Map();
const savedPlayers = new Map();

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

function pistoleroXpToNextLevel(level) {
  return 100 * Math.max(1, Math.min(PISTOLERO_MAX_LEVEL, Number(level) || 1));
}
function pistoleroLevelFromXp(xp) {
  let level = 1, remaining = Math.max(0, Number(xp) || 0);
  while (level < PISTOLERO_MAX_LEVEL && remaining >= pistoleroXpToNextLevel(level)) { remaining -= pistoleroXpToNextLevel(level); level += 1; }
  return level;
}
function pistoleroXpIntoLevel(xp) {
  let level = 1, remaining = Math.max(0, Number(xp) || 0);
  while (level < PISTOLERO_MAX_LEVEL && remaining >= pistoleroXpToNextLevel(level)) { remaining -= pistoleroXpToNextLevel(level); level += 1; }
  return remaining;
}
function weaponPowerAttackBonus(power) {
  return Math.max(0, Math.floor((Number(power) || 0) / 20));
}
function addPistoleroXp(p, amount) {
  if (!p) return false;
  const before=pistoleroLevelFromXp(p.pistoleroXp);
  p.pistoleroXp=Math.max(0,Math.floor(Number(p.pistoleroXp)||0)+Math.max(0,Math.floor(Number(amount)||0)));
  const after=pistoleroLevelFromXp(p.pistoleroXp);
  p.pistoleroLevel=after;
  return after>before;
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
    power: Number(p.power) || 0,
    powerAttackBonus: weaponPowerAttackBonus(p.power),
    pistoleroLevel: pistoleroLevelFromXp(p.pistoleroXp),
    pistoleroXp: Math.max(0, Number(p.pistoleroXp) || 0),
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : 'core_default',
    equippedArmor: cosmetics.getArmor(p.equippedArmor) ? p.equippedArmor : ''
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
  const maxAmmo = maxAmmoForWeapon(p.weapon);

  send(p.ws, {
    type: 'server_stats',
    kills: p.kills,
    pvpKills: p.pvpKills,
    score: p.score,
    xp: p.xp,
    level: p.level,
    power: Number(p.power) || 0,
    powerAttackBonus: weaponPowerAttackBonus(p.power),
    damage: Number(p.damage) || 1,
    pistoleroLevel: pistoleroLevelFromXp(p.pistoleroXp),
    pistoleroXp: Math.max(0, Number(p.pistoleroXp) || 0),
    pistoleroXpIntoLevel: pistoleroXpIntoLevel(p.pistoleroXp),
    pistoleroXpNeed: pistoleroXpToNextLevel(pistoleroLevelFromXp(p.pistoleroXp)),
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
    ammo: inventoryTotal(p,"ammo"),
    maxAmmo: MAX_AMMO,
    inventory: inventoryPayload(p),
    weapon: p.weapon,
    ownedWeapons: normalizeOwnedWeapons(p.ownedWeapons, p.weapon || ''),
    shopNpc: SHOP_NPC,
    bankEnabled: BANK_ENABLED,
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : 'core_default',
    equippedArmor: cosmetics.getArmor(p.equippedArmor) ? p.equippedArmor : '',
    ownedSkins: cosmetics.normalizeOwnedSkins(p.ownedSkins),
    ownedArmors: cosmetics.normalizeOwnedArmors(p.ownedArmors),
    redeemedCodes: cosmetics.normalizeRedeemedCodes(p.redeemedCodes),
    armorRating: Number(cosmetics.getArmor(p.equippedArmor)?.armorRating)||0
  });
}
function capturePlayerData(p) {
  return {
    name: p.name,
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
    pistoleroLevel: pistoleroLevelFromXp(p.pistoleroXp),
    pistoleroXp: Math.max(0, Number(p.pistoleroXp) || 0),
    weapon: WEAPONS[p.weapon] ? p.weapon : null,
    ownedWeapons: normalizeOwnedWeapons(p.ownedWeapons, p.weapon || ''),
    bankedGold: Math.max(0, Number(p.bankedGold) || 0),
    bankedDiamonds: Math.max(0, Number(p.bankedDiamonds) || 0),
    damageXp: Math.max(0, Number(p.damageXp) || 0),
    defenseXp: Math.max(0, Number(p.defenseXp) || 0),
    damagePenalty: Math.max(0, Number(p.damagePenalty) || 0),
    defensePenalty: Math.max(0, Number(p.defensePenalty) || 0),
    ownedSkins: cosmetics.normalizeOwnedSkins(p.ownedSkins),
    equippedSkin: cosmetics.getSkin(p.equippedSkin) ? p.equippedSkin : 'core_default',
    ownedArmors: cosmetics.normalizeOwnedArmors(p.ownedArmors),
    equippedArmor: cosmetics.getArmor(p.equippedArmor) ? p.equippedArmor : '',
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
    const legacy = await storage.loadPlayerDataByName(playerName);
    if (legacy) {
      savedPlayers.set(saveKey, { ...legacy });
      console.log('[STORAGE MIGRATION] Perfil recuperado por nombre:', String(playerName || '').trim());
      return { data: { ...legacy }, migrated: true };
    }
  } catch (error) {
    console.error('[STORAGE LOAD]', error?.message || error);
  }

  return null;
}

function emptyInventory(){return Array.from({length:INVENTORY_SLOTS},()=>null);}
function normalizeInventory(value){const out=emptyInventory(),src=Array.isArray(value)?value:[];for(let i=0;i<src.length&&i<INVENTORY_SLOTS;i++){const raw=src[i];if(!raw)continue;const itemId=String(raw.itemId||raw.id||'');let remaining=Math.max(0,Math.floor(Number(raw.qty)||0));if(itemId!=='ammo'||remaining<=0)continue;for(let j=0;j<INVENTORY_SLOTS&&remaining>0;j++){const slot=out[j];if(slot&&slot.itemId===itemId&&slot.qty<INVENTORY_STACK_MAX){const take=Math.min(remaining,INVENTORY_STACK_MAX-slot.qty);slot.qty+=take;remaining-=take;}}for(let j=0;j<INVENTORY_SLOTS&&remaining>0;j++){if(!out[j]){const take=Math.min(remaining,INVENTORY_STACK_MAX);out[j]={itemId,qty:take};remaining-=take;}}}return out;}
function inventoryTotal(p,itemId='ammo'){const inv=normalizeInventory(p?.inventory);if(p)p.inventory=inv;let total=0;for(const slot of inv)if(slot&&slot.itemId===itemId)total+=Math.max(0,Number(slot.qty)||0);return total;}
function syncAmmoFromInventory(p){if(!p)return 0;p.inventory=normalizeInventory(p.inventory);p.ammo=inventoryTotal(p,'ammo');return p.ammo;}
function addInventoryItem(p,itemId,qty){if(!p)return Math.max(0,Math.floor(Number(qty)||0));p.inventory=normalizeInventory(p.inventory);let remaining=Math.max(0,Math.floor(Number(qty)||0));if(itemId!=='ammo'||remaining<=0)return remaining;for(let i=0;i<p.inventory.length&&remaining>0;i++){const slot=p.inventory[i];if(slot&&slot.itemId===itemId&&slot.qty<INVENTORY_STACK_MAX){const take=Math.min(remaining,INVENTORY_STACK_MAX-slot.qty);slot.qty+=take;remaining-=take;}}for(let i=0;i<p.inventory.length&&remaining>0;i++){if(!p.inventory[i]){const take=Math.min(remaining,INVENTORY_STACK_MAX);p.inventory[i]={itemId,qty:take};remaining-=take;}}syncAmmoFromInventory(p);return remaining;}
function removeInventoryAmount(p,itemId,qty){if(!p)return 0;p.inventory=normalizeInventory(p.inventory);let remaining=Math.max(0,Math.floor(Number(qty)||0)),removed=0;for(let i=0;i<p.inventory.length&&remaining>0;i++){const slot=p.inventory[i];if(!slot||slot.itemId!==itemId)continue;const take=Math.min(remaining,slot.qty);slot.qty-=take;removed+=take;remaining-=take;if(slot.qty<=0)p.inventory[i]=null;}syncAmmoFromInventory(p);return removed;}
function inventoryPayload(p){syncAmmoFromInventory(p);return p.inventory.map(slot=>slot?{itemId:slot.itemId,qty:slot.qty}:null);}
function sendInventoryState(p,message=''){if(!p?.ws)return;send(p.ws,{type:'inventory_state',message,inventory:inventoryPayload(p),ammo:inventoryTotal(p,'ammo'),maxAmmo:MAX_AMMO,slots:INVENTORY_SLOTS,stackMax:INVENTORY_STACK_MAX});}
function dropItem(roomCode,p,itemId,qty,x,y){const list=roomDrops.get(roomCode)||[];const drop={id:'d_'+Math.random().toString(36).slice(2,10),itemId:String(itemId||''),name:itemId==='ammo'?'MUNICIÓN':'OBJETO',qty:Math.max(1,Math.floor(Number(qty)||0)),x:clamp(Number(x)||0,35,WORLD.w-35),y:clamp(Number(y)||0,35,WORLD.h-35),createdAt:Date.now()};list.push(drop);roomDrops.set(roomCode,list);return drop;}
function sendDropState(roomCode){broadcastRoom(roomCode,{type:'drop_state',drops:(roomDrops.get(roomCode)||[]).map(d=>({...d}))});}
function cleanupDrops(roomCode){const now=Date.now(),list=roomDrops.get(roomCode)||[],next=list.filter(d=>now-(Number(d.createdAt)||now)<DROP_LIFETIME_MS);if(next.length!==list.length){roomDrops.set(roomCode,next);sendDropState(roomCode);}}
function dropInventoryItem(ws,slotIndex){const p=clients.get(ws);if(!p||!p.room||!p.alive)return;const idx=Math.floor(Number(slotIndex));if(!Number.isInteger(idx)||idx<0||idx>=INVENTORY_SLOTS)return;p.inventory=normalizeInventory(p.inventory);const slot=p.inventory[idx];if(!slot||slot.itemId!=='ammo'||slot.qty<=0)return sendInventoryState(p,'Ese espacio está vacío.');const qty=slot.qty;p.inventory[idx]=null;syncAmmoFromInventory(p);dropItem(p.room,p,'ammo',qty,p.x,p.y);void persistPlayer(p);sendInventoryState(p,'Soltaste '+qty+' balas en el suelo.');sendDropState(p.room);}
function pickupNearby(ws){const p=clients.get(ws);if(!p||!p.room||!p.alive)return;cleanupDrops(p.room);const list=roomDrops.get(p.room)||[];let bestIndex=-1,bestDistance=Infinity;for(let i=0;i<list.length;i++){const d=list[i],distance=Math.hypot(p.x-d.x,p.y-d.y);if(distance<=PICKUP_RADIUS&&distance<bestDistance){bestDistance=distance;bestIndex=i;}}if(bestIndex<0)return sendInventoryState(p,'No hay objetos cerca.');const drop=list[bestIndex],before=inventoryTotal(p,drop.itemId),leftover=addInventoryItem(p,drop.itemId,drop.qty),added=inventoryTotal(p,drop.itemId)-before;if(added<=0)return sendInventoryState(p,'La mochila está llena.');drop.qty=leftover;if(drop.qty<=0)list.splice(bestIndex,1);roomDrops.set(p.room,list);void persistPlayer(p);sendInventoryState(p,'Recogiste '+added+' '+drop.name+'.');sendDropState(p.room);}
function maxAmmoForWeapon() {
  // La munición pertenece al jugador, no al arma equipada.
  return MAX_AMMO;
}

function normalizeOwnedWeapons(value, fallbackWeapon = '') {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const id = String(raw || '');
    if (!WEAPONS[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (WEAPONS[fallbackWeapon] && !seen.has(fallbackWeapon)) out.push(fallbackWeapon);
  if (!out.includes('blaster')) out.unshift('blaster');
  return out;
}

function weaponSkinAttackBonus(p) {
  // Las armas ya incluyen su aspecto y su ATAQUE. Las antiguas skins de arma
  // quedan ignoradas para compatibilidad con partidas guardadas.
  return 0;
}


function skinDefenseBonus(){return 0;}
function defenseLevelFromXp(xp){return masteryLevelFromXp(xp);}
function defenseXpIntoCurrentLevel(xp){return masteryXpIntoLevel(xp);}

function applyCombatStats(p) {
  const item = WEAPONS[p.weapon] || null;
  const pistoleroLevel = pistoleroLevelFromXp(p.pistoleroXp);
  p.pistoleroLevel = pistoleroLevel;

  if (item) {
    p.power = Math.max(0, Number(item.power) || 0);
    p.powerAttackBonus = weaponPowerAttackBonus(p.power);
    // ATAQUE real = PISTOLERO + bono de PODER del arma.
    p.damage = Math.max(1, pistoleroLevel + p.powerAttackBonus);
    p.fireRate = WEAPON_FIRE_RATE;
  } else {
    p.weapon = null;
    p.power = 0;
    p.powerAttackBonus = 0;
    p.damage = 1;
    p.fireRate = 999999;
  }

  p.defense=Math.max(0,defenseLevelFromXp(p.defenseXp)-1);
  p.speed = speedForLevel(p.level);

  const maxAmmo = maxAmmoForWeapon();
  syncAmmoFromInventory(p);
}

function addDamageXp(p, amount) {
  // Compatibilidad con saves antiguos: el ataque ahora depende del arsenal.
  void amount;
  applyCombatStats(p);
}

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
  p.ammo = clamp(Number(p.ammo) || 0, 0, MAX_AMMO);
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
      name:BOSS_NAME,areaRadius:BOSS_AGGRO_RANGE,aggroRadius:BOSS_AGGRO_RANGE,
      attackRange:BOSS_ATTACK_RANGE,leashRadius:Infinity,attackCooldown:0,shape:'boss'
    };
  }
  if(kind==='elite'){
    return {
      r:30,hp:700+Math.max(0,lv-1)*75,speed:82+Math.max(0,lv-1)*1.8,
      damage:36+Math.max(0,lv-1)*2.6,areaRadius:360,aggroRadius:620,leashRadius:520,
      attackCooldown:Math.max(440,650-Math.max(0,lv-1)*7),shape:'hex',name:'GUARDIÁN NEÓN'
    };
  }
  return {
    r:22,hp:140+Math.max(0,lv-1)*28,speed:72+Math.max(0,lv-1)*1.5,
    damage:18+Math.max(0,lv-1)*1.25,areaRadius:190,aggroRadius:440,leashRadius:420,
    attackCooldown:Math.max(500,760-Math.max(0,lv-1)*6),
    shape:['square','triangle','hex'][Math.floor(Math.random()*3)],name:'DRON NEÓN'
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
    attackCooldown:stats.attackCooldown,lastAttackAt:0,lastBossShotAt:0,lastBossAreaAt:0,
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

function moveEnemyToward(enemy, tx, ty, dt, walls) {
  const distance = Math.max(1, Math.hypot(tx - enemy.x, ty - enemy.y));
  const dx = (tx - enemy.x) / distance;
  const dy = (ty - enemy.y) / distance;
  enemy.vx = dx * enemy.speed;
  enemy.vy = dy * enemy.speed;

  const nextX = clamp(enemy.x + enemy.vx * dt, 35, WORLD.w - 35);
  const nextY = clamp(enemy.y + enemy.vy * dt, 35, WORLD.h - 35);

  if (!collidesWithWall(nextX, nextY, enemy.r, walls)) {
    enemy.x = nextX;
    enemy.y = nextY;
  } else if (!collidesWithWall(nextX, enemy.y, enemy.r, walls)) {
    enemy.x = nextX;
  } else if (!collidesWithWall(enemy.x, nextY, enemy.r, walls)) {
    enemy.y = nextY;
  }
}

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
    send(ws, { type: 'room_error', message: 'Sala no encontrada' });
    return;
  }

  if (room.size >= MAX_PLAYERS) {
    send(ws, { type: 'room_error', message: 'Sala llena' });
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
    [3000, 2200],
    [2900, 2200],
    [3100, 2200],
    [3000, 2100],
    [2750, 2200],
    [3000, 2300],
    [3000, 1900],
    [3000, 2500],
    [2700, 1900],
    [3300, 1900],
    [2700, 2500],
    [3300, 2500],
    [2850, 1850],
    [3150, 1850],
    [2850, 2550],
    [3150, 2550]
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

function shopBuy(ws, requestedWeapon) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) return send(ws, { type: 'shop_result', ok: false, message: 'No puedes usar el arsenal ahora.' });
  if (!cosmeticShopNearby(p)) return send(ws, { type: 'shop_result', ok: false, message: 'Párate sobre el SHOP.' });

  const weaponId = String(requestedWeapon || '');
  const item = WEAPONS[weaponId];
  if (!item) return send(ws, { type: 'shop_result', ok: false, message: 'Arma no disponible.' });

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
      maxAmmo: MAX_AMMO,
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
    maxAmmo: maxAmmoForWeapon(p.weapon),
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
  if (!p.room || !p.alive) return cosmeticShopError(ws, 'No puedes usar armaduras de arma ahora.');
  if (!cosmeticShopNearby(p)) return cosmeticShopError(ws, 'Párate sobre el SHOP.');

  const skin = cosmetics.getWeaponSkin(skinId);
  if (!skin) return cosmeticShopError(ws, 'Armadura de arma no disponible.');
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
      return cosmeticShopError(ws, 'Esta armadura de arma no tiene un precio válido.');
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
  if (!cosmeticShopNearby(p)) return cosmeticShopError(ws, 'Acércate al SHOP.');

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

function cosmeticShopNearby(p) {
  return !!p && Math.hypot(p.x - SHOP_NPC.x, p.y - SHOP_NPC.y) <= SHOP_INTERACTION_RADIUS;
}

function sendCosmeticState(p,message='Tienda lista.',unlockedSkin='',unlockedWeapon='',unlockedWeaponSkin='',unlockedArmor=''){
  if(!p?.ws)return;
  send(p.ws,{type:'cosmetic_state',message,
    unlockedSkin:cosmetics.getSkin(unlockedSkin)?unlockedSkin:'',
    unlockedArmor:cosmetics.getArmor(unlockedArmor)?unlockedArmor:'',
    unlockedWeapon:WEAPONS[unlockedWeapon]?unlockedWeapon:'',
    unlockedWeaponSkin:cosmetics.getWeaponSkin(unlockedWeaponSkin)?unlockedWeaponSkin:'',
    ownedSkins:cosmetics.normalizeOwnedSkins(p.ownedSkins),
    equippedSkin:cosmetics.getSkin(p.equippedSkin)?p.equippedSkin:'core_default',
    ownedArmors:cosmetics.normalizeOwnedArmors(p.ownedArmors),
    equippedArmor:cosmetics.getArmor(p.equippedArmor)?p.equippedArmor:'',
    ownedWeapons:normalizeOwnedWeapons(p.ownedWeapons,p.weapon||''),weapon:p.weapon,
    weaponSkinCatalog:cosmetics.publicWeaponCatalog(),shopNpc:SHOP_NPC,
    catalog:cosmetics.publicCatalog(),armorCatalog:cosmetics.publicArmorCatalog(),
    realMoneyOffers:cosmetics.publicRealMoneyOffers(),realMoneyEnabled:false});
}
function cosmeticShopError(ws,message){send(ws,{type:'cosmetic_result',ok:false,message:String(message||'No se pudo completar la operación.')});}
function buyCosmeticArmor(ws,armorId){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return cosmeticShopError(ws,'No puedes usar armaduras ahora.');
  if(!cosmeticShopNearby(p))return cosmeticShopError(ws,'Párate sobre el SHOP.');
  const armor=cosmetics.getArmor(armorId);if(!armor)return cosmeticShopError(ws,'Armadura no disponible.');
  p.ownedArmors=cosmetics.normalizeOwnedArmors(p.ownedArmors);
  if(p.ownedArmors.includes(armor.id)){p.equippedArmor=armor.id;void persistPlayer(p);sendCosmeticState(p,'Armadura equipada: '+armor.name,'','','',armor.id);sendStats(p);sendPlayerList(p.room);return;}
  const gold=Math.max(0,Number(p.gold)||0),diamonds=Math.max(0,Number(p.diamonds)||0);
  if(armor.priceDiamonds>0){if(diamonds<armor.priceDiamonds)return cosmeticShopError(ws,'Necesitas '+armor.priceDiamonds+' diamantes.');p.diamonds=diamonds-armor.priceDiamonds;}
  else if(armor.priceGold>0){if(gold<armor.priceGold)return cosmeticShopError(ws,'Necesitas '+armor.priceGold+' de oro.');p.gold=gold-armor.priceGold;}
  else return cosmeticShopError(ws,'Esta armadura no tiene precio válido.');
  p.ownedArmors.push(armor.id);p.ownedArmors=cosmetics.normalizeOwnedArmors(p.ownedArmors);p.equippedArmor=armor.id;void persistPlayer(p);
  sendCosmeticState(p,'¡Compraste la armadura '+armor.name+' y quedó equipada!','','','',armor.id);sendStats(p);sendPlayerList(p.room);
}
function equipCosmeticArmor(ws,armorId){
  const p=clients.get(ws);if(!p)return;
  if(!p.room||!p.alive)return cosmeticShopError(ws,'No puedes cambiar de armadura ahora.');
  if(!cosmeticShopNearby(p))return cosmeticShopError(ws,'Acércate al SHOP.');
  const id=String(armorId||'');p.ownedArmors=cosmetics.normalizeOwnedArmors(p.ownedArmors);
  if(!id||!cosmetics.getArmor(id)||!p.ownedArmors.includes(id))return cosmeticShopError(ws,'Armadura bloqueada.');
  p.equippedArmor=p.equippedArmor===id?'':id;void persistPlayer(p);
  sendCosmeticState(p,p.equippedArmor?'Armadura equipada: '+cosmetics.getArmor(id).name+'.':'Armadura retirada.','','','',p.equippedArmor);sendStats(p);sendPlayerList(p.room);
}
function buyCosmeticSkin(ws,skinId){
  const p=clients.get(ws);if(!p)return;
  const id=String(skinId||'');if(!p.room||!p.alive)return cosmeticShopError(ws,'No puedes cambiar tu skin ahora.');
  if(!cosmeticShopNearby(p))return cosmeticShopError(ws,'Acércate al SHOP.');
  if(!cosmetics.getSkin(id)||!cosmetics.STARTER_SKINS.includes(id))return cosmeticShopError(ws,'Skin base no disponible.');
  p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);p.equippedSkin=id;void persistPlayer(p);
  sendCosmeticState(p,'Skin base equipada: '+cosmetics.getSkin(id).name+'.');sendStats(p);sendPlayerList(p.room);
}
function equipCosmeticSkin(ws,skinId){return buyCosmeticSkin(ws,skinId);}

async function redeemCosmeticCode(ws, rawCode) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) return cosmeticShopError(ws, 'No puedes usar códigos ahora.');
  if (!cosmeticShopNearby(p)) return cosmeticShopError(ws, 'Acércate al SHOP.');

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
  p.ownedArmors=cosmetics.normalizeOwnedArmors(p.ownedArmors);
  p.ownedWeapons=normalizeOwnedWeapons(p.ownedWeapons,p.weapon||'');
  p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(p.ownedWeaponSkins);

  let unlockedSkin = '', unlockedWeapon = '', unlockedWeaponSkin = '';
  const unlockedSkins = [];
  const unlockedWeapons = [];

  if (reward.allSkins) {
    p.ownedSkins=cosmetics.normalizeOwnedSkins(p.ownedSkins);
    p.ownedArmors=cosmetics.normalizeOwnedArmors(p.ownedArmors);
    for(const armorId of Object.keys(cosmetics.ARMORS)){if(!p.ownedArmors.includes(armorId))p.ownedArmors.push(armorId);unlockedArmors.push(armorId);}
  }

  if (reward.allWeapons) {
    for (const weaponId of Object.keys(WEAPONS)) {
      if (!p.ownedWeapons.includes(weaponId)) p.ownedWeapons.push(weaponId);
      unlockedWeapons.push(weaponId);
    }
    const preferredWeapon = WEAPONS[p.weapon] ? p.weapon : 'omega';
    p.weapon = preferredWeapon;
    unlockedWeapon = preferredWeapon;
  }

  if(reward.skinId){
    const armor=cosmetics.getArmor(reward.skinId);if(!armor)return cosmeticShopError(ws,'Código sin recompensa de armadura válida.');
    unlockedArmor=armor.id;if(!p.ownedArmors.includes(armor.id))p.ownedArmors.push(armor.id);p.equippedArmor=armor.id;
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

  if (!reward.allSkins && !reward.allWeapons && !unlockedSkin && !unlockedArmor && !unlockedWeapon && !unlockedWeaponSkin) {
    return cosmeticShopError(ws, 'El código no tiene una recompensa válida.');
  }

  if (!reward.repeatable) p.redeemedCodes.push(code);

  p.ownedSkins = cosmetics.normalizeOwnedSkins(p.ownedSkins);
  p.ownedWeapons = normalizeOwnedWeapons(p.ownedWeapons, p.weapon || '');
  p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(p.ownedWeaponSkins);
  applyCombatStats(p);
  await persistPlayer(p);

  const totalUnlocked=unlockedSkins.length+unlockedArmors.length+unlockedWeapons.length;
  const message=reward.allSkins||reward.allWeapons?reward.message+' ('+totalUnlocked+' objetos disponibles para probar).':reward.message;
  sendCosmeticState(p,message,unlockedSkin,unlockedWeapon,unlockedWeaponSkin,unlockedArmor);
  sendStats(p);
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

function buyAmmo(ws){const p=clients.get(ws);if(!p)return;if(!p.room)return send(ws,{type:'shop_result',ok:false,message:'No estás dentro de una sala.'});if(!p.alive)return send(ws,{type:'shop_result',ok:false,message:'No puedes comprar estando destruido.'});if(Math.hypot(p.x-SHOP_NPC.x,p.y-SHOP_NPC.y)>SHOP_INTERACTION_RADIUS)return send(ws,{type:'shop_result',ok:false,message:'Párate sobre el SHOP.'});const ammo=inventoryTotal(p,'ammo'),gold=Math.max(0,Number(p.gold)||0);if(ammo>=MAX_AMMO)return send(ws,{type:'shop_result',ok:false,message:'La mochila está llena de munición.'});if(gold<AMMO_PACK_COST)return send(ws,{type:'shop_result',ok:false,message:'Necesitas '+AMMO_PACK_COST+' de oro.'});const before=ammo;addInventoryItem(p,'ammo',AMMO_PACK_SIZE);const purchased=inventoryTotal(p,'ammo')-before;if(purchased<=0)return send(ws,{type:'shop_result',ok:false,message:'No hay espacio para más munición.'});p.gold=gold-AMMO_PACK_COST;void persistPlayer(p);send(ws,{type:'shop_result',ok:true,message:'Compraste '+purchased+' balas y fueron guardadas en tu mochila.',gold:p.gold,ammo:inventoryTotal(p,'ammo'),maxAmmo:MAX_AMMO});sendInventoryState(p,'Munición guardada en la mochila.');sendStats(p);}function handleShot(ws) {
  const shooter = clients.get(ws);
  if (!shooter || !shooter.room || !shooter.alive) return;
  if (inSafeZone(shooter.x, shooter.y, 24)) return send(ws, { type: 'shot_result', ok: false, reason: 'safe_zone', ammo: shooter.ammo || 0 });
  if ((shooter.ammo || 0) <= 0) return send(ws, { type: 'ammo_empty' });

  const now = Date.now();
  const cooldown = WEAPON_FIRE_RATE;
  if (now - shooter.lastShot < cooldown) return send(ws, { type: 'shot_result', ok: false, reason: 'cooldown', ammo: shooter.ammo || 0 });
  shooter.lastShot = now;

  const room = rooms.get(shooter.room);
  if (!room) return;

  const weapon = WEAPONS[shooter.weapon];
  if (!weapon) return send(ws, { type: 'shot_result', ok: false, reason: 'no_weapon', ammo: 0, maxAmmo: 0 });

  const damage = clamp(Number(shooter.damage) || 1, 1, 1000);
  const maxRange = PROJECTILE_RANGE;
  const shotX = Number(shooter.x) || 0, shotY = Number(shooter.y) || 0;
  const shotAngle = Number(shooter.angle) || 0;
  const dirX = Math.cos(shotAngle), dirY = Math.sin(shotAngle);
  const enemies = ensureRoomEnemies(shooter.room);
  const walls = ensureRoomWalls(shooter.room);

  let targetPlayer = null, targetEnemy = null, best = Infinity;

  for (const otherWs of room) {
    const target = clients.get(otherWs);
    if (!target || target === shooter || !target.alive || inSafeZone(target.x, target.y, 24)) continue;
    const d = rayCircleDistance(shotX, shotY, dirX, dirY, target.x, target.y, 28);
    if (d <= maxRange && d < best) { best=d; targetPlayer={ws:otherWs,p:target}; targetEnemy=null; }
  }
  for (const enemy of enemies) {
    const d = rayCircleDistance(shotX, shotY, dirX, dirY, enemy.x, enemy.y, Math.max(18, Number(enemy.r)||22)+4);
    if (d <= maxRange && d < best) { best=d; targetEnemy=enemy; targetPlayer=null; }
  }

  let nearestWall=null, nearestWallDistance=Infinity;
  for (const wall of walls) {
    const d=rayAabbDistance(shotX,shotY,dirX,dirY,wall);
    if(d>=0&&d<=maxRange&&d<nearestWallDistance){nearestWallDistance=d;nearestWall=wall;}
  }

  const impactDistance=Math.min(maxRange,nearestWallDistance,best);
  const impactX=shotX+dirX*impactDistance, impactY=shotY+dirY*impactDistance;
  const blockedByWall=!!(nearestWall&&nearestWallDistance<=best);
  const hitKind=blockedByWall?'wall':targetPlayer?'player':targetEnemy?'enemy':'range';
  const hitTarget=targetPlayer?.p?.id||targetEnemy?.id||'';
  const travelSpeed=PROJECTILE_SPEED;
  const travelMs=Math.max(70,Math.round((impactDistance/travelSpeed)*1000));

  removeInventoryAmount(shooter,"ammo",1);
  send(ws,{type:'shot_result',ok:true,ammo:shooter.ammo,maxAmmo:maxAmmoForWeapon(shooter.weapon),x:shotX,y:shotY,angle:shotAngle,damage,range:maxRange,travelDistance:impactDistance,impactX,impactY,hitKind,hitTarget,travelMs});
  sendStats(shooter);
  broadcastRoom(shooter.room,{type:'player_shot',shotId:'s_'+Math.random().toString(36).slice(2,10),id:shooter.id,power:shooter.power,damage,projectileSpeed:PROJECTILE_SPEED,x:shotX,y:shotY,angle:shotAngle,weapon:shooter.weapon,range:maxRange,travelDistance:impactDistance,impactX,impactY,hitKind,hitTarget,travelMs});

  // La bala YA NO hace daño al instante. Viaja durante travelMs y el objetivo
  // puede apartarse antes del impacto.
  setTimeout(()=>{
    try{
      if(!clients.has(ws)||!shooter.room||!shooter.alive)return;
      const tolerance=targetPlayer?34:targetEnemy?Math.max(24,Number(targetEnemy.r||22)+8):0;
      const liveTargetPlayer=targetPlayer?clients.get(targetPlayer.ws):null;
      const liveTargetEnemy=targetEnemy?enemies.find(e=>e.id===targetEnemy.id):null;
      if(!blockedByWall && hitKind==="player" && (!liveTargetPlayer||!liveTargetPlayer.alive||inSafeZone(liveTargetPlayer.x,liveTargetPlayer.y,24)||Math.hypot(liveTargetPlayer.x-impactX,liveTargetPlayer.y-impactY)>tolerance))return;
      if(!blockedByWall && hitKind==="enemy" && (!liveTargetEnemy||Math.hypot(liveTargetEnemy.x-impactX,liveTargetEnemy.y-impactY)>tolerance))return;
        if (nearestWall && nearestWallDistance <= best) {
    nearestWall.hp = clamp(nearestWall.hp - damage * 0.8, 0, nearestWall.maxHp);

    broadcastRoom(shooter.room, {
      type: 'wall_hit',
      id: nearestWall.id,
      hp: nearestWall.hp,
      x: nearestWall.x,
      y: nearestWall.y
    });

    if (nearestWall.hp <= 0) {
      const index = walls.findIndex((wall) => wall.id === nearestWall.id);
      const destroyedWall = index >= 0 ? walls.splice(index, 1)[0] : null;
      if (destroyedWall) {
        const respawns = roomWallRespawns.get(shooter.room) || [];
        respawns.push({
          respawnAt: Date.now() + WALL_RESPAWN_MS,
          wall: { ...destroyedWall, hp: destroyedWall.maxHp }
        });
        roomWallRespawns.set(shooter.room, respawns);

        broadcastRoom(shooter.room, {
          type: 'wall_dead',
          id: destroyedWall.id,
          x: destroyedWall.x,
          y: destroyedWall.y,
          diamond: null
        });
      }
    }

    return;
  }

  if (targetPlayer) {
    const target = targetPlayer.p;
    const targetMaxHp = maxHpForLevel(target.level);

    const actualDamage = Math.max(1, damage - (target.defense || 0));
applyCombatStats(shooter);

    target.hp = clamp(
      target.hp - actualDamage,
      0,
      targetMaxHp
    );
send(targetPlayer.ws, {
      type: 'pvp_damage',
      from: shooter.id,
      amount: damage,
      hp: target.hp,
      maxHp: targetMaxHp,
      defenseXp: masteryXpIntoLevel(target.defenseXp),
      defenseXpNeed: masteryXpToNextLevel(masteryLevelFromXp(target.defenseXp)),
      defenseLevel: masteryLevelFromXp(target.defenseXp)
    });

    broadcastRoom(shooter.room, {
      type: 'pvp_hit',
      shooter: shooter.id,
      target: target.id,
      amount: actualDamage,
      hp: target.hp,
      maxHp: targetMaxHp
    });

    send(shooter.ws, {
      type: 'hit_confirm',
      kind: 'player',
      target: target.id,
      amount: actualDamage,
      x: target.x,
      y: target.y,
      damageXp: masteryXpIntoLevel(shooter.damageXp),
      pistoleroLevel: pistoleroLevelFromXp(shooter.pistoleroXp),
      pistoleroXp: Math.max(0, Number(shooter.pistoleroXp) || 0),
      pistoleroXpIntoLevel: pistoleroXpIntoLevel(shooter.pistoleroXp),
      pistoleroXpNeed: pistoleroXpToNextLevel(pistoleroLevelFromXp(shooter.pistoleroXp)),
      attack: shooter.damage,
      powerAttackBonus: weaponPowerAttackBonus(shooter.power),
      damageXpNeed: masteryXpToNextLevel(masteryLevelFromXp(shooter.damageXp)),
      damageLevel: masteryLevelFromXp(shooter.damageXp)
    });

    sendStats(shooter);

    if (target.hp <= 0) {
      const lostScore = target.score || 0;
      markPlayerDead(target);

      shooter.kills = (shooter.kills || 0) + 1;
      shooter.pvpKills = (shooter.pvpKills || 0) + 1;
      shooter.score = (shooter.score || 0) + 25;
      shooter.xp = (shooter.xp || 0) + 40;
      addDamageXp(shooter, 20);
applyCombatStats(shooter);

      levelUpIfNeeded(shooter);

      void persistPlayer(target);
      void persistPlayer(shooter);

      send(targetPlayer.ws, {
        type: 'pvp_dead',
        x: target.x,
        y: target.y,
        killer: shooter.name,
        lostScore,
        hp: target.hp,
        maxHp: maxHpForLevel(target.level),
        ammo: target.ammo,
        level: target.level
      });

      sendStats(target);
      send(targetPlayer.ws, {
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
      sendStats(shooter);

      broadcastRoom(shooter.room, {
        type: 'pvp_kill',
        killer: shooter.id,
        target: target.id
      });

      sendPlayerList(shooter.room);
    }

    return;
  }

  if (targetEnemy) {
    const incomingDamage = targetEnemy.kind === 'boss' ? Math.max(1, Math.round(damage * 0.55)) : damage;
    addPistoleroXp(shooter, PISTOLERO_XP_PER_HIT);
    applyCombatStats(shooter);
    targetEnemy.hp = clamp(targetEnemy.hp - incomingDamage, 0, targetEnemy.maxHp);

    broadcastRoom(shooter.room, {
      type: 'enemy_hit',
      id: targetEnemy.id,
      hp: targetEnemy.hp,
      x: targetEnemy.x,
      y: targetEnemy.y
    });

    send(shooter.ws, {
      type: 'hit_confirm',
      kind: 'enemy',
      target: targetEnemy.id,
      amount: damage,
      x: targetEnemy.x,
      y: targetEnemy.y,
      power: shooter.power,
      attack: shooter.damage,
      pistoleroLevel: pistoleroLevelFromXp(shooter.pistoleroXp),
      pistoleroXp: Math.max(0, Number(shooter.pistoleroXp) || 0),
      pistoleroXpIntoLevel: pistoleroXpIntoLevel(shooter.pistoleroXp),
      pistoleroXpNeed: pistoleroXpToNextLevel(pistoleroLevelFromXp(shooter.pistoleroXp)),
      powerAttackBonus: weaponPowerAttackBonus(shooter.power)
    });

    sendStats(shooter);

    if (targetEnemy.hp <= 0) {
      const isBoss = targetEnemy.kind === 'boss';
      const reward = isBoss ? BOSS_GOLD_REWARD : targetEnemy.kind === 'elite' ? 500 : 40;
      const xp = isBoss ? BOSS_XP_REWARD : targetEnemy.kind === 'elite' ? 250 : 70;

      shooter.gold = (shooter.gold || 0) + reward;

      const index = enemies.findIndex((enemy) => enemy.id === targetEnemy.id);
      if (index >= 0) enemies.splice(index, 1);
      scheduleEnemyRespawn(shooter.room, targetEnemy.kind);

      shooter.kills = (shooter.kills || 0) + 1;
      shooter.score = (shooter.score || 0) + reward;
      shooter.xp = (shooter.xp || 0) + xp;

      addPistoleroXp(shooter, PISTOLERO_XP_PER_KILL);
      applyCombatStats(shooter);
      levelUpIfNeeded(shooter);
      void persistPlayer(shooter);
      sendStats(shooter);
      // Sincroniza nivel, score y kills con la lista de jugadores después de cada baja PvE.
      if (shooter.room) sendPlayerList(shooter.room);

      if (isBoss) {
        roomBossProjectiles.set(shooter.room, []);
        send(shooter.ws, {
          type: 'boss_reward',
          gold: reward,
          diamonds: 0,
          xp,
          message: '☄️ DESTRUCTOR ESTELAR DESTRUIDO · +15,000 🪙 · +5,000 XP'
        });
      }

      broadcastRoom(shooter.room, {
        type: 'enemy_dead',
        id: targetEnemy.id,
        killer: shooter.id,
        boss: isBoss,
        respawnMs: isBoss ? BOSS_RESPAWN_MS : MOB_RESPAWN_MS
      });
    }
  }

    }catch(error){ console.error('[PROJECTILE HIT]',error?.message||error); }
  },travelMs);
}

function createPlayer(ws) {
  const id = Math.random().toString(36).slice(2, 10);

  const player = {
    id,
    name: 'Jugador',
    saveKey: '',
    x: SAFE_ZONE.x,
    y: SAFE_ZONE.y,
    angle: 0,
    hp: 100,
    level: 1,
    damage: 35,
    power: 100,
    defense: 0,
    damagePenalty: 0,
    defensePenalty: 0,
    fireRate: 420,
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
    ownedArmors: [],
    equippedArmor: '',
    ownedWeapons: ['blaster'],
    equippedWeaponSkin: '',
    ownedWeaponSkins: [],
    redeemedCodes: [],
    inventory: emptyInventory(),
    ammo: 0,
    pistoleroXp: 0,
    pistoleroLevel: 1,
    powerAttackBonus: 0,
    weapon: 'blaster',
    color: '#39e7ff',
    room: '',
    alive: true,
    frozen: false,
    lastShot: 0,
    speed: 225,
    lastStateAt: Date.now(),
    stateViolations: 0,
    lastChatAt: 0,
    lastPersistAt: 0,
    lastEnemySyncAt: 0,
    persistChain: Promise.resolve(),
    hasSaved: false,
    joined: false,
    ws
  };

  return player;
}

const httpServer = http.createServer(async (req, res) => {
  const pathname = String(req.url || '').split('?')[0];

  if (pathname === '/client') {
    try {
      const clientPath = path.join(__dirname, '..', 'neoncore', '12345', 'v1', 'index.html');
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
        clientBuild: String(UNIFIED_RELEASE_MANIFEST.clientBuild || RELEASE_ID),
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
    clientBuild: String(UNIFIED_RELEASE_MANIFEST.clientBuild || RELEASE_ID),
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

        p.name = String(msg.name || 'Jugador').trim().slice(0, 20) || 'Jugador';
        p.saveKey = String(msg.saveKey || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 80);

        if (p.saveKey) {
          // Una reconexión válida puede llegar antes de que el cierre de la
          // conexión anterior termine de procesarse. Reemplazamos esa sesión
          // vieja en vez de rechazar la nueva indefinidamente.
          for (const [oldWs, oldP] of clients) {
            if (oldWs === ws || !oldP?.saveKey || oldP.saveKey !== p.saveKey) continue;

            try {
              oldP.frozen = true;
            } catch {}

            try {
              if (oldP.room) {
                await leaveRoom(oldWs);
              } else if (oldP.saveKey) {
                await persistPlayer(oldP);
              }
            } catch (error) {
              console.error('[WS SESSION REPLACE]', error?.message || error);
            }

            clients.delete(oldWs);

            try {
              oldWs.close(4001, 'replaced_session');
            } catch {}
          }
        }

        const loadedProfile = await loadSavedPlayer(p.saveKey, p.name);
        const saved = loadedProfile?.data || null;
        p.migratedProfile = Boolean(loadedProfile?.migrated);
        p.hasSaved = !!saved;

        if (saved) {
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
          if(Array.isArray(saved.inventory)){p.inventory=normalizeInventory(saved.inventory);}else{p.inventory=emptyInventory();addInventoryItem(p,'ammo',Math.max(0,Number(saved.ammo)||0));}syncAmmoFromInventory(p);
          p.pistoleroXp = Math.max(0, Number(saved.pistoleroXp) || 0);
          p.pistoleroLevel = pistoleroLevelFromXp(p.pistoleroXp);
          p.bankedGold = Math.max(0, Number(saved.bankedGold) || 0);
          p.bankedDiamonds = Math.max(0, Number(saved.bankedDiamonds) || 0);
          const legacyOwnedSkins=Array.isArray(saved.ownedSkins)?saved.ownedSkins:[];
          const legacyArmorIds=legacyOwnedSkins.filter(id=>cosmetics.getArmor(id));
          p.ownedSkins=cosmetics.normalizeOwnedSkins(legacyOwnedSkins);
          p.equippedSkin=(cosmetics.getSkin(saved.equippedSkin)&&p.ownedSkins.includes(saved.equippedSkin))?saved.equippedSkin:'core_default';
          p.ownedArmors=cosmetics.normalizeOwnedArmors([...(Array.isArray(saved.ownedArmors)?saved.ownedArmors:[]),...legacyArmorIds]);
          p.equippedArmor=cosmetics.getArmor(saved.equippedArmor)?.id||(cosmetics.getArmor(saved.equippedSkin)?.id||'');
          p.redeemedCodes = cosmetics.normalizeRedeemedCodes(saved.redeemedCodes);
          p.ownedWeapons = normalizeOwnedWeapons(saved.ownedWeapons, saved.weapon || '');
          p.weapon = WEAPONS[saved.weapon] ? saved.weapon : null;
          p.ownedWeaponSkins = cosmetics.normalizeOwnedWeaponSkins(saved.ownedWeaponSkins);
          p.equippedWeaponSkin = cosmetics.getWeaponSkin(saved.equippedWeaponSkin) && p.ownedWeaponSkins.includes(saved.equippedWeaponSkin) ? saved.equippedWeaponSkin : '';
          p.damagePenalty = Math.max(0, Number(saved.damagePenalty) || 0);
          p.defensePenalty = Math.max(0, Number(saved.defensePenalty) || 0);
        }

        if (msg.color) {
          const color = String(msg.color);
          p.color = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#39e7ff';
        }

        if (!Number.isFinite(Number(p.pistoleroXp))) p.pistoleroXp = 0;
        p.pistoleroLevel = pistoleroLevelFromXp(p.pistoleroXp);
        applyCombatStats(p);
        p.joined = true;

        if (msg.room) {
          await joinRoom(ws, msg.room, false);
        } else if (msg.createRoom) {
          await joinRoom(ws, '', true);
        } else {
          await joinRoom(ws, 'OPEN', false);
        }

        if (p.migratedProfile) {
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

        return;
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

        broadcastRoom(
          p.room,
          {
            type: 'player_update',
            player: publicPlayer(p)
          },
          ws
        );

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

      if (msg.type === 'fire') {
        if (!p.frozen) handleShot(ws);
        return;
      }

      if (msg.type === 'deposit_bank') {
        if (!p.frozen) await depositBank(ws);
        return;
      }

      if (msg.type === 'withdraw_bank') {
        if (!p.frozen) await withdrawBank(ws);
        return;
      }

      if (msg.type === 'buy_ammo') {
        if (!p.frozen) buyAmmo(ws);
        return;
      }

      if (msg.type === 'buy_weapon') {
        if (!p.frozen) shopBuy(ws, msg.weapon);
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
        if (!p.frozen) buyCosmeticArmor(ws, msg.armorId);
        return;
      }

      if (msg.type === 'equip_armor') {
        if (!p.frozen) equipCosmeticArmor(ws, msg.armorId);
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
          syncAmmoFromInventory(p);
          p.weapon = WEAPONS[checkpoint.weapon] ? checkpoint.weapon : 'blaster';
        } else {
          p.hp = maxHpForLevel(p.level);
          p.ammo = clamp(Number(p.ammo) || 0, 0, MAX_AMMO);
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
      p.hp = Math.min(maxHp, p.hp + HP_REGEN_PER_SEC * dt);

      send(p.ws, {
        type: 'hp_regen',
        hp: p.hp,
        maxHp
      });
    }

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
          const distance = Math.max(1, Math.hypot(target.x - boss.x, target.y - boss.y));
          const travelTime = distance / BOSS_PROJECTILE_SPEED;

          const bossLevel=Number(boss.level)||1;
          const warning = {
            id: 'ba_' + Math.random().toString(36).slice(2, 10),
            x: target.x,
            y: target.y,
            r: BOSS_AOE_RADIUS,
            damage: BOSS_AOE_DAMAGE + Math.max(0,bossLevel-1)*8,
            telegraphAt: now,
            hitAt: now + Math.max(450, Math.min(BOSS_AOE_WARNING_MS, travelTime * 1000))
          };

          bossProjectiles.push({
            id: 'bp_' + Math.random().toString(36).slice(2, 10),
            targetId: target.id,
            x: boss.x,
            y: boss.y,
            vx: ((target.x - boss.x) / distance) * BOSS_PROJECTILE_SPEED,
            vy: ((target.y - boss.y) / distance) * BOSS_PROJECTILE_SPEED,
            impactX: target.x,
            impactY: target.y,
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
          best < enemy.r + 24 &&
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
          addDefenseXp(target,Math.max(4,Math.round(actualDamage*5)));

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

    broadcastRoom(code, {
      type: 'enemy_state',
      enemies,
      bossProjectiles,
      bossWarnings: bossProjectiles
        .map(projectile => projectile.warning)
        .filter(Boolean)
    });
  }
}, ENEMY_SYNC_MS);

function announceServerUpdate() {
  const payload = {
    type: 'server_update_notice',
    serverVersion: SERVER_VERSION,
    clientBuild: String(UNIFIED_RELEASE_MANIFEST.clientBuild || RELEASE_ID),
    releaseId: RELEASE_ID,
    serverStartedAt: SERVER_STARTED_AT,
    message: SERVER_UPDATE_MESSAGE
  };
  for (const p of clients.values()) {
    send(p.ws, payload);
  }
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
  if (Object.keys(WEAPONS).length < 10) problems.push('Arsenal incompleto');
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
    '[DIAGNOSTIC] PASS build=' + SERVER_VERSION +
    ' rooms=' + rooms.size +
    ' walls=' + WORLD_WALLS.length +
    ' weapons=' + Object.keys(WEAPONS).length +
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
