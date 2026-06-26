import { getBlock, BLOCK_LEAVES, BLOCK_WOOD, BLOCK_PLANKS } from '../world/Blocks.js';
import * as THREE from 'three';
import { buildTextureAtlas } from '../world/TextureAtlas.js';

// Faslga qarab blok nomini qaytaradi
const SEASON_BLOCK_NAMES = {
  leaves: { spring: 'Bahor barglari', summer: 'Barglar',    autumn: 'Kuz barglari', winter: 'Muzlagan barglar' },
  wood:   { spring: 'Ho\'l eman po\'stlog\'i', summer: 'Quruq eman po\'stlog\'i', autumn: 'Kuz eman po\'stlog\'i', winter: 'Muzlagan eman po\'stlog\'i' },
  planks: { spring: 'Nam eman taxtasi', summer: 'Quruq eman taxtasi', autumn: 'Kuz eman taxtasi', winter: 'Sovuq eman taxtasi' },
};
export function getSeasonBlockName(blockId, season) {
  if (!season) return getBlock(blockId).name;
  if (blockId === BLOCK_LEAVES) return SEASON_BLOCK_NAMES.leaves[season] || getBlock(blockId).name;
  if (blockId === BLOCK_WOOD)   return SEASON_BLOCK_NAMES.wood[season]   || getBlock(blockId).name;
  if (blockId === BLOCK_PLANKS) return SEASON_BLOCK_NAMES.planks[season] || getBlock(blockId).name;
  return getBlock(blockId).name;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HotbarRenderer — 9 ta slot uchun bitta shared Three.js renderer
//  Har bir slot o'z <canvas> iga ega, lekin texture atlas ulashiladi
// ─────────────────────────────────────────────────────────────────────────────
class HotbarRenderer {
  constructor() {
    this._ready = false;
    this._slots = []; // { canvas, scene, camera, cube }
    this._atlas  = null;
    this._getUV  = null;
    this._renderer = null;
    this._init();
  }

  _init() {
    // Shared atlas
    const atlas = buildTextureAtlas();
    this._atlas = atlas.texture;
    this._getUV = atlas.getUV;

    // Shared WebGL renderer (offscreen, framebuffer orqali har slot ga render)
    this._renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this._renderer.setPixelRatio(1);
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    this._ready = true;
  }

  // Bir slot uchun scene + camera + cube yaratadi
  _buildSlotScene(blockId) {
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    // Minecraft hotbar ko'rinishi: pastdan qarash — top yuz katta, yon yuzlar pastda
    camera.position.set(1.8, -1.2, 2.4);
    camera.lookAt(0, 0, 0);

    // Minecraft uslubi yorug'lik: top yuz eng yorqin, yon yuzlar qoraygan
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirTop = new THREE.DirectionalLight(0xffffff, 1.1);
    dirTop.position.set(0, 1, 0);   // to'g'ridan yuqoridan — top yuzni yorqin qiladi
    scene.add(dirTop);
    const dirFront = new THREE.DirectionalLight(0xffffff, 0.55);
    dirFront.position.set(1, 0, 1); // old-o'ng yon yuzga
    scene.add(dirFront);

    const cube = this._makeCube(blockId);
    if (cube) scene.add(cube);

    return { scene, camera, cube };
  }

  // blockId bo'yicha atlas-textured kub yasash
  _makeCube(blockId) {
    if (!blockId || blockId === 0) return null;
    const def = getBlock(blockId);
    if (!def || !def.solid && def.name !== 'Water' && def.name !== 'Lava') {
      // Suyuq yoki havo — oddiy rangdor kub
    }

    const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const faceNames = ['side', 'side', 'top', 'bottom', 'side', 'side'];

    const materials = faces.map((_, i) => {
      const [u0, v0, u1, v1] = this._getUV(blockId, faceNames[i]);
      const mat = new THREE.MeshStandardMaterial({
        map: this._atlas,
        transparent: def.alpha !== undefined,
        opacity: def.alpha ?? 1.0,
      });
      // UV offset + repeat uchun matga alohida atlasTexture reference
      // (har material uchun alohida texture bo'lishi kerak — offset farqli)
      const tex = this._atlas.clone();
      tex.needsUpdate = false;
      tex.offset.set(u0, 1 - v1);
      tex.repeat.set(u1 - u0, v1 - v0);
      mat.map = tex;
      return mat;
    });

    const geo  = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geo, materials);
    mesh.rotation.x = -0.55;   // yuqorini ko'rsatish uchun oldinga egiladi (manfiy = pastdan qarash)
    mesh.rotation.y = Math.PI / 4;  // 45° aylantirilgan — chap/o'ng yon yuzlar teng ko'rinadi
    return mesh;
  }

  // blockId o'zgarsa kubni yangilaymiz
  _updateCubeMaterial(entry, blockId) {
    if (entry.cube) {
      entry.scene.remove(entry.cube);
      entry.cube.geometry.dispose();
      entry.cube.material.forEach(m => { m.map?.dispose(); m.dispose(); });
      entry.cube = null;
    }
    if (blockId && blockId !== 0) {
      entry.cube = this._makeCube(blockId);
      if (entry.cube) entry.scene.add(entry.cube);
    }
  }

  // canvas elementini tayyorlab, render qiladi
  renderToCanvas(canvas, blockId) {
    if (!this._ready) return;
    const size = canvas.width;

    this._renderer.setSize(size, size);

    // Slot sahnasini topamiz (yoki yaratamiz)
    let entry = canvas._slotEntry;
    if (!entry) {
      entry = this._buildSlotScene(blockId);
      entry.lastBlockId = blockId;
      canvas._slotEntry = entry;
    } else if (entry.lastBlockId !== blockId) {
      this._updateCubeMaterial(entry, blockId);
      entry.lastBlockId = blockId;
    }

    if (!blockId || blockId === 0) {
      const ctx2d = canvas.getContext('2d');
      ctx2d.clearRect(0, 0, size, size);
      return;
    }

    // Asl canvas ga rasm chizib, nusxa olish
    this._renderer.render(entry.scene, entry.camera);
    const ctx2d = canvas.getContext('2d');
    ctx2d.clearRect(0, 0, size, size);
    ctx2d.drawImage(this._renderer.domElement, 0, 0, size, size);
  }

  dispose() {
    this._renderer.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HUD
// ─────────────────────────────────────────────────────────────────────────────
export class HUD {
  constructor(player, user = null) {
    this.player = player;
    this._hotbarRenderer = new HotbarRenderer();
    this._slotCanvases   = [];  // 9 ta canvas
    this._lastSlotIds    = new Array(9).fill(-999); // o'zgarish deteksiyasi
    this._season         = 'summer'; // faslga qarab blok nomi uchun

    this._buildHotbar();
    this._buildViewIndicator();
    this._initPlayerBadge(user || window._mcUser);
    this._buildClock();
    this.initDamageOverlay();
  }

  _initPlayerBadge(user) {
    if (!user) return;
    const nameEl  = document.getElementById('badge-name');
    const photoEl = document.getElementById('badge-photo');
    if (nameEl)  nameEl.textContent = user.displayName || user.email || '';
    if (photoEl && user.photoURL) {
      photoEl.src = user.photoURL;
      photoEl.onload = () => photoEl.classList.add('loaded');
      photoEl.onerror = () => {};
    }
  }

  _buildHotbar() {
    const hotbar = document.getElementById('hotbar');
    hotbar.innerHTML = '';

    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === 0 ? ' active' : '');
      slot.id = `hotbar-slot-${i}`;
      slot.style.cssText = 'position:relative;background:transparent;';

      // 3D kub uchun canvas
      const cvs = document.createElement('canvas');
      const SIZE = 44;
      cvs.width  = SIZE;
      cvs.height = SIZE;
      cvs.style.cssText = `
        display:block;
        width:${SIZE}px; height:${SIZE}px;
        image-rendering:pixelated;
      `;
      slot.appendChild(cvs);
      this._slotCanvases.push(cvs);

      // Soni (count label)
      const count = document.createElement('span');
      count.className = 'count';
      slot.appendChild(count);

      hotbar.appendChild(slot);
    }
  }

  _buildViewIndicator() {
    const debug = document.getElementById('debug-info');
    if (!document.getElementById('view-hint')) {
      const hint = document.createElement('div');
      hint.id = 'view-hint';
      hint.style.cssText = 'margin-top:4px;color:#ffe080;font-size:11px;';
      hint.textContent = 'F5 — kamera rejimini almashtirish';
      debug.after(hint);
    }
  }

  _buildClock() {
    if (document.getElementById('game-clock')) return;

    // ── Asosiy soat elementi (har doim ko'rinadi) ──
    const clock = document.createElement('div');
    clock.id = 'game-clock';
    clock.style.cssText = [
      'position:fixed', 'top:12px', 'right:16px',
      'color:#fff', 'font-size:15px', 'font-family:monospace', 'font-weight:bold',
      'text-shadow:0 0 4px #000, 0 1px 2px #000',
      'background:rgba(0,0,0,0.38)', 'padding:4px 11px',
      'border-radius:8px', 'letter-spacing:1px',
      'z-index:9999', 'cursor:pointer', 'user-select:none',
      'transition:background 0.15s',
    ].join(';');
    clock.textContent = '00:00';

    // ── Tooltip panel (hover da ko'rinadi) ──
    const tip = document.createElement('div');
    tip.id = 'game-clock-tip';
    tip.style.cssText = [
      'position:fixed', 'top:46px', 'right:16px',
      'color:#fff', 'font-size:13px', 'font-family:monospace',
      'background:rgba(0,0,0,0.72)', 'padding:8px 14px',
      'border-radius:8px', 'line-height:1.7',
      'z-index:9998', 'pointer-events:none', 'user-select:none',
      'opacity:0', 'transform:translateY(-4px)',
      'transition:opacity 0.18s ease, transform 0.18s ease',
      'backdrop-filter:blur(2px)', 'border:1px solid rgba(255,255,255,0.12)',
      'min-width:170px',
    ].join(';');
    tip.innerHTML = '—';

    clock.addEventListener('mouseenter', () => {
      clock.style.background = 'rgba(0,0,0,0.58)';
      tip.style.opacity = '1';
      tip.style.transform = 'translateY(0)';
    });
    clock.addEventListener('mouseleave', () => {
      clock.style.background = 'rgba(0,0,0,0.38)';
      tip.style.opacity = '0';
      tip.style.transform = 'translateY(-4px)';
    });

    document.body.appendChild(clock);
    document.body.appendChild(tip);
  }

  updateClock(clockData) {
    if (clockData.season) this._season = clockData.season;
    const el  = document.getElementById('game-clock');
    const tip = document.getElementById('game-clock-tip');
    if (!el) return;

    const hh = String(clockData.hours).padStart(2, '0');
    const mm = String(clockData.minutes).padStart(2, '0');

    // Faqat soat ko'rinadi
    el.textContent = `${hh}:${mm}`;

    // Tooltip ichidagi to'liq ma'lumot
    if (tip) {
      const SEASON_UZ = { spring: 'Bahor 🌸', summer: 'Yoz ☀️', autumn: 'Kuz 🍂', winter: 'Qish ❄️' };
      const seasonName = SEASON_UZ[clockData.season] || clockData.season || '—';

      // O'yin yili: har 4 fasl = 1 yil, har fasl ~3 oy = 91 kun o'yin kuni
      // 1 o'yin kuni = 24 real daqiqa
      // Biror ma'noli yil: epoch dan kun soni asosida
      const dayNum   = clockData.dayNumber ?? 0;
      const gameYear = Math.floor(dayNum / 365) + 1;  // taxminan
      const dayOfYear = (dayNum % 365) + 1;

      // Kun holati (qayerda?)
      const { isDay, isSunrise, isSunset, isNight, sunrise, sunset } = clockData;
      let sunStatus;
      if (isSunrise)     sunStatus = `🌅 Tong (${sunrise}:00 da chiqdi)`;
      else if (isSunset) sunStatus = `🌇 Shom (${sunset}:00 da botadi)`;
      else if (isDay)    sunStatus = `☀️ Kunduz`;
      else               sunStatus = `🌙 Tun`;

      // Kun progress bar (ASCII)
      const progress = clockData.dayFraction; // 0..1
      const BAR = 12;
      const filled = Math.round(progress * BAR);
      const bar = '█'.repeat(filled) + '░'.repeat(BAR - filled);

      tip.innerHTML = `
        <div style="color:#ffd97a;margin-bottom:4px;font-size:14px">📅 ${seasonName}</div>
        <div>Yil: <b>${gameYear}</b> &nbsp;|&nbsp; Kun: <b>${dayNum}</b></div>
        <div>Kun of yil: <b>${dayOfYear}</b></div>
        <div>Soat: <b>${hh}:${mm}</b></div>
        <div style="margin-top:4px">${sunStatus}</div>
        <div style="margin-top:4px;color:#aaa;font-size:11px">[${bar}] ${Math.round(progress*100)}%</div>
      `.trim();
    }
  }

  initDamageOverlay() {
    if (document.getElementById('damage-overlay')) return;
    const el = document.createElement('div');
    el.id = 'damage-overlay';
    el.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(255,0,0,0.35)', 'opacity:0',
      'pointer-events:none', 'z-index:9998', 'transition:opacity 0.35s ease-out',
    ].join(';');
    document.body.appendChild(el);
  }

  flashDamage() {
    const el = document.getElementById('damage-overlay');
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.35s ease-out';
      el.style.opacity = '0';
    });
  }

  updateClock(clockData) {
    if (clockData.season) this._season = clockData.season;
    const el = document.getElementById('game-clock');
    if (!el) return;

    const hh = String(clockData.hours).padStart(2, '0');
    const mm = String(clockData.minutes).padStart(2, '0');

    // Fasl belgisi
    const seasonEmoji = {
      spring: '🌸',
      summer: '☀️',
      autumn: '🍂',
      winter: '❄️',
    }[clockData.season] || '';

    // Kun/tun belgisi
    let timeIcon = '🌙';
    if (clockData.isSunrise)      timeIcon = '🌅';
    else if (clockData.isSunset)  timeIcon = '🌇';
    else if (clockData.isDay)     timeIcon = '☀️';

    el.textContent = `${seasonEmoji} Kun ${clockData.dayNumber}  ${hh}:${mm} ${timeIcon}`;
  }

  update() {
    const p = this.player;

    // ── Hotbar — 3D kublar ──────────────────────────────────────────────────
    for (let i = 0; i < 9; i++) {
      const slot = document.getElementById(`hotbar-slot-${i}`);
      if (!slot) continue;
      slot.classList.toggle('active', i === p.hotbarSlot);

      const item   = p.inventory[i];
      const blockId = item ? item.id : 0;

      // Faqat o'zgargan slotlarni qayta render qilamiz
      if (this._lastSlotIds[i] !== blockId) {
        this._lastSlotIds[i] = blockId;
        const cvs = this._slotCanvases[i];
        if (cvs) this._hotbarRenderer.renderToCanvas(cvs, blockId);
      }

      // Count label
      const countEl = slot.querySelector('.count');
      if (countEl) countEl.textContent = item ? item.count : '';
    }

    // ── Health ──────────────────────────────────────────────────────────────
    const healthBar = document.getElementById('health-bar');
    healthBar.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart';
      const filled = p.health / 2 > i;
      const half   = p.health / 2 > i - 0.5 && !filled;
      heart.textContent = filled ? '❤️' : half ? '💔' : '🖤';
      healthBar.appendChild(heart);
    }

    // ── Hunger ──────────────────────────────────────────────────────────────
    const hungerBar = document.getElementById('hunger-bar');
    hungerBar.innerHTML = '';
    for (let i = 9; i >= 0; i--) {
      const drumstick = document.createElement('span');
      drumstick.className = 'hunger';
      const filled = p.hunger / 2 > i;
      const half   = p.hunger / 2 > i - 0.5 && !filled;
      drumstick.textContent = filled ? '🍗' : half ? '🍖' : '⚪';
      hungerBar.appendChild(drumstick);
    }

    // ── Debug ───────────────────────────────────────────────────────────────
    const debug = document.getElementById('debug-info');
    const selId = p.inventory[p.hotbarSlot]?.id || 0;
    debug.innerHTML = `
      X: ${p.x.toFixed(1)}  Y: ${p.y.toFixed(1)}  Z: ${p.z.toFixed(1)}<br>
      ${p.onGround ? '🟢 YER' : '🔵 HAVO'}<br>
      Tanlangan: ${getSeasonBlockName(selId, this._season)}
    `;
  }
}
