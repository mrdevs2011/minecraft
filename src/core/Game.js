import { World }        from '../world/World.js';
import { Player }       from '../entities/Player.js';
import { Renderer }     from '../renderer/Renderer.js';
import { InputHandler } from './InputHandler.js';
import { Raycaster }    from './Raycaster.js';
import { HUD }          from '../ui/HUD.js';
import { BLOCK_AIR }    from '../world/Blocks.js';
import { MobManager }   from '../world/MobManager.js';
import { fetchAllBlockChanges, pushBlockChange, listenForBlockChanges,
         pushPlayerPosition, removePlayerDoc, listenForPlayers,
         listenForUserProfile, listenForClock, rotateCacheOnExit,
         saveUserInventory, loadUserInventory,
         startPositionAutoSave, stopPositionAutoSave, loadLastPosition } from './Firebase.js';
import { InventoryScreen } from '../../inventoryScreen.js';

// Sensitivity matches THREE.js PointerLockControls default
const SENSITIVITY = 0.002;
const TWO_PI      = Math.PI * 2;

// ── Kun/Tun sikli ─────────────────────────────────────────────────────────
// 24 daqiqa = 1440 sekund to'liq sikl
// dayFraction:  0.0 = tong (6:00), 0.25 = tush (12:00),
//               0.5 = kechqurun (18:00), 0.75 = yarim tun (0:00)
export const DAY_CYCLE  = 1440;   // sekundlarda
export const DAWN_START = 0.0;    // tong boshi
export const DAY_START  = 0.04;   // to'liq kun (tong tugadi)
export const DUSK_START = 0.46;   // kechqurun boshi
export const NIGHT_START = 0.50;  // tun boshi
// Zombi yonib ketish: dayFraction 0..DAWN_BURN zonasida (tong payti)
export const DAWN_BURN_END = 0.05;

export class Game {
  constructor(user = null) {
    this.user = user;
    this.avatarId  = 'steve';   // updated after profile loads
    this.canvas    = document.getElementById('game-canvas');
    this.running   = false;
    this.paused    = false;
    this._raf      = null;
    this._lastTime = 0;
    this._moving   = false;
    this._dt       = 0.016;
    // Other players: Map<uid, {data, steveModel}>
    this.otherPlayers = new Map();
    this._posPushTimer = 0; // throttle: push every 100ms
    this._isGhost = false;    // true when tab is hidden
    this._unsubscribeClock = null;
    this._touchAimScreen = null; // {x,y} — mobil: barmoq turgan ekran nuqtasi (aim/highlight uchun)
    this._lastAttackTime = 0;    // mob larga zarba berish orasidagi "punch" cooldown uchun
    // Kun/tun vaqti: real UTC dan keladi (listenForClock orqali)
    this.gameTime     = 0;  // sekund (0..DAY_CYCLE)
    this._dayFraction = 0;  // 0..1 (0=yarim tun, 0.5=tush)
  }

  start() {
    this.world     = new World();
    this.player    = new Player(this.world);
    this.renderer  = new Renderer(this.canvas, this.world);
    this.input     = new InputHandler(this.canvas);
    this.raycaster = new Raycaster(this.world);
    this.hud       = new HUD(this.player, this.user);
    this.mobManager = new MobManager(this.world);
    this._lastChunkX = null;   // o'yinchi oxirgi turgan chunk X
    this._lastChunkZ = null;   // o'yinchi oxirgi turgan chunk Z

    // ── Inventory screen — loads blocks.json + items.json then inits ──
    this._inventory = null;
    this._itemsData = null;
    Promise.all([
      fetch('blocks.json').then(r => r.json()),
      fetch('items.json').then(r => r.json()),
    ]).then(([blocksJson, itemsJson]) => {
      this._inventory = new InventoryScreen(this.player, blocksJson, itemsJson);
      this._itemsData = itemsJson.items; // ovqat yeyish uchun saqlaymiz
    });

    // Spawn: avval Firebase dan oxirgi pozitsiya yuklanadi
    this.world.loadChunksAround(0, 0);
    const sy = this.world.getSurfaceY(0, 0);
    this.player.x = 0; this.player.y = sy + 2; this.player.z = 0;
    this.player._initInventory();

    // Hayvonlar (qo'y) va zombilarni o'yinchi spawn nuqtasi atrofida joylashtirish
    this.mobManager.init(this.player.x, this.player.z);

    // Mob o'lganda drop olish callback
    this.mobManager.onMobDrop = (x, y, z, drops) => {
      for (const drop of drops) {
        this._addItemToInventory(drop.itemId, drop.itemKey, drop.count);
      }
    };

    // Firebase dan oxirgi pozitsiya va inventarni yuklash
    if (this.user) {
      loadLastPosition(this.user.uid).then(pos => {
        if (pos) {
          this.player.x   = pos.x;
          this.player.y   = pos.y;
          this.player.z   = pos.z;
          this.player.yaw = pos.yaw ?? this.player.yaw;
          // Yangi joydagi chunklarni yukla
          const cx = Math.floor(pos.x / 16);
          const cz = Math.floor(pos.z / 16);
          this.world.loadChunksAround(cx, cz);
          console.log(`[Spawn] Oxirgi pozitsiyadan: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
        }
      });

      // Har 10 sekundda pozitsiyani Firebase ga yozib borish
      startPositionAutoSave(this.user.uid, () => this.player);
    }

    this.input.onClick(btn => {
      if (this.paused) return;
      if (btn === 0) {
        if (this._tryAttackMob()) return;
        const hit = this._raycast();
        if (hit.hit) this._breakBlock(hit);
      } else if (btn === 2) {
        // O'ng tugma: avval ovqat yeyishni tekshir
        if (this._tryEatFood()) return;
        const hit = this._raycast();
        if (hit.hit) this._placeBlock(hit);
      }
    });

    // ── Mobile touch: drag = look (handled in InputHandler), tap = place,
    //    press-and-hold = break. Aim follows the finger, not a fixed
    //    center crosshair (see css: crosshair is hidden on mobile). ──────
    this.input.onTouchAim((x, y) => {
      this._touchAimScreen = { x, y };
    });
    this.input.onTouchAimEnd(() => {
      this._touchAimScreen = null;
    });
    this.input.onTouchBreak((x, y) => {
      if (this.paused) return;
      if (this._tryAttackMobAtScreen(x, y)) return;
      const hit = this._raycastAtScreen(x, y);
      if (hit.hit) this._breakBlock(hit);
    });
    this.input.onTouchPlace((x, y) => {
      if (this.paused) return;
      const hit = this._raycastAtScreen(x, y);
      if (hit.hit) this._placeBlock(hit);
    });

    this._loadSharedWorld();

    // ── Listen for other players ──────────────────────────────────────────
    if (this.user) {
      // Realtime listener — o'z profilimiz o'zgarganda darhol qo'llanadi
      this._unsubscribeProfile = listenForUserProfile(this.user.uid, profile => {
        if (profile?.avatarId && profile.avatarId !== this.avatarId) {
          this.avatarId = profile.avatarId;
          this.renderer.setLocalAvatarId(profile.avatarId);
        }
      });

      this._unsubscribePlayers = listenForPlayers(this.user.uid, playersMap => {
        this.renderer.syncOtherPlayers(playersMap);
      });
    }

    this.input.onEscape(() => this._togglePause());
    this.input.onInventory(() => {
      if (this.paused) return;
      this._inventory?.toggle();
    });
    this.input.onHotbar(i => {
      this.player.hotbarSlot = i;
      this.hud.update();
    });
    this.input.onScroll(dy => {
      this.player.hotbarSlot = (this.player.hotbarSlot + (dy > 0 ? 1 : -1) + 9) % 9;
      this.hud.update();
    });

    // ── Visibility change — ghost mode when tab is hidden ───────────────────
    this._onVisibilityChange = () => {
      this._isGhost = document.hidden;
      // Immediately push ghost state so others see it right away
      if (this.user) {
        pushPlayerPosition(
          this.user.uid,
          this.user.displayName || 'Player',
          this.player.x,
          this.player.y,
          this.player.z,
          this.player.yaw,
          false,
          this.avatarId,
          this._isGhost
        );
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // ── Shared game clock — real UTC vaqt ────────────────────────────────
    this._unsubscribeClock = listenForClock(clockData => {
      this.gameTime     = clockData.dayFraction * DAY_CYCLE; // 0..1440
      this._dayFraction = clockData.dayFraction;             // 0..1 (sun position)
      this.hud.updateClock(clockData);
    });

    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', () => this.renderer.resize());

    window._mcUser = this.user;
    this.running   = true;
    this._lastTime = performance.now();
    this._loop();
  }

  _breakBlock(hit) {
    const brokenId = this.world.getBlock(hit.blockX, hit.blockY, hit.blockZ);

    // ── QOIDA: Suv bloki BUZILMAYDI ──────────────────────────────────────────
    if (brokenId === 7 /* BLOCK_WATER */) {
      // Suv buzilmaydi — faqat vizual feedback (ixtiyoriy)
      return;
    }

    this.world.setBlock(hit.blockX, hit.blockY, hit.blockZ, 0 /* BLOCK_AIR */);
    // Qo'shni suv bloklarini faollashtirish (to'siq ochildi — suv oqsin)
    this.world.fluid._activateNeighbors(hit.blockX, hit.blockY, hit.blockZ);
    pushBlockChange(hit.blockX, hit.blockY, hit.blockZ, 0 /* BLOCK_AIR */);
    if (brokenId && brokenId !== 0) {
      this._addToInventory(brokenId);
    }
  }

  _placeBlock(hit) {
    const item = this.player.getSelectedBlock();
    if (!item) return;

    if (item.id === 7 /* BLOCK_WATER */) {
      // ── QOIDA: Suv ustiga suv qo'yib bo'lmaydi (3+ blok chuqurlikda) ──────
      // addSource() ichida isWaterTooDeep() tekshiruvi bor
      const placed = this.world.fluid.addSource(hit.placeX, hit.placeY, hit.placeZ);
      if (!placed) return; // tekshiruv rad etdi — inventardan olmaymiz
    } else {
      // ── QOIDA: Suv bloki ustiga qattiq blok qo'yib bo'lmaydi ───────────────
      const targetBlock = this.world.getBlock(hit.placeX, hit.placeY, hit.placeZ);
      const belowBlock  = this.world.getBlock(hit.placeX, hit.placeY - 1, hit.placeZ);
      // Suv ichiga yoki suv ustiga blok qo'yishni bloklash
      if (targetBlock === 7 /* BLOCK_WATER */ || belowBlock === 7 /* BLOCK_WATER */) {
        return;
      }
      this.world.setBlock(hit.placeX, hit.placeY, hit.placeZ, item.id);
      // Yangi blok qo'yilsa — atrofdagi suvni faollashtirish
      this.world.fluid._activateNeighbors(hit.placeX, hit.placeY, hit.placeZ);
    }

    pushBlockChange(hit.placeX, hit.placeY, hit.placeZ, item.id);
    const slot = this.player.inventory[this.player.hotbarSlot];
    if (slot) {
      slot.count--;
      if (slot.count <= 0) this.player.inventory[this.player.hotbarSlot] = null;
    }
    this.hud.update();
    this._saveInventory();
  }

  // Survival: blok buzilganda player inventariga qo'shish
  _addToInventory(blockId) {
    this._addItemToInventory(blockId, `block_${blockId}`, 1);
  }

  // Umumiy inventory qo'shish (block yoki item)
  _addItemToInventory(itemId, itemKey, count = 1) {
    const p = this.player;
    for (let i = 0; i < 36; i++) {
      const slot = p.inventory[i];
      if (slot && slot.id === itemId && slot.count < 64) {
        slot.count = Math.min(64, slot.count + count);
        this.hud.update();
        this._saveInventory();
        return;
      }
    }
    for (let i = 0; i < 36; i++) {
      if (!p.inventory[i]) {
        p.inventory[i] = { id: itemId, count, key: itemKey };
        this.hud.update();
        this._saveInventory();
        return;
      }
    }
    console.warn('Inventar to\'la!');
  }

  // O'ng tugma bosilganda tanlangan slot ovqat bo'lsa yeydi
  // items.json dan yuklanган ma'lumotlardan foydalanadi
  _tryEatFood() {
    const item = this.player.getSelectedBlock();
    if (!item) return false;
    if (!this._itemsData) return false;

    const itemDef = Object.values(this._itemsData).find(v => v.id === item.id);
    if (!itemDef || itemDef.category !== 'food') return false;

    const hunger = itemDef.hunger || 0;
    if (hunger <= 0) return false;

    // To'q bo'lsa yeyilmaydi
    if (this.player.hunger >= this.player.maxHunger && this.player.health >= this.player.maxHealth) {
      return false;
    }

    this.player.eat(hunger);

    const slot = this.player.inventory[this.player.hotbarSlot];
    if (slot) {
      slot.count--;
      if (slot.count <= 0) this.player.inventory[this.player.hotbarSlot] = null;
    }
    this.hud.update();
    this._saveInventory();
    return true;
  }

  // Inventarni Firebase ga debounce bilan saqlash (500ms)
  _saveInventory() {
    if (!this.user) return;
    if (this._saveInventoryTimer) clearTimeout(this._saveInventoryTimer);
    this._saveInventoryTimer = setTimeout(() => {
      this._saveInventoryTimer = null;
      saveUserInventory(this.user.uid, this.player.inventory);
    }, 500);
  }

  async _loadSharedWorld() {
    // ── Inventarni Firebase dan yuklash ──
    if (this.user) {
      const savedInventory = await loadUserInventory(this.user.uid);
      if (savedInventory) {
        this.player.inventory = savedInventory;
        this.hud?.update();
        console.log('[Inventory] Firebase dan yuklandi');
      }
    }

    const changes = await fetchAllBlockChanges();
    for (const c of changes) {
      // Firebase dagi o'zgarishlar dunyo generatsiyasidagi suvni AIR qilib tashlashiga
      // yo'l qo'ymaymiz. Faqat o'yinchi qo'lda buzgan bloklar (non-water) o'tkaziladi.
      const existing = this.world.getBlock(c.x, c.y, c.z);
      if (existing === 7 /* BLOCK_WATER */ && c.id === 0 /* AIR */) continue;
      this.world.setBlock(c.x, c.y, c.z, c.id);
    }
    this._unsubscribeWorld = listenForBlockChanges((x, y, z, id) => {
      // Real-time o'zgarishlarda ham xuddi shunday himoya
      const existing = this.world.getBlock(x, y, z);
      if (existing === 7 /* BLOCK_WATER */ && id === 0 /* AIR */) return;
      this.world.setBlock(x, y, z, id);
    });
  }

  _loop() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(ts => {
      const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
      this._lastTime = ts;
      this._dt = dt;
      if (!this.paused) this._update(dt);
      this._draw();
      this._loop();
    });
  }

  _update(dt) {
    // dayFraction — listenForClock orqali sekundiga bir marta yangilanadi (real UTC)
    const dayFraction = this._dayFraction;
    const mouse = this.input.consumeMouse();

    // ─── Correct FPS camera from THREE.js PointerLockControls source ───
    // mouse.dx = raw movementX pixels (positive = mouse moved RIGHT)
    // mouse.dy = raw movementY pixels (positive = mouse moved DOWN)
    //
    // yaw   -= movementX * sensitivity  →  mouse right = yaw decreases
    //   In THREE.js with YXZ order: negative yaw = turn RIGHT  ✓
    // pitch -= movementY * sensitivity  →  mouse down  = pitch decreases
    //   In THREE.js with YXZ order: negative pitch = look DOWN  ✓
    //
    // Previous bug: code was doing yaw += dx which inverted left/right.

    this.player.yaw   -= mouse.dx * SENSITIVITY;
    this.player.pitch -= mouse.dy * SENSITIVITY;

    // Wrap yaw to -PI..PI (full 360° rotation, no clamp)
    this.player.yaw = ((this.player.yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

    // Clamp pitch to ±90° (can't look past straight up/down)
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01,
                         Math.min( Math.PI / 2 - 0.01, this.player.pitch));

    const input  = this.input.getMovement();
    this._moving = !!(input.forward || input.backward || input.left || input.right);

    this.player.update(dt, input);

    const cx = Math.floor(this.player.x / 16);
    const cz = Math.floor(this.player.z / 16);
    // O'yinchi yangi chunkka o'tganda konsolga chiqar
    if (cx !== this._lastChunkX || cz !== this._lastChunkZ) {
      console.log(`[Chunk] O'yinchi yangi chunkka o'tdi: (${cx}, ${cz})`);
      this._lastChunkX = cx;
      this._lastChunkZ = cz;
    }
    this.world.loadChunksAround(cx, cz);

    // ── Fluid simulation tick ─────────────────────────────────────────────
    this.world.tick(dt);

    // ── Mob lar (qo'y, zombi) AI/fizika tiki ────────────────────────────────
    const healthBefore = this.player.health;
    this.mobManager.update(dt, this.player, dayFraction);
    if (this.player.health < healthBefore) {
      this.hud.flashDamage();
    }

    // ── Push this player's position to Firebase (throttled, ~every 100ms) ─
    // Firebase.js ichida epsilon tekshiruvi bor — hech narsa o'zgarmasa yozilmaydi.
    if (this.user) {
      this._posPushTimer += dt;
      if (this._posPushTimer >= 0.1) {
        this._posPushTimer = 0;
        pushPlayerPosition(
          this.user.uid,
          this.user.displayName || 'Player',
          this.player.x,
          this.player.y,
          this.player.z,
          this.player.yaw,
          this._moving,
          this.avatarId,         // ← broadcast skin choice to other clients
          this._isGhost          // ← ghost flag
        );
      }
    }
  }

  _draw() {
    const hit = this._touchAimScreen
      ? this._raycastAtScreen(this._touchAimScreen.x, this._touchAimScreen.y)
      : this._raycast();
    const dayFraction = this._dayFraction;
    this.renderer.render(this.player, hit, this._moving, this._dt, this.mobManager.mobs, dayFraction);
    this.hud.update();
  }

  _raycast() {
    const { dx, dy, dz } = Raycaster.directionFromYawPitch(this.player.yaw, this.player.pitch);
    return this.raycaster.cast(
      this.player.getEyeX(),
      this.player.getEyeY(),
      this.player.getEyeZ(),
      dx, dy, dz
    );
  }

  // Mobil: barmoq turgan ekran nuqtasidan dunyo nuriga o'tkazib raycast qilamiz
  // (markaziy "+" nishon o'rniga — bevosita tegilgan blok nishonlanadi).
  _raycastAtScreen(screenX, screenY) {
    const { ox, oy, oz, dx, dy, dz } = this.renderer.screenPointToRay(screenX, screenY);
    return this.raycaster.cast(ox, oy, oz, dx, dy, dz);
  }

  // ── Mob larga "musht" hujumi ────────────────────────────────────────────
  // Crosshair (desktop) yo'nalishi bo'yicha eng yaqin mobni qidiradi va,
  // agar topilsa (hamda yo'lda blok to'siq bo'lmasa), unga zarba beradi.
  _tryAttackMob() {
    const { dx, dy, dz } = Raycaster.directionFromYawPitch(this.player.yaw, this.player.pitch);
    return this._attackMobAlongRay(
      this.player.getEyeX(), this.player.getEyeY(), this.player.getEyeZ(), dx, dy, dz
    );
  }

  _tryAttackMobAtScreen(screenX, screenY) {
    const { ox, oy, oz, dx, dy, dz } = this.renderer.screenPointToRay(screenX, screenY);
    return this._attackMobAlongRay(ox, oy, oz, dx, dy, dz);
  }

  _attackMobAlongRay(ox, oy, oz, dx, dy, dz) {
    const mobHit = this.mobManager.raycastMob(ox, oy, oz, dx, dy, dz, 5);
    if (!mobHit) return false;

    // Agar yo'lda mobdan oldinroq qattiq blok bo'lsa — blok to'sib turadi, urilmaydi
    const blockHit = this.raycaster.cast(ox, oy, oz, dx, dy, dz);
    if (blockHit.hit && blockHit.distance < mobHit.distance) return false;

    this._attackMob(mobHit.mob);
    return true;
  }

  _attackMob(mob) {
    const now = performance.now();
    if (now - this._lastAttackTime < 350) return; // "musht" tezligi cooldown
    this._lastAttackTime = now;

    const PUNCH_DAMAGE = 2;
    mob.takeDamage(PUNCH_DAMAGE, this.player.yaw);
  }

  _togglePause() {
    this.paused = !this.paused;
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.toggle('hidden', !this.paused);

    if (this.paused) {
      // Fill user info in pause card
      const u = this.user;
      if (u) {
        const nameEl  = document.getElementById('pause-user-name');
        const emailEl = document.getElementById('pause-user-email');
        const photoEl = document.getElementById('pause-user-photo');
        if (nameEl)  nameEl.textContent  = u.displayName || 'Foydalanuvchi';
        if (emailEl) emailEl.textContent = u.email || '';
        if (photoEl && u.photoURL) {
          photoEl.src = u.photoURL;
          photoEl.style.display = 'block';
        }
      }
    } else if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  resume() {
    this.paused = false;
    document.getElementById('pause-menu').classList.add('hidden');
    this.canvas.requestPointerLock();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (document.pointerLockElement) document.exitPointerLock();
    if (this._unsubscribeWorld)   this._unsubscribeWorld();
    if (this._unsubscribePlayers) this._unsubscribePlayers();
    if (this._unsubscribeProfile) this._unsubscribeProfile();
    if (this._unsubscribeClock)   this._unsubscribeClock();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    stopPositionAutoSave();
    if (this.user) removePlayerDoc(this.user.uid);
    // Cache qatlamlarini rotate qilish (current → previous)
    rotateCacheOnExit();
  }
}