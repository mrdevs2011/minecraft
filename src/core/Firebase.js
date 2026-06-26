// Firebase setup — Google Authentication + faqat users collection
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyAgo4ze3DobLkv0G6belK2yHjTptaRH6Z8",
  authDomain: "mrcraft.firebaseapp.com",
  projectId: "mrcraft",
  storageBucket: "mrcraft.firebasestorage.app",
  messagingSenderId: "1036625112887",
  appId: "1:1036625112887:web:767775337ba57ef01674b2"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ─── MRLocal server URL — Firestore tunnel/active dan REALTIME kuzatiladi ────
let _mrLocalUrl = 'http://localhost:3748';
let _urlUnsub   = null;

function _applyTunnelSnap(snap) {
  const data = snap.exists() ? snap.data() : null;
  const url  = data?.url || null;
  const next = url ? url.replace(/\/$/, '') : 'http://localhost:3748';
  if (next !== _mrLocalUrl) {
    _mrLocalUrl = next;
    console.log('[MRLocal] URL yangilandi (realtime):', _mrLocalUrl);
    _reconnectWebSocket();
  }
}

export async function initMrLocalUrl() {
  try {
    const snap = await getDoc(doc(db, 'tunnel', 'active'));
    _applyTunnelSnap(snap);
  } catch (err) {
    console.warn('[MRLocal] Boshlang\'ich URL o\'qilmadi:', err.message);
  }
  if (_urlUnsub) _urlUnsub();
  _urlUnsub = onSnapshot(
    doc(db, 'tunnel', 'active'),
    _applyTunnelSnap,
    (err) => console.warn('[MRLocal] Realtime kuzatuv xato:', err.message)
  );
}

export function getMrLocalUrl() { return _mrLocalUrl; }

// ─── WebSocket real-time blok sinxi ──────────────────────────────────────────

let _ws           = null;
let _wsOnChange   = null;
let _wsRetryTimer = null;
let _wsConnected  = false;

function _connectWebSocket() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  if (_wsRetryTimer) { clearTimeout(_wsRetryTimer); _wsRetryTimer = null; }
  try {
    const wsUrl = _mrLocalUrl.replace(/^http/, 'ws');
    console.log('[WS] Ulanmoqda:', wsUrl);
    _ws = new WebSocket(wsUrl);
    _ws.onopen    = () => { _wsConnected = true; console.log('[WS] Ulandi ✅'); };
    _ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'block' && _wsOnChange) {
          const key = `${msg.x}_${msg.y}_${msg.z}`;
          const ex  = _memBlockChanges.get(key);
          if (!ex || ex.updatedAt < msg.updatedAt) {
            _memBlockChanges.set(key, msg);
            _wsOnChange(msg.x, msg.y, msg.z, msg.id);
          }
        }
        if (msg.type === 'batch' && _wsOnChange) {
          for (const item of msg.items) {
            const key = `${item.x}_${item.y}_${item.z}`;
            const ex  = _memBlockChanges.get(key);
            if (!ex || ex.updatedAt < item.updatedAt) {
              _memBlockChanges.set(key, item);
              _wsOnChange(item.x, item.y, item.z, item.id);
            }
          }
        }
        if (msg.type === 'clear_blocks') {
          _memBlockChanges.clear();
          _blocksFetched = false;
        }
      } catch {}
    };
    _ws.onclose = () => {
      _wsConnected = false;
      console.warn('[WS] Uzildi — 4s dan keyin qayta urinadi');
      _ws = null;
      _wsRetryTimer = setTimeout(_connectWebSocket, 4000);
    };
    _ws.onerror = () => {};
  } catch (err) {
    console.error('[WS] Ulanishda xato:', err);
    _wsRetryTimer = setTimeout(_connectWebSocket, 4000);
  }
}

function _reconnectWebSocket() {
  if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
  _wsConnected = false;
  _connectWebSocket();
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AVATAR_IDS = ['steve', 'alex', 'ari', 'noor', 'makena', 'efe', 'zuri', 'kai'];
function randomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result   = await signInWithPopup(auth, provider);
  return result.user;
}

export function signOutUser() { return signOut(auth); }

export function waitForAuthReady() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

// ─── Users collection (Firestore) — faqat profil ma'lumotlari ────────────────

export async function saveUserProfile(user) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid:         user.uid,
      displayName: user.displayName || 'Player',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      avatarId:    randomAvatarId(),
      createdAt:   new Date().toISOString(),
      lastLogin:   new Date().toISOString(),
    });
  } else {
    await setDoc(ref, { lastLogin: new Date().toISOString() }, { merge: true });
  }
}

export function listenForUserProfile(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), snap => {
    if (snap.exists()) callback(snap.data());
  }, err => console.error('User profile listener error:', err));
}

// ─── Pozitsiya (MRLocal) ──────────────────────────────────────────────────────

let _posAutoSaveTimer = null;

export function startPositionAutoSave(uid, getPlayerFn) {
  if (_posAutoSaveTimer) clearInterval(_posAutoSaveTimer);
  _posAutoSaveTimer = setInterval(async () => {
    const p = getPlayerFn();
    if (!p) return;
    try {
      await fetch(`${_mrLocalUrl}/mc/user/${uid}/position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x:       Math.round(p.x   * 100)  / 100,
          y:       Math.round(p.y   * 100)  / 100,
          z:       Math.round(p.z   * 100)  / 100,
          yaw:     Math.round(p.yaw * 1000) / 1000,
          savedAt: Date.now(),
        }),
      });
    } catch (err) { console.error('[MRLocal] Save position failed:', err); }
  }, 10_000);
}

export function stopPositionAutoSave() {
  if (_posAutoSaveTimer) { clearInterval(_posAutoSaveTimer); _posAutoSaveTimer = null; }
}

export async function loadLastPosition(uid) {
  if (!uid) return null;
  try {
    const res = await fetch(`${_mrLocalUrl}/mc/user/${uid}/position`);
    if (!res.ok) return null;
    const pos = await res.json();
    if (typeof pos.x !== 'number') return null;
    return pos;
  } catch (err) {
    console.error('[MRLocal] Load position failed:', err);
    return null;
  }
}

// ─── Inventory (MRLocal) ──────────────────────────────────────────────────────

export async function saveUserInventory(uid, inventory) {
  if (!uid) return;
  try {
    await fetch(`${_mrLocalUrl}/mc/user/${uid}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory }),
    });
  } catch (err) { console.error('[MRLocal] Save inventory failed:', err); }
}

export async function loadUserInventory(uid) {
  if (!uid) return null;
  try {
    const res = await fetch(`${_mrLocalUrl}/mc/user/${uid}/inventory`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.inventory || null;
  } catch (err) {
    console.error('[MRLocal] Load inventory failed:', err);
    return null;
  }
}

// ─── Bloklar cache (MRLocal) ──────────────────────────────────────────────────

const _memBlockChanges     = new Map();
const _pendingBlockChanges = new Map();
let   _blockFlushTimer     = null;
let   _blocksFetched       = false;

async function _flushBlockChanges() {
  _blockFlushTimer = null;
  if (_pendingBlockChanges.size === 0) return;
  const items = Array.from(_pendingBlockChanges.values());
  _pendingBlockChanges.clear();
  try {
    await fetch(`${_mrLocalUrl}/mc/blocks/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
  } catch (err) { console.error('[MRLocal] Block batch flush failed:', err); }
}

export async function fetchAllBlockChanges() {
  if (!_blocksFetched) {
    try {
      const res = await fetch(`${_mrLocalUrl}/mc/blocks`);
      if (res.ok) {
        const data  = await res.json();
        const items = Array.isArray(data) ? data : Object.values(data);
        items.forEach(item => _memBlockChanges.set(`${item.x}_${item.y}_${item.z}`, item));
        _blocksFetched = true;
        console.log(`[MRLocal] Loaded ${_memBlockChanges.size} block changes`);
      }
    } catch (err) { console.error('[MRLocal] Block load failed:', err); }
  }
  return Array.from(_memBlockChanges.values());
}

export function rotateCacheOnExit() {
  if (_blockFlushTimer) { clearTimeout(_blockFlushTimer); _flushBlockChanges(); }
}

export function blockDocId(x, y, z) { return `${x}_${y}_${z}`; }

export async function pushBlockChange(x, y, z, id) {
  const docId = blockDocId(x, y, z);
  const data  = { x, y, z, id, updatedAt: Date.now() };
  _memBlockChanges.set(docId, data);
  _pendingBlockChanges.set(docId, data);
  if (!_blockFlushTimer) _blockFlushTimer = setTimeout(_flushBlockChanges, 400);
}

export function listenForBlockChanges(onChange) {
  _wsOnChange = onChange;
  _connectWebSocket();

  const fallbackInterval = setInterval(async () => {
    if (_wsConnected) return;
    try {
      const res = await fetch(`${_mrLocalUrl}/mc/blocks`);
      if (!res.ok) return;
      const data  = await res.json();
      const items = Array.isArray(data) ? data : Object.values(data);
      items.forEach(item => {
        const key = `${item.x}_${item.y}_${item.z}`;
        const ex  = _memBlockChanges.get(key);
        if (!ex || ex.updatedAt < item.updatedAt) {
          _memBlockChanges.set(key, item);
          onChange(item.x, item.y, item.z, item.id);
        }
      });
    } catch {}
  }, 5000);

  return () => {
    _wsOnChange = null;
    clearInterval(fallbackInterval);
    if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
    if (_wsRetryTimer) { clearTimeout(_wsRetryTimer); _wsRetryTimer = null; }
  };
}

export const blocksCollection = null;

// ─── Chunk cache (MRLocal) ────────────────────────────────────────────────────

const _chunkMemCache = new Map();

export async function fetchChunkFromCache(cx, cz) {
  const key = `${cx}_${cz}`;
  if (_chunkMemCache.has(key)) return _chunkMemCache.get(key);
  try {
    const res = await fetch(`${_mrLocalUrl}/mc/chunk/${cx}/${cz}`);
    if (!res.ok) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    _chunkMemCache.set(key, arr);
    return arr;
  } catch (err) {
    console.error('[MRLocal] Chunk fetch failed:', err);
    return null;
  }
}

export function pushChunkToCache(cx, cz, uint8data) {
  _chunkMemCache.set(`${cx}_${cz}`, uint8data);
  fetch(`${_mrLocalUrl}/mc/chunk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Chunk-Cx': String(cx),
      'X-Chunk-Cz': String(cz),
    },
    body: uint8data,
  }).catch(err => console.error('[MRLocal] Chunk push failed:', err));
}

// ─── Game Clock — haqiqiy real vaqt (Unix timestamp) ──────────────────────────
// Date.now() barcha clientlarda bir xil (UTC), refresh ta'sir qilmaydi.
// Callback: { dayNumber, hours, minutes, seconds, dayFraction }

let _clockInterval = null;

// O'yin epoch: 1 Yanvar 2024 = Day 1
const GAME_EPOCH_MS = new Date('2024-01-01T00:00:00Z').getTime();

export function listenForClock(callback) {
  function tick() {
    const now  = Date.now();
    const ms   = now - GAME_EPOCH_MS;
    const totalSeconds = Math.floor(ms / 1000);
    const dayNumber    = Math.floor(ms / 86400000) + 1;

    // UTC soat
    const d       = new Date(now);
    const hours   = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    const seconds = d.getUTCSeconds();

    const dayFraction = (hours * 3600 + minutes * 60 + seconds) / 86400;
    callback({ dayNumber, hours, minutes, seconds, dayFraction, totalSeconds });
  }

  tick(); // darhol chaqir
  if (_clockInterval) clearInterval(_clockInterval);
  _clockInterval = setInterval(tick, 1000);

  return () => {
    if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
  };
}

// ─── Player positions (MRLocal) ───────────────────────────────────────────────

const _lastPushedPosition = new Map();
const POS_EPSILON  = 0.05;
const YAW_EPSILON  = 0.02;
const HEARTBEAT_MS = 8000;

export async function pushPlayerPosition(uid, displayName, x, y, z, yaw, moving, avatarId = 'steve', ghost = false) {
  const last = _lastPushedPosition.get(uid);
  const now  = Date.now();
  if (last &&
      Math.abs(last.x - x)     < POS_EPSILON &&
      Math.abs(last.y - y)     < POS_EPSILON &&
      Math.abs(last.z - z)     < POS_EPSILON &&
      Math.abs(last.yaw - yaw) < YAW_EPSILON &&
      last.moving   === !!moving &&
      last.avatarId === avatarId &&
      last.ghost    === !!ghost &&
      (now - last.at) < HEARTBEAT_MS) return;

  try {
    await fetch(`${_mrLocalUrl}/mc/players/${uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid, displayName: displayName || 'Player',
        x, y, z, yaw,
        moving:   !!moving,
        avatarId: avatarId || 'steve',
        ghost:    !!ghost,
      }),
    });
    _lastPushedPosition.set(uid, { x, y, z, yaw, moving: !!moving, avatarId, ghost: !!ghost, at: now });
  } catch (err) { console.error('[MRLocal] Push player position failed:', err); }
}

export async function removePlayerDoc(uid) {
  _lastPushedPosition.delete(uid);
  try {
    await fetch(`${_mrLocalUrl}/mc/players/${uid}`, { method: 'DELETE' });
  } catch (err) { console.error('[MRLocal] Remove player doc failed:', err); }
}

let _playersInterval = null;

export function listenForPlayers(myUid, callback) {
  const poll = async () => {
    try {
      const res = await fetch(`${_mrLocalUrl}/mc/players`);
      if (!res.ok) return;
      const data = await res.json();
      const map  = new Map();
      const now  = Date.now();
      for (const p of Object.values(data)) {
        if (p.uid === myUid) continue;
        const age = now - (p.updatedAt || 0);
        if (age > 60_000) continue;
        p.isGhost = !!p.ghost || age > 10_000;
        map.set(p.uid, p);
      }
      callback(map);
    } catch {}
  };

  poll();
  if (_playersInterval) clearInterval(_playersInterval);
  _playersInterval = setInterval(poll, 2000);

  return () => {
    if (_playersInterval) { clearInterval(_playersInterval); _playersInterval = null; }
  };
}
