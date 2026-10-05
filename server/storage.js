'use strict';

const { Pool } = require('pg');

let pool = null;
let storageReady = false;
let releaseInfo = {
  releaseId: '',
  schemaVersion: 0,
  updatedAt: 0
};

async function initStorage(releaseId = '', schemaVersion = 1) {
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

async function savePlayerData(saveKey, data) {
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
  savePlayerData,
  closeStorage,
  get enabled() {
    return storageReady;
  },
  get releaseInfo() {
    return { ...releaseInfo };
  }
};
