import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const ITEM_META = {
  // ... (toʻliq roʻyxat avvalgidek, oʻzgarmagan)
};

const BLOCK_COLORS = {
  // ... (avvalgidek, lekin ID lar yangi boʻlishi kerak – foydalanuvchi o‘zi yangilaydi)
};

function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }

let _sharedRenderer = null;
function getSharedRenderer() { /* ... avvalgidek */ }

function renderItemIcon(itemKey, itemData) { /* ... avvalgidek */ }

function _makeBlockMesh(id) { /* ... avvalgidek */ }

function _makeItemMesh(meta) { /* ... avvalgidek */ }

const CATEGORIES = [
  { key: 'all',       label: '🎒 Hammasi',    icon: '🎒' },
  { key: 'blocks',    label: '🧱 Bloklar',   icon: '🧱' },
  { key: 'materials', label: '💎 Materiallar', icon: '💎' },
  { key: 'tools',     label: '⛏️ Asboblar',   icon: '⛏️' },
  { key: 'combat',    label: '⚔️ Qurol',      icon: '⚔️' },
  { key: 'armor',     label: '🛡️ Zirh',       icon: '🛡️' },
  { key: 'food',      label: '🍎 Ovqat',      icon: '🍎' },
];

export class InventoryScreen {
  constructor(player, blocksJson, itemsJson) {
    this.player    = player;
    this.open      = false;
    this._activeCategory = 'all';
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

  _buildDOM() {
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

    const style = document.createElement('style');
    style.id = 'inv-style';
    document.getElementById('inv-style')?.remove();
    // ─── MOJANG USLUBI: grid 9 ustun, 52px katak ───
    style.textContent = `
      #inv-screen-overlay { position:fixed; inset:0; z-index:2000; background: rgba(0,0,0,0.75); display:none; align-items:center; justify-content:center; }
      #inv-screen-overlay.open { display:flex; }
      #inv-window { width: min(760px, 96vw); max-height: 86vh; background: #1a1a1a; border: 2px solid #555; border-radius: 4px; display:flex; flex-direction:column; font-family:'Courier New',monospace; color:#fff; overflow:hidden; box-shadow: 0 8px 40px #000a; }
      #inv-header { display:flex; justify-content:space-between; align-items:center; padding:10px 16px 8px; background:#222; border-bottom:2px solid #444; font-size:18px; font-weight:bold; }
      #inv-close { cursor:pointer; font-size:20px; color:#aaa; user-select:none; padding:0 4px; }
      #inv-close:hover { color:#fff; }
      #inv-categories { display:flex; gap:2px; padding:8px 10px 0; background:#1a1a1a; flex-wrap:wrap; }
      .inv-cat-btn { padding:5px 10px; border:2px solid #555; background:#2a2a2a; color:#ccc; cursor:pointer; font-family:'Courier New',monospace; font-size:12px; border-radius:2px; transition: background 0.1s, border-color 0.1s; white-space:nowrap; }
      .inv-cat-btn:hover { background:#3a3a3a; border-color:#888; }
      .inv-cat-btn.active { background:#3a5fc8; border-color:#7a9fe8; color:#fff; }
      #inv-search-row { padding:8px 12px; background:#1a1a1a; }
      #inv-search { width:100%; padding:6px 10px; background:#2a2a2a; border:2px solid #555; color:#fff; font-family:'Courier New',monospace; font-size:13px; outline:none; border-radius:2px; }
      #inv-search:focus { border-color:#7a9fe8; }
      #inv-grid-wrap { flex:1; overflow-y:auto; padding:8px 12px 4px; scrollbar-color: #555 #1a1a1a; }
      #inv-grid { display:grid; grid-template-columns: repeat(9, 52px); gap:2px; }
      .inv-slot { width:52px; height:52px; background:#8b8b8b; border:2px solid #555; border-radius:2px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition: background 0.1s, border-color 0.1s; position:relative; overflow:hidden; padding:2px; }
      .inv-slot:hover { border-color:#fff; background:#aaa; transform: scale(1.05); }
      .inv-slot:active { transform: scale(0.97); }
      .inv-slot img { width:48px; height:48px; image-rendering:pixelated; }
      .inv-slot-name { font-size:9px; color:#ccc; text-align:center; line-height:1.2; max-width:68px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .inv-slot-tag { position:absolute; top:2px; right:3px; font-size:8px; color:#aaa; }
      .inv-added-flash { animation: invFlash 0.35s ease; }
      @keyframes invFlash { 0% { background:#3a8a28; border-color:#5aca48; } 100% { background:#2a2a2a; border-color:#555; } }
      #inv-footer { padding:6px 12px 8px; background:#222; border-top:1px solid #333; font-size:11px; color:#888; text-align:center; }
    `;
    document.head.appendChild(style);

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

    document.getElementById('inv-search').addEventListener('input', () => this._renderGrid());
    document.getElementById('inv-close').addEventListener('click', () => this.close());
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) this.close(); });
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

      const img = document.createElement('img');
      const iconKey = item.key;
      if (!this._iconCache[iconKey]) {
        this._iconCache[iconKey] = renderItemIcon(iconKey, { id: item.id });
      }
      img.src = this._iconCache[iconKey];
      slot.appendChild(img);

      const nameEl = document.createElement('div');
      nameEl.className = 'inv-slot-name';
      nameEl.textContent = item.name;
      slot.appendChild(nameEl);

      const countEl = document.createElement('div');
      countEl.className = 'inv-slot-tag';
      countEl.textContent = item.count > 1 ? `×${item.count}` : '';
      slot.appendChild(countEl);

      grid.appendChild(slot);
    }
    if (grid.children.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;color:#666;padding:30px;text-align:center;font-size:13px;line-height:2;';
      empty.innerHTML = search ? '🔍 Hech narsa topilmadi' : '📭 Inventar bo\'sh<br><span style="font-size:11px;color:#444">Bloklar buzib yig\'ing!</span>';
      grid.appendChild(empty);
    }
  }

  toggle() { this.open ? this.close() : this.show(); }
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