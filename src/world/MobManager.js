// ─────────────────────────────────────────────────────────────────────────────
//  MobManager — Qo'y (sheep) va Zombi (zombie) moblari boshqaruvchisi
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SHEEP   = 6;
const MAX_ZOMBIES = 4;

const SHEEP_SPEED   = 2.2;
const ZOMBIE_SPEED  = 2.8;   // biroz tezroq — qo'rqinchli

const SHEEP_ROAM_RADIUS   = 18;
const ZOMBIE_CHASE_DIST   = 22; // zombi shu masofada player ni ko'radi
const ZOMBIE_ATTACK_DIST  = 1.5; // shu masofada zarba beradi
const ZOMBIE_ATTACK_DMG   = 2;   // bir zarba ziyoni
const ZOMBIE_ATTACK_CD    = 1.0; // zarba orasidagi cooldown (sekund)

const GRAVITY     = -18;
const JUMP_VEL    =  7;

const HURT_FLASH_TIME = 0.25;
const SHEEP_HP        = 8;
const ZOMBIE_HP       = 20;

let _nextId = 1;

// ─────────────────────────────────────────────────────────────────────────────
//  Mob class
// ─────────────────────────────────────────────────────────────────────────────
class Mob {
  constructor(type, x, y, z) {
    this.id     = _nextId++;
    this.type   = type;
    this.x      = x;
    this.y      = y;
    this.z      = z;
    this.yaw    = Math.random() * Math.PI * 2;
    this.vy     = 0;
    this.moving = false;
    this.hp     = type === 'zombie' ? ZOMBIE_HP : SHEEP_HP;
    this.dead   = false;

    // Bosh burish (player tomonga)
    this.headYaw   = 0;  // nisbiy yaw (tanaga nisbatan)
    this.headPitch = 0;  // boshning yuqori-pastga burishi
    this.isChasing = false; // player ni ko'ryaptimi

    // Qo'l silkitish animatsiyasi
    this.attackAnim = 0; // 0..1 sikl

    this._state      = 'idle';
    this._stateTimer = 0;
    this._targetX    = x;
    this._targetZ    = z;
    this._spawnX     = x;
    this._spawnZ     = z;
    this._attackCooldown = 0;
    this._hurtFlash = 0;
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

  init(playerX, playerZ) {
    for (let i = 0; i < MAX_SHEEP; i++) {
      this._spawnMob('sheep', playerX, playerZ);
    }
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

      const blockBelow = this.world.getBlock(wx, wy - 1, wz);
      if (blockBelow === 7) continue; // suv

      const mob = new Mob(type, wx, wy, wz);
      this.mobs.push(mob);
      return mob;
    }
    return null;
  }

  update(dt, player) {
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      this._updateMob(mob, dt, player);
    }

    // ── Mob-mob separation — bir-birining ichiga kirmasin ─────────────────
    this._separateMobs();

    this.mobs = this.mobs.filter(m => !m.dead);
  }

  // Har ikkita mob orasidagi masofani tekshirib, juda yaqin bo'lsa itaramiz
  _separateMobs() {
    const MOB_RADIUS    = 0.4;
    const MIN_DIST      = MOB_RADIUS * 2;
    const PUSH_STRENGTH = 0.15;

    for (let i = 0; i < this.mobs.length; i++) {
      const a = this.mobs[i];
      if (a.dead) continue;

      for (let j = i + 1; j < this.mobs.length; j++) {
        const b = this.mobs[j];
        if (b.dead) continue;

        const dx   = b.x - a.x;
        const dz   = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < MIN_DIST && dist > 0.001) {
          const push = (MIN_DIST - dist) * PUSH_STRENGTH;
          const nx   = dx / dist;
          const nz   = dz / dist;

          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
        }
      }
    }
  }

  _updateMob(mob, dt, player) {
    if (mob._hurtFlash > 0) {
      mob._hurtFlash -= dt;
      if (mob._hurtFlash < 0) mob._hurtFlash = 0;
    }
    if (mob._attackCooldown > 0) mob._attackCooldown -= dt;

    if (mob.type === 'sheep') {
      this._updateSheep(mob, dt);
    } else {
      this._updateZombie(mob, dt, player);
    }

    // Fizika — barcha moblar uchun (yerda yuradi)
    this._applyPhysics(mob, dt);
  }

  // ─── Qo'y AI ─────────────────────────────────────────────────────────────
  _updateSheep(mob, dt) {
    mob._stateTimer -= dt;
    const dx = mob.x - mob._spawnX;
    const dz = mob.z - mob._spawnZ;
    const distFromSpawn = Math.sqrt(dx * dx + dz * dz);

    if (mob._state === 'idle') {
      mob.moving = false;
      if (mob._stateTimer <= 0) {
        if (distFromSpawn > SHEEP_ROAM_RADIUS) {
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

  // ─── Zombi AI ─────────────────────────────────────────────────────────────
  _updateZombie(mob, dt, player) {
    const dx   = player.x - mob.x;
    const dz   = player.z - mob.z;
    const dist2D = Math.sqrt(dx * dx + dz * dz);

    // Player ko'zga ko'rinadimi
    const sees = dist2D < ZOMBIE_CHASE_DIST;
    mob.isChasing = sees;

    if (sees) {
      mob._state   = 'chase';
      mob._targetX = player.x;
      mob._targetZ = player.z;

      // ── Bosh burish: player tomonga qarash ──────────────────────────────
      // headYaw: tana yaw ga nisbatan farq (±PI/2 oralig'ida)
      const toPlayerAngle = Math.atan2(-dx, -dz);
      let rawDiff = toPlayerAngle - mob.yaw;
      // Normalize to [-PI, PI]
      while (rawDiff >  Math.PI) rawDiff -= Math.PI * 2;
      while (rawDiff < -Math.PI) rawDiff += Math.PI * 2;
      // Boshni max ±70° burish
      const maxHeadYaw = Math.PI * 0.39;
      mob.headYaw = Math.max(-maxHeadYaw, Math.min(maxHeadYaw, rawDiff));

      // headPitch: player ga yuqoriga/pastga qarash
      const playerEyeY = player.y + 1.62;
      const zombieEyeY = mob.y + 1.6;
      const dy3d       = playerEyeY - zombieEyeY;
      mob.headPitch = Math.max(-0.4, Math.min(0.4, Math.atan2(dy3d, dist2D + 0.01)));

      // ── Zarba masofasida ─────────────────────────────────────────────────
      if (dist2D < ZOMBIE_ATTACK_DIST) {
        mob.moving = false;
        mob._state = 'attack';
        // Qo'l silkitish animatsiyasi
        mob.attackAnim = (mob.attackAnim + dt * 4.0) % 1.0;

        if (mob._attackCooldown <= 0) {
          mob._attackCooldown = ZOMBIE_ATTACK_CD;
          player.takeDamage(ZOMBIE_ATTACK_DMG);
          // O'yinchi o'lganda respawn bo'ladi (Player.js da bor)
        }
      } else {
        mob.moving = true;
        mob.attackAnim = 0;
        this._moveToward(mob, player.x, player.z, ZOMBIE_SPEED, dt);
      }

    } else {
      // Player ko'rinmaydi — bosh to'g'rilaydi, bekor aylanadi
      mob.isChasing  = false;
      mob.headYaw    = 0;
      mob.headPitch  = 0;
      mob.attackAnim = 0;
      mob._stateTimer -= dt;

      if (mob._state === 'idle' || mob._state === 'chase') {
        mob._state      = 'idle';
        mob._stateTimer = 2 + Math.random() * 3;
        mob.moving      = false;
      }
      if (mob._stateTimer <= 0) {
        const angle  = Math.random() * Math.PI * 2;
        mob._targetX = mob.x + Math.cos(angle) * (3 + Math.random() * 5);
        mob._targetZ = mob.z + Math.sin(angle) * (3 + Math.random() * 5);
        mob._state      = 'roam';
        mob._stateTimer = 3 + Math.random() * 4;
      } else if (mob._state === 'roam') {
        mob.moving = true;
        const moved = this._moveToward(mob, mob._targetX, mob._targetZ, ZOMBIE_SPEED * 0.55, dt);
        if (!moved || mob._stateTimer <= 0) {
          mob._state      = 'idle';
          mob._stateTimer = 2 + Math.random() * 3;
          mob.moving      = false;
        }
      }
    }
  }

  // ─── Maqsadga harakat ─────────────────────────────────────────────────────
  _moveToward(mob, tx, tz, speed, dt) {
    const dx   = tx - mob.x;
    const dz   = tz - mob.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.3) return false;

    const nx = dx / dist;
    const nz = dz / dist;

    mob.yaw = Math.atan2(-nx, -nz);

    const kbDecay = Math.exp(-8 * dt);
    mob._kbX *= kbDecay;
    mob._kbZ *= kbDecay;

    const newX = mob.x + (nx * speed + mob._kbX) * dt;
    const newZ = mob.z + (nz * speed + mob._kbZ) * dt;

    const mobH = 1.8;
    const mobR = 0.4;  // kattaroq radius — blok ichiga kirmasin

    const canX = !this._isSolid(newX, mob.y, mob.z, mobR, mobH);
    const canZ = !this._isSolid(mob.x, mob.y, newZ, mobR, mobH);

    if (canX) mob.x = newX;
    if (canZ) mob.z = newZ;

    if (!canX || !canZ) {
      if (mob._onGround) {
        const frontX = mob.x + nx * 0.6;
        const frontZ = mob.z + nz * 0.6;
        const frontSolid = this._isSolid(frontX, mob.y + 0.1, frontZ, mobR, 1.0);
        if (frontSolid) mob.vy = JUMP_VEL;
      }
      return false;
    }
    return true;
  }

  // ─── Fizika ───────────────────────────────────────────────────────────────
  _applyPhysics(mob, dt) {
    mob.vy += GRAVITY * dt;
    const newY = mob.y + mob.vy * dt;

    const mobR = 0.4;  // blok ichiga kirmasin
    const solidBelow = this._isSolid(mob.x, newY - 0.05, mob.z, mobR, 0.1);

    if (solidBelow && mob.vy <= 0) {
      mob._onGround = true;
      mob.vy = 0;
      const surfY = this.world.getSurfaceY(Math.round(mob.x), Math.round(mob.z));
      mob.y = surfY;
    } else {
      mob._onGround = false;
      mob.y = newY;
    }

    if (mob.y < -10) mob.dead = true;
  }

  // ─── Blok tekshiruvi ──────────────────────────────────────────────────────
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

  // ─── Raycast (musht zarba) ────────────────────────────────────────────────
  raycastMob(ox, oy, oz, dx, dy, dz, maxDist) {
    let closest     = null;
    let closestDist = maxDist;

    for (const mob of this.mobs) {
      if (mob.dead) continue;

      const cx = mob.x - ox;
      const cy = mob.y + 0.9 - oy;
      const cz = mob.z - oz;

      const t = cx * dx + cy * dy + cz * dz;
      if (t < 0 || t > maxDist) continue;

      const px = ox + dx * t - mob.x;
      const py = oy + dy * t - (mob.y + 0.9);
      const pz = oz + dz * t - mob.z;

      if (Math.abs(px) < 0.5 && Math.abs(py) < 0.9 && Math.abs(pz) < 0.5) {
        if (t < closestDist) {
          closestDist = t;
          closest = { mob, distance: t };
        }
      }
    }
    return closest;
  }
}

Mob.prototype.takeDamage = function (dmg, fromYaw) {
  if (this.dead) return;
  this.hp -= dmg;
  this._hurtFlash = HURT_FLASH_TIME;

  if (fromYaw !== undefined) {
    const kb = 4.5;
    this._kbX = -Math.sin(fromYaw) * kb;
    this._kbZ = -Math.cos(fromYaw) * kb;
  }

  if (this.hp <= 0) {
    this.dead = true;
  }
};
