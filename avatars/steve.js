import { BaseAvatar } from './BaseAvatar.js';

// ─── Classic Steve ─────────────────────────────────────────────────────────
// Tan skin · brown hair · teal shirt · purple pants · grey boots
const C = {
  skin:      0xc78c58,
  skinDark:  0xa0703a,
  hair:      0x4a2a0a,
  hairMid:   0x6b3d14,
  eyeWhite:  0xffffff,
  eyePupil:  0x4a3aff,   // classic blue-purple
  eyeBrow:   0x2a1800,
  beard:     0xa05030,
  shirt:     0x3ab8c8,
  shirtDark: 0x2898a8,
  pants:     0x6a3ab8,
  pantsDark: 0x502898,
  boot:      0x606060,
  bootDark:  0x404040,
  armSkin:   0xc89060,
  armShad:   0xa87040,
};

export class SteveAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { hairLength: 'normal' }); }
}
