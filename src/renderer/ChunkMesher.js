import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../world/Chunk.js';
import { getBlock, BLOCK_AIR, BLOCK_WATER, BLOCK_GLASS, BLOCK_LEAVES } from '../world/Blocks.js';
import { FLUID_MAX } from '../world/FluidSimulator.js';

// Face definitions — dir, corners, face name, shade multiplier
const FACES = [
  { dir: [1, 0, 0],  corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], shade: 0.75, face: 'side' },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], shade: 0.70, face: 'side' },
  { dir: [0, 1, 0],  corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], shade: 1.0,  face: 'top' },
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], shade: 0.5,  face: 'bottom' },
  { dir: [0, 0, 1],  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], shade: 0.85, face: 'side' },
  { dir: [0, 0, -1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], shade: 0.60, face: 'side' },
];

// ── Block definition cache: getBlock() ni har safar chaqirmaslik ──────────
// Blok ID lari 0..255, oldindan yuklash tezlikni oshiradi.
const _blockDefCache = new Array(256).fill(null);
function getBlockDef(id) {
  if (_blockDefCache[id] === null) _blockDefCache[id] = getBlock(id);
  return _blockDefCache[id];
}

// ── Solid mask: to'liq qattiq, shaffof EMAS bloklarni fast-path tekshiruvi ─
// Boolean massiv — shouldCull ichidagi getBlock() chaqiruvini yo'q qiladi.
const _isSolidOpaque = new Uint8Array(256);
(function buildSolidMask() {
  for (let i = 0; i < 256; i++) {
    const d = getBlock(i);
    _isSolidOpaque[i] = (d.solid && !d.transparent) ? 1 : 0;
  }
})();

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return [r, g, b];
}

function waterTopY(level) {
  return Math.max(0.125, (level / FLUID_MAX) * 0.94);
}

function waterCornerHeights(wx, wy, wz, fluid) {
  const getL = (x, z) => {
    const lv = fluid.getLevel(x, wy, z);
    if (lv === 0 && fluid.getLevel(x, wy+1, z) > 0) return FLUID_MAX;
    return lv;
  };
  const l00 = getL(wx,   wz  );
  const l10 = getL(wx+1, wz  );
  const l01 = getL(wx,   wz+1);
  const avgCorner = (a, b, c, d) => {
    const vals = [a, b, c, d].filter(v => v > 0);
    return vals.length === 0 ? FLUID_MAX : vals.reduce((s,v)=>s+v,0)/vals.length;
  };
  return [
    waterTopY(avgCorner(l00, l10, l01, getL(wx,   wz  ))),
    waterTopY(avgCorner(l00, l01, l01, getL(wx,   wz+1))),
    waterTopY(avgCorner(l10, getL(wx+1,wz+1), l01, getL(wx+1, wz+1))),
    waterTopY(avgCorner(l10, getL(wx+1,wz+1), l00, getL(wx+1, wz  ))),
  ];
}

// ── Face Culling: bu yuzani chizish kerakmi? ──────────────────────────────
// Optimizatsiya: _isSolidOpaque bitmask bilan birinchi fast-path tekshiruv.
// getBlock() faqat shaffof bloklar uchun chaqiriladi.
// selfId   — hozirgi blok
// neighId  — qo'shni blok
// Returns true → yuzani CHETLAB O'T (cull), false → CHIZ
function shouldCull(selfId, neighId) {
  if (neighId === BLOCK_AIR) return false;          // bo'sh — har doim ko'rsatish

  // Fast-path: qo'shni to'liq qattiq, shaffof emas — bitmask bilan
  if (_isSolidOpaque[neighId]) return true;

  // Xuddi shu blok turi (shaffof bloklar ichki yuzasiz: glass↔glass, leaves↔leaves)
  if (selfId === neighId) return true;

  // Suv o'z ichida cull
  if (selfId === BLOCK_WATER && neighId === BLOCK_WATER) return true;

  // Shaffof blok boshqa shaffof blokka qaragan — ko'rsatish
  return false;
}

// ── Ambient Occlusion ──────────────────────────────────────────────────────
function calcAO(side1, side2, corner) {
  if (side1 && side2) return 0.0;
  return 1.0 - ([side1, side2, corner].filter(Boolean).length) * 0.25;
}

function faceAO(wx, wy, wz, faceIdx, getNeighbor) {
  // isSolid: _isSolidOpaque bitmask bilan — getBlock() chaqirilmaydi
  const isSolid = (x, y, z) => _isSolidOpaque[getNeighbor(x, y, z)] === 1;

  let aoValues = [1, 1, 1, 1];
  switch (faceIdx) {
    case 2: {
      const y = wy + 1;
      aoValues[0] = calcAO(isSolid(wx-1,y,wz),   isSolid(wx,y,wz-1),   isSolid(wx-1,y,wz-1));
      aoValues[1] = calcAO(isSolid(wx-1,y,wz),   isSolid(wx,y,wz+1),   isSolid(wx-1,y,wz+1));
      aoValues[2] = calcAO(isSolid(wx+1,y,wz),   isSolid(wx,y,wz+1),   isSolid(wx+1,y,wz+1));
      aoValues[3] = calcAO(isSolid(wx+1,y,wz),   isSolid(wx,y,wz-1),   isSolid(wx+1,y,wz-1));
      break;
    }
    case 3: {
      const y = wy - 1;
      aoValues[0] = calcAO(isSolid(wx-1,y,wz),   isSolid(wx,y,wz+1),   isSolid(wx-1,y,wz+1));
      aoValues[1] = calcAO(isSolid(wx-1,y,wz),   isSolid(wx,y,wz-1),   isSolid(wx-1,y,wz-1));
      aoValues[2] = calcAO(isSolid(wx+1,y,wz),   isSolid(wx,y,wz-1),   isSolid(wx+1,y,wz-1));
      aoValues[3] = calcAO(isSolid(wx+1,y,wz),   isSolid(wx,y,wz+1),   isSolid(wx+1,y,wz+1));
      break;
    }
    case 0: {
      const x = wx + 1;
      aoValues[0] = calcAO(isSolid(x,wy-1,wz),   isSolid(x,wy,wz-1),   isSolid(x,wy-1,wz-1));
      aoValues[1] = calcAO(isSolid(x,wy+1,wz),   isSolid(x,wy,wz-1),   isSolid(x,wy+1,wz-1));
      aoValues[2] = calcAO(isSolid(x,wy+1,wz),   isSolid(x,wy,wz+1),   isSolid(x,wy+1,wz+1));
      aoValues[3] = calcAO(isSolid(x,wy-1,wz),   isSolid(x,wy,wz+1),   isSolid(x,wy-1,wz+1));
      break;
    }
    case 1: {
      const x = wx - 1;
      aoValues[0] = calcAO(isSolid(x,wy-1,wz),   isSolid(x,wy,wz+1),   isSolid(x,wy-1,wz+1));
      aoValues[1] = calcAO(isSolid(x,wy+1,wz),   isSolid(x,wy,wz+1),   isSolid(x,wy+1,wz+1));
      aoValues[2] = calcAO(isSolid(x,wy+1,wz),   isSolid(x,wy,wz-1),   isSolid(x,wy+1,wz-1));
      aoValues[3] = calcAO(isSolid(x,wy-1,wz),   isSolid(x,wy,wz-1),   isSolid(x,wy-1,wz-1));
      break;
    }
    case 4: {
      const z = wz + 1;
      aoValues[0] = calcAO(isSolid(wx-1,wy,z),   isSolid(wx,wy-1,z),   isSolid(wx-1,wy-1,z));
      aoValues[1] = calcAO(isSolid(wx+1,wy,z),   isSolid(wx,wy-1,z),   isSolid(wx+1,wy-1,z));
      aoValues[2] = calcAO(isSolid(wx+1,wy,z),   isSolid(wx,wy+1,z),   isSolid(wx+1,wy+1,z));
      aoValues[3] = calcAO(isSolid(wx-1,wy,z),   isSolid(wx,wy+1,z),   isSolid(wx-1,wy+1,z));
      break;
    }
    case 5: {
      const z = wz - 1;
      aoValues[0] = calcAO(isSolid(wx+1,wy,z),   isSolid(wx,wy-1,z),   isSolid(wx+1,wy-1,z));
      aoValues[1] = calcAO(isSolid(wx-1,wy,z),   isSolid(wx,wy-1,z),   isSolid(wx-1,wy-1,z));
      aoValues[2] = calcAO(isSolid(wx-1,wy,z),   isSolid(wx,wy+1,z),   isSolid(wx-1,wy+1,z));
      aoValues[3] = calcAO(isSolid(wx+1,wy,z),   isSolid(wx,wy+1,z),   isSolid(wx+1,wy+1,z));
      break;
    }
  }
  return aoValues;
}

// ── Neighbor Cache: chunk atrofidagi bloklarni oldindan yig'ish ────────────
// Chunk chegarasida har frame world.getBlock() ni ko'p marta chaqirishdan qochish.
// Padding=1: chunk atrofida 1 qator/ustun qo'shimcha saqlanadi.
function buildNeighborCache(chunk, world) {
  const P = 1; // padding
  const SX = CHUNK_SIZE + P * 2;
  const SY = CHUNK_HEIGHT + P * 2;
  const SZ = CHUNK_SIZE + P * 2;
  const cache = new Int32Array(SX * SY * SZ); // 0 = AIR default

  const wx0 = chunk.worldX();
  const wz0 = chunk.worldZ();

  for (let lx = -P; lx < CHUNK_SIZE + P; lx++) {
    for (let lz = -P; lz < CHUNK_SIZE + P; lz++) {
      for (let ly = -P; ly < CHUNK_HEIGHT + P; ly++) {
        let id;
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE &&
            ly >= 0 && ly < CHUNK_HEIGHT) {
          id = chunk.get(lx, ly, lz);
        } else {
          id = world.getBlock(wx0 + lx, ly, wz0 + lz);
        }
        const i = (lx + P) * SY * SZ + (ly + P) * SZ + (lz + P);
        cache[i] = id;
      }
    }
  }

  // Tez o'qish funksiyasi — world koordinatalarda
  return function getNeighbor(wx, wy, wz) {
    const lx = wx - wx0 + P;
    const ly = wy + P;
    const lz = wz - wz0 + P;
    if (lx < 0 || lx >= SX || ly < 0 || ly >= SY || lz < 0 || lz >= SZ) return BLOCK_AIR;
    return cache[lx * SY * SZ + ly * SZ + lz];
  };
}

// ── heightMap: har ustun uchun eng yuqori qattiq blok balandligi ──────────
// Ushbu ma'lumot Frustum Culling uchun chunk AABB ni aniqroq hisoblashga yordam beradi.
function buildHeightMap(chunk) {
  const heights = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      let maxY = 0;
      for (let ly = CHUNK_HEIGHT - 1; ly >= 0; ly--) {
        if (chunk.get(lx, ly, lz) !== BLOCK_AIR) { maxY = ly + 1; break; }
      }
      heights[lx * CHUNK_SIZE + lz] = maxY;
    }
  }
  return heights;
}

/**
 * Chunk mesh qurish — NeighborCache + shouldCull + AO quad-flip.
 * Qaytaradi: { opaqueGeom, glassGeom, waterGeom, boundingBox }
 *   boundingBox — THREE.Box3, Frustum Culling uchun ishlatiladi.
 */
export function buildChunkMesh(chunk, world, fluid, getUV) {
  const wx0 = chunk.worldX();
  const wz0 = chunk.worldZ();

  // ── Neighbor cache: chunk chegarasi uchun bir marta yig'ish ──
  const getNeighbor = buildNeighborCache(chunk, world);

  // ── Height map: AABB uchun maksimal Y ni aniqlash ──
  const heightMap = buildHeightMap(chunk);
  let maxFilledY = 0;
  for (let i = 0; i < heightMap.length; i++) {
    if (heightMap[i] > maxFilledY) maxFilledY = heightMap[i];
  }

  const opaquePos  = [], opaqueCol  = [], opaqueNorm  = [], opaqueUV  = [];
  const glassPos   = [], glassCol   = [], glassNorm   = [], glassUV   = [];
  const waterPos   = [], waterCol   = [], waterNorm   = [], waterUV   = [];

  const uvFn = getUV || (() => [0, 0, 1, 1]);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      // ── Ustun Culling: bu ustunda biron blok bormi? ──
      // Agar heightMap[lx, lz] = 0 bo'lsa, bu ustun bo'sh — o'tkazib yuborish.
      const colMaxY = heightMap[lx * CHUNK_SIZE + lz];
      if (colMaxY === 0) continue;

      for (let ly = 0; ly < colMaxY; ly++) {
        const id = chunk.get(lx, ly, lz);
        if (id === BLOCK_AIR) continue;
        const def = getBlockDef(id);  // cache orqali — getBlock() qayta chaqirilmaydi
        const isWater = id === BLOCK_WATER;
        const isGlass = id === BLOCK_GLASS;

        const wx = wx0 + lx;
        const wz = wz0 + lz;
        const fluidLv = isWater && fluid ? (fluid.getLevel(wx, ly, wz) || FLUID_MAX) : FLUID_MAX;
        const waterAbove = isWater && fluid && getNeighbor(wx, ly+1, wz) === BLOCK_WATER;

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nwx = wx + face.dir[0];
          const nwy = ly + face.dir[1];
          const nwz = wz + face.dir[2];
          const neighborId = getNeighbor(nwx, nwy, nwz);

          // ── Face Culling ──
          if (isWater) {
            if (neighborId === BLOCK_WATER) continue;
            if (face.face === 'top' && waterAbove) continue;
          } else {
            if (shouldCull(id, neighborId)) continue;
          }

          const colorHex = face.face === 'top'    ? (def.color.top    || def.color.side)
                         : face.face === 'bottom' ? (def.color.bottom || def.color.side)
                         : def.color.side;
          if (!colorHex) continue;

          const [r, g, b] = hexToRgb(colorHex);

          // ── Qo'shni blok bo'lsa 10% to'qroq qil ──────────────────────────
          // neighborId bu yuzaning to'g'ridan-to'g'ri qo'shnisi (FACES[fi].dir yo'nalishida).
          // Agar u AIR bo'lmasa (ya'ni yonida biron blok bor), shade ni kamaytirish.
          // Eslatma: shouldCull() allaqachon to'liq qattiq qo'shnilarni yashiradi —
          // bu shart faqat shaffof qo'shnilar (glass, leaves, water) uchun ishlaydi.
          const neighborDim = (neighborId !== BLOCK_AIR) ? 0.9 : 1.0;

          const faceShade = face.shade * neighborDim;
          const aoVals = faceAO(wx, ly, wz, fi, getNeighbor);
          const [u0, v0, u1, v1] = uvFn(id, face.face);

          const pos  = isWater ? waterPos  : (isGlass ? glassPos  : opaquePos);
          const col  = isWater ? waterCol  : (isGlass ? glassCol  : opaqueCol);
          const norm = isWater ? waterNorm : (isGlass ? glassNorm : opaqueNorm);
          const uv   = isWater ? waterUV   : (isGlass ? glassUV   : opaqueUV);

          const baseX = wx, baseY = ly, baseZ = wz;

          if (isWater && face.face === 'top' && fluid) {
            const [h00, h01, h11, h10] = waterCornerHeights(wx, ly, wz, fluid);
            const topCorners = [[0,h00,0],[0,h01,1],[1,h11,1],[1,h10,0]];
            const quad    = [topCorners[0],topCorners[1],topCorners[2],topCorners[0],topCorners[2],topCorners[3]];
            const aoQuad  = [aoVals[0],aoVals[1],aoVals[2],aoVals[0],aoVals[2],aoVals[3]];
            const uvQuad  = [[u0,v1],[u0,v0],[u1,v0],[u0,v1],[u1,v0],[u1,v1]];
            for (let qi = 0; qi < 6; qi++) {
              const c = quad[qi], ao = aoQuad[qi], s = faceShade * ao;
              pos.push(baseX+c[0], baseY+c[1], baseZ+c[2]);
              col.push(r*s, g*s, b*s);
              norm.push(0, 1, 0);
              uv.push(uvQuad[qi][0], uvQuad[qi][1]);
            }
          } else if (isWater && face.face !== 'top' && face.face !== 'bottom') {
            const topH = waterAbove ? 1.0 : waterTopY(fluidLv);
            const adjC = face.corners.map(([cx,cy,cz]) => [cx, cy===1?topH:0, cz]);
            const quad   = [adjC[0],adjC[1],adjC[2],adjC[0],adjC[2],adjC[3]];
            const aoQuad = [aoVals[0],aoVals[1],aoVals[2],aoVals[0],aoVals[2],aoVals[3]];
            const uvQuad = [[u0,v1],[u0,v0],[u1,v0],[u0,v1],[u1,v0],[u1,v1]];
            for (let qi = 0; qi < 6; qi++) {
              const c = quad[qi], ao = aoQuad[qi], s = faceShade * ao;
              pos.push(baseX+c[0], baseY+c[1], baseZ+c[2]);
              col.push(r*s, g*s, b*s);
              norm.push(face.dir[0], face.dir[1], face.dir[2]);
              uv.push(uvQuad[qi][0], uvQuad[qi][1]);
            }
          } else {
            // ── AO quad-flip ──
            const flip = (aoVals[0]+aoVals[2]) < (aoVals[1]+aoVals[3]);
            const quadIdx  = flip ? [1,2,3,1,3,0] : [0,1,2,0,2,3];
            const aoQuad   = flip
              ? [aoVals[1],aoVals[2],aoVals[3],aoVals[1],aoVals[3],aoVals[0]]
              : [aoVals[0],aoVals[1],aoVals[2],aoVals[0],aoVals[2],aoVals[3]];
            const uvCorners = [[u0,v1],[u0,v0],[u1,v0],[u1,v1]];
            for (let qi = 0; qi < 6; qi++) {
              const ci = quadIdx[qi], c = face.corners[ci];
              const s = faceShade * aoQuad[qi];
              pos.push(baseX+c[0], baseY+c[1], baseZ+c[2]);
              col.push(r*s, g*s, b*s);
              norm.push(face.dir[0], face.dir[1], face.dir[2]);
              uv.push(uvCorners[ci][0], uvCorners[ci][1]);
            }
          }
        }
      }
    }
  }

  const makeGeom = (pos, col, norm, uvArr) => {
    if (pos.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(norm, 3));
    geom.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr, 2));
    geom.computeBoundingBox();
    return geom;
  };

  // ── Chunk AABB: Frustum Culling uchun bounding box ──
  // World koordinatalarida: chunk yer ustidan maxFilledY gacha.
  const boundingBox = new THREE.Box3(
    new THREE.Vector3(wx0,            0,            wz0),
    new THREE.Vector3(wx0 + CHUNK_SIZE, maxFilledY, wz0 + CHUNK_SIZE)
  );

  return {
    opaqueGeom: makeGeom(opaquePos, opaqueCol, opaqueNorm, opaqueUV),
    glassGeom:  makeGeom(glassPos,  glassCol,  glassNorm,  glassUV),
    waterGeom:  makeGeom(waterPos,  waterCol,  waterNorm,  waterUV),
    boundingBox,
  };
}