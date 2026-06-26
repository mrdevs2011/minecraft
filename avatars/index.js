// avatars/index.js — Steve va Alex
import { SteveAvatar } from './steve.js';
import { AlexAvatar  } from './alex.js';

const AVATARS = ['steve', 'alex'];

/** Yangi hisob uchun tasodifiy avatar */
export function getRandomAvatarId() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

/** Avatar yaratish */
export function createAvatar(scene, avatarId) {
  if (avatarId === 'alex') return new AlexAvatar(scene);
  return new SteveAvatar(scene);
}

export { SteveAvatar, AlexAvatar };
