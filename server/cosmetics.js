'use strict';

const SKINS = Object.freeze({
  core_default: { id:'core_default', name:'ARMADURA MELEE BÁSICA', rarity:'Común', type:'armor', priceGold:0, priceDiamonds:0, priceUsd:0, style:'core', defenseBonus:0 },
  pixel_cyan: { id:'pixel_cyan', name:'PIXEL CYAN', rarity:'Raro', type:'armor', priceGold:5000, priceDiamonds:0, priceUsd:0, style:'pixel', defenseBonus:10 },
  rust_core: { id:'rust_core', name:'NÚCLEO OXIDADO', rarity:'Raro', type:'armor', priceGold:1500, priceDiamonds:0, priceUsd:0, style:'rust', defenseBonus:20 },
  toxic_orb: { id:'toxic_orb', name:'ORBE TÓXICO', rarity:'Épico', type:'armor', priceGold:12000, priceDiamonds:0, priceUsd:0, style:'toxic', defenseBonus:35 },
  plasma_violet: { id:'plasma_violet', name:'PLASMA VIOLETA', rarity:'Mítico', type:'armor', priceGold:60000, priceDiamonds:0, priceUsd:0, style:'plasma', defenseBonus:60 },
  aurora: { id:'aurora', name:'AURORA', rarity:'Épico', type:'armor', priceGold:0, priceDiamonds:250, priceUsd:0, style:'aurora', defenseBonus:90 },
  nebula_prism: { id:'nebula_prism', name:'NEBULOSA PRISMA', rarity:'Mítico', type:'armor', priceGold:0, priceDiamonds:4500, priceUsd:0, style:'nebula', defenseBonus:140 },
  eclipse_gold: { id:'eclipse_gold', name:'ECLIPSE DORADO', rarity:'Legendario', type:'armor', priceGold:0, priceDiamonds:2000, priceUsd:0, style:'eclipse', defenseBonus:220 },
  celestial: { id:'celestial', name:'CIELO CELESTE', rarity:'Legendario', type:'armor', priceGold:0, priceDiamonds:7500, priceUsd:0, style:'celestial', defenseBonus:320 },
  angel_seraph: { id:'angel_seraph', name:'ÁNGEL SERAFÍN', rarity:'Legendario', type:'armor', priceGold:0, priceDiamonds:12000, priceUsd:0, style:'angel', defenseBonus:500 },
  demon_infernal: { id:'demon_infernal', name:'DEMONIO INFERNAL', rarity:'Supremo', type:'armor', priceGold:0, priceDiamonds:25000, priceUsd:0, style:'demon', defenseBonus:700 },
  eternal_void: { id:'eternal_void', name:'VACÍO ETERNO', rarity:'Supremo', type:'armor', priceGold:0, priceDiamonds:30000, priceUsd:0, style:'void', defenseBonus:950 },
  gm_core: { id:'gm_core', name:'SOBERANO DEL NÚCLEO', rarity:'Supremo', type:'armor', priceGold:0, priceDiamonds:50000, priceUsd:0, style:'gm', defenseBonus:1250 }
});

const ARMORS=Object.freeze({
  pixel_cyan:{...SKINS.pixel_cyan,name:'PLACA PIXEL',type:'armor',armorRating:10},
  rust_core:{...SKINS.rust_core,name:'CORAZA OXIDADA',type:'armor',armorRating:20},
  toxic_orb:{...SKINS.toxic_orb,name:'TRAJE TÓXICO',type:'armor',armorRating:35},
  plasma_violet:{...SKINS.plasma_violet,name:'ARMADURA PLASMA',type:'armor',armorRating:60},
  aurora:{...SKINS.aurora,name:'CORAZA AURORA',type:'armor',armorRating:90},
  nebula_prism:{...SKINS.nebula_prism,name:'ARMADURA NEBULOSA',type:'armor',armorRating:140},
  eclipse_gold:{...SKINS.eclipse_gold,name:'CORAZA ECLIPSE',type:'armor',armorRating:220},
  celestial:{...SKINS.celestial,name:'ARMADURA CELESTE',type:'armor',armorRating:320},
  angel_seraph:{...SKINS.angel_seraph,name:'ARMADURA SERAFÍN',type:'armor',armorRating:500},
  demon_infernal:{...SKINS.demon_infernal,name:'ARMADURA INFERNAL',type:'armor',armorRating:700},
  eternal_void:{...SKINS.eternal_void,name:'ARMADURA VACÍO',type:'armor',armorRating:950},
  gm_core:{...SKINS.gm_core,name:'ARMADURA SOBERANA',type:'armor',armorRating:1250}
});
function getArmor(id){return ARMORS[String(id||'')];}

const WEAPON_SKINS = Object.freeze({});

const REAL_MONEY_OFFERS = Object.freeze([
  { sku:'gm_core_usd', name:'SOBERANO DEL NÚCLEO', description:'Armadura premium individual.', priceUsd:1, skinId:'gm_core', enabled:false }
]);

const REDEEM_CODES = Object.freeze({
  // enabled:true  -> el código se puede canjear.
  // enabled:false -> queda bloqueado sin borrar el código.
  // repeatable:true -> se puede volver a ejecutar para pruebas.


  SKIN_PIXEL_CYAN: { enabled:true, skinId:'pixel_cyan', message:'Código válido: desbloqueaste PIXEL CYAN.' },
  SKIN_RUST_CORE: { enabled:true, skinId:'rust_core', message:'Código válido: desbloqueaste NÚCLEO OXIDADO.' },
  SKIN_TOXIC_ORB: { enabled:true, skinId:'toxic_orb', message:'Código válido: desbloqueaste ORBE TÓXICO.' },
  SKIN_PLASMA_VIOLET: { enabled:true, skinId:'plasma_violet', message:'Código válido: desbloqueaste PLASMA VIOLETA.' },
  SKIN_AURORA: { enabled:true, skinId:'aurora', message:'Código válido: desbloqueaste AURORA.' },
  SKIN_NEBULA_PRISM: { enabled:true, skinId:'nebula_prism', message:'Código válido: desbloqueaste NEBULOSA PRISMA.' },
  SKIN_ECLIPSE_GOLD: { enabled:true, skinId:'eclipse_gold', message:'Código válido: desbloqueaste ECLIPSE DORADO.' },
  SKIN_CELESTIAL: { enabled:true, skinId:'celestial', message:'Código válido: desbloqueaste CIELO CELESTE.' },
  SKIN_ANGEL_SERAPH: { enabled:true, skinId:'angel_seraph', message:'Código válido: desbloqueaste ÁNGEL SERAFÍN.' },
  SKIN_DEMON_INFERNAL: { enabled:true, skinId:'demon_infernal', message:'Código válido: desbloqueaste DEMONIO INFERNAL.' },
  SKIN_ETERNAL_VOID: { enabled:true, skinId:'eternal_void', message:'Código válido: desbloqueaste VACÍO ETERNO.' },
  SKIN_GM_CORE: { enabled:true, skinId:'gm_core', message:'Código válido: desbloqueaste SOBERANO DEL NÚCLEO.' },

  SOBERANO2026: { enabled:true, skinId:'gm_core', message:'Código válido: desbloqueaste SOBERANO DEL NÚCLEO.' }
});

function getSkin(id) { return SKINS[String(id || '')]; }
function getWeaponSkin(id) { return WEAPON_SKINS[String(id || '')]; }

const STARTER_SKINS=Object.freeze(['core_default']);

function normalizeOwnedSkins(value){
  const input=Array.isArray(value)?value:[],out=[],seen=new Set();
  for(const raw of input){
    const id=String(raw||'');
    if(!STARTER_SKINS.includes(id)||seen.has(id))continue;
    seen.add(id);out.push(id);
  }
  for(const starterId of STARTER_SKINS){
    if(!seen.has(starterId)){seen.add(starterId);out.push(starterId);}
  }
  return out;
}

function normalizeOwnedArmors(value){
  const input=Array.isArray(value)?value:[],out=[],seen=new Set();
  for(const raw of input){
    const id=String(raw||'');
    if(!ARMORS[id]||seen.has(id))continue;
    seen.add(id);out.push(id);
  }
  return out;
}

function normalizeOwnedWeaponSkins(value) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const id = String(raw || '');
    if (!WEAPON_SKINS[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeRedeemedCodes(value) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const code = String(raw || '').trim().toUpperCase().slice(0,32);
    if (!code || !REDEEM_CODES[code] || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function publicCatalog(){
  return Object.values(SKINS).filter(s=>STARTER_SKINS.includes(s.id)).map(s=>({id:s.id,name:s.name,rarity:s.rarity,type:s.type,style:s.style}));
}
function publicArmorCatalog(){
  return Object.values(ARMORS).map(a=>({
    id:a.id,name:a.name,rarity:a.rarity,type:a.type,
    priceGold:Number(a.priceGold)||0,priceDiamonds:Number(a.priceDiamonds)||0,priceUsd:Number(a.priceUsd)||0,
    style:a.style,armorRating:Number(a.armorRating)||0,
    redeemable:Object.values(REDEEM_CODES).some(x=>x.skinId===a.id||x.allSkins)
  }));
}
function publicWeaponCatalog() {
  return [];
}

function publicRealMoneyOffers() { return REAL_MONEY_OFFERS.map(offer => ({...offer})); }

module.exports = {
  SKINS, STARTER_SKINS, ARMORS, WEAPON_SKINS, REAL_MONEY_OFFERS, REDEEM_CODES,
  getSkin, getArmor, getWeaponSkin, normalizeOwnedSkins, normalizeOwnedArmors, normalizeOwnedWeaponSkins,
  normalizeRedeemedCodes, publicCatalog, publicArmorCatalog, publicWeaponCatalog, publicRealMoneyOffers
};
