import { valueNoise2D } from './terrain-core.mjs';

export const PATH_TEXTURE_SIZE = 64;

const PATH_SEED = 0x4c475054;
const PATH_STYLES = {
  dirt_path: {
    salt: 0x1041,
    // Sample enough of the source illustration per grid cell to retain its
    // soil grain and pebbles. Tiny source windows collapse to flat muddy blobs.
    sampleScale: 430,
    colors: [[112, 80, 51], [128, 92, 58], [143, 105, 67], [155, 117, 76], [168, 129, 85], [180, 143, 99], [190, 153, 107]],
    pebble: [190, 163, 124],
    moss: [111, 133, 78],
  },
  stone_path: {
    salt: 0x2042,
    // The authored stones are large; this scale keeps several distinct pavers
    // visible across a narrow path segment rather than one oversized stone.
    sampleScale: 980,
    colors: [[124, 122, 106], [143, 140, 123], [158, 155, 137], [172, 169, 151], [185, 182, 164], [196, 193, 176], [205, 201, 184]],
    pebble: [207, 202, 184],
    moss: [117, 139, 84],
  },
  cobblestone_path: {
    salt: 0x3043,
    sampleScale: 660,
    colors: [[120, 116, 101], [139, 134, 117], [154, 149, 132], [168, 163, 145], [181, 175, 157], [192, 186, 168], [201, 195, 176]],
    pebble: [203, 196, 178],
    moss: [114, 137, 82],
  },
  gravel_path: {
    salt: 0x4044,
    // Gravel needs a tighter sample so individual muted pebbles stay legible.
    sampleScale: 520,
    colors: [[131, 119, 99], [148, 135, 114], [162, 149, 128], [175, 162, 140], [188, 175, 153], [199, 186, 164], [207, 195, 173]],
    pebble: [208, 195, 171],
    moss: [119, 140, 87],
  },
  stepping_stones: {
    salt: 0x5045,
    sampleScale: 700,
    colors: [[132, 120, 98], [151, 139, 116], [166, 154, 131], [180, 168, 145], [192, 181, 158], [203, 192, 168], [211, 200, 176]],
    pebble: [212, 200, 176],
    moss: [116, 139, 82],
  },
};

function hash(x, y, salt = 0) {
  let value = (PATH_SEED ^ salt ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x119de1f3)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function edgeProfile(axis, edgeX, edgeY) {
  const tag = axis === 'horizontal' ? 0x771 : 0x992;
  const h = hash(edgeX, edgeY, tag);
  return {
    offset: (hash(edgeX, edgeY, tag ^ 0x13) - 0.5) * 4,
    radius: 11.5 + Math.floor(hash(edgeX, edgeY, tag ^ 0x27) * 2.5),
    axis,
    h,
  };
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length2 = dx * dx + dy * dy || 1;
  const amount = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2));
  const x = x1 + amount * dx;
  const y = y1 + amount * dy;
  return { distance: Math.hypot(px - x, py - y), amount };
}

function edgeFor(x, y, direction) {
  if (direction === 'north') return { ...edgeProfile('horizontal', x, y), direction };
  if (direction === 'south') return { ...edgeProfile('horizontal', x, y + 1), direction };
  if (direction === 'west') return { ...edgeProfile('vertical', x, y), direction };
  return { ...edgeProfile('vertical', x + 1, y), direction };
}

function makePathMask(item, connections, size) {
  const cx = size / 2 + (hash(item.x, item.y, 0x1101) - 0.5) * 2;
  const cy = size / 2 + (hash(item.x, item.y, 0x2202) - 0.5) * 2;
  const centerRadius = 12 + hash(item.x, item.y, 0x3303) * 2;
  const edges = [];
  if (connections & 1) edges.push(edgeFor(item.x, item.y, 'north'));
  if (connections & 2) edges.push(edgeFor(item.x, item.y, 'east'));
  if (connections & 4) edges.push(edgeFor(item.x, item.y, 'south'));
  if (connections & 8) edges.push(edgeFor(item.x, item.y, 'west'));
  const mask = new Uint8Array(size * size);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const wx = item.x * size + px;
      const wy = item.y * size + py;
      let rough = (hash(Math.floor(wx / 2), Math.floor(wy / 2), 0x9191) - 0.5) * 1.5;
      if (connections & 1 && py < 2) rough = (hash(Math.floor(wx / 2), item.y * size, 0x9191) - 0.5) * 1.5;
      else if (connections & 4 && py >= size - 2) rough = (hash(Math.floor(wx / 2), (item.y + 1) * size, 0x9191) - 0.5) * 1.5;
      else if (connections & 8 && px < 2) rough = (hash(item.x * size, Math.floor(wy / 2), 0x9191) - 0.5) * 1.5;
      else if (connections & 2 && px >= size - 2) rough = (hash((item.x + 1) * size, Math.floor(wy / 2), 0x9191) - 0.5) * 1.5;
      const radial = Math.hypot(px - cx, py - cy) <= centerRadius + rough;
      let connected = false;
      for (const edge of edges) {
        let ex, ey, x2, y2;
        if (edge.direction === 'north') { ex = size / 2 + edge.offset; ey = 0; x2 = cx; y2 = cy; }
        else if (edge.direction === 'south') { ex = size / 2 + edge.offset; ey = size; x2 = cx; y2 = cy; }
        else if (edge.direction === 'west') { ex = 0; ey = size / 2 + edge.offset; x2 = cx; y2 = cy; }
        else { ex = size; ey = size / 2 + edge.offset; x2 = cx; y2 = cy; }
        const { distance, amount } = segmentDistance(px + 0.5, py + 0.5, ex, ey, x2, y2);
        const radius = edge.radius + (centerRadius - edge.radius) * amount;
        if (distance <= radius + rough) { connected = true; break; }
      }
      if (radial || connected) mask[py * size + px] = 1;
    }
  }
  return { mask, edges };
}

function pixelColor(style, globalX, globalY) {
  const worldX = globalX / PATH_TEXTURE_SIZE;
  const worldY = globalY / PATH_TEXTURE_SIZE;
  const broad = valueNoise2D(worldX * 8.4 + 11.7, worldY * 8.4 - 6.3, PATH_SEED ^ style.salt);
  const middle = valueNoise2D(worldX * 18.2 - 3.9, worldY * 18.2 + 27.1, PATH_SEED ^ style.salt ^ 0x1f3d);
  const fine = hash(Math.floor(globalX / 2), Math.floor(globalY / 2), style.salt ^ 0x3131);
  const value = Math.max(0, Math.min(0.999, broad * 0.6 + middle * 0.32 + fine * 0.08));
  const tone = Math.min(style.colors.length - 1, Math.floor(value * style.colors.length));
  return style.colors[tone];
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function sampleOriginalSurface(item, px, py, size, surface, style) {
  const worldX = item.x + (px + 0.5) / size;
  const worldY = item.y + (py + 0.5) / size;
  const warpX = valueNoise2D(worldX * 0.11 + 7.1, worldY * 0.11 - 12.8, PATH_SEED ^ style.salt ^ 0xabab) - 0.5;
  const warpY = valueNoise2D(worldX * 0.11 - 21.4, worldY * 0.11 + 4.3, PATH_SEED ^ style.salt ^ 0xcdcd) - 0.5;
  const sourceX = Math.floor(worldX * style.sampleScale + warpX * style.sampleScale * 0.22 + hash(0, 0, style.salt) * surface.width);
  const sourceY = Math.floor(worldY * style.sampleScale + warpY * style.sampleScale * 0.22 + hash(0, 0, style.salt ^ 0x1212) * surface.height);
  const offset = (mod(sourceY, surface.height) * surface.width + mod(sourceX, surface.width)) * 4;
  return [surface.data[offset], surface.data[offset + 1], surface.data[offset + 2]];
}

export function createPathCanvas(item, connections, size = PATH_TEXTURE_SIZE, surface = null) {
  const style = PATH_STYLES[item.species];
  if (!style) throw new Error(`No path style for ${item.species}`);
  const { mask, edges } = makePathMask(item, connections, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: true });
  const image = context.createImageData(size, size);
  const pixels = image.data;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const offset = (py * size + px) * 4;
      if (!mask[py * size + px]) continue;
      const gx = item.x * size + px;
      const gy = item.y * size + py;
      let color = surface ? sampleOriginalSurface(item, px, py, size, surface, style) : pixelColor(style, gx, gy);
      if (!surface) {
        const detail = hash(Math.floor(gx / 7), Math.floor(gy / 7), style.salt ^ 0x5454);
        if (detail > 0.94) color = style.pebble;
        else if (style === PATH_STYLES.dirt_path && detail < 0.055) color = [133, 104, 72];
        if (style !== PATH_STYLES.dirt_path && hash(Math.floor(gx / 5), Math.floor(gy / 5), style.salt ^ 0x6666) > 0.992) {
          color = style.moss;
        }
      }
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }

  if (!surface && (item.species === 'stone_path' || item.species === 'cobblestone_path')) {
    const stride = 35;
    const minBlockX = Math.floor(item.x * size / stride);
    const maxBlockX = Math.floor(((item.x + 1) * size - 1) / stride);
    const minBlockY = Math.floor(item.y * size / stride);
    const maxBlockY = Math.floor(((item.y + 1) * size - 1) / stride);
    for (let blockY = minBlockY; blockY <= maxBlockY; blockY += 1) {
      for (let blockX = minBlockX; blockX <= maxBlockX; blockX += 1) {
        if (hash(blockX, blockY, style.salt ^ 0xbbbb) < 0.68) continue;
        const centerX = blockX * stride + 5 + hash(blockX, blockY, style.salt ^ 0xcccc) * 24;
        const centerY = blockY * stride + 5 + hash(blockX, blockY, style.salt ^ 0xdddd) * 24;
        const radiusX = 4.8 + hash(blockX, blockY, style.salt ^ 0xeeee) * 3.2;
        const radiusY = 3.5 + hash(blockX, blockY, style.salt ^ 0xffff) * 2.6;
        const localCenterX = centerX - item.x * size;
        const localCenterY = centerY - item.y * size;
        for (let py = Math.max(0, Math.floor(localCenterY - radiusY - 1)); py <= Math.min(size - 1, Math.ceil(localCenterY + radiusY + 1)); py += 1) {
          for (let px = Math.max(0, Math.floor(localCenterX - radiusX - 1)); px <= Math.min(size - 1, Math.ceil(localCenterX + radiusX + 1)); px += 1) {
            if (!mask[py * size + px]) continue;
            const dx = (px + item.x * size - centerX) / radiusX;
            const dy = (py + item.y * size - centerY) / radiusY;
            const edge = Math.hypot(dx, dy) + (hash(blockX * 19 + px, blockY * 23 + py, style.salt ^ 0xabab) - 0.5) * 0.28;
            if (edge > 1) continue;
            const color = edge > 0.78 ? style.colors[0] : edge < 0.42 ? style.colors[4] : style.colors[3];
            const offset = (py * size + px) * 4;
            pixels[offset] = color[0];
            pixels[offset + 1] = color[1];
            pixels[offset + 2] = color[2];
            pixels[offset + 3] = 255;
          }
        }
      }
    }
  }

  // Add sparse low-contrast surface detail, sampled in world space so it stays
  // fixed while the camera moves and does not repeat with each square tile.
  for (let blockY = Math.floor(item.y * size / 8); !surface && blockY <= Math.floor(((item.y + 1) * size - 1) / 8); blockY += 1) {
    for (let blockX = Math.floor(item.x * size / 8); blockX <= Math.floor(((item.x + 1) * size - 1) / 8); blockX += 1) {
      if (hash(blockX, blockY, style.salt ^ 0x7777) < 0.79) continue;
      const gx = blockX * 8 + 2 + Math.floor(hash(blockX, blockY, style.salt ^ 0x8888) * 4);
      const gy = blockY * 8 + 2 + Math.floor(hash(blockX, blockY, style.salt ^ 0x9999) * 4);
      for (const [dx, dy] of [[0, 0], [1, 0], [1, 1]]) {
        const x = gx + dx - item.x * size;
        const y = gy + dy - item.y * size;
        if (x < 0 || y < 0 || x >= size || y >= size || !mask[y * size + x]) continue;
        const offset = (y * size + x) * 4;
        pixels[offset] = style.pebble[0];
        pixels[offset + 1] = style.pebble[1];
        pixels[offset + 2] = style.pebble[2];
        pixels[offset + 3] = 255;
      }
    }
  }

  // Small grass pixels poke into the path only along exposed, irregular edges.
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let py = 2; py < size - 2; py += 1) {
    for (let px = 2; px < size - 2; px += 1) {
      const index = py * size + px;
      if (!mask[index]) continue;
      const boundary = directions.some(([dx, dy]) => !mask[(py + dy) * size + px + dx]);
      if (!boundary) continue;
      const nearConnectedEdge = edges.some(edge =>
        (edge.direction === 'north' && py < 3) || (edge.direction === 'south' && py >= size - 3) ||
        (edge.direction === 'west' && px < 3) || (edge.direction === 'east' && px >= size - 3));
      if (nearConnectedEdge || hash(item.x * size + px, item.y * size + py, 0xaaaa) < 0.973) continue;
      const offset = index * 4;
      pixels[offset] = 116;
      pixels[offset + 1] = 146;
      pixels[offset + 2] = 91;
      pixels[offset + 3] = 255;
      if (py > 2 && mask[(py - 1) * size + px]) {
        const stem = ((py - 1) * size + px) * 4;
        pixels[stem] = 137;
        pixels[stem + 1] = 165;
        pixels[stem + 2] = 105;
        pixels[stem + 3] = 255;
      }
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

export function pathConnectionMask(x, y, pathAt) {
  let mask = 0;
  if (pathAt.has(`${x},${y - 1}`)) mask |= 1;
  if (pathAt.has(`${x + 1},${y}`)) mask |= 2;
  if (pathAt.has(`${x},${y + 1}`)) mask |= 4;
  if (pathAt.has(`${x - 1},${y}`)) mask |= 8;
  return mask;
}
