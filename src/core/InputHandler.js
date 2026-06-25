export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys   = {};
    this.mouse  = { dx: 0, dy: 0, buttons: {} };
    this.locked = false;
    this._clickCallbacks = [];
    this._sensitivity = 0.002;

    // Touch state (single-finger desktop-style drag)
    this._touch = { active: false, lastX: 0, lastY: 0 };

    // ── Joystick state ──────────────────────────────────────────────────────
    // Chap joystick: harakat (WASD)
    // O'ng joystick: kamera (look)
    this._joyL = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
    this._joyR = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };

    // Joystick UI elementlari (CSS da yaratiladi, bu yerda reference olinadi)
    this._joyLEl   = null;
    this._joyLKnob = null;
    this._joyREl   = null;
    this._joyRKnob = null;

    this._isMobile = false; // _bind ichida aniqlanadi

    this._bind();
  }

  // ── Telefon ekanligini aniqlash ─────────────────────────────────────────
  static detectMobile() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  _bind() {
    this._isMobile = InputHandler.detectMobile();

    // ── Keyboard ──
    document.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Escape')  this._onEscape?.();
      if (e.code === 'KeyE')    this._onInventory?.();
      if (e.code === 'KeyT')    this._onChat?.();
      const digits = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'];
      const idx = digits.indexOf(e.code);
      if (idx !== -1) this._onHotbar?.(idx);
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // ── Pointer Lock (desktop only) ──
    if (!this._isMobile) {
      this.canvas.addEventListener('click', () => {
        if (!this.locked) this.canvas.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === this.canvas;
      });
      document.addEventListener('mousemove', e => {
        if (this.locked) {
          this.mouse.dx += e.movementX;
          this.mouse.dy += e.movementY;
        }
      });
      this.canvas.addEventListener('mousedown', e => {
        this.mouse.buttons[e.button] = true;
        this._clickCallbacks.forEach(cb => cb(e.button));
      });
      this.canvas.addEventListener('mouseup', e => {
        this.mouse.buttons[e.button] = false;
      });
      this.canvas.addEventListener('wheel', e => {
        this._onScroll?.(e.deltaY);
      });
    }

    // ── Mobile: Joystick + touch actions ──────────────────────────────────
    if (this._isMobile) {
      this._initJoystickUI();
      this._bindMobileTouch();
    }
  }

  // ── Joystick UI yaratish ─────────────────────────────────────────────────
  _initJoystickUI() {
    // Chap joystick (harakat)
    this._joyLEl = document.createElement('div');
    this._joyLEl.id = 'joystick-left';
    this._joyLEl.className = 'joystick-base';
    this._joyLKnob = document.createElement('div');
    this._joyLKnob.className = 'joystick-knob';
    this._joyLEl.appendChild(this._joyLKnob);

    // O'ng joystick (kamera)
    this._joyREl = document.createElement('div');
    this._joyREl.id = 'joystick-right';
    this._joyREl.className = 'joystick-base';
    this._joyRKnob = document.createElement('div');
    this._joyRKnob.className = 'joystick-knob';
    this._joyREl.appendChild(this._joyRKnob);

    // Break va Place tugmalari
    this._btnBreak = document.createElement('button');
    this._btnBreak.id = 'btn-break';
    this._btnBreak.className = 'joy-action-btn joy-break';
    this._btnBreak.textContent = '⛏';

    this._btnPlace = document.createElement('button');
    this._btnPlace.id = 'btn-place';
    this._btnPlace.className = 'joy-action-btn joy-place';
    this._btnPlace.textContent = '🧱';

    // Inventory tugmasi
    this._btnInv = document.createElement('button');
    this._btnInv.id = 'btn-inv-mobile';
    this._btnInv.className = 'joy-action-btn joy-inv';
    this._btnInv.textContent = '🎒';

    // Jump tugmasi
    this._btnJump = document.createElement('button');
    this._btnJump.id = 'btn-jump-mobile';
    this._btnJump.className = 'joy-action-btn joy-jump';
    this._btnJump.textContent = '↑';

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.appendChild(this._joyLEl);
      gameContainer.appendChild(this._joyREl);
      gameContainer.appendChild(this._btnBreak);
      gameContainer.appendChild(this._btnPlace);
      gameContainer.appendChild(this._btnInv);
      gameContainer.appendChild(this._btnJump);
    }

    // Tugma hodisalari
    this._btnBreak.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      const hit = this._touchAimScreen ? this._touchAimScreen : { x: window.innerWidth/2, y: window.innerHeight/2 };
      this._onTouchBreak?.(hit.x, hit.y);
    }, { passive: false });

    this._btnPlace.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      const hit = this._touchAimScreen ? this._touchAimScreen : { x: window.innerWidth/2, y: window.innerHeight/2 };
      this._onTouchPlace?.(hit.x, hit.y);
    }, { passive: false });

    this._btnInv.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      this._onInventory?.();
    }, { passive: false });

    this._btnJump.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      this.keys['Space'] = true;
    }, { passive: false });
    this._btnJump.addEventListener('touchend', e => {
      e.preventDefault();
      this.keys['Space'] = false;
    }, { passive: false });
  }

  // ── Multi-touch joystick logikasi ────────────────────────────────────────
  _bindMobileTouch() {
    const JOY_RADIUS = 50; // px — maksimal og'ish

    const onTouchStart = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const x = t.clientX;
        const y = t.clientY;
        const halfW = window.innerWidth / 2;

        if (x < halfW) {
          // ── Chap joystick (harakat) ──
          if (!this._joyL.active) {
            this._joyL.active = true;
            this._joyL.id     = t.identifier;
            this._joyL.cx     = x;
            this._joyL.cy     = y;
            this._joyL.dx     = 0;
            this._joyL.dy     = 0;
            // Joystick'ni barmoq tagiga ko'chirish
            this._joyLEl.style.left = (x - 60) + 'px';
            this._joyLEl.style.top  = (y - 60) + 'px';
            this._joyLEl.style.opacity = '0.85';
            this._updateJoyKnob(this._joyLKnob, 0, 0);
          }
        } else {
          // ── O'ng joystick (kamera) ──
          if (!this._joyR.active) {
            this._joyR.active = true;
            this._joyR.id     = t.identifier;
            this._joyR.cx     = x;
            this._joyR.cy     = y;
            this._joyR.dx     = 0;
            this._joyR.dy     = 0;
            this._joyREl.style.right = (window.innerWidth - x - 60) + 'px';
            this._joyREl.style.top   = (y - 60) + 'px';
            this._joyREl.style.opacity = '0.85';
            this._updateJoyKnob(this._joyRKnob, 0, 0);
            // Aim marker ni o'rnatish
            this._touchAimScreen = { x, y };
            this._onTouchAim?.(x, y);
          }
        }
      }
    };

    const onTouchMove = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._joyL.active && t.identifier === this._joyL.id) {
          let dx = t.clientX - this._joyL.cx;
          let dy = t.clientY - this._joyL.cy;
          const dist = Math.hypot(dx, dy);
          if (dist > JOY_RADIUS) {
            dx = (dx / dist) * JOY_RADIUS;
            dy = (dy / dist) * JOY_RADIUS;
          }
          this._joyL.dx = dx;
          this._joyL.dy = dy;
          this._updateJoyKnob(this._joyLKnob, dx, dy);

          // Keys simulyatsiya
          const threshold = JOY_RADIUS * 0.25;
          this.keys['KeyW'] = dy < -threshold;
          this.keys['KeyS'] = dy >  threshold;
          this.keys['KeyA'] = dx < -threshold;
          this.keys['KeyD'] = dx >  threshold;
        }

        if (this._joyR.active && t.identifier === this._joyR.id) {
          let dx = t.clientX - this._joyR.cx;
          let dy = t.clientY - this._joyR.cy;
          const dist = Math.hypot(dx, dy);

          // Kamera: cheksiz siljish — har frame delta olinadi
          const prevLX = this._joyR.lastX ?? t.clientX;
          const prevLY = this._joyR.lastY ?? t.clientY;
          this.mouse.dx += (t.clientX - prevLX) * 1.8;
          this.mouse.dy += (t.clientY - prevLY) * 1.8;
          this._joyR.lastX = t.clientX;
          this._joyR.lastY = t.clientY;

          // Knob ko'rinishi uchun clamp
          if (dist > JOY_RADIUS) {
            dx = (dx / dist) * JOY_RADIUS;
            dy = (dy / dist) * JOY_RADIUS;
          }
          this._joyR.dx = dx;
          this._joyR.dy = dy;
          this._updateJoyKnob(this._joyRKnob, dx, dy);
        }
      }
    };

    const onTouchEnd = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._joyL.active && t.identifier === this._joyL.id) {
          this._joyL.active = false;
          this._joyL.dx = 0;
          this._joyL.dy = 0;
          this._updateJoyKnob(this._joyLKnob, 0, 0);
          this._joyLEl.style.opacity = '0.35';
          // Barcha harakat tugmalarini o'chirish
          this.keys['KeyW'] = false;
          this.keys['KeyS'] = false;
          this.keys['KeyA'] = false;
          this.keys['KeyD'] = false;
        }
        if (this._joyR.active && t.identifier === this._joyR.id) {
          this._joyR.active = false;
          this._joyR.lastX = null;
          this._joyR.lastY = null;
          this._updateJoyKnob(this._joyRKnob, 0, 0);
          this._joyREl.style.opacity = '0.35';
          this._onTouchAimEnd?.();
        }
      }
    };

    this.canvas.addEventListener('touchstart',  onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
    this.canvas.addEventListener('touchend',    onTouchEnd,   { passive: false });
    this.canvas.addEventListener('touchcancel', onTouchEnd,   { passive: false });
  }

  _updateJoyKnob(knobEl, dx, dy) {
    if (!knobEl) return;
    knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  consumeMouse() {
    const dx = this.mouse.dx;
    const dy = this.mouse.dy;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return { dx, dy };
  }

  getMovement() {
    return {
      forward:  this.keys['KeyW']     || this.keys['ArrowUp'],
      backward: this.keys['KeyS']     || this.keys['ArrowDown'],
      left:     this.keys['KeyA']     || this.keys['ArrowLeft'],
      right:    this.keys['KeyD']     || this.keys['ArrowRight'],
      jump:     this.keys['Space'],
      sneak:    this.keys['ShiftLeft']  || this.keys['ShiftRight'],
      sprint:   this.keys['ControlLeft'],
    };
  }

  onClick(cb)    { this._clickCallbacks.push(cb); }
  onEscape(cb)   { this._onEscape    = cb; }
  onInventory(cb){ this._onInventory = cb; }
  onHotbar(cb)   { this._onHotbar    = cb; }
  onScroll(cb)   { this._onScroll    = cb; }

  onTouchAim(cb)    { this._onTouchAim    = cb; }
  onTouchAimEnd(cb) { this._onTouchAimEnd = cb; }
  onTouchBreak(cb)  { this._onTouchBreak  = cb; }
  onTouchPlace(cb)  { this._onTouchPlace  = cb; }
}
