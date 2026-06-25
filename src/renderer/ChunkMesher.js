import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../world/Chunk.js';
import { getBlock, BLOCK_AIR, BLOCK_WATER } from '../world/Blocks.js';
import { FLUID_MAX } from '../world/FluidSimulator.js';

// Face definitions
const FACES = [
  { dir: [1, 0, 0],  corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], shade: 0.75 },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], shade: 0.70 },
  { dir: [0, 1, 0],  corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], shade: 1.0, face: 'top' },
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], shade: 0.5, face: 'bottom' },
  { dir: [0, 0, 1],  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], shade: 0.85 },
  { dir: [0, 0, -1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], shade: 0.60 },
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return [r, g, b];
}

/**
 * Suv bloki uchun yuqori yuz balandligini level dan hisoblash.
 * level 8 (to'liq) → y offset = 1.0 (to'liq blok)
 * level 1 (soy)    → y offset = 0.125 (1/8 blok)
 * Bu mesh da suv sirti pastroq ko'rinadi — vizual daraja effekti.
 */
function waterTopY(level) {
  // 0.125 (1/8) dan 1.0 gacha — 8 ta daraja
  // Lekin juda ko'zga tashlanmasin deb 0.875 bilan cheklaymiz (level 8 uchun)
  return Math.max(0.125, (level / FLUID_MAX) * 0.94);
}

/**
 * Suv bloki uchun to'rtta yuqori burchak balandligini hisoblash.
 * Qo'shni bloklarning level ini hisobga olib,
 * har bir burchakni o'rtacha daraja bilan belgilaydi.
 * Bu "smooth" suv sirti beradi (Minecraft kabi).
 *
 * corners: [x0z0, x0z1, x1z1, x1z0] — ChunkMesher face +Y corners tartibida
 */
function waterCornerHeights(wx, wy, wz, fluid) {
  // To'rtta burchak uchun qo'shni bloklar:
  // (wx,   wy, wz  ), (wx,   wy, wz+1), (wx+1, wy, wz+1), (wx+1, wy, wz  )
  // Har burchak — 4 ta blok o'rtachasi (diagonal ham)
  const getL = (x, z) => {
    const lv = fluid.getLevel(x, wy, z);
    // Agar bu yerda suv yo'q lekin ustida suv bor — bu "to'lib turgan" blok
    if (lv === 0 && fluid.getLevel(x, wy+1, z) > 0) return FLUID_MAX;
    return lv;
  };

  const l00 = getL(wx,   wz  );
  const l10 = getL(wx+1, wz  );
  const l01 = getL(wx,   wz+1);
  const l11 = getL(wx+1, wz+1);

  // Burchak = 4 ta qo'shni blok o'rtachasi
  // (faqat suvli bloklarni hisobga olish — 0 lar o'rtachani pasaytiradi)
  const avgCorner = (a, b, c, d) => {
    const vals = [a, b, c, d].filter(v => v > 0);
    if (vals.length === 0) return FLUID_MAX;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  // +Y face corners tartibida: [0,1,0],[0,1,1],[1,1,1],[1,1,0]
  //   burchak (wx,   wz  ) → l00, l10-1, l01-1, l00 (markazga eng yaqin)
  // Soddalashtirilgan: har burchak o'zi + 3 qo'shni o'rtachasi
  return [
    waterTopY(avgCorner(l00, l10, l01, getL(wx,   wz  ))),  // (0,0) burchak
    waterTopY(avgCorner(l00, l01, l01, getL(wx,   wz+1))),  // (0,1) burchak
    waterTopY(avgCorner(l10, l11, l01, getL(wx+1, wz+1))),  // (1,1) burchak
    waterTopY(avgCorner(l10, l11, l00, getL(wx+1, wz  ))),  // (1,0) burchak
  ];
}

/**
 * Chunk mesh qurish.
 * fluid parametri — World.fluid (FluidSimulator instance).
 * Returns { opaqueGeom, waterGeom }
 */
export function buildChunkMesh(chunk, world, fluid) {
  const wx0 = chunk.worldX();
  const wz0 = chunk.worldZ();

  const opaquePos = [], opaqueCol = [], opaqueNorm = [];
  const waterPos  = [], waterCol  = [], waterNorm  = [];

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
        const id = chunk.get(lx, ly, lz);
        if (id === BLOCK_AIR) continue;
        const def = getBlock(id);
        const isWater = id === BLOCK_WATER;

        // Suv darajasi — render uchun
        const wx = wx0 + lx;
        const wz = wz0 + lz;
        const fluidLv = isWater && fluid ? (fluid.getLevel(wx, ly, wz) || FLUID_MAX) : FLUID_MAX;

        // Suv ustida ham suv bormi? (to'lib turgan blok)
        const waterAbove = isWater && fluid && (
          world.getBlock(wx, ly+1, wz) === BLOCK_WATER
        );

        for (const face of FACES) {
          const nx = lx + face.dir[0];
          const ny = ly + face.dir[1];
          const nz = lz + face.dir[2];

          const neighborId = (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT && nz >= 0 && nz < CHUNK_SIZE)
            ? chunk.get(nx, ny, nz)
            : world.getBlock(wx0 + nx, ny, wz0 + nz);

          const neighborDef = getBlock(neighborId);

          // Yashirin face larni o'tkazib yuborish
          if (neighborId !== BLOCK_AIR && neighborDef.solid && !neighborDef.transparent && !isWater) continue;
          if (isWater && neighborId === id) continue;

          // Suv uchun: ustida suv bo'lsa yuqori face ni yashirish
          if (isWater && face.face === 'top' && waterAbove) continue;

          const colorHex = face.face === 'top'    ? (def.color.top    || def.color.side)
                         : face.face === 'bottom' ? (def.color.bottom || def.color.side)
                         : def.color.side;
          if (!colorHex) continue;

          const [r, g, b] = hexToRgb(colorHex);
          const shaded = [r * face.shade, g * face.shade, b * face.shade];

          const pos  = isWater ? waterPos  : opaquePos;
          const col  = isWater ? waterCol  : opaqueCol;
          const norm = isWater ? waterNorm : opaqueNorm;

          const baseX = wx;
          const baseY = ly;
          const baseZ = wz;

          // ── Suv yuqori sirti: daraja bo'yicha burchak balandliklari ──────
          if (isWater && face.face === 'top' && fluid) {
            // 4 burchak balandligi (smooth suv sirti)
            const [h00, h01, h11, h10] = waterCornerHeights(wx, ly, wz, fluid);
            // face.corners tartibida: [0,1,0],[0,1,1],[1,1,1],[1,1,0]
            const topCorners = [
              [0, h00, 0],
              [0, h01, 1],
              [1, h11, 1],
              [1, h10, 0],
            ];
            // Ikki uchburchak
            const quad = [topCorners[0], topCorners[1], topCorners[2],
                          topCorners[0], topCorners[2], topCorners[3]];
            for (const c of quad) {
              pos.push(baseX + c[0], baseY + c[1], baseZ + c[2]);
              col.push(shaded[0], shaded[1], shaded[2]);
              norm.push(0, 1, 0);
            }
          } else if (isWater && face.face !== 'top' && face.face !== 'bottom') {
            // Yon face lar: yuqori qismi fluidLv ga qarab qisqartiriladi
            const topH = waterAbove ? 1.0 : waterTopY(fluidLv);
            // face.corners: masalan +X: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]]
            // Y=1 ni topH bilan almashtirish
            const c = face.corners;
            const adjustedCorners = c.map(([cx,cy,cz]) => [cx, cy === 1 ? topH : 0, cz]);
            const quad = [
              adjustedCorners[0], adjustedCorners[1], adjustedCorners[2],
              adjustedCorners[0], adjustedCorners[2], adjustedCorners[3],
            ];
            for (const corner of quad) {
              pos.push(baseX + corner[0], baseY + corner[1], baseZ + corner[2]);
              col.push(shaded[0], shaded[1], shaded[2]);
              norm.push(face.dir[0], face.dir[1], face.dir[2]);
            }
          } else {
            // Oddiy bloklar (va suv tagi)
            const c = face.corners;
            const quad = [c[0], c[1], c[2], c[0], c[2], c[3]];
            for (const corner of quad) {
              pos.push(baseX + corner[0], baseY + corner[1], baseZ + corner[2]);
              col.push(shaded[0], shaded[1], shaded[2]);
              norm.push(face.dir[0], face.dir[1], face.dir[2]);
            }
          }
        }
      }
    }
  }

  const makeGeom = (pos, col, norm) => {
    if (pos.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(norm, 3));
    return geom;
  };

  return {
    opaqueGeom: makeGeom(opaquePos, opaqueCol, opaqueNorm),
    waterGeom:  makeGeom(waterPos,  waterCol,  waterNorm),
  };
}
