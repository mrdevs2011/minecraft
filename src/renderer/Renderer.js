import * as THREE from 'three';
import { CHUNK_SIZE }    from '../world/Chunk.js';
import { buildChunkMesh } from './ChunkMesher.js';
import { createAvatar, SteveAvatar } from '../../avatars/index.js';
import { buildTextureAtlas } from '../world/TextureAtlas.js';
import { ZombieAvatar } from '../entities/ZombieAvatar.js';
import { SheepModel }   from '../entities/SheepModel.js';

const FOV_DEG            = 70;
const RENDER_DIST_BLOCKS = CHUNK_SIZE * 5;

const CAM_DIST_BACK  = 4.0;
const CAM_DIST_UP    = 1.6;

// ── Shared AO vertex shader ───────────────────────────────────────────────
// THREE.js built-in: position, normal, uv — qayta e'lon qilinmaydi.
// color — ChunkMesher dan AO * shade * blockColor (RGB, 0..1).
// vNormal — fragment shaderda yuz (top/bottom/side) tipini aniqlash uchun.
const AO_VERT = /* glsl */`
  attribute vec3 color;
  varying vec3  vColor;
  varying vec2  vUv;
  varying float vFogDist;
  varying vec3  vNormal;

  void main() {
    vColor   = color;
    vUv      = uv;
    vNormal  = normal;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vFogDist   = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`;

// ── Shared AO fragment shader ─────────────────────────────────────────────
// Tekstura * vertex color (AO + shade encoded).
// Gamma correction (sRGB output): pow(x, 1/2.2).
// Fog: linear, sky rangi bilan aralashtiriladi.
// applyFaceLighting: normal asosida top/bottom/side yuzasini aniqlab,
//                    uAmbientOcclusionFactor orqali yorug'likni kamaytiradi.
const AO_FRAG = /* glsl */`
  varying vec3  vColor;
  varying vec2  vUv;
  varying float vFogDist;
  varying vec3  vNormal;

  uniform sampler2D uAtlas;
  uniform vec3      uFogColor;
  uniform float     uFogNear;
  uniform float     uFogFar;
  uniform float     uOpacity;
  // Blok yuzalarining burchaklardagi yorug'ligini kamaytirish koeffitsiyenti.
  // 0.0 = to'liq qorong'u burchaklar, 1.0 = AO ta'siri yo'q.
  uniform float     uAmbientOcclusionFactor;

  // Har bir yuz (top / bottom / side) uchun yorug'lik koeffitsiyentini hisoblaydi.
  // normal.y > 0.5  → top    yuz: eng yorug' (1.0)
  // normal.y < -0.5 → bottom yuz: eng qorong'u (0.8)
  // aks holda       → side   yuz: o'rta yorug'lik (0.9)
  // Natija uAmbientOcclusionFactor bilan interpolatsiya qilinadi:
  //   factor = 1.0 → hech qanday qo'shimcha o'zgarish yo'q
  //   factor = 0.0 → maksimal qorayish qo'llaniladi
  float applyFaceLighting(vec3 n) {
    float faceMult;
    if (n.y > 0.5) {
      faceMult = 1.0;          // top   — to'liq yorug'
    } else if (n.y < -0.5) {
      faceMult = 0.8;          // bottom — 20% qoraytirilgan
    } else {
      faceMult = 0.9;          // side   — 10% qoraytirilgan
    }
    // uAmbientOcclusionFactor = 1.0 → faceMult o'zgarishsiz
    // uAmbientOcclusionFactor = 0.0 → faceMult to'liq kuchga kiradi
    return mix(1.0, faceMult, uAmbientOcclusionFactor);
  }

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    if (tex.a < 0.1) discard;

    // AO + shade vertex color bilan teksturani ko'paytirish
    vec3 col = tex.rgb * vColor;

    // Yuz yorug'ligini qo'llash: top/bottom/side ga qarab koeffitsiyent
    col *= applyFaceLighting(vNormal);

    // Gamma correction — linear -> sRGB
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));

    // Linear fog
    float fogFactor = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, fogFactor);

    gl_FragColor = vec4(col, tex.a * uOpacity);
  }
`;

// ── Water shader ──────────────────────────────────────────────────────────
const WATER_VERT = /* glsl */`
  attribute vec3 color;
  varying vec3  vColor;
  varying vec3  vWorldPos;
  varying vec2  vUv;
  varying float vFogDist;
  uniform float uTime;

  void main() {
    vColor = color;
    vUv    = uv;
    vec3 pos = position;
    // Yuqori yuzada to'lqin animatsiyasi
    if (normal.y > 0.5) {
      pos.y += sin(pos.x * 1.8 + uTime * 1.4) * 0.035;
      pos.y += sin(pos.z * 2.2 + uTime * 1.1) * 0.025;
    }
    vWorldPos   = pos;
    vec4 mvPos  = modelViewMatrix * vec4(pos, 1.0);
    vFogDist    = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const WATER_FRAG = /* glsl */`
  varying vec3  vColor;
  varying vec3  vWorldPos;
  varying vec2  vUv;
  varying float vFogDist;
  uniform float     uTime;
  uniform sampler2D uAtlas;
  uniform vec3      uFogColor;
  uniform float     uFogNear;
  uniform float     uFogFar;

  void main() {
    float ripple = sin(vWorldPos.x * 3.0 + uTime * 2.0) * 0.04
                 + sin(vWorldPos.z * 2.5 + uTime * 1.7) * 0.03;
    vec4 tex = texture2D(uAtlas, vUv);
    vec3 col = tex.rgb * vColor + vec3(ripple * 0.3, ripple * 0.5, ripple * 0.2);
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));

    // Fog
    float fogFactor = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, fogFactor);

    gl_FragColor = vec4(col, 0.72);
  }
`;

function makeFogUniforms(color, near, far) {
  return {
    uFogColor: { value: new THREE.Color(color) },
    uFogNear:  { value: near },
    uFogFar:   { value: far },
  };
}

export class Renderer {
  constructor(canvas, world, player) {
    this.canvas  = canvas;
    this.world   = world;
    this.player  = player;

    // ── Scene ──
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // ── Camera ──
    this.camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, RENDER_DIST_BLOCKS + 32);
    this.camera.rotation.order = 'YXZ';

    // ── WebGL ──
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // ── Back-face culling: GPU darajasida orqa yuzalarni o'chirish ──
    // THREE.FrontSide — faqat kameraga qaragan yuzalarni render qiladi.
    // Bu GPU triangle count ni taxminan 40-50% ga kamaytiradi.
    this.webgl.localClippingEnabled = false;
    // (ShaderMaterial lar quyida THREE.FrontSide bilan yaratiladi)

    // ── Frustum Culling uchun Frustum ob'ekti ──
    this._frustum        = new THREE.Frustum();
    this._frustumMatrix  = new THREE.Matrix4();
    // Chunk AABB sphere: frustum tekshiruvi uchun ishlatiladi
    this._tmpBox3        = new THREE.Box3();
    this._tmpSphere      = new THREE.Sphere();

    // ── Lighting (ambient faqat — AO shaderda boshqariladi) ──
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambientLight);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.85);
    this.sun.position.set(80, 150, 60);
    this.scene.add(this.sun);

    // ── Sun disc ──
    const sunGeom = new THREE.SphereGeometry(18, 16, 16);
    const sunMat  = new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false });
    this.sunMesh  = new THREE.Mesh(sunGeom, sunMat);
    this.scene.add(this.sunMesh);

    // ── Moon disc ──
    const moonGeom = new THREE.SphereGeometry(14, 16, 16);
    const moonMat  = new THREE.MeshBasicMaterial({ color: 0xe8e8ff, fog: false });
    this.moonMesh  = new THREE.Mesh(moonGeom, moonMat);
    this.scene.add(this.moonMesh);

    // ── TextureAtlas ──
    const atlas = buildTextureAtlas();
    this._atlasTexture = atlas.texture;
    this._getUV = atlas.getUV;

    // ── Fog defaults ──
    this._fogColor = 0x87ceeb;
    this._fogNear  = 80;
    this._fogFar   = 180;

    // ── Opaque ShaderMaterial: AO + gamma + fog + back-face culling ──
    // side: THREE.FrontSide — GPU orqa yuzalarni discard qiladi (back-face culling)
    this.opaqueMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas:  { value: this._atlasTexture },
        uOpacity: { value: 1.0 },
        // Blok burchaklaridagi AO kuchini boshqaradi (0.0–1.0).
        // 1.0 = hozirgi ko'rinish (ta'sir yo'q), 0.0 = to'liq qorong'u burchaklar.
        uAmbientOcclusionFactor: { value: 1.0 },
        ...makeFogUniforms(this._fogColor, this._fogNear, this._fogFar),
      },
      vertexShader:   AO_VERT,
      fragmentShader: AO_FRAG,
      side: THREE.FrontSide,   // ← Back-face culling: faqat old yuz
    });

    // ── Glass ShaderMaterial: shaffof, AO, back-face culling ──
    // Glass uchun ham FrontSide — shisha yuzalari ham culling qabul qiladi
    this.glassMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas:   { value: this._atlasTexture },
        uOpacity: { value: 0.55 },
        // Shisha uchun ham AO koeffitsiyenti (opaqueMat bilan bir xil mantiq).
        uAmbientOcclusionFactor: { value: 1.0 },
        ...makeFogUniforms(this._fogColor, this._fogNear, this._fogFar),
      },
      vertexShader:   AO_VERT,
      fragmentShader: AO_FRAG,
      transparent: true,
      depthWrite:  false,
      side: THREE.FrontSide,   // ← Back-face culling
    });

    // ── Water ShaderMaterial: ikki tomoni ko'rinadigan (DoubleSide) ──
    // Suv ichida qaralayotganda pastki yuzalar ham ko'rinishi kerak.
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite:  false,
      uniforms: {
        uTime:   { value: 0 },
        uAtlas:  { value: this._atlasTexture },
        ...makeFogUniforms(this._fogColor, this._fogNear, this._fogFar),
      },
      vertexShader:   WATER_VERT,
      fragmentShader: WATER_FRAG,
      side: THREE.DoubleSide,  // Suv ichidan ham ko'rinsin
    });

    this.chunkMeshes = new Map();

    // ── Fasl holati ──────────────────────────────────────────────────────
    this._season  = 'summer';
    this._seasonT = 0;

    // ── Qor yog'ish tizimi ───────────────────────────────────────────────
    // Qishda 800 ta qor zarracha, player atrofida 40x40x30 blok maydonida
    this._snowParticles    = null;
    this._snowPositions    = null;
    this._snowVelocities   = null;
    this._snowActive       = false;
    this._snowOpacity      = 0;      // 0..1 smooth fade
    this._initSnow(player);

    // ── Block highlight ──
    const boxGeom = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges   = new THREE.EdgesGeometry(boxGeom);
    this.highlight = new THREE.LineSegments(edges,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // ── Local player avatar ──
    this._localAvatarId = 'steve';
    this.steve = new SteveAvatar(this.scene);

    // ── Other players ──
    this._otherPlayerModels = new Map();

    // ── Mobs (qo'y, zombi, ...) — entity.id → { model, type } ──
    this._mobModels = new Map();

    // ── View mode ──
    this._viewMode = 'third';

    window.addEventListener('keydown', e => {
      if (e.code === 'F5') {
        e.preventDefault();
        this._viewMode = this._viewMode === 'first' ? 'third' : 'first';
      }
    });

    this.resize();
  }

  // ── Qor zarrachalari tizimi ─────────────────────────────────────────────
  _initSnow() {
    const COUNT = 800;
    const geom  = new THREE.BufferGeometry();
    const pos   = new Float32Array(COUNT * 3);
    // Boshlang'ich pozitsiya — player atrofida tasodifiy, birinchi update da to'g'rilanadi
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color:       0xffffff,
      size:        0.18,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      sizeAttenuation: true,
    });
    this._snowParticles  = new THREE.Points(geom, mat);
    this._snowParticles.frustumCulled = false;
    this._snowPositions  = pos;
    // Har zarracha uchun tushish tezligi (tasodifiy 0.5..1.5 blok/s)
    this._snowVelocities = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this._snowVelocities[i * 3]     = (Math.random() - 0.5) * 0.3; // x drift
      this._snowVelocities[i * 3 + 1] = -(0.5 + Math.random() * 1.0); // y tushish
      this._snowVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3; // z drift
    }
    this.scene.add(this._snowParticles);
  }

  _updateSnow(player, dt, season) {
    if (!this._snowParticles) return;
    const mat = this._snowParticles.material;

    // Qish bo'lsa — opacity ni sekin oshir, aks holda kamayt
    const targetOpacity = (season === 'winter') ? 0.82 : 0;
    this._snowOpacity += (targetOpacity - this._snowOpacity) * Math.min(1, dt * 0.5);
    mat.opacity = this._snowOpacity;

    if (this._snowOpacity < 0.01) return; // Aktiv emas — zarrachalarni harakat qilma

    const COUNT = this._snowPositions.length / 3;
    const HALF_X = 20, HALF_Z = 20, HEIGHT = 28;
    const pos = this._snowPositions;
    const vel = this._snowVelocities;

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;

      // Harakat
      pos[ix] += vel[ix] * dt;
      pos[iy] += vel[iy] * dt;
      pos[iz] += vel[iz] * dt;

      // Player ga nisbatan offset (zarrachalar player bilan birga harakatlanadi)
      const rx = pos[ix] - player.x;
      const ry = pos[iy] - player.y;
      const rz = pos[iz] - player.z;

      // Maydon chegarasidan chiqsa — tepaga qaytarib tashlash (looping)
      if (rx > HALF_X)        { pos[ix] -= HALF_X * 2; }
      else if (rx < -HALF_X)  { pos[ix] += HALF_X * 2; }
      if (rz > HALF_Z)        { pos[iz] -= HALF_Z * 2; }
      else if (rz < -HALF_Z)  { pos[iz] += HALF_Z * 2; }
      if (ry < -2) {
        // Yerga tushdi — tepaga qaytarib ber, pozitsiyani player atrofida yangi joylash
        pos[ix] = player.x + (Math.random() - 0.5) * HALF_X * 2;
        pos[iy] = player.y + HEIGHT * (0.1 + Math.random() * 0.9);
        pos[iz] = player.z + (Math.random() - 0.5) * HALF_Z * 2;
        // Blok ustiga qo'ngan taassurot: biroz to'xtab turadi
        vel[iy] = -(0.5 + Math.random() * 1.0);
      }
    }
    // GPU ga yangilangan pozitsiyalarni yuklash
    this._snowParticles.geometry.attributes.position.needsUpdate = true;
  }

  resize() {
    const w = this.canvas.clientWidth  || this.canvas.offsetWidth;
    const h = this.canvas.clientHeight || this.canvas.offsetHeight;
    this.webgl.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  screenPointToRay(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / Math.max(1, rect.width))  * 2 - 1;
    const ndcY = -(((clientY - rect.top)  / Math.max(1, rect.height)) * 2 - 1);

    const far    = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const origin = this.camera.position.clone();
    const dir    = far.sub(origin).normalize();
    return {
      ox: origin.x, oy: origin.y, oz: origin.z,
      dx: dir.x,    dy: dir.y,    dz: dir.z,
    };
  }

  render(player, raycastResult, moving, dt, mobs, dayFraction = 0.25, clockData = null) {
    // ── Fasl yangilash: season o'zgarganda chunk larni qayta qur ───────────
    if (clockData) {
      const newSeason = clockData.season || 'summer';
      const newT      = clockData.seasonT || 0;
      if (newSeason !== this._season || Math.abs((newT || 0) - (this._seasonT || 0)) > 0.02) {
        const seasonChanged = newSeason !== this._season;
        this._season  = newSeason;
        this._seasonT = newT;
        if (seasonChanged) {
          // Barcha chunk meshlarini qayta qur — yangi rang bilan
          for (const key of this.chunkMeshes.keys()) {
            const [cx, cz] = key.split(',').map(Number);
            const chunk = this.world.getChunk(cx, cz);
            if (chunk) this._rebuildChunk(chunk);
          }
        }
      }
      // Qor tizimi: faqat qishda
      this._updateSnow(player, dt || 0.016, newSeason);
    }
    this._updateSteve(player, moving, dt || 0.016);
    this._syncCamera(player);
    this._updateChunks(player);
    this._updateHighlight(raycastResult);
    this._tickOtherPlayers(dt || 0.016);
    this._tickMobs(mobs || [], dt || 0.016, player);

    // ── Kun/Tun: quyosh va oy pozitsiyasi ────────────────────────────────
    // dayFraction: 0=yarim tun(00:00), 0.25=tong(06:00), 0.5=tush(12:00), 0.75=kech(18:00)
    // Quyosh 0.25(6am)→0.5(12pm)→0.75(6pm) orasida ko'rinadi — yarim aylana
    // sunAngle: 0 = gorizont, PI/2 = tepa
    const sunAngle  = ((dayFraction - 0.25) / 0.5) * Math.PI; // 0(6am)..PI(6pm)
    const moonAngle = ((dayFraction + 0.25) / 0.5) * Math.PI; // teskari
    const orbitR    = 300;
    this.sunMesh.position.set(
      player.x,
      Math.sin(sunAngle) * orbitR,
      player.z + Math.cos(sunAngle) * orbitR
    );
    this.moonMesh.position.set(
      player.x,
      -Math.sin(sunAngle) * orbitR,
      player.z - Math.cos(sunAngle) * orbitR
    );

    // ── Kun/Tun: osmon rangi va yoritish ─────────────────────────────────
    // Kunduz: 06:00-18:00 (0.25..0.75), Tun: qolgan vaqt
    const isNight = dayFraction >= 0.75 || dayFraction < 0.25;

    // Tong (0.23..0.27) va Shom (0.73..0.77) transition
    const dawnT = dayFraction >= 0.23 && dayFraction <= 0.27
      ? Math.sin(((dayFraction - 0.23) / 0.04) * Math.PI * 0.5) : (dayFraction > 0.27 ? 1 : 0);
    const duskT = dayFraction >= 0.73 && dayFraction <= 0.77
      ? Math.sin(((dayFraction - 0.73) / 0.04) * Math.PI * 0.5) : (dayFraction > 0.77 || dayFraction < 0.23 ? 1 : 0);

    const skyDay   = new THREE.Color(0x87ceeb);
    const skyDawn  = new THREE.Color(0xff7733);
    const skyNight = new THREE.Color(0x060a18);

    let skyColor;
    if (dayFraction >= 0.27 && dayFraction < 0.73) {
      // To'liq kunduz
      skyColor = skyDay.clone();
    } else if (dayFraction >= 0.23 && dayFraction < 0.27) {
      // Tong: tun->tong rangi->kun
      skyColor = skyNight.clone().lerp(skyDawn, dawnT).lerp(skyDay, Math.max(0, dawnT - 0.5) * 2);
    } else if (dayFraction >= 0.73 && dayFraction < 0.77) {
      // Shom: kun->tong rangi->tun
      skyColor = skyDay.clone().lerp(skyDawn, duskT).lerp(skyNight, Math.max(0, duskT - 0.5) * 2);
    } else {
      skyColor = skyNight.clone();
    }

    // Ambient yorug'lik
    let ambientI;
    if (dayFraction >= 0.27 && dayFraction < 0.73) {
      ambientI = 0.55;
    } else if (dayFraction >= 0.23 && dayFraction < 0.27) {
      ambientI = 0.08 + 0.47 * dawnT;
    } else if (dayFraction >= 0.73 && dayFraction < 0.77) {
      ambientI = 0.55 - 0.47 * duskT;
    } else {
      ambientI = 0.08;
    }
    this.ambientLight.intensity = ambientI;

    // Quyosh yorug'ligi: faqat kunduz
    this.sun.intensity = isNight ? 0 : 0.85 * Math.max(0, Math.sin(sunAngle));

    if (this.waterMat.uniforms) {
      this.waterMat.uniforms.uTime.value += (dt || 0.016);
    }

    // ── Fog & sky rangi: suv ichida / tashqarida ──
    let fogColor, fogNear, fogFar;
    if (player.inWater) {
      fogColor = 0x123d6e; fogNear = 1.5; fogFar = 14;
    } else {
      fogColor = skyColor.getHex();
      fogNear = isNight ? 40 : 80;
      fogFar  = isNight ? 120 : 180;
    }

    this.scene.background = new THREE.Color(fogColor);
    this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

    // Shader uniform larini yangilash
    const fogVec = new THREE.Color(fogColor);
    for (const mat of [this.opaqueMat, this.glassMat, this.waterMat]) {
      mat.uniforms.uFogColor.value.copy(fogVec);
      mat.uniforms.uFogNear.value  = fogNear;
      mat.uniforms.uFogFar.value   = fogFar;
    }

    // ── Frustum yangilash: har frame kamera matritsasidan ──
    this._frustumMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this._frustum.setFromProjectionMatrix(this._frustumMatrix);

    // ── Frustum Culling + yaqin chunk filtri ──
    // Faqat o'yinchi atrofidagi 3x3 (1 ta masofa) chunklar ko'rsatiladi.
    // Undan uzoqdagilari visible = false — FPS barqarorlashadi.
    this._setNearChunksVisible(player);

    this.webgl.render(this.scene, this.camera);
  }

  setLocalAvatarId(avatarId) {
    if (!avatarId || this._localAvatarId === avatarId) return;
    this._localAvatarId = avatarId;
    const wasVisible = this.steve.root.visible;
    const pos = this.steve.root.position.clone();
    const rot = this.steve.root.rotation.clone();
    this.steve.dispose();
    this.steve = createAvatar(this.scene, avatarId);
    this.steve.root.position.copy(pos);
    this.steve.root.rotation.copy(rot);
    this.steve.setVisible(wasVisible);
  }

  syncOtherPlayers(_playersMap) {
    // Boshqa o'yinchilar o'chirilgan — faqat local steve ko'rinadi
  }

  _tickOtherPlayers(_dt) {
    // Boshqa o'yinchilar o'chirilgan
  }

  _updateSteve(player, moving, dt) {
    this.steve.setVisible(this._viewMode === 'third');
    this.steve.update(player.x, player.y, player.z, player.yaw, !!moving, dt);
  }

  // Game.js dagi MobManager.mobs ro'yxatini THREE modellariga sinxronlaydi:
  // yangi mob lar uchun model yaratadi, o'lgan/yo'qolgan lar uchun dispose qiladi.
  _tickMobs(mobs, dt, player) {
    const aliveIds = new Set();

    // O'yinchi turgan chunk koordinatalari
    const playerCx = player ? Math.floor(player.x / CHUNK_SIZE) : 0;
    const playerCz = player ? Math.floor(player.z / CHUNK_SIZE) : 0;
    // Ko'rinish radiusi
    const visRadius = this.world.renderDistance;

    for (const mob of mobs) {
      aliveIds.add(mob.id);
      let entry = this._mobModels.get(mob.id);
      if (!entry) {
        const model = mob.type === 'zombie' ? new ZombieAvatar(this.scene) : new SheepModel(this.scene);
        entry = { model };
        this._mobModels.set(mob.id, entry);
      }

      // Mob turgan chunk koordinatalari
      const mobCx = Math.floor(mob.x / CHUNK_SIZE);
      const mobCz = Math.floor(mob.z / CHUNK_SIZE);

      // Chunk yetkazilganmi? Yo'q bo'lsa — mobni yashiramiz (havoda suzib ko'rinmasin)
      const chunkKey    = `${mobCx},${mobCz}`;
      const chunkLoaded = this.chunkMeshes.has(chunkKey);
      const inVisRange  = Math.abs(mobCx - playerCx) <= visRadius &&
                          Math.abs(mobCz - playerCz) <= visRadius;
      const isVisible   = chunkLoaded && inVisRange;

      // THREE modeli visibility ni yangilash
      const root = entry.model.root || entry.model.group;
      if (root) root.visible = isVisible;

      if (!isVisible) continue; // Ko'rinmasa animatsiya ham kerak emas

      // Zombi uchun bosh burish va qo'l silkitish ma'lumotlarini uzatish
      const headYaw   = mob.type === 'zombie' ? (mob.headYaw   ?? 0) : 0;
      const headPitch = mob.type === 'zombie' ? (mob.headPitch ?? 0) : 0;
      const attackAnim= mob.type === 'zombie' ? (mob.attackAnim?? 0) : 0;
      entry.model.update(mob.x, mob.y, mob.z, mob.yaw, !!mob.moving, dt, headYaw, headPitch, attackAnim);
      entry.model.setHurt?.(mob._hurtFlash > 0);
    }

    for (const [id, entry] of this._mobModels) {
      if (!aliveIds.has(id)) {
        entry.model.dispose();
        this._mobModels.delete(id);
      }
    }
  }

  _syncCamera(player) {
    if (this._viewMode === 'first') {
      this.camera.position.set(player.x, player.getEyeY(), player.z);
      this.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    } else {
      const sinY     = Math.sin(player.yaw);
      const cosY     = Math.cos(player.yaw);
      const pitch    = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, player.pitch));
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);

      this.camera.position.set(
        player.x + sinY * CAM_DIST_BACK * cosPitch,
        player.y + CAM_DIST_UP - sinPitch * CAM_DIST_BACK,
        player.z + cosY * CAM_DIST_BACK * cosPitch
      );

      const lookTarget = new THREE.Vector3(player.x, player.y + 1.0, player.z);
      this.camera.lookAt(lookTarget);
    }
  }

  _updateHighlight(hit) {
    if (hit && hit.hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.blockX + 0.5, hit.blockY + 0.5, hit.blockZ + 0.5);
    } else {
      this.highlight.visible = false;
    }
  }

  _chunkKey(cx, cz) { return `${cx},${cz}`; }

  // O'yinchi atrofidagi 3x3 chunkni (visibleRadius = 1) ko'rsatadi,
  // qolganlarni visible = false qilib yashiradi. Frustum culling ham saqlanadi.
  _setNearChunksVisible(player) {
    const pcx = Math.floor(player.x / CHUNK_SIZE);
    const pcz = Math.floor(player.z / CHUNK_SIZE);
    const VISIBLE_RADIUS = 1; // 3x3 = 9 chunk

    for (const [key, entry] of this.chunkMeshes) {
      const [cx, cz] = key.split(',').map(Number);
      const inRange = Math.abs(cx - pcx) <= VISIBLE_RADIUS &&
                      Math.abs(cz - pcz) <= VISIBLE_RADIUS;

      // Diapazon ichida bo'lsa — frustum culling bilan ko'rsat
      // Tashqarida bo'lsa — to'liq yashir
      const visible = inRange &&
        (!entry.boundingBox || this._frustum.intersectsBox(entry.boundingBox));

      if (entry.opaqueMesh) entry.opaqueMesh.visible = visible;
      if (entry.glassMesh)  entry.glassMesh.visible  = visible;
      if (entry.waterMesh)  entry.waterMesh.visible  = visible;
    }
  }

  _updateChunks(player) {
    const cx   = Math.floor(player.x / CHUNK_SIZE);
    const cz   = Math.floor(player.z / CHUNK_SIZE);
    const dist = this.world.renderDistance;
    const wanted = new Set();

    for (let dx = -dist; dx <= dist; dx++) {
      for (let dz = -dist; dz <= dist; dz++) {
        const ccx = cx + dx, ccz = cz + dz;
        wanted.add(this._chunkKey(ccx, ccz));
        this._ensureChunkMesh(ccx, ccz);
      }
    }

    for (const [key, entry] of this.chunkMeshes) {
      if (!wanted.has(key)) {
        if (entry.opaqueMesh) this.scene.remove(entry.opaqueMesh);
        if (entry.glassMesh)  this.scene.remove(entry.glassMesh);
        if (entry.waterMesh)  this.scene.remove(entry.waterMesh);
        entry.opaqueMesh?.geometry.dispose();
        entry.glassMesh?.geometry.dispose();
        entry.waterMesh?.geometry.dispose();
        this.chunkMeshes.delete(key);
      }
    }
  }

  _ensureChunkMesh(cx, cz) {
    const key   = this._chunkKey(cx, cz);
    const chunk = this.world.getChunk(cx, cz);
    let entry   = this.chunkMeshes.get(key);

    if (entry && !chunk.dirty) return;

    if (entry) {
      if (entry.opaqueMesh) this.scene.remove(entry.opaqueMesh);
      if (entry.glassMesh)  this.scene.remove(entry.glassMesh);
      if (entry.waterMesh)  this.scene.remove(entry.waterMesh);
      entry.opaqueMesh?.geometry.dispose();
      entry.glassMesh?.geometry.dispose();
      entry.waterMesh?.geometry.dispose();
    }

    const { opaqueGeom, glassGeom, waterGeom, boundingBox } = buildChunkMesh(
      chunk, this.world, this.world.fluid, this._getUV,
      this._season || 'summer', this._seasonT || 0
    );
    const newEntry = {
      opaqueMesh: null,
      glassMesh:  null,
      waterMesh:  null,
      boundingBox: boundingBox || null,   // Frustum Culling uchun AABB
    };

    if (opaqueGeom) {
      newEntry.opaqueMesh = new THREE.Mesh(opaqueGeom, this.opaqueMat);
      // THREE.js o'z frustum culling sini ishlatmasin — biz qo'lda boshqaramiz
      newEntry.opaqueMesh.frustumCulled = false;
      this.scene.add(newEntry.opaqueMesh);
    }
    if (glassGeom) {
      newEntry.glassMesh = new THREE.Mesh(glassGeom, this.glassMat);
      newEntry.glassMesh.frustumCulled = false;
      this.scene.add(newEntry.glassMesh);
    }
    if (waterGeom) {
      newEntry.waterMesh = new THREE.Mesh(waterGeom, this.waterMat);
      newEntry.waterMesh.frustumCulled = false;
      this.scene.add(newEntry.waterMesh);
    }

    this.chunkMeshes.set(key, newEntry);
    chunk.dirty = false;
  }
}