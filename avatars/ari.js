import { BaseAvatar } from './BaseAvatar.js';

// ─── Ari ───────────────────────────────────────────────────────────────────
// Medium-tan skin · very dark short hair · navy-blue denim overalls · brown boots
// (Leftmost character in the default-skin lineup)
const C = {
  skin:      0xd4a870,
  skinDark:  0xb88050,
  hair:      0x180e06,   // near-black
  hairMid:   0x2e1a0e,
  eyeWhite:  0xffffff,
  eyePupil:  0x5a3010,   // warm brown
  eyeBrow:   0x120a04,
  beard:     0xb88050,   // no beard
  shirt:     0x182848,   // very dark navy (overalls bib)
  shirtDark: 0x101e38,
  pants:     0x2a5898,   // denim blue
  pantsDark: 0x1a3878,
  boot:      0x7a4e2a,   // medium brown
  bootDark:  0x5a3010,
  armSkin:   0xd0a468,
  armShad:   0xb08040,
};

export class AriAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { hairLength: 'short' }); }
}
