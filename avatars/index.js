// avatars/index.js — Steve, Alex, Dream, Notch
import { SteveAvatar } from './steve.js';
import { AlexAvatar  } from './alex.js';
import { DreamAvatar } from './dream.js';
import { NotchAvatar } from './notch.js';

const AVATAR_IDS = ['steve', 'alex', 'dream', 'notch'];

/** Yangi hisob uchun tasodifiy avatar */
export function getRandomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

/** Avatar yaratish */
export function createAvatar(scene, avatarId) {
  if (avatarId === 'alex')  return new AlexAvatar(scene);
  if (avatarId === 'dream') return new DreamAvatar(scene);
  if (avatarId === 'notch') return new NotchAvatar(scene);
  return new SteveAvatar(scene);   // default: steve
}

export { SteveAvatar, AlexAvatar, DreamAvatar, NotchAvatar };
