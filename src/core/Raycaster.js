export class Raycaster {
  constructor(world) {
    this.world = world;
    this.maxDistance = 5;
  }

  /** Helper: forward direction for a given yaw/pitch (desktop crosshair aim). */
  static directionFromYawPitch(yaw, pitch) {
    return {
      dx: -Math.sin(yaw) * Math.cos(pitch),
      dy: Math.sin(pitch),
      dz: -Math.cos(yaw) * Math.cos(pitch),
    };
  }

  /**
   * Casts a ray from (ox,oy,oz) along normalized direction (dx,dy,dz).
   * Direction can come from yaw/pitch (desktop, center-screen aim) or from
   * an arbitrary screen tap point unprojected through the camera (mobile).
   */
  cast(ox, oy, oz, dx, dy, dz) {
    let x = ox, y = oy, z = oz;
    let px = Math.floor(x), py = Math.floor(y), pz = Math.floor(z);

    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / dx);
    const tDeltaY = Math.abs(1 / dy);
    const tDeltaZ = Math.abs(1 / dz);

    let tMaxX = (dx > 0 ? (px + 1 - x) : (x - px)) * tDeltaX;
    let tMaxY = (dy > 0 ? (py + 1 - y) : (y - py)) * tDeltaY;
    let tMaxZ = (dz > 0 ? (pz + 1 - z) : (z - pz)) * tDeltaZ;

    let lastX = px, lastY = py, lastZ = pz;
    let face = null;

    for (let i = 0; i < 64; i++) {
      const block = this.world.getBlock(px, py, pz);
      if (block !== 0) {
        return {
          hit: true,
          blockX: px, blockY: py, blockZ: pz,
          placeX: lastX, placeY: lastY, placeZ: lastZ,
          block,
          face,
          distance: Math.sqrt((px - ox) ** 2 + (py - oy) ** 2 + (pz - oz) ** 2)
        };
      }
      if (Math.sqrt((px - ox) ** 2 + (py - oy) ** 2 + (pz - oz) ** 2) > this.maxDistance) break;

      lastX = px; lastY = py; lastZ = pz;
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        px += stepX; tMaxX += tDeltaX; face = stepX > 0 ? '-x' : '+x';
      } else if (tMaxY < tMaxZ) {
        py += stepY; tMaxY += tDeltaY; face = stepY > 0 ? '-y' : '+y';
      } else {
        pz += stepZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? '-z' : '+z';
      }
    }
    return { hit: false };
  }
}
