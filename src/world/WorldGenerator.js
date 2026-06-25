import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk.js';
import {
  BLOCK_AIR, BLOCK_GRASS, BLOCK_DIRT, BLOCK_STONE,
  BLOCK_BEDROCK, BLOCK_SAND, BLOCK_GRAVEL,
  BLOCK_COAL_ORE, BLOCK_IRON_ORE, BLOCK_GOLD_ORE, BLOCK_DIAMOND_ORE,
  BLOCK_OAK_LOG, BLOCK_OAK_LEAVES, BLOCK_WATER, BLOCK_SNOW, BLOCK_SNOW_BLOCK
} from './Blocks.js';

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

class Perlin {
  constructor(seed = 42) {
    this.p = new Uint8Array(512);
    const perm = [...Array(256)].map((_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor((seed * (i + 1) * 1664525 + 1013904223) & 0xffffffff) % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const p = this.p;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
           lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w
    );
  }
  octave(x, z, octs, persistence) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octs; i++) {
      val += this.noise(x * freq, 0, z * freq) * amp;
      max += amp; amp *= persistence; freq *= 2;
    }
    return val / max;
  }
}

const SEA_LEVEL = 63;

export class WorldGenerator {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.noise = new Perlin(seed);
    this.noise2 = new Perlin(seed ^ 0xdeadbeef);
    this.noise3 = new Perlin(seed ^ 0x12345678);
  }

  generateChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const height = this._surfaceHeight(wx, wz);
        const biome = this._biome(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let block = BLOCK_AIR;
          if (y === 0) {
            block = BLOCK_BEDROCK;
          } else if (y < height - 4) {
            block = this._ore(wx, y, wz);
          } else if (y < height - 1) {
            block = (biome === 'desert') ? BLOCK_SAND : BLOCK_DIRT;
          } else if (y === height - 1) {
            if (biome === 'desert') block = BLOCK_SAND;
            else if (biome === 'snowy' || biome === 'snowy_taiga') block = BLOCK_SNOW;
            else block = BLOCK_GRASS;
          } else if (y < SEA_LEVEL && height - 1 < SEA_LEVEL) {
            block = BLOCK_WATER;
          }
          chunk.set(lx, y, lz, block);
        }

        const treeChance = this._hash(wx, 999, wz);
        if (height > SEA_LEVEL && height < 90) {
          if (biome === 'forest' && treeChance < 0.04) {
            this._placeTree(chunk, lx, height, lz, 'oak');
          } else if (biome === 'taiga' && treeChance < 0.05) {
            this._placeTree(chunk, lx, height, lz, 'spruce');
          } else if (biome === 'jungle' && treeChance < 0.06) {
            this._placeTree(chunk, lx, height, lz, 'jungle');
          } else if (biome === 'birch_forest' && treeChance < 0.04) {
            this._placeTree(chunk, lx, height, lz, 'birch');
          } else if (biome === 'dark_forest' && treeChance < 0.07) {
            this._placeTree(chunk, lx, height, lz, 'dark_oak');
          }
        }
      }
    }
    return chunk;
  }

  _surfaceHeight(wx, wz) {
    const scale = 0.004;
    const n = this.noise.octave(wx * scale, wz * scale, 6, 0.5);
    return Math.floor(SEA_LEVEL + n * 40);
  }

  _biome(wx, wz) {
    const t = this.noise2.noise(wx * 0.002, 0, wz * 0.002);
    const h = this.noise3.noise(wx * 0.0015, 0, wz * 0.0015);
    if (t < -0.4) return 'snowy';
    if (t < -0.2 && h > 0.1) return 'snowy_taiga';
    if (t < -0.1) return 'taiga';
    if (t > 0.4) return 'desert';
    if (t > 0.2 && h < -0.1) return 'savanna';
    if (t > 0.15 && h > 0.15) return 'jungle';
    if (t > 0.1 && h < -0.2) return 'birch_forest';
    if (t > 0.05 && h < -0.3) return 'dark_forest';
    if (t > 0.0 && h < -0.15) return 'forest';
    return 'plains';
  }

  _ore(wx, y, wz) {
    const r = this._hash(wx, y, wz);
    if (y < -63) return BLOCK_STONE;
    if (y < -54 && r < 0.005) return BLOCK_DIAMOND_ORE;
    if (y < -16 && r < 0.01)  return BLOCK_GOLD_ORE;
    if (y < 16 && r < 0.02)   return BLOCK_IRON_ORE;
    if (y < 48 && r < 0.04)   return BLOCK_COAL_ORE;
    if (y < 64 && r < 0.03)   return BLOCK_IRON_ORE;
    return BLOCK_STONE;
  }

  _hash(x, y, z) {
    let h = this.seed | 0;
    h = Math.imul(h ^ x, 374761393);
    h = Math.imul(h ^ y, 668265263);
    h = Math.imul(h ^ z, 2246822519);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 3266489917);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }

  _placeTree(chunk, lx, y, lz, type) {
    let height, wood, leaves;
    switch (type) {
      case 'spruce':   height = 5 + Math.floor(this._hash(lx, 300, lz) * 4); wood = BLOCK_OAK_LOG; leaves = BLOCK_OAK_LEAVES; break;
      case 'jungle':   height = 7 + Math.floor(this._hash(lx, 301, lz) * 6); wood = BLOCK_OAK_LOG; leaves = BLOCK_OAK_LEAVES; break;
      case 'birch':    height = 5 + Math.floor(this._hash(lx, 302, lz) * 2); wood = BLOCK_OAK_LOG; leaves = BLOCK_OAK_LEAVES; break;
      case 'dark_oak': height = 6 + Math.floor(this._hash(lx, 303, lz) * 3); wood = BLOCK_OAK_LOG; leaves = BLOCK_OAK_LEAVES; break;
      default:         height = 4 + Math.floor(this._hash(lx, 304, lz) * 3); wood = BLOCK_OAK_LOG; leaves = BLOCK_OAK_LEAVES; break;
    }
    for (let i = 1; i <= height; i++) {
      chunk.set(lx, y + i, lz, wood);
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = height - 2; dy <= height + 1; dy++) {
          if (Math.abs(dx) + Math.abs(dz) <= 3 && (dx !== 0 || dz !== 0 || dy < height)) {
            chunk.set(lx + dx, y + dy, lz + dz, leaves);
          }
        }
      }
    }
  }
}