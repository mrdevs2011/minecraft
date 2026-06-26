// avatars/index.js — Barcha avatarlar ProceduralAvatar orqali quriladi.
// Serverdan hech qanday .glb fayl yuklanmaydi — faqat THREE.js geometriya.
//
// avatarId lar:
//   'steve'     — ko'k ko'ylak, jigarrang teri
//   'alex'      — yashil ko'ylak, slim qo'llar
//   'dream'     — oq ko'ylak, oq shim, oq niqob
//   'notch'     — yashil ko'ylak, soqol
//   'herobrine' — kulrang ko'ylak, oq ko'zlar
//   'creeper'   — yashil, creeper yuzi

import { ProceduralAvatar } from './ProceduralAvatar.js';

export const AVATAR_IDS = ['steve', 'alex', 'dream', 'notch', 'herobrine', 'creeper'];

/** Yangi hisob uchun tasodifiy avatarId */
export function getRandomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

/** AvatarId bo'yicha ProceduralAvatar yaratish */
export function createAvatar(scene, avatarId) {
  const id = AVATAR_IDS.includes(avatarId) ? avatarId : 'steve';
  return new ProceduralAvatar(scene, id);
}

// Orqaga moslik uchun — Renderer.js SteveAvatar import qiladi
export class SteveAvatar extends ProceduralAvatar {
  constructor(scene) { super(scene, 'steve'); }
}
