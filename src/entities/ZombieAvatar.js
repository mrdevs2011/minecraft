import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
//  ZombieAvatar — to'liq THREE.js da qurilgan, hech qanday .glb yuklanmaydi.
//  Minecraft zombie ranglari: yashil teri, yirtiq ko'k-kulrang kiyim.
//  Steve bilan bir xil proporsiyon va animatsiya.
// ═══════════════════════════════════════════════════════════════════════════

const PX = 1 / 16;

const HEAD_W = 8 * PX, HEAD_H = 8 * PX, HEAD_D = 8 * PX;
const BODY_W = 8 * PX, BODY_H = 12 * PX, BODY_D = 4 * PX;
const ARM_W  = 4 * PX, ARM_H  = 12 * PX, ARM_D  = 4 * PX;
const LEG_W  = 4 * PX, LEG_H  = 12 * PX, LEG_D  = 4 * PX;

const LEG_PIVOT_Y   = LEG_H;
const BODY_CENTER_Y = LEG_PIVOT_Y + BODY_H / 2;
const HEAD_BOTTOM_Y = LEG_PIVOT_Y + BODY_H;
const SHOULDER_Y    = HEAD_BOTTOM_Y;

// Zombie ranglari
const Z_SKIN  = 0x799c65;  // yashil teri
const Z_SHIRT = 0x4a5a7a;  // ko'k-kulrang ko'ylak (yirtiq)
const Z_PANTS = 0x3a4a6a;  // to'q ko'k shim
const Z_SHOES = 0x1a2a1a;  // qoramtir poyabzal

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}
function box(w, h, d, color, opts) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
}

export class ZombieAvatar {
  constructor(scene) {
    this.scene      = scene;
    this._time      = 0;
    this._moving    = false;
    this._hurtFlash = false;
    this._hurtMats  = [];
    this._ready     = true;

    this.root = new THREE.Group();
    scene.add(this.root);
    this._build();
  }

  _build() {
    // ── Oyoqlar ──────────────────────────────────────────────────────────────
    this._legR = new THREE.Group();
    const lrm = box(LEG_W, LEG_H, LEG_D, Z_PANTS);
    lrm.position.y = -LEG_H / 2;
    const lrs = box(LEG_W + 0.01, 2 * PX, LEG_D + 0.01, Z_SHOES);
    lrs.position.y = -LEG_H + PX;
    this._legR.add(lrm, lrs);
    this._legR.position.set(-LEG_W / 2 - 0.5 * PX, LEG_PIVOT_Y, 0);
    this.root.add(this._legR);

    this._legL = new THREE.Group();
    const llm = box(LEG_W, LEG_H, LEG_D, Z_PANTS);
    llm.position.y = -LEG_H / 2;
    const lls = box(LEG_W + 0.01, 2 * PX, LEG_D + 0.01, Z_SHOES);
    lls.position.y = -LEG_H + PX;
    this._legL.add(llm, lls);
    this._legL.position.set( LEG_W / 2 + 0.5 * PX, LEG_PIVOT_Y, 0);
    this.root.add(this._legL);

    // ── Tana ─────────────────────────────────────────────────────────────────
    this._body = box(BODY_W, BODY_H, BODY_D, Z_SHIRT);
    this._body.position.set(0, BODY_CENTER_Y, 0);
    this.root.add(this._body);

    // ── Qo'llar (zombie: oldinga uzatilgan) ──────────────────────────────────
    const armOffX = BODY_W / 2 + ARM_W / 2 + 0.5 * PX;

    this._armR = new THREE.Group();
    const armRm = box(ARM_W, ARM_H, ARM_D, Z_SHIRT);
    armRm.position.y = -ARM_H / 2;
    this._armR.add(armRm);
    this._armR.position.set(-armOffX, SHOULDER_Y, 0);
    // Zombie qo'llarini oldinga uzatamiz
    this._armR.rotation.x = -Math.PI / 2;
    this.root.add(this._armR);

    this._armL = new THREE.Group();
    const armLm = box(ARM_W, ARM_H, ARM_D, Z_SHIRT);
    armLm.position.y = -ARM_H / 2;
    this._armL.add(armLm);
    this._armL.position.set( armOffX, SHOULDER_Y, 0);
    this._armL.rotation.x = -Math.PI / 2;
    this.root.add(this._armL);

    // ── Bosh ─────────────────────────────────────────────────────────────────
    this._headGroup = new THREE.Group();
    const headMesh = box(HEAD_W, HEAD_H, HEAD_D, Z_SKIN);
    headMesh.position.y = HEAD_H / 2;

    // Zombie ko'zlari: qizil
    const eyeZ = HEAD_D / 2 + 0.001;
    const eyeH = 1.5 * PX, eyeW = 2 * PX;
    const eyeY = HEAD_H / 2 + 1 * PX;
    const mkEye = (ox) => {
      const e = new THREE.Mesh(
        new THREE.BoxGeometry(eyeW, eyeH, 0.001),
        mat(0xff2222)
      );
      e.position.set(ox, eyeY, eyeZ);
      return e;
    };
    this._headGroup.add(headMesh, mkEye(-2 * PX), mkEye(2 * PX));

    this._headGroup.position.set(0, HEAD_BOTTOM_Y, 0);
    this.root.add(this._headGroup);

    // hurt flash uchun barcha materiallarni yig'amiz
    this.root.traverse(obj => {
      if (obj.isMesh && obj.material) this._hurtMats.push(obj.material);
    });

    // Asl rotatsiyalar (qo'llar oldinga uzatilgan)
    this._origRot = {
      armR: this._armR.rotation.clone(),
      armL: this._armL.rotation.clone(),
      legR: this._legR.rotation.clone(),
      legL: this._legL.rotation.clone(),
    };
  }

  update(x, y, z, yaw, moving, dt,
         headYaw = 0, headPitch = 0, attackAnim = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (moving) {
      this._time += dt * 7;
    } else {
      if (Math.abs(Math.sin(this._time)) > 0.015) this._time += dt * 7;
    }

    const swing = moving ? Math.sin(this._time) * 0.5 : 0;

    // Oyoqlar yurish animatsiyasi
    this._legR.rotation.x = this._origRot.legR.x - swing;
    this._legL.rotation.x = this._origRot.legL.x + swing;

    // Qo'llar: zombie qo'llari oldinga uzatilgan (-PI/2 baza),
    // hujum animatsiyasida pastga tushadi
    const attackSwing = attackAnim * 0.8;
    this._armR.rotation.x = this._origRot.armR.x + attackSwing + swing * 0.3;
    this._armL.rotation.x = this._origRot.armL.x + attackSwing - swing * 0.3;

    // Bosh yaw/pitch
    if (this._headGroup) {
      this._headGroup.rotation.y = headYaw;
      this._headGroup.rotation.x = headPitch;
      const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.02 : 0;
      this._headGroup.position.y = HEAD_BOTTOM_Y + bobY;
    }
  }

  setVisible(v) { this.root.visible = v; }

  setHurt(isHurt) {
    const color = isHurt ? 0xff5555 : null;
    for (const m of this._hurtMats) {
      if (isHurt) {
        if (!m.userData._origColor) m.userData._origColor = m.color.getHex();
        m.color.set(0xff5555);
      } else if (m.userData._origColor !== undefined) {
        m.color.set(m.userData._origColor);
      }
      m.needsUpdate = true;
    }
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
