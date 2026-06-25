import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CHUNK_SIZE }    from '../world/Chunk.js';
import { buildChunkMesh } from './ChunkMesher.js';
import { createAvatar, SteveAvatar } from '../../avatars/index.js';
import { buildTextureAtlas } from '../world/TextureAtlas.js';

const FOV_DEG            = 70;
const RENDER_DIST_BLOCKS = CHUNK_SIZE * 5;

const CAM_DIST_BACK  = 4.0;
const CAM_DIST_UP    = 1.6;

// ── Shared AO vertex shader ───────────────────────────────────────────────
// THREE.js built-in: position, normal, uv — qayta e'lon qilinmaydi.
// color — ChunkMesher dan AO * shade * blockColor (RGB, 0..1).
const AO_VERT = /* glsl */`
  attribute vec3 color;
  varying vec3  vColor;
  varying vec2  vUv;
  varying float vFogDist;

  void main() {
    vColor   = color;
    vUv      = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vFogDist   = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`;

// ── Shared AO fragment shader ─────────────────────────────────────────────
// Tekstura * vertex color (AO + shade encoded).
// Gamma correction (sRGB output): pow(x, 1/2.2).
// Fog: linear, sky rangi bilan aralashtiriladi.
const AO_FRAG = /* glsl */`
  varying vec3  vColor;
  varying vec2  vUv;
  varying float vFogDist;

  uniform sampler2D uAtlas;
  uniform vec3      uFogColor;
  uniform float     uFogNear;
  uniform float     uFogFar;
  uniform float     uOpacity;

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    if (tex.a < 0.1) discard;

    // AO + shade vertex color bilan teksturani ko'paytirish
    vec3 col = tex.rgb * vColor;

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
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world  = world;

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
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.sun = new THREE.DirectionalLight(0xffffff, 0.85);
    this.sun.position.set(80, 150, 60);
    this.scene.add(this.sun);

    // ── Sun disc ──
    const sunGeom = new THREE.SphereGeometry(18, 16, 16);
    const sunMat  = new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false });
    this.sunMesh  = new THREE.Mesh(sunGeom, sunMat);
    this.scene.add(this.sunMesh);

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

  render(player, raycastResult, moving, dt) {
    this._updateSteve(player, moving, dt || 0.016);
    this._syncCamera(player);
    this._updateChunks(player);
    this._updateHighlight(raycastResult);
    this._tickOtherPlayers(dt || 0.016);

    const t = performance.now() * 0.00005;
    this.sunMesh.position.set(
      player.x + Math.cos(t) * 300,
      220,
      player.z + Math.sin(t) * 300
    );

    if (this.waterMat.uniforms) {
      this.waterMat.uniforms.uTime.value += (dt || 0.016);
    }

    // ── Fog & sky rangi: suv ichida / tashqarida ──
    let fogColor, fogNear, fogFar;
    if (player.inWater) {
      fogColor = 0x123d6e; fogNear = 1.5; fogFar = 14;
    } else {
      fogColor = 0x87ceeb; fogNear = 80; fogFar = 180;
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

    // ── Frustum Culling: ko'rinmaydigan chunk meshlarini yashirish ──
    // Har chunk entry sida .boundingBox (THREE.Box3) saqlanadi.
    // Frustum bilan kesishmasalar — mesh.visible = false.
    for (const [, entry] of this.chunkMeshes) {
      if (!entry.boundingBox) continue;
      const visible = this._frustum.intersectsBox(entry.boundingBox);
      if (entry.opaqueMesh) entry.opaqueMesh.visible = visible;
      if (entry.glassMesh)  entry.glassMesh.visible  = visible;
      if (entry.waterMesh)  entry.waterMesh.visible  = visible;
    }

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

  syncOtherPlayers(playersMap) {
    for (const [uid, entry] of this._otherPlayerModels) {
      if (!playersMap.has(uid)) {
        entry.model.dispose();
        if (entry.labelEl && entry.labelEl.parentNode) {
          entry.labelEl.parentNode.removeChild(entry.labelEl);
        }
        this._otherPlayerModels.delete(uid);
      }
    }

    for (const [uid, data] of playersMap) {
      if (!this._otherPlayerModels.has(uid)) {
        const model = createAvatar(this.scene, data.avatarId || 'steve');

        const labelEl = document.createElement('div');
        labelEl.className = 'player-label';
        labelEl.textContent = data.displayName || 'Player';
        labelEl.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'color:#fff',
          'font-size:11px',
          'font-family:monospace',
          'background:rgba(0,0,0,0.5)',
          'padding:1px 5px',
          'border-radius:3px',
          'white-space:nowrap',
          'transform:translate(-50%,-100%)',
          'display:none',
        ].join(';');
        this.canvas.parentElement?.appendChild(labelEl);

        this._otherPlayerModels.set(uid, {
          model, data, labelEl, _animTime: 0,
          cur: { x: data.x, y: data.y, z: data.z, yaw: data.yaw },
          tgt: { x: data.x, y: data.y, z: data.z, yaw: data.yaw },
        });
      }

      const entry = this._otherPlayerModels.get(uid);
      if (data.avatarId && entry.data.avatarId !== data.avatarId) {
        entry.model.dispose();
        entry.model = createAvatar(this.scene, data.avatarId);
      }
      entry.tgt.x   = data.x;
      entry.tgt.y   = data.y;
      entry.tgt.z   = data.z;
      entry.tgt.yaw = data.yaw;
      entry.data    = data;
    }
  }

  _tickOtherPlayers(dt) {
    const LERP = 12;

    for (const [, entry] of this._otherPlayerModels) {
      const { data, model, labelEl, cur, tgt } = entry;

      const t = Math.min(1, LERP * dt);
      cur.x += (tgt.x - cur.x) * t;
      cur.y += (tgt.y - cur.y) * t;
      cur.z += (tgt.z - cur.z) * t;

      let dyaw = tgt.yaw - cur.yaw;
      while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      cur.yaw += dyaw * t;

      model.update(cur.x, cur.y, cur.z, cur.yaw, !!data.moving, dt);

      const isGhost = !!data.isGhost;
      model.setGhost(isGhost);

      if (labelEl) {
        const worldPos  = new THREE.Vector3(cur.x, cur.y + 2.4, cur.z);
        const projected = worldPos.project(this.camera);
        if (projected.z < 1) {
          const hw = this.canvas.clientWidth  / 2;
          const hh = this.canvas.clientHeight / 2;
          const sx = Math.round( projected.x * hw + hw);
          const sy = Math.round(-projected.y * hh + hh);
          labelEl.style.left    = sx + 'px';
          labelEl.style.top     = sy + 'px';
          labelEl.style.display = 'block';
        } else {
          labelEl.style.display = 'none';
        }
      }
    }
  }

  _updateSteve(player, moving, dt) {
    this.steve.setVisible(this._viewMode === 'third');
    this.steve.update(player.x, player.y, player.z, player.yaw, !!moving, dt);
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
      chunk, this.world, this.world.fluid, this._getUV
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