import { BLOCK_AIR, BLOCK_WATER } from '../world/Blocks.js';

const GRAVITY        = -24.0;
const JUMP_FORCE     =  8.6;
const MOVE_SPEED     =  4.317;
const SPRINT_SPEED   =  5.612;
const EYE_HEIGHT     =  1.62;

const WATER_GRAVITY   = -3.0;
const WATER_SWIM_UP   =  3.8;
const WATER_MOVE_MULT =  0.5;
const WATER_DRAG      =  0.8;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0; this.y = 70; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw   = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater  = false;
    this.maxHealth = 20;
    this.health = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this._hungerTimer = 0;
    this.inventory = new Array(36).fill(null);
    this.hotbarSlot = 0;
    this.width  = 0.6;
    this.height = 1.8;
    this._spaceWasUp = true;
    this._initInventory();
  }

  _initInventory() { this.inventory = new Array(36).fill(null); }

  getEyeX() { return this.x; }
  getEyeY() { return this.y + EYE_HEIGHT; }
  getEyeZ() { return this.z; }

  getBlockCoords() {
    return { bx: Math.floor(this.x), by: Math.floor(this.y), bz: Math.floor(this.z) };
  }

  getSelectedBlock() { return this.inventory[this.hotbarSlot]; }

  update(dt, input) {
    this._handleMovement(dt, input);
    this._applyGravity(dt);
    this._resolveCollision(dt);
    this._updateHunger(dt);
  }

  _updateHunger(dt) {
    this._hungerTimer += dt;
    if (this._hungerTimer >= 80) {
      this._hungerTimer = 0;
      if (this.hunger > 0) this.hunger -= 1;
      else if (this.health > 1) this.health -= 1;
    }
    if (this.hunger >= 18 && this.health < this.maxHealth) {
      if (this._hungerTimer % 20 < dt) this.health += 1;
    }
  }

  eat(hungerAmount) { this.hunger = Math.min(this.maxHunger, this.hunger + hungerAmount); }

  _handleMovement(dt, input) {
    const eyeBlock = this.world.getBlock(
      Math.floor(this.x),
      Math.floor(this.y + EYE_HEIGHT * 0.8),
      Math.floor(this.z)
    );
    this.inWater = (eyeBlock === BLOCK_WATER);

    const speedMult = this.inWater ? WATER_MOVE_MULT : 1.0;
    const speed = (input.sprint ? SPRINT_SPEED : MOVE_SPEED) * speedMult;

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (input.forward)  { mx += -sinY * speed; mz += -cosY * speed; }
    if (input.backward) { mx -= -sinY * speed; mz -= -cosY * speed; }
    if (input.left)     { mx += -cosY * speed; mz +=  sinY * speed; }
    if (input.right)    { mx -= -cosY * speed; mz -=  sinY * speed; }

    if (this.inWater) {
      this.vx = this.vx * WATER_DRAG + mx * (1 - WATER_DRAG);
      this.vz = this.vz * WATER_DRAG + mz * (1 - WATER_DRAG);
      if (input.jump) this.vy = WATER_SWIM_UP;
    } else {
      this.vx = mx;
      this.vz = mz;
      const spaceDown = !!input.jump;
      if (spaceDown && this._spaceWasUp && this.onGround) {
        this.vy = JUMP_FORCE;
        this.onGround = false;
      }
      this._spaceWasUp = !spaceDown;
    }
  }

  _applyGravity(dt) {
    if (this.inWater) {
      this.vy += WATER_GRAVITY * dt;
      this.vy *= 0.9;
      if (this.vy < -2) this.vy = -2;
    } else if (!this.onGround) {
      this.vy += GRAVITY * dt;
      if (this.vy < -40) this.vy = -40;
    }
  }

  _resolveCollision(dt) {
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const nz = this.z + this.vz * dt;

    if (!this._collidesHorizontal(nx, this.y, this.z)) this.x = nx;
    if (!this._collidesHorizontal(this.x, this.y, nz)) this.z = nz;

    if (!this._collidesAt(this.x, ny, this.z)) {
      this.y = ny;
      this.onGround = false;
    } else {
      if (this.vy < 0) {
        this.onGround = true;
        this._snapToBlockSurface();
      }
      this.vy = 0;
    }
    this.onGround = this._isOnGround();
  }

  _snapToBlockSurface() {
    const blockY = Math.floor(this.y);
    const blockId = this.world.getBlock(Math.floor(this.x), blockY, Math.floor(this.z));
    if (blockId !== BLOCK_AIR) this.y = blockY + 1;
  }

  _isOnGround() {
    const hw = this.width / 2;
    const feetY = this.y - 0.05;
    for (let dx = -hw; dx <= hw; dx += hw) {
      for (let dz = -hw; dz <= hw; dz += hw) {
        if (this.world.isSolid(Math.floor(this.x + dx), Math.floor(feetY), Math.floor(this.z + dz))) return true;
      }
    }
    return false;
  }

  _collidesHorizontal(x, y, z) {
    const hw = this.width / 2;
    for (let dx = -hw; dx <= hw; dx += hw) {
      for (let dz = -hw; dz <= hw; dz += hw) {
        for (let dy = 0.05; dy < this.height; dy += 0.25) {
          if (this.world.isSolid(Math.floor(x + dx), Math.floor(y + dy), Math.floor(z + dz))) return true;
        }
      }
    }
    return false;
  }

  _collidesAt(x, y, z) {
    const hw = this.width / 2;
    for (let dx = -hw; dx <= hw; dx += hw) {
      for (let dz = -hw; dz <= hw; dz += hw) {
        for (let dy = 0.05; dy < this.height; dy += 0.45) {
          if (this.world.isSolid(Math.floor(x + dx), Math.floor(y + dy), Math.floor(z + dz))) return true;
        }
      }
    }
    return false;
  }

  respawn() {
    const sx = this.world.getSurfaceY(0, 0);
    this.x = 0; this.y = sx + 2; this.z = 0;
    this.vx = this.vy = this.vz = 0;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
  }
}