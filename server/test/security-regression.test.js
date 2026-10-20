'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');

const serverPath = path.resolve(__dirname, '..', 'server.js');
const serverSource = require('node:fs').readFileSync(serverPath, 'utf8');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function openSocket(port, timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const state = { socket, queue: [], waiters: [], opened: false };
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error('Timed out waiting for the test server WebSocket.'));
    }, timeoutMs);

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const waiterIndex = state.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = state.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timeout);
        waiter.resolve(message);
      } else {
        state.queue.push(message);
      }
    });

    socket.once('open', () => {
      state.opened = true;
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(state);
    });

    socket.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForMessage(state, predicate, timeoutMs = 2500) {
  const queuedIndex = state.queue.findIndex(predicate);
  if (queuedIndex >= 0) return Promise.resolve(state.queue.splice(queuedIndex, 1)[0]);

  return new Promise((resolve, reject) => {
    const waiter = {
      predicate,
      resolve,
      reject,
      timeout: setTimeout(() => {
        const index = state.waiters.indexOf(waiter);
        if (index >= 0) state.waiters.splice(index, 1);
        reject(new Error('Timed out waiting for a matching server message.'));
      }, timeoutMs)
    };
    state.waiters.push(waiter);
  });
}

test('server starts, refuses unauthenticated room entry, and fails closed without durable storage', { timeout: 20000 }, async (t) => {
  const port = await getFreePort();
  let output = '';
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: '',
      STORAGE_PROVIDER: '',
      FIREBASE_SERVICE_ACCOUNT_JSON: '',
      FIREBASE_PROJECT_ID: '',
      FIREBASE_CLIENT_EMAIL: '',
      FIREBASE_PRIVATE_KEY: '',
      GOOGLE_CLIENT_ID: '',
      ENABLE_TEST_REDEEM_CODES: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  let state = null;
  const deadline = Date.now() + 10000;
  while (!state && Date.now() < deadline && child.exitCode === null) {
    try {
      state = await openSocket(port, 450);
    } catch {
      await delay(100);
    }
  }

  t.after(async () => {
    if (state?.socket && state.socket.readyState !== WebSocket.CLOSED) {
      try { state.socket.terminate(); } catch {}
    }
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(2500)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });

  assert.ok(state, 'server should start successfully. Output:\n' + output);
  const greeting = await waitForMessage(state, (message) => message.type === 'connected');
  assert.equal(greeting.releaseId, 'V3');

  state.socket.send(JSON.stringify({ type: 'join_room', code: '12345' }));
  const joinAttempt = await waitForMessage(state, (message) => message.type === 'room_error');
  assert.equal(joinAttempt.reason, 'auth_required');

  state.socket.send(JSON.stringify({ type: 'create_room' }));
  const createAttempt = await waitForMessage(state, (message) => message.type === 'room_error');
  assert.equal(createAttempt.reason, 'auth_required');

  state.socket.send(JSON.stringify({
    type: 'join',
    name: 'TestPlayer',
    googleIdToken: 'not-a-real-google-token',
    room: '12345'
  }));
  const loginAttempt = await waitForMessage(state, (message) => message.type === 'room_error');
  assert.equal(loginAttempt.reason, 'storage_unavailable');

  const healthResponse = await fetch('http://127.0.0.1:' + port + '/health');
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.storage, 'memory');
  assert.equal(health.diagnostics.storageReady, false);
  assert.equal(health.rooms, 2, 'unauthenticated room creation must not allocate additional rooms');
  const roomsResponse = await fetch('http://127.0.0.1:' + port + '/rooms');
  assert.equal(roomsResponse.status, 200);
  const roomList = await roomsResponse.json();
  assert.equal(roomList.rooms.find((room) => room.code === '12345')?.players, 0,
    'unauthenticated sockets must not be counted in public rooms');
});

test('retired server notifier and undefined enemy-grid identifiers stay removed', () => {
  assert.doesNotMatch(serverSource, /\begridCenter\b/);
  assert.doesNotMatch(serverSource, /startServerUpdateHeartbeat\s*\(/);
  assert.match(serverSource, /if\s*\(!p\.joined\s*\|\|\s*!p\.accountId\s*\|\|\s*!p\.saveKey\)/);
});

test('master and chat-issued test rewards require explicit authorized test mode', () => {
  assert.match(serverSource, /ENABLE_TEST_REDEEM_CODES\s*===\s*'true'/);
  assert.match(serverSource, /DARKPIXEL_ADMIN_ACCOUNT_IDS/);
  assert.match(serverSource, /code === 'NEONMASTER' && !isAuthorizedTestAdmin\(p\)/);
  assert.match(serverSource, /if \(!isAuthorizedTestAdmin\(p\)\)/);
});

test('recovery throttling ignores spoofed forwarding headers unless proxy is trusted', () => {
  assert.match(serverSource, /TRUSTED_PROXY_IPS/);
  assert.match(serverSource, /if \(!TRUSTED_PROXY_IPS\.has\(remote\)\) return remote/);
  assert.match(serverSource, /recoveryRateLimitCleanup\.unref\(\)/);
});
