import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk.js';
import { WorldGenerator } from './WorldGenerator.js';
import { BLOCK_AIR, BLOCK_WATER, getBlock } from './Blocks.js';
import { FluidSimulator } from './FluidSimulator.js';

const SHARED_WORLD_SEED = 1337;

export class World {
  constructor() {
    this.seed      = SHARED_WORLD_SEED;
    this.generator = new WorldGenerator(this.seed);
    this.chunks    = new Map();
    this._loading  = new Set();
    this.renderDistance = 3;

    // ── Fluid simulator (CA) ─────────────────────────────────────────────────
    this.fluid = new FluidSimulator(this);
    // Fluid tick — Game loop dan chaqiriladi (game.js: world.tick(dt))
  }

  _chunkKey(cx, cz) { return `${cx},${cz}`; }

  getChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const placeholder = this.generator.generateChunk(cx, cz);
    this.chunks.set(key, placeholder);

    // Yangi chunk dagi suv bloklarini CA ga ro'yxatdan o'tkazish
    this.fluid.registerChunk(placeholder);

    if (!this._loading.has(key)) {
      this._loading.add(key);
      this._loadChunk(cx, cz, key, placeholder);
    }

    return placeholder;
  }

  async _loadChunk(cx, cz, key, placeholder) {
    this._loading.delete(key);
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BLOCK_AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return this.getChunk(cx, cz).get(lx, wy, lz);
  }

  setBlock(wx, wy, wz, id) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const prevId = this.getChunk(cx, cz).get(lx, wy, lz);
    const key = `${wx},${wy},${wz}`;

    // Suv olib tashlanayotganda fluid simulatorini xabardor qilish
    if (prevId === BLOCK_WATER && id !== BLOCK_WATER) {
      // Manba suvni tashqi setBlock olib tashlay olmaydi
      if (this.fluid._sources && this.fluid._sources.has(key)) return;
      if (this.fluid._levels) {
        this.fluid._levels.delete(key);
        this.fluid._active.delete(key);
      }
    }

    // Yangi suv bloki qo'shilayotganda: FluidSimulator o'zi boshqaradi,
    // shu yerda qo'shimcha ro'yxat kerak emas (ikki marta qo'shilmaslik uchun)

    this.getChunk(cx, cz).set(lx, wy, lz, id);

    const lxEdge = lx === 0 || lx === CHUNK_SIZE - 1;
    const lzEdge = lz === 0 || lz === CHUNK_SIZE - 1;
    if (lxEdge) {
      const nCx = cx + (lx === 0 ? -1 : 1);
      const nc = this.chunks.get(this._chunkKey(nCx, cz));
      if (nc) nc.dirty = true;
    }
    if (lzEdge) {
      const nCz = cz + (lz === 0 ? -1 : 1);
      const nc = this.chunks.get(this._chunkKey(cx, nCz));
      if (nc) nc.dirty = true;
    }
  }

  isSolid(wx, wy, wz) {
    return getBlock(this.getBlock(wx, wy, wz)).solid;
  }

  loadChunksAround(cx, cz) {
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        this.getChunk(cx + dx, cz + dz);
      }
    }
  }

  getSurfaceY(wx, wz) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (this.isSolid(wx, y, wz)) return y + 1;
    }
    return 64;
  }

  /**
   * Game loop dan chaqiriladi — fluid simulyatsiyasini yangilash.
   * dt = delta time (soniya).
   */
  tick(dt) {
    this.fluid.tick(dt);
  }
}
