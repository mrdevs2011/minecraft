import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
//  ProceduralAvatar
//  Minecraft player modelini to'liq THREE.js da quramiz — hech qanday .glb
//  yoki tashqi fayl yuklanmaydi.
//
//  Haqiqiy Minecraft o'lchamlari (1 blok = 1.0 THREE unit):
//    Bosh   : 8x8x8 px  → 0.5 × 0.5 × 0.5 blok
//    Tana   : 8x12x4 px → 0.5 × 0.75 × 0.25 blok
//    Qo'l   : 4x12x4 px → 0.25 × 0.75 × 0.25 blok  (slim: 3px wide)
//    Oyoq   : 4x12x4 px → 0.25 × 0.75 × 0.25 blok
//  Umumiy balandlik: 0.5 + 0.75 + 0.75 = 2.0 blok  (1 birlik = 0.0625 blok/px)
//
//  Har avatar:
//    - teri rangi (skin)
//    - kiyim rangi (shirt, pants, shoes)
//    - yuz detallari (ko'zlar, og'iz, soqol — alohida mesh lar)
//    - qo'l kengligi (normal 0.25, slim 0.1875)
//
//  Animatsiya: qo'l va oyoqlar sin() bilan swing — joylarda saqlanadi.
//  Pivot: har qo'l/oyoq uchun alohida THREE.Group — rotatsiya shu group dan.
// ═══════════════════════════════════════════════════════════════════════════

// ── Minecraft piksel → THREE unit: 1px = 1/16 blok ──────────────────────────
const PX = 1 / 16;   // 0.0625

// ── Haqiqiy Minecraft o'lchamlar ─────────────────────────────────────────────
const HEAD_W  = 8  * PX;   // 0.500
const HEAD_H  = 8  * PX;   // 0.500
const HEAD_D  = 8  * PX;   // 0.500

const BODY_W  = 8  * PX;   // 0.500
const BODY_H  = 12 * PX;   // 0.750
const BODY_D  = 4  * PX;   // 0.250

const ARM_W   = 4  * PX;   // 0.250
const ARM_W_S = 3  * PX;   // 0.1875  (slim)
const ARM_H   = 12 * PX;   // 0.750
const ARM_D   = 4  * PX;   // 0.250

const LEG_W   = 4  * PX;   // 0.250
const LEG_H   = 12 * PX;   // 0.750
const LEG_D   = 4  * PX;   // 0.250

// ── Y pozitsiyalari (yerdan yuqoriga) ────────────────────────────────────────
// Oyoq pivot (yuqori qismi): LEG_H = 0.75
const LEG_PIVOT_Y   = LEG_H;               // 0.750 — oyoq guruhi shu yerda
// Tana pivot (markazida): BODY_H/2 ustida oyoq pivot dan
const BODY_CENTER_Y = LEG_PIVOT_Y + BODY_H / 2;  // 0.750 + 0.375 = 1.125
// Bosh pastki qirrasi: tana yuqori qirrasi
const HEAD_BOTTOM_Y = LEG_PIVOT_Y + BODY_H;       // 0.750 + 0.750 = 1.500
const HEAD_CENTER_Y = HEAD_BOTTOM_Y + HEAD_H / 2; // 1.500 + 0.250 = 1.750

// ── Avatar ta'riflari ─────────────────────────────────────────────────────────
const DEFS = {
  steve: {
    skin:  0xc68642, // klassik jigarrang teri
    eyes:  0x3d6bce, // ko'k ko'zlar
    shirt: 0x4a88c7, // ko'k ko'ylak
    pants: 0x2d4fa8, // to'q ko'k shim
    shoes: 0x3b2b1a, // qo'ng'ir poyabzal
    slim:  false,
    extra: null,
  },
  alex: {
    skin:  0xe8b87a, // och jigarrang teri
    eyes:  0x5a3a1a, // qo'ng'ir ko'zlar
    shirt: 0x6aaa44, // yashil ko'ylak
    pants: 0x8a5c2a, // jigarrang shim
    shoes: 0x2a1a0a, // qora-jigarrang
    slim:  true,
    extra: null,
  },
  dream: {
    skin:  0xf0d8a8, // och teri
    eyes:  0xffffff, // oq ko'zlar (niqob)
    shirt: 0xffffff, // oq ko'ylak
    pants: 0xffffff, // oq shim
    shoes: 0x222222, // qora poyabzal
    slim:  false,
    extra: 'dream_mask',
  },
  notch: {
    skin:  0xd4a06a, // to'q jigarrang teri
    eyes:  0x2a1a0a, // qora ko'zlar
    shirt: 0x3a6a2a, // to'q yashil
    pants: 0x4a3a1a, // jigarrang shim
    shoes: 0x1a0a00, // qora poyabzal
    slim:  false,
    extra: 'notch_beard',
  },
  herobrine: {
    skin:  0xc68642, // xuddi steve teri
    eyes:  0xffffff, // oq/bo'sh ko'zlar
    shirt: 0x445566, // kulrang ko'k ko'ylak
    pants: 0x334455, // to'q kulrang shim
    shoes: 0x111122, // qora-ko'k
    slim:  false,
    extra: 'herobrine_eyes',
  },
  creeper: {
    skin:  0x44aa44, // yashil
    eyes:  0x000000, // qora ko'zlar
    shirt: 0x338833, // to'q yashil tana
    pants: 0x226622, // juda to'q yashil
    shoes: 0x114411, // eng to'q yashil
    slim:  false,
    extra: 'creeper_face',
  },
};

// ── Material yordamchi ────────────────────────────────────────────────────────
function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

// ── Mesh yordamchi ────────────────────────────────────────────────────────────
function box(w, h, d, color, opts) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
}

// ── Yuz detali (to'rtburchak panel, pivot mesh ustiga yopishtiriladi) ─────────
// oz = pivot mesh dan Z offset (yuzga yopishish uchun)
function facePanel(w, h, color, ox, oy, oz) {
  const m = box(w, h, 0.001, color);
  m.position.set(ox, oy, oz);
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════
export class ProceduralAvatar {
  constructor(scene, avatarId = 'steve') {
    this.scene    = scene;
    this.avatarId = avatarId;
    this._time    = 0;
    this._isGhost = false;
    this._ready   = true;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._build();
  }

  // ─── Model qurish ──────────────────────────────────────────────────────────
  _build() {
    const def = DEFS[this.avatarId] || DEFS.steve;
    const armW = def.slim ? ARM_W_S : ARM_W;

    // ── 1. OYOQLAR ──────────────────────────────────────────────────────────
    // Pivot: oyoqning YUQORI qirrasi (shu yerdan buriladi)
    // Mesh: pivot dan pastga osib qo'yamiz (y = -LEG_H/2)

    this._legR = new THREE.Group();
    const legRMesh = box(LEG_W, LEG_H, LEG_D, def.pants);
    legRMesh.position.y = -LEG_H / 2;
    // Poyabzal: oyoq mesh pastki qirrasi
    const shoeR = box(LEG_W + 0.01, 2 * PX, LEG_D + 0.01, def.shoes);
    shoeR.position.y = -LEG_H + PX;  // oyoq pastki qirrasi
    this._legR.add(legRMesh, shoeR);
    // Pivot pozitsiyasi: o'ng oyoq — markazdan chapga
    this._legR.position.set(-LEG_W / 2 - 0.5 * PX, LEG_PIVOT_Y, 0);
    this.root.add(this._legR);

    this._legL = new THREE.Group();
    const legLMesh = box(LEG_W, LEG_H, LEG_D, def.pants);
    legLMesh.position.y = -LEG_H / 2;
    const shoeL = box(LEG_W + 0.01, 2 * PX, LEG_D + 0.01, def.shoes);
    shoeL.position.y = -LEG_H + PX;
    this._legL.add(legLMesh, shoeL);
    this._legL.position.set( LEG_W / 2 + 0.5 * PX, LEG_PIVOT_Y, 0);
    this.root.add(this._legL);

    // ── 2. TANA ─────────────────────────────────────────────────────────────
    this._torso = box(BODY_W, BODY_H, BODY_D, def.shirt);
    this._torso.position.set(0, BODY_CENTER_Y, 0);
    this.root.add(this._torso);

    // ── 3. QO'LLAR ─────────────────────────────────────────────────────────
    // Pivot: yelka — tana yuqori qirrasi hizasida
    const shoulderY = LEG_PIVOT_Y + BODY_H;  // 1.500
    const armOffX   = BODY_W / 2 + armW / 2 + 0.5 * PX;

    this._armR = new THREE.Group();
    const armRMesh = box(armW, ARM_H, ARM_D, def.shirt);
    armRMesh.position.y = -ARM_H / 2;
    this._armR.add(armRMesh);
    this._armR.position.set(-armOffX, shoulderY, 0);
    this.root.add(this._armR);

    this._armL = new THREE.Group();
    const armLMesh = box(armW, ARM_H, ARM_D, def.shirt);
    armLMesh.position.y = -ARM_H / 2;
    this._armL.add(armLMesh);
    this._armL.position.set( armOffX, shoulderY, 0);
    this.root.add(this._armL);

    // ── 4. BOSH ─────────────────────────────────────────────────────────────
    // Bosh Group: pivot = bosh pastki qirrasi (bo'yin)
    this._headGroup = new THREE.Group();
    const headMesh = box(HEAD_W, HEAD_H, HEAD_D, def.skin);
    headMesh.position.y = HEAD_H / 2;
    this._headGroup.add(headMesh);

    // Ko'zlar (chap va o'ng)
    const eyeZ = HEAD_D / 2 + 0.001;
    const eyeH = 1.5 * PX;
    const eyeW = 2   * PX;
    const eyeY = HEAD_H / 2 + 1 * PX;  // bosh markazidan biroz yuqori

    if (this.avatarId === 'creeper') {
      // Creeper: 2 ta katta kvadrat ko'z + katta og'iz
      const eyeWc = 3 * PX, eyeHc = 3 * PX;
      const eyeL = facePanel(eyeWc, eyeHc, 0x000000,  -2 * PX, eyeY + PX, eyeZ);
      const eyeR = facePanel(eyeWc, eyeHc, 0x000000,   2 * PX, eyeY + PX, eyeZ);
      // Og'iz: pastki qismida katta qora shakl
      const m1 = facePanel(PX, 3 * PX, 0x000000, -2 * PX, eyeY - 3 * PX, eyeZ);
      const m2 = facePanel(PX, 3 * PX, 0x000000,  2 * PX, eyeY - 3 * PX, eyeZ);
      const m3 = facePanel(2 * PX, PX, 0x000000, 0, eyeY - 4.5 * PX, eyeZ);
      const m4 = facePanel(PX, PX, 0x000000, -PX, eyeY - 2 * PX, eyeZ);
      const m5 = facePanel(PX, PX, 0x000000,  PX, eyeY - 2 * PX, eyeZ);
      this._headGroup.add(eyeL, eyeR, m1, m2, m3, m4, m5);
    } else if (this.avatarId === 'herobrine') {
      // Herobrine: oq bo'sh ko'zlar (ichida qorong'u emas)
      const eyeL = facePanel(eyeW + PX, eyeH + PX, 0xeeeeee, -2.5 * PX, eyeY, eyeZ);
      const eyeR = facePanel(eyeW + PX, eyeH + PX, 0xeeeeee,  2.5 * PX, eyeY, eyeZ);
      this._headGroup.add(eyeL, eyeR);
    } else if (this.avatarId === 'dream') {
      // Dream: oq niqob qatlam (yuzni to'sib turadi)
      const mask = box(HEAD_W + 0.01, HEAD_H * 0.7, 0.005, 0xffffff);
      mask.position.set(0, HEAD_H * 0.25, HEAD_D / 2 + 0.003);
      this._headGroup.add(mask);
      // Niqob ustida qora ko'zlar
      const mZ = HEAD_D / 2 + 0.006;
      const mEyeL = facePanel(eyeW + PX, eyeH + PX, 0x111111, -2.5 * PX, eyeY - PX, mZ);
      const mEyeR = facePanel(eyeW + PX, eyeH + PX, 0x111111,  2.5 * PX, eyeY - PX, mZ);
      this._headGroup.add(mEyeL, mEyeR);
    } else {
      // Steve / Alex / Notch: oddiy ko'zlar
      const irisColor = def.eyes;
      const eyeL = facePanel(eyeW, eyeH, irisColor, -2 * PX, eyeY, eyeZ);
      const eyeR = facePanel(eyeW, eyeH, irisColor,  2 * PX, eyeY, eyeZ);
      this._headGroup.add(eyeL, eyeR);

      if (this.avatarId === 'notch') {
        // Notch soqoli: bosh pastki qismida jigarrang panel
        const beard = box(HEAD_W - PX, 2 * PX, HEAD_D + 0.01, 0x8B5E3C);
        beard.position.set(0, PX, 0);
        this._headGroup.add(beard);
      }
    }

    this._headGroup.position.set(0, HEAD_BOTTOM_Y, 0);
    this.root.add(this._headGroup);

    // ── Asl rotatsiya saqlab qo'yamiz ────────────────────────────────────────
    this._origRot = {
      armR: this._armR.rotation.clone(),
      armL: this._armL.rotation.clone(),
      legR: this._legR.rotation.clone(),
      legL: this._legL.rotation.clone(),
    };
  }

  // ─── UPDATE: har frame ─────────────────────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    // Animatsiya timer
    if (moving) {
      this._time += dt * 8;
    } else {
      // Natural to'xtatish — nolga yaqin kelganda to'xtaydi
      if (Math.abs(Math.sin(this._time)) > 0.015) this._time += dt * 8;
    }

    const swing = moving ? Math.sin(this._time) * 0.6 : 0;

    // Qo'llar: o'ng qo'l bilan chap oyoq bir yo'nalishda
    this._armR.rotation.x = this._origRot.armR.x + swing;
    this._armL.rotation.x = this._origRot.armL.x - swing;
    this._legR.rotation.x = this._origRot.legR.x - swing;
    this._legL.rotation.x = this._origRot.legL.x + swing;

    // Yurganda qo'llar biroz tashqariga chiqadi
    this._armR.rotation.z = moving ? -0.06 : 0;
    this._armL.rotation.z = moving ?  0.06 : 0;

    // Bosh bob: pivot pastida, mesh yuqoriga ko'tariladi
    if (this._headGroup) {
      const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.02 : 0;
      this._headGroup.position.y = HEAD_BOTTOM_Y + bobY;
    }

    // Tana: yurganda ozgina oldinga engashadi
    if (this._torso) this._torso.rotation.x = moving ? 0.04 : 0;
  }

  setVisible(v) { this.root.visible = v; }

  setFirstPersonMode(active) {
    if (this._headGroup) this._headGroup.visible = !active;
    if (this._torso)     this._torso.visible     = !active;
    if (this._legL)      this._legL.visible      = !active;
    if (this._legR)      this._legR.visible      = !active;
  }

  setGhost(isGhost) {
    this._isGhost = !!isGhost;
    this.root.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        if (!m) return;
        if (!obj.userData._go) {
          obj.userData._go = { opacity: m.opacity, transparent: m.transparent };
        }
        const o = obj.userData._go;
        if (this._isGhost) {
          m.transparent = true;
          m.opacity     = 0.35;
        } else {
          m.transparent = o.transparent;
          m.opacity     = o.opacity;
        }
        m.needsUpdate = true;
      });
    });
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        obj.material?.dispose();
      }
    });
  }
}
