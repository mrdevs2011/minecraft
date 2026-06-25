import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

function mat(hex) {
  return new THREE.MeshLambertMaterial({ color: hex });
}

function box(w, h, d, color, px = 0, py = 0, pz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(px, py, pz);
  return mesh;
}

export class BaseAvatar {
  constructor(scene, C, opts = {}) {
    this.scene = scene;
    this._time = 0;
    this._C    = C;
    this._opts = { slimArms: false, hairLength: 'normal', ...opts };

    this.root = new THREE.Group();
    scene.add(this.root);
    this._isGhost = false;

    this._buildHead();
    this._buildBody();
    this._buildArms();
    this._buildLegs();
  }

  _buildHead() {
    const C = this._C;
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 1.55;
    this.root.add(this.headPivot);

    const head = box(0.5, 0.5, 0.5, C.skin);
    this.headPivot.add(head);

    const hairTop  = box(0.52, 0.08, 0.52, C.hair,    0,     0.27,  0);
    const hairBack = box(0.52, 0.44, 0.06, C.hair,    0,     0.02, -0.27);
    this.headPivot.add(hairTop, hairBack);

    const sideH = this._opts.hairLength === 'long' ? 0.56 : 0.44;
    const sideY = this._opts.hairLength === 'long' ? -0.04 : 0.02;
    const hairL = box(0.06, sideH, 0.52, C.hairMid, -0.27, sideY, 0);
    const hairR = box(0.06, sideH, 0.52, C.hairMid,  0.27, sideY, 0);
    this.headPivot.add(hairL, hairR);

    const hairFront = box(0.52, 0.10, 0.04, C.hairMid, 0, 0.18, 0.26);
    this.headPivot.add(hairFront);

    // ─── UZUN SOCH (Alex) — faqat yon tomonlar, orqa qismi YO‘Q ───
    if (this._opts.hairLength === 'long') {
      const llL = box(0.08, 0.20, 0.50, C.hair, -0.28, -0.08, 0);
      const llR = box(0.08, 0.20, 0.50, C.hair,  0.28, -0.08, 0);
      this.headPivot.add(llL, llR);
    }

    const eyeGW = new THREE.BoxGeometry(0.13, 0.10, 0.02);
    const eyeMW = mat(C.eyeWhite ?? 0xffffff);
    const eyeL = new THREE.Mesh(eyeGW, eyeMW); eyeL.position.set(-0.11, 0.07, 0.251);
    const eyeR = new THREE.Mesh(eyeGW, eyeMW); eyeR.position.set( 0.11, 0.07, 0.251);
    this.headPivot.add(eyeL, eyeR);

    const eyeGP = new THREE.BoxGeometry(0.07, 0.07, 0.022);
    const eyeMP = mat(C.eyePupil);
    const pupilL = new THREE.Mesh(eyeGP, eyeMP); pupilL.position.set(-0.11, 0.07, 0.252);
    const pupilR = new THREE.Mesh(eyeGP, eyeMP); pupilR.position.set( 0.11, 0.07, 0.252);
    this.headPivot.add(pupilL, pupilR);

    const browG = new THREE.BoxGeometry(0.15, 0.04, 0.022);
    const browM = mat(C.eyeBrow ?? 0x2a1800);
    const browL = new THREE.Mesh(browG, browM); browL.position.set(-0.11, 0.135, 0.252);
    const browR = new THREE.Mesh(browG, browM); browR.position.set( 0.11, 0.135, 0.252);
    this.headPivot.add(browL, browR);

    const nose = box(0.06, 0.08, 0.04, C.skinDark, 0, -0.02, 0.265);
    this.headPivot.add(nose);

    const mouth  = box(0.16, 0.04, 0.022, C.beard ?? C.skinDark, 0, -0.10, 0.252);
    const beard1 = box(0.20, 0.06, 0.022, C.beard ?? C.skinDark, 0, -0.15, 0.252);
    this.headPivot.add(mouth, beard1);

    const cheekL = box(0.04, 0.10, 0.06, C.skinDark, -0.24, -0.02, 0.22);
    const cheekR = box(0.04, 0.10, 0.06, C.skinDark,  0.24, -0.02, 0.22);
    this.headPivot.add(cheekL, cheekR);

    const sideL2 = box(0.02, 0.50, 0.50, C.skinDark, -0.25, 0, 0);
    const sideR2 = box(0.02, 0.50, 0.50, C.skinDark,  0.25, 0, 0);
    this.headPivot.add(sideL2, sideR2);

    this.head = this.headPivot;
  }

  _buildBody() {
    const C = this._C;
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 1.00;
    this.root.add(this.bodyGroup);

    const body = box(0.46, 0.60, 0.26, C.shirt);
    this.bodyGroup.add(body);

    const sideL = box(0.02, 0.60, 0.26, C.shirtDark, -0.24, 0, 0);
    const sideR = box(0.02, 0.60, 0.26, C.shirtDark,  0.24, 0, 0);
    const back  = box(0.46, 0.60, 0.02, C.shirtDark,  0, 0, -0.14);
    this.bodyGroup.add(sideL, sideR, back);

    const belt = box(0.47, 0.07, 0.28, C.pantsDark, 0, -0.27, 0);
    this.bodyGroup.add(belt);

    this.body = this.bodyGroup;
  }

  _buildArms() {
    const C    = this._C;
    const slim = this._opts.slimArms;
    // ─── MOJANG: keng qo‘l 0.25, yupqa qo‘l 0.18 ───
    const armW = slim ? 0.18 : 0.25;
    const armH = 0.58;
    const armD = slim ? 0.18 : 0.25;
    const armSkin = C.armSkin ?? C.skin;
    const armShad = C.armShad ?? C.skinDark;

    const shoulderX = 0.23 + armW / 2;

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(-shoulderX, 1.28, 0);
    this.root.add(this.rightArmPivot);

    const rSleeve  = box(armW, armH * 0.52, armD,        C.shirt,  0,        -(armH * 0.52) / 2,               0);
    const rArm     = box(armW, armH * 0.48, armD,        armSkin,  0,        -(armH * 0.52) - (armH * 0.48) / 2, 0);
    const rArmSide = box(0.02, armH,        armD,        armShad, -armW / 2, -armH / 2,                        0);
    const rHand    = box(armW, 0.10,        armD + 0.02, armSkin,  0,        -armH - 0.05,                     0);
    this.rightArmPivot.add(rSleeve, rArm, rArmSide, rHand);

    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(shoulderX, 1.28, 0);
    this.root.add(this.leftArmPivot);

    const lSleeve  = box(armW, armH * 0.52, armD,        C.shirt,  0,       -(armH * 0.52) / 2,               0);
    const lArm     = box(armW, armH * 0.48, armD,        armSkin,  0,       -(armH * 0.52) - (armH * 0.48) / 2, 0);
    const lArmSide = box(0.02, armH,        armD,        armShad,  armW / 2, -armH / 2,                        0);
    const lHand    = box(armW, 0.10,        armD + 0.02, armSkin,  0,       -armH - 0.05,                      0);
    this.leftArmPivot.add(lSleeve, lArm, lArmSide, lHand);
  }

  _buildLegs() {
    const C = this._C;
    const legW = 0.22, legH = 0.58, legD = 0.22;

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(-0.115, 0.74, 0);
    this.root.add(this.rightLegPivot);

    const rLeg     = box(legW, legH, legD,          C.pants,    0,          -legH / 2,      0);
    const rLegSide = box(0.02, legH, legD,          C.pantsDark, -legW / 2, -legH / 2,      0);
    const rBoot    = box(legW + 0.02, 0.15, legD + 0.04, C.boot, 0,        -legH + 0.05,  0.01);
    const rBootSide= box(0.02, 0.15, legD + 0.04,  C.bootDark,  -legW / 2, -legH + 0.05,  0.01);
    this.rightLegPivot.add(rLeg, rLegSide, rBoot, rBootSide);

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(0.115, 0.74, 0);
    this.root.add(this.leftLegPivot);

    const lLeg     = box(legW, legH, legD,          C.pants,    0,         -legH / 2,      0);
    const lLegSide = box(0.02, legH, legD,          C.pantsDark, legW / 2, -legH / 2,      0);
    const lBoot    = box(legW + 0.02, 0.15, legD + 0.04, C.boot, 0,       -legH + 0.05,  0.01);
    const lBootSide= box(0.02, 0.15, legD + 0.04,  C.bootDark,  legW / 2, -legH + 0.05,  0.01);
    this.leftLegPivot.add(lLeg, lLegSide, lBoot, lBootSide);
  }

  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (moving) {
      this._time += dt * 9;
    } else {
      if (Math.abs(Math.sin(this._time)) > 0.02) this._time += dt * 6;
    }

    const swing = moving ? Math.sin(this._time) * 0.65 : 0;

    this.rightArmPivot.rotation.x =  swing;
    this.leftArmPivot.rotation.x  = -swing;
    this.rightLegPivot.rotation.x = -swing;
    this.leftLegPivot.rotation.x  =  swing;

    this.rightArmPivot.rotation.z = moving ? -0.05 : 0;
    this.leftArmPivot.rotation.z  = moving ?  0.05 : 0;

    const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.018 : 0;
    this.headPivot.position.y = 1.55 + bobY;

    this.bodyGroup.rotation.x = moving ? 0.03 : 0;
  }

  setVisible(v) { this.root.visible = v; }

  setGhost(isGhost) {
    if (this._isGhost === !!isGhost) return;
    this._isGhost = !!isGhost;
    this.root.traverse(obj => {
      const mat = obj.material;
      if (!obj.isMesh || !mat) return;
      if (!obj.userData._ghostOrig) {
        obj.userData._ghostOrig = {
          color:       mat.color ? mat.color.clone() : null,
          opacity:     mat.opacity,
          transparent: mat.transparent,
        };
      }
      const orig = obj.userData._ghostOrig;
      if (this._isGhost) {
        mat.transparent = true;
        mat.opacity = 0.35;
        if (mat.color && orig.color) {
          mat.color.copy(orig.color).lerp(new THREE.Color(0xffffff), 0.6);
        }
      } else {
        mat.transparent = orig.transparent;
        mat.opacity = orig.opacity;
        if (mat.color && orig.color) mat.color.copy(orig.color);
      }
    });
  }

  dispose() { this.scene.remove(this.root); }
}