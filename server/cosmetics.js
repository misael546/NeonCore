'use strict';

const SKINS = Object.freeze({
  core_default:{id:'core_default',name:'SKIN MELEE BÁSICA',rarity:'Común',type:'skin',priceGold:0,priceDiamonds:0,priceUsd:0,style:'core'},
  pixel_cyan:{id:'pixel_cyan',name:'PIXEL CYAN',rarity:'Raro',type:'skin',priceGold:5000,priceDiamonds:0,priceUsd:0,style:'pixel'},
  rust_core:{id:'rust_core',name:'NÚCLEO OXIDADO',rarity:'Raro',type:'skin',priceGold:1500,priceDiamonds:0,priceUsd:0,style:'rust'},
  toxic_orb:{id:'toxic_orb',name:'ORBE TÓXICO',rarity:'Épico',type:'skin',priceGold:12000,priceDiamonds:0,priceUsd:0,style:'toxic'},
  plasma_violet:{id:'plasma_violet',name:'PLASMA VIOLETA',rarity:'Mítico',type:'skin',priceGold:60000,priceDiamonds:0,priceUsd:0,style:'plasma'},
  aurora:{id:'aurora',name:'AURORA',rarity:'Épico',type:'skin',priceGold:0,priceDiamonds:250,priceUsd:0,style:'aurora'},
  nebula_prism:{id:'nebula_prism',name:'NEBULOSA PRISMA',rarity:'Mítico',type:'skin',priceGold:0,priceDiamonds:4500,priceUsd:0,style:'nebula'},
  eclipse_gold:{id:'eclipse_gold',name:'ECLIPSE DORADO',rarity:'Legendario',type:'skin',priceGold:0,priceDiamonds:2000,priceUsd:0,style:'eclipse'},
  celestial:{id:'celestial',name:'CIELO CELESTE',rarity:'Legendario',type:'skin',priceGold:0,priceDiamonds:7500,priceUsd:0,style:'celestial'},
  angel_seraph:{id:'angel_seraph',name:'ÁNGEL SERAFÍN',rarity:'Legendario',type:'skin',priceGold:0,priceDiamonds:12000,priceUsd:0,style:'angel'},
  demon_infernal:{id:'demon_infernal',name:'DEMONIO INFERNAL',rarity:'Supremo',type:'skin',priceGold:0,priceDiamonds:25000,priceUsd:0,style:'demon'},
  eternal_void:{id:'eternal_void',name:'VACÍO ETERNO',rarity:'Supremo',type:'skin',priceGold:0,priceDiamonds:30000,priceUsd:0,style:'void'},
  gm_core:{id:'gm_core',name:'SOBERANO DEL NÚCLEO',rarity:'Supremo',type:'skin',priceGold:0,priceDiamonds:50000,priceUsd:1,style:'gm'}
});
const WEAPON_SKINS=Object.freeze({});
const REAL_MONEY_OFFERS=Object.freeze([{sku:'gm_core_usd',name:'SOBERANO DEL NÚCLEO',description:'Skin cosmética individual.',priceUsd:1,skinId:'gm_core',enabled:false}]);
const REDEEM_CODES=Object.freeze({
  SKIN_PIXEL_CYAN:{enabled:true,skinId:'pixel_cyan',message:'Código válido: desbloqueaste PIXEL CYAN.'},
  SKIN_RUST_CORE:{enabled:true,skinId:'rust_core',message:'Código válido: desbloqueaste NÚCLEO OXIDADO.'},
  SKIN_TOXIC_ORB:{enabled:true,skinId:'toxic_orb',message:'Código válido: desbloqueaste ORBE TÓXICO.'},
  SKIN_PLASMA_VIOLET:{enabled:true,skinId:'plasma_violet',message:'Código válido: desbloqueaste PLASMA VIOLETA.'},
  SKIN_AURORA:{enabled:true,skinId:'aurora',message:'Código válido: desbloqueaste AURORA.'},
  SKIN_NEBULA_PRISM:{enabled:true,skinId:'nebula_prism',message:'Código válido: desbloqueaste NEBULOSA PRISMA.'},
  SKIN_ECLIPSE_GOLD:{enabled:true,skinId:'eclipse_gold',message:'Código válido: desbloqueaste ECLIPSE DORADO.'},
  SKIN_CELESTIAL:{enabled:true,skinId:'celestial',message:'Código válido: desbloqueaste CIELO CELESTE.'},
  SKIN_ANGEL_SERAPH:{enabled:true,skinId:'angel_seraph',message:'Código válido: desbloqueaste ÁNGEL SERAFÍN.'},
  SKIN_DEMON_INFERNAL:{enabled:true,skinId:'demon_infernal',message:'Código válido: desbloqueaste DEMONIO INFERNAL.'},
  SKIN_ETERNAL_VOID:{enabled:true,skinId:'eternal_void',message:'Código válido: desbloqueaste VACÍO ETERNO.'},
  SKIN_GM_CORE:{enabled:true,skinId:'gm_core',message:'Código válido: desbloqueaste SOBERANO DEL NÚCLEO.'},
  SOBERANO2026:{enabled:true,skinId:'gm_core',message:'Código válido: desbloqueaste SKIN SOBERANA.'},
  NEONMASTER:{enabled:true,repeatable:true,allSkins:true,allWeapons:true,allItems:true,message:'CÓDIGO MAESTRO: todo el contenido actual queda desbloqueado para pruebas.'}
});
const STARTER_SKINS=Object.freeze(['core_default']);
function getSkin(id){return SKINS[String(id||'')];}
function getWeaponSkin(id){return WEAPON_SKINS[String(id||'')];}
function normalizeOwnedSkins(value){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(value)?value:[]){
    const id=String(raw||'');
    if(!SKINS[id]||seen.has(id))continue;
    seen.add(id);out.push(id);
  }
  if(!seen.has('core_default'))out.unshift('core_default');
  return out;
}
function normalizeOwnedWeaponSkins(value){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(value)?value:[]){
    const id=String(raw||'');
    if(!WEAPON_SKINS[id]||seen.has(id))continue;
    seen.add(id);out.push(id);
  }
  return out;
}
function normalizeRedeemedCodes(value){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(value)?value:[]){
    const code=String(raw||'').trim().toUpperCase().slice(0,32);
    if(!code||!REDEEM_CODES[code]||seen.has(code))continue;
    seen.add(code);out.push(code);
  }
  return out;
}
function publicCatalog(){
  return Object.values(SKINS).map(s=>({id:s.id,name:s.name,rarity:s.rarity,type:'skin',style:s.style,priceGold:s.priceGold,priceDiamonds:s.priceDiamonds,redeemable:Object.values(REDEEM_CODES).some(x=>x.skinId===s.id||x.allSkins)}));
}
function publicArmorCatalog(){return publicCatalog();}
function publicWeaponCatalog(){return [];}
function publicRealMoneyOffers(){return REAL_MONEY_OFFERS.map(x=>({...x}));}
module.exports={SKINS,STARTER_SKINS,WEAPON_SKINS,REAL_MONEY_OFFERS,REDEEM_CODES,getSkin,getWeaponSkin,normalizeOwnedSkins,normalizeOwnedWeaponSkins,normalizeRedeemedCodes,publicCatalog,publicArmorCatalog,publicWeaponCatalog,publicRealMoneyOffers};
