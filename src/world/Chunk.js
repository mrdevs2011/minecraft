import { BLOCK_AIR } from './Blocks.js';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.dirty = true;
  }

  _index(x, y, z) {
    return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  }

  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE)
      return BLOCK_AIR;
    return this.data[this._index(x, y, z)];
  }

  set(x, y, z, blockId) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE)
      return;
    this.data[this._index(x, y, z)] = blockId;
    this.dirty = true;
  }

  worldX() { return this.cx * CHUNK_SIZE; }
  worldZ() { return this.cz * CHUNK_SIZE; }
}
