import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ZombieAvatar — GLB model + walk animatsiyasi
//
//  GLB fayl: models/zombie.glb  (loyiha ildizida models/ papkasi)
//  Animatsiyalar: 'z_armature|walk'  — yurish
//                 'z_armature|t-pose' — turib turish
// ─────────────────────────────────────────────────────────────────────────────

const ZOMBIE_SCALE = 0.011;   // GLB model o'lchami (kichraytirish)
const GLB_PATH     = 'models/zombie.glb';

const loader = new GLTFLoader();

// Barcha ZombieAvatar instance lar bitta GLB ni ulashadi (cache)
let _gltfCache    = null;  // { scene, animations } — yuklangandan keyin
let _loadPromise  = null;  // loading davom etayotganda

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
    this.scene    = scene;
    this._ready   = false;
    this._mixer   = null;
    this._actions = {};   // { walk, idle }
    this._moving  = false;
    this._hurtFlash = false;

    // Placeholder — model yuklanguncha ko'rinmaydi
    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      // GLB scene ni clone qilamiz — har zombi o'z nusxasiga ega bo'lsin
      this._model = SkeletonUtils.clone(gltf.scene);
      this._model.scale.setScalar(ZOMBIE_SCALE);

      // Modelni pastki markazga joylash (oyoqlar yerda tursin)
      // GLB koordinatalarini tekshirib, Y offset topamiz
      const box = new THREE.Box3().setFromObject(this._model);
      const modelH = box.max.y - box.min.y;
      this._model.position.y = -box.min.y * ZOMBIE_SCALE;

      this.root.add(this._model);

      // AnimationMixer
      this._mixer = new THREE.AnimationMixer(this._model);

      // Animatsiyalarni topamiz
      const walkClip = THREE.AnimationClip.findByName(
        gltf.animations, 'z_armature|walk'
      );
      const idleClip = THREE.AnimationClip.findByName(
        gltf.animations, 'z_armature|t-pose'
      );

      if (walkClip) {
        this._actions.walk = this._mixer.clipAction(walkClip);
        this._actions.walk.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (idleClip) {
        this._actions.idle = this._mixer.clipAction(idleClip);
        this._actions.idle.setLoop(THREE.LoopRepeat, Infinity);
      }

      // Boshlang'ich holat — idle
      this._playAction('idle');
      this._ready = true;

      // Agar hurt bo'lgan bo'lsa, tezda qo'llaymiz
      if (this._hurtFlash) this._applyHurt(true);

    } catch (e) {
      console.warn('[ZombieAvatar] Yuklanishda xatolik, fallback model ishlatiladi');
      this._buildFallback();
      this._ready = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Animatsiya o'tish (crossfade)
  // ─────────────────────────────────────────────────────────────────────────
  _playAction(name) {
    const next = this._actions[name];
    if (!next) return;

    if (this._currentAction === name) return;
    this._currentAction = name;

    // Avvalgi actionni to'xtatamiz (crossfade)
    for (const [key, action] of Object.entries(this._actions)) {
      if (key !== name && action.isRunning()) {
        action.fadeOut(0.2);
      }
    }

    next.reset().fadeIn(0.2).play();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Update — har frameda Game/Renderer tomonidan chaqiriladi
  // ─────────────────────────────────────────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    // Animatsiya o'tish: walk ↔ idle
    if (moving !== this._moving) {
      this._moving = moving;
      this._playAction(moving ? 'walk' : 'idle');
    }

    // Mixer tick
    if (this._mixer) this._mixer.update(dt);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Hurt flash — zarba olganda qizil
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  //  Fallback — GLB yuklanmasa oddiy geometrik zombi ko'rinishi
  // ─────────────────────────────────────────────────────────────────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };
    // Tana
    this.root.add(cube(0.46, 0.60, 0.26, 0x1a3a6a,  0, 1.00, 0));
    // Bosh
    this.root.add(cube(0.50, 0.50, 0.50, 0x5a7a4a,  0, 1.55, 0));
    // Qo'llar — oldinga cho'zilgan
    const rArm = cube(0.21, 0.56, 0.21, 0x5a7a4a, -0.335, 1.00, 0);
    rArm.rotation.x = -Math.PI * 0.45;
    const lArm = cube(0.21, 0.56, 0.21, 0x5a7a4a,  0.335, 1.00, 0);
    lArm.rotation.x = -Math.PI * 0.45;
    this.root.add(rArm, lArm);
    // Oyoqlar
    this.root.add(cube(0.22, 0.58, 0.22, 0x1c2e50, -0.115, 0.40, 0));
    this.root.add(cube(0.22, 0.58, 0.22, 0x1c2e50,  0.115, 0.40, 0));
  }

  setVisible(v) {
    this.root.visible = v;
  }

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
