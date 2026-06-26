import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SheepModel — GLB model + kod orqali oyoq animatsiyasi
//
//  GLB fayl: models/sheep.glb  (loyiha ildizida models/ papkasi)
//  Animatsiya yo'q — oyoqlar (leg1–leg4) va bosh kod orqali tebratiladi
// ─────────────────────────────────────────────────────────────────────────────

const SHEEP_SCALE = 0.18;    // GLB model o'lchami
const GLB_PATH    = 'models/sheep.glb';

const loader = new GLTFLoader();

// Bitta GLB ni barcha instance lar ulashadi (cache)
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
      err  => { console.error('[SheepModel] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

export class SheepModel {
  constructor(scene) {
    this.scene      = scene;
    this._ready     = false;
    this._time      = Math.random() * Math.PI * 2; // har qo'y boshqacha faza
    this._hurtFlash = false;
    this._moving    = false;

    // Oyoq va bosh node lari (yuklangandan keyin to'ldiriladi)
    this._legs = [];   // [{ node, sign }]  sign: +1 yoki -1 (qarama-qarshi juft)
    this._head = null;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      this._model = gltf.scene.clone(true);
      this._model.scale.setScalar(SHEEP_SCALE);

      // Pastki markaz hisoblash — oyoqlar yerda tursin
      const box = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -(box.min.y * SHEEP_SCALE);

      this.root.add(this._model);

      // Oyoq va bosh nodelarini topamiz
      // Node nomi 'leg1', 'leg2', 'leg3', 'leg4' va 'head' bilan boshlanadi
      this._model.traverse(obj => {
        const n = obj.name.toLowerCase();

        if (n.startsWith('leg1_1') || n.startsWith('leg3_1')) {
          // old chap + orqa o'ng — bitta guruh
          this._legs.push({ node: obj, sign: +1 });
        } else if (n.startsWith('leg2_1') || n.startsWith('leg4_1')) {
          // old o'ng + orqa chap — qarama-qarshi
          this._legs.push({ node: obj, sign: -1 });
        } else if (n.startsWith('head_1')) {
          this._head = obj;
        }
      });

      // Asl rotatsiyalarni saqlab olamiz
      this._legs.forEach(leg => {
        leg._origX = leg.node.rotation.x;
      });
      if (this._head) {
        this._head._origX = this._head.rotation.x;
        this._head._origY = this._head.rotation.y;
      }

      this._ready = true;

    } catch (e) {
      console.warn('[SheepModel] Yuklanishda xatolik, fallback ishlatiladi');
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    this._moving = moving;

    // Animatsiya timer
    if (moving) {
      this._time += dt * 7;
    } else {
      // Sekin to'xtash — nol ga yaqinlashganda to'xtatamiz
      if (Math.abs(Math.sin(this._time)) > 0.015) {
        this._time += dt * 4;
      }
    }

    const swing = moving
      ? Math.sin(this._time) * 0.45
      : Math.sin(this._time) * 0.08; // idle: ozgina sallanish

    // Oyoqlarni tebratish
    for (const leg of this._legs) {
      leg.node.rotation.x = (leg._origX || 0) + swing * leg.sign;
    }

    // Bosh animatsiyasi — yurish paytida biroz tebranadi
    if (this._head) {
      const headBob = moving
        ? Math.sin(this._time * 2) * 0.04
        : Math.sin(this._time * 0.8) * 0.02; // idle: sekin pastga-yuqoriga
      this._head.rotation.x = (this._head._origX || 0) + headBob - 0.12;
    }

    // Hurt flash
    if (this._hurtFlash) {
      this._applyHurt(true);
    } else {
      this._applyHurt(false);
    }
  }

  // ── Hurt flash ─────────────────────────────────────────────────────────────
  setHurt(isHurt) {
    if (this._hurtFlash === isHurt) return;
    this._hurtFlash = isHurt;
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

  // ── Fallback — GLB yuklanmasa ───────────────────────────────────────────
  _buildFallback() {
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };
    this.root.add(cube(0.70, 0.55, 1.00, 0xd0d0d0,  0, 0.65, 0));
    this.root.add(cube(0.38, 0.34, 0.42, 0x888070,  0, 0.78, 0.45));
    ['legFL','legFR','legBL','legBR'].forEach((name, i) => {
      const xOff = i % 2 === 0 ? -0.22 : 0.22;
      const zOff = i < 2 ? 0.30 : -0.30;
      this.root.add(cube(0.20, 0.42, 0.20, 0x888888, xOff, 0.38, zOff));
    });
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        Array.isArray(obj.material)
          ? obj.material.forEach(m => m.dispose())
          : obj.material?.dispose();
      }
    });
  }
}
