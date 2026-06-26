// ─────────────────────────────────────────────────────────────────────────────
//  MobManager — Qo'y (sheep) va Zombi (zombie) moblari boshqaruvchisi
//
//  Game.js ga import qilinadi:
//    import { MobManager } from '../world/MobManager.js';
//
//  Renderer.js mobManager.mobs ro'yxatini oladi va ZombieAvatar / SheepModel
//  orqali render qiladi.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SHEEP   = 6;   // maksimal qo'y soni
const MAX_ZOMBIES = 4;   // maksimal zombi soni

const SHEEP_SPEED   = 2.2;   // blok/sekund
const ZOMBIE_SPEED  = 2.0;   // blok/sekund (zombi sekinroq)

const SHEEP_ROAM_RADIUS   = 18; // spawn markazidan uzoqlaşa oladi
const ZOMBIE_CHASE_DIST   = 22; // zombi shu masofada player ni ko'radi
const ZOMBIE_ATTACK_DIST  = 1.4; // shu masofada zarba beradi
const ZOMBIE_ATTACK_DMG   = 1;   // bir zarba ziyoni (canlardan)
const ZOMBIE_ATTACK_CD    = 1.2; // zarba orasidagi cooldown (sekund)

const GRAVITY     = -18;
const JUMP_VEL    =  7;

const HURT_FLASH_TIME = 0.25; // sekund
const SHEEP_HP        = 8;
const ZOMBIE_HP       = 20;

let _nextId = 1;

// ─────────────────────────────────────────────────────────────────────────────
//  Mob class
// ─────────────────────────────────────────────────────────────────────────────
class Mob {
  constructor(type, x, y, z) {
    this.id     = _nextId++;
    this.type   = type;      // 'sheep' | 'zombie'
    this.x      = x;
    this.y      = y;
    this.z      = z;
    this.yaw    = Math.random() * Math.PI * 2;
    this.vy     = 0;         // vertikal tezlik
    this.moving = false;
    this.hp     = type === 'zombie' ? ZOMBIE_HP : SHEEP_HP;
    this.dead   = false;

    // AI holat mashina
    this._state      = 'idle';    // 'idle' | 'roam' | 'chase' | 'attack'
    this._stateTimer = 0;
    this._targetX    = x;
    this._targetZ    = z;
    this._spawnX     = x;         // spawn markazi (qo'y uchun)
    this._spawnZ     = z;
    this._attackCooldown = 0;

    // Hurt flash uchun timer
    this._hurtFlash = 0;

    // Knockback
    this._kbX = 0;
    this._kbZ = 0;
  }

  get onGround() { return this._onGround; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MobManager
// ─────────────────────────────────────────────────────────────────────────────
export class MobManager {
  constructor(world) {
    this.world = world;
    this.mobs  = [];
  }

  // O'yinchi boshlanish nuqtasi atrofida moblarni joylashtirish
  init(playerX, playerZ) {
    // Qo'ylar
    for (let i = 0; i < MAX_SHEEP; i++) {
      this._spawnMob('sheep', playerX, playerZ);
    }
    // Zombilar — biroz uzoqroqda spawn bo'ladi
    for (let i = 0; i < MAX_ZOMBIES; i++) {
      this._spawnMob('zombie', playerX, playerZ, 12, 24);
    }
  }

  _spawnMob(type, cx, cz, minR = 6, maxR = 20) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = minR + Math.random() * (maxR - minR);
      const wx    = Math.round(cx + Math.cos(angle) * r);
      const wz    = Math.round(cz + Math.sin(angle) * r);
      const wy    = this.world.getSurfaceY(wx, wz);

      // Suv yoki boshqa noqulay joyga spawn bo'lmasin
      const blockBelow = this.world.getBlock(wx, wy - 1, wz);
      if (blockBelow === 7 /* BLOCK_WATER */) continue;

      const mob = new Mob(type, wx, wy, wz);
      this.mobs.push(mob);
      return mob;
    }
    return null;
  }

  // ── Asosiy update (Game.js dan har frameda chaqiriladi) ──────────────────
  update(dt, player) {
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      this._updateMob(mob, dt, player);
    }
    // O'lgan moblarni ro'yxatdan o'chirish
    this.mobs = this.mobs.filter(m => !m.dead);
  }

  _updateMob(mob, dt, player) {
    // ── Hurt timer ──
    if (mob._hurtFlash > 0) {
      mob._hurtFlash -= dt;
      if (mob._hurtFlash < 0) mob._hurtFlash = 0;
    }

    // ── Attack cooldown ──
    if (mob._attackCooldown > 0) mob._attackCooldown -= dt;

    // ── AI ──
    if (mob.type === 'sheep') {
      this._updateSheep(mob, dt);
    } else {
      this._updateZombie(mob, dt, player);
    }

    // ── Fizika (gravity + collision) ──
    this._applyPhysics(mob, dt);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Qo'y AI — erkin sayr qiladi, player dan qochadi
  // ─────────────────────────────────────────────────────────────────────────
  _updateSheep(mob, dt) {
    mob._stateTimer -= dt;

    const dx = mob.x - mob._spawnX;
    const dz = mob.z - mob._spawnZ;
    const distFromSpawn = Math.sqrt(dx * dx + dz * dz);

    if (mob._state === 'idle') {
      mob.moving = false;
      if (mob._stateTimer <= 0) {
        // Yangi maqsad tanlash
        if (distFromSpawn > SHEEP_ROAM_RADIUS) {
          // Spawn ga qaytish
          mob._targetX = mob._spawnX + (Math.random() - 0.5) * 4;
          mob._targetZ = mob._spawnZ + (Math.random() - 0.5) * 4;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const r     = 4 + Math.random() * 8;
          mob._targetX = mob.x + Math.cos(angle) * r;
          mob._targetZ = mob.z + Math.sin(angle) * r;
        }
        mob._state      = 'roam';
        mob._stateTimer = 3 + Math.random() * 4;
      }
    } else if (mob._state === 'roam') {
      mob.moving = true;
      const moved = this._moveToward(mob, mob._targetX, mob._targetZ, SHEEP_SPEED * 0.75, dt);
      if (!moved || mob._stateTimer <= 0) {
        mob._state      = 'idle';
        mob._stateTimer = 2 + Math.random() * 3;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Zombi AI — playerni ta'qib etadi va zarba beradi
  // ─────────────────────────────────────────────────────────────────────────
  _updateZombie(mob, dt, player) {
    const dx = player.x - mob.x;
    const dz = player.z - mob.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < ZOMBIE_CHASE_DIST) {
      // Player ko'rinadi — ta'qib
      mob._state  = 'chase';
      mob._targetX = player.x;
      mob._targetZ = player.z;

      if (dist < ZOMBIE_ATTACK_DIST) {
        // Zarba masofasida
        mob.moving = false;
        mob._state = 'attack';
        if (mob._attackCooldown <= 0) {
          mob._attackCooldown = ZOMBIE_ATTACK_CD;
          player.takeDamage(ZOMBIE_ATTACK_DMG);
        }
      } else {
        mob.moving = true;
        this._moveToward(mob, player.x, player.z, ZOMBIE_SPEED, dt);
      }
    } else {
      // Player uzoqda — bekor yurish
      mob._stateTimer -= dt;
      if (mob._state === 'idle' || mob._stateTimer <= 0) {
        if (mob._state !== 'idle') {
          mob._state = 'idle';
          mob._stateTimer = 2 + Math.random() * 3;
          mob.moving = false;
        }
        if (mob._stateTimer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          mob._targetX = mob.x + Math.cos(angle) * (3 + Math.random() * 5);
          mob._targetZ = mob.z + Math.sin(angle) * (3 + Math.random() * 5);
          mob._state = 'roam';
          mob._stateTimer = 3 + Math.random() * 4;
        }
      } else if (mob._state === 'roam') {
        mob.moving = true;
        const moved = this._moveToward(mob, mob._targetX, mob._targetZ, ZOMBIE_SPEED * 0.6, dt);
        if (!moved || mob._stateTimer <= 0) {
          mob._state = 'idle';
          mob._stateTimer = 2 + Math.random() * 3;
          mob.moving = false;
        }
      } else if (mob._state === 'chase') {
        // Playerdan uzoqlashdi — idle ga o'tish
        mob._state = 'idle';
        mob._stateTimer = 1;
        mob.moving = false;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Maqsadga tomon harakat
  //  Qaytadi: true — hali maqsadga yetib bormagan, false — yetdi/blok bor
  // ─────────────────────────────────────────────────────────────────────────
  _moveToward(mob, tx, tz, speed, dt) {
    const dx   = tx - mob.x;
    const dz   = tz - mob.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.3) return false; // maqsadga yetib bording

    const nx = dx / dist;
    const nz = dz / dist;

    mob.yaw = Math.atan2(-nx, -nz); // mob yuzini yo'nalish tomon burishish

    // Knockback qo'shish
    const kbDecay = Math.exp(-8 * dt);
    mob._kbX *= kbDecay;
    mob._kbZ *= kbDecay;

    const newX = mob.x + (nx * speed + mob._kbX) * dt;
    const newZ = mob.z + (nz * speed + mob._kbZ) * dt;

    // X va Z alohida tekshirish (sliding collision)
    const mobH = 1.8; // mob balandligi
    const mobR = 0.3; // mob radiusi

    const canX = !this._isSolid(newX, mob.y, mob.z, mobR, mobH);
    const canZ = !this._isSolid(mob.x, mob.y, newZ, mobR, mobH);

    if (canX) mob.x = newX;
    if (canZ) mob.z = newZ;

    // Oldida baland blok bo'lsa — sakrash
    if (!canX || !canZ) {
      if (mob._onGround) {
        // Blok bor oldinda, sakrash
        const frontX = mob.x + nx * 0.6;
        const frontZ = mob.z + nz * 0.6;
        const frontSolid = this._isSolid(frontX, mob.y + 0.1, frontZ, mobR, 1.0);
        if (frontSolid) mob.vy = JUMP_VEL;
      }
      return false;
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Fizika — tortishish kuchi va yerga tushish
  // ─────────────────────────────────────────────────────────────────────────
  _applyPhysics(mob, dt) {
    // Gravity
    mob.vy += GRAVITY * dt;
    const newY = mob.y + mob.vy * dt;

    // Yer tekshiruvi
    const mobR = 0.3;
    const solidBelow = this._isSolid(mob.x, newY - 0.05, mob.z, mobR, 0.1);

    if (solidBelow && mob.vy <= 0) {
      // Yerga tushdi
      mob._onGround = true;
      mob.vy = 0;
      // Yer yuzasiga joylash
      const surfY = this.world.getSurfaceY(
        Math.round(mob.x), Math.round(mob.z)
      );
      mob.y = surfY;
    } else {
      mob._onGround = false;
      mob.y = newY;
    }

    // Yerdan pastga tushmaslik (void himoyasi)
    if (mob.y < -10) {
      mob.dead = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Qattiq blok tekshiruvi (AABB simplified — radius + height)
  // ─────────────────────────────────────────────────────────────────────────
  _isSolid(x, y, z, radius, height) {
    const x0 = Math.floor(x - radius);
    const x1 = Math.floor(x + radius);
    const y0 = Math.floor(y);
    const y1 = Math.floor(y + height - 0.01);
    const z0 = Math.floor(z - radius);
    const z1 = Math.floor(z + radius);

    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          if (this.world.isSolid(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Raycast — mobga "musht" hujumi uchun (Game.js dan chaqiriladi)
  // ─────────────────────────────────────────────────────────────────────────
  raycastMob(ox, oy, oz, dx, dy, dz, maxDist) {
    let closest     = null;
    let closestDist = maxDist;

    for (const mob of this.mobs) {
      if (mob.dead) continue;

      // Mob markaziga vektor
      const cx = mob.x - ox;
      const cy = mob.y + 0.9 - oy; // mob markazi
      const cz = mob.z - oz;

      // Nurga proyeksiya
      const t = cx * dx + cy * dy + cz * dz;
      if (t < 0 || t > maxDist) continue;

      // Nurdan eng yaqin nuqta
      const px = ox + dx * t - mob.x;
      const py = oy + dy * t - (mob.y + 0.9);
      const pz = oz + dz * t - mob.z;

      // Mob AABB: ~0.5 × 1.8 × 0.5
      if (Math.abs(px) < 0.5 && Math.abs(py) < 0.9 && Math.abs(pz) < 0.5) {
        if (t < closestDist) {
          closestDist = t;
          closest = { mob, distance: t };
        }
      }
    }

    return closest;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Zarba olish (Game.js dan mob.takeDamage() orqali chaqiriladi)
  // ─────────────────────────────────────────────────────────────────────────
  // (Mob classda qo'shamiz — MobManager da ham wrapper kerak emas,
  //  lekin qulaylik uchun shu yerda ham yozib qo'yamiz.)
}

// Mob classga takeDamage metodini qo'shamiz (MobManager tashqarisida ham ishlatiladi)
Mob.prototype.takeDamage = function (dmg, fromYaw) {
  if (this.dead) return;
  this.hp -= dmg;
  this._hurtFlash = HURT_FLASH_TIME;

  // Knockback — zarbadan nariroq uchib ketadi
  if (fromYaw !== undefined) {
    const kb = 4.5;
    this._kbX = -Math.sin(fromYaw) * kb;
    this._kbZ = -Math.cos(fromYaw) * kb;
  }

  if (this.hp <= 0) {
    this.dead = true;
  }
};
