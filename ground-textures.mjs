const TILE_PIXELS = 64;

export const GROUND_MATERIALS = {
  dirt: {
    label: 'Dirt', base: '#79583d', shades: ['#694b35', '#876548', '#9a7654', '#60452f'],
    texture: 'soil',
  },
  sand: {
    label: 'Sand', base: '#d2bd8d', shades: ['#c5ae7d', '#dfcc9f', '#ead9b0', '#bca574'],
    texture: 'grain',
  },
  mulch: {
    label: 'Mulch', base: '#503a2c', shades: ['#624632', '#715039', '#3e2e25', '#815d40'],
    texture: 'chips',
  },
  pea_gravel: {
    label: 'Pea Gravel', base: '#b2a58c', shades: ['#817c70', '#c6b89c', '#9d927f', '#d2c5ad'],
    texture: 'pebbles',
  },
  river_rocks: {
    label: 'River Rocks', base: '#a69c88', shades: ['#777b72', '#c2b69e', '#8b8d83', '#d0c3aa'],
    texture: 'river',
  },
  wood_chips: {
    label: 'Wood Chips', base: '#98704b', shades: ['#b48b5b', '#7f5d3f', '#c49b68', '#76563c'],
    texture: 'wood',
  },
  pine_straw: {
    label: 'Pine Straw', base: '#8b5036', shades: ['#a75c38', '#6d412f', '#bb7043', '#74432f'],
    texture: 'needles',
  },
};

function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x119de1f3) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function rgb(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function drawFeature(context, material, gx, gy) {
  const data = GROUND_MATERIALS[material];
  const cellSize = data.texture === 'pebbles' ? 9 : data.texture === 'river' ? 17 : data.texture === 'chips' ? 12 : data.texture === 'wood' ? 15 : data.texture === 'needles' ? 10 : data.texture === 'soil' ? 5 : 6;
  const minX = Math.floor(gx / cellSize) - 1;
  const maxX = Math.ceil((gx + TILE_PIXELS) / cellSize) + 1;
  const minY = Math.floor(gy / cellSize) - 1;
  const maxY = Math.ceil((gy + TILE_PIXELS) / cellSize) + 1;
  for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
    const seed = hash(cx, cy, material.length * 193);
    const centerX = cx * cellSize + (seed % cellSize) + cellSize / 2 - gx;
    const centerY = cy * cellSize + ((seed >>> 8) % cellSize) + cellSize / 2 - gy;
    const shade = data.shades[(seed >>> 16) % data.shades.length];
    const width = (data.texture === 'soil' || data.texture === 'grain') ? 1 + ((seed >>> 20) % 3)
      : 3 + ((seed >>> 20) % (data.texture === 'river' ? 11 : data.texture === 'pebbles' ? 5 : 7));
    const height = (data.texture === 'soil' || data.texture === 'grain') ? 1 + ((seed >>> 25) % 2)
      : 2 + ((seed >>> 25) % (data.texture === 'river' ? 7 : data.texture === 'pebbles' ? 4 : 3));
    context.save();
    context.translate(centerX, centerY);
    context.rotate(((seed >>> 12) % 8 - 4) * (data.texture === 'needles' ? 0.12 : 0.18));
    if (data.texture === 'pebbles' || data.texture === 'river') {
      context.fillStyle = '#453f37';
      context.beginPath();
      context.ellipse(1, 1, width / 2 + 1, height / 2 + 1, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = shade;
      context.beginPath();
      context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = data.shades[(seed >>> 6) % data.shades.length];
      context.fillRect(-width / 4, -height / 3, Math.max(2, width / 2), Math.max(1, height / 3));
    } else if (data.texture === 'soil' || data.texture === 'grain') {
      context.fillStyle = shade;
      context.fillRect(Math.round(centerX), Math.round(centerY), width, height);
      if ((seed & 3) === 0) {
        context.fillStyle = data.shades[(seed >>> 6) % data.shades.length];
        context.fillRect(Math.round(centerX) + 1, Math.round(centerY) + 1, 1, 1);
      }
    } else if (data.texture === 'needles') {
      context.fillStyle = shade;
      context.fillRect(-width / 2, -1, width, 2);
      context.fillStyle = data.shades[(seed >>> 6) % data.shades.length];
      context.fillRect(-width / 2, 1, width - 2, 1);
    } else {
      context.fillStyle = '#453326';
      context.fillRect(-width / 2, -height / 2 + 1, width, height);
      context.fillStyle = shade;
      context.fillRect(-width / 2 + 1, -height / 2, width - 2, height - 1);
      context.fillStyle = data.shades[(seed >>> 6) % data.shades.length];
      context.fillRect(-width / 2 + 1, -height / 2, Math.max(2, width - 3), 1);
    }
    context.restore();
  }
}

function edgeInset(material, neighbors, x, y, edge, along) {
  if (material === neighbors[edge]) return 0;
  const worldEdgeX = edge === 'left' ? x * TILE_PIXELS : edge === 'right' ? (x + 1) * TILE_PIXELS : x * TILE_PIXELS + along;
  const worldEdgeY = edge === 'top' ? y * TILE_PIXELS : edge === 'bottom' ? (y + 1) * TILE_PIXELS : y * TILE_PIXELS + along;
  return 1 + (hash(Math.floor(worldEdgeX / 3), Math.floor(worldEdgeY / 3), 0x73a1) % 4);
}

export function createGroundTileCanvas(material, x, y, neighbors = {}) {
  const data = GROUND_MATERIALS[material];
  if (!data) throw new Error(`Unknown ground material: ${material}`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_PIXELS;
  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = false;
  const [baseR, baseG, baseB] = rgb(data.base);
  const pixels = context.createImageData(TILE_PIXELS, TILE_PIXELS);
  const originX = x * TILE_PIXELS, originY = y * TILE_PIXELS;
  for (let py = 0; py < TILE_PIXELS; py += 1) for (let px = 0; px < TILE_PIXELS; px += 1) {
    const grain = hash(Math.floor((originX + px) / 4), Math.floor((originY + py) / 4), material.length) % 13 - 6;
    const offset = (py * TILE_PIXELS + px) * 4;
    pixels.data[offset] = Math.max(0, Math.min(255, baseR + grain));
    pixels.data[offset + 1] = Math.max(0, Math.min(255, baseG + grain));
    pixels.data[offset + 2] = Math.max(0, Math.min(255, baseB + grain));
    pixels.data[offset + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  drawFeature(context, material, originX, originY);
  const image = context.getImageData(0, 0, TILE_PIXELS, TILE_PIXELS);
  for (let py = 0; py < TILE_PIXELS; py += 1) for (let px = 0; px < TILE_PIXELS; px += 1) {
    const inset = Math.max(
      px < 5 ? edgeInset(material, neighbors, x, y, 'left', py) - px : 0,
      px > TILE_PIXELS - 6 ? edgeInset(material, neighbors, x, y, 'right', py) - (TILE_PIXELS - 1 - px) : 0,
      py < 5 ? edgeInset(material, neighbors, x, y, 'top', px) - py : 0,
      py > TILE_PIXELS - 6 ? edgeInset(material, neighbors, x, y, 'bottom', px) - (TILE_PIXELS - 1 - py) : 0,
    );
    if (inset > 0) image.data[(py * TILE_PIXELS + px) * 4 + 3] = 0;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export class GroundTextureLayer {
  constructor(THREE, scene, { chunkSize = 4, worldHalf = 25 } = {}) {
    this.THREE = THREE;
    this.scene = scene;
    this.chunkSize = chunkSize;
    this.worldHalf = worldHalf;
    this.originX = 0;
    this.originY = 0;
    this.meshes = new Map();
    this.tiles = [];
    this.signature = '';
  }

  setTiles(tiles) {
    const next = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x || a.material.localeCompare(b.material));
    const signature = next.map(tile => `${tile.x},${tile.y},${tile.material}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    this.tiles = next;
    this.rebuild();
  }

  updateOrigin(originX, originY) {
    this.originX = originX;
    this.originY = originY;
    for (const mesh of this.meshes.values()) {
      mesh.position.set(mesh.userData.worldX - originX, 0.012, mesh.userData.worldY - originY);
    }
  }

  rebuild() {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map.dispose();
      mesh.material.dispose();
    }
    this.meshes.clear();
    const tileMap = new Map(this.tiles.map(tile => [`${tile.x},${tile.y}`, tile.material]));
    const groups = new Map();
    for (const tile of this.tiles) {
      const cx = Math.floor(tile.x / this.chunkSize), cy = Math.floor(tile.y / this.chunkSize);
      const key = `${cx},${cy}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tile);
    }
    for (const [key, chunkTiles] of groups) {
      const [cx, cy] = key.split(',').map(Number);
      const minX = cx * this.chunkSize, minY = cy * this.chunkSize;
      const widthCells = Math.min(this.chunkSize, 50 - minX), heightCells = Math.min(this.chunkSize, 50 - minY);
      const canvas = document.createElement('canvas');
      canvas.width = widthCells * TILE_PIXELS;
      canvas.height = heightCells * TILE_PIXELS;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      for (const tile of chunkTiles) {
        const neighbors = {
          left: tileMap.get(`${tile.x - 1},${tile.y}`), right: tileMap.get(`${tile.x + 1},${tile.y}`),
          top: tileMap.get(`${tile.x},${tile.y - 1}`), bottom: tileMap.get(`${tile.x},${tile.y + 1}`),
        };
        context.drawImage(createGroundTileCanvas(tile.material, tile.x, tile.y, neighbors),
          (tile.x - minX) * TILE_PIXELS, (tile.y - minY) * TILE_PIXELS);
      }
      const texture = new this.THREE.CanvasTexture(canvas);
      texture.colorSpace = this.THREE.SRGBColorSpace;
      texture.magFilter = this.THREE.NearestFilter;
      texture.minFilter = this.THREE.NearestMipmapNearestFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 1;
      const geometry = new this.THREE.PlaneGeometry(widthCells, heightCells);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new this.THREE.Mesh(geometry, new this.THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.02, depthWrite: false,
      }));
      const worldX = minX - this.worldHalf + widthCells / 2;
      const worldY = minY - this.worldHalf + heightCells / 2;
      mesh.position.set(worldX - this.originX, 0.012, worldY - this.originY);
      mesh.renderOrder = 0.5;
      mesh.userData.worldX = worldX;
      mesh.userData.worldY = worldY;
      this.scene.add(mesh);
      this.meshes.set(key, mesh);
    }
  }
}
