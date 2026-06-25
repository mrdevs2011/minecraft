import { World }        from '../world/World.js';
import { Player }       from '../entities/Player.js';
import { Renderer }     from '../renderer/Renderer.js';
import { InputHandler } from './InputHandler.js';
import { Raycaster }    from './Raycaster.js';
import { HUD }          from '../ui/HUD.js';
import { BLOCK_AIR }    from '../world/Blocks.js';
import { fetchAllBlockChanges, pushBlockChange, listenForBlockChanges,
         pushPlayerPosition, removePlayerDoc, listenForPlayers,
         listenForUserProfile, listenForClock, rotateCacheOnExit,
         saveUserInventory, loadUserInventory,
         startPositionAutoSave, stopPositionAutoSave, loadLastPosition } from './Firebase.js';
import { InventoryScreen } from '../../inventoryScreen.js';

const SENSITIVITY = 0.002;
const TWO_PI      = Math.PI * 2;

export class Game {
  constructor(user = null) {
    this.user = user;
    this.avatarId  = 'steve';
    this.canvas    = document.getElementById('game-canvas');
    this.running   = false;
    this.paused    = false;
    this._raf      = null;
    this._lastTime = 0;
    this._moving   = false;
    this._dt       = 0.016;
    this.otherPlayers = new Map();
    this._posPushTimer = 0;
    this._isGhost = false;
    this._unsubscribeClock = null;
    this._touchAimScreen = null;
  }

  start() {
    this.world     = new World();
    this.player    = new Player(this.world);
    this.renderer  = new Renderer(this.canvas, this.world);
    this.input     = new InputHandler(this.canvas);
    this.raycaster = new Raycaster(this.world);
    this.hud       = new HUD(this.player, this.user);
    this._lastChunkX = null;
    this._lastChunkZ = null;

    this._inventory = null;
    Promise.all([
      fetch('blocks.json').then(r => r.json()),
      fetch('items.json').then(r => r.json()),
    ]).then(([blocksJson, itemsJson]) => {
      this._inventory = new InventoryScreen(this.player, blocksJson, itemsJson);
    });

    this.world.loadChunksAround(0, 0);
    const sy = this.world.getSurfaceY(0, 0);
    this.player.x = 0; this.player.y = sy + 2; this.player.z = 0;
    this.player._initInventory();

    if (this.user) {
      loadLastPosition(this.user.uid).then(pos => {
        if (pos) {
          this.player.x   = pos.x;
          this.player.y   = pos.y;
          this.player.z   = pos.z;
          this.player.yaw = pos.yaw ?? this.player.yaw;
          const cx = Math.floor(pos.x / 16);
          const cz = Math.floor(pos.z / 16);
          this.world.loadChunksAround(cx, cz);
        }
      });
      startPositionAutoSave(this.user.uid, () => this.player);
    }

    this.input.onClick(btn => {
      if (this.paused) return;
      const hit = this._raycast();
      if (!hit.hit) return;
      if (btn === 0) this._breakBlock(hit);
      else if (btn === 2) this._placeBlock(hit);
    });

    this.input.onTouchAim((x, y) => {
      this._touchAimScreen = { x, y };
    });
    this.input.onTouchAimEnd(() => {
      this._touchAimScreen = null;
    });
    this.input.onTouchBreak((x, y) => {
      if (this.paused) return;
      const hit = this._raycastAtScreen(x, y);
      if (hit.hit) this._breakBlock(hit);
    });
    this.input.onTouchPlace((x, y) => {
      if (this.paused) return;
      const hit = this._raycastAtScreen(x, y);
      if (hit.hit) this._placeBlock(hit);
    });

    this._loadSharedWorld();

    if (this.user) {
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

    this._onVisibilityChange = () => {
      this._isGhost = document.hidden;
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

    this._unsubscribeClock = listenForClock(seconds => {
      this.hud.updateClock(seconds);
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
    // Mojang: suvni ham buzish mumkin (faqat oqim suvlari)
    if (brokenId === 8) { // BLOCK_WATER
      const removed = this.world.fluid.removeFluid(hit.blockX, hit.blockY, hit.blockZ);
      if (removed) {
        pushBlockChange(hit.blockX, hit.blockY, hit.blockZ, 0);
      }
      return;
    }
    this.world.setBlock(hit.blockX, hit.blockY, hit.blockZ, 0);
    this.world.fluid._activateNeighbors(hit.blockX, hit.blockY, hit.blockZ);
    pushBlockChange(hit.blockX, hit.blockY, hit.blockZ, 0);
    if (brokenId && brokenId !== 0) {
      this._addToInventory(brokenId);
    }
  }

  _placeBlock(hit) {
    const item = this.player.getSelectedBlock();
    if (!item) return;

    if (item.id === 8) { // BLOCK_WATER
      this.world.fluid.addSource(hit.placeX, hit.placeY, hit.placeZ);
    } else {
      // Mojang: suv ustiga blok qo‘yish mumkin
      const targetBlock = this.world.getBlock(hit.placeX, hit.placeY, hit.placeZ);
      if (targetBlock === 8) {
        this.world.fluid.removeFluid(hit.placeX, hit.placeY, hit.placeZ);
      }
      this.world.setBlock(hit.placeX, hit.placeY, hit.placeZ, item.id);
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

  _addToInventory(blockId) {
    const p = this.player;
    const key = `block_${blockId}`;
    for (let i = 0; i < 36; i++) {
      const slot = p.inventory[i];
      if (slot && slot.id === blockId && slot.count < 64) {
        slot.count++;
        this.hud.update();
        this._saveInventory();
        return;
      }
    }
    for (let i = 0; i < 36; i++) {
      if (!p.inventory[i]) {
        p.inventory[i] = { id: blockId, count: 1, key };
        this.hud.update();
        this._saveInventory();
        return;
      }
    }
    console.warn('Inventar to\'la!');
  }

  _saveInventory() {
    if (!this.user) return;
    if (this._saveInventoryTimer) clearTimeout(this._saveInventoryTimer);
    this._saveInventoryTimer = setTimeout(() => {
      this._saveInventoryTimer = null;
      saveUserInventory(this.user.uid, this.player.inventory);
    }, 500);
  }

  async _loadSharedWorld() {
    if (this.user) {
      const savedInventory = await loadUserInventory(this.user.uid);
      if (savedInventory) {
        this.player.inventory = savedInventory;
        this.hud?.update();
      }
    }

    const changes = await fetchAllBlockChanges();
    for (const c of changes) {
      const existing = this.world.getBlock(c.x, c.y, c.z);
      if (existing === 8 && c.id === 0) continue;
      this.world.setBlock(c.x, c.y, c.z, c.id);
    }
    this._unsubscribeWorld = listenForBlockChanges((x, y, z, id) => {
      const existing = this.world.getBlock(x, y, z);
      if (existing === 8 && id === 0) return;
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
    const mouse = this.input.consumeMouse();
    this.player.yaw   -= mouse.dx * SENSITIVITY;
    this.player.pitch -= mouse.dy * SENSITIVITY;
    this.player.yaw = ((this.player.yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01,
                         Math.min( Math.PI / 2 - 0.01, this.player.pitch));

    const input  = this.input.getMovement();
    this._moving = !!(input.forward || input.backward || input.left || input.right);
    this.player.update(dt, input);

    const cx = Math.floor(this.player.x / 16);
    const cz = Math.floor(this.player.z / 16);
    if (cx !== this._lastChunkX || cz !== this._lastChunkZ) {
      this._lastChunkX = cx;
      this._lastChunkZ = cz;
    }
    this.world.loadChunksAround(cx, cz);
    this.world.tick(dt);

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
          this.avatarId,
          this._isGhost
        );
      }
    }
  }

  _draw() {
    const hit = this._touchAimScreen
      ? this._raycastAtScreen(this._touchAimScreen.x, this._touchAimScreen.y)
      : this._raycast();
    this.renderer.render(this.player, hit, this._moving, this._dt);
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

  _raycastAtScreen(screenX, screenY) {
    const { ox, oy, oz, dx, dy, dz } = this.renderer.screenPointToRay(screenX, screenY);
    return this.raycaster.cast(ox, oy, oz, dx, dy, dz);
  }

  _togglePause() {
    this.paused = !this.paused;
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.toggle('hidden', !this.paused);
    if (this.paused) {
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
    rotateCacheOnExit();
  }
}