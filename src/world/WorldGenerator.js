import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk.js';
import {
  BLOCK_AIR, BLOCK_GRASS, BLOCK_DIRT, BLOCK_STONE,
  BLOCK_BEDROCK, BLOCK_SAND, BLOCK_GRAVEL,
  BLOCK_COAL_ORE, BLOCK_IRON_ORE, BLOCK_GOLD_ORE, BLOCK_DIAMOND_ORE,
  BLOCK_WOOD, BLOCK_LEAVES, BLOCK_WATER, BLOCK_SNOW
} from './Blocks.js';

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
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

const SEA_LEVEL = 62;

export class WorldGenerator {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.noise = new Perlin(seed);
    this.noise2 = new Perlin(seed ^ 0xdeadbeef);
  }

  generateChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const wx0 = cx * CHUNK_SIZE;
    const wz0 = cz * CHUNK_SIZE;

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
            block = BLOCK_STONE;
            block = this._ore(wx, y, wz, block);
          } else if (y < height - 1) {
            block = biome === 'desert' ? BLOCK_SAND : BLOCK_DIRT;
          } else if (y === height - 1) {
            if (biome === 'desert') block = BLOCK_SAND;
            else if (biome === 'snowy') block = BLOCK_SNOW;
            else block = BLOCK_GRASS;
          } else if (y < SEA_LEVEL && height - 1 < SEA_LEVEL) {
            block = BLOCK_WATER;
          }

          chunk.set(lx, y, lz, block);
        }

        // trees
        if (biome === 'forest' && height > SEA_LEVEL && this._hash(wx, 999, wz) < 0.03) {
          this._placeTree(chunk, lx, height, lz);
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
    if (t > 0.3) return 'desert';
    if (t < -0.3) return 'snowy';
    if (t > 0.0) return 'forest';
    return 'plains';
  }

  _ore(wx, y, wz, defaultBlock) {
    const r = this._hash(wx, y, wz);
    if (y < 20 && r < 0.005) return BLOCK_DIAMOND_ORE;
    if (y < 32 && r < 0.01)  return BLOCK_GOLD_ORE;
    if (y < 64 && r < 0.02)  return BLOCK_IRON_ORE;
    if (y < 80 && r < 0.04)  return BLOCK_COAL_ORE;
    return defaultBlock;
  }

  // Deterministic pseudo-random in [0,1) based on world position + seed.
  // Same seed + same coordinates => same result on every client, which is
  // required so the shared world looks identical for all players.
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

  _placeTree(chunk, lx, y, lz) {
    const wx = chunk.worldX() + lx, wz = chunk.worldZ() + lz;
    const h = 4 + Math.floor(this._hash(wx, 500, wz) * 3);
    for (let i = 1; i <= h; i++) chunk.set(lx, y + i, lz, BLOCK_WOOD);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = h - 1; dy <= h + 1; dy++) {
          if (Math.abs(dx) + Math.abs(dz) <= 3)
            chunk.set(lx + dx, y + dy, lz + dz, BLOCK_LEAVES);
        }
      }
    }
    chunk.set(lx, y + h + 1, lz, BLOCK_LEAVES);
  }
}
