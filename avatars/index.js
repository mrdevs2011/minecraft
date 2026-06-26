// ─────────────────────────────────────────────────────────────────────────────
//  avatars/index.js
//  Central registry for all playable avatar types.
// ─────────────────────────────────────────────────────────────────────────────

import { SteveAvatar  } from './steve.js';
import { AlexAvatar   } from './alex.js';
import { AriAvatar    } from './ari.js';
import { EfeAvatar    } from './efe.js';
import { KaiAvatar    } from './kai.js';
import { MakenaAvatar } from './makena.js';
import { NoorAvatar   } from './noor.js';
import { ZuriAvatar   } from './zuri.js';

/** Barcha mavjud avatar ID lari */
export const AVATAR_IDS = ['steve', 'alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'zuri'];

/** ID → konstruktor */
export const AVATAR_CLASS_MAP = {
  steve:  SteveAvatar,
  alex:   AlexAvatar,
  ari:    AriAvatar,
  efe:    EfeAvatar,
  kai:    KaiAvatar,
  makena: MakenaAvatar,
  noor:   NoorAvatar,
  zuri:   ZuriAvatar,
};

/** Yangi o'yinchi uchun tasodifiy avatar ID qaytaradi */
export function getRandomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

/**
 * Berilgan ID bo'yicha avatar modeli yaratib qaytaradi.
 * Noma'lum ID bo'lsa — Steve dan foydalaniladi.
 */
export function createAvatar(scene, avatarId) {
  const AvatarClass = AVATAR_CLASS_MAP[avatarId] ?? SteveAvatar;
  return new AvatarClass(scene);
}

// Alohida classlarni ham re-export
export { SteveAvatar, AlexAvatar, AriAvatar, EfeAvatar, KaiAvatar, MakenaAvatar, NoorAvatar, ZuriAvatar };
