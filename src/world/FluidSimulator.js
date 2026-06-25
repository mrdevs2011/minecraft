import { BLOCK_AIR, BLOCK_WATER } from './Blocks.js';
import { CHUNK_HEIGHT } from './Chunk.js';

export const FLUID_MAX   = 8;
export const FLUID_MIN   = 1;
const MAX_ACTIVE         = 4000;

export class FluidSimulator {
  constructor(world) {
    this.world   = world;
    this._levels = new Map();
    this._sources = new Set();
    this._active = new Set();
    this._toAdd  = new Set();
    this._acc = 0;
    this.STEPS_PER_SECOND = 4;
  }

  registerChunk(chunk) {
    const wx0 = chunk.worldX();
    const wz0 = chunk.worldZ();
    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          if (chunk.get(lx, ly, lz) === BLOCK_WATER) {
            const wx = wx0 + lx, wz = wz0 + lz;
            const key = this._key(wx, ly, wz);
            if (!this._levels.has(key)) {
              this._levels.set(key, FLUID_MAX);
              this._sources.add(key);
              this._active.add(key);
            }
          }
        }
      }
    }
  }

  // ─── Mojang qoidasi: suv qo‘yish mumkin, chuqurlik cheklovi YO‘Q ───
  addSource(wx, wy, wz) {
    const key = this._key(wx, wy, wz);
    this._levels.set(key, FLUID_MAX);
    this._sources.add(key);
    this.world.setBlock(wx, wy, wz, BLOCK_WATER);
    this._active.add(key);
    this._activateNeighbors(wx, wy, wz);
    return true;
  }

  // ─── Mojang qoidasi: suv BUZILADI (agar manba bo‘lmasa) ───
  removeFluid(wx, wy, wz) {
    const key = this._key(wx, wy, wz);
    if (this._sources.has(key)) {
      // Manba suvni buzish uchun bucket kerak — hozircha qo‘llab-quvvatlanmaydi
      return false;
    }
    const level = this._levels.get(key) || 0;
    if (level < FLUID_MAX) {
      this._levels.delete(key);
      this._active.delete(key);
      this.world.setBlock(wx, wy, wz, BLOCK_AIR);
      this._activateNeighbors(wx, wy, wz);
      return true;
    }
    return false;
  }

  // ─── Mojang qoidasi: suv ustiga blok qo‘yish MUMKIN ───
  canPlaceBlockOnWater() {
    return true;
  }

  getLevel(wx, wy, wz) {
    return this._levels.get(this._key(wx, wy, wz)) || 0;
  }

  isWaterTooDeep() {
    return false; // Mojang’da bunday cheklov yo‘q
  }

  tick(dt) {
    this._acc += dt;
    if (this._acc < 1 / this.STEPS_PER_SECOND) return;
    this._acc -= 1 / this.STEPS_PER_SECOND;
    this._step();
  }

  _key(x, y, z)  { return `${x},${y},${z}`; }
  _unkey(key)    { const [x,y,z] = key.split(',').map(Number); return {x,y,z}; }

  _step() {
    if (this._active.size === 0) return;
    const changes = [];
    const touched = new Set();

    for (const sk of this._sources) {
      const lvl = this._levels.get(sk);
      if (lvl !== FLUID_MAX) {
        this._levels.set(sk, FLUID_MAX);
        this._active.add(sk);
      }
    }

    const keys = [...this._active].slice(0, MAX_ACTIVE);
    keys.sort((a, b) => Number(a.split(',')[1]) - Number(b.split(',')[1]));

    for (const key of keys) {
      const level = this._levels.get(key);
      if (level === undefined) continue;
      const {x, y, z} = this._unkey(key);
      const isSource = this._sources.has(key);

      if (!isSource && level < FLUID_MIN) {
        changes.push({ key, level: 0 });
        continue;
      }

      // Pastga tushish
      if (y > 0) {
        const belowKey = this._key(x, y-1, z);
        const belowBlock = this.world.getBlock(x, y-1, z);
        const belowLevel = this._levels.get(belowKey) || 0;
        if ((belowBlock === BLOCK_AIR || belowBlock === BLOCK_WATER) && belowLevel < FLUID_MAX) {
          const give = Math.min(level, FLUID_MAX - belowLevel);
          if (give > 0) {
            changes.push({ key: belowKey, level: belowLevel + give, block: BLOCK_WATER });
            if (!isSource) changes.push({ key, level: isSource ? level : Math.max(0, level - give) });
            touched.add(belowKey);
            this._toAdd.add(belowKey);
            continue;
          }
        }
      }

      // Yonga tarqalish
      const neighbors = [[x+1,y,z], [x-1,y,z], [x,y,z+1], [x,y,z-1]];
      for (const [nx, ny, nz] of neighbors) {
        if (this.world.isSolid(nx, ny, nz)) continue;
        const nKey = this._key(nx, ny, nz);
        if (touched.has(nKey)) continue;
        const nBlock = this.world.getBlock(nx, ny, nz);
        if (nBlock !== BLOCK_AIR && nBlock !== BLOCK_WATER) continue;
        const nLevel = this._levels.get(nKey) || 0;
        if (level > nLevel + 1) {
          const give = Math.floor((level - nLevel) / 2);
          if (give > 0) {
            changes.push({ key: nKey, level: nLevel + give, block: BLOCK_WATER });
            if (!isSource) changes.push({ key, level: Math.max(0, level - give) });
            touched.add(nKey);
            this._toAdd.add(nKey);
            break;
          }
        }
      }
    }

    for (const { key, level, block } of changes) {
      if (this._sources.has(key) && level < FLUID_MAX) continue;
      if (level <= 0) {
        this._levels.delete(key);
        this._active.delete(key);
        const {x,y,z} = this._unkey(key);
        if (this.world.getBlock(x,y,z) === BLOCK_WATER) {
          this.world.setBlock(x, y, z, BLOCK_AIR);
        }
        this._activateNeighbors(x, y, z);
      } else {
        this._levels.set(key, level);
        if (block === BLOCK_WATER) {
          const {x,y,z} = this._unkey(key);
          this.world.setBlock(x, y, z, BLOCK_WATER);
        }
        this._active.add(key);
      }
    }
    for (const k of this._toAdd) this._active.add(k);
    this._toAdd.clear();
  }

  _activateNeighbors(wx, wy, wz) {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (const [dx,dy,dz] of dirs) {
      const nx = wx+dx, ny = wy+dy, nz = wz+dz;
      if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
      if (this.world.getBlock(nx, ny, nz) === BLOCK_WATER) {
        this._active.add(this._key(nx, ny, nz));
      }
    }
  }
}