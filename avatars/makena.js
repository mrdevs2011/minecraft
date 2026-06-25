import { BaseAvatar } from './BaseAvatar.js';

// ─── Makena ────────────────────────────────────────────────────────────────
// Very dark brown skin · black hair · bright green jacket · olive/khaki pants · dark boots
const C = {
  skin:      0x4a2810,
  skinDark:  0x2e1808,
  hair:      0x0e0806,   // near black
  hairMid:   0x1a0e08,
  eyeWhite:  0xffffff,
  eyePupil:  0x4a2808,   // very dark brown
  eyeBrow:   0x080604,
  beard:     0x2e1808,   // no beard
  shirt:     0x2a6e3a,   // forest green
  shirtDark: 0x1a4e2a,
  pants:     0x5a6030,   // olive / khaki
  pantsDark: 0x3a4020,
  boot:      0x1a0e08,
  bootDark:  0x0e0806,
  armSkin:   0x482810,
  armShad:   0x2c1808,
};

export class MakenaAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { hairLength: 'short' }); }
}
