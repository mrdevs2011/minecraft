import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
//  BaseAvatar — Steve GLB model asosida barcha 8 avatar
//
//  GLB fayl: models/steve.glb
//  Node nomlar: steve_head, steve_torso, steve_arm_left, steve_arm_right,
//               steve_leg_left, steve_leg_right
//
//  Har avatar o'zining ranglar (C) ob'ektini beradi.
//  GLB teksturasi o'chiriladi → rang kod orqali beriladi.
// ─────────────────────────────────────────────────────────────────────────────

const GLB_PATH   = 'models/steve.glb?v=2';
const STEVE_SCALE = 0.25;   // xom model: balandlik=8, kenglik(qo'llar bilan)=4 birlik
                              // → 0.25 scale: balandlik=2 blok, kenglik=1 blok

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
      err  => { console.error('[BaseAvatar] GLB yuklanmadi:', err); reject(err); }
    );
  });
  return _loadPromise;
}

// ─── Yangi steve.glb (textured, skeleton yo'q) — node nomlari ────────────────
//  Object_4  → bosh (head)
//  Object_6  → tana (torso)
//  Object_8  → o'ng qo'l (arm right)
//  Object_12 → chap qo'l (arm left)
//  Object_10 → chap oyoq (leg left)
//  Object_14 → o'ng oyoq (leg right)
//
//  Bu model o'z teksturasiga ega — rang bilan qoplanmaydi (ONLY_STEVE_MODE
//  paytida original ko'rinishi saqlanishi kerak).
const NODE_NAME_MAP = {
  head:    'Object_4',
  torso:   'Object_6',
  armR:    'Object_8',
  armL:    'Object_12',
  legL:    'Object_10',
  legR:    'Object_14',
};

export class BaseAvatar {
  constructor(scene, C, opts = {}) {
    this.scene  = scene;
    this._C     = C;
    this._opts  = { slimArms: false, hairLength: 'normal', ...opts };
    this._time  = 0;
    this._isGhost = false;
    this._ready = false;

    // Part node havolalari (yuklagandan keyin to'ldiriladi)
    this._head     = null;
    this._torso    = null;
    this._armL     = null;
    this._armR     = null;
    this._legL     = null;
    this._legR     = null;

    this.root = new THREE.Group();
    scene.add(this.root);

    this._load();
  }

  async _load() {
    try {
      const gltf = await loadGLTF();

      this._model = SkeletonUtils.clone(gltf.scene);
      this._model.scale.setScalar(STEVE_SCALE);

      // Pastki markaz hisoblash
      const bbox = new THREE.Box3().setFromObject(this._model);
      this._model.position.y = -bbox.min.y;

      this.root.add(this._model);

      // Node larni topamiz (yangi steve.glb — Object_4/6/8/10/12/14 nomlari)
      this._model.traverse(obj => {
        switch (obj.name) {
          case NODE_NAME_MAP.head:  this._head  = obj; break;
          case NODE_NAME_MAP.torso: this._torso = obj; break;
          case NODE_NAME_MAP.armR:  this._armR  = obj; break;
          case NODE_NAME_MAP.armL:  this._armL  = obj; break;
          case NODE_NAME_MAP.legL:  this._legL  = obj; break;
          case NODE_NAME_MAP.legR:  this._legR  = obj; break;
        }
      });

      // Original teksturani saqlaymiz — rang bilan qoplamaymiz
      // (ONLY_STEVE_MODE: model o'zining haqiqiy ko'rinishida bo'lishi kerak)

      // Asl rotatsiyalarni saqlaymiz (GLB posed bo'lishi mumkin)
      this._origRot = {
        armL: this._armL?.rotation.clone(),
        armR: this._armR?.rotation.clone(),
        legL: this._legL?.rotation.clone(),
        legR: this._legR?.rotation.clone(),
        head: this._head?.position.clone(),
      };

      this._ready = true;

    } catch (e) {
      console.warn('[BaseAvatar] GLB yuklanmadi, fallback ishlatiladi');
      this._buildFallback();
      this._ready = true;
    }
  }

  // ── Rang qo'llash ──────────────────────────────────────────────────────────
  _applyColors() {
    const C = this._C;

    // Har node ga rang berish
    const setNodeColor = (node, color) => {
      if (!node) return;
      node.traverse(obj => {
        if (!obj.isMesh) return;
        // Material klonlaymiz — boshqa avatarlar bilan aralashmasin
        obj.material = obj.material.clone();
        obj.material.color.set(color);
        obj.material.map = null; // teksturani o'chiramiz
        obj.material.needsUpdate = true;
      });
    };

    setNodeColor(this._head,  C.skin);
    setNodeColor(this._torso, C.shirt);
    setNodeColor(this._armL,  C.shirt);
    setNodeColor(this._armR,  C.shirt);
    setNodeColor(this._legL,  C.pants);
    setNodeColor(this._legR,  C.pants);
  }

  // ── UPDATE (har frame) ────────────────────────────────────────────────────
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

    // Qo'llar va oyoqlar tebranishi
    if (this._armR) this._armR.rotation.x = (this._origRot?.armR?.x ?? 0) + swing;
    if (this._armL) this._armL.rotation.x = (this._origRot?.armL?.x ?? 0) - swing;
    if (this._legR) this._legR.rotation.x = (this._origRot?.legR?.x ?? 0) - swing;
    if (this._legL) this._legL.rotation.x = (this._origRot?.legL?.x ?? 0) + swing;

    // Qo'llar biroz tashqariga
    if (this._armR) this._armR.rotation.z = moving ? -0.05 : 0;
    if (this._armL) this._armL.rotation.z = moving ?  0.05 : 0;

    // Bosh bob (yuqori-pastga)
    if (this._head) {
      const bobY = moving ? Math.abs(Math.sin(this._time * 2)) * 0.018 : 0;
      this._head.position.y = (this._origRot?.head?.y ?? this._head.position.y) + bobY;
    }

    // Tana biroz oldinga egiladi
    if (this._torso) this._torso.rotation.x = moving ? 0.03 : 0;
  }

  setVisible(v) { this.root.visible = v; }

  // ── 1st-person rejim — faqat qo'llar ko'rinadi (boshqa qismlar yashiriladi) ──
  setFirstPersonMode(active) {
    if (this._head)  this._head.visible  = !active;
    if (this._torso) this._torso.visible = !active;
    if (this._legL)  this._legL.visible  = !active;
    if (this._legR)  this._legR.visible  = !active;
    // Qo'llar har doim ko'rinadi (1st-personda ham, 3rd-personda ham)
    if (this._armL)  this._armL.visible  = true;
    if (this._armR)  this._armR.visible  = true;
  }

  // ── Ghost mode ─────────────────────────────────────────────────────────────
  setGhost(isGhost) {
    if (this._isGhost === !!isGhost) return;
    this._isGhost = !!isGhost;

    this.root.traverse(obj => {
      const mat = obj.material;
      if (!obj.isMesh || !mat) return;

      if (!obj.userData._ghostOrig) {
        obj.userData._ghostOrig = {
          color:       mat.color?.clone(),
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
      mat.needsUpdate = true;
    });
  }

  // ── Fallback — GLB yuklanmasa ──────────────────────────────────────────────
  _buildFallback() {
    const C   = this._C;
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const cube = (w, h, d, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      return m;
    };

    // Bosh
    const head = cube(0.50, 0.50, 0.50, C.skin, 0, 1.55, 0);
    this.root.add(head);
    this._head = head;

    // Tana
    const torso = cube(0.46, 0.60, 0.26, C.shirt, 0, 1.00, 0);
    this.root.add(torso);
    this._torso = torso;

    // Qo'llar
    this._armR = cube(0.22, 0.58, 0.22, C.shirt, -0.34, 1.00, 0);
    this._armL = cube(0.22, 0.58, 0.22, C.shirt,  0.34, 1.00, 0);
    this.root.add(this._armR, this._armL);

    // Oyoqlar
    this._legR = cube(0.22, 0.58, 0.22, C.pants, -0.115, 0.40, 0);
    this._legL = cube(0.22, 0.58, 0.22, C.pants,  0.115, 0.40, 0);
    this.root.add(this._legR, this._legL);

    this._origRot = {
      armL: new THREE.Euler(), armR: new THREE.Euler(),
      legL: new THREE.Euler(), legR: new THREE.Euler(),
      head: head.position.clone(),
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
