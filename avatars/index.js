// ─────────────────────────────────────────────────────────────────────────────
//  avatars/index.js
//  Central registry for all playable avatar types.
//
//  Usage:
//    import { getRandomAvatarId, createAvatar, AVATAR_IDS } from '../avatars/index.js';
//    const id  = getRandomAvatarId();           // e.g. 'steve'
//    const mdl = createAvatar(scene, id);       // returns a BaseAvatar instance
//
//  VAQTINCHA: faqat Steve mavjud. Boshqa 7 avatar (alex, ari, noor, makena,
//  efe, zuri, kai) fayllari o'chirilgan — keyinroq birma-bir qayta qo'shiladi.
// ─────────────────────────────────────────────────────────────────────────────

import { SteveAvatar } from './steve.js';

/** Ordered list of all avatar IDs currently available. */
export const AVATAR_IDS = ['steve'];

/** Map from avatar ID string → constructor class. */
export const AVATAR_CLASS_MAP = {
  steve: SteveAvatar,
};

/**
 * Returns a random avatar ID string.
 * Called once when a new user account is created.
 */
export function getRandomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

/**
 * Instantiates and returns the avatar model for the given ID.
 * Falls back to Steve if the ID is unknown.
 *
 * @param {THREE.Scene} scene   - The Three.js scene to add the model to.
 * @param {string}      avatarId - e.g. 'steve' (only option for now).
 * @returns {BaseAvatar}
 */
export function createAvatar(scene, avatarId) {
  const AvatarClass = AVATAR_CLASS_MAP[avatarId] ?? SteveAvatar;
  return new AvatarClass(scene);
}

// Re-export individual classes for direct use
export { SteveAvatar };
