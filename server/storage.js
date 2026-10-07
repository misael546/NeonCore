'use strict';

const { Pool } = require('pg');
const firestore = require('./firestore-storage');
const crypto = require('crypto');

let pool = null;
let storageReady = false;
let releaseInfo = {
  releaseId: '',
  schemaVersion: 0,
  updatedAt: 0
};

async function initStorage(releaseId = '', schemaVersion = 1) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') {
    const ok = await firestore.initStorage(releaseId, schemaVersion);
    if (ok) return true;
    console.error('[STORAGE] Firestore no pudo inicializarse; se conservará PostgreSQL como respaldo hasta corregir la conexión.');
    if (!process.env.DATABASE_URL) return false;
  }
  if (storageReady) return true;

  if (!process.env.DATABASE_URL) {
    console.log('[STORAGE] DATABASE_URL no configurada: usando memoria durante esta ejecución.');
    return false;
  }

  const sslDisabled = String(process.env.DATABASE_SSL || '').toLowerCase() === 'false';

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslDisabled ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (error) => {
    console.error('[STORAGE POOL]', error?.message || error);
  });

  await pool.query(
    'CREATE TABLE IF NOT EXISTS neoncore_players (' +
      'save_key VARCHAR(96) PRIMARY KEY,' +
      'data JSONB NOT NULL,' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
    ')'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS neoncore_players_updated_idx ' +
    'ON neoncore_players (updated_at)'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS neoncore_accounts (' +
      'account_id VARCHAR(64) PRIMARY KEY,' +
      'token_hash CHAR(64) NOT NULL UNIQUE,' +
      'name VARCHAR(20) NOT NULL,' +
      'name_normalized VARCHAR(20) NOT NULL UNIQUE,' +
      'player_save_key VARCHAR(96) NOT NULL UNIQUE,' +
      'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
    ')'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS neoncore_accounts_updated_idx ' +
    'ON neoncore_accounts (updated_at)'
  );

  await pool.query(
    'ALTER TABLE neoncore_accounts ADD COLUMN IF NOT EXISTS recovery_hash CHAR(64)'
  );

  await pool.query(
    'ALTER TABLE neoncore_accounts ADD COLUMN IF NOT EXISTS google_sub VARCHAR(128)'
  );

  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS neoncore_accounts_google_sub_idx ON neoncore_accounts (google_sub) WHERE google_sub IS NOT NULL'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS neoncore_runtime (' +
      'id SMALLINT PRIMARY KEY CHECK (id = 1),' +
      'release_id VARCHAR(128) NOT NULL,' +
      'schema_version INTEGER NOT NULL,' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
    ')'
  );

  const cleanReleaseId = String(releaseId || 'unknown').slice(0, 128);
  const cleanSchemaVersion = Math.max(1, Number(schemaVersion) || 1);

  await pool.query(
    'INSERT INTO neoncore_runtime (id, release_id, schema_version, updated_at) ' +
      'VALUES (1, $1, $2, NOW()) ' +
      'ON CONFLICT (id) DO UPDATE SET ' +
      'release_id = EXCLUDED.release_id, ' +
      'schema_version = EXCLUDED.schema_version, ' +
      'updated_at = NOW()',
    [cleanReleaseId, cleanSchemaVersion]
  );

  const runtime = await pool.query(
    'SELECT release_id, schema_version, updated_at FROM neoncore_runtime WHERE id = 1'
  );

  const row = runtime.rows[0];
  releaseInfo = {
    releaseId: String(row?.release_id || cleanReleaseId),
    schemaVersion: Number(row?.schema_version) || cleanSchemaVersion,
    updatedAt: row?.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  };

  storageReady = true;
  console.log(
    '[STORAGE] PostgreSQL conectado: persistencia permanente activa · release=' +
      releaseInfo.releaseId +
      ' · schema=' +
      releaseInfo.schemaVersion
  );
  return true;
}

async function loadPlayerData(saveKey) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.loadPlayerData(saveKey);
  if (!storageReady || !pool || !saveKey) return null;

  try {
    const result = await pool.query(
      'SELECT data FROM neoncore_players WHERE save_key = $1',
      [saveKey]
    );
    return result.rows[0]?.data || null;
  } catch (error) {
    console.error('[STORAGE LOAD QUERY]', error?.message || error);
    return null;
  }
}

async function loadPlayerDataByName(name) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.loadPlayerDataByName(name);
  if (!storageReady || !pool) return null;

  const cleanName = String(name || '').trim().slice(0, 20);
  if (!cleanName) return null;

  try {
    const result = await pool.query(
      'SELECT data FROM neoncore_players ' +
        'WHERE lower(trim(data->>\'name\')) = lower(trim($1)) ' +
        'ORDER BY updated_at DESC LIMIT 2',
      [cleanName]
    );

    if (result.rows.length !== 1) {
      if (result.rows.length > 1) {
        console.warn('[STORAGE MIGRATION] Nombre ambiguo; no se migrará:', cleanName);
      }
      return null;
    }

    return result.rows[0]?.data || null;
  } catch (error) {
    console.error('[STORAGE NAME LOAD QUERY]', error?.message || error);
    return null;
  }
}

async function findPlayerByName(name) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.findPlayerByName(name);
  if (!storageReady || !pool) return null;

  const cleanName = String(name || '').trim().slice(0, 20);
  if (!cleanName) return null;

  try {
    const result = await pool.query(
      'SELECT save_key, data FROM neoncore_players ' +
        'WHERE lower(trim(data->>\'name\')) = lower(trim($1)) ' +
        'ORDER BY updated_at DESC LIMIT 2',
      [cleanName]
    );

    if (result.rows.length !== 1) {
      if (result.rows.length > 1) {
        return { ambiguous: true, saveKey: '', data: null };
      }
      return null;
    }

    return {
      ambiguous: false,
      saveKey: String(result.rows[0].save_key || ''),
      data: result.rows[0].data || null
    };
  } catch (error) {
    console.error('[STORAGE NAME OWNER QUERY]', error?.message || error);
    return null;
  }
}

function normalizeAccountToken(token) {
  return String(token || '').trim().slice(0, 128);
}
function normalizeAccountName(name) {
  return String(name || '').normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 20);
}
function accountNameKey(name) {
  return normalizeAccountName(name).toLocaleLowerCase('en-US');
}
function hashAccountToken(token) {
  return crypto.createHash('sha256').update(normalizeAccountToken(token), 'utf8').digest('hex');
}
async function createAccount(name) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.createAccount(name);
  if (!storageReady || !pool) return { ok:false, reason:'storage_unavailable' };
  const cleanName=normalizeAccountName(name), normalized=accountNameKey(cleanName);
  if(!cleanName)return {ok:false,reason:'invalid_name'};
  const accountId='acc_'+crypto.randomUUID().replace(/-/g,'');
  const accountToken=crypto.randomBytes(32).toString('base64url');
  const tokenHash=hashAccountToken(accountToken);
  try{
    const result=await pool.query(
      'INSERT INTO neoncore_accounts (account_id, token_hash, name, name_normalized, player_save_key) '+
      'VALUES ($1,$2,$3,$4,$5) RETURNING account_id,name,player_save_key,created_at,updated_at',
      [accountId,tokenHash,cleanName,normalized,accountId]
    );
    const row=result.rows[0];
    return {
      ok:true,created:true,accountId:String(row.account_id),accountToken,
      name:String(row.name),playerSaveKey:String(row.player_save_key),
      createdAt:row.created_at?new Date(row.created_at).toISOString():new Date().toISOString(),
      updatedAt:row.updated_at?new Date(row.updated_at).toISOString():new Date().toISOString()
    };
  }catch(error){
    if(error?.code==='23505')return {ok:false,reason:'name_taken'};
    console.error('[STORAGE ACCOUNT CREATE]',error?.message||error);
    return {ok:false,reason:'storage_error'};
  }
}
async function findAccountByToken(token) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.findAccountByToken(token);
  if(!storageReady||!pool)return null;
  const clean=normalizeAccountToken(token);if(!clean)return null;
  try{
    const result=await pool.query(
      'SELECT account_id,name,player_save_key,created_at,updated_at FROM neoncore_accounts WHERE token_hash=$1 LIMIT 1',
      [hashAccountToken(clean)]
    );
    const row=result.rows[0];if(!row)return null;
    return {accountId:String(row.account_id||''),name:normalizeAccountName(row.name),
      playerSaveKey:String(row.player_save_key||row.account_id||''),
      createdAt:row.created_at?new Date(row.created_at).toISOString():'',
      updatedAt:row.updated_at?new Date(row.updated_at).toISOString():''};
  }catch(error){console.error('[STORAGE ACCOUNT AUTH]',error?.message||error);return null;}
}

async function findAccountByGoogleSub(googleSub) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.findAccountByGoogleSub(googleSub);
  if(!storageReady||!pool)return null;
  const clean=String(googleSub||'').trim().slice(0,128);if(!clean)return null;
  try{
    const result=await pool.query('SELECT account_id,name,player_save_key,created_at,updated_at FROM neoncore_accounts WHERE google_sub=$1 LIMIT 1',[clean]);
    const row=result.rows[0];if(!row)return null;
    return {accountId:String(row.account_id||''),name:normalizeAccountName(row.name),playerSaveKey:String(row.player_save_key||row.account_id||''),createdAt:row.created_at?new Date(row.created_at).toISOString():'',updatedAt:row.updated_at?new Date(row.updated_at).toISOString():''};
  }catch(error){console.error('[STORAGE GOOGLE AUTH]',error?.message||error);return null;}
}
async function createAccountWithGoogle(name,googleSub) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.createAccountWithGoogle(name,googleSub);
  if(!storageReady||!pool)return {ok:false,reason:'storage_unavailable'};
  const cleanName=normalizeAccountName(name),normalized=accountNameKey(cleanName),sub=String(googleSub||'').trim().slice(0,128);
  if(!cleanName)return {ok:false,reason:'invalid_name'}; if(!sub)return {ok:false,reason:'google_invalid'};
  const accountId='acc_'+crypto.randomUUID().replace(/-/g,'');
  const accountToken=crypto.randomBytes(32).toString('base64url');
  const tokenHash=hashAccountToken(accountToken);
  try{
    const result=await pool.query('INSERT INTO neoncore_accounts (account_id,token_hash,name,name_normalized,player_save_key,google_sub) VALUES ($1,$2,$3,$4,$5,$6) RETURNING account_id,name,player_save_key,created_at,updated_at',[accountId,tokenHash,cleanName,normalized,accountId,sub]);
    const row=result.rows[0];
    return {ok:true,created:true,accountId:String(row.account_id),accountToken,name:String(row.name),playerSaveKey:String(row.player_save_key),createdAt:row.created_at?new Date(row.created_at).toISOString():'',updatedAt:row.updated_at?new Date(row.updated_at).toISOString():''};
  }catch(error){if(error?.code==='23505')return {ok:false,reason:'duplicate'};console.error('[STORAGE GOOGLE CREATE]',error?.message||error);return {ok:false,reason:'storage_error'};}
}
async function renameAccount(accountId,newName){
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.renameAccount(accountId,newName);
  if(!storageReady||!pool)return {ok:false,reason:'storage_unavailable'};
  const clean=normalizeAccountName(newName),normalized=accountNameKey(clean);if(!clean)return {ok:false,reason:'invalid_name'};
  try{const result=await pool.query('UPDATE neoncore_accounts SET name=$2,name_normalized=$3,updated_at=NOW() WHERE account_id=$1 RETURNING account_id,name,player_save_key,created_at,updated_at',[String(accountId||''),clean,normalized]);const row=result.rows[0];if(!row)return {ok:false,reason:'account_not_found'};return {ok:true,accountId:String(row.account_id),name:String(row.name),playerSaveKey:String(row.player_save_key||row.account_id||''),createdAt:row.created_at?new Date(row.created_at).toISOString():'',updatedAt:row.updated_at?new Date(row.updated_at).toISOString():''};}
  catch(error){if(error?.code==='23505')return {ok:false,reason:'name_taken'};console.error('[STORAGE RENAME]',error?.message||error);return {ok:false,reason:'storage_error'};}
}
async function findAccountByName(name) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.findAccountByName(name);
  if(!storageReady||!pool)return null;
  const normalized=accountNameKey(name);if(!normalized)return null;
  try{
    const result=await pool.query(
      'SELECT account_id,name,player_save_key,created_at,updated_at FROM neoncore_accounts WHERE name_normalized=$1 LIMIT 1',
      [normalized]
    );
    const row=result.rows[0];if(!row)return null;
    return {accountId:String(row.account_id||''),name:normalizeAccountName(row.name),
      playerSaveKey:String(row.player_save_key||row.account_id||''),
      createdAt:row.created_at?new Date(row.created_at).toISOString():'',
      updatedAt:row.updated_at?new Date(row.updated_at).toISOString():''};
  }catch(error){console.error('[STORAGE ACCOUNT NAME]',error?.message||error);return null;}
}

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
}
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code), 'utf8').digest('hex');
}
function createRecoveryCode() {
  const raw = crypto.randomBytes(12).toString('hex').toUpperCase();
  return 'NEON-' + raw.slice(0, 8) + '-' + raw.slice(8, 16) + '-' + raw.slice(16, 24);
}
async function ensureAccountRecovery(accountId) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.ensureAccountRecovery(accountId);
  if (!storageReady || !pool || !accountId) return null;
  try {
    const current = await pool.query('SELECT recovery_hash FROM neoncore_accounts WHERE account_id=$1 LIMIT 1',[String(accountId)]);
    if (!current.rows[0] || current.rows[0].recovery_hash) return null;
    const recoveryCode = createRecoveryCode();
    const result = await pool.query('UPDATE neoncore_accounts SET recovery_hash=$2,updated_at=NOW() WHERE account_id=$1 AND recovery_hash IS NULL RETURNING account_id',[String(accountId),hashRecoveryCode(recoveryCode)]);
    return result.rows.length===1 ? {recoveryCode} : null;
  } catch (error) {
    console.error('[STORAGE RECOVERY CREATE]', error?.message || error);
    return null;
  }
}
async function recoverAccountByCode(code) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.recoverAccountByCode(code);
  if (!storageReady || !pool) return null;
  const clean = normalizeRecoveryCode(code);
  if (clean.length < 20) return null;
  try {
    const result = await pool.query('SELECT account_id,name,player_save_key,created_at,updated_at FROM neoncore_accounts WHERE recovery_hash=$1 LIMIT 1',[hashRecoveryCode(clean)]);
    const row = result.rows[0];
    if (!row) return null;
    const accountToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(accountToken,'utf8').digest('hex');
    const updated = await pool.query('UPDATE neoncore_accounts SET token_hash=$2,updated_at=NOW() WHERE account_id=$1 RETURNING account_id,name,player_save_key,created_at,updated_at',[String(row.account_id),tokenHash]);
    const next = updated.rows[0];
    if (!next) return null;
    return {accountId:String(next.account_id),name:normalizeAccountName(next.name),playerSaveKey:String(next.player_save_key||next.account_id||''),accountToken,createdAt:next.created_at?new Date(next.created_at).toISOString():'',updatedAt:next.updated_at?new Date(next.updated_at).toISOString():''};
  } catch (error) {
    console.error('[STORAGE ACCOUNT RECOVER]',error?.message||error);
    return null;
  }
}
async function savePlayerData(saveKey, data) {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.savePlayerData(saveKey,data);
  if (!storageReady || !pool || !saveKey) return false;

  try {
    await pool.query(
    'INSERT INTO neoncore_players (save_key, data, updated_at) ' +
      'VALUES ($1, $2::jsonb, NOW()) ' +
      'ON CONFLICT (save_key) ' +
      'DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()',
    [saveKey, JSON.stringify(data)]
    );
    return true;
  } catch (error) {
    console.error('[STORAGE SAVE QUERY]', error?.message || error);
    return false;
  }
}

async function closeStorage() {
  if (String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase') return firestore.closeStorage();
  if (pool) {
    await pool.end();
    pool = null;
  }

  storageReady = false;
  releaseInfo = {
    releaseId: '',
    schemaVersion: 0,
    updatedAt: 0
  };
}

module.exports = {
  initStorage,
  loadPlayerData,
  loadPlayerDataByName,
  findPlayerByName,
  createAccount,
  findAccountByToken,
  findAccountByGoogleSub,
  createAccountWithGoogle,
  renameAccount,
  findAccountByName,
  ensureAccountRecovery,
  recoverAccountByCode,
  savePlayerData,
  closeStorage,
  get enabled() {
    return String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase' ? firestore.enabled : storageReady;
  },
  get releaseInfo() {
    return String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase() === 'firebase' ? firestore.releaseInfo : { ...releaseInfo };
  },
  get provider() {
    if (firestore.enabled) return 'firestore';
    if (storageReady) return 'postgres';
    return 'memory';
  }
};
