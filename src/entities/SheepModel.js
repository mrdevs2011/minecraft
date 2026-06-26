import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
//  SheepModel — to'liq THREE.js da qurilgan Minecraft qo'y modeli.
//  Hech qanday .glb yuklanmaydi.
//
//  Haqiqiy Minecraft qo'y o'lchamlari (1 blok = 1.0 unit):
//    Tana (jun bilan) : 9×8×16 px → 0.5625 × 0.5 × 1.0 blok  (Y=0.5)
//    Bosh             : 6×6×8  px → 0.375 × 0.375 × 0.5 blok
//    Oyoq (4 ta)      : 4×12×4 px → 0.25 × 0.75 × 0.25 blok
//    Jun qatlam (tana ustida biroz kattaroq)
// ═══════════════════════════════════════════════════════════════════════════

const PX = 1 / 16;

// Tana
const B_W = 9 * PX, B_H = 8 * PX, B_D = 16 * PX;
// Bosh
const H_W = 6 * PX, H_H = 6 * PX, H_D = 8 * PX;
// Oyoq
const L_W = 4 * PX, L_H = 12 * PX, L_D = 4 * PX;
// Jun qatlam (tana ustida)
const J_W = B_W + 2 * PX, J_H = B_H + 2 * PX, J_D = B_D + 2 * PX;

// Rang
const WOOL   = 0xe0e0e0;  // oq jun
const SKIN   = 0x888070;  // qoʻy terisi (bosh, oyoqlar)
const DARK   = 0x555045;  // yuz detallari

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}
function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

export class SheepModel {
  constructor(scene) {
    this.scene      = scene;
    this._time      = Math.random() * Math.PI * 2;
    this._hurtFlash = false;
    this._ready     = true;

    this.root = new THREE.Group();
    scene.add(this.root);
    this._build();
  }

  _build() {
    // ── 4 ta oyoq ─────────────────────────────────────────────────────────
    // Oyoq pivot: yuqori qirrasi (yerdan LEG_H balandda)
    // oyoq mesh: pivot dan pastga osilib turadi
    const legPositions = [
      { x: -(B_W / 2 - L_W / 2), z: -(B_D / 2 - L_D / 2), sign:  1, name: 'fl' }, // old chap
      { x:  (B_W / 2 - L_W / 2), z: -(B_D / 2 - L_D / 2), sign: -1, name: 'fr' }, // old o'ng
      { x: -(B_W / 2 - L_W / 2), z:  (B_D / 2 - L_D / 2), sign: -1, name: 'bl' }, // orqa chap
      { x:  (B_W / 2 - L_W / 2), z:  (B_D / 2 - L_D / 2), sign:  1, name: 'br' }, // orqa o'ng
    ];

    this._legs = [];
    for (const lp of legPositions) {
      const grp = new THREE.Group();
      const m = box(L_W, L_H, L_D, SKIN);
      m.position.y = -L_H / 2;
      // Tuyoq: pastki qismida biroz to'q
      const hoof = box(L_W + PX, 2 * PX, L_D + PX, DARK);
      hoof.position.y = -L_H + PX;
      grp.add(m, hoof);
      grp.position.set(lp.x, L_H, lp.z);
      this.root.add(grp);
      this._legs.push({ grp, sign: lp.sign });
    }

    // ── Tana (jun qatlam) ─────────────────────────────────────────────────
    // Tana markazi: oyoq pivot dan B_H/2 yuqorida
    const bodyY = L_H + B_H / 2;
    this._body = box(J_W, J_H, J_D, WOOL);
    this._body.position.set(0, bodyY, 0);
    this.root.add(this._body);

    // Tana teri qatlami (jun ostidan ozgina ko'rinib turadi)
    const bodyBase = box(B_W, B_H, B_D, SKIN);
    bodyBase.position.set(0, bodyY, 0);
    this.root.add(bodyBase);

    // ── Bosh ─────────────────────────────────────────────────────────────
    // Bosh oldinda: tana oldi qirrasi + bosh yarmi oldinga chiqib turadi
    const headZ = -(B_D / 2 + H_D * 0.3);  // oldinga chiqib turadi
    const headY = L_H + B_H - H_H * 0.1;   // tana yuqori qirrasi hizasida

    this._headGroup = new THREE.Group();
    const headMesh = box(H_W, H_H, H_D, SKIN);
    this._headGroup.add(headMesh);

    // Ko'zlar
    const eyeZ  = -(H_D / 2 + 0.001);
    const eyeOX = H_W / 4;
    const eyeY  = H_H / 6;
    const mkEye = (ox) => {
      const e = new THREE.Mesh(
        new THREE.BoxGeometry(1.5 * PX, 1.5 * PX, 0.001),
        mat(DARK)
      );
      e.position.set(ox, eyeY, eyeZ);
      return e;
    };
    this._headGroup.add(mkEye(-eyeOX), mkEye(eyeOX));

    // Burun (pastki qismida biroz qoramtir)
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(3 * PX, 2 * PX, 0.001),
      mat(0x999080)
    );
    nose.position.set(0, -H_H / 3, eyeZ);
    this._headGroup.add(nose);

    this._headGroup.position.set(0, headY, headZ);
    this.root.add(this._headGroup);

    // Shovuq (yelim kabi o'simlik)
    const hornL = box(PX, 3 * PX, PX, 0xccbb99);
    hornL.position.set(-1.5 * PX, H_H / 2 + 1.5 * PX, 0);
    const hornR = box(PX, 3 * PX, PX, 0xccbb99);
    hornR.position.set( 1.5 * PX, H_H / 2 + 1.5 * PX, 0);
    this._headGroup.add(hornL, hornR);

    // hurt uchun materiallar ro'yxati
    this._hurtMats = [];
    this.root.traverse(obj => {
      if (obj.isMesh && obj.material) this._hurtMats.push(obj.material);
    });
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (moving) {
      this._time += dt * 6;
    } else {
      if (Math.abs(Math.sin(this._time)) > 0.015) this._time += dt * 3;
    }

    const swing = moving
      ? Math.sin(this._time) * 0.40
      : Math.sin(this._time) * 0.06; // idle: ozgina sallanish

    for (const leg of this._legs) {
      leg.grp.rotation.x = swing * leg.sign;
    }

    // Bosh
    if (this._headGroup) {
      const bob = moving
        ? Math.sin(this._time * 2) * 0.04
        : Math.sin(this._time * 0.9) * 0.02;
      this._headGroup.rotation.x = bob - 0.15; // biroz pastga qaragan
    }
  }

  setHurt(isHurt) {
    if (this._hurtFlash === isHurt) return;
    this._hurtFlash = isHurt;
    for (const m of this._hurtMats) {
      if (isHurt) {
        if (!m.userData._oc) m.userData._oc = m.color.getHex();
        m.emissive?.set(0x661100);
      } else {
        m.emissive?.set(0x000000);
      }
      m.needsUpdate = true;
    }
  }

  setVisible(v) { this.root.visible = v; }

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
