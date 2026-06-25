import { BaseAvatar } from './BaseAvatar.js';

// ─── Zuri ──────────────────────────────────────────────────────────────────
// Warm medium-brown skin · black hair · burnt-orange top · dark brown pants · near-black boots
const C = {
  skin:      0x8a5c28,
  skinDark:  0x6a3c10,
  hair:      0x1a0e06,   // near-black
  hairMid:   0x2a1808,
  eyeWhite:  0xffffff,
  eyePupil:  0x5a3010,   // amber-brown
  eyeBrow:   0x120a04,
  beard:     0x6a3c10,   // no beard
  shirt:     0xd06420,   // burnt orange
  shirtDark: 0xb04810,
  pants:     0x3e1e08,   // very dark brown
  pantsDark: 0x2a1008,
  boot:      0x1e0e08,
  bootDark:  0x100806,
  armSkin:   0x885a28,
  armShad:   0x683a10,
};

export class ZuriAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { hairLength: 'short' }); }
}
