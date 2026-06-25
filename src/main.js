import { Game } from './core/Game.js';
import { AssetLoader } from './core/AssetLoader.js';
import {
  waitForAuthReady,
  signInWithGoogle,
  signOutUser,
  saveUserProfile,
  rotateCacheOnExit,
  initMrLocalUrl,
} from './core/Firebase.js';

const loader = new AssetLoader();

// ── Fullscreen yordamchi ──────────────────────────────────────────────────────
function isMobile() {
  return ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0) ||
         (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

async function requestFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen)             await el.requestFullscreen();
    else if (el.webkitRequestFullscreen)  el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)     el.mozRequestFullScreen();
    else if (el.msRequestFullscreen)      el.msRequestFullscreen();
  } catch (e) {
    // Fullscreen rad etilishi mumkin — o'yin baribir ishlaydi
  }
}

async function boot() {
  const splashScreen  = document.getElementById('splash-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const progressEl    = document.getElementById('progress');
  const loadingText   = document.getElementById('loading-text');
  const loginScreen   = document.getElementById('login-screen');

  // ── 1. Splash (2.4s) ──────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 2400));
  splashScreen.classList.add('hidden');

  // ── 2. Check existing auth session ────────────────────────────────────────
  let user = await waitForAuthReady();

  if (!user) {
    loginScreen.classList.remove('hidden');
    user = await new Promise(resolve => {
      document.getElementById('btn-google-login').addEventListener('click', async () => {
        const btn = document.getElementById('btn-google-login');
        btn.disabled = true;
        btn.textContent = 'Kirilmoqda...';
        try {
          const u = await signInWithGoogle();
          resolve(u);
        } catch (err) {
          console.error('Login error:', err);
          btn.disabled = false;
          btn.textContent = 'Google bilan kirish';
          document.getElementById('login-error').textContent =
            '⚠️ Kirish muvaffaqiyatsiz. Qayta urinib ko\'ring.';
        }
      });
    });
    loginScreen.classList.add('hidden');
  }

  // ── 3. Telefonda fullscreen — login tugagandan keyin so'rash ─────────────
  if (isMobile()) {
    await requestFullscreen();
  }

  // ── 4. Save / update user profile in Firestore ───────────────────────────
  await saveUserProfile(user);

  // ── 4.5. MRLocal URL ni yuklash (Cloudflare tunnel yoki localhost) ────────
  await initMrLocalUrl();

  // ── 5. Loading screen ─────────────────────────────────────────────────────
  loadingScreen.classList.remove('hidden');

  const userInfoEl = document.getElementById('loading-user-info');
  if (userInfoEl) {
    userInfoEl.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" style="width:32px;height:32px;border-radius:50%;vertical-align:middle;margin-right:8px;">` +
        `<span style="color:#aaa;font-size:13px;">${user.displayName || user.email}</span>`
      : `<span style="color:#aaa;font-size:13px;">${user.displayName || user.email}</span>`;
  }

  const steps = [
    { text: 'Teksturalar yuklanmoqda...', fn: null },
    { text: 'Dunyo yaratilmoqda...',      fn: null },
    { text: 'Entitylar joylashtirilmoqda...', fn: null },
    { text: 'Tayyor!',                    fn: null },
  ];

  // ── 1-qadam: Teksturalar (assets) ─────────────────────────────────────────
  loadingText.textContent = steps[0].text;
  progressEl.style.width  = '25%';
  await new Promise(r => setTimeout(r, 300));

  // ── 2-qadam: Dunyo yaratiladi (Game obyekti va Player spawn) ──────────────
  loadingText.textContent = steps[1].text;
  progressEl.style.width  = '50%';

  const game = new Game(user);
  // game.start() ni chaqiramiz LEKIN hali canvas ko'rsatilmaydi.
  // Bu yerda dunyo generatsiyasi va chunk yuklash sodir bo'ladi.
  document.getElementById('game-container').classList.remove('hidden');
  // Canvas hali ko'rinmaydi — CSS orqali (opacity:0 yoki pointer-events:none)
  // Biz game.start() ni chaqiramiz va u ichida loadChunksAround + getSurfaceY ishlatiladi.
  game.start();

  // ── 3-qadam: Entitylar joylashtirilmoqda ──────────────────────────────────
  // O'yinchi spawn pozitsiyasi allaqachon game.start() ichida hisoblangan.
  // Endi bir frame kutib player.y to'g'ri o'rnatilganligini ta'minlaymiz.
  loadingText.textContent = steps[2].text;
  progressEl.style.width  = '75%';

  // Kamida 2 physics frame kutish — o'yinchi spawndagi yuzaga to'liq tushib o'rnashsin
  // (60fps = ~16ms/frame, 10 frame = ~160ms)
  await new Promise(r => setTimeout(r, 300));

  // O'yinchini spawn nuqtasiga qayta qo'yish (physics ishga tushgandan keyin)
  {
    const spawnY = game.world.getSurfaceY(0, 0);
    game.player.x = 0;
    game.player.y = spawnY + 2;
    game.player.z = 0;
    // Tezlikni nolga tenglashtirish — "tushib ketish" oldini olish
    if (game.player.vy !== undefined) game.player.vy = 0;
    if (game.player.vx !== undefined) game.player.vx = 0;
    if (game.player.vz !== undefined) game.player.vz = 0;
    if (game.player.onGround !== undefined) game.player.onGround = true;
  }

  // Yana bir qisqa kutish (render frame)
  await new Promise(r => setTimeout(r, 200));

  // ── 4-qadam: Tayyor ───────────────────────────────────────────────────────
  loadingText.textContent = steps[3].text;
  progressEl.style.width  = '100%';
  await new Promise(r => setTimeout(r, 300));

  loadingScreen.classList.add('hidden');

  document.getElementById('btn-resume').addEventListener('click', () => game.resume());

  document.getElementById('btn-quit').addEventListener('click', async () => {
    const btn = document.getElementById('btn-quit');
    btn.textContent = 'Chiqilmoqda...';
    btn.disabled = true;
    game.stop();
    // Sessiya tugaganda cache ni rotate qilish
    rotateCacheOnExit();
    await signOutUser();
    location.reload();
  });

  // ── 7. Sahifa yopilayotganda cache rotate ─────────────────────────────────
  window.addEventListener('beforeunload', () => {
    game.stop();
    rotateCacheOnExit();
  });

  // ── 8. Telefonda ekranga bosilganda fullscreen qayta so'rash ──────────────
  if (isMobile()) {
    document.addEventListener('click', () => {
      if (!document.fullscreenElement &&
          !document.webkitFullscreenElement) {
        requestFullscreen();
      }
    }, { once: false });
  }
}

boot();
