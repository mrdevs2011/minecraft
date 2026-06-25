import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Haqiqiy Minecraft Steve ranglari (rasmdan olingan)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  // Teri
  skin:       0xc78c58,   // asosiy teri rangi
  skinDark:   0xa0703a,   // qorong'i teri (yoqlar)
  skinShad:   0x8a5c2e,   // soya

  // Soch (jigarrang)
  hair:       0x4a2a0a,   // qorong'i jigarrang
  hairMid:    0x6b3d14,   // o'rta jigarrang

  // Ko'z
  eyeWhite:   0xffffff,
  eyePupil:   0x4a3aff,   // binafsha/ko'k pupil (Steve xarakteristikasi)
  eyeBrow:    0x2a1800,

  // Ko'ylak (moviy-ko'k)
  shirt:      0x3ab8c8,   // yorqin moviy (rasmdagi rangga mos)
  shirtDark:  0x2898a8,
  shirtShad:  0x1a7888,

  // Soqol/yuz aksenti
  beard:      0xa05030,   // to'q sariq-jigarrang

  // Shim (binafsha)
  pants:      0x6a3ab8,   // binafsha (rasmdagi rangga mos)
  pantsDark:  0x502898,
  pantsShad:  0x3a1878,

  // Etik (kulrang)
  boot:       0x606060,
  bootDark:   0x404040,

  // Qo'l terisi
  armSkin:    0xc89060,
  armShad:    0xa87040,
};

function mat(hex, opts = {}) {
  return new THREE.MeshLambertMaterial({ color: hex, ...opts });
}

// Quticha yasovchi yordamchi: geo + material + pos + rot
function box(w, h, d, color, px=0, py=0, pz=0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat(color)
  );
  mesh.position.set(px, py, pz);
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Steve 3D modeli
// ─────────────────────────────────────────────────────────────────────────────
export class SteveModel {
  constructor(scene) {
    this.scene = scene;
    this._time = 0;

    // ROOT — barcha qismlar shu guruhga birikadi
    this.root = new THREE.Group();
    scene.add(this.root);

    this._buildHead();
    this._buildBody();
    this._buildArms();
    this._buildLegs();
  }

  // ── BOŠ ────────────────────────────────────────────────────────────────────
  _buildHead() {
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 1.55;
    this.root.add(this.headPivot);

    // Bosh asosi
    const head = box(0.5, 0.5, 0.5, C.skin);
    this.headPivot.add(head);

    // Soch — tepasi
    const hairTop = box(0.52, 0.08, 0.52, C.hair, 0, 0.27, 0);
    this.headPivot.add(hairTop);

    // Soch — orqa
    const hairBack = box(0.52, 0.44, 0.06, C.hair, 0, 0.02, -0.27);
    this.headPivot.add(hairBack);

    // Soch — yon tomonlar
    const hairL = box(0.06, 0.44, 0.52, C.hairMid, -0.27, 0.02, 0);
    const hairR = box(0.06, 0.44, 0.52, C.hairMid,  0.27, 0.02, 0);
    this.headPivot.add(hairL, hairR);

    // Soch — old pastki qism (peshona)
    const hairFront = box(0.52, 0.10, 0.04, C.hairMid, 0, 0.18, 0.26);
    this.headPivot.add(hairFront);

    // ── YUZ ──

    // Ko'zlar (chapdan qarash: chap = +x)
    // Ko'z: oq qism
    const eyeGeoW = new THREE.BoxGeometry(0.13, 0.10, 0.02);
    const eyeMatW = mat(C.eyeWhite);
    const eyeL = new THREE.Mesh(eyeGeoW, eyeMatW);
    eyeL.position.set(-0.11, 0.07, 0.251);
    const eyeR = new THREE.Mesh(eyeGeoW, eyeMatW);
    eyeR.position.set( 0.11, 0.07, 0.251);
    this.headPivot.add(eyeL, eyeR);

    // Ko'z: binafsha pupil
    const eyeGeoP = new THREE.BoxGeometry(0.07, 0.07, 0.022);
    const eyeMatP = mat(C.eyePupil);
    const pupilL = new THREE.Mesh(eyeGeoP, eyeMatP);
    pupilL.position.set(-0.11, 0.07, 0.252);
    const pupilR = new THREE.Mesh(eyeGeoP, eyeMatP);
    pupilR.position.set( 0.11, 0.07, 0.252);
    this.headPivot.add(pupilL, pupilR);

    // Qosh
    const browGeo = new THREE.BoxGeometry(0.15, 0.04, 0.022);
    const browMat = mat(C.eyeBrow);
    const browL = new THREE.Mesh(browGeo, browMat);
    browL.position.set(-0.11, 0.135, 0.252);
    const browR = new THREE.Mesh(browGeo, browMat);
    browR.position.set( 0.11, 0.135, 0.252);
    this.headPivot.add(browL, browR);

    // Burun
    const nose = box(0.06, 0.08, 0.04, C.skinDark, 0, -0.02, 0.265);
    this.headPivot.add(nose);

    // Og'iz / lab
    const mouth = box(0.16, 0.04, 0.022, C.beard, 0, -0.10, 0.252);
    this.headPivot.add(mouth);

    // Soqol / yuzdagi jigarrang aksent
    const beard1 = box(0.20, 0.06, 0.022, C.beard, 0, -0.15, 0.252);
    this.headPivot.add(beard1);

    // Yonoq ranglanishi (yon)
    const cheekL = box(0.04, 0.10, 0.06, C.skinDark, -0.24, -0.02, 0.22);
    const cheekR = box(0.04, 0.10, 0.06, C.skinDark,  0.24, -0.02, 0.22);
    this.headPivot.add(cheekL, cheekR);

    // Bosh yon tomonlari (qorong'i)
    const sideL = box(0.02, 0.50, 0.50, C.skinDark, -0.25, 0, 0);
    const sideR = box(0.02, 0.50, 0.50, C.skinDark,  0.25, 0, 0);
    this.headPivot.add(sideL, sideR);

    this.head = this.headPivot; // animatsiya uchun alias
  }

  // ── TAN (BODY) ──────────────────────────────────────────────────────────────
  _buildBody() {
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 1.00;
    this.root.add(this.bodyGroup);

    // Asosiy tana — moviy ko'ylak
    const body = box(0.46, 0.60, 0.26, C.shirt);
    this.bodyGroup.add(body);

    // Yon tomonlar — qorong'iroq
    const sideL = box(0.02, 0.60, 0.26, C.shirtDark, -0.24, 0, 0);
    const sideR = box(0.02, 0.60, 0.26, C.shirtDark,  0.24, 0, 0);
    this.bodyGroup.add(sideL, sideR);

    // Orqa — biroz qorong'i
    const back = box(0.46, 0.60, 0.02, C.shirtDark, 0, 0, -0.14);
    this.bodyGroup.add(back);

    // Shim chizig'i / bel
    const belt = box(0.47, 0.07, 0.28, C.pantsDark, 0, -0.27, 0);
    this.bodyGroup.add(belt);

    this.body = this.bodyGroup;
  }

  // ── QO'LLAR ─────────────────────────────────────────────────────────────────
  _buildArms() {
    const armW = 0.21, armH = 0.56, armD = 0.21;

    // O'ng qo'l (player uchun chap taraf — -x)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(-0.335, 1.27, 0);
    this.root.add(this.rightArmPivot);

    // Yeng (moviy) — yuqori qism
    const rSleeve = box(armW, armH * 0.55, armD, C.shirt, 0, -0.15, 0);
    this.rightArmPivot.add(rSleeve);

    // Teri — pastki qism (qo'l)
    const rArm = box(armW, armH * 0.45, armD, C.armSkin, 0, -0.45, 0);
    this.rightArmPivot.add(rArm);

    // Yon soya
    const rArmSide = box(0.02, armH, armD, C.armShad, -armW/2, -armH/2 + 0.28, 0);
    this.rightArmPivot.add(rArmSide);

    // Kaft
    const rHand = box(armW, 0.12, armD + 0.02, C.armSkin, 0, -0.66, 0);
    this.rightArmPivot.add(rHand);

    // Chap qo'l (+x)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(0.335, 1.27, 0);
    this.root.add(this.leftArmPivot);

    const lSleeve = box(armW, armH * 0.55, armD, C.shirt, 0, -0.15, 0);
    this.leftArmPivot.add(lSleeve);

    const lArm = box(armW, armH * 0.45, armD, C.armSkin, 0, -0.45, 0);
    this.leftArmPivot.add(lArm);

    const lArmSide = box(0.02, armH, armD, C.armShad, armW/2, -armH/2 + 0.28, 0);
    this.leftArmPivot.add(lArmSide);

    const lHand = box(armW, 0.12, armD + 0.02, C.armSkin, 0, -0.66, 0);
    this.leftArmPivot.add(lHand);
  }

  // ── OYOQLAR ─────────────────────────────────────────────────────────────────
  _buildLegs() {
    const legW = 0.22, legH = 0.58, legD = 0.22;

    // O'ng oyoq (-x)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(-0.115, 0.74, 0);
    this.root.add(this.rightLegPivot);

    const rLeg = box(legW, legH, legD, C.pants, 0, -legH/2, 0);
    this.rightLegPivot.add(rLeg);

    // Oyoq yon soyasi
    const rLegSide = box(0.02, legH, legD, C.pantsDark, -legW/2, -legH/2, 0);
    this.rightLegPivot.add(rLegSide);

    // Etik
    const rBoot = box(legW + 0.02, 0.15, legD + 0.04, C.boot, 0, -legH + 0.05, 0.01);
    this.rightLegPivot.add(rBoot);
    const rBootSide = box(0.02, 0.15, legD + 0.04, C.bootDark, -legW/2, -legH + 0.05, 0.01);
    this.rightLegPivot.add(rBootSide);

    // Chap oyoq (+x)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(0.115, 0.74, 0);
    this.root.add(this.leftLegPivot);

    const lLeg = box(legW, legH, legD, C.pants, 0, -legH/2, 0);
    this.leftLegPivot.add(lLeg);

    const lLegSide = box(0.02, legH, legD, C.pantsDark, legW/2, -legH/2, 0);
    this.leftLegPivot.add(lLegSide);

    const lBoot = box(legW + 0.02, 0.15, legD + 0.04, C.boot, 0, -legH + 0.05, 0.01);
    this.leftLegPivot.add(lBoot);
    const lBootSide = box(0.02, 0.15, legD + 0.04, C.bootDark, legW/2, -legH + 0.05, 0.01);
    this.leftLegPivot.add(lBootSide);
  }

  // ── UPDATE (har frame) ───────────────────────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);

    // Steve har doim kameraga orqa tomonini ko'rsatadi:
    // Camera Renderer.js da player orqasida turadi (yaw bo'yicha)
    // Shuning uchun model yaw yo'nalishida turishi kerak
    // +PI: model yuzi +Z da, kamera ham +Z orqasida → +PI bilan orqa ko'rinadi
    this.root.rotation.y = yaw + Math.PI;

    // Yurish animatsiyasi
    if (moving) {
      this._time += dt * 9;
    } else {
      // Sekin to'xtash
      if (Math.abs(Math.sin(this._time)) > 0.02) {
        this._time += dt * 6;
      }
    }

    const swing = moving ? Math.sin(this._time) * 0.65 : 0;

    // Qo'llar va oyoqlar qarama-qarshi tebranadi
    this.rightArmPivot.rotation.x =  swing;
    this.leftArmPivot.rotation.x  = -swing;
    this.rightLegPivot.rotation.x = -swing;
    this.leftLegPivot.rotation.x  =  swing;

    // Yurish paytida qo'llar biroz chetga ochiladi
    this.rightArmPivot.rotation.z = moving ? -0.06 : 0;
    this.leftArmPivot.rotation.z  = moving ?  0.06 : 0;

    // Bosh yuqori-pastga (bob) va yon (sway)
    const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.018 : 0;
    this.headPivot.position.y = 1.55 + bobY;

    // Tana biroz oldinga egiladi yurishda
    this.bodyGroup.rotation.x = moving ? 0.03 : 0;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  /**
   * Ghost mode: player tab yopilmagan lekin boshqa tabga o'tgan.
   * Barcha materiallar oq + yarim shaffof bo'ladi.
   */
  setGhost(isGhost) {
    if (this._isGhost === isGhost) return; // o'zgarmasa qayta render qilmaymiz
    this._isGhost = isGhost;
    this.root.traverse(obj => {
      if (!obj.isMesh) return;
      const mat = obj.material;
      if (!mat) return;
      if (isGhost) {
        // Asl rangni saqlaymiz
        if (!obj._origColor) obj._origColor = mat.color.clone();
        if (!obj._origOpacity) obj._origOpacity = mat.opacity ?? 1;
        if (!obj._origTransparent) obj._origTransparent = mat.transparent;
        mat.color.set(0xffffff);
        mat.transparent = true;
        mat.opacity = 0.35;
        mat.depthWrite = false;
      } else {
        // Asl rangga qaytaramiz
        if (obj._origColor) mat.color.copy(obj._origColor);
        mat.transparent = obj._origTransparent ?? false;
        mat.opacity = obj._origOpacity ?? 1;
        mat.depthWrite = true;
      }
      mat.needsUpdate = true;
    });
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
