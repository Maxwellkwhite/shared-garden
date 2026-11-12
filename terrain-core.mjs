export const GRASS_PALETTE = Object.freeze({
  primary: '#88B96F',
  secondary: '#7BA963',
  light: '#9BC77B',
  dark: '#6E9958',
  highlight: '#B0CF88',
  shadow: '#5F884E',
});

export const WILDERNESS_PALETTE = Object.freeze({
  primary: '#65794b',
  secondary: '#566a42',
  light: '#78875a',
  dark: '#465c3b',
  highlight: '#899263',
  shadow: '#3c5235',
});

export const TERRAIN_DEFAULTS = Object.freeze({
  seed: 0x4c697474, // "Litt"
  chunkSize: 16,
  pixelsPerUnit: 16,
  cacheSize: 64,
  chunkBuffer: 1,
  tuftCellSize: 1.2,
  baseTuftDensity: 0.025,
  tuftDensityVariation: 0.34,
  carpetCellSize: 0.42,
  carpetDensity: 0.31,
  palette: GRASS_PALETTE,
});

function hash2(x, y, seed) {
  let hash = (seed ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x119de1f3)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function fade(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

export function valueNoise2D(x, y, seed = TERRAIN_DEFAULTS.seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const top = lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), tx);
  const bottom = lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), tx);
  return lerp(top, bottom, ty);
}

function parseHex(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function blendColors(a, b, amount) {
  return [0, 1, 2].map(channel => Math.round(lerp(a[channel], b[channel], amount) / 4) * 4);
}

const parsedPalettes = new WeakMap();

function getParsedPalette(palette) {
  if (!parsedPalettes.has(palette)) {
    parsedPalettes.set(palette, {
      dark: parseHex(palette.dark),
      secondary: parseHex(palette.secondary),
      primary: parseHex(palette.primary),
      light: parseHex(palette.light),
    });
  }
  return parsedPalettes.get(palette);
}

function paletteColor(value, palette) {
  const { dark, secondary, primary, light } = getParsedPalette(palette);
  if (value < 0.34) return blendColors(dark, secondary, value / 0.34);
  if (value < 0.72) return blendColors(secondary, primary, (value - 0.34) / 0.38);
  return blendColors(primary, light, (value - 0.72) / 0.28);
}

export function sampleGrassColor(worldX, worldY, seed = TERRAIN_DEFAULTS.seed, palette = GRASS_PALETTE) {
  const broad = valueNoise2D(worldX * 0.082, worldY * 0.082, seed);
  const middle = valueNoise2D(worldX * 0.19 + 31.7, worldY * 0.19 - 17.3, seed ^ 0x6d2b79f5);
  const fine = valueNoise2D(worldX * 0.34 - 9.2, worldY * 0.34 + 44.1, seed ^ 0x1b56c4e9);
  const { primary, secondary } = getParsedPalette(palette);
  // Shared illumination field: palette-tinted color changes stay subtle and
  // don't create the large circular light/dark blotches of raw value noise.
  const field = (broad - 0.5) * 0.34 + (middle - 0.5) * 0.46 + (fine - 0.5) * 0.2;
  return primary.map((channel, index) => {
    const paletteLean = secondary[index] - channel;
    const variation = Math.round(field * 15 + paletteLean * 0.1);
    return Math.max(0, Math.min(255, Math.round((channel + variation) / 4) * 4));
  });
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function wildernessBlendAt(worldX, worldY, settings = TERRAIN_DEFAULTS) {
  const playableHalf = settings.playableHalf ?? 25;
  // The 50×50 garden stays exactly its original grass. Wilderness treatment
  // begins at the true grid edge, then eases outward without a wandering
  // noise boundary that can wash over or cut into the playable clearing.
  const boundaryDistance = Math.max(Math.abs(worldX), Math.abs(worldY)) - playableHalf;
  return smoothstep(0, 7, boundaryDistance);
}

export function sampleWorldGrassColor(worldX, worldY, settings = TERRAIN_DEFAULTS) {
  const grass = sampleGrassColor(worldX, worldY, settings.seed, settings.palette || GRASS_PALETTE);
  const distanceFromPlayable = Math.max(Math.abs(worldX), Math.abs(worldY)) - (settings.playableHalf ?? 25);
  if (distanceFromPlayable <= 0) return grass;
  const blend = wildernessBlendAt(worldX, worldY, settings);
  if (blend <= 0) return grass;

  const palette = settings.wildernessPalette || WILDERNESS_PALETTE;
  const clearing = valueNoise2D(worldX * 0.055 + 62, worldY * 0.055 - 13, settings.seed ^ 0x1f123bb5);
  const wild = paletteColor(clearing, palette);
  const moss = valueNoise2D(worldX * 0.11 + 27, worldY * 0.11 - 9, settings.seed ^ 0x71ac4e21);
  const litter = valueNoise2D(worldX * 0.17 - 53, worldY * 0.17 + 21, settings.seed ^ 0x39d2a817);
  const earth = [103, 91, 62];
  const leaf = [93, 91, 54];
  const mossColor = [78, 100, 57];
  const floor = wild.map((channel, index) => {
    const mossWeight = smoothstep(0.62, 0.83, moss) * 0.18;
    const litterWeight = smoothstep(0.69, 0.88, litter) * 0.11;
    return channel * (1 - mossWeight - litterWeight)
      + mossColor[index] * mossWeight + (moss > 0.6 ? leaf[index] : earth[index]) * litterWeight;
  });
  return grass.map((channel, index) => {
    return Math.round((channel + (floor[index] - channel) * blend) / 4) * 4;
  });
}

export function sampleGrassDensity(worldX, worldY, seed = TERRAIN_DEFAULTS.seed) {
  const broad = valueNoise2D(worldX * 0.09 + 73, worldY * 0.09 - 29, seed ^ 0x2c9277b5);
  const middle = valueNoise2D(worldX * 0.24 - 41, worldY * 0.24 + 13, seed ^ 0x4e39b2d1);
  return Math.max(0, Math.min(1, broad * 0.68 + middle * 0.32));
}

export function grassTuftAt(cellX, cellY, settings = TERRAIN_DEFAULTS) {
  const seed = settings.seed;
  const cellSize = settings.tuftCellSize;
  const localDensity = sampleGrassDensity(cellX * cellSize, cellY * cellSize, seed);
  const clusteredDensity = Math.max(0, Math.min(1, (localDensity - 0.3) / 0.6));
  const worldX = cellX * cellSize;
  const worldY = cellY * cellSize;
  const outer = Math.max(Math.abs(worldX), Math.abs(worldY)) - (settings.playableHalf ?? 25);
  const wildernessBoost = smoothstep(-10, 12, outer) * 0.12;
  const density = settings.baseTuftDensity + clusteredDensity * clusteredDensity * settings.tuftDensityVariation + wildernessBoost;
  const roll = hash2(cellX, cellY, seed ^ 0x7654321);
  if (roll > density) return null;

  const motif = Math.floor(hash2(cellX, cellY, seed ^ 0x2a91) * 3);
  const rootX = (cellX + 0.18 + hash2(cellX, cellY, seed ^ 0x4bf1) * 0.64) * cellSize;
  const rootY = (cellY + 0.18 + hash2(cellX, cellY, seed ^ 0x1287) * 0.64) * cellSize;
  // Small hand-authored pixel motifs read as clumps of grass instead of
  // disconnected procedural scratches. Characters map to palette colors.
  const motifs = [
    ['....l..', '...pl..', '..ppl..', '..ps..l', '.pps.pl', '..psspl', '...sss.'],
    ['...l...', '..pl...', '..pl..l', '.ppl..p', '.psl.pp', '..ssspl', '...sss.'],
    ['.....l.', '....pl.', '..l.pl.', '..p.ps.', '.pp.psl', '..psspl', '...sss.'],
  ];
  return { x: rootX, y: rootY, motif, pixels: motifs[motif] };
}

export function carpetMarkAt(cellX, cellY, settings = TERRAIN_DEFAULTS) {
  const cellSize = settings.carpetCellSize;
  const worldX = cellX * cellSize;
  const worldY = cellY * cellSize;
  const density = sampleGrassDensity(worldX, worldY, settings.seed);
  const clustered = Math.max(0, Math.min(1, (density - 0.34) / 0.58));
  const chance = settings.carpetDensity * (0.1 + clustered * 0.92);
  if (hash2(cellX, cellY, settings.seed ^ 0x1c0ffee) > chance) return null;
  const variant = Math.floor(hash2(cellX, cellY, settings.seed ^ 0x6a09e667) * 4);
  const x = (cellX + 0.14 + hash2(cellX, cellY, settings.seed ^ 0x85ebca6b) * 0.72) * cellSize;
  const y = (cellY + 0.14 + hash2(cellX, cellY, settings.seed ^ 0xc2b2ae35) * 0.72) * cellSize;
  return { x, y, variant, tone: hash2(cellX, cellY, settings.seed ^ 0x27d4eb2f) };
}

export function chunkPixelColor(chunkX, chunkY, localX, localY, settings = TERRAIN_DEFAULTS) {
  const chunkPixels = settings.chunkSize * settings.pixelsPerUnit;
  const worldX = (chunkX * chunkPixels + localX) / settings.pixelsPerUnit;
  const worldY = (chunkY * chunkPixels + localY) / settings.pixelsPerUnit;
  return sampleGrassColor(worldX, worldY, settings.seed, settings.palette);
}
