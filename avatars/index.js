// ─────────────────────────────────────────────────────────────────────────────
//  avatars/index.js
//  Central registry for all playable avatar types.
//
//  Usage:
//    import { getRandomAvatarId, createAvatar, AVATAR_IDS } from '../avatars/index.js';
//    const id  = getRandomAvatarId();           // e.g. 'noor'
//    const mdl = createAvatar(scene, id);       // returns a BaseAvatar instance
// ─────────────────────────────────────────────────────────────────────────────

import { SteveAvatar  } from './steve.js';
import { AlexAvatar   } from './alex.js';
import { AriAvatar    } from './ari.js';
import { NoorAvatar   } from './noor.js';
import { MakenaAvatar } from './makena.js';
import { EfeAvatar    } from './efe.js';
import { ZuriAvatar   } from './zuri.js';
import { KaiAvatar    } from './kai.js';

/** Ordered list of all avatar IDs (matches the Minecraft default-skin lineup). */
export const AVATAR_IDS = ['steve', 'alex', 'ari', 'noor', 'makena', 'efe', 'zuri', 'kai'];

/** Map from avatar ID string → constructor class. */
export const AVATAR_CLASS_MAP = {
  steve:  SteveAvatar,
  alex:   AlexAvatar,
  ari:    AriAvatar,
  noor:   NoorAvatar,
  makena: MakenaAvatar,
  efe:    EfeAvatar,
  zuri:   ZuriAvatar,
  kai:    KaiAvatar,
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
 * @param {string}      avatarId - e.g. 'alex', 'kai', …
 * @returns {BaseAvatar}
 */
export function createAvatar(scene, avatarId) {
  const AvatarClass = AVATAR_CLASS_MAP[avatarId] ?? SteveAvatar;
  return new AvatarClass(scene);
}

// Re-export individual classes for direct use
export { SteveAvatar, AlexAvatar, AriAvatar, NoorAvatar,
         MakenaAvatar, EfeAvatar, ZuriAvatar, KaiAvatar };
