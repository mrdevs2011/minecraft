import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  AlexAvatar — alex.glb (slim arm player model)
//
//  alex.glb raw height: ~322 units → avtomatik scale → 1.8 blok (2 blok)
//  Tana kengligi ≈ 0.5 blok (1 blok)
//
//  Animatsiya node lari (skeleton bone lar):
//    Head_02    → bosh
//    Spine_01   → tana
//    LArm_04    → chap qo'l
//    RArm_06    → o'ng qo'l
//    LLeg_08    → chap oyoq
//    RLeg_010   → o'ng oyoq
// ─────────────────────────────────────────────────────────────────────────────

const ALEX_TARGET_H = 1.8;   // 2 blok balandlik
const GLB_PATH      = 'models/alex.glb';

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
      err  => { console.error('[AlexAvatar] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

export class AlexAvatar {
  constructor(scene) {
    this.scene    = scene;
    this._ready   = false;
    this._time    = 0;
    this._isGhost = false;

    this._head  = null;
    this._torso = null;
    this._armL  = null;
    this._armR  = null;
    this._legL  = null;
    this._legR  = null;
    this._origRot = null;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      this._model = SkeletonUtils.clone(gltf.scene);

      // Avval scale=1 bilan Box3 o'lchaymiz, keyin to'g'ri scale topamiz
      this._model.scale.setScalar(1);
      this.root.add(this._model);

      const rawBox   = new THREE.Box3().setFromObject(this._model);
      const rawH     = rawBox.max.y - rawBox.min.y;
      const autoScale = rawH > 0 ? ALEX_TARGET_H / rawH : 0.0056;

      this._model.scale.setScalar(autoScale);

      // Pastki markaz — oyoqlar yerda turadi
      const box = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -box.min.y;

      // Skeleton bone lari va mesh node larini topamiz
      // Skeleton bone lar animatsiya uchun, mesh node lar ko'rinish uchun
      this._model.traverse(obj => {
        switch (obj.name) {
          // Skeleton bone lar (animatsiya uchun — bular harakatlanadi)
          case 'Head_02':  this._head  = obj; break;
          case 'Spine_01': this._torso = obj; break;
          case 'LArm_04':  this._armL  = obj; break;
          case 'RArm_06':  this._armR  = obj; break;
          case 'LLeg_08':  this._legL  = obj; break;
          case 'RLeg_010': this._legR  = obj; break;
          // Fallback: mesh node lar
          case 'Object_7':  if (!this._head)  this._head  = obj; break;
          case 'Object_11': if (!this._torso) this._torso = obj; break;
          case 'Object_15': if (!this._armR)  this._armR  = obj; break;
          case 'Object_19': if (!this._armL)  this._armL  = obj; break;
          case 'Object_23': if (!this._legL)  this._legL  = obj; break;
          case 'Object_27': if (!this._legR)  this._legR  = obj; break;
        }
      });

      console.log('[AlexAvatar] Topilgan node lar:', {
        head:  this._head?.name,
        torso: this._torso?.name,
        armR:  this._armR?.name,
        armL:  this._armL?.name,
        legR:  this._legR?.name,
        legL:  this._legL?.name,
      });

      // Asl rotatsiya va pozitsiyalarni saqlaymiz
      this._origRot = {
        armL:    this._armL  ? this._armL.rotation.clone()   : new THREE.Euler(),
        armR:    this._armR  ? this._armR.rotation.clone()   : new THREE.Euler(),
        legL:    this._legL  ? this._legL.rotation.clone()   : new THREE.Euler(),
        legR:    this._legR  ? this._legR.rotation.clone()   : new THREE.Euler(),
        headPos: this._head  ? this._head.position.clone()   : new THREE.Vector3(),
      };

      this._ready = true;
      console.log('[AlexAvatar] tayyor, autoScale =', autoScale.toFixed(5));

    } catch (e) {
      console.warn('[AlexAvatar] GLB yuklanmadi, fallback:', e);
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── UPDATE (har frame) ────────────────────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    if (moving) {
      this._time += dt * 9;
    } else {
      if (Math.abs(Math.sin(this._time)) > 0.02) this._time += dt * 9;
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
      this._head.position.y = this._origRot.headPos.y + bobY;
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
        obj.userData._ghostOrig = {
          opacity:     mat.opacity,
          transparent: mat.transparent,
        };
      }
      const orig = obj.userData._ghostOrig;
      if (this._isGhost) {
        mat.transparent = true;
        mat.opacity = 0.35;
      } else {
        mat.transparent = orig.transparent;
        mat.opacity     = orig.opacity;
      }
      mat.needsUpdate = true;
    });
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    this._head  = cube(0.50, 0.50, 0.50, 0xe4ba82,   0,      1.55, 0);
    this._torso = cube(0.46, 0.60, 0.26, 0x4a8c3a,   0,      1.00, 0);
    this._armR  = cube(0.18, 0.58, 0.22, 0x4a8c3a,  -0.32,   1.00, 0);
    this._armL  = cube(0.18, 0.58, 0.22, 0x4a8c3a,   0.32,   1.00, 0);
    this._legR  = cube(0.22, 0.58, 0.22, 0x8a5c3a,  -0.115,  0.40, 0);
    this._legL  = cube(0.22, 0.58, 0.22, 0x8a5c3a,   0.115,  0.40, 0);

    this.root.add(this._head, this._torso, this._armR, this._armL, this._legR, this._legL);

    this._origRot = {
      armL:    new THREE.Euler(),
      armR:    new THREE.Euler(),
      legL:    new THREE.Euler(),
      legR:    new THREE.Euler(),
      headPos: new THREE.Vector3(0, 1.55, 0),
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
