import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CHUNK_SIZE }    from '../world/Chunk.js';
import { buildChunkMesh } from './ChunkMesher.js';
import { createAvatar, SteveAvatar } from '../../avatars/index.js';
import { buildTextureAtlas } from '../world/TextureAtlas.js';

const FOV_DEG           = 70;
const RENDER_DIST_BLOCKS = CHUNK_SIZE * 5;

const CAM_DIST_BACK  = 4.0;
const CAM_DIST_UP    = 1.6;

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

    // ── Lighting ──
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.sun = new THREE.DirectionalLight(0xffffff, 0.85);
    this.sun.position.set(80, 150, 60);
    this.scene.add(this.sun);

    // ── Sun disc ──
    const sunGeom = new THREE.SphereGeometry(18, 16, 16);
    const sunMat  = new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false });
    this.sunMesh  = new THREE.Mesh(sunGeom, sunMat);
    this.scene.add(this.sunMesh);

    // ── TextureAtlas: pixel-art Minecraft teksturalar ──
    // buildTextureAtlas() canvas orqali procedural 16x16 plitkalar yaratadi.
    const atlas = buildTextureAtlas();
    this._atlasTexture = atlas.texture;
    this._getUV = atlas.getUV;

    // ── Opaque material: TextureAtlas + vertex colors (AO uchun) ──
    // vertexColors: THREE.VertexColors — vertex rangi bilan teksturani ko'paytiradi.
    // map: atlas teksturasi — NearestFilter (pixel-art, blur yo'q).
    this.opaqueMat = new THREE.MeshLambertMaterial({
      map: this._atlasTexture,
      vertexColors: true,
    });

    // ── Glass material: shaffof, atlas teksturasi ──
    this.glassMat = new THREE.MeshLambertMaterial({
      map: this._atlasTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    // ── Water ShaderMaterial — animatsion to'lqin + fresnel ──
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime:    { value: 0 },
        uAtlas:   { value: this._atlasTexture },
      },
      vertexShader: /* glsl */`
        attribute vec3 color;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        uniform float uTime;

        void main() {
          vColor = color;
          vUv = uv;
          vec3 pos = position;
          if (normal.y > 0.5) {
            pos.y += sin(pos.x * 1.8 + uTime * 1.4) * 0.035;
            pos.y += sin(pos.z * 2.2 + uTime * 1.1) * 0.025;
          }
          vWorldPos = pos;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        uniform float uTime;
        uniform sampler2D uAtlas;

        void main() {
          float ripple = sin(vWorldPos.x * 3.0 + uTime * 2.0) * 0.04
                       + sin(vWorldPos.z * 2.5 + uTime * 1.7) * 0.03;
          vec4 texColor = texture2D(uAtlas, vUv);
          vec3 col = texColor.rgb * vColor + vec3(ripple * 0.3, ripple * 0.5, ripple * 0.2);
          col = clamp(col, 0.0, 1.0);
          gl_FragColor = vec4(col, 0.72);
        }
      `,
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

    // ── View mode: 'first' | 'third' ──
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
    const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

    const far  = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
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

    if (player.inWater) {
      this.scene.background = new THREE.Color(0x123d6e);
      this.scene.fog = new THREE.Fog(0x123d6e, 1.5, 14);
    } else {
      this.scene.background = new THREE.Color(0x87ceeb);
      this.scene.fog = new THREE.Fog(0x87ceeb, 80, 180);
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
        const worldPos = new THREE.Vector3(cur.x, cur.y + 2.4, cur.z);
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

    const { opaqueGeom, glassGeom, waterGeom } = buildChunkMesh(
      chunk, this.world, this.world.fluid, this._getUV
    );
    const newEntry = { opaqueMesh: null, glassMesh: null, waterMesh: null };

    if (opaqueGeom) {
      newEntry.opaqueMesh = new THREE.Mesh(opaqueGeom, this.opaqueMat);
      this.scene.add(newEntry.opaqueMesh);
    }
    if (glassGeom) {
      newEntry.glassMesh = new THREE.Mesh(glassGeom, this.glassMat);
      this.scene.add(newEntry.glassMesh);
    }
    if (waterGeom) {
      newEntry.waterMesh = new THREE.Mesh(waterGeom, this.waterMat);
      this.scene.add(newEntry.waterMesh);
    }

    this.chunkMeshes.set(key, newEntry);
    chunk.dirty = false;
  }
}