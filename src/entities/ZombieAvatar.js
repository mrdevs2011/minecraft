import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ZombieAvatar — zombie.glb modeli, Steve kabi qo'l/oyoq animatsiyasi
//
//  zombie.glb node nomlari:
//    z_head   → bosh
//    z_body   → tana
//    z_arm_l  → chap qo'l
//    z_arm_r  → o'ng qo'l
//    z_leg_l  → chap oyoq
//    z_leg_r  → o'ng oyoq
// ─────────────────────────────────────────────────────────────────────────────

const ZOMBIE_SCALE = 0.25;   // Steve bilan bir xil: raw H=8, scale 0.25 → 2 blok balandlik
const GLB_PATH     = 'models/zombie.glb';

const _loader = new GLTFLoader();
let _gltfCache   = null;
let _loadPromise = null;

function loadGLTF() {
  if (_gltfCache)   return Promise.resolve(_gltfCache);
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    _loader.load(GLB_PATH,
      gltf => { _gltfCache = gltf; resolve(gltf); },
      undefined,
      err  => { console.error('[ZombieAvatar] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

export class ZombieAvatar {
  constructor(scene) {
    this.scene      = scene;
    this._ready     = false;
    this._time      = 0;
    this._moving    = false;
    this._hurtFlash = false;

    // Model qismlari (zombie.glb nodes)
    this._head  = null;
    this._body  = null;
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

      // SkeletonUtils.clone — skinned mesh uchun to'g'ri clone
      this._model = SkeletonUtils.clone(gltf.scene);
      this._model.scale.setScalar(ZOMBIE_SCALE);

      // Oyoqlar yerda tursin
      const box = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -box.min.y;

      this.root.add(this._model);

      // Node larni topamiz
      this._model.traverse(obj => {
        switch (obj.name) {
          case 'z_head':  this._head  = obj; break;
          case 'z_body':  this._body  = obj; break;
          case 'z_arm_l': this._armL  = obj; break;
          case 'z_arm_r': this._armR  = obj; break;
          case 'z_leg_l': this._legL  = obj; break;
          case 'z_leg_r': this._legR  = obj; break;
        }
      });

      // Asl rotatsiyalarni (GLB T-pose) saqlaymiz
      this._origRot = {
        armL:  this._armL ? this._armL.rotation.clone() : new THREE.Euler(),
        armR:  this._armR ? this._armR.rotation.clone() : new THREE.Euler(),
        legL:  this._legL ? this._legL.rotation.clone() : new THREE.Euler(),
        legR:  this._legR ? this._legR.rotation.clone() : new THREE.Euler(),
        head:  this._head ? this._head.rotation.clone() : new THREE.Euler(),
        headY: this._head ? this._head.position.y       : 0,
      };

      // GLB animatsiyalarini O'CHIRAMIZ — kod orqali boshqaramiz
      // (mixer ishlatmaymiz)

      this._ready = true;

    } catch (e) {
      console.warn('[ZombieAvatar] GLB yuklanmadi, fallback:', e);
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── UPDATE — har frameda Renderer tomonidan chaqiriladi ───────────────────
  // headYaw, headPitch: bosh burish (radians)
  // attackAnim: 0..1 — zarba silkitish sikli
  update(x, y, z, yaw, moving, dt, headYaw = 0, headPitch = 0, attackAnim = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    // ── Yurish vaqti ──────────────────────────────────────────────────────
    if (moving) {
      this._time += dt * 9;
    } else {
      // To'xtatganda animatsiya nolga yaqinlashadi
      if (Math.abs(Math.sin(this._time)) > 0.02) this._time += dt * 6;
    }

    const swing = moving ? Math.sin(this._time) * 0.65 : 0;

    // ── Oyoqlar tebranishi ────────────────────────────────────────────────
    if (this._legL) this._legL.rotation.x = (this._origRot.legL.x) + swing;
    if (this._legR) this._legR.rotation.x = (this._origRot.legR.x) - swing;

    // ── Qo'llar ───────────────────────────────────────────────────────────
    if (attackAnim > 0) {
      // Zarba: qo'llar oldinga-orqaga tez silkiydi
      const hit = Math.sin(attackAnim * Math.PI * 2) * 1.1;
      if (this._armL) this._armL.rotation.x = this._origRot.armL.x - Math.PI * 0.5 + hit;
      if (this._armR) this._armR.rotation.x = this._origRot.armR.x - Math.PI * 0.5 - hit * 0.5;
    } else {
      // Oddiy yurish — teskari oyoqlar bilan
      if (this._armL) this._armL.rotation.x = this._origRot.armL.x - swing;
      if (this._armR) this._armR.rotation.x = this._origRot.armR.x + swing;
    }

    // Qo'llar biroz tashqariga
    if (this._armL) this._armL.rotation.z = moving ?  0.05 : 0;
    if (this._armR) this._armR.rotation.z = moving ? -0.05 : 0;

    // ── Bosh burish — player tomonga ──────────────────────────────────────
    if (this._head) {
      this._head.rotation.y = THREE.MathUtils.lerp(
        this._head.rotation.y, this._origRot.head.y + headYaw, 0.12
      );
      this._head.rotation.x = THREE.MathUtils.lerp(
        this._head.rotation.x, this._origRot.head.x + headPitch, 0.12
      );

      // Bosh bob (yuqori-pastga sakrash)
      const bob = moving ? Math.abs(Math.sin(this._time * 2)) * 0.018 : 0;
      this._head.position.y = this._origRot.headY + bob;
    }

    // Tana biroz oldinga egiladi
    if (this._body) this._body.rotation.x = moving ? 0.05 : 0;
  }

  // ── Hurt flash ────────────────────────────────────────────────────────────
  setHurt(isHurt) {
    if (this._hurtFlash === isHurt) return;
    this._hurtFlash = isHurt;
    if (!this._ready) return;

    this.root.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      if (isHurt) {
        if (!obj._origEmissive) {
          obj._origEmissive = obj.material.emissive
            ? obj.material.emissive.clone()
            : new THREE.Color(0);
        }
        obj.material.emissive?.set(0x661100);
      } else {
        if (obj._origEmissive) obj.material.emissive?.copy(obj._origEmissive);
        else obj.material.emissive?.set(0x000000);
      }
      obj.material.needsUpdate = true;
    });
  }

  setVisible(v) { this.root.visible = v; }

  // ── Fallback ───────────────────────────────────────────────────────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    // Bosh
    this._head = new THREE.Group();
    this._head.position.set(0, 1.55, 0);
    this._head.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x4a7a3a)
    ));
    this.root.add(this._head);

    // Tana
    this._body = cube(0.46, 0.60, 0.26, 0x2a5a6a, 0, 1.00, 0);
    this.root.add(this._body);

    // Qo'llar
    this._armR = cube(0.22, 0.58, 0.22, 0x2a5a6a, -0.34, 1.00, 0);
    this._armL = cube(0.22, 0.58, 0.22, 0x2a5a6a,  0.34, 1.00, 0);
    this.root.add(this._armR, this._armL);

    // Oyoqlar
    this._legR = cube(0.22, 0.58, 0.22, 0x1a2a4a, -0.115, 0.40, 0);
    this._legL = cube(0.22, 0.58, 0.22, 0x1a2a4a,  0.115, 0.40, 0);
    this.root.add(this._legR, this._legL);

    this._origRot = {
      armL: new THREE.Euler(), armR: new THREE.Euler(),
      legL: new THREE.Euler(), legR: new THREE.Euler(),
      head: new THREE.Euler(), headY: 1.55,
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
