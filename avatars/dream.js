import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  DreamAvatar — dream.glb (Dream Minecraft skin)
//
//  dream.glb raw height: ~2.047 units → scale 0.879 → 1.8 blok (Minecraft standard)
//
//  Node xaritasi (ota node → mesh node):
//    Head_2       → Object_6   (bosh)
//    Body_5       → Object_11  (tana)
//    Right Arm_8  → Object_16  (o'ng qo'l)
//    Left Arm_11  → Object_21  (chap qo'l)
//    Right Leg_15 → Object_26  (o'ng oyoq)
//    Left Leg_18  → Object_31  (chap oyoq)
//
//  Qatlam nodlari ham mavjud (Hat Layer, Body Layer, Arm Layer, Leg Layer)
//  Animatsiya ota nodlar (Head_2, Body_5, Right Arm_8...) orqali bajariladi.
// ─────────────────────────────────────────────────────────────────────────────

// Dream GLB raw height = 2.047 → scale 0.879 = ~1.8 blok
const DREAM_TARGET_H = 1.8;
const GLB_PATH       = 'models/dream.glb';

const _loader = new GLTFLoader();
let _gltfCache   = null;
let _loadPromise = null;

function loadGLTF() {
  if (_gltfCache)   return Promise.resolve(_gltfCache);
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    _loader.load(
      GLB_PATH,
      gltf => { _gltfCache = gltf; resolve(gltf); },
      undefined,
      err  => { console.error('[DreamAvatar] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

export class DreamAvatar {
  constructor(scene) {
    this.scene    = scene;
    this._ready   = false;
    this._time    = 0;
    this._isGhost = false;

    this._head  = null;
    this._torso = null;
    this._armR  = null;
    this._armL  = null;
    this._legR  = null;
    this._legL  = null;
    this._origRot = null;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      this._model = SkeletonUtils.clone(gltf.scene);

      // Avval scale=1 bilan Box3 o'lchaymiz
      this._model.scale.setScalar(1);
      this.root.add(this._model);

      const rawBox  = new THREE.Box3().setFromObject(this._model);
      const rawH    = rawBox.max.y - rawBox.min.y;
      const autoScale = rawH > 0 ? DREAM_TARGET_H / rawH : 0.879;

      this._model.scale.setScalar(autoScale);

      // Pastki markaz
      const box = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -box.min.y;

      // Ota animatsiya nodlarini topamiz
      this._model.traverse(obj => {
        switch (obj.name) {
          case 'Head_2':       this._head  = obj; break;  // bosh
          case 'Body_5':       this._torso = obj; break;  // tana
          case 'Right Arm_8':  this._armR  = obj; break;  // o'ng qo'l
          case 'Left Arm_11':  this._armL  = obj; break;  // chap qo'l
          case 'Right Leg_15': this._legR  = obj; break;  // o'ng oyoq
          case 'Left Leg_18':  this._legL  = obj; break;  // chap oyoq
        }
      });

      // Asl rotatsiyalarni saqlaymiz
      this._origRot = {
        armL:  this._armL?.rotation.clone()  ?? new THREE.Euler(),
        armR:  this._armR?.rotation.clone()  ?? new THREE.Euler(),
        legL:  this._legL?.rotation.clone()  ?? new THREE.Euler(),
        legR:  this._legR?.rotation.clone()  ?? new THREE.Euler(),
        headY: this._head?.position.y        ?? 0,
      };

      this._ready = true;
      console.log('[DreamAvatar] tayyor, autoScale =', autoScale.toFixed(4));

    } catch (e) {
      console.warn('[DreamAvatar] GLB yuklanmadi, fallback:', e);
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── UPDATE — Steve bilan bir xil logika ──────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    if (moving) {
      this._time += dt * 9;
    } else {
      if (Math.abs(Math.sin(this._time)) > 0.02) this._time += dt * 6;
    }

    const swing = moving ? Math.sin(this._time) * 0.65 : 0;

    if (this._armR) this._armR.rotation.x = this._origRot.armR.x + swing;
    if (this._armL) this._armL.rotation.x = this._origRot.armL.x - swing;
    if (this._legR) this._legR.rotation.x = this._origRot.legR.x - swing;
    if (this._legL) this._legL.rotation.x = this._origRot.legL.x + swing;

    if (this._armR) this._armR.rotation.z = moving ? -0.05 : 0;
    if (this._armL) this._armL.rotation.z = moving ?  0.05 : 0;

    if (this._head) {
      const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.018 : 0;
      this._head.position.y = this._origRot.headY + bobY;
    }

    if (this._torso) this._torso.rotation.x = moving ? 0.03 : 0;
  }

  setVisible(v) { this.root.visible = v; }

  // ── Ghost mode ────────────────────────────────────────────────────────────
  setGhost(isGhost) {
    if (this._isGhost === !!isGhost) return;
    this._isGhost = !!isGhost;

    this.root.traverse(obj => {
      const mat = obj.material;
      if (!obj.isMesh || !mat) return;
      if (!obj.userData._ghostOrig) {
        obj.userData._ghostOrig = { opacity: mat.opacity, transparent: mat.transparent };
      }
      const orig = obj.userData._ghostOrig;
      if (this._isGhost) {
        mat.transparent = true; mat.opacity = 0.35;
      } else {
        mat.transparent = orig.transparent; mat.opacity = orig.opacity;
      }
      mat.needsUpdate = true;
    });
  }

  // ── Fallback — yashil Dream rangi ────────────────────────────────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    this._head  = cube(0.50, 0.50, 0.50, 0x3ab83a,   0,      1.55, 0);
    this._torso = cube(0.46, 0.60, 0.26, 0xc0c0c0,   0,      1.00, 0);
    this._armR  = cube(0.22, 0.58, 0.22, 0x3ab83a,  -0.34,   1.00, 0);
    this._armL  = cube(0.22, 0.58, 0.22, 0x3ab83a,   0.34,   1.00, 0);
    this._legR  = cube(0.22, 0.58, 0.22, 0x101010,  -0.115,  0.40, 0);
    this._legL  = cube(0.22, 0.58, 0.22, 0x101010,   0.115,  0.40, 0);

    this.root.add(this._head, this._torso, this._armR, this._armL, this._legR, this._legL);

    this._origRot = {
      armL: new THREE.Euler(), armR: new THREE.Euler(),
      legL: new THREE.Euler(), legR: new THREE.Euler(),
      headY: 1.55,
    };
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
