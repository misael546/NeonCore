'use strict';

const crypto = require('crypto');

let db = null;
let firebaseApp = null;
let storageReady = false;
let releaseInfo = { releaseId: '', schemaVersion: 0, updatedAt: 0 };

function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
function normalizeToken(token) {
  return String(token || '').trim().slice(0, 128);
}
function normalizeName(name) {
  return String(name || '').normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 20);
}
function nameKey(name) {
  return normalizeName(name).toLocaleLowerCase('en-US');
}
function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
}
function hashRecoveryCode(code) {
  return hash(normalizeRecoveryCode(code));
}
function accountRef(id) { return db.collection('darkpixel_accounts').doc(String(id)); }
function playerRef(key) { return db.collection('darkpixel_players').doc(String(key)); }
function nameRef(name) { return db.collection('darkpixel_account_names').doc(hash(nameKey(name))); }
function googleRef(sub) { return db.collection('darkpixel_google_accounts').doc(hash(String(sub || '').trim().slice(0, 128))); }
function tokenRef(token) { return db.collection('darkpixel_account_tokens').doc(hash(normalizeToken(token))); }
function recoveryRef(code) { return db.collection('darkpixel_recovery_codes').doc(hashRecoveryCode(code)); }

function cleanAccountDoc(data) {
  if (!data) return null;
  return {
    accountId: String(data.accountId || ''),
    name: normalizeName(data.name),
    playerSaveKey: String(data.playerSaveKey || data.accountId || ''),
    createdAt: String(data.createdAt || ''),
    updatedAt: String(data.updatedAt || '')
  };
}

function serviceAccountFromEnv() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    return {
      projectId: String(parsed.project_id || process.env.FIREBASE_PROJECT_ID || '').trim(),
      clientEmail: String(parsed.client_email || '').trim(),
      privateKey: String(parsed.private_key || '').replace(/\\n/g, '\n')
    };
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  return null;
}

async function initStorage(releaseId = '', schemaVersion = 1) {
  if (storageReady) return true;

  const credentials = serviceAccountFromEnv();
  if (!credentials?.projectId || !credentials?.clientEmail || !credentials?.privateKey) {
    console.log('[STORAGE] Firebase/Firestore no configurado.');
    return false;
  }

  try {
    if (Number(process.versions.node.split('.')[0]) < 22) {
      throw new Error('Firebase Admin SDK actual requiere Node.js 22 o superior.');
    }

    const { cert, getApps, initializeApp } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');

    const appName = 'darkpixel-firestore';
    firebaseApp = getApps().find(app => app.name === appName) ||
      initializeApp({
        credential: cert(credentials),
        projectId: credentials.projectId
      }, appName);

    db = getFirestore(firebaseApp);

    const cleanReleaseId = String(releaseId || 'unknown').slice(0, 128);
    const cleanSchemaVersion = Math.max(1, Number(schemaVersion) || 1);
    const runtimeRef = db.collection('darkpixel_runtime').doc('main');
    await runtimeRef.set({
      releaseId: cleanReleaseId,
      schemaVersion: cleanSchemaVersion,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    releaseInfo = {
      releaseId: cleanReleaseId,
      schemaVersion: cleanSchemaVersion,
      updatedAt: Date.now()
    };
    storageReady = true;
    console.log('[STORAGE] Google Firestore conectado: persistencia permanente activa · release=' +
      releaseInfo.releaseId + ' · schema=' + releaseInfo.schemaVersion);
    return true;
  } catch (error) {
    db = null;
    console.error('[STORAGE FIRESTORE INIT]', error?.stack || error);
    return false;
  }
}

async function loadPlayerData(saveKey) {
  if (!storageReady || !db || !saveKey) return null;
  try {
    const snap = await playerRef(saveKey).get();
    return snap.exists ? (snap.data()?.data || null) : null;
  } catch (error) {
    console.error('[STORAGE FIRESTORE LOAD]', error?.message || error);
    return null;
  }
}

async function loadPlayerDataByName(name) {
  if (!storageReady || !db) return null;
  const clean = normalizeName(name);
  if (!clean) return null;
  try {
    const named = await nameRef(clean).get();
    if (!named.exists) return null;
    const accountId = String(named.data()?.accountId || '');
    if (!accountId) return null;
    return await loadPlayerData(accountId);
  } catch (error) {
    console.error('[STORAGE FIRESTORE NAME LOAD]', error?.message || error);
    return null;
  }
}

async function findPlayerByName(name) {
  if (!storageReady || !db) return null;
  const clean = normalizeName(name);
  if (!clean) return null;
  try {
    const named = await nameRef(clean).get();
    if (!named.exists) return null;
    const saveKey = String(named.data()?.playerSaveKey || named.data()?.accountId || '');
    const data = await loadPlayerData(saveKey);
    return { ambiguous: false, saveKey, data };
  } catch (error) {
    console.error('[STORAGE FIRESTORE NAME OWNER]', error?.message || error);
    return null;
  }
}

async function createAccount(name) {
  if (!storageReady || !db) return { ok: false, reason: 'storage_unavailable' };
  const clean = normalizeName(name);
  const normalized = nameKey(clean);
  if (!clean) return { ok: false, reason: 'invalid_name' };

  const accountId = 'acc_' + crypto.randomUUID().replace(/-/g, '');
  const accountToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(accountToken);
  const now = new Date().toISOString();

  try {
    await db.runTransaction(async tx => {
      const nRef = nameRef(clean);
      const nSnap = await tx.get(nRef);
      if (nSnap.exists) throw Object.assign(new Error('name_taken'), { code: 'NAME_TAKEN' });

      tx.set(accountRef(accountId), {
        accountId, name: clean, nameNormalized: normalized,
        playerSaveKey: accountId, tokenHash,
        createdAt: now, updatedAt: now
      });
      tx.set(nRef, { accountId, playerSaveKey: accountId, name: clean, normalized });
      tx.set(tokenRef(accountToken), { accountId, createdAt: now });
    });

    return {
      ok: true, created: true, accountId, accountToken,
      name: clean, playerSaveKey: accountId,
      createdAt: now, updatedAt: now
    };
  } catch (error) {
    if (error?.code === 'NAME_TAKEN') return { ok: false, reason: 'name_taken' };
    console.error('[STORAGE FIRESTORE ACCOUNT CREATE]', error?.message || error);
    return { ok: false, reason: 'storage_error' };
  }
}

async function findAccountByToken(token) {
  if (!storageReady || !db) return null;
  const clean = normalizeToken(token);
  if (!clean) return null;
  try {
    const tokenSnap = await tokenRef(clean).get();
    if (!tokenSnap.exists) return null;
    const accountId = String(tokenSnap.data()?.accountId || '');
    if (!accountId) return null;
    const accountSnap = await accountRef(accountId).get();
    return cleanAccountDoc(accountSnap.exists ? accountSnap.data() : null);
  } catch (error) {
    console.error('[STORAGE FIRESTORE TOKEN AUTH]', error?.message || error);
    return null;
  }
}

async function findAccountByGoogleSub(googleSub) {
  if (!storageReady || !db) return null;
  const sub = String(googleSub || '').trim().slice(0, 128);
  if (!sub) return null;
  try {
    const linkSnap = await googleRef(sub).get();
    if (!linkSnap.exists) return null;
    const accountId = String(linkSnap.data()?.accountId || '');
    if (!accountId) return null;
    const accountSnap = await accountRef(accountId).get();
    return cleanAccountDoc(accountSnap.exists ? accountSnap.data() : null);
  } catch (error) {
    console.error('[STORAGE FIRESTORE GOOGLE AUTH]', error?.message || error);
    return null;
  }
}

async function createAccountWithGoogle(name, googleSub) {
  if (!storageReady || !db) return { ok: false, reason: 'storage_unavailable' };
  const clean = normalizeName(name);
  const normalized = nameKey(clean);
  const sub = String(googleSub || '').trim().slice(0, 128);
  if (!clean) return { ok: false, reason: 'invalid_name' };
  if (!sub) return { ok: false, reason: 'google_invalid' };

  const accountId = 'acc_' + crypto.randomUUID().replace(/-/g, '');
  const accountToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(accountToken);
  const now = new Date().toISOString();

  try {
    await db.runTransaction(async tx => {
      const nRef = nameRef(clean);
      const gRef = googleRef(sub);
      const nSnap = await tx.get(nRef);
      const gSnap = await tx.get(gRef);
      if (gSnap.exists) throw Object.assign(new Error('duplicate_google'), { code: 'DUP_GOOGLE' });
      if (nSnap.exists) throw Object.assign(new Error('name_taken'), { code: 'NAME_TAKEN' });

      tx.set(accountRef(accountId), {
        accountId, name: clean, nameNormalized: normalized,
        playerSaveKey: accountId, tokenHash, googleSub: sub,
        createdAt: now, updatedAt: now
      });
      tx.set(nRef, { accountId, playerSaveKey: accountId, name: clean, normalized });
      tx.set(gRef, { accountId });
      tx.set(tokenRef(accountToken), { accountId, createdAt: now });
    });

    return {
      ok: true, created: true, accountId, accountToken,
      name: clean, playerSaveKey: accountId,
      createdAt: now, updatedAt: now
    };
  } catch (error) {
    if (error?.code === 'DUP_GOOGLE') return { ok: false, reason: 'duplicate' };
    if (error?.code === 'NAME_TAKEN') return { ok: false, reason: 'name_taken' };
    console.error('[STORAGE FIRESTORE GOOGLE CREATE]', error?.message || error);
    return { ok: false, reason: 'storage_error' };
  }
}

async function importAccountFromLegacy(account, googleSub) {
  if (!storageReady || !db || !account?.accountId) return { ok: false, reason: 'storage_unavailable' };
  const clean = normalizeName(account.name);
  const sub = String(googleSub || '').trim().slice(0, 128);
  if (!clean || !sub) return { ok: false, reason: 'invalid_account' };
  const accountId = String(account.accountId).slice(0, 64);
  const playerSaveKey = String(account.playerSaveKey || accountId).slice(0, 96);
  const accountToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(accountToken);
  const now = new Date().toISOString();

  try {
    await db.runTransaction(async tx => {
      const aRef = accountRef(accountId);
      const nRef = nameRef(clean);
      const gRef = googleRef(sub);
      const existing = await tx.get(aRef);
      if (existing.exists) return;
      const nameSnap = await tx.get(nRef);
      const googleSnap = await tx.get(gRef);
      if (nameSnap.exists || googleSnap.exists) {
        throw Object.assign(new Error('duplicate'), { code: 'DUPLICATE' });
      }
      tx.set(aRef, {
        accountId, name: clean, nameNormalized: nameKey(clean),
        playerSaveKey, tokenHash, googleSub: sub,
        createdAt: String(account.createdAt || now),
        updatedAt: now
      });
      tx.set(nRef, { accountId, playerSaveKey, name: clean, normalized: nameKey(clean) });
      tx.set(gRef, { accountId });
      tx.set(tokenRef(accountToken), { accountId, createdAt: now });
    });

    return {
      ok: true, created: false, accountId, accountToken,
      name: clean, playerSaveKey,
      createdAt: String(account.createdAt || now), updatedAt: now
    };
  } catch (error) {
    console.error('[STORAGE FIRESTORE LEGACY IMPORT]', error?.message || error);
    return { ok: false, reason: 'storage_error' };
  }
}

async function renameAccount(accountId, newName) {
  if (!storageReady || !db) return { ok: false, reason: 'storage_unavailable' };
  const clean = normalizeName(newName);
  if (!clean) return { ok: false, reason: 'invalid_name' };

  try {
    let result = null;
    await db.runTransaction(async tx => {
      const aRef = accountRef(accountId);
      const snap = await tx.get(aRef);
      if (!snap.exists) throw Object.assign(new Error('account_not_found'), { code: 'ACCOUNT_NOT_FOUND' });
      const current = snap.data() || {};
      const oldName = normalizeName(current.name);
      const nRef = nameRef(clean);
      const oldRef = nameRef(oldName);
      const taken = await tx.get(nRef);
      if (taken.exists && String(taken.data()?.accountId || '') !== String(accountId)) {
        throw Object.assign(new Error('name_taken'), { code: 'NAME_TAKEN' });
      }
      const now = new Date().toISOString();
      tx.set(aRef, { name: clean, nameNormalized: nameKey(clean), updatedAt: now }, { merge: true });
      tx.set(nRef, {
        accountId: String(accountId), playerSaveKey: String(current.playerSaveKey || accountId),
        name: clean, normalized: nameKey(clean)
      });
      if (oldName && nameKey(oldName) !== nameKey(clean)) tx.delete(oldRef);
      result = {
        ok: true, accountId: String(accountId), name: clean,
        playerSaveKey: String(current.playerSaveKey || accountId),
        createdAt: String(current.createdAt || ''), updatedAt: now
      };
    });
    return result;
  } catch (error) {
    if (error?.code === 'ACCOUNT_NOT_FOUND') return { ok: false, reason: 'account_not_found' };
    if (error?.code === 'NAME_TAKEN') return { ok: false, reason: 'name_taken' };
    console.error('[STORAGE FIRESTORE RENAME]', error?.message || error);
    return { ok: false, reason: 'storage_error' };
  }
}

async function findAccountByName(name) {
  if (!storageReady || !db) return null;
  const clean = normalizeName(name);
  if (!clean) return null;
  try {
    const snap = await nameRef(clean).get();
    if (!snap.exists) return null;
    const accountId = String(snap.data()?.accountId || '');
    if (!accountId) return null;
    const accountSnap = await accountRef(accountId).get();
    return cleanAccountDoc(accountSnap.exists ? accountSnap.data() : null);
  } catch (error) {
    console.error('[STORAGE FIRESTORE ACCOUNT NAME]', error?.message || error);
    return null;
  }
}

function createRecoveryCode() {
  const raw = crypto.randomBytes(12).toString('hex').toUpperCase();
  return 'NEON-' + raw.slice(0, 8) + '-' + raw.slice(8, 16) + '-' + raw.slice(16, 24);
}

async function ensureAccountRecovery(accountId) {
  if (!storageReady || !db || !accountId) return null;
  try {
    let created = null;
    await db.runTransaction(async tx => {
      const aRef = accountRef(accountId);
      const snap = await tx.get(aRef);
      if (!snap.exists) return;
      const account = snap.data() || {};
      if (account.recoveryHash) return;
      const recoveryCode = createRecoveryCode();
      const hashValue = hashRecoveryCode(recoveryCode);
      tx.set(aRef, { recoveryHash: hashValue, updatedAt: new Date().toISOString() }, { merge: true });
      tx.set(recoveryRef(recoveryCode), { accountId: String(accountId) });
      created = recoveryCode;
    });
    return created ? { recoveryCode: created } : null;
  } catch (error) {
    console.error('[STORAGE FIRESTORE RECOVERY CREATE]', error?.message || error);
    return null;
  }
}

async function recoverAccountByCode(code) {
  if (!storageReady || !db) return null;
  const clean = normalizeRecoveryCode(code);
  if (clean.length < 20) return null;

  try {
    let recovered = null;
    await db.runTransaction(async tx => {
      const rRef = recoveryRef(clean);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists) return;
      const accountId = String(rSnap.data()?.accountId || '');
      if (!accountId) return;
      const aRef = accountRef(accountId);
      const aSnap = await tx.get(aRef);
      if (!aSnap.exists) return;
      const account = aSnap.data() || {};
      const accountToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hash(accountToken);
      const now = new Date().toISOString();
      if (account.tokenHash) tx.delete(tokenRefFromHash(account.tokenHash));
      tx.set(tokenRef(accountToken), { accountId, createdAt: now });
      tx.set(aRef, { tokenHash, updatedAt: now }, { merge: true });
      recovered = {
        accountId, name: normalizeName(account.name),
        playerSaveKey: String(account.playerSaveKey || accountId),
        accountToken,
        createdAt: String(account.createdAt || ''), updatedAt: now
      };
    });
    return recovered;
  } catch (error) {
    console.error('[STORAGE FIRESTORE ACCOUNT RECOVER]', error?.message || error);
    return null;
  }
}

function tokenRefFromHash(tokenHash) {
  return db.collection('darkpixel_account_tokens').doc(String(tokenHash || ''));
}

async function savePlayerData(saveKey, data) {
  if (!storageReady || !db || !saveKey) return false;
  try {
    await playerRef(saveKey).set({
      data: data || {},
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('[STORAGE FIRESTORE SAVE]', error?.message || error);
    return false;
  }
}

async function closeStorage() {
  db = null;
  firebaseApp = null;
  storageReady = false;
  releaseInfo = { releaseId: '', schemaVersion: 0, updatedAt: 0 };
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
  importAccountFromLegacy,
  renameAccount,
  findAccountByName,
  ensureAccountRecovery,
  recoverAccountByCode,
  savePlayerData,
  closeStorage,
  get enabled() { return storageReady; },
  get releaseInfo() { return { ...releaseInfo }; }
};
