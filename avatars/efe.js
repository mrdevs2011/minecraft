import { BaseAvatar } from './BaseAvatar.js';

// ─── Efe ───────────────────────────────────────────────────────────────────
// Very light skin · bright golden-blonde hair · sky-blue shirt · light grey pants · beige boots
const C = {
  skin:      0xf2dab0,
  skinDark:  0xd8b880,
  hair:      0xe0a030,   // golden yellow
  hairMid:   0xf0c050,   // lighter highlight
  eyeWhite:  0xffffff,
  eyePupil:  0x3090d0,   // bright blue
  eyeBrow:   0xa07020,
  beard:     0xd8b880,   // no beard
  shirt:     0x70c4e0,   // sky / light teal
  shirtDark: 0x50a4c0,
  pants:     0xc0c0c8,   // light grey
  pantsDark: 0xa0a0a8,
  boot:      0xc0a87a,   // warm beige
  bootDark:  0xa08050,
  armSkin:   0xf0d8a8,
  armShad:   0xd4b880,
};

export class EfeAvatar extends BaseAvatar {
  constructor(scene) { super(scene, C, { hairLength: 'normal' }); }
}
