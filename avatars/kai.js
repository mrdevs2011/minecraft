import { BaseAvatar } from './BaseAvatar.js';

// ─── Kai ───────────────────────────────────────────────────────────────────
// Light skin · bright violet-purple hair · dark charcoal outfit · near-black boots
// Slim arms — slightly androgynous silhouette
const C = {
  skin:      0xe8c898,
  skinDark:  0xc8a878,
  hair:      0x7030b8,   // vivid purple
  hairMid:   0x9050d8,   // lighter purple
  eyeWhite:  0xffffff,
  eyePupil:  0x9020d0,   // deep violet
  eyeBrow:   0x4a1880,
  beard:     0xc8a878,   // no beard
  shirt:     0x2a2a3a,   // dark charcoal-blue
  shirtDark: 0x1a1a2a,
  pants:     0x18182a,   // near-black blue
  pantsDark: 0x101018,
  boot:      0x101018,
  bootDark:  0x080810,
  armSkin:   0xe4c490,
  armShad:   0xc4a470,
};

export class KaiAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { slimArms: true, hairLength: 'long' }); }
}
