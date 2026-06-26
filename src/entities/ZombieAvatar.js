import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ZombieAvatar — GLB model + bosh burish + qo'l silkitish
// ─────────────────────────────────────────────────────────────────────────────

const ZOMBIE_SCALE = 0.25;   // Steve bilan bir xil kattalik
const GLB_PATH     = 'models/zombie.glb';

const loader = new GLTFLoader();

let _gltfCache   = null;
let _loadPromise = null;

function loadGLTF() {
  if (_gltfCache)   return Promise.resolve(_gltfCache);
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    loader.load(
      GLB_PATH,
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
    this._mixer     = null;
    this._actions   = {};
    this._moving    = false;
    this._hurtFlash = false;

    // Bosh va qo'l uchun referenslar
    this._headBone  = null;
    this._armLBone  = null;
    this._armRBone  = null;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      this._model = SkeletonUtils.clone(gltf.scene);
      this._model.scale.setScalar(ZOMBIE_SCALE);

      const box = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -box.min.y * ZOMBIE_SCALE;

      this.root.add(this._model);

      // Bosh va qo'l suyaklarini topamiz
      this._model.traverse(obj => {
        const n = obj.name.toLowerCase();
        if (!this._headBone && (n.includes('head') || n.includes('bosh'))) {
          this._headBone = obj;
        }
        if (!this._armLBone && (n.includes('arm') && (n.includes('l') || n.includes('left')))) {
          this._armLBone = obj;
        }
        if (!this._armRBone && (n.includes('arm') && (n.includes('r') || n.includes('right')))) {
          this._armRBone = obj;
        }
      });

      // AnimationMixer
      this._mixer = new THREE.AnimationMixer(this._model);

      const walkClip = THREE.AnimationClip.findByName(gltf.animations, 'z_armature|walk');
      const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'z_armature|t-pose');

      if (walkClip) {
        this._actions.walk = this._mixer.clipAction(walkClip);
        this._actions.walk.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (idleClip) {
        this._actions.idle = this._mixer.clipAction(idleClip);
        this._actions.idle.setLoop(THREE.LoopRepeat, Infinity);
      }

      this._playAction('idle');
      this._ready = true;

      if (this._hurtFlash) this._applyHurt(true);

    } catch (e) {
      console.warn('[ZombieAvatar] Yuklanishda xatolik, fallback ishlatiladi');
      this._buildFallback();
      this._ready = true;
    }
  }

  _playAction(name) {
    const next = this._actions[name];
    if (!next || this._currentAction === name) return;
    this._currentAction = name;

    for (const [key, action] of Object.entries(this._actions)) {
      if (key !== name && action.isRunning()) action.fadeOut(0.2);
    }
    next.reset().fadeIn(0.2).play();
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  // headYaw: bosh yon burish (±70°), headPitch: yuqori-pastga, attackAnim: qo'l silkitish
  update(x, y, z, yaw, moving, dt, headYaw = 0, headPitch = 0, attackAnim = 0) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    // Walk/Idle animatsiya
    if (moving !== this._moving) {
      this._moving = moving;
      this._playAction(moving ? 'walk' : 'idle');
    }

    if (this._mixer) this._mixer.update(dt);

    // ── Bosh burish ─────────────────────────────────────────────────────────
    if (this._headBone) {
      // Sekin-asta silliqlash (lerp)
      this._headBone.rotation.y = THREE.MathUtils.lerp(
        this._headBone.rotation.y, headYaw, 0.15
      );
      this._headBone.rotation.x = THREE.MathUtils.lerp(
        this._headBone.rotation.x, headPitch, 0.15
      );
    }

    // ── Qo'l silkitish (zarba animatsiyasi) ─────────────────────────────────
    if (this._armLBone && attackAnim > 0) {
      // Oldinga-orqaga tebranish
      const swing = Math.sin(attackAnim * Math.PI * 2) * 0.9;
      this._armLBone.rotation.x = -Math.PI * 0.4 + swing;
      if (this._armRBone) {
        this._armRBone.rotation.x = -Math.PI * 0.4 - swing * 0.5;
      }
    } else if (this._armLBone && attackAnim === 0) {
      // Animatsiya tugaganda qo'llarni asl holatga qaytarish
      this._armLBone.rotation.x = THREE.MathUtils.lerp(
        this._armLBone.rotation.x, -Math.PI * 0.4, 0.2
      );
      if (this._armRBone) {
        this._armRBone.rotation.x = THREE.MathUtils.lerp(
          this._armRBone.rotation.x, -Math.PI * 0.4, 0.2
        );
      }
    }
  }

  setHurt(isHurt) {
    if (this._hurtFlash === isHurt) return;
    this._hurtFlash = isHurt;
    if (this._ready) this._applyHurt(isHurt);
  }

  _applyHurt(on) {
    this.root.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      if (on) {
        if (!obj._origEmissive) obj._origEmissive = obj.material.emissive?.clone();
        obj.material.emissive?.set(0x661100);
      } else {
        if (obj._origEmissive) obj.material.emissive?.copy(obj._origEmissive);
        else obj.material.emissive?.set(0x000000);
      }
      obj.material.needsUpdate = true;
    });
  }

  // ─── Fallback model ───────────────────────────────────────────────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    // Tana
    this.root.add(cube(0.46, 0.60, 0.26, 0x1a3a6a, 0, 1.00, 0));

    // Bosh — headGroup ichida (burilishi uchun)
    this._headGroup = new THREE.Group();
    this._headGroup.position.set(0, 1.55, 0);
    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.50, 0.50),
      mat(0x5a7a4a)
    );
    this._headGroup.add(headMesh);
    this.root.add(this._headGroup);
    this._headBone = this._headGroup;

    // Qo'llar — Group ichida (silkitish uchun)
    this._armLGroup = new THREE.Group();
    this._armLGroup.position.set(-0.335, 1.00, 0);
    const lArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.56, 0.21),
      mat(0x5a7a4a)
    );
    lArmMesh.position.set(0, -0.28, 0);
    this._armLGroup.rotation.x = -Math.PI * 0.45;
    this._armLGroup.add(lArmMesh);
    this.root.add(this._armLGroup);
    this._armLBone = this._armLGroup;

    this._armRGroup = new THREE.Group();
    this._armRGroup.position.set(0.335, 1.00, 0);
    const rArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.56, 0.21),
      mat(0x5a7a4a)
    );
    rArmMesh.position.set(0, -0.28, 0);
    this._armRGroup.rotation.x = -Math.PI * 0.45;
    this._armRGroup.add(rArmMesh);
    this.root.add(this._armRGroup);
    this._armRBone = this._armRGroup;

    // Oyoqlar
    this.root.add(cube(0.22, 0.58, 0.22, 0x1c2e50, -0.115, 0.40, 0));
    this.root.add(cube(0.22, 0.58, 0.22, 0x1c2e50,  0.115, 0.40, 0));
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.scene.remove(this.root);
    if (this._mixer) this._mixer.stopAllAction();
    this.root.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  }
}
