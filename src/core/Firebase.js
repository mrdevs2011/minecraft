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
// ProceduralAvatar ID lari — serverdan GLB yuklanmaydi
const AVATAR_IDS = ['steve', 'alex', 'dream', 'notch', 'herobrine', 'creeper'];
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

// ─── Avatar (Firestore) ───────────────────────────────────────────────────────

/**
 * Foydalanuvchining avatarId ni Firestore users/{uid} ga string ko'rinishida saqlaydi.
 * @param {string} uid
 * @param {string} avatarId  — 'steve' | 'alex' | 'dream' | 'notch'
 */
export async function updateAvatarId(uid, avatarId) {
  if (!uid || !avatarId) return;
  try {
    await setDoc(doc(db, 'users', uid), { avatarId }, { merge: true });
    console.log('[Firebase] avatarId saqlandi:', avatarId);
  } catch (err) {
    console.error('[Firebase] avatarId saqlashda xato:', err);
  }
}

/**
 * Firestore users/{uid} dan avatarId ni string ko'rinishida qaytaradi.
 * Agar mavjud bo'lmasa — null qaytaradi.
 * @param {string} uid
 * @returns {Promise<string|null>}
 */
export async function getUserAvatarId(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const avatarId = snap.data().avatarId;
      return typeof avatarId === 'string' ? avatarId : null;
    }
  } catch (err) {
    console.error('[Firebase] avatarId o\'qishda xato:', err);
  }
  return null;
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

// ─── Game Clock — O'yin vaqti tizimi ─────────────────────────────────────────
// Vaqt MRLocal serverda saqlanadi (/mc/clock endpoint).
// { seconds } formatida — o'yin sekundlari saqlanadi.
// Firebase ga birorta so'rov yuborilmaydi.

let _clockInterval  = null;
let _gameSeconds    = null;  // null = hali yuklanmagan
let _clockLoadedAt  = null;  // seconds qachon yuklanganligi (Date.now())
let _clockSaveTimer = null;

async function _initClock() {
  try {
    const res = await fetch(`${_mrLocalUrl}/mc/clock`);
    if (res.ok) {
      const data = await res.json();
      const savedSeconds = data.seconds ?? 0;
      const savedAt      = data.savedAt  ?? Date.now();
      // Server o'chib yongan vaqtni ham hisobga olamiz
      const offlineElapsed = (Date.now() - savedAt) / 1000;
      _gameSeconds   = savedSeconds + offlineElapsed;
      _clockLoadedAt = Date.now();
      return;
    }
  } catch (err) {
    console.warn('[Clock] MRLocal dan vaqt olinmadi, 0 dan boshlanadi:', err.message);
  }
  _gameSeconds   = 0;
  _clockLoadedAt = Date.now();
}

async function _saveClock() {
  if (_gameSeconds === null || _clockLoadedAt === null) return;
  const elapsed = (Date.now() - _clockLoadedAt) / 1000;
  const seconds = Math.floor(_gameSeconds + elapsed);
  try {
    await fetch(`${_mrLocalUrl}/mc/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    });
  } catch (err) {
    console.warn('[Clock] Vaqtni saqlashda xato:', err.message);
  }
}

// Real UTC oy raqamiga (0-11) qarab fasl qaytaradi
function _getSeason(utcMonth) {
  if (utcMonth >= 2 && utcMonth <= 4) return 'spring';
  if (utcMonth >= 5 && utcMonth <= 7) return 'summer';
  if (utcMonth >= 8 && utcMonth <= 10) return 'autumn';
  return 'winter';
}

const SEASON_TIMES = {
  spring: { sunrise: 6.00,  sunset: 19.25 },
  summer: { sunrise: 5.25,  sunset: 20.00 },
  autumn: { sunrise: 6.75,  sunset: 18.25 },
  winter: { sunrise: 7.50,  sunset: 17.50 },
};

function _hoursToDayFraction(hours) {
  return hours / 24;
}

export function listenForClock(callback) {
  function tick() {
    // Clock hali yuklanmagan bo'lsa — kutamiz
    if (_gameSeconds === null || _clockLoadedAt === null) return;

    // Yuklanganidan beri o'tgan vaqtni qo'shamiz
    const elapsed    = (Date.now() - _clockLoadedAt) / 1000;
    const totalSecs  = _gameSeconds + elapsed;

    // O'yin kuni: har 1440 sekund = 1 kun
    const GAME_DAY_REAL_SECONDS = 24 * 60;
    const dayNumber = Math.floor(totalSecs / GAME_DAY_REAL_SECONDS);

    // O'yin soati: 0..24
    const gameSecondsInDay = totalSecs % GAME_DAY_REAL_SECONDS;
    const gameHoursFloat   = (gameSecondsInDay / GAME_DAY_REAL_SECONDS) * 24;
    const gameSeconds      = totalSecs / 60;

    const hours   = Math.floor(gameHoursFloat);
    const minutes = Math.floor((gameHoursFloat - hours) * 60);
    const seconds = Math.floor(((gameHoursFloat - hours) * 60 - minutes) * 60);

    // Fasl (haqiqiy UTC sanasiga qarab)
    const realDate = new Date();
    const utcMonth = realDate.getUTCMonth();
    const utcDay   = realDate.getUTCDate();
    const season   = _getSeason(utcMonth);
    const { sunrise, sunset } = SEASON_TIMES[season];

    // seasonT: fasl ichidagi pozitsiya 0..1 (smooth rang o'tishi uchun)
    // Har bir fasl ~3 oy = ~91 kun
    // Bahor: mart(2)–may(4), Yoz: iyun(5)–avg(7), Kuz: sen(8)–noy(10), Qish: dek(11)–fev(1)
    const SEASON_MONTHS = {
      spring: [2, 3, 4], summer: [5, 6, 7], autumn: [8, 9, 10], winter: [11, 0, 1],
    };
    const sMonths     = SEASON_MONTHS[season];
    const monthInSeason = sMonths.indexOf(utcMonth === 0 && season === 'winter' ? 0
                          : utcMonth === 1 && season === 'winter' ? 1 : utcMonth);
    const daysInMonth   = new Date(realDate.getUTCFullYear(), utcMonth + 1, 0).getDate();
    const seasonT       = Math.min(1, Math.max(0,
      (monthInSeason * 30 + utcDay - 1) / 90
    ));

    // dayFraction: 0 = yarim tun, 0.5 = tush
    const dayFraction = _hoursToDayFraction(gameHoursFloat);

    // Kun yoki tun ekanligini aniqlash uchun quyosh holati
    const isSunrise = gameHoursFloat >= sunrise && gameHoursFloat < sunrise + 0.5;
    const isSunset  = gameHoursFloat >= sunset  && gameHoursFloat < sunset  + 0.5;
    const isDay     = gameHoursFloat >= sunrise  && gameHoursFloat < sunset;
    const isNight   = !isDay;

    // Sunrise/sunset fractioni (0..1) — silliq o'tish uchun
    let sunriseFraction = 0;
    let sunsetFraction  = 0;
    if (isSunrise) sunriseFraction = (gameHoursFloat - sunrise) / 0.5;
    if (isSunset)  sunsetFraction  = (gameHoursFloat - sunset)  / 0.5;

    callback({
      dayNumber,
      hours,
      minutes,
      seconds,
      dayFraction,
      totalSeconds: Math.floor(gameSeconds),
      season,
      seasonT,
      sunrise,
      sunset,
      isDay,
      isNight,
      isSunrise,
      isSunset,
      sunriseFraction,
      sunsetFraction,
    });
  }

  // MRLocal dan vaqtni o'qib, keyin clock ni ishga tushir
  _initClock().then(() => {
    tick(); // tayyor — darhol birinchi tick
  });
  if (_clockInterval) clearInterval(_clockInterval);
  _clockInterval = setInterval(tick, 1000);

  // Har 30 soniyada MRLocal ga saqlash
  if (_clockSaveTimer) clearInterval(_clockSaveTimer);
  _clockSaveTimer = setInterval(_saveClock, 30_000);

  return () => {
    if (_clockInterval)  { clearInterval(_clockInterval);  _clockInterval  = null; }
    if (_clockSaveTimer) { clearInterval(_clockSaveTimer); _clockSaveTimer = null; }
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
        moving:    !!moving,
        avatarId:  avatarId || 'steve',
        ghost:     !!ghost,
        updatedAt: now,
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
        // updatedAt server yoki client tomonidan yozilishi mumkin
        // Agar updatedAt yo'q bo'lsa — hozirgi vaqtni ishlatamiz (filter qilinmasin)
        const age = p.updatedAt ? now - p.updatedAt : 0;
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
