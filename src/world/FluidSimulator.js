/**
 * FluidSimulator — Cellular Automata asosida suv oqimi
 *
 * QOIDALAR (haqiqiy hayotga yaqin):
 *   1. Suv BUZILMAYDI  — faqat removeFluid() orqali olib tashlanadi.
 *      O'yinchi suv blokiga bolta ursa — hech narsa bo'lmaydi.
 *
 *   2. Suv ustiga QATTIQ blok qo'yib bo'lmaydi — Game.js _placeBlock() da
 *      tekshiriladi.
 *
 *   3. Suv ustiga SUV qo'yib bo'lmaydi (3+ blok chuqurlikda) —
 *      isWaterTooDeep(x,y,z) → true bo'lsa addSource() chaqirilmaydi.
 *      (1-2 blok chuqurlikda "bucket" bilan to'ldirish mumkin.)
 *
 *   4. Pastga tushadi (gravitatsiya) — pastda bo'sh joy bo'lsa avval pastga.
 *
 *   5. Yonga oqadi — tekis yer ustida level tenglanadi.
 *
 *   6. Vodoshad — yon tomonda "cliff" bo'lsa tezroq oqadi.
 *
 *   7. Haqiqiy hayot: suv quyilganda PASTGA tushadi, yerga yetganda yoniga
 *      tarqaladi. Suv → suv ustiga tushganda pastki suv bilan qo'shilmaydi,
 *      balki ustiga tushadi (agar joy bo'lsa pastga o'tadi).
 */

import { BLOCK_AIR, BLOCK_WATER } from './Blocks.js';
import { CHUNK_HEIGHT } from './Chunk.js';

export const FLUID_MAX   = 8;   // to'liq blok
export const FLUID_MIN   = 1;   // minimal (bundan kam bo'lsa yo'qoladi)
const MAX_ACTIVE         = 4000; // performance himoya

export class FluidSimulator {
  constructor(world) {
    this.world   = world;
    // Suv darajasi: "x,y,z" → level (1..8)
    this._levels = new Map();
    // Manba kataklari — bu kataklarning leveli hech qachon kamaymasin
    this._sources = new Set();
    // Aktiv kataklarni Set da saqlash
    this._active = new Set();
    this._toAdd  = new Set();
    // Time accumulator
    this.STEPS_PER_SECOND = 6;
    this._acc = 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Dunyo generatsiyasidan chiqqan suv bloklarini CA ga ro'yxatdan o'tkazish.
   * Bu katakllar "manba" EMAS — ular oqib ketishi mumkin.
   */
  registerChunk(chunk) {
    const wx0 = chunk.worldX();
    const wz0 = chunk.worldZ();
    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          if (chunk.get(lx, ly, lz) === BLOCK_WATER) {
            const wx = wx0 + lx;
            const wz = wz0 + lz;
            const key = this._key(wx, ly, wz);
            if (!this._levels.has(key)) {
              this._levels.set(key, FLUID_MAX);
              // Dunyo generatsiyasidagi suvlar manba sifatida belgilanadi —
              // ular "okean/ko'l" bo'ladi va qurimaydi.
              this._sources.add(key);
              this._active.add(key);
            }
          }
        }
      }
    }
  }

  /**
   * O'yinchi bucket bilan suv qo'yganida.
   * TEKSHIRUVLAR:
   *   — Agar manzil allaqachon suv bo'lsa → suv ustiga suv qo'yilmaydi (3+ chuqur)
   *   — Qo'yilgan blok "manba" (source) sifatida belgilanadi
   */
  addSource(wx, wy, wz) {
    // Agar 3 yoki undan ko'p blok chuqurlikda suv bo'lsa — qo'yib bo'lmaydi
    if (this.isWaterTooDeep(wx, wy, wz)) {
      console.log('[Fluid] Suv 3+ blok chuqurlikda — ustiga suv qo\'yib bo\'lmaydi');
      return false;
    }
    const key = this._key(wx, wy, wz);
    this._levels.set(key, FLUID_MAX);
    this._sources.add(key);          // bu katak manba — qurimaydi
    this.world.setBlock(wx, wy, wz, BLOCK_WATER);
    this._active.add(key);
    this._activateNeighbors(wx, wy, wz);
    return true;
  }

  /**
   * Suv bloki buzilishga uringanida — BUZILMAYDI.
   * Game.js _breakBlock() bu funksiyani chaqiradi.
   * Har doim false qaytaradi (buzib bo'lmaydi).
   */
  removeFluid(wx, wy, wz) {
    // Suv buzilmaydi — hech narsa qilmaymiz
    // (agar kelajakda "bucket" bilan olib tashlashni qo'shmoqchi bo'lsangiz,
    //  faqat shu joyni o'zgartiring)
    return false;
  }

  /**
   * Suv darjasini olish (render uchun).
   */
  getLevel(wx, wy, wz) {
    return this._levels.get(this._key(wx, wy, wz)) || 0;
  }

  /**
   * Berilgan (wx, wy, wz) koordinatasidan PASTGA qarab
   * ketma-ket qancha blok suv borligini hisoblaydi.
   * 3 yoki undan ko'p bo'lsa — true qaytaradi.
   */
  isWaterTooDeep(wx, wy, wz) {
    let depth = 0;
    for (let y = wy; y >= 0; y--) {
      if (this.world.getBlock(wx, y, wz) === BLOCK_WATER) {
        depth++;
        if (depth >= 3) return true;
      } else {
        break;
      }
    }
    return false;
  }

  /**
   * Suv ustiga qattiq blok qo'yib bo'ladimi?
   * false qaytarsa — qo'yib bo'lmaydi.
   */
  canPlaceBlockOnWater(wx, wy, wz) {
    // Suv bloki ustiga HECH QANDAY qattiq blok qo'yib bo'lmaydi
    const belowBlock = this.world.getBlock(wx, wy - 1, wz);
    if (belowBlock === BLOCK_WATER) return false;
    return true;
  }

  /**
   * Game loop dan chaqiriladi. dt = delta time (soniya).
   */
  tick(dt) {
    this._acc += dt;
    const interval = 1 / this.STEPS_PER_SECOND;
    if (this._acc >= interval) {
      this._acc -= interval;
      this._step();
    }
  }

  // ── Ichki logika ───────────────────────────────────────────────────────────

  _key(x, y, z)  { return `${x},${y},${z}`; }
  _unkey(key)    { const [x,y,z] = key.split(',').map(Number); return {x,y,z}; }

  _step() {
    if (this._active.size === 0) return;

    const changes = [];  // [{key, level, block?}]
    const touched = new Set();

    // Manba kataklarning levelini har doim FLUID_MAX ga tiklash
    for (const sk of this._sources) {
      const lvl = this._levels.get(sk);
      if (lvl !== FLUID_MAX) {
        this._levels.set(sk, FLUID_MAX);
        this._active.add(sk);
      }
    }

    const keys = [...this._active].slice(0, MAX_ACTIVE);

    // Pastdagi kataklarni avval ishla (gravitatsiya uchun)
    keys.sort((a, b) => {
      const ya = Number(a.split(',')[1]);
      const yb = Number(b.split(',')[1]);
      return ya - yb;
    });

    for (const key of keys) {
      const level = this._levels.get(key);
      if (level === undefined) continue;

      const {x, y, z} = this._unkey(key);
      const isSource = this._sources.has(key);

      // Manba bo'lmagan va juda oz suv → yo'qolsin
      if (!isSource && level < FLUID_MIN) {
        changes.push({ key, level: 0 });
        continue;
      }

      // ── Qoida 1: Pastga tushish (gravitatsiya) ───────────────────────────
      if (y > 0) {
        const belowKey   = this._key(x, y-1, z);
        const belowBlock = this.world.getBlock(x, y-1, z);
        const belowLevel = this._levels.get(belowKey) || 0;

        if (belowBlock === BLOCK_AIR || belowBlock === BLOCK_WATER) {
          if (belowLevel < FLUID_MAX && !touched.has(belowKey)) {
            // Haqiqiy hayot: quyilgan suv to'liq FLUID_MAX bilan pastga tushadi
            // (bucket effekti — yuklanadigan miqdor)
            const give = Math.min(level, FLUID_MAX - belowLevel);
            if (give > 0) {
              const newBelow = belowLevel + give;
              const newSelf  = isSource ? level : Math.max(0, level - give);
              changes.push({ key: belowKey, level: newBelow, block: BLOCK_WATER });
              if (!isSource) changes.push({ key, level: newSelf });
              touched.add(belowKey);
              this._toAdd.add(belowKey);
              // Pastga tushmaydi demasak yonga tarqalmassin
              continue;
            }
          }
        }
      }

      // ── Qoida 2: Vodoshad — yon tomonda "cliff" bo'lsa tezroq oqadi ─────
      const neighbors4 = [
        [x+1, y, z], [x-1, y, z], [x, y, z+1], [x, y, z-1]
      ];

      let spreadCliff = false;
      for (const [nx, ny, nz] of neighbors4) {
        if (this.world.isSolid(nx, ny, nz)) continue;
        const nKey       = this._key(nx, ny, nz);
        const nBlock     = this.world.getBlock(nx, ny, nz);
        if (nBlock !== BLOCK_AIR && nBlock !== BLOCK_WATER) continue;
        if (touched.has(nKey)) continue;

        const downBlock  = this.world.getBlock(nx, ny-1, nz);
        const downKey    = this._key(nx, ny-1, nz);
        // Yon tomonda pastga tushish mumkinmi?
        if (downBlock === BLOCK_AIR && !this.world.isSolid(nx, ny-1, nz)) {
          const nLevel = this._levels.get(nKey) || 0;
          if (level > nLevel + 1) {
            const give     = Math.floor((level - nLevel) / 2);
            const newSelf  = isSource ? level : Math.max(0, level - give);
            const newN     = nLevel + give;
            if (give > 0) {
              changes.push({ key: nKey, level: newN, block: BLOCK_WATER });
              if (!isSource) changes.push({ key, level: newSelf });
              touched.add(nKey);
              this._toAdd.add(nKey);
              spreadCliff = true;
              break;
            }
          }
        }
      }
      if (spreadCliff) continue;

      // ── Qoida 3: Tekis yer — level tenglanadi ────────────────────────────
      for (const [nx, ny, nz] of neighbors4) {
        if (this.world.isSolid(nx, ny, nz)) continue;
        const nKey   = this._key(nx, ny, nz);
        if (touched.has(nKey)) continue;
        const nBlock = this.world.getBlock(nx, ny, nz);
        if (nBlock !== BLOCK_AIR && nBlock !== BLOCK_WATER) continue;
        const nLevel = this._levels.get(nKey) || 0;

        if (level > nLevel + 1) {
          const give    = Math.floor((level - nLevel) / 2);
          const newSelf = isSource ? level : Math.max(0, level - give);
          const newN    = nLevel + give;
          if (give > 0) {
            changes.push({ key: nKey, level: newN, block: BLOCK_WATER });
            if (!isSource) changes.push({ key, level: newSelf });
            touched.add(nKey);
            this._toAdd.add(nKey);
            break;
          }
        }
      }
    }

    // ── Barcha o'zgarishlarni qo'llash ────────────────────────────────────────
    for (const { key, level, block } of changes) {
      // Manba kataklarning levelini pasaytirmaymiz
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
