import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import * as B from '../world/Blocks.js';

/**
 * 16x16 pixel-art teksturalar atlasi.
 * Minecraft uslubidagi "block-texture" ko'rinishini procedural ravishda
 * (canvas orqali) generatsiya qiladi — har bir blok turi uchun alohida
 * 16x16 plitka, keyin bularning hammasi bitta atlas-textura ichiga
 * joylashtiriladi va UV orqali ChunkMesher tomonidan ishlatiladi.
 */

export const TILE = 16;

// ── Kichik deterministik PRNG (mulberry32) — har doim bir xil natija ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function clamp255(v) { return Math.max(0, Math.min(255, v)); }
function rgbToHex(r, g, b) {
  const c = v => clamp255(Math.round(v)).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function adjust(hex, delta) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + delta, g + delta, b + delta);
}
function mix(hexA, hexB, t) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// ── Plitka chizish uslublari (har biri 16x16 ImageData to'ldiradi) ──

function paintSpeckle(ctx, base, variance, seed) {
  const rnd = mulberry32(seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (rnd() - 0.5) * 2 * variance;
      ctx.fillStyle = adjust(base, n);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintGrassTop(ctx, base, seed) {
  paintSpeckle(ctx, base, 16, seed);
  const rnd = mulberry32(seed + 99);
  // bir nechta to'qroq "o't" dog'lari
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
    ctx.fillStyle = adjust(base, -28 - rnd() * 20);
    ctx.fillRect(x, y, 1, 1);
  }
}

function paintGrassSide(ctx, dirt, grass, seed) {
  paintSpeckle(ctx, dirt, 14, seed);
  const rnd = mulberry32(seed + 7);
  // yuqori 3 qator — o't, pastga tushgan tishli chegara bilan
  for (let x = 0; x < TILE; x++) {
    const edge = 2 + Math.floor(rnd() * 2); // 2-3 px
    for (let y = 0; y < edge; y++) {
      ctx.fillStyle = adjust(grass, (rnd() - 0.5) * 24);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintLeaves(ctx, base, seed) {
  paintSpeckle(ctx, base, 26, seed);
  const rnd = mulberry32(seed + 13);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
    ctx.fillStyle = adjust(base, rnd() > 0.5 ? -34 : 22);
    ctx.fillRect(x, y, 1, 1);
  }
}

function paintLogTop(ctx, base, seed) {
  const cx = TILE / 2, cy = TILE / 2;
  const rnd = mulberry32(seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const ring = Math.sin(d * 1.6) * 14;
      ctx.fillStyle = adjust(base, ring + (rnd() - 0.5) * 6);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintLogSide(ctx, bark, seed) {
  const rnd = mulberry32(seed);
  for (let x = 0; x < TILE; x++) {
    const streak = (Math.sin(x * 1.3 + seed) * 10) - (x % 4 === 0 ? 10 : 0);
    for (let y = 0; y < TILE; y++) {
      ctx.fillStyle = adjust(bark, streak + (rnd() - 0.5) * 8);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintPlanks(ctx, base, seed) {
  const rnd = mulberry32(seed);
  for (let y = 0; y < TILE; y++) {
    const row = Math.floor(y / 4);
    const rowShade = (row % 2 === 0) ? 6 : -6;
    const seam = (y % 4 === 0) ? -26 : 0;
    for (let x = 0; x < TILE; x++) {
      const plankSeam = ((x + row * 5) % 8 === 0) ? -18 : 0;
      ctx.fillStyle = adjust(base, rowShade + seam + plankSeam + (rnd() - 0.5) * 6);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintCobble(ctx, base, seed) {
  paintSpeckle(ctx, base, 10, seed);
  const rnd = mulberry32(seed + 21);
  // bir nechta noaniq "tosh" chegaralari (mortar chiziqlari)
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
    const w = 3 + Math.floor(rnd() * 4), h = 3 + Math.floor(rnd() * 4);
    ctx.strokeStyle = adjust(base, -40);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}

function paintOre(ctx, stone, accent, seed, blobs = 6) {
  paintSpeckle(ctx, stone, 10, seed);
  const rnd = mulberry32(seed + 33);
  for (let i = 0; i < blobs; i++) {
    const x = Math.floor(rnd() * (TILE - 2)), y = Math.floor(rnd() * (TILE - 2));
    const w = 1 + Math.floor(rnd() * 2), h = 1 + Math.floor(rnd() * 2);
    ctx.fillStyle = adjust(accent, (rnd() - 0.5) * 20);
    ctx.fillRect(x, y, w, h);
  }
}

function paintGlass(ctx, base, seed) {
  paintSpeckle(ctx, base, 6, seed);
  ctx.strokeStyle = adjust(base, -50);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
  ctx.strokeStyle = mix(base, '#ffffff', 0.5);
  ctx.beginPath();
  ctx.moveTo(2, 2); ctx.lineTo(7, 7);
  ctx.moveTo(9, 3); ctx.lineTo(13, 7);
  ctx.stroke();
}

function paintLava(ctx, base, seed) {
  paintSpeckle(ctx, base, 18, seed);
  const rnd = mulberry32(seed + 51);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
    ctx.fillStyle = adjust('#ffcf4d', (rnd() - 0.5) * 30);
    ctx.fillRect(x, y, 1 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 2));
  }
}

function paintWater(ctx, base, seed) {
  paintSpeckle(ctx, base, 12, seed);
}

// ── Har bir blok uchun qaysi uslub/rang qo'llanishini belgilash ──
function tileSpecFor(id) {
  const def = B.getBlock(id);
  const top = def.color.top || def.color.side || '#888888';
  const side = def.color.side || top;
  const bottom = def.color.bottom || side;

  switch (id) {
    case B.BLOCK_GRASS:
      return {
        top:    { paint: paintGrassTop,  args: [top] },
        side:   { paint: paintGrassSide, args: [side, top] },
        bottom: { paint: paintSpeckle,   args: [bottom, 14] },
      };
    case B.BLOCK_WOOD:
      return {
        top:    { paint: paintLogTop,  args: [top] },
        side:   { paint: paintLogSide, args: [side] },
        bottom: { paint: paintLogTop,  args: [bottom] },
      };
    case B.BLOCK_PLANKS:
      return { all: { paint: paintPlanks, args: [side] } };
    case B.BLOCK_LEAVES:
      return { all: { paint: paintLeaves, args: [side] } };
    case B.BLOCK_COBBLESTONE:
      return { all: { paint: paintCobble, args: [side] } };
    case B.BLOCK_COAL_ORE:
      return { all: { paint: paintOre, args: ['#8c8c8c', '#1c1c1c', 5] } };
    case B.BLOCK_IRON_ORE:
      return { all: { paint: paintOre, args: ['#8c8c8c', '#cda06a', 5] } };
    case B.BLOCK_GOLD_ORE:
      return { all: { paint: paintOre, args: ['#8c8c8c', '#f1c40f', 6] } };
    case B.BLOCK_DIAMOND_ORE:
      return { all: { paint: paintOre, args: ['#8c8c8c', '#73e6e6', 5] } };
    case B.BLOCK_GLASS:
      return { all: { paint: paintGlass, args: [side] } };
    case B.BLOCK_LAVA:
      return { all: { paint: paintLava, args: [side] } };
    case B.BLOCK_WATER:
      return { all: { paint: paintWater, args: [side] } };
    case B.BLOCK_SNOW:
      return { all: { paint: paintSpeckle, args: [top, 8] } };
    case B.BLOCK_GRAVEL:
    case B.BLOCK_BEDROCK:
    case B.BLOCK_STONE:
    case B.BLOCK_SAND:
    case B.BLOCK_DIRT:
    default:
      return { all: { paint: paintSpeckle, args: [side, id === B.BLOCK_BEDROCK ? 22 : 14] } };
  }
}

/**
 * Butun blok ro'yxati uchun atlas yaratadi.
 * Returns { texture: THREE.CanvasTexture, getUV(blockId, faceName) => [u0,v0,u1,v1] }
 */
export function buildTextureAtlas() {
  const allIds = Object.keys(B.Blocks).map(Number).filter(id => id !== B.BLOCK_AIR);

  // Har bir blok uchun qaysi yuzlar (top/side/bottom) qaysi "tile key" ga ega
  // ekanini aniqlaymiz — bir xil chizilgan plitkalarni qayta ishlatamiz.
  const faceAssign = new Map(); // `${id}:${face}` -> tileKey
  const tileJobs = [];          // tileKey -> {paint, args, seed}
  let nextKey = 0;

  for (const id of allIds) {
    const spec = tileSpecFor(id);
    const faces = ['top', 'side', 'bottom'];
    for (const f of faces) {
      const job = spec.all || spec[f];
      if (!job) continue;
      const key = nextKey++;
      tileJobs.push({ ...job, seed: id * 17 + f.length * 3 + key });
      faceAssign.set(`${id}:${f}`, key);
    }
  }

  const cols = Math.ceil(Math.sqrt(tileJobs.length));
  const rows = Math.ceil(tileJobs.length / cols);

  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d');

  tileJobs.forEach((job, i) => {
    const cx = (i % cols) * TILE;
    const cy = Math.floor(i / cols) * TILE;
    ctx.save();
    ctx.translate(cx, cy);
    job.paint(ctx, ...job.args, job.seed);
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  // ── Pixel-art uchun MAJBURIY: Nearest Neighbor filtrlash ──
  // Uzoqlashganda ham teksturalar loyqalanib ketmaydi (bilinear blur yo'q).
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  function getUV(blockId, faceName) {
    const key = faceAssign.get(`${blockId}:${faceName}`) ?? faceAssign.get(`${blockId}:top`);
    if (key === undefined) return [0, 0, 1, 1];
    const cx = (key % cols) * TILE;
    const cy = Math.floor(key / cols) * TILE;
    const u0 = cx / canvas.width,        v0 = cy / canvas.height;
    const u1 = (cx + TILE) / canvas.width, v1 = (cy + TILE) / canvas.height;
    return [u0, v0, u1, v1];
  }

  return { texture, getUV };
}
