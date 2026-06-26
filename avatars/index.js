// avatars/index.js — Steve, Alex, Dream
import { SteveAvatar } from './steve.js';
import { AlexAvatar  } from './alex.js';
import { DreamAvatar } from './dream.js';

const AVATAR_IDS = ['steve', 'alex', 'dream'];

/** Yangi hisob uchun tasodifiy avatar */
export function getRandomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

/** Avatar yaratish */
export function createAvatar(scene, avatarId) {
  if (avatarId === 'alex')  return new AlexAvatar(scene);
  if (avatarId === 'dream') return new DreamAvatar(scene);
  return new SteveAvatar(scene);
}

export { SteveAvatar, AlexAvatar, DreamAvatar };
