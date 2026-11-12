const TREE_ASSETS = [
  'oak-tree-mature', 'maple-tree-mature', 'pine-tree-mature',
  'birch-tree-mature', 'cherry-blossom-tree-mature', 'weeping-willow-mature',
];
const DETAIL_ASSETS = ['small-rock', 'mossy-rock', 'fallen-log', 'tree-stump'];
const objectAssets = new Set(DETAIL_ASSETS);

function hash(seed, ...values) {
  let h = seed >>> 0;
  for (const value of values) {
    h ^= Math.imul((Math.floor(value * 4096) | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smooth(0, 1, x - x0), tz = smooth(0, 1, z - z0);
  const a = hash(seed, x0, z0), b = hash(seed, x0 + 1, z0);
  const c = hash(seed, x0, z0 + 1), d = hash(seed, x0 + 1, z0 + 1);
  const top = a + (b - a) * tx, bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}

function boundsDistance(x, z, half) {
  return Math.max(Math.abs(x), Math.abs(z)) - half;
}

function speciesHeight(asset) {
  if (TREE_ASSETS.includes(asset)) {
    if (asset === 'pine-tree-mature') return 4.2;
    if (asset === 'weeping-willow-mature') return 5.0;
    return 4.7;
  }
  if (asset === 'fallen-log') return 1.2;
  if (asset === 'tree-stump') return 1.35;
  if (asset.endsWith('rock')) return asset === 'mossy-rock' ? 1.15 : 0.86;
  if (asset.includes('mushroom')) return 0.95;
  if (asset === 'boston-fern-mature') return 1.85;
  if (asset === 'lavender-mature') return 1.75;
  if (asset === 'daisy-mature') return 1.45;
  return 2.0;
}

function sourceFor(asset) {
  // Use the approved, fully illustrated pine artwork for the surrounding
  // forest too. The catalog's pine-tree-mature asset is only a simplified
  // stage icon and reads like a placeholder when drawn at wilderness scale.
  if (asset === 'pine-tree-mature') return './assets/pine-mature.png';
  return objectAssets.has(asset)
    ? `./assets/garden-objects/${asset}.png`
    : `./assets/plants/${asset}.png`;
}

export class WildernessLayer {
  constructor(THREE, scene, options = {}) {
    this.THREE = THREE;
    this.scene = scene;
    this.seed = options.seed ?? 0x4c697474;
    this.playableHalf = options.playableHalf ?? 25;
    this.outerHalf = options.outerHalf ?? 39;
    this.chunkSize = options.chunkSize ?? 16;
    this.textures = new Map();
    this.failed = new Set();
    this.chunks = new Map();
    this.originX = options.originX ?? 0;
    this.originY = options.originY ?? 0;
    this.group = new THREE.Group();
    this.group.position.set(-this.originX, 0, -this.originY);
    this.group.renderOrder = 0;
    scene.add(this.group);
    this.fenceGroup = new THREE.Group();
    this.fenceGroup.renderOrder = 4;
    this.group.add(this.fenceGroup);
    this.fenceReady = false;
    this.loadFence();
  }

  loadTexture(asset) {
    if (this.textures.has(asset) || this.failed.has(asset)) return;
    const loader = new this.THREE.TextureLoader();
    loader.load(sourceFor(asset), texture => {
      texture.colorSpace = this.THREE.SRGBColorSpace;
      texture.magFilter = this.THREE.NearestFilter;
      texture.minFilter = this.THREE.NearestMipmapNearestFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 1;
      this.textures.set(asset, texture);
      // The same deterministic chunk records are used after load; refreshing a
      // chunk only creates GPU batches and never rolls new placement values.
      for (const chunk of this.chunks.values()) this.buildChunkMeshes(chunk);
    }, undefined, () => this.failed.add(asset));
  }

  loadFence() {
    const masks = new Set([10, 5, 6, 12, 9, 3]);
    const geometry = new this.THREE.PlaneGeometry(1.04, 1.04);
    geometry.rotateX(-Math.PI / 2);
    for (const mask of masks) {
      const texture = new this.THREE.CanvasTexture(this.createFenceSegment(96, mask));
      texture.colorSpace = this.THREE.SRGBColorSpace;
      texture.magFilter = this.THREE.NearestFilter;
      texture.minFilter = this.THREE.NearestMipmapNearestFilter;
      texture.generateMipmaps = true;
      const material = new this.THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.12,
        side: this.THREE.DoubleSide, depthWrite: false,
      });
      const points = this.fencePoints(mask);
      if (!points.length) { texture.dispose(); material.dispose(); continue; }
      const mesh = new this.THREE.InstancedMesh(geometry, material, points.length);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      const matrix = new this.THREE.Matrix4();
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        matrix.makeRotationY(point.rotation || 0);
        matrix.setPosition(point.x, 0.075, point.z);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.fenceGroup.add(mesh);
    }
    this.fenceReady = true;
  }

  createFenceSegment(size, connections) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    const half = size / 2;
    const unit = size / 64;
    const rect = (x, y, w, h, color) => {
      context.fillStyle = color;
      context.fillRect(Math.round(x * unit), Math.round(y * unit), Math.ceil(w * unit), Math.ceil(h * unit));
    };
    const drawArm = angle => {
      context.save();
      context.translate(half, half);
      context.rotate(angle);
      // Bold pixel rails span each cell. A warm, low-contrast palette keeps
      // them legible without turning the boundary into a heavy wall.
      for (const railY of [-7, 4]) {
        rect(-1, railY - 1, 34, 8, '#39271d');
        rect(0, railY, 33, 5, '#82502d');
        rect(1, railY, 29, 2, '#c47a3d');
        rect(1, railY + 3, 31, 1, '#633b25');
      }
      context.restore();
    };
    if (connections & 1) drawArm(-Math.PI / 2);
    if (connections & 2) drawArm(0);
    if (connections & 4) drawArm(Math.PI / 2);
    if (connections & 8) drawArm(Math.PI);
    // Draw a substantial, warm post at each grid intersection. Posts repeat
    // exactly at one-cell intervals, while the rails meet at their centers.
    rect(25, 21, 14, 22, '#39271d');
    rect(27, 22, 10, 20, '#754526');
    rect(28, 23, 3, 16, '#d18a49');
    rect(32, 24, 3, 14, '#a45d32');
    rect(27, 40, 10, 3, '#513321');
    return canvas;
  }

  fencePoints(mask) {
    const h = this.playableHalf;
    const points = [];
    const add = (x, z, connections, rotation = 0) => {
      if (connections === mask) points.push({ x, z, rotation });
    };
    for (let x = -h; x <= h; x += 1) {
      if (x === -h) add(x, -h, 2 | 4);
      else if (x === h) add(x, -h, 8 | 4);
      else add(x, -h, 2 | 8);

      if (x === -h) add(x, h, 2 | 1);
      else if (x === h) add(x, h, 8 | 1);
      else add(x, h, 2 | 8);
    }
    for (let z = -h + 1; z < h; z += 1) {
      add(-h, z, 1 | 4);
      add(h, z, 1 | 4);
    }
    return points;
  }

  generateChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    const chunk = { key, group: new this.THREE.Group(), records: new Map(), meshes: [] };
    const minX = chunkX * this.chunkSize, maxX = minX + this.chunkSize;
    const minZ = chunkZ * this.chunkSize, maxZ = minZ + this.chunkSize;
    const add = (asset, x, z, scale = 1, rotation = 0, layer = 0) => {
      if (x < minX || x >= maxX || z < minZ || z >= maxZ) return;
      if (boundsDistance(x, z, this.playableHalf) <= 0.12) return;
      if (Math.abs(x) > this.outerHalf - 0.55 || Math.abs(z) > this.outerHalf - 0.55) return;
      if (!chunk.records.has(asset)) chunk.records.set(asset, []);
      chunk.records.get(asset).push({ x, z, scale, rotation, layer });
      this.loadTexture(asset);
    };

    // Jittered, overlapping woodland nuclei establish broad forest masses.
    // Every member uses a world-coordinate hash, so chunking and camera motion
    // cannot change the ecosystem layout.
    const spacing = 6.9;
    const ix0 = Math.floor((minX - 9) / spacing), ix1 = Math.ceil((maxX + 9) / spacing);
    const iz0 = Math.floor((minZ - 9) / spacing), iz1 = Math.ceil((maxZ + 9) / spacing);
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const cx = ix * spacing + (hash(this.seed, ix, iz, 1) - 0.5) * 4.3;
        const cz = iz * spacing + (hash(this.seed, ix, iz, 2) - 0.5) * 4.3;
        if (cx < minX - 9 || cx >= maxX + 9 || cz < minZ - 9 || cz >= maxZ + 9) continue;
        const regional = valueNoise(cx * 0.075, cz * 0.075, this.seed ^ 0x31bc2f19);
        // Lower noise valleys become irregular clearings; ridges fill in as a
        // dense canopy. Distance smoothly moves the woodland inward from edge.
        const band = smooth(1.8, 5.6, boundsDistance(cx, cz, this.playableHalf));
        const density = band * (0.58 + regional * 0.56);
        if (hash(this.seed, ix, iz, 3) > density) continue;
        const members = 5 + Math.floor(hash(this.seed, ix, iz, 4) * 8);
        for (let member = 0; member < members; member += 1) {
          const angle = hash(this.seed, ix, iz, member, 5) * Math.PI * 2;
          const radius = 0.45 + Math.sqrt(hash(this.seed, ix, iz, member, 6)) * 3.55;
          const x = cx + Math.cos(angle) * radius;
          const z = cz + Math.sin(angle) * radius * (0.72 + hash(this.seed, ix, iz, member, 7) * 0.5);
          const edge = boundsDistance(x, z, this.playableHalf);
          if (edge < 1.45 || edge > this.outerHalf - this.playableHalf - 0.7) continue;
          const perTree = valueNoise(x * 0.15, z * 0.15, this.seed ^ 0x71a334ad);
          if (hash(this.seed, ix, iz, member, 8) > 0.56 + perTree * 0.4) continue;
          const pick = hash(this.seed, ix, iz, member, 9);
          const asset = pick < 0.29 ? 'oak-tree-mature'
            : pick < 0.49 ? 'maple-tree-mature'
              : pick < 0.70 ? 'pine-tree-mature'
                : pick < 0.84 ? 'birch-tree-mature'
                  : pick < 0.93 ? 'cherry-blossom-tree-mature' : 'weeping-willow-mature';
          const size = [0.86, 0.96, 1.04, 1.14][Math.floor(hash(this.seed, ix, iz, member, 10) * 4)];
          add(asset, x, z, size, 0, 0);
        }

        // Understory is organized around those clusters: ferns under shade,
        // flowering patches in lighter pockets, and a few floor details.
        const details = 5 + Math.floor(regional * 5);
        for (let detail = 0; detail < details; detail += 1) {
          const angle = hash(this.seed, ix, iz, detail, 12) * Math.PI * 2;
          const radius = 1.0 + hash(this.seed, ix, iz, detail, 13) * 4.5;
          const x = cx + Math.cos(angle) * radius;
          const z = cz + Math.sin(angle) * radius;
          const edge = boundsDistance(x, z, this.playableHalf);
          if (edge < 0.3 || edge > this.outerHalf - this.playableHalf - 0.6) continue;
          const roll = hash(this.seed, ix, iz, detail, 14);
          const lightPocket = valueNoise(x * 0.12, z * 0.12, this.seed ^ 0x5b61c72d);
          let asset;
          if (roll < (0.33 + (1 - regional) * 0.12)) asset = 'boston-fern-mature';
          else if (roll < 0.59) asset = lightPocket > 0.56 ? 'daisy-mature' : 'lavender-mature';
          else if (roll < 0.82) asset = ['azalea-mature', 'holly-bush-mature', 'blueberry-bush-mature'][Math.floor(hash(this.seed, ix, iz, detail, 15) * 3)];
          else if (roll < 0.91) asset = hash(this.seed, ix, iz, detail, 16) < 0.5 ? 'small-rock' : 'mossy-rock';
          else if (roll < 0.955) asset = hash(this.seed, ix, iz, detail, 17) < 0.7 ? 'fallen-log' : 'tree-stump';
          else asset = hash(this.seed, ix, iz, detail, 18) < 0.5 ? 'fly-agaric-mushroom-mature' : 'chanterelle-mushroom-mature';
          const scale = 0.78 + hash(this.seed, ix, iz, detail, 19) * 0.38;
          const rotation = objectAssets.has(asset) ? Math.floor(hash(this.seed, ix, iz, detail, 20) * 4) * Math.PI / 2 : 0;
          add(asset, x, z, scale, rotation, 1);
        }
      }
    }

    this.group.add(chunk.group);
    this.chunks.set(key, chunk);
    this.buildChunkMeshes(chunk);
    return chunk;
  }

  buildChunkMeshes(chunk) {
    for (const mesh of chunk.meshes) {
      chunk.group.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
    }
    chunk.meshes.length = 0;
    const THREE = this.THREE;
    for (const [asset, records] of chunk.records) {
      const texture = this.textures.get(asset);
      if (!texture || records.length === 0) continue;
      const image = texture.image;
      const aspect = image?.naturalWidth && image?.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
      const height = speciesHeight(asset);
      const width = height * aspect;
      const geometry = new THREE.PlaneGeometry(width, height);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.05,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, records.length);
      mesh.renderOrder = 0;
      mesh.frustumCulled = false;
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const anchor = height * (objectAssets.has(asset) ? 0.43 : 0.425);
      for (let i = 0; i < records.length; i += 1) {
        const record = records[i];
        // Height encodes front-to-back overlap: objects nearer the south of
        // the top-down view naturally draw over the canopy behind them.
        const depth = Math.max(0, Math.min(1, (record.z + this.outerHalf) / (2 * this.outerHalf)));
        position.set(record.x, 0.026 + depth * 0.044 + record.layer * 0.0004, record.z - anchor);
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), record.rotation);
        scale.setScalar(record.scale);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      chunk.group.add(mesh);
      chunk.meshes.push(mesh);
    }
  }

  update(centerX, centerZ, viewWidth, viewHeight, originX = 0, originY = 0) {
    this.originX = originX;
    this.originY = originY;
    this.group.position.set(-originX, 0, -originY);
    const buffer = 1;
    const minChunkX = Math.max(Math.floor(-this.outerHalf / this.chunkSize), Math.floor((centerX - viewWidth / 2) / this.chunkSize) - buffer);
    const maxChunkX = Math.min(Math.floor((this.outerHalf - Number.EPSILON) / this.chunkSize), Math.floor((centerX + viewWidth / 2) / this.chunkSize) + buffer);
    const minChunkZ = Math.max(Math.floor(-this.outerHalf / this.chunkSize), Math.floor((centerZ - viewHeight / 2) / this.chunkSize) - buffer);
    const maxChunkZ = Math.min(Math.floor((this.outerHalf - Number.EPSILON) / this.chunkSize), Math.floor((centerZ + viewHeight / 2) / this.chunkSize) + buffer);
    const wanted = new Set();
    for (let z = minChunkZ; z <= maxChunkZ; z += 1) {
      for (let x = minChunkX; x <= maxChunkX; x += 1) {
        const key = `${x},${z}`;
        wanted.add(key);
        if (!this.chunks.has(key)) this.generateChunk(x, z);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (wanted.has(key)) continue;
      this.group.remove(chunk.group);
      for (const mesh of chunk.meshes) {
        mesh.material.dispose();
        mesh.geometry.dispose();
      }
      this.chunks.delete(key);
    }
  }

  animate() {}

  dispose() {
    for (const chunk of this.chunks.values()) {
      for (const mesh of chunk.meshes) {
        mesh.material.dispose();
        mesh.geometry.dispose();
      }
    }
    for (const texture of this.textures.values()) texture.dispose();
    this.scene.remove(this.group);
    this.chunks.clear();
    this.textures.clear();
  }
}
