import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SteveAvatar — steve.glb (blocky player model)
//
//  steve.glb raw height: 2.0 units → scale 0.9 → 1.8 blok (Minecraft standard)
//  2 blok baland, 1 blok keng
//
//  Node xaritasi (GLB da parent wrapper → child mesh):
//    Cube_0     → Object_4   (bosh)
//    Cube.001_1 → Object_6   (tana)
//    Cube.003_2 → Object_8   (o'ng qo'l)
//    Cube.004_3 → Object_10  (chap qo'l)
//    Cube.006_4 → Object_12  (o'ng oyoq)
//    Cube.005_5 → Object_14  (chap oyoq)
//
//  Animatsiya uchun PARENT wrapper larga rotatsiya beramiz —
//  child mesh ular bilan birga aylanadi.
// ─────────────────────────────────────────────────────────────────────────────

// GLB raw: balandlik = 2.0 birlik, kenglik (tana) = 1.0 birlik
// scale 0.9 → 1.8 blok baland, 0.9 blok keng ≈ Minecraft proporsiya
const STEVE_SCALE = 0.9;
const GLB_PATH    = 'models/steve.glb';

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
      err  => { console.error('[SteveAvatar] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

export class SteveAvatar {
  constructor(scene) {
    this.scene    = scene;
    this._ready   = false;
    this._time    = 0;
    this._isGhost = false;

    // Parent wrapper node lar (rotatsiya shu larga beriladi)
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
      this._model.scale.setScalar(STEVE_SCALE);

      // Pastki markaz — oyoqlar yerda turadi
      const box = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -box.min.y;

      this.root.add(this._model);

      // Node larni topamiz — parent wrapper larga rotatsiya beramiz
      // Agar parent topilmasa child mesh ni ham qabul qilamiz (fallback)
      this._model.traverse(obj => {
        switch (obj.name) {
          // Parent wrapper lar (animatsiya uchun)
          case 'Cube_0':     this._head  = obj; break;
          case 'Cube.001_1': this._torso = obj; break;
          case 'Cube.003_2': this._armR  = obj; break;
          case 'Cube.004_3': this._armL  = obj; break;
          case 'Cube.006_4': this._legR  = obj; break;
          case 'Cube.005_5': this._legL  = obj; break;
          // Fallback: agar parent topilmasa, child mesh larni ishlatamiz
          case 'Object_4':   if (!this._head)  this._head  = obj; break;
          case 'Object_6':   if (!this._torso) this._torso = obj; break;
          case 'Object_8':   if (!this._armR)  this._armR  = obj; break;
          case 'Object_10':  if (!this._armL)  this._armL  = obj; break;
          case 'Object_12':  if (!this._legR)  this._legR  = obj; break;
          case 'Object_14':  if (!this._legL)  this._legL  = obj; break;
        }
      });

      console.log('[SteveAvatar] Topilgan node lar:', {
        head:  this._head?.name,
        torso: this._torso?.name,
        armR:  this._armR?.name,
        armL:  this._armL?.name,
        legR:  this._legR?.name,
        legL:  this._legL?.name,
      });

      // Asl rotatsiya va pozitsiyalarni saqlaymiz
      this._origRot = {
        armL:  this._armL  ? this._armL.rotation.clone()  : new THREE.Euler(),
        armR:  this._armR  ? this._armR.rotation.clone()  : new THREE.Euler(),
        legL:  this._legL  ? this._legL.rotation.clone()  : new THREE.Euler(),
        legR:  this._legR  ? this._legR.rotation.clone()  : new THREE.Euler(),
        headPos: this._head ? this._head.position.clone() : new THREE.Vector3(),
      };

      this._ready = true;
      console.log('[SteveAvatar] tayyor, scale =', STEVE_SCALE);

    } catch (e) {
      console.warn('[SteveAvatar] GLB yuklanmadi, fallback:', e);
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── UPDATE (har frame chaqiriladi) ───────────────────────────────────────
  update(x, y, z, yaw, moving, dt) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (!this._ready) return;

    // Vaqt hisoblagichi — yurayotganda tez, to'xtayotganda sekin to'xtaydi
    if (moving) {
      this._time += dt * 9;
    } else {
      // Animatsiya "natural" to'xtashi uchun — nolga yaqinlashganda sekinlashadi
      if (Math.abs(Math.sin(this._time)) > 0.02) {
        this._time += dt * 9; // bir xil tezlik — cycle tugashiga qadar
      }
    }

    // Qo'l va oyoq swing amplitudasi
    const swing = moving ? Math.sin(this._time) * 0.65 : 0;

    // O'ng qo'l va chap oyoq bir yo'nalishda, chap qo'l va o'ng oyoq teskari
    if (this._armR) this._armR.rotation.x = this._origRot.armR.x + swing;
    if (this._armL) this._armL.rotation.x = this._origRot.armL.x - swing;
    if (this._legR) this._legR.rotation.x = this._origRot.legR.x - swing;
    if (this._legL) this._legL.rotation.x = this._origRot.legL.x + swing;

    // Qo'llar yurganda biroz tashqariga chiqadi
    if (this._armR) this._armR.rotation.z = moving ? -0.05 : 0;
    if (this._armL) this._armL.rotation.z = moving ?  0.05 : 0;

    // Bosh yuqori-pastga "bob" effekti
    if (this._head) {
      const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.018 : 0;
      this._head.position.y = this._origRot.headPos.y + bobY;
    }

    // Tana yurganda ozgina oldinga egiladi
    if (this._torso) this._torso.rotation.x = moving ? 0.03 : 0;
  }

  setVisible(v) { this.root.visible = v; }

  // ── Ghost mode (shaffof ko'rinish) ───────────────────────────────────────
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

  // ── Fallback — GLB yuklanmasa oddiy kubl modelini yaratamiz ─────────────
  _buildFallback() {
    const mat  = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    // O'lchamlar: balandlik = 1.8 blok (2 blok), kenglik = 0.6 blok (1 blok)
    this._head  = cube(0.50, 0.50, 0.50, 0xc78c58,   0,      1.55, 0);
    this._torso = cube(0.50, 0.60, 0.26, 0x3ab8c8,   0,      1.00, 0);
    this._armR  = cube(0.26, 0.58, 0.22, 0x3ab8c8,  -0.38,   1.00, 0);
    this._armL  = cube(0.26, 0.58, 0.22, 0x3ab8c8,   0.38,   1.00, 0);
    this._legR  = cube(0.26, 0.58, 0.22, 0x6a3ab8,  -0.13,   0.40, 0);
    this._legL  = cube(0.26, 0.58, 0.22, 0x6a3ab8,   0.13,   0.40, 0);

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

// Renderer.js "SteveModel" nomi bilan import qiladi
export { SteveAvatar as SteveModel };
