import {
  GRASS_PALETTE,
  TERRAIN_DEFAULTS,
  WILDERNESS_PALETTE,
  carpetMarkAt,
  grassTuftAt,
  sampleWorldGrassColor,
} from './terrain-core.mjs?v=20261112-woodland-v4';

function hexRgb(hex) {
  const color = Number.parseInt(hex.slice(1), 16);
  return [(color >>> 16) & 255, (color >>> 8) & 255, color & 255];
}

export function intersectChunkWithBounds(chunkX, chunkY, chunkSize, bounds) {
  const x = chunkX * chunkSize;
  const y = chunkY * chunkSize;
  const minX = Math.max(x, bounds.minX);
  const minY = Math.max(y, bounds.minY);
  const maxX = Math.min(x + chunkSize, bounds.maxX);
  const maxY = Math.min(y + chunkSize, bounds.maxY);
  if (maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function paintChunkCanvas(chunkX, chunkY, settings) {
  const { chunkSize, pixelsPerUnit, seed, palette, tuftCellSize } = settings;
  const canvas = document.createElement('canvas');
  const dimension = chunkSize * pixelsPerUnit;
  canvas.width = dimension;
  canvas.height = dimension;
  const context = canvas.getContext('2d', { alpha: false });
  const image = context.createImageData(dimension, dimension);
  const pixels = image.data;
  const originX = chunkX * chunkSize;
  const originY = chunkY * chunkSize;
  for (let py = 0; py < dimension; py += 1) {
    const worldY = originY + py / pixelsPerUnit;
    for (let px = 0; px < dimension; px += 1) {
      const worldX = originX + px / pixelsPerUnit;
      const color = sampleWorldGrassColor(worldX, worldY, settings);
      const [red, green, blue] = color;
      const offset = (py * dimension + px) * 4;
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const colorCache = Object.fromEntries(
    Object.entries(palette).map(([name, hex]) => [name, hexRgb(hex)]),
  );
  const forestColorCache = Object.fromEntries(
    Object.entries(settings.wildernessPalette || WILDERNESS_PALETTE)
      .map(([name, hex]) => [name, hexRgb(hex)]),
  );
  const margin = 2;
  const cellMinX = Math.floor((originX - margin) / tuftCellSize);
  const cellMaxX = Math.ceil((originX + chunkSize + margin) / tuftCellSize);
  const cellMinY = Math.floor((originY - margin) / tuftCellSize);
  const cellMaxY = Math.ceil((originY + chunkSize + margin) / tuftCellSize);

  const markSize = settings.carpetCellSize;
  const markShapes = [
    [[0, 0], [1, 0], [2, 0]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[0, 0], [1, 0], [0, 1]],
  ];
  const markMinX = Math.floor((originX - 0.35) / markSize);
  const markMaxX = Math.ceil((originX + chunkSize + 0.35) / markSize);
  const markMinY = Math.floor((originY - 0.35) / markSize);
  const markMaxY = Math.ceil((originY + chunkSize + 0.35) / markSize);
  for (let cellY = markMinY; cellY <= markMaxY; cellY += 1) {
    for (let cellX = markMinX; cellX <= markMaxX; cellX += 1) {
      const mark = carpetMarkAt(cellX, cellY, settings);
      if (!mark) continue;
      const tone = mark.tone > 0.95 ? 'light' : mark.tone < 0.32 ? 'secondary' : 'primary';
      const forestFloor = Math.max(Math.abs(mark.x), Math.abs(mark.y)) > (settings.playableHalf ?? 25);
      const [red, green, blue] = (forestFloor ? forestColorCache : colorCache)[tone];
      const px = Math.round((mark.x - originX) * pixelsPerUnit);
      const py = Math.round((mark.y - originY) * pixelsPerUnit);
      for (const [dx, dy] of markShapes[mark.variant]) {
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            const x = px + dx * 2 + sx;
            const y = py + dy * 2 + sy;
            if (x < 0 || y < 0 || x >= dimension || y >= dimension) continue;
            const offset = (y * dimension + x) * 4;
            pixels[offset] = red;
            pixels[offset + 1] = green;
            pixels[offset + 2] = blue;
            pixels[offset + 3] = 255;
          }
        }
      }
    }
  }

  for (let cellY = cellMinY; cellY <= cellMaxY; cellY += 1) {
    for (let cellX = cellMinX; cellX <= cellMaxX; cellX += 1) {
      const tuft = grassTuftAt(cellX, cellY, settings);
      if (!tuft) continue;

      const rootX = Math.round((tuft.x - originX) * pixelsPerUnit) - 3;
      const rootY = Math.round((tuft.y - originY) * pixelsPerUnit);
      const forestFloor = Math.max(Math.abs(tuft.x), Math.abs(tuft.y)) > (settings.playableHalf ?? 25);
      const detailPalette = forestFloor ? forestColorCache : colorCache;
      const tuftColors = { p: detailPalette.primary, s: detailPalette.dark, l: detailPalette.highlight };
      for (let row = 0; row < tuft.pixels.length; row += 1) {
        for (let column = 0; column < tuft.pixels[row].length; column += 1) {
          const symbol = tuft.pixels[row][column];
          if (symbol === '.') continue;
          const px = rootX + column;
          const py = rootY - (tuft.pixels.length - 1 - row);
          if (px < 0 || py < 0 || px >= dimension || py >= dimension) continue;
          const [red, green, blue] = tuftColors[symbol];
          const offset = (py * dimension + px) * 4;
          pixels[offset] = red;
          pixels[offset + 1] = green;
          pixels[offset + 2] = blue;
          pixels[offset + 3] = 255;
        }
      }
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

export class GrassTerrainLayer {
  constructor(THREE, scene, options = {}) {
    this.THREE = THREE;
    this.settings = {
      ...TERRAIN_DEFAULTS,
      ...options,
      palette: { ...GRASS_PALETTE, ...(options.palette || {}) },
      wildernessPalette: { ...WILDERNESS_PALETTE, ...(options.wildernessPalette || {}) },
    };
    this.group = new THREE.Group();
    this.group.renderOrder = 0;
    scene.add(this.group);
    this.meshes = new Map();
    this.textureCache = new Map();
    this.maxCachedTextures = Math.max(8, this.settings.cacheSize);
    this.originX = 0;
    this.originY = 0;
  }

  key(chunkX, chunkY) {
    return `${chunkX},${chunkY}`;
  }

  getTexture(chunkX, chunkY) {
    const key = this.key(chunkX, chunkY);
    if (this.textureCache.has(key)) {
      const texture = this.textureCache.get(key);
      this.textureCache.delete(key);
      this.textureCache.set(key, texture);
      return texture;
    }

    const texture = new this.THREE.CanvasTexture(paintChunkCanvas(chunkX, chunkY, this.settings));
    texture.colorSpace = this.THREE.SRGBColorSpace;
    texture.magFilter = this.THREE.NearestFilter;
    texture.minFilter = this.THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 1;
    this.textureCache.set(key, texture);
    return texture;
  }

  addChunk(chunkX, chunkY) {
    const key = this.key(chunkX, chunkY);
    const { chunkSize, bounds } = this.settings;
    const clipped = intersectChunkWithBounds(chunkX, chunkY, chunkSize, bounds);
    if (!clipped) return;
    const texture = this.getTexture(chunkX, chunkY);
    const material = new this.THREE.MeshBasicMaterial({ map: texture });
    const geometry = new this.THREE.PlaneGeometry(clipped.width, clipped.height);
    geometry.rotateX(-Math.PI / 2);
    const chunkX0 = chunkX * chunkSize;
    const chunkY0 = chunkY * chunkSize;
    const u0 = (clipped.minX - chunkX0) / chunkSize;
    const u1 = (clipped.maxX - chunkX0) / chunkSize;
    // The rotated plane's north edge is -Z. CanvasTexture flips Y on upload,
    // so map that edge to the chunk texture's top row. This keeps neighboring
    // chunks sampling the same world-space coordinates along their seams.
    const vNorth = 1 - (clipped.minY - chunkY0) / chunkSize;
    const vSouth = 1 - (clipped.maxY - chunkY0) / chunkSize;
    geometry.setAttribute('uv', new this.THREE.Float32BufferAttribute([
      u0, vNorth, u1, vNorth, u0, vSouth, u1, vSouth,
    ], 2));
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.position.set(
      (clipped.minX + clipped.maxX) / 2 - this.originX,
      0,
      (clipped.minY + clipped.maxY) / 2 - this.originY,
    );
    mesh.userData.terrainChunk = key;
    mesh.userData.terrainCenterX = (clipped.minX + clipped.maxX) / 2;
    mesh.userData.terrainCenterY = (clipped.minY + clipped.maxY) / 2;
    this.group.add(mesh);
    this.meshes.set(key, mesh);
  }

  update(centerX, centerY, viewWidth, viewHeight, originX = 0, originY = 0) {
    const { chunkSize, chunkBuffer } = this.settings;
    if (originX !== this.originX || originY !== this.originY) {
      this.originX = originX;
      this.originY = originY;
      for (const mesh of this.meshes.values()) {
        mesh.position.set(
          mesh.userData.terrainCenterX - originX,
          0,
          mesh.userData.terrainCenterY - originY,
        );
      }
    }
    const { bounds } = this.settings;
    const worldMinX = centerX - viewWidth / 2;
    const worldMaxX = centerX + viewWidth / 2;
    const worldMinY = centerY - viewHeight / 2;
    const worldMaxY = centerY + viewHeight / 2;
    const minX = Math.max(Math.floor((worldMinX - chunkBuffer * chunkSize) / chunkSize), Math.floor(bounds.minX / chunkSize));
    const maxX = Math.min(Math.floor((worldMaxX + chunkBuffer * chunkSize) / chunkSize), Math.floor((bounds.maxX - Number.EPSILON) / chunkSize));
    const minY = Math.max(Math.floor((worldMinY - chunkBuffer * chunkSize) / chunkSize), Math.floor(bounds.minY / chunkSize));
    const maxY = Math.min(Math.floor((worldMaxY + chunkBuffer * chunkSize) / chunkSize), Math.floor((bounds.maxY - Number.EPSILON) / chunkSize));
    const wanted = new Set();

    for (let chunkY = minY; chunkY <= maxY; chunkY += 1) {
      for (let chunkX = minX; chunkX <= maxX; chunkX += 1) {
        const key = this.key(chunkX, chunkY);
        wanted.add(key);
        if (!this.meshes.has(key)) this.addChunk(chunkX, chunkY);
      }
    }

    for (const [key, mesh] of this.meshes) {
      if (wanted.has(key)) continue;
      this.group.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
      this.meshes.delete(key);
    }

    this.trimTextureCache(wanted);
  }

  trimTextureCache(activeKeys) {
    if (this.textureCache.size <= this.maxCachedTextures) return;
    for (const [key, texture] of this.textureCache) {
      if (this.textureCache.size <= this.maxCachedTextures) break;
      if (activeKeys.has(key)) continue;
      texture.dispose();
      this.textureCache.delete(key);
    }
  }

  dispose() {
    for (const mesh of this.meshes.values()) mesh.material.dispose();
    for (const texture of this.textureCache.values()) texture.dispose();
    this.group.removeFromParent();
    this.meshes.clear();
    this.textureCache.clear();
  }
}
