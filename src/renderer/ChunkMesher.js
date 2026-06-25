import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
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
// selfId   — hozirgi blok
// neighId  — qo'shni blok
// Returns true → yuzani CHETLAB O'T (cull), false → CHIZ
function shouldCull(selfId, neighId) {
  if (neighId === BLOCK_AIR) return false;          // bo'sh — har doim ko'rsatish

  const selfDef  = getBlock(selfId);
  const neighDef = getBlock(neighId);

  // Qo'shni to'liq qattiq va shaffof emas → yashirin yuz
  if (neighDef.solid && !neighDef.transparent) return true;

  // Xuddi shu shaffof blok turi → ichki yuz yo'q (glass↔glass, leaves↔leaves)
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
  const isSolid = (x, y, z) => {
    const id = getNeighbor(x, y, z);
    if (id === BLOCK_AIR) return false;
    const def = getBlock(id);
    return def.solid && !def.transparent;
  };

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

/**
 * Chunk mesh qurish — NeighborCache + shouldCull + AO quad-flip.
 */
export function buildChunkMesh(chunk, world, fluid, getUV) {
  const wx0 = chunk.worldX();
  const wz0 = chunk.worldZ();

  // ── Neighbor cache: chunk chegarasi uchun bir marta yig'ish ──
  const getNeighbor = buildNeighborCache(chunk, world);

  const opaquePos  = [], opaqueCol  = [], opaqueNorm  = [], opaqueUV  = [];
  const glassPos   = [], glassCol   = [], glassNorm   = [], glassUV   = [];
  const waterPos   = [], waterCol   = [], waterNorm   = [], waterUV   = [];

  const uvFn = getUV || (() => [0, 0, 1, 1]);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
        const id = chunk.get(lx, ly, lz);
        if (id === BLOCK_AIR) continue;
        const def = getBlock(id);
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
          const faceShade = face.shade;
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
    return geom;
  };

  return {
    opaqueGeom: makeGeom(opaquePos, opaqueCol, opaqueNorm, opaqueUV),
    glassGeom:  makeGeom(glassPos,  glassCol,  glassNorm,  glassUV),
    waterGeom:  makeGeom(waterPos,  waterCol,  waterNorm,  waterUV),
  };
}

