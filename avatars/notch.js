import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  NotchAvatar — notch.glb
//
//  GLB tahlili (python3 bilan o'lchangandi):
//    • Bitta mesh (Object_0) — qo'l/oyoq alohida node larda emas
//    • Model 90° burilgan holda eksport qilingan (Z o'qi yuqariga)
//    • Raw bounds: X[-1.5, 0.1] Y[0, 0.8] Z[0, 3.2]
//    • rotation.x = -PI/2 dan keyin: haqiqiy balandlik = Z = 3.2 units
//    • Scale = 1.8 / 3.2 = 0.5625  →  1.8 blok (Minecraft standart)
//    • 0.25 scale NOTO'G'RI bo'lar edi: 3.2 * 0.25 = 0.8 blok (juda kichik!)
//
//  Animatsiya: bitta mesh bo'lgani uchun "idle bob" (yuqori-pastga tebranish)
//  va "walk tilt" (oldinga engashish) qo'llanadi — qo'l/oyoq alohida harakati yo'q.
// ─────────────────────────────────────────────────────────────────────────────

// notch.glb: rotation.x=-PI/2 dan keyin h=3.2, target=1.8 blok
const NOTCH_TARGET_H = 1.8;
const GLB_PATH       = 'models/notch.glb';

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
      err  => { console.error('[NotchAvatar] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

export class NotchAvatar {
  constructor(scene) {
    this.scene    = scene;
    this._ready   = false;
    this._time    = 0;
    this._isGhost = false;

    // Bitta mesh bo'lgani uchun faqat root ga bob/tilt qo'llaymiz
    this._model   = null;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      this._model = SkeletonUtils.clone(gltf.scene);

      // ── 1. Rotatsiyani tuzatish ──────────────────────────────────────────
      // notch.glb Z o'qi yuqariga eksport qilingan → -90° buramiz
      this._model.rotation.x = -Math.PI / 2;

      // ── 2. Scale: rotation.x tuzatgandan keyin Box3 hisoblash ───────────
      // Avval scale=1 bilan sahna ga qo'shamiz va Box3 o'lchaymiz
      this._model.scale.setScalar(1);
      this.root.add(this._model);

      // Box3 world bounds (rotation tuzatilgan holda)
      const rawBox = new THREE.Box3().setFromObject(this._model);
      const rawH   = rawBox.max.y - rawBox.min.y;      // rotation dan keyin haqiqiy Y balandligi

      // Scale: 1.8 blok bo'lsin
      const autoScale = rawH > 0 ? NOTCH_TARGET_H / rawH : 0.5625;
      this._model.scale.setScalar(autoScale);

      // ── 3. Markazlashtirish (X o'qi) va oyoqlarni yerga tushirish ───────
      const box = new THREE.Box3().setFromObject(this._model);

      // Model X markazi noto'g'ri (-0.7 ~ 0.1 o'rniga 0 bo'lishi kerak)
      const centerX = (box.min.x + box.max.x) / 2;
      this._model.position.x = -centerX;

      // Oyoqlar yerda (Y=0)
      this._model.position.y = -box.min.y;

      // Z ham markazlashtirish (depth markazini 0 ga)
      const centerZ = (box.min.z + box.max.z) / 2;
      this._model.position.z = -centerZ;

      this._ready = true;
      console.log(
        '[NotchAvatar] tayyor | autoScale =', autoScale.toFixed(4),
        '| rawH =', rawH.toFixed(4),
        '| finalH =', (rawH * autoScale).toFixed(3), 'blok'
      );

    } catch (e) {
      console.warn('[NotchAvatar] GLB yuklanmadi, fallback:', e);
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  // Bitta mesh bo'lgani uchun butun model "idle bob" + "walk tilt" animatsiyasi
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready || !this._model) return;

    if (moving) {
      this._time += dt * 9;
    } else {
      if (Math.abs(Math.sin(this._time)) > 0.02) this._time += dt * 9;
    }

    // Idle: model yuqori-pastga biroz sakrab turadi (bob)
    const bobY   = moving
      ? Math.abs(Math.sin(this._time * 2)) * 0.05   // yurish paytida kuchli bob
      : Math.sin(this._time * 1.2) * 0.015;         // turganida yengil nafas

    // Yurish: oldinga biroz engashish
    const tiltX  = moving ? 0.08 : 0;

    // Bob: model.position.y ni dastlabki -box.min.y dan ozroq ko'tarish
    // position.y ni to'g'ridan-to'g'ri o'zgartiramiz (load da box center set qilindi)
    // _baseY ni saqlaymiz
    if (this._baseY === undefined) {
      this._baseY = this._model.position.y;
    }
    this._model.position.y = this._baseY + bobY;
    this._model.rotation.x = -Math.PI / 2 + tiltX;  // dastlabki -PI/2 + tilt
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
        mat.opacity = orig.opacity;
      }
      mat.needsUpdate = true;
    });
  }

  // ── Fallback — Notch ranglari (jigarrang va yashil) ──────────────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    // Notch - katta bosh, soqol, yashil ko'ylak
    const head  = cube(0.52, 0.52, 0.52, 0xd4a06a,   0,      1.58, 0);
    const torso = cube(0.50, 0.62, 0.28, 0x4a7a3a,   0,      1.00, 0);
    const armR  = cube(0.28, 0.60, 0.24, 0x4a7a3a,  -0.39,   1.00, 0);
    const armL  = cube(0.28, 0.60, 0.24, 0x4a7a3a,   0.39,   1.00, 0);
    const legR  = cube(0.26, 0.60, 0.24, 0x5a3a2a,  -0.13,   0.40, 0);
    const legL  = cube(0.26, 0.60, 0.24, 0x5a3a2a,   0.13,   0.40, 0);

    this.root.add(head, torso, armR, armL, legR, legL);
    this._model = this.root; // fallback da root ni model sifatida ishlatamiz

    this._baseY = 0;
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
