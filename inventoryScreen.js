import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ─── Item colour / shape catalogue ───────────────────────────────────────────
// For non-block items we define a colour + shape so we can draw them in 3D
const ITEM_META = {
  // materials
  coal:           { color: 0x1a1a1a, shape: 'nugget' },
  charcoal:       { color: 0x2a2010, shape: 'nugget' },
  iron_ingot:     { color: 0xd5d5d5, shape: 'ingot'  },
  gold_ingot:     { color: 0xf1c40f, shape: 'ingot'  },
  diamond:        { color: 0x5dade2, shape: 'gem'    },
  emerald:        { color: 0x2ecc71, shape: 'gem'    },
  lapis_lazuli:   { color: 0x154360, shape: 'gem'    },
  stick:          { color: 0xc8a96a, shape: 'stick'  },
  string:         { color: 0xf0f0f0, shape: 'stick'  },
  feather:        { color: 0xf8f8f0, shape: 'stick'  },
  flint:          { color: 0x555555, shape: 'gem'    },
  bone:           { color: 0xf0ead6, shape: 'stick'  },
  bone_meal:      { color: 0xffffff, shape: 'nugget' },
  leather:        { color: 0xa0522d, shape: 'flat'   },
  paper:          { color: 0xfffde7, shape: 'flat'   },
  book:           { color: 0xd2a679, shape: 'flat'   },
  clay_ball:      { color: 0x9daab3, shape: 'nugget' },
  brick:          { color: 0x8b3a3a, shape: 'flat'   },
  raw_iron:       { color: 0xa97c50, shape: 'nugget' },
  raw_gold:       { color: 0xd4ac0d, shape: 'nugget' },
  raw_copper:     { color: 0xb87333, shape: 'nugget' },
  copper_ingot:   { color: 0xb87333, shape: 'ingot'  },
  amethyst_shard: { color: 0x9b59b6, shape: 'gem'    },
  // combat
  wooden_sword:   { color: 0xc8a96a, shape: 'sword'  },
  stone_sword:    { color: 0x8c8c8c, shape: 'sword'  },
  iron_sword:     { color: 0xd5d5d5, shape: 'sword'  },
  gold_sword:     { color: 0xf1c40f, shape: 'sword'  },
  diamond_sword:  { color: 0x5dade2, shape: 'sword'  },
  copper_sword:   { color: 0xb87333, shape: 'sword'  },
  bow:            { color: 0xc8a96a, shape: 'bow'    },
  crossbow:       { color: 0x8b6343, shape: 'bow'    },
  arrow:          { color: 0xc8a96a, shape: 'stick'  },
  shield:         { color: 0xd5d5d5, shape: 'flat'   },
  // tools
  wooden_pickaxe: { color: 0xc8a96a, shape: 'pickaxe'},
  stone_pickaxe:  { color: 0x8c8c8c, shape: 'pickaxe'},
  iron_pickaxe:   { color: 0xd5d5d5, shape: 'pickaxe'},
  gold_pickaxe:   { color: 0xf1c40f, shape: 'pickaxe'},
  diamond_pickaxe:{ color: 0x5dade2, shape: 'pickaxe'},
  copper_pickaxe: { color: 0xb87333, shape: 'pickaxe'},
  wooden_axe:     { color: 0xc8a96a, shape: 'axe'   },
  stone_axe:      { color: 0x8c8c8c, shape: 'axe'   },
  iron_axe:       { color: 0xd5d5d5, shape: 'axe'   },
  diamond_axe:    { color: 0x5dade2, shape: 'axe'   },
  wooden_shovel:  { color: 0xc8a96a, shape: 'shovel' },
  stone_shovel:   { color: 0x8c8c8c, shape: 'shovel' },
  iron_shovel:    { color: 0xd5d5d5, shape: 'shovel' },
  diamond_shovel: { color: 0x5dade2, shape: 'shovel' },
  flint_and_steel:{ color: 0xd5d5d5, shape: 'flat'  },
  fishing_rod:    { color: 0xc8a96a, shape: 'stick'  },
  shears:         { color: 0xd5d5d5, shape: 'flat'   },
  compass:        { color: 0xd5d5d5, shape: 'flat'   },
  clock:          { color: 0xd4ac0d, shape: 'flat'   },
  spyglass:       { color: 0xd5d5d5, shape: 'stick'  },
  brush:          { color: 0xc8a96a, shape: 'stick'  },
  name_tag:       { color: 0xf0f0f0, shape: 'flat'   },
  lead:           { color: 0x808080, shape: 'stick'  },
  // armor
  leather_helmet: { color: 0xa0522d, shape: 'helmet' },
  leather_chest:  { color: 0xa0522d, shape: 'chest'  },
  leather_legs:   { color: 0xa0522d, shape: 'legs'   },
  leather_boots:  { color: 0xa0522d, shape: 'boots'  },
  iron_helmet:    { color: 0xd5d5d5, shape: 'helmet' },
  iron_chest:     { color: 0xd5d5d5, shape: 'chest'  },
  iron_legs:      { color: 0xd5d5d5, shape: 'legs'   },
  iron_boots:     { color: 0xd5d5d5, shape: 'boots'  },
  diamond_helmet: { color: 0x5dade2, shape: 'helmet' },
  diamond_chest:  { color: 0x5dade2, shape: 'chest'  },
  diamond_legs:   { color: 0x5dade2, shape: 'legs'   },
  diamond_boots:  { color: 0x5dade2, shape: 'boots'  },
  // food
  apple:          { color: 0xe74c3c, shape: 'apple'  },
  golden_apple:   { color: 0xf1c40f, shape: 'apple'  },
  bread:          { color: 0xd4a574, shape: 'flat'   },
  cooked_beef:    { color: 0x8b2500, shape: 'flat'   },
  raw_beef:       { color: 0xc0392b, shape: 'flat'   },
  cooked_chicken: { color: 0xd4a574, shape: 'flat'   },
  raw_chicken:    { color: 0xffd5c0, shape: 'flat'   },
  cooked_porkchop:{ color: 0xd4a574, shape: 'flat'   },
  raw_porkchop:   { color: 0xffc0b0, shape: 'flat'   },
  carrot:         { color: 0xe67e22, shape: 'stick'  },
  golden_carrot:  { color: 0xf1c40f, shape: 'stick'  },
  potato:         { color: 0xd4a574, shape: 'nugget' },
  baked_potato:   { color: 0xa07840, shape: 'nugget' },
  melon_slice:    { color: 0x27ae60, shape: 'flat'   },
  pumpkin_pie:    { color: 0xe67e22, shape: 'flat'   },
  cookie:         { color: 0xd4a574, shape: 'flat'   },
  cake:           { color: 0xf5e6c8, shape: 'flat'   },
  mushroom_stew:  { color: 0xa0522d, shape: 'flat'   },
  rabbit_stew:    { color: 0xa07040, shape: 'flat'   },
  beetroot:       { color: 0x8b1a1a, shape: 'stick'  },
  dried_kelp:     { color: 0x2d6a4f, shape: 'flat'   },
  honey_bottle:   { color: 0xf39c12, shape: 'nugget' },
  glow_berries:   { color: 0xf39c12, shape: 'apple'  },
  sweet_berries:  { color: 0xc0392b, shape: 'apple'  },
  pufferfish:     { color: 0xe67e22, shape: 'flat'   },
  // buckets
  water_bucket:   { color: 0x2980b9, shape: 'bucket' },
  lava_bucket:    { color: 0xe74c3c, shape: 'bucket' },
  milk_bucket:    { color: 0xffffff, shape: 'bucket' },
  bucket:         { color: 0xd5d5d5, shape: 'bucket' },
};

// Block colours from blocks.json (id→top color)
const BLOCK_COLORS = {
  1:  { top:'#5a9e3a', side:'#8B6343' },
  2:  { top:'#8B6343', side:'#8B6343' },
  3:  { top:'#8c8c8c', side:'#8c8c8c' },
  4:  { top:'#7a7a7a', side:'#7a7a7a' },
  5:  { top:'#c8a96a', side:'#7a5c2e' },
  6:  { top:'#c8a96a', side:'#c8a96a' },
  7:  { top:'#3a8a28', side:'#3a8a28' },
  8:  { top:'#ddd095', side:'#ddd095' },
  9:  { top:'#9b9b9b', side:'#9b9b9b' },
  10: { top:'#2980b9', side:'#2471a3' },
  13: { top:'#555555', side:'#555555' },
  14: { top:'#a97c50', side:'#a97c50' },
  15: { top:'#d4ac0d', side:'#d4ac0d' },
  16: { top:'#5dade2', side:'#5dade2' },
  17: { top:'#2ecc71', side:'#2ecc71' },
  19: { top:'#154360', side:'#154360' },
  20: { top:'#1a1a1a', side:'#1a1a1a' },
  21: { top:'#d5d5d5', side:'#d5d5d5' },
  22: { top:'#f1c40f', side:'#d4ac0d' },
  23: { top:'#5dade2', side:'#5dade2' },
  24: { top:'#2ecc71', side:'#2ecc71' },
  25: { top:'#8B5E3C', side:'#6B3E26' },
  26: { top:'#707070', side:'#555555' },
  27: { top:'#c8a96a', side:'#8b6343' },
  29: { top:'#a8d8ea', side:'#a8d8ea' },
  32: { top:'#f0f4f8', side:'#f0f4f8' },
  34: { top:'#e67e22', side:'#e67e22' },
  35: { top:'#27ae60', side:'#27ae60' },
  36: { top:'#8b3a3a', side:'#8b3a3a' },
  37: { top:'#7a7a7a', side:'#7a7a7a' },
  38: { top:'#5a7a4a', side:'#5a7a4a' },
  39: { top:'#c8a96a', side:'#c8a96a' },
  44: { top:'#9daab3', side:'#9daab3' },
  54: { top:'#e8d888', side:'#e8d888' },
  55: { top:'#be6020', side:'#be6020' },
  57: { top:'#f0f0f0', side:'#f0f0f0' },
  63: { top:'#4a4a4a', side:'#4a4a4a' },
  65: { top:'#4a7a3a', side:'#4a7a3a' },
  66: { top:'#3a2820', side:'#3a2820' },
};

// ─── Tiny THREE scene for rendering item icons into canvases ─────────────────
let _sharedRenderer = null;
function getSharedRenderer() {
  if (_sharedRenderer) return _sharedRenderer;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  _sharedRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  _sharedRenderer.setSize(64, 64);
  _sharedRenderer.setClearColor(0x000000, 0);
  return _sharedRenderer;
}

function hexToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

// Build a tiny scene with the item mesh, render to canvas, return dataURL
function renderItemIcon(itemKey, itemData) {
  const renderer = getSharedRenderer();
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(1.8, 1.8, 1.8);
  camera.lookAt(0, 0, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(3, 5, 3);
  scene.add(sun);

  // Determine if it's a block (id < 1000) or an item
  const isBlock = itemData.id < 1000;
  let mesh;

  if (isBlock) {
    mesh = _makeBlockMesh(itemData.id);
  } else {
    const meta = ITEM_META[itemKey] || { color: 0x888888, shape: 'flat' };
    mesh = _makeItemMesh(meta);
  }

  scene.add(mesh);

  // Slight rotation for isometric feel
  mesh.rotation.y = Math.PI / 5;
  mesh.rotation.x = Math.PI / 8;

  renderer.render(scene, camera);
  return renderer.domElement.toDataURL();
}

function _makeBlockMesh(id) {
  const col  = BLOCK_COLORS[id] || { top:'#888', side:'#666' };
  const topC = hexToInt(col.top);
  const sidC = hexToInt(col.side);

  // Build a box with different face colours (top lighter, sides darker)
  const geo  = new THREE.BoxGeometry(1, 1, 1);
  // 6 faces × 2 triangles each = 12 groups — easier to just use vertex colours
  const mats = [
    new THREE.MeshLambertMaterial({ color: sidC }),   // +x
    new THREE.MeshLambertMaterial({ color: sidC }),   // -x
    new THREE.MeshLambertMaterial({ color: topC }),   // +y (top)
    new THREE.MeshLambertMaterial({ color: sidC * 0.85 | 0 }), // -y (bottom)
    new THREE.MeshLambertMaterial({ color: sidC }),   // +z
    new THREE.MeshLambertMaterial({ color: sidC }),   // -z
  ];
  return new THREE.Mesh(geo, mats);
}

function _makeItemMesh(meta) {
  const col = meta.color;
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const darkMat = new THREE.MeshLambertMaterial({ color: Math.floor(col * 0.7) });

  let group = new THREE.Group();

  switch (meta.shape) {
    case 'ingot': {
      // Rectangular ingot shape
      const g = new THREE.BoxGeometry(0.7, 0.25, 0.9);
      group.add(new THREE.Mesh(g, mat));
      break;
    }
    case 'gem': {
      // Diamond/octahedron
      const g = new THREE.OctahedronGeometry(0.45);
      group.add(new THREE.Mesh(g, mat));
      break;
    }
    case 'nugget': {
      const g = new THREE.SphereGeometry(0.35, 8, 6);
      group.add(new THREE.Mesh(g, mat));
      break;
    }
    case 'stick': {
      const g = new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8);
      const m = new THREE.Mesh(g, mat);
      m.rotation.z = Math.PI / 4;
      group.add(m);
      break;
    }
    case 'sword': {
      // Blade
      const blade = new THREE.BoxGeometry(0.12, 0.85, 0.08);
      const bm = new THREE.Mesh(blade, mat);
      bm.position.y = 0.15;
      group.add(bm);
      // Guard
      const guard = new THREE.BoxGeometry(0.5, 0.1, 0.1);
      const gm = new THREE.Mesh(guard, darkMat);
      gm.position.y = -0.25;
      group.add(gm);
      // Handle
      const handle = new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8);
      const hm = new THREE.Mesh(handle, darkMat);
      hm.position.y = -0.5;
      group.add(hm);
      break;
    }
    case 'pickaxe': {
      // Handle
      const handle = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8);
      const hm = new THREE.Mesh(handle, darkMat);
      hm.rotation.z = Math.PI / 4;
      group.add(hm);
      // Head
      const head = new THREE.BoxGeometry(0.7, 0.15, 0.12);
      const headM = new THREE.Mesh(head, mat);
      headM.position.set(0.15, 0.45, 0);
      group.add(headM);
      // Tines
      const tine1 = new THREE.CylinderGeometry(0.05, 0.02, 0.3, 6);
      const t1 = new THREE.Mesh(tine1, mat);
      t1.position.set(-0.18, 0.55, 0);
      t1.rotation.z = -0.3;
      group.add(t1);
      const t2 = new THREE.Mesh(tine1, mat);
      t2.position.set(0.18, 0.55, 0);
      t2.rotation.z = 0.3;
      group.add(t2);
      break;
    }
    case 'axe': {
      const handle = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8);
      const hm = new THREE.Mesh(handle, darkMat);
      hm.rotation.z = Math.PI / 5;
      group.add(hm);
      const head = new THREE.BoxGeometry(0.4, 0.5, 0.12);
      const headM = new THREE.Mesh(head, mat);
      headM.position.set(0.2, 0.3, 0);
      group.add(headM);
      break;
    }
    case 'shovel': {
      const handle = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8);
      const hm = new THREE.Mesh(handle, darkMat);
      hm.rotation.z = Math.PI / 5;
      group.add(hm);
      const blade = new THREE.BoxGeometry(0.28, 0.4, 0.08);
      const bm = new THREE.Mesh(blade, mat);
      bm.position.set(0.2, 0.25, 0);
      group.add(bm);
      break;
    }
    case 'bow': {
      // Arc
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.1, -0.6, 0),
        new THREE.Vector3(0.5,   0.0, 0),
        new THREE.Vector3(-0.1,  0.6, 0)
      );
      const pts = curve.getPoints(12);
      const arcGeo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts), 12, 0.04, 6, false
      );
      group.add(new THREE.Mesh(arcGeo, mat));
      // String
      const strGeo = new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(-0.1,-0.55,0), new THREE.Vector3(-0.1,0.55,0)),
        2, 0.02, 4, false
      );
      group.add(new THREE.Mesh(strGeo, new THREE.MeshLambertMaterial({ color: 0xffffff })));
      break;
    }
    case 'helmet': {
      const g = new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
      group.add(new THREE.Mesh(g, mat));
      break;
    }
    case 'chest': {
      const g = new THREE.BoxGeometry(0.8, 0.55, 0.35);
      const m = new THREE.Mesh(g, mat);
      group.add(m);
      // Arm holes
      const cut = new THREE.BoxGeometry(0.15, 0.5, 0.4);
      [-0.38, 0.38].forEach(x => {
        const c = new THREE.Mesh(cut, new THREE.MeshLambertMaterial({ color: 0x222222 }));
        c.position.x = x;
        group.add(c);
      });
      break;
    }
    case 'legs': {
      const g = new THREE.BoxGeometry(0.65, 0.6, 0.3);
      group.add(new THREE.Mesh(g, mat));
      const legGeo = new THREE.BoxGeometry(0.25, 0.5, 0.28);
      [-0.18, 0.18].forEach(x => {
        const l = new THREE.Mesh(legGeo, mat);
        l.position.set(x, -0.5, 0);
        group.add(l);
      });
      break;
    }
    case 'boots': {
      const sole  = new THREE.BoxGeometry(0.35, 0.1,  0.5);
      const upper = new THREE.BoxGeometry(0.35, 0.35, 0.35);
      const sm = new THREE.Mesh(sole,  mat);
      const um = new THREE.Mesh(upper, mat);
      um.position.y = 0.22;
      um.position.z = -0.06;
      group.add(sm); group.add(um);
      break;
    }
    case 'apple': {
      const body = new THREE.SphereGeometry(0.38, 8, 8);
      group.add(new THREE.Mesh(body, mat));
      const stem = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6);
      const sm = new THREE.Mesh(stem, new THREE.MeshLambertMaterial({ color: 0x5a3010 }));
      sm.position.y = 0.45;
      group.add(sm);
      break;
    }
    case 'bucket': {
      const body = new THREE.CylinderGeometry(0.28, 0.22, 0.5, 10, 1, true);
      const base = new THREE.CircleGeometry(0.22, 10);
      base.rotateX(-Math.PI / 2);
      const bm = new THREE.Mesh(body, mat);
      const baseM = new THREE.Mesh(base, mat);
      baseM.position.y = -0.25;
      group.add(bm); group.add(baseM);
      // Handle
      const handleCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.28, 0.1, 0),
        new THREE.Vector3(0, 0.55, 0),
        new THREE.Vector3(0.28, 0.1, 0)
      );
      const hGeo = new THREE.TubeGeometry(handleCurve, 10, 0.04, 6, false);
      group.add(new THREE.Mesh(hGeo, mat));
      break;
    }
    default: { // 'flat'
      const g = new THREE.BoxGeometry(0.75, 0.75, 0.08);
      group.add(new THREE.Mesh(g, mat));
      break;
    }
  }

  return group;
}

// ─── Category config ──────────────────────────────────────────────────────────
// SURVIVAL: faqat player inventaridagi narsalarni ko'rsatish uchun kategoriyalar
const CATEGORIES = [
  { key: 'all',       label: '🎒 Hammasi',    icon: '🎒' },
  { key: 'blocks',    label: '🧱 Bloklar',   icon: '🧱' },
  { key: 'materials', label: '💎 Materiallar', icon: '💎' },
  { key: 'tools',     label: '⛏️ Asboblar',   icon: '⛏️' },
  { key: 'combat',    label: '⚔️ Qurol',      icon: '⚔️' },
  { key: 'armor',     label: '🛡️ Zirh',       icon: '🛡️' },
  { key: 'food',      label: '🍎 Ovqat',      icon: '🍎' },
];

// ─── Main class (SURVIVAL MODE) ───────────────────────────────────────────────
// Faqat player.inventory da mavjud narsalarni ko'rsatadi.
// Hech qanday bepul item berilmaydi.
export class InventoryScreen {
  constructor(player, blocksJson, itemsJson) {
    this.player    = player;
    this.open      = false;
    this._activeCategory = 'all';

    // Build master item catalogue (reference only — for name/category lookup)
    this._catalogue = {};

    for (const [key, blk] of Object.entries(blocksJson.blocks)) {
      if (blk.id === 0) continue;
      this._catalogue[blk.id] = { key, name: blk.name, category: 'blocks', stackSize: 64 };
    }
    for (const [key, itm] of Object.entries(itemsJson.items)) {
      this._catalogue[itm.id] = { key, name: itm.name, category: itm.category || 'materials', stackSize: itm.stackSize || 64 };
    }

    this._iconCache = {};
    this._buildDOM();
  }

  // Returns array of {slotIndex, id, count, key, name, category} from player inventory
  _getPlayerItems() {
    const items = [];
    const p = this.player;
    for (let i = 0; i < 36; i++) {
      const slot = p.inventory[i];
      if (!slot) continue;
      const info = this._catalogue[slot.id] || { key: slot.key || 'unknown', name: 'Noma\'lum', category: 'materials' };
      items.push({ slotIndex: i, id: slot.id, count: slot.count, key: info.key, name: info.name, category: info.category });
    }
    return items;
  }

  // ─── DOM ──────────────────────────────────────────────────────────────────
  _buildDOM() {
    // Remove old if any
    document.getElementById('inv-screen-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'inv-screen-overlay';
    overlay.innerHTML = `
      <div id="inv-window">
        <div id="inv-header">
          <span id="inv-title">🎒 Inventar — Survival</span>
          <span id="inv-close">✕</span>
        </div>
        <div id="inv-categories"></div>
        <div id="inv-search-row">
          <input id="inv-search" type="text" placeholder="🔍 Qidirish..." autocomplete="off" />
        </div>
        <div id="inv-grid-wrap">
          <div id="inv-grid"></div>
        </div>
        <div id="inv-footer">
          <span id="inv-hint">⛏️ Survival: faqat topgan narsalaringiz • E yoki Esc — yopish</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Styles
    const style = document.createElement('style');
    style.id = 'inv-style';
    document.getElementById('inv-style')?.remove();
    style.textContent = `
      #inv-screen-overlay {
        position:fixed; inset:0; z-index:2000;
        background: rgba(0,0,0,0.75);
        display:none; align-items:center; justify-content:center;
      }
      #inv-screen-overlay.open { display:flex; }
      #inv-window {
        width: min(760px, 96vw);
        max-height: 86vh;
        background: #1a1a1a;
        border: 2px solid #555;
        border-radius: 4px;
        display:flex; flex-direction:column;
        font-family:'Courier New',monospace;
        color:#fff;
        overflow:hidden;
        box-shadow: 0 8px 40px #000a;
      }
      #inv-header {
        display:flex; justify-content:space-between; align-items:center;
        padding:10px 16px 8px;
        background:#222; border-bottom:2px solid #444;
        font-size:18px; font-weight:bold;
      }
      #inv-close {
        cursor:pointer; font-size:20px; color:#aaa; user-select:none;
        padding:0 4px;
      }
      #inv-close:hover { color:#fff; }
      #inv-categories {
        display:flex; gap:2px; padding:8px 10px 0;
        background:#1a1a1a; flex-wrap:wrap;
      }
      .inv-cat-btn {
        padding:5px 10px; border:2px solid #555;
        background:#2a2a2a; color:#ccc;
        cursor:pointer; font-family:'Courier New',monospace;
        font-size:12px; border-radius:2px;
        transition: background 0.1s, border-color 0.1s;
        white-space:nowrap;
      }
      .inv-cat-btn:hover { background:#3a3a3a; border-color:#888; }
      .inv-cat-btn.active { background:#3a5fc8; border-color:#7a9fe8; color:#fff; }
      #inv-search-row {
        padding:8px 12px;
        background:#1a1a1a;
      }
      #inv-search {
        width:100%; padding:6px 10px;
        background:#2a2a2a; border:2px solid #555;
        color:#fff; font-family:'Courier New',monospace;
        font-size:13px; outline:none; border-radius:2px;
      }
      #inv-search:focus { border-color:#7a9fe8; }
      #inv-grid-wrap {
        flex:1; overflow-y:auto; padding:8px 12px 4px;
        scrollbar-color: #555 #1a1a1a;
      }
      #inv-grid {
        display:grid;
        grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
        gap:6px;
      }
      .inv-slot {
        width:72px; height:80px;
        background:#2a2a2a; border:2px solid #555;
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        cursor:pointer; border-radius:2px;
        transition: background 0.1s, border-color 0.1s;
        position:relative; overflow:hidden;
        padding:2px;
      }
      .inv-slot:hover {
        background:#3a5fc8; border-color:#7a9fe8;
        transform: scale(1.05);
      }
      .inv-slot:active { transform: scale(0.97); }
      .inv-slot img {
        width:48px; height:48px;
        image-rendering:pixelated;
      }
      .inv-slot-name {
        font-size:9px; color:#ccc; text-align:center;
        line-height:1.2; max-width:68px;
        overflow:hidden; text-overflow:ellipsis;
        white-space:nowrap;
      }
      .inv-slot-tag {
        position:absolute; top:2px; right:3px;
        font-size:8px; color:#aaa;
      }
      .inv-added-flash {
        animation: invFlash 0.35s ease;
      }
      @keyframes invFlash {
        0%   { background:#3a8a28; border-color:#5aca48; }
        100% { background:#2a2a2a; border-color:#555; }
      }
      #inv-footer {
        padding:6px 12px 8px;
        background:#222; border-top:1px solid #333;
        font-size:11px; color:#888; text-align:center;
      }
    `;
    document.head.appendChild(style);

    // Category buttons
    const catRow = document.getElementById('inv-categories');
    for (const cat of CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'inv-cat-btn' + (cat.key === this._activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.dataset.cat = cat.key;
      btn.addEventListener('click', () => {
        this._activeCategory = cat.key;
        document.querySelectorAll('.inv-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('inv-search').value = '';
        this._renderGrid();
      });
      catRow.appendChild(btn);
    }

    // Search
    document.getElementById('inv-search').addEventListener('input', () => {
      this._renderGrid();
    });

    // Close button
    document.getElementById('inv-close').addEventListener('click', () => this.close());

    // Click outside to close
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) this.close();
    });

    this._renderGrid();
  }

  _renderGrid() {
    const grid   = document.getElementById('inv-grid');
    const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
    grid.innerHTML = '';

    const playerItems = this._getPlayerItems();

    for (const item of playerItems) {
      const cat = item.category;
      if (this._activeCategory !== 'all' && cat !== this._activeCategory) continue;
      if (search && !item.name.toLowerCase().includes(search) && !item.key.includes(search)) continue;

      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.title = `${item.name}\nMiqdor: ${item.count}\nSlot: ${item.slotIndex}`;

      // Icon
      const img = document.createElement('img');
      const iconKey = item.key;
      if (!this._iconCache[iconKey]) {
        // build a minimal item descriptor for renderItemIcon
        this._iconCache[iconKey] = renderItemIcon(iconKey, { id: item.id });
      }
      img.src = this._iconCache[iconKey];
      slot.appendChild(img);

      // Name
      const nameEl = document.createElement('div');
      nameEl.className = 'inv-slot-name';
      nameEl.textContent = item.name;
      slot.appendChild(nameEl);

      // Count badge
      const countEl = document.createElement('div');
      countEl.className = 'inv-slot-tag';
      countEl.textContent = item.count > 1 ? `×${item.count}` : '';
      slot.appendChild(countEl);

      grid.appendChild(slot);
    }

    if (grid.children.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;color:#666;padding:30px;text-align:center;font-size:13px;line-height:2;';
      empty.innerHTML = search
        ? '🔍 Hech narsa topilmadi'
        : '📭 Inventar bo\'sh<br><span style="font-size:11px;color:#444">Bloklar buzib yig\'ing!</span>';
      grid.appendChild(empty);
    }
  }

  toggle() {
    this.open ? this.close() : this.show();
  }

  show() {
    this.open = true;
    document.getElementById('inv-screen-overlay').classList.add('open');
    document.getElementById('inv-search').focus();
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderGrid();
  }

  close() {
    this.open = false;
    document.getElementById('inv-screen-overlay').classList.remove('open');
  }
}
