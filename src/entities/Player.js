import { BLOCK_AIR, BLOCK_WATER } from '../world/Blocks.js';

const GRAVITY        = -22;      // biroz yumshoqroq, haqiqiyroq his
const JUMP_FORCE     =  8.5;
const MOVE_SPEED     =  4.8;
const SPRINT_SPEED   =  7.5;
const EYE_HEIGHT     =  1.62;

// Suv ichida
const WATER_GRAVITY   = -4;      // suv ichida sekin tushadi
const WATER_SWIM_UP   =  4;      // bo'sh joy tugmasi bilan suzib chiqadi
const WATER_MOVE_MULT =  0.55;   // suv ichida harakatlanish sekinroq
const WATER_DRAG      =  0.85;   // suv inersiyasi (har frame vx/vz ko'paytiriladi)

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0; this.y = 70; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw   = 0;   // radians — decreases when mouse moves right (THREE.js convention)
    this.pitch = 0;   // radians — decreases when mouse moves down
    this.onGround = false;
    this.inWater  = false;
    this._swimWasUp = true; this.maxHealth = 20;
    this.hunger    = 20; this.maxHunger = 20;
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

  // O'yinchi turgan blok koordinatalarini qaytaradi: { bx, by, bz }
  getBlockCoords() {
    return {
      bx: Math.floor(this.x),
      by: Math.floor(this.y),
      bz: Math.floor(this.z),
    };
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
    if (this._hungerTimer >= 12) {
      this._hungerTimer = 0;
      if (this.hunger > 0) this.hunger -= 1;
      else if (this.health > 1) this.health -= 1;
    }
  }

  eat(hungerAmount) { this.hunger = Math.min(this.maxHunger, this.hunger + hungerAmount); }

  _handleMovement(dt, input) {
    // Suv ichidami tekshir (ko'z balandligida)
    const eyeBlockId = this.world.getBlock(
      Math.floor(this.x),
      Math.floor(this.y + EYE_HEIGHT * 0.8),
      Math.floor(this.z)
    );
    this.inWater = (eyeBlockId === BLOCK_WATER);

    // Oyoq bloki ham suvdami
    const feetBlockId = this.world.getBlock(
      Math.floor(this.x),
      Math.floor(this.y + 0.1),
      Math.floor(this.z)
    );
    const feetInWater = (feetBlockId === BLOCK_WATER);

    const speedMult = this.inWater ? WATER_MOVE_MULT : 1.0;
    const speed = (input.sprint ? SPRINT_SPEED : MOVE_SPEED) * speedMult;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    let mx = 0, mz = 0;
    if (input.forward)  { mx += -sinY * speed; mz += -cosY * speed; }
    if (input.backward) { mx -=  -sinY * speed; mz -= -cosY * speed; }
    if (input.left)     { mx += -cosY * speed; mz +=  sinY * speed; }
    if (input.right)    { mx -=  -cosY * speed; mz -=  sinY * speed; }

    if (this.inWater || feetInWater) {
      // Suv ichida harakatlanish — inersiya bilan
      this.vx = this.vx * WATER_DRAG + mx * (1 - WATER_DRAG);
      this.vz = this.vz * WATER_DRAG + mz * (1 - WATER_DRAG);

      // Bo'shliq tugmasi = suzib yuqoriga chiqish
      if (input.jump) {
        this.vy = WATER_SWIM_UP;
      }
    } else {
      this.vx = mx;
      this.vz = mz;

      // Sakrash — faqat quruqlikda
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
      // Suv ichida sekin cho'kadi, drag bilan
      this.vy += WATER_GRAVITY * dt;
      this.vy *= 0.92;              // suv qarshiligi
      if (this.vy < -3) this.vy = -3;
    } else if (!this.onGround) {
      this.vy += GRAVITY * dt;
      if (this.vy < -50) this.vy = -50;
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
        // Pastdagi blok ustiga aniq snap qil
        this._snapToBlockSurface();
      }
      this.vy = 0;
    }

    // onGround = true faqat oyoq ostida blok bo'lsa
    // (yon yoki yuqoridagi blok sakrashni blokirovka qilmasin)
    this.onGround = this._isOnGround();
  }

  // Oyoq ostidagi qattiq blokni topib, o'yinchini uning yuqori chegarasiga snap qiladi.
  // Blok havo bo'lsa hech narsa qilmaydi.
  _snapToBlockSurface() {
    const blockY = Math.floor(this.y);           // oyoq turgan blok
    const blockId = this.world.getBlock(
      Math.floor(this.x), blockY, Math.floor(this.z)
    );
    if (blockId !== BLOCK_AIR) {
      this.y = blockY + 1;                       // blok yuqori chegarasi
    }
  }

  // Faqat oyoq ostini tekshiradi — player pastga bitta pixel siljisa blokka tegadimi?
  _isOnGround() {
    const hw = this.width / 2;
    const feetY = this.y - 0.05; // oyoq ostidan biroz pastroq
    for (let dx = -hw; dx <= hw; dx += hw) {
      for (let dz = -hw; dz <= hw; dz += hw) {
        if (this.world.isSolid(
          Math.floor(this.x + dx),
          Math.floor(feetY),
          Math.floor(this.z + dz)
        )) return true;
      }
    }
    return false;
  }

  // Yon harakatlar (X/Z) uchun: o'yinchi balandligi bo'ylab har 0.25 birlkda tekshiradi.
  // _collidesAt dan aniqroq — tor devor teshiklaridan o'tib ketishni oldini oladi.
  _collidesHorizontal(x, y, z) {
    const hw = this.width / 2;
    for (let dx = -hw; dx <= hw; dx += hw) {
      for (let dz = -hw; dz <= hw; dz += hw) {
        for (let dy = 0.05; dy < this.height; dy += 0.25) {
          if (this.world.isSolid(
            Math.floor(x + dx),
            Math.floor(y + dy),
            Math.floor(z + dz)
          )) return true;
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
          if (this.world.isSolid(
            Math.floor(x + dx),
            Math.floor(y + dy),
            Math.floor(z + dz)
          )) return true;
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
  }
}
