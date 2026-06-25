import { getBlock } from '../world/Blocks.js';

export class HUD {
  constructor(player, user = null) {
    this.player = player;
    this._buildHotbar();
    this._buildViewIndicator();
    this._initPlayerBadge(user || window._mcUser);
    this._buildClock();
  }

  _initPlayerBadge(user) {
    if (!user) return;
    const nameEl  = document.getElementById('badge-name');
    const photoEl = document.getElementById('badge-photo');
    if (nameEl)  nameEl.textContent = user.displayName || user.email || '';
    if (photoEl && user.photoURL) {
      photoEl.src = user.photoURL;
      photoEl.onload = () => photoEl.classList.add('loaded');
      photoEl.onerror = () => {};
    }
  }

  _buildHotbar() {
    const hotbar = document.getElementById('hotbar');
    hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === 0 ? ' active' : '');
      slot.id = `hotbar-slot-${i}`;
      // Mojang uslubi: toʻq jigarrang fon
      slot.style.background = 'rgba(40, 30, 20, 0.85)';
      slot.style.border = '2px solid #666';
      hotbar.appendChild(slot);
    }
  }

  _buildViewIndicator() {
    const debug = document.getElementById('debug-info');
    if (!document.getElementById('view-hint')) {
      const hint = document.createElement('div');
      hint.id = 'view-hint';
      hint.style.cssText = 'margin-top:4px;color:#ffe080;font-size:11px;';
      hint.textContent = 'F5 — kamera rejimini almashtirish';
      debug.after(hint);
    }
  }

  _buildClock() {
    if (document.getElementById('game-clock')) return;
    const clock = document.createElement('div');
    clock.id = 'game-clock';
    clock.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:16px',
      'color:#fff',
      'font-size:15px',
      'font-family:monospace',
      'font-weight:bold',
      'text-shadow:0 0 4px #000, 0 1px 2px #000',
      'background:rgba(0,0,0,0.35)',
      'padding:3px 9px',
      'border-radius:6px',
      'letter-spacing:2px',
      'z-index:9999',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    clock.textContent = '00:00';
    document.body.appendChild(clock);
  }

  updateClock(totalSeconds) {
    const el = document.getElementById('game-clock');
    if (!el) return;
    const m = Math.floor(totalSeconds / 60) % 60;
    const s = totalSeconds % 60;
    el.textContent =
      String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  update() {
    const p = this.player;

    // Hotbar
    for (let i = 0; i < 9; i++) {
      const slot = document.getElementById(`hotbar-slot-${i}`);
      if (!slot) continue;
      slot.classList.toggle('active', i === p.hotbarSlot);
      slot.style.borderColor = i === p.hotbarSlot ? '#fff' : '#666';
      const item = p.inventory[i];
      if (item) {
        const def = getBlock(item.id);
        slot.style.background = def.color?.top || '#555';
        const count = slot.querySelector('.count') || (() => {
          const c = document.createElement('span');
          c.className = 'count';
          slot.appendChild(c);
          return c;
        })();
        count.textContent = item.count;
      } else {
        slot.style.background = 'rgba(40,30,20,0.85)';
        const count = slot.querySelector('.count');
        if (count) count.textContent = '';
      }
    }

    // Health — Mojang ikonkalari (❤️, 💔, 🖤)
    const healthBar = document.getElementById('health-bar');
    healthBar.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart';
      const filled = p.health / 2 > i;
      const half   = p.health / 2 > i - 0.5 && !filled;
      heart.textContent = filled ? '❤️' : half ? '💔' : '🖤';
      healthBar.appendChild(heart);
    }

    // Hunger — Mojang ikonkalari (🍗, 🍖, ⚪)
    const hungerBar = document.getElementById('hunger-bar');
    hungerBar.innerHTML = '';
    for (let i = 9; i >= 0; i--) {
      const drumstick = document.createElement('span');
      drumstick.className = 'hunger';
      const filled = p.hunger / 2 > i;
      const half   = p.hunger / 2 > i - 0.5 && !filled;
      drumstick.textContent = filled ? '🍗' : half ? '🍖' : '⚪';
      hungerBar.appendChild(drumstick);
    }

    // Debug
    const debug = document.getElementById('debug-info');
    debug.innerHTML = `
      X: ${p.x.toFixed(1)}  Y: ${p.y.toFixed(1)}  Z: ${p.z.toFixed(1)}<br>
      ${p.onGround ? '🟢 YER' : '🔵 HAVO'}<br>
      Tanlangan: ${getBlock(p.inventory[p.hotbarSlot]?.id || 0).name}
    `;
  }
}