import { BaseAvatar } from './BaseAvatar.js';

// ─── Alex ──────────────────────────────────────────────────────────────────
// Light tan skin · auburn-orange long hair · green shirt · brown pants
// Slim 3px-wide arms (Java Edition authentic)
const C = {
  skin:      0xe4ba82,
  skinDark:  0xc49060,
  hair:      0xc84818,   // deep auburn-orange
  hairMid:   0xe06030,   // lighter orange highlight
  eyeWhite:  0xffffff,
  eyePupil:  0x20a040,   // green
  eyeBrow:   0x7a2808,
  beard:     0xc49060,   // no beard — matches skinDark
  shirt:     0x4a8c3a,   // forest green
  shirtDark: 0x386030,
  pants:     0x8a5c3a,   // warm brown
  pantsDark: 0x6a3c1a,
  boot:      0x4a2a10,
  bootDark:  0x2a1800,
  armSkin:   0xe0b880,
  armShad:   0xc09060,
};

export class AlexAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { slimArms: true, hairLength: 'long' }); }
}
