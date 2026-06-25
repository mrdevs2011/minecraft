import { BaseAvatar } from './BaseAvatar.js';

// ─── Noor ──────────────────────────────────────────────────────────────────
// Deep-brown skin · black hair · purple tunic · dark charcoal pants · near-black boots
const C = {
  skin:      0x5a3010,
  skinDark:  0x3a1c08,
  hair:      0x0a0806,   // deep black
  hairMid:   0x180e08,
  eyeWhite:  0xffffff,
  eyePupil:  0x602010,   // dark amber-brown
  eyeBrow:   0x080604,
  beard:     0x3a1c08,   // no beard
  shirt:     0x7a2a9a,   // vibrant purple
  shirtDark: 0x5a1a7a,
  pants:     0x3a2a4a,   // dark charcoal-purple
  pantsDark: 0x281a38,
  boot:      0x1a1020,   // near-black
  bootDark:  0x100810,
  armSkin:   0x583010,
  armShad:   0x381c08,
};

export class NoorAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { hairLength: 'short' }); }
}
