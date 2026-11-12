import * as THREE from 'three';
import { GrassTerrainLayer } from './terrain.mjs?v=20261112-living-v3';
import { createGroundTileCanvas, GroundTextureLayer, GROUND_MATERIALS } from './ground-textures.mjs?v=20261112-ground-minification-v3';
import { createPathCanvas, pathConnectionMask } from './path-rendering.mjs?v=20261111path-surface-v6';
import { createConnectedSegmentCanvas } from './fence-rendering.mjs?v=20261111connected-fence-v3';
import { WildernessLayer } from './wilderness.mjs?v=20261112-woodland-v5';

const canvas = document.querySelector('#gardenCanvas');
const worldElement = document.querySelector('#gardenWorld');
const gridToggle = document.querySelector('#gridToggle');
const addToggle = document.querySelector('#addToggle');
const resetToggle = document.querySelector('#resetToggle');
const plantMenu = document.querySelector('#plantMenu');
const speciesGrid = document.querySelector('#speciesGrid');
const plantCatalog = await fetch('./plant-catalog.json').then(response => response.json());
const allPlants = plantCatalog.flatMap(category => category.plants.map(plant => ({ ...plant, categoryId: category.id, categoryLabel: category.label })));
const plantById = new Map(allPlants.map(plant => [plant.id.replaceAll('-', '_'), plant]));
const allGardenObjects = plantCatalog.flatMap(category => (category.objects || []).map(item => ({ ...item, categoryId: category.id, categoryLabel: category.label })));
const gardenObjectById = new Map(allGardenObjects.map(item => [item.id.replaceAll('-', '_'), item]));
const pathCursor = document.querySelector('#pathCursor');
const pathCursorImage = document.querySelector('#pathCursorImage');
const placementToolkit = document.querySelector('#placementToolkit');
const toolkitBack = document.querySelector('#toolkitBack');
const toolkitRotate = document.querySelector('#toolkitRotate');
const toolkitRepeat = document.querySelector('#toolkitRepeat');
const toolkitHint = document.querySelector('#toolkitHint');
const itemHoverTag = document.querySelector('#itemHoverTag');
const plantPreviewTimers = new WeakMap();
const PLANT_PREVIEW_STAGES = ['seedling', 'young', 'growing', 'mature'];
const PLANT_SPRITE_REVISION = '20261112-plant-sprite-audit-v1';
// Some generated crop PNGs include slivers of neighboring artwork outside
// the plant. Crop the display region only; keep the original assets intact.
const PLANT_SPRITE_CROPS = {
  pumpkin_young: { left: 8, top: 8, width: 490, height: 306 },
  pumpkin_growing: { left: 6, top: 8, width: 528, height: 405 },
  carrot_young: { left: 0, top: 0, width: 386, height: 375 },
  raspberry_bush_growing: { left: 0, top: 0, width: 540, height: 505 },
  raspberry_bush_young: { left: 0, top: 0, width: 419, height: 430 },
};
const croppedPlantSources = new Map();
function getCroppedPlantSource(species) {
  if (croppedPlantSources.has(species)) return croppedPlantSources.get(species);
  const crop = PLANT_SPRITE_CROPS[species];
  if (!crop) return Promise.resolve(plantAsset(species));
  const promise = new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = crop.width;
      canvas.height = crop.height;
      canvas.getContext('2d').drawImage(source, crop.left, crop.top, crop.width, crop.height,
        0, 0, crop.width, crop.height);
      resolve(canvas.toDataURL('image/png'));
    };
    source.onerror = reject;
    source.src = plantAsset(species);
  });
  croppedPlantSources.set(species, promise);
  return promise;
}
function setPlantImage(image, species) {
  image.dataset.spriteSpecies = species;
  const crop = PLANT_SPRITE_CROPS[species];
  if (!crop) {
    image.src = plantAsset(species);
    return;
  }
  getCroppedPlantSource(species).then(src => {
    if (image.dataset.spriteSpecies === species) image.src = src;
  }).catch(() => { image.src = plantAsset(species); });
}
const userToggle = document.querySelector('#userToggle');
const changeAllowanceIndicator = document.querySelector('#changeAllowance');
const profilePanel = document.querySelector('#profilePanel');
const profileNameInput = document.querySelector('#profileName');
const saveProfileName = document.querySelector('#saveProfileName');
const unlimitedChangesToggle = document.querySelector('#unlimitedChanges');
const changeLimitStatus = document.querySelector('#changeLimitStatus');
const itemAttribution = document.querySelector('#itemAttribution');
const attributionTitle = document.querySelector('#attributionTitle');
const attributionAuthor = document.querySelector('#attributionAuthor');
const attributionDate = document.querySelector('#attributionDate');
const attributionGrowth = document.querySelector('#attributionGrowth');
const growItemButton = document.querySelector('#growItem');
const attributionLock = document.querySelector('#attributionLock');
const attributionHint = document.querySelector('#attributionHint');
const moveItemButton = document.querySelector('#moveItem');
const bulldozeItemButton = document.querySelector('#bulldozeItem');
const rotateItemButton = document.querySelector('#rotateItem');
const visitorId = localStorage.getItem('common-garden-visitor') || (() => {
  const id = crypto.randomUUID();
  localStorage.setItem('common-garden-visitor', id);
  return id;
})();
function updateChangeAllowance(allowance) {
  if (!allowance || !Number.isFinite(allowance.remaining) || !Number.isFinite(allowance.resets_at)) return;
  unlimitedChangesToggle.checked = Boolean(allowance.unlimited);
  if (allowance.unlimited) {
    changeAllowanceIndicator.textContent = '∞';
    changeAllowanceIndicator.dataset.tooltip = 'Unlimited garden changes in this browser';
    changeAllowanceIndicator.setAttribute('aria-label', 'Unlimited garden changes in this browser.');
    changeAllowanceIndicator.classList.remove('empty');
    return;
  }
  const remaining = Math.max(0, allowance.remaining);
  const resetAt = new Date(allowance.resets_at * 1000);
  const resetTime = resetAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  changeAllowanceIndicator.textContent = `${remaining}`;
  changeAllowanceIndicator.dataset.tooltip = `${remaining} of ${allowance.limit} changes left · Resets ${resetTime}`;
  changeAllowanceIndicator.setAttribute('aria-label', `${remaining} of ${allowance.limit} garden changes left. Resets at ${resetTime}.`);
  changeAllowanceIndicator.classList.toggle('empty', remaining === 0);
}

function apiErrorMessage(result, fallback) {
  if (result?.change_allowance) updateChangeAllowance(result.change_allowance);
  if (result?.error === 'change_limit') {
    const resetAt = result.change_allowance?.resets_at;
    const time = Number.isFinite(resetAt)
      ? new Date(resetAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : 'the next hour';
    return `Hourly change allowance reached. Resets at ${time}.`;
  }
  const messages = {
    cell_occupied: 'Someone just claimed that square. The garden has been refreshed; choose another square.',
    destination_occupied: 'That square was just claimed. The garden has been refreshed; choose another square.',
    item_locked: 'This item is locked for now.',
    rate_limited: `Slow down a bit. Try again in ${Math.max(1, result.retry_after_seconds || 1)}s.`,
  };
  return messages[result?.error] || result?.error || fallback;
}

const profileNameKey = 'common-garden-name';
const randomGardenName = () => `Gardener ${Math.floor(1000 + Math.random() * 9000)}`;
let visitorName = localStorage.getItem(profileNameKey) || randomGardenName();
localStorage.setItem(profileNameKey, visitorName);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x718d56, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-20, 20, 14, -14, 0.1, 120);
camera.up.set(0, 0, -1);
const target = new THREE.Vector3();
camera.position.set(0, 80, 0);
camera.lookAt(target);

let viewHeight = 28;
let zoom = 1;
let revision = -1;
let drag = null;
let pathStroke = null;
let groundStroke = null;
let trees = [];
let groundTiles = [];
let selectedItem = null;
let shiftHeld = false;
let placementPointerId = null;
let inspectedItem = null;
let movingItem = null;
let movingPointerId = null;
let lockCountdownTimer = null;
let growActionPending = false;
let hoverCell = null;
let terrainOriginX = 0;
let terrainOriginY = 0;
const CHUNK_SIZE = 16;
const WORLD_SIZE = 50;
const WORLD_HALF = WORLD_SIZE / 2;
const WILDERNESS_MARGIN = 14;
const WILDERNESS_HALF = WORLD_HALF + WILDERNESS_MARGIN;
const STAGES = [
  { id: 'seedling', label: 'Seedling', scale: 0.48 },
  { id: 'young', label: 'Young', scale: 0.67 },
  { id: 'growing', label: 'Growing', scale: 0.83 },
  { id: 'mature', label: 'Mature', scale: 1 },
];
const stageById = new Map(STAGES.map((stage, index) => [stage.id, { ...stage, index }]));
const LEGACY_ASSETS = {
  pine_sapling: './assets/pine-sapling.png', pine_growing: './assets/pine-growing.png', pine_mature: './assets/pine-mature.png',
  daisy_small: './assets/daisy-small.png', daisy_medium: './assets/daisy-medium.png', daisy_mature: './assets/daisy-mature.png',
  tulip_small: './assets/tulip-small.png', tulip_medium: './assets/tulip-medium.png', tulip_mature: './assets/tulip-mature.png',
  sunflower_small: './assets/sunflower-small.png', sunflower_medium: './assets/sunflower-medium.png', sunflower_mature: './assets/sunflower-mature.png',
};
const plantGeometry = new Map();
const REPAIRED_PLANT_ASSETS = {
  tomato_growing: './assets/plants/tomato-growing-fixed.png',
  tomato_mature: './assets/plants/tomato-mature-fixed.png',
  carrot_mature: './assets/plants/carrot-mature-fixed.png',
  corn_growing: './assets/plants/corn-growing-fixed.png',
  corn_mature: './assets/plants/corn-mature-fixed.png',
  fly_agaric_mushroom_growing: './assets/plants/fly-agaric-mushroom-growing-fixed.png',
  fly_agaric_mushroom_seedling: './assets/plants/fly-agaric-mushroom-seedling-fixed.png',
  pumpkin_mature: './assets/plants/pumpkin-mature-fixed.png',
  raspberry_bush_mature: './assets/plants/raspberry-bush-mature-fixed.png',
  blueberry_bush_mature: './assets/plants/blueberry-bush-mature-fixed.png',
  blueberry_bush_young: './assets/plants/blueberry-bush-young-fixed.png',
  cherry_blossom_tree_growing: './assets/plants/cherry-blossom-tree-growing-fixed.png',
  cherry_blossom_tree_seedling: './assets/plants/cherry-blossom-tree-seedling-fixed.png',
  cherry_blossom_tree_young: './assets/plants/cherry-blossom-tree-young-fixed.png',
  daisy_growing: './assets/plants/daisy-growing-fixed.png',
  daisy_mature: './assets/plants/daisy-mature-fixed.png',
  maple_tree_seedling: './assets/plants/maple-tree-seedling-fixed.png',
  monstera_growing: './assets/plants/monstera-growing-fixed.png',
  oak_tree_growing: './assets/plants/oak-tree-growing-fixed.png',
  oak_tree_seedling: './assets/plants/oak-tree-seedling-fixed.png',
  oak_tree_young: './assets/plants/oak-tree-young-fixed.png',
  apple_tree_young: './assets/plants/apple-tree-young-fixed.png',
  birch_tree_seedling: './assets/plants/birch-tree-seedling-fixed.png',
  hydrangea_seedling: './assets/plants/hydrangea-seedling-fixed.png',
  lavender_seedling: './assets/plants/lavender-seedling-fixed.png',
  palm_tree_growing: './assets/plants/palm-tree-growing-fixed.png',
  sunflower_seedling: './assets/plants/sunflower-seedling-fixed.png',
  marigold_growing: './assets/plants/marigold-growing-fixed.png',
};
const plantAsset = species => {
  if (gardenObjectById.has(species)) return `./assets/garden-objects/${species.replaceAll('_', '-')}.png`;
  const approvedPineAssets = {
    pine_tree_seedling: './assets/pine-sapling.png',
    pine_tree_young: './assets/pine-sapling.png',
    pine_tree_growing: './assets/pine-growing.png',
    pine_tree_mature: './assets/pine-mature.png',
  };
  if (approvedPineAssets[species]) return approvedPineAssets[species];
  if (REPAIRED_PLANT_ASSETS[species]) return `${REPAIRED_PLANT_ASSETS[species]}?v=${PLANT_SPRITE_REVISION}`;
  if (LEGACY_ASSETS[species]) return LEGACY_ASSETS[species];
  const split = species.lastIndexOf('_');
  return `./assets/plants/${species.slice(0, split).replaceAll('_', '-')}-${species.slice(split + 1)}.png?v=${PLANT_SPRITE_REVISION}`;
};
function geometryFor(species, aspect = null) {
  const object = gardenObjectById.get(species);
  if (object) {
    const [cellsWide, cellsDeep] = object.footprint;
    let width = cellsWide, height = cellsDeep;
    if (object.kind !== 'path' && aspect) {
      const longSide = Math.max(cellsWide, cellsDeep) * 0.9;
      if (aspect >= 1) { width = longSide; height = longSide / aspect; }
      else { height = longSide; width = longSide * aspect; }
    }
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.rotateX(-Math.PI / 2);
    return { geometry, groundAnchor: 0, footprint: object.footprint };
  }
  const oldPine = /^pine_(sapling|growing|mature)$/.test(species);
  const legacyStage = species.endsWith('_small') ? 'young' : species.endsWith('_medium') ? 'growing' : species.endsWith('_mature') ? 'mature' : species.endsWith('_sapling') ? 'seedling' : species.endsWith('_growing') ? 'growing' : null;
  const split = species.lastIndexOf('_');
  const stage = stageById.get(legacyStage || species.slice(split + 1));
  const id = species.slice(0, split);
  const meta = plantById.get(id);
  const kind = oldPine ? 'pine' : meta?.kind || 'flower';
  const scale = oldPine ? 1 : (stage?.scale || 1);
  let width, height;
  if (['tree', 'willow', 'palm'].includes(kind)) [width, height] = [3.1, 3.8];
  else if (kind === 'pine') [width, height] = [3.1, 3.4];
  else if (['shrub'].includes(kind)) [width, height] = [2.5, 2.5];
  else if (['mushroom'].includes(kind)) [width, height] = [1.75, 1.9];
  else if (['cactus', 'monstera', 'fern', 'groundcover', 'vine'].includes(kind)) [width, height] = [2.0, 2.7];
  else [width, height] = [1.65, 2.5];
  if (oldPine) { width = 3.1; height = 3.4; }
  width *= scale;
  height *= scale;
  // New illustrated sprites have different natural silhouettes by species.
  // Match their source aspect ratio so trees, flowers, and shrubs are not
  // squeezed into the generic billboard dimensions. Approved pine stays exact.
  if (aspect && !oldPine && !LEGACY_ASSETS[species]) width = height * aspect;
  const groundAnchor = oldPine ? 1.4 : height * 0.425;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(-Math.PI / 2);
  return { geometry, groundAnchor };
}
for (const species of Object.keys(LEGACY_ASSETS)) plantGeometry.set(species, geometryFor(species));
for (const plant of allPlants) for (const stage of STAGES) {
  const species = `${plant.id.replaceAll('-', '_')}_${stage.id}`;
  plantGeometry.set(species, geometryFor(species));
}
for (const object of allGardenObjects) {
  const species = object.id.replaceAll('-', '_');
  plantGeometry.set(species, geometryFor(species));
}
const terrain = new GrassTerrainLayer(THREE, scene, {
  seed: 0x4c697474,
  chunkSize: CHUNK_SIZE,
  pixelsPerUnit: 16,
  cacheSize: 64,
  chunkBuffer: 1,
  playableHalf: WORLD_HALF,
  bounds: { minX: -WILDERNESS_HALF, minY: -WILDERNESS_HALF, maxX: WILDERNESS_HALF, maxY: WILDERNESS_HALF },
});
const wilderness = new WildernessLayer(THREE, scene, {
  seed: 0x4c697474,
  playableHalf: WORLD_HALF,
  outerHalf: WILDERNESS_HALF,
  chunkSize: CHUNK_SIZE,
  originX: terrainOriginX,
  originY: terrainOriginY,
});
const groundLayer = new GroundTextureLayer(THREE, scene, { chunkSize: 4, worldHalf: WORLD_HALF });
const groundPreviewUrls = new Map();
function groundTexturePreview(material) {
  if (!groundPreviewUrls.has(material)) {
    groundPreviewUrls.set(material, createGroundTileCanvas(material, 0, 0).toDataURL());
  }
  return groundPreviewUrls.get(material);
}

const gridPositions = [];
for (let cell = -WORLD_HALF; cell <= WORLD_HALF; cell += 1) {
  gridPositions.push(cell, 0.025, -WORLD_HALF, cell, 0.025, WORLD_HALF);
  gridPositions.push(-WORLD_HALF, 0.025, cell, WORLD_HALF, 0.025, cell);
}
const gridGeometry = new THREE.BufferGeometry();
gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
const gridMaterial = new THREE.LineBasicMaterial({ color: 0x31563a, transparent: true, opacity: 0.5 });
const worldGrid = new THREE.LineSegments(gridGeometry, gridMaterial);
worldGrid.visible = false;
worldGrid.renderOrder = WORLD_SIZE * WORLD_SIZE + 1;
scene.add(worldGrid);
gridToggle.addEventListener('click', () => {
  worldGrid.visible = !worldGrid.visible;
  gridToggle.setAttribute('aria-pressed', String(worldGrid.visible));
  gridToggle.setAttribute('aria-label', worldGrid.visible ? 'Hide grid' : 'Show grid');
});

resetToggle.addEventListener('click', async () => {
  if (!window.confirm('Reset the shared garden and everyone’s hourly allowance? This clears all placed items and returns everyone to 15/15.')) return;
  resetToggle.disabled = true;
  try {
    const response = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'X-Visitor-Id': visitorId },
    });
    const result = await response.json();
    updateChangeAllowance(result.change_allowance);
    if (!response.ok) throw new Error(apiErrorMessage(result, 'Could not reset the garden'));
    revision = result.revision;
    renderTrees([]);
    groundTiles = [];
    groundLayer.setTiles(groundTiles);
    target.set(0, 0, 0);
    zoom = 1;
    updateCamera();
    resetToggle.title = 'Garden and everyone’s hourly allowance reset';
  } catch (error) {
    resetToggle.title = `Reset failed: ${error.message}`;
    console.warn('Garden reset failed:', error.message);
  } finally {
    resetToggle.disabled = false;
    window.setTimeout(() => { resetToggle.title = 'Reset garden'; }, 5000);
  }
});

function setPlantMenuOpen(open) {
  plantMenu.hidden = !open;
  if (!open) itemHoverTag.hidden = true;
  addToggle.setAttribute('aria-expanded', String(open));
}

function setProfileOpen(open) {
  profilePanel.hidden = !open;
  userToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    profileNameInput.value = visitorName;
    profileNameInput.focus();
    profileNameInput.select();
  }
}

userToggle.addEventListener('click', () => setProfileOpen(profilePanel.hidden));
saveProfileName.addEventListener('click', () => {
  visitorName = profileNameInput.value.trim().replace(/\s+/g, ' ').slice(0, 32) || visitorName;
  profileNameInput.value = visitorName;
  localStorage.setItem(profileNameKey, visitorName);
  setProfileOpen(false);
});
profileNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') saveProfileName.click();
});
unlimitedChangesToggle.addEventListener('change', async () => {
  const enabled = unlimitedChangesToggle.checked;
  unlimitedChangesToggle.disabled = true;
  changeLimitStatus.textContent = 'Saving…';
  try {
    const response = await fetch('/api/visitor-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
      body: JSON.stringify({ unlimited_changes: enabled }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(result, 'Could not update the change limit'));
    updateChangeAllowance(result.change_allowance);
    changeLimitStatus.textContent = enabled ? 'Hourly change cap removed for this browser.' : '15 changes per hour restored.';
  } catch (error) {
    unlimitedChangesToggle.checked = !enabled;
    changeLimitStatus.textContent = error.message;
  } finally {
    unlimitedChangesToggle.disabled = false;
  }
});

function showItemHoverTag(choice) {
  if (!choice || plantMenu.hidden) return;
  const label = choice.getAttribute('aria-label') || choice.querySelector('img')?.alt;
  if (!label) return;
  itemHoverTag.textContent = label;
  itemHoverTag.hidden = false;
  const rect = choice.getBoundingClientRect();
  const tag = itemHoverTag.getBoundingClientRect();
  const left = THREE.MathUtils.clamp(rect.left + (rect.width - tag.width) / 2, 8, window.innerWidth - tag.width - 8);
  const above = rect.top - tag.height - 7;
  const top = above >= 8 ? above : Math.min(window.innerHeight - tag.height - 8, rect.bottom + 7);
  itemHoverTag.style.transform = `translate(${left}px, ${top}px)`;
}

function startPlantStagePreview(choice) {
  const plantId = choice?.dataset.previewPlant;
  const image = choice?.querySelector('img');
  if (!plantId || !image || plantPreviewTimers.has(choice)) return;

  let stageIndex = 0;
  const showStage = () => {
    setPlantImage(image, `${plantId}_${PLANT_PREVIEW_STAGES[stageIndex]}`);
  };
  showStage();
  const timer = window.setInterval(() => {
    if (!choice.isConnected || plantMenu.hidden) {
      stopPlantStagePreview(choice);
      return;
    }
    stageIndex = (stageIndex + 1) % PLANT_PREVIEW_STAGES.length;
    showStage();
  }, 900);
  plantPreviewTimers.set(choice, timer);
}

function stopPlantStagePreview(choice) {
  const timer = plantPreviewTimers.get(choice);
  if (timer === undefined) return;
  window.clearInterval(timer);
  plantPreviewTimers.delete(choice);
  const image = choice.querySelector('img');
  if (image && choice.dataset.previewPlant) setPlantImage(image, `${choice.dataset.previewPlant}_mature`);
}

plantMenu.addEventListener('pointerover', event => {
  const choice = event.target.closest('button.plant-choice');
  if (choice) {
    showItemHoverTag(choice);
    startPlantStagePreview(choice);
  }
});
plantMenu.addEventListener('pointerout', event => {
  const choice = event.target.closest('button.plant-choice');
  if (choice && !choice.contains(event.relatedTarget)) {
    itemHoverTag.hidden = true;
    stopPlantStagePreview(choice);
  }
});
plantMenu.addEventListener('focusin', event => {
  const choice = event.target.closest('button.plant-choice');
  if (choice) {
    showItemHoverTag(choice);
    startPlantStagePreview(choice);
  }
});
plantMenu.addEventListener('focusout', event => {
  const choice = event.target.closest('button.plant-choice');
  if (choice && !choice.contains(event.relatedTarget)) {
    itemHoverTag.hidden = true;
    stopPlantStagePreview(choice);
  }
});

function showSpecies() {
  speciesGrid.replaceChildren();
  speciesGrid.hidden = false;
  const entries = plantCatalog.flatMap(category => [
    ...category.plants.map(plant => ({ ...plant, categoryId: category.id, categoryLabel: category.label, itemType: 'plant' })),
    ...(category.objects || []).map(object => ({ ...object, categoryId: category.id, categoryLabel: category.label, itemType: 'object' })),
  ]);
  for (const plant of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'plant-choice';
    button.setAttribute('aria-label', plant.comingSoon ? `${plant.label}, coming soon` : plant.label);
    const image = document.createElement('img');
    const species = plant.id.replaceAll('-', '_');
    if (plant.itemType === 'plant') button.dataset.previewPlant = species;
    const previewSpecies = plant.itemType === 'object' ? species : `${species}_mature`;
    if (plant.groundMaterial) image.src = groundTexturePreview(plant.groundMaterial);
    else setPlantImage(image, previewSpecies);
    if (plant.comingSoon) {
      button.disabled = true;
      button.classList.add('coming-soon');
    } else if (plant.itemType === 'object' && ['path', 'fence', 'wall'].includes(plant.connect)) {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => selectItem(species, button));
    } else {
      if (plant.itemType === 'plant') {
        button.addEventListener('click', () => selectItem(`${species}_seedling`, button));
      } else bindStageChoice(button, species);
    }
    image.alt = '';
    image.draggable = false;
    button.append(image);
    speciesGrid.append(button);
  }
}

function selectItem(species, choice) {
  const definition = gardenObjectById.get(species);
  selectedItem = {
    species,
    rotation: 0,
    isObject: Boolean(definition),
    isGround: Boolean(definition?.groundMaterial),
    groundMaterial: definition?.groundMaterial || null,
    connect: definition?.connect || null,
  };
  for (const option of speciesGrid.querySelectorAll('button')) {
    option.setAttribute('aria-pressed', String(option === choice));
  }
  setPlantMenuOpen(false);
  addToggle.classList.add('path-brush-active');
  worldElement.classList.add('path-mode');
  pathCursor.hidden = true;
  placementToolkit.hidden = true;
  dropPreview.visible = false;
  if (selectedItem.isGround) pathCursorImage.src = groundTexturePreview(selectedItem.groundMaterial);
  else setPlantImage(pathCursorImage, species);
  sizeCursorSprite(species);
  const label = definition?.label || plantById.get(species.slice(0, species.lastIndexOf('_')))?.label || species.replaceAll('_', ' ');
  addToggle.setAttribute('aria-label', `Selected ${label}; click a garden cell to place`);
  addToggle.title = `Selected ${label}. Click a garden cell to place; click + to change selection.`;
}

function sizeCursorSprite(species) {
  const geometry = plantGeometry.get(species);
  const height = worldElement.clientHeight || window.innerHeight;
  const pixelsPerWorldUnit = height * zoom / viewHeight;
  const spriteWidth = (geometry?.parameters.width || 1) * pixelsPerWorldUnit;
  const spriteHeight = (geometry?.parameters.height || 1) * pixelsPerWorldUnit;
  pathCursor.style.width = `${THREE.MathUtils.clamp(spriteWidth, 24, 180)}px`;
  pathCursor.style.height = `${THREE.MathUtils.clamp(spriteHeight, 24, 180)}px`;
}

function updatePlacementToolkit(clientX, clientY) {
  if (!selectedItem || pathCursor.hidden) {
    placementToolkit.hidden = true;
    return;
  }
  const object = gardenObjectById.get(selectedItem.species);
  toolkitRotate.hidden = !(object?.rotatable || object?.randomRotation);
  const supportsDrawing = selectedItem.isGround || Boolean(selectedItem.connect);
  const movingExisting = Boolean(selectedItem.movingExisting);
  toolkitRepeat.hidden = supportsDrawing || movingExisting;
  toolkitHint.hidden = !supportsDrawing && !movingExisting;
  toolkitHint.textContent = movingExisting ? 'Click to place' : supportsDrawing ? 'Drag - Draw many' : '';
  placementToolkit.hidden = false;
  const spriteHalf = pathCursor.offsetWidth / 2;
  const panel = placementToolkit.getBoundingClientRect();
  const right = clientX + spriteHalf + 12;
  const left = right + panel.width <= window.innerWidth - 8
    ? right
    : Math.max(8, clientX - spriteHalf - panel.width - 12);
  const top = THREE.MathUtils.clamp(clientY - panel.height / 2, 8, window.innerHeight - panel.height - 8);
  placementToolkit.style.transform = `translate(${left}px, ${top}px)`;
}

function goBackToPicker() {
  if (!selectedItem) return;
  selectedItem = null;
  addToggle.classList.remove('path-brush-active');
  worldElement.classList.remove('path-mode');
  addToggle.setAttribute('aria-label', 'Add to garden');
  addToggle.title = 'Add to garden';
  pathCursor.hidden = true;
  placementToolkit.hidden = true;
  dropPreview.visible = false;
  showSpecies();
  setPlantMenuOpen(true);
}

function rotateSelectedItem() {
  if (!selectedItem) return;
  const definition = gardenObjectById.get(selectedItem.species);
  if (!definition?.rotatable && !definition?.randomRotation) return;
  selectedItem.rotation = (selectedItem.rotation + 1) % 4;
  if (movingItem) movingItem.item.rotation = selectedItem.rotation;
  sizeCursorSprite(selectedItem.species);
  pathCursorImage.style.transform = `rotate(${selectedItem.rotation * 90}deg)`;
  if (hoverCell && movingItem) {
    const color = moveDestinationOccupied(hoverCell, movingItem) ? 0xe5a28c : 0xf4f6ec;
    setSelectionHighlight(movingItem, hoverCell, color);
  } else if (hoverCell) updateDropPreview(hoverCell, selectedItem.species, selectedItem.rotation);
}

toolkitBack.addEventListener('click', () => movingItem ? cancelMovingItem() : goBackToPicker());
toolkitRotate.addEventListener('click', rotateSelectedItem);

showSpecies();

addToggle.addEventListener('click', () => setPlantMenuOpen(plantMenu.hidden));
document.addEventListener('pointerdown', event => {
  if (plantMenu.hidden) return;
  if (plantMenu.contains(event.target) || addToggle.contains(event.target)) return;
  setPlantMenuOpen(false);
});
document.addEventListener('pointerdown', event => {
  if (profilePanel.hidden || profilePanel.contains(event.target) || userToggle.contains(event.target)) return;
  setProfileOpen(false);
});
document.addEventListener('pointerdown', event => {
  if (!itemAttribution.hidden && !itemAttribution.contains(event.target) && !movingItem) dismissItemAttribution();
});

function bindStageChoice(choice, species) {
  choice.addEventListener('click', () => {
    selectItem(species, choice);
  });
}

window.addEventListener('keydown', event => {
  if (event.key === 'Shift') {
    shiftHeld = true;
    toolkitRepeat.classList.toggle('is-active', Boolean(selectedItem) && !selectedItem.connect && !selectedItem.isGround);
  }
  if (event.key === 'Escape' && !profilePanel.hidden) {
    setProfileOpen(false);
    return;
  }
  if (event.key === 'Escape' && movingItem) {
    event.preventDefault();
    cancelMovingItem();
    return;
  }
  if (event.key === 'Escape' && selectedItem) {
    event.preventDefault();
    goBackToPicker();
    return;
  }
  if (!selectedItem || event.key.toLowerCase() !== 'r') return;
  const definition = gardenObjectById.get(selectedItem.species);
  if (!definition?.rotatable && !definition?.randomRotation) return;
  event.preventDefault();
  rotateSelectedItem();
});
window.addEventListener('keyup', event => {
  if (event.key === 'Shift') {
    shiftHeld = false;
    toolkitRepeat.classList.remove('is-active');
  }
});
window.addEventListener('blur', () => {
  shiftHeld = false;
  toolkitRepeat.classList.remove('is-active');
});

function cellAtClientPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const screenX = (clientX - rect.left) / rect.width;
  const screenY = (clientY - rect.top) / rect.height;
  const visibleWidth = (camera.right - camera.left) / camera.zoom;
  const visibleHeight = (camera.top - camera.bottom) / camera.zoom;
  const worldX = camera.position.x + (screenX - 0.5) * visibleWidth + terrainOriginX;
  const worldY = camera.position.z + (screenY - 0.5) * visibleHeight + terrainOriginY;
  const x = Math.floor(worldX + WORLD_HALF);
  const y = Math.floor(worldY + WORLD_HALF);
  if (x < 0 || x >= WORLD_SIZE || y < 0 || y >= WORLD_SIZE) return null;
  return { x, y };
}

function itemDisplayName(item) {
  if (item.material) return GROUND_MATERIALS[item.material]?.label || item.material.replaceAll('_', ' ');
  const object = gardenObjectById.get(item.species);
  if (object) return object.label;
  const plant = allPlants.find(entry => item.species.startsWith(`${entry.id.replaceAll('-', '_')}_`));
  if (plant) {
    const stage = STAGES.find(entry => item.species.endsWith(`_${entry.id}`));
    return stage ? `${plant.label} · ${stage.label}` : plant.label;
  }
  const legacyPlant = item.species === 'pine_mature' || item.species === 'pine_growing' || item.species === 'pine_sapling'
    ? 'Pine Tree'
    : item.species.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return legacyPlant;
}

function itemKind(item) {
  if (item.material) return 'ground';
  return gardenObjectById.has(item.species) ? 'object' : 'plant';
}

let selectedShapeOutline = null;

function clearSelectedShapeOutline() {
  if (!selectedShapeOutline) return;
  scene.remove(selectedShapeOutline);
  selectedShapeOutline.material.map?.dispose();
  selectedShapeOutline.material.dispose();
  selectedShapeOutline = null;
}

function createSpriteOutlineTexture(source) {
  const sourceWidth = source.naturalWidth || source.videoWidth || source.width;
  const sourceHeight = source.naturalHeight || source.videoHeight || source.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, 512 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  const radius = Math.max(2, Math.round(Math.max(width, height) * 0.014));
  for (const distance of [Math.max(1, radius - 2), radius]) {
    for (let step = 0; step < 16; step++) {
      const angle = step * Math.PI / 8;
      context.drawImage(source, Math.round(Math.cos(angle) * distance), Math.round(Math.sin(angle) * distance), width, height);
    }
  }
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(source, 0, 0, width, height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  return texture;
}

function showSpriteOutline(selection, color) {
  const sourceMesh = scene.children.find(child => child.userData.sharedTree && child.userData.plant?.id === selection.item.id);
  const sourceImage = sourceMesh?.material?.map?.image;
  if (!sourceMesh || !sourceImage) return false;
  const texture = createSpriteOutlineTexture(sourceImage);
  if (!texture) return false;
  const outline = new THREE.Mesh(sourceMesh.geometry, new THREE.MeshBasicMaterial({
    map: texture,
    color,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  outline.position.copy(sourceMesh.position);
  outline.rotation.copy(sourceMesh.rotation);
  outline.scale.copy(sourceMesh.scale);
  outline.renderOrder = WORLD_SIZE * WORLD_SIZE + 10;
  outline.userData.selectionOutline = true;
  scene.add(outline);
  selectedShapeOutline = outline;
  return true;
}

function setSelectionHighlight(selection, cell = null, color = 0xf4f6ec) {
  clearSelectedShapeOutline();
  if (!selection) {
    dropPreview.visible = false;
    return;
  }
  if (selection === inspectedItem && selection.kind !== 'ground' && showSpriteOutline(selection, color)) {
    dropPreview.visible = false;
    return;
  }
  const item = selection.item;
  const position = cell || item;
  const footprint = selection.kind === 'ground' ? { width: 1, height: 1 } : footprintFor(item.species, item.rotation || 0);
  const center = cellCenter(position.x + footprint.width / 2 - 0.5, position.y + footprint.height / 2 - 0.5);
  // Lift the outline above sprite planes so selected items remain visibly outlined.
  dropPreview.position.set(center.x - terrainOriginX, 0.22, center.z - terrainOriginY);
  dropPreview.scale.set(footprint.width, 1, footprint.height);
  dropPreviewMaterial.color.set(color);
  dropPreview.visible = true;
}

function formatLockCountdown(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':');
}

function formatGrowthCountdown(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const clock = [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':');
  return days ? `${days}d ${clock}` : clock;
}

function updateItemActionLock() {
  if (lockCountdownTimer) clearInterval(lockCountdownTimer);
  lockCountdownTimer = null;
  const actions = [moveItemButton, bulldozeItemButton, rotateItemButton];
  const update = () => {
    const item = inspectedItem?.item;
    const lockedUntil = Number(item?.locked_until || 0);
    const remaining = Math.max(0, Math.ceil(lockedUntil - Date.now() / 1000));
    const locked = remaining > 0;
    const canChange = Boolean(item?.can_change_while_locked);
    for (const button of actions) {
      const buttonLocked = locked && !canChange;
      button.disabled = buttonLocked;
      button.setAttribute('aria-disabled', String(buttonLocked));
      button.dataset.tooltip = buttonLocked
        ? `${button.getAttribute('aria-label')} available in ${formatLockCountdown(remaining)}`
        : button.getAttribute('data-help');
    }
    if (locked && !canChange) {
      const unlockTime = new Date(lockedUntil * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      attributionLock.textContent = `Unlocks ${unlockTime}: ${formatLockCountdown(remaining)} remaining`;
      attributionLock.hidden = false;
    } else {
      attributionLock.hidden = true;
      attributionLock.textContent = '';
    }
    const nextGrowthAt = Number(item?.next_growth_at || 0);
    const growing = inspectedItem?.kind === 'plant' && nextGrowthAt > 0;
    const canFastForward = inspectedItem?.kind === 'plant' && !/_mature$/.test(item?.species || '');
    growItemButton.hidden = !canFastForward;
    growItemButton.disabled = growActionPending;
    if (growing) {
      const growthRemaining = Math.max(0, Math.ceil(nextGrowthAt - Date.now() / 1000));
      attributionGrowth.textContent = `Next stage in ${formatGrowthCountdown(growthRemaining)}`;
      attributionGrowth.hidden = false;
    } else if (inspectedItem?.kind === 'plant' && /_(mature)$/.test(item?.species || '')) {
      attributionGrowth.textContent = 'Fully grown';
      attributionGrowth.hidden = false;
    } else {
      attributionGrowth.textContent = '';
      attributionGrowth.hidden = true;
    }
    return locked || growing;
  };
  if (update()) {
    lockCountdownTimer = setInterval(() => {
      if (update()) return;
      clearInterval(lockCountdownTimer);
      lockCountdownTimer = null;
    }, 1000);
  }
}

function showItemAttribution(item, clientX, clientY, kind = itemKind(item)) {
  inspectedItem = { kind, item, clientX, clientY };
  movingItem = null;
  attributionHint.hidden = true;
  rotateItemButton.hidden = kind !== 'object' || !(gardenObjectById.get(item.species)?.rotatable || gardenObjectById.get(item.species)?.randomRotation);
  updateItemActionLock();
  attributionTitle.textContent = itemDisplayName(item);
  attributionAuthor.textContent = `Added by ${item.created_by || 'a garden visitor'}`;
  if (Number.isFinite(item.created_at)) {
    const date = new Date(item.created_at * 1000);
    attributionDate.dateTime = date.toISOString();
    attributionDate.textContent = `Added ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
    attributionDate.hidden = false;
  } else {
    attributionDate.removeAttribute('datetime');
    attributionDate.textContent = '';
    attributionDate.hidden = true;
  }
  itemAttribution.hidden = false;
  setSelectionHighlight(inspectedItem);
  const card = itemAttribution.getBoundingClientRect();
  const left = THREE.MathUtils.clamp(clientX + 14 + card.width <= window.innerWidth - 8
    ? clientX + 14 : clientX - card.width - 14, 8, window.innerWidth - card.width - 8);
  const top = clientY + card.height + 14 <= window.innerHeight - 8
    ? clientY + 14 : Math.max(8, clientY - card.height - 14);
  itemAttribution.style.transform = `translate(${left}px, ${top}px)`;
}

function dismissItemAttribution() {
  if (lockCountdownTimer) clearInterval(lockCountdownTimer);
  lockCountdownTimer = null;
  inspectedItem = null;
  movingItem = null;
  movingPointerId = null;
  itemAttribution.hidden = true;
  attributionLock.hidden = true;
  for (const button of [moveItemButton, bulldozeItemButton, rotateItemButton]) {
    button.disabled = false;
    button.setAttribute('aria-disabled', 'false');
    button.dataset.tooltip = button.getAttribute('data-help');
  }
  attributionHint.hidden = true;
  worldElement.classList.remove('moving-item');
  setSelectionHighlight(null);
}

function beginMovingItem() {
  if (!inspectedItem) return;
  clearSelectedShapeOutline();
  dropPreview.visible = false;
  movingItem = { ...inspectedItem, item: { ...inspectedItem.item } };
  selectedItem = {
    species: movingItem.item.species || movingItem.item.material,
    rotation: movingItem.item.rotation || 0,
    isObject: movingItem.kind === 'object',
    isGround: movingItem.kind === 'ground',
    groundMaterial: movingItem.item.material || null,
    connect: null,
    movingExisting: true,
  };
  if (selectedItem.isGround) pathCursorImage.src = groundTexturePreview(selectedItem.groundMaterial);
  else setPlantImage(pathCursorImage, selectedItem.species);
  pathCursorImage.style.transform = `rotate(${selectedItem.rotation * 90}deg)`;
  sizeCursorSprite(selectedItem.species);
  pathCursor.hidden = true;
  placementToolkit.hidden = true;
  itemAttribution.hidden = true;
  if (movingItem.kind === 'ground') {
    groundLayer.setTiles(groundTiles.filter(tile => tile.x !== movingItem.item.x || tile.y !== movingItem.item.y));
  } else {
    const mesh = scene.children.find(child => child.userData.sharedTree && child.userData.plant?.id === movingItem.item.id);
    if (mesh) mesh.visible = false;
  }
  worldElement.classList.add('moving-item');
}

function cancelMovingItem() {
  if (!movingItem) return;
  if (movingItem.kind === 'ground') groundLayer.setTiles(groundTiles);
  else {
    const mesh = scene.children.find(child => child.userData.sharedTree && child.userData.plant?.id === movingItem.item.id);
    if (mesh) mesh.visible = true;
  }
  movingItem = null;
  movingPointerId = null;
  selectedItem = null;
  pathCursor.hidden = true;
  placementToolkit.hidden = true;
  worldElement.classList.remove('moving-item', 'path-mode');
  attributionHint.hidden = true;
  itemAttribution.hidden = false;
  setSelectionHighlight(inspectedItem);
}

function moveDestinationOccupied(cell, selection) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= WORLD_SIZE || cell.y >= WORLD_SIZE) return true;
  if (selection.kind === 'ground') {
    return groundTiles.some(tile => tile.x === cell.x && tile.y === cell.y &&
      (tile.x !== selection.item.x || tile.y !== selection.item.y));
  }
  const footprint = footprintFor(selection.item.species, selection.item.rotation || 0);
  if (cell.x + footprint.width > WORLD_SIZE || cell.y + footprint.height > WORLD_SIZE) return true;
  return trees.some(other => {
    if (other.id === selection.item.id) return false;
    const otherFootprint = footprintFor(other.species, other.rotation || 0);
    return cell.x < other.x + otherFootprint.width && cell.x + footprint.width > other.x &&
      cell.y < other.y + otherFootprint.height && cell.y + footprint.height > other.y;
  });
}

async function performInspectedAction(action, destination = null, position = null) {
  const selection = action === 'move' && destination ? movingItem : inspectedItem;
  if (!selection) return;
  if (action === 'grow') {
    if (selection.kind !== 'plant' || growItemButton.disabled) return;
    growActionPending = true;
    growItemButton.disabled = true;
  }
  if (action === 'move' && !destination) {
    beginMovingItem();
    return;
  }
  const item = selection.item;
  const payload = { action, kind: selection.kind };
  if (selection.kind === 'ground') {
    payload.x = item.x;
    payload.y = item.y;
  } else payload.id = item.id;
  if (action === 'move') payload.destination = destination;
  if (action === 'move' && selection.kind === 'object') payload.rotation = selectedItem?.rotation ?? item.rotation ?? 0;
  try {
    const response = await fetch('/api/item-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    updateChangeAllowance(result.change_allowance);
    if (!response.ok) {
      if (result.error === 'item_locked' && Number.isFinite(result.locked_until)) {
        selection.item.locked_until = result.locked_until;
        if (inspectedItem) inspectedItem.item.locked_until = result.locked_until;
        updateItemActionLock();
        throw new Error('This item is locked for now.');
      }
      throw new Error(apiErrorMessage(result, 'Could not update this item'));
    }
    if (action === 'grow') growActionPending = false;
    revision = result.revision;
    if (action === 'move') movingItem = null;
    if (selection.kind === 'ground') {
      groundTiles = groundTiles.filter(tile => tile.x !== item.x || tile.y !== item.y);
      if (result.item) groundTiles.push(result.item);
      groundLayer.setTiles(groundTiles);
    } else {
      const next = trees.filter(existing => existing.id !== item.id);
      if (result.item) next.push(result.item);
      renderTrees(next);
    }
    movingItem = null;
    movingPointerId = null;
    selectedItem = null;
    pathCursor.hidden = true;
    placementToolkit.hidden = true;
    worldElement.classList.remove('moving-item', 'path-mode');
    if (result.item) showItemAttribution(result.item, position?.clientX ?? selection.clientX,
      position?.clientY ?? selection.clientY, selection.kind);
    else dismissItemAttribution();
  } catch (error) {
    if (/claimed|occupied/i.test(error.message)) await refreshGardenState();
    if (action === 'grow') {
      growActionPending = false;
      growItemButton.disabled = false;
    }
    if (movingItem) {
      toolkitHint.textContent = error.message;
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    } else {
      attributionHint.textContent = error.message;
      attributionHint.hidden = false;
    }
  }
}

moveItemButton.addEventListener('click', () => void performInspectedAction('move'));
bulldozeItemButton.addEventListener('click', () => void performInspectedAction('bulldoze'));
rotateItemButton.addEventListener('click', () => void performInspectedAction('rotate'));
growItemButton.addEventListener('click', () => void performInspectedAction('grow'));

function inspectAtClientPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const itemMeshes = scene.children.filter(child => child.userData.sharedTree);
  const hit = raycaster.intersectObjects(itemMeshes, false)[0];
  if (hit?.object.userData.plant) {
    const item = hit.object.userData.plant;
    showItemAttribution(item, clientX, clientY, itemKind(item));
    return;
  }
  const cell = cellAtClientPoint(clientX, clientY);
  const tile = cell && groundTiles.find(entry => entry.x === cell.x && entry.y === cell.y);
  if (tile) showItemAttribution({ ...tile, material: tile.material }, clientX, clientY, 'ground');
  else dismissItemAttribution();
}

function footprintFor(species, rotation = 0) {
  const object = gardenObjectById.get(species);
  if (!object) return { width: 1, height: 1 };
  const [baseWidth, baseHeight] = object.footprint;
  return rotation % 2 ? { width: baseHeight, height: baseWidth } : { width: baseWidth, height: baseHeight };
}

function placementIsOccupied(cell, species, rotation = 0) {
  const footprint = footprintFor(species, rotation);
  if (cell.x + footprint.width > WORLD_SIZE || cell.y + footprint.height > WORLD_SIZE) return true;
  return trees.some(item => {
    const other = footprintFor(item.species, item.rotation || 0);
    return cell.x < item.x + other.width && cell.x + footprint.width > item.x &&
      cell.y < item.y + other.height && cell.y + footprint.height > item.y;
  });
}

function pathExistsAt(cell, connectType = selectedItem?.connect) {
  if (!connectType) return false;
  return trees.some(item => item.x === cell.x && item.y === cell.y &&
    gardenObjectById.get(item.species)?.connect === connectType);
}

function strokeCell(stroke, cell) {
  const key = `${cell.x},${cell.y}`;
  const currentlyExists = stroke.actions.has(key)
    ? stroke.actions.get(key) === 'draw'
    : pathExistsAt(cell, stroke.connect);
  stroke.actions.set(key, currentlyExists ? 'erase' : 'draw');
}

function groundStrokeCell(stroke, cell) {
  const key = `${cell.x},${cell.y}`;
  const storedMaterial = groundTiles.find(tile => tile.x === cell.x && tile.y === cell.y)?.material || null;
  const currentMaterial = stroke.actions.has(key) ? stroke.actions.get(key) : storedMaterial;
  stroke.actions.set(key, currentMaterial === stroke.material ? null : stroke.material);
}

function strokeLine(stroke, from, to, visitCell = strokeCell) {
  let x = from.x, y = from.y;
  const dx = Math.abs(to.x - from.x), sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y), sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  while (x !== to.x || y !== to.y) {
    const twiceError = 2 * error;
    if (twiceError >= dy) { error += dy; x += sx; }
    if (twiceError <= dx) { error += dx; y += sy; }
    visitCell(stroke, { x, y });
  }
  updatePathStrokePreview(stroke);
}

function updatePathStrokePreview(stroke) {
  const positions = [];
  const colors = [];
  const drawColor = new THREE.Color(0xf4f6ec);
  const eraseColor = new THREE.Color(0xe5a28c);
  for (const [key, action] of stroke.actions) {
    const [x, y] = key.split(',').map(Number);
    const center = cellCenter(x, y);
    const left = center.x - terrainOriginX - 0.49;
    const right = center.x - terrainOriginX + 0.49;
    const back = center.z - terrainOriginY - 0.49;
    const front = center.z - terrainOriginY + 0.49;
    const corners = [[left, back], [right, back], [right, front], [left, front]];
    const isPaint = stroke.mode === 'ground' ? action !== null : action === 'draw';
    const color = isPaint ? drawColor : eraseColor;
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i], b = corners[(i + 1) % 4];
      positions.push(a[0], 0.045, a[1], b[0], 0.045, b[1]);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  pathStrokePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pathStrokePreviewGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  pathStrokePreviewGeometry.computeBoundingSphere();
  pathStrokePreview.visible = positions.length > 0;
}

async function refreshGardenState() {
  try {
    const response = await fetch('/api/state', {
      headers: { 'X-Visitor-Id': visitorId },
      cache: 'no-store',
    });
    if (!response.ok) return;
    const data = await response.json();
    revision = data.revision;
    renderTrees([...(data.plants || []), ...(data.objects || [])]);
    groundTiles = data.ground_tiles || [];
    groundLayer.setTiles(groundTiles);
    updateChangeAllowance(data.change_allowance);
  } catch {
    // The regular state poll will reconcile the view when the server is reachable.
  }
}

let conflictOutlineTimer = null;
function showConflictCells(cells) {
  const positions = [];
  const colors = [];
  const color = new THREE.Color(0xe58b70);
  for (const { x, y } of cells) {
    const center = cellCenter(x, y);
    const left = center.x - terrainOriginX - 0.49;
    const right = center.x - terrainOriginX + 0.49;
    const back = center.z - terrainOriginY - 0.49;
    const front = center.z - terrainOriginY + 0.49;
    const corners = [[left, back], [right, back], [right, front], [left, front]];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i], b = corners[(i + 1) % 4];
      positions.push(a[0], 0.055, a[1], b[0], 0.055, b[1]);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  if (!positions.length) return;
  clearTimeout(conflictOutlineTimer);
  pathStrokePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pathStrokePreviewGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  pathStrokePreviewGeometry.computeBoundingSphere();
  pathStrokePreview.visible = true;
  conflictOutlineTimer = setTimeout(() => {
    pathStrokePreview.visible = false;
    pathStrokePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    pathStrokePreviewGeometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
  }, 2200);
}

async function commitPathStroke(stroke) {
  let hasConflicts = false;
  try {
    let nextTrees = [...trees];
    let lockedCells = 0;
    let limitReached = false;
    let latestAllowance = null;
    const conflicts = new Map();
    for (const action of ['erase', 'draw']) {
      const cells = [...stroke.actions].filter(([, cellAction]) => cellAction === action)
        .map(([key]) => { const [x, y] = key.split(',').map(Number); return { x, y }; });
      if (!cells.length) continue;
      const response = await fetch('/api/path-stroke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
        body: JSON.stringify({ species: stroke.species, action, cells, created_by: visitorName }),
      });
      const result = await response.json();
      updateChangeAllowance(result.change_allowance);
      latestAllowance = result.change_allowance || latestAllowance;
      if (!response.ok) throw new Error(apiErrorMessage(result, 'Could not update the path'));
      revision = result.revision;
      lockedCells += result.locked?.length || 0;
      for (const cell of result.conflicts || []) conflicts.set(`${cell.x},${cell.y}`, cell);
      limitReached ||= Boolean(result.limit_reached);
      const removedCells = new Set((result.removed || []).map(item => `${item.x},${item.y}`));
      nextTrees = [...nextTrees.filter(item => !removedCells.has(`${item.x},${item.y}`)), ...(result.added || [])];
    }
    renderTrees(nextTrees);
    if (conflicts.size) {
      hasConflicts = true;
      await refreshGardenState();
      showConflictCells([...conflicts.values()]);
    }
    if (limitReached) {
      toolkitHint.textContent = apiErrorMessage({ error: 'change_limit', change_allowance: latestAllowance });
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    } else if (lockedCells) {
      toolkitHint.textContent = `${lockedCells} path cell${lockedCells === 1 ? ' is' : 's are'} still locked.`;
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    } else if (conflicts.size) {
      toolkitHint.textContent = `${conflicts.size} square${conflicts.size === 1 ? ' was' : 's were'} claimed by another visitor. The rest of the stroke was placed.`;
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    }
  } catch (error) {
    toolkitHint.textContent = error.message;
    toolkitHint.hidden = false;
    placementToolkit.hidden = false;
  } finally {
    if (!hasConflicts) {
      pathStrokePreview.visible = false;
      pathStrokePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      pathStrokePreviewGeometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    }
  }
}

async function commitGroundStroke(stroke) {
  let hasConflicts = false;
  try {
    const cells = [...stroke.actions].map(([key, material]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, material, expected_material: stroke.originalMaterials.get(`${x},${y}`) ?? null };
    });
    const response = await fetch('/api/ground-stroke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
      body: JSON.stringify({ cells, created_by: visitorName }),
    });
    const result = await response.json();
    updateChangeAllowance(result.change_allowance);
    if (!response.ok) throw new Error(apiErrorMessage(result, 'Could not update ground texture'));
    revision = result.revision;
    const removed = new Set((result.removed || []).map(tile => `${tile.x},${tile.y}`));
    const updated = new Map((result.updated || []).map(tile => [`${tile.x},${tile.y}`, tile]));
    groundTiles = groundTiles.filter(tile => !removed.has(`${tile.x},${tile.y}`) && !updated.has(`${tile.x},${tile.y}`));
    groundTiles.push(...updated.values());
    groundLayer.setTiles(groundTiles);
    if (result.conflicts?.length) {
      hasConflicts = true;
      await refreshGardenState();
      showConflictCells(result.conflicts);
      toolkitHint.textContent = `${result.conflicts.length} ground tile${result.conflicts.length === 1 ? ' changed' : 's changed'} before this stroke arrived. The rest was applied.`;
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    }
    if (result.limit_reached) {
      toolkitHint.textContent = apiErrorMessage({ error: 'change_limit', change_allowance: result.change_allowance });
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    } else if (result.locked?.length) {
      toolkitHint.textContent = `${result.locked.length} ground tile${result.locked.length === 1 ? ' is' : 's are'} still locked.`;
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    }
  } catch (error) {
    toolkitHint.textContent = error.message;
    toolkitHint.hidden = false;
    placementToolkit.hidden = false;
  } finally {
    if (!hasConflicts) {
      pathStrokePreview.visible = false;
      pathStrokePreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      pathStrokePreviewGeometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    }
  }
}

function updateDropPreview(cell, species = null, rotation = 0) {
  if (!cell) {
    dropPreview.visible = false;
    return;
  }
  const footprint = footprintFor(species, rotation);
  const center = cellCenter(cell.x + footprint.width / 2 - 0.5, cell.y + footprint.height / 2 - 0.5);
  dropPreview.position.set(center.x - terrainOriginX, 0.035, center.z - terrainOriginY);
  dropPreview.scale.set(footprint.width, 1, footprint.height);
  const connectType = gardenObjectById.get(species)?.connect;
  const isGround = Boolean(gardenObjectById.get(species)?.groundMaterial);
  const occupied = !isGround && placementIsOccupied(cell, species, rotation);
  const removableSegment = connectType && pathExistsAt(cell, connectType);
  dropPreviewMaterial.color.set(removableSegment ? 0xe5a28c : occupied ? 0xd58065 : 0xf4f6ec);
  dropPreview.visible = true;
}

async function placeSelectedItem(cell, keepSelected = false) {
  if (!cell || !selectedItem) return;
  const { species, connect } = selectedItem;
  try {
    if (connect) {
      const action = pathExistsAt(cell, connect) ? 'erase' : 'draw';
      const response = await fetch('/api/path-stroke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
        body: JSON.stringify({ species, action, cells: [cell], created_by: visitorName }),
      });
      const result = await response.json();
      updateChangeAllowance(result.change_allowance);
      if (!response.ok) throw new Error(apiErrorMessage(result, 'Could not update this cell'));
      revision = result.revision;
      if (result.conflicts?.length) {
        await refreshGardenState();
        showConflictCells(result.conflicts);
        toolkitHint.textContent = 'Another visitor just claimed this square. The garden has been refreshed.';
        toolkitHint.hidden = false;
        placementToolkit.hidden = false;
      }
      if (result.locked?.length) {
        toolkitHint.textContent = 'This path cell is still locked.';
        toolkitHint.hidden = false;
        placementToolkit.hidden = false;
      }
      if (result.limit_reached) {
        toolkitHint.textContent = apiErrorMessage({ error: 'change_limit', change_allowance: result.change_allowance });
        toolkitHint.hidden = false;
        placementToolkit.hidden = false;
      }
      if (result.added?.length || result.removed?.length) {
        const removedCells = new Set((result.removed || []).map(item => `${item.x},${item.y}`));
        renderTrees([
          ...trees.filter(item => !removedCells.has(`${item.x},${item.y}`)),
          ...(result.added || []),
        ]);
      }
    } else {
      if (placementIsOccupied(cell, species, selectedItem.rotation)) return;
      const response = await fetch(selectedItem.isObject ? '/api/objects' : '/api/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
        body: JSON.stringify({ species, x: cell.x, y: cell.y, rotation: selectedItem.rotation, created_by: visitorName }),
      });
      const result = await response.json();
      updateChangeAllowance(result.change_allowance);
      if (!response.ok) throw new Error(apiErrorMessage(result, 'Could not place this item'));
      revision = result.revision;
      const placed = result.plant || result.object;
      renderTrees([...trees, placed]);
      if (keepSelected) {
        hoverCell = cell;
        pathCursor.hidden = false;
        updateDropPreview(cell, species, selectedItem.rotation);
        return;
      }
      selectedItem = null;
      addToggle.classList.remove('path-brush-active');
      worldElement.classList.remove('path-mode');
      addToggle.setAttribute('aria-label', 'Add to garden');
      addToggle.title = 'Add to garden';
      pathCursor.hidden = true;
      placementToolkit.hidden = true;
      dropPreview.visible = false;
      showSpecies();
      setPlantMenuOpen(true);
      return;
    }
  } catch (error) {
    if (/claimed|occupied/i.test(error.message)) await refreshGardenState();
    toolkitHint.textContent = error.message;
    toolkitHint.hidden = false;
    placementToolkit.hidden = false;
  }
  if (hoverCell) updateDropPreview(hoverCell, species, selectedItem?.rotation || 0);
}

const plantMaterials = new Map();
const pathMaterials = new Map();
const pathMaterialItems = new Map();
const connectedMaterials = new Map();
const connectedMaterialItems = new Map();
const pathSurfaceData = new Map();
const loadingPathSurfaces = new Map();
const loadingPlantMaterials = new Set();
const plantTextureLoader = new THREE.TextureLoader();

function loadPathSurface(species) {
  if (pathSurfaceData.has(species)) return Promise.resolve(pathSurfaceData.get(species));
  if (loadingPathSurfaces.has(species)) return loadingPathSurfaces.get(species);
  const promise = new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const surface = { canvas, width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
      pathSurfaceData.set(species, surface);
      for (const [key, material] of pathMaterials) {
        const item = pathMaterialItems.get(key);
        if (item?.species !== species || !material.map) continue;
        material.map.image = createPathCanvas(item, item.connections, undefined, surface);
        material.map.needsUpdate = true;
      }
      for (const [key, material] of connectedMaterials) {
        const item = connectedMaterialItems.get(key);
        if (item?.species !== species || !material.map) continue;
        material.map.image = createConnectedSegmentCanvas(64, surface, item.connections,
          gardenObjectById.get(item.species)?.connect);
        material.map.needsUpdate = true;
      }
      resolve(surface);
    };
    image.onerror = () => resolve(null);
    image.src = plantAsset(species);
  });
  loadingPathSurfaces.set(species, promise);
  return promise;
}

function ensurePathMaterial(plant, connections) {
  const key = `${plant.id}:${plant.species}:${connections}`;
  if (!pathMaterials.has(key)) {
    const surface = pathSurfaceData.get(plant.species);
    const texture = new THREE.CanvasTexture(createPathCanvas(plant, connections, undefined, surface));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 1;
    pathMaterials.set(key, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    pathMaterialItems.set(key, { ...plant, connections });
    if (!surface) loadPathSurface(plant.species);
  }
  return { key, material: pathMaterials.get(key) };
}

function ensureConnectedMaterial(plant, connections) {
  const key = `${plant.id}:${plant.species}:${connections}`;
  if (!connectedMaterials.has(key)) {
    const surface = pathSurfaceData.get(plant.species);
    const connectType = gardenObjectById.get(plant.species)?.connect;
    const canvas = surface ? createConnectedSegmentCanvas(64, surface, connections, connectType) : document.createElement('canvas');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 1;
    connectedMaterials.set(key, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.04,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    connectedMaterialItems.set(key, { ...plant, connections });
    if (!surface) loadPathSurface(plant.species);
  }
  return { key, material: connectedMaterials.get(key) };
}

function ensurePlantMaterial(species) {
  if (plantMaterials.has(species) || loadingPlantMaterials.has(species)) return;
  loadingPlantMaterials.add(species);
  plantTextureLoader.load(plantAsset(species), texture => {
    const crop = PLANT_SPRITE_CROPS[species];
    if (crop) {
      const canvas = document.createElement('canvas');
      canvas.width = crop.width;
      canvas.height = crop.height;
      canvas.getContext('2d').drawImage(texture.image, crop.left, crop.top, crop.width, crop.height,
        0, 0, crop.width, crop.height);
      texture.image = canvas;
      texture.needsUpdate = true;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = true;
    if (!LEGACY_ASSETS[species] && !species.startsWith('pine_tree_')) {
      plantGeometry.set(species, geometryFor(species, texture.image.width / texture.image.height));
    }
    plantMaterials.set(species, new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.06,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    loadingPlantMaterials.delete(species);
    renderTrees(trees);
  }, undefined, () => loadingPlantMaterials.delete(species));
}
for (const species of Object.keys(LEGACY_ASSETS)) ensurePlantMaterial(species);

const dropPreviewGeometry = new THREE.BufferGeometry();
dropPreviewGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.49, 0, -0.49,
  0.49, 0, -0.49,
  0.49, 0, 0.49,
  -0.49, 0, 0.49,
], 3));
const dropPreviewMaterial = new THREE.LineBasicMaterial({
  color: 0xf4f6ec, transparent: true, opacity: 0.98,
  depthTest: true, depthWrite: false,
});
const dropPreview = new THREE.LineLoop(dropPreviewGeometry, dropPreviewMaterial);
dropPreview.visible = false;
dropPreview.renderOrder = WORLD_SIZE * WORLD_SIZE + 2;
scene.add(dropPreview);
const pathStrokePreviewGeometry = new THREE.BufferGeometry();
const pathStrokePreviewMaterial = new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false,
});
const pathStrokePreview = new THREE.LineSegments(pathStrokePreviewGeometry, pathStrokePreviewMaterial);
pathStrokePreview.visible = false;
pathStrokePreview.renderOrder = WORLD_SIZE * WORLD_SIZE + 3;
scene.add(pathStrokePreview);

function cellCenter(cellX, cellY) {
  return { x: cellX - WORLD_HALF + 0.5, z: cellY - WORLD_HALF + 0.5 };
}

function renderTrees(nextTrees) {
  trees = nextTrees;
  scene.children.filter(child => child.userData.sharedTree).forEach(tree => scene.remove(tree));
  const connectedByType = new Map();
  for (const item of trees) {
    const connectType = gardenObjectById.get(item.species)?.connect;
    if (!['path', 'fence', 'wall'].includes(connectType)) continue;
    if (!connectedByType.has(connectType)) connectedByType.set(connectType, new Map());
    connectedByType.get(connectType).set(`${item.x},${item.y}`, item);
  }
  const activePathMaterials = new Set();
  const activeConnectedMaterials = new Set();
  for (const plant of trees) {
    const definition = gardenObjectById.get(plant.species);
    let material;
    if (definition?.connect === 'path') {
      const connections = pathConnectionMask(plant.x, plant.y, connectedByType.get('path'));
      const connectedMaterial = ensurePathMaterial(plant, connections);
      material = connectedMaterial.material;
      activePathMaterials.add(connectedMaterial.key);
    } else if (definition?.connect === 'fence') {
      const connections = pathConnectionMask(plant.x, plant.y, connectedByType.get('fence'));
      const connectedMaterial = ensureConnectedMaterial(plant, connections);
      material = connectedMaterial.material;
      activeConnectedMaterials.add(connectedMaterial.key);
    } else if (definition?.connect === 'wall') {
      const connections = pathConnectionMask(plant.x, plant.y, connectedByType.get('wall'));
      const connectedMaterial = ensureConnectedMaterial(plant, connections);
      material = connectedMaterial.material;
      activeConnectedMaterials.add(connectedMaterial.key);
    } else {
      ensurePlantMaterial(plant.species);
      material = plantMaterials.get(plant.species);
    }
    const visual = plantGeometry.get(plant.species);
    if (!material || !visual) continue;
    const tree = new THREE.Mesh(visual.geometry, material);
    const rotation = plant.rotation || 0;
    const footprint = footprintFor(plant.species, rotation);
    const center = cellCenter(plant.x + footprint.width / 2 - 0.5, plant.y + footprint.height / 2 - 0.5);
    const isConnectedGroundObject = ['path', 'fence', 'wall'].includes(definition?.connect);
    tree.position.set(center.x - terrainOriginX, isConnectedGroundObject ? 0.035 : 0.08, center.z - visual.groundAnchor - terrainOriginY);
    tree.rotation.y = rotation * Math.PI / 2;
    tree.userData.sharedTree = true;
    tree.userData.plant = plant;
    if (movingItem && movingItem.kind !== 'ground' && plant.id === movingItem.item.id) tree.visible = false;
    // Grid Y is screen depth: smaller rows sit farther back. Draw them first
    // so the lower, foreground plants naturally cover their canopies.
    tree.renderOrder = isConnectedGroundObject ? 1 : (plant.y + footprint.height - 1) * WORLD_SIZE + plant.x + 2;
    scene.add(tree);
  }
  for (const [key, material] of pathMaterials) {
    if (activePathMaterials.has(key)) continue;
    material.map?.dispose();
    material.dispose();
    pathMaterials.delete(key);
    pathMaterialItems.delete(key);
  }
  for (const [key, material] of connectedMaterials) {
    if (activeConnectedMaterials.has(key)) continue;
    material.map?.dispose();
    material.dispose();
    connectedMaterials.delete(key);
    connectedMaterialItems.delete(key);
  }
}

function updateCamera() {
  const aspect = worldElement.clientWidth / worldElement.clientHeight;
  const landscapeSpan = WILDERNESS_HALF * 2;
  const maxVisibleHeight = Math.min(landscapeSpan, landscapeSpan / aspect);
  const minZoom = viewHeight / maxVisibleHeight;
  zoom = THREE.MathUtils.clamp(zoom, minZoom, 4.2);
  const height = viewHeight / zoom;
  const width = height * aspect;
  target.x = THREE.MathUtils.clamp(target.x, -WILDERNESS_HALF + width / 2, WILDERNESS_HALF - width / 2);
  target.z = THREE.MathUtils.clamp(target.z, -WILDERNESS_HALF + height / 2, WILDERNESS_HALF - height / 2);
  const nextOriginX = Math.floor(target.x / CHUNK_SIZE) * CHUNK_SIZE;
  const nextOriginY = Math.floor(target.z / CHUNK_SIZE) * CHUNK_SIZE;
  const originChanged = nextOriginX !== terrainOriginX || nextOriginY !== terrainOriginY;
  terrainOriginX = nextOriginX;
  terrainOriginY = nextOriginY;
  const localTarget = new THREE.Vector3(target.x - terrainOriginX, 0, target.z - terrainOriginY);
  // Keep the grid in the same rebased coordinate space as terrain chunks and plants.
  worldGrid.position.set(-terrainOriginX, 0, -terrainOriginY);
  groundLayer.updateOrigin(terrainOriginX, terrainOriginY);
  camera.position.set(localTarget.x, 80, localTarget.z);
  camera.lookAt(localTarget);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  terrain.update(target.x, target.z, width, height, terrainOriginX, terrainOriginY);
  wilderness.update(target.x, target.z, width, height, terrainOriginX, terrainOriginY, performance.now());
  if (originChanged) {
    for (const tree of scene.children.filter(child => child.userData.sharedTree)) {
      const plant = tree.userData.plant;
      const footprint = footprintFor(plant.species, plant.rotation || 0);
      const center = cellCenter(plant.x + footprint.width / 2 - 0.5, plant.y + footprint.height / 2 - 0.5);
      const visual = plantGeometry.get(plant.species);
      const definition = gardenObjectById.get(plant.species);
      const isConnectedGroundObject = ['path', 'fence', 'wall'].includes(definition?.connect);
      tree.position.set(center.x - terrainOriginX, isConnectedGroundObject ? 0.035 : 0.08, center.z - (visual?.groundAnchor || 0) - terrainOriginY);
    }
  }
}

function resize() {
  const width = worldElement.clientWidth;
  const height = worldElement.clientHeight;
  if (!width || !height) return;
  renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), false);
  const aspect = width / height;
  const verticalHalf = viewHeight / 2;
  camera.left = -verticalHalf * aspect;
  camera.right = verticalHalf * aspect;
  camera.top = verticalHalf;
  camera.bottom = -verticalHalf;
  updateCamera();
  if (selectedItem) sizeCursorSprite(selectedItem.species);
}

new ResizeObserver(resize).observe(worldElement);
resize();

function refreshPresence() {
  fetch(`/api/state?since=${revision}`, { headers: { 'X-Visitor-Id': visitorId }, cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('offline'); return response.json(); })
    .then(data => {
      updateChangeAllowance(data.change_allowance);
      if (!data.unchanged && data.revision !== revision) {
        revision = data.revision;
        const nextPlants = data.plants || [];
        const nextObjects = data.objects || [];
        renderTrees([...nextPlants, ...nextObjects]);
        groundTiles = data.ground_tiles || [];
        groundLayer.setTiles(movingItem?.kind === 'ground'
          ? groundTiles.filter(tile => tile.x !== movingItem.item.x || tile.y !== movingItem.item.y)
          : groundTiles);
        if (inspectedItem) {
          const latestItem = inspectedItem.kind === 'plant'
            ? nextPlants.find(item => item.id === inspectedItem.item.id)
            : inspectedItem.kind === 'object'
              ? nextObjects.find(item => item.id === inspectedItem.item.id)
              : groundTiles.find(item => item.x === inspectedItem.item.x && item.y === inspectedItem.item.y);
          if (latestItem) {
            inspectedItem.item = latestItem;
            attributionTitle.textContent = itemDisplayName(latestItem);
            updateItemActionLock();
          }
        }
      }
    })
    .catch(() => {});
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  if (movingItem) {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    movingPointerId = event.pointerId;
    return;
  }
  if (!itemAttribution.hidden) dismissItemAttribution();
  if (selectedItem?.isGround) {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    groundStroke = {
      pointerId: event.pointerId,
      mode: 'ground',
      material: selectedItem.groundMaterial,
      actions: new Map(),
      originalMaterials: new Map(groundTiles.map(tile => [`${tile.x},${tile.y}`, tile.material])),
      lastCell: cell,
    };
    worldElement.classList.add('drawing-path');
    groundStrokeCell(groundStroke, cell);
    updatePathStrokePreview(groundStroke);
    return;
  }
  if (selectedItem?.connect) {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pathStroke = {
      pointerId: event.pointerId,
      mode: 'path',
      species: selectedItem.species,
      connect: selectedItem.connect,
      actions: new Map(),
      lastCell: cell,
    };
    worldElement.classList.add('drawing-path');
    strokeCell(pathStroke, cell);
    updatePathStrokePreview(pathStroke);
    return;
  }
  // On touch screens, keep a held plant attached to the finger and place it
  // on release. Starting a pan here makes touch placement feel like dragging
  // the whole world instead of moving the selected plant.
  if (selectedItem && event.pointerType === 'touch') {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    placementPointerId = event.pointerId;
    hoverCell = cell;
    pathCursor.hidden = false;
    pathCursor.style.transform = `translate(${event.clientX - pathCursor.offsetWidth / 2}px, ${event.clientY - pathCursor.offsetHeight / 2 - 44}px)`;
    updatePlacementToolkit(event.clientX, event.clientY);
    updateDropPreview(cell, selectedItem.species, selectedItem.rotation);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    targetX: target.x,
    targetZ: target.z,
    moved: false,
  };
  worldElement.classList.add('dragging');
});
canvas.addEventListener('pointermove', event => {
  if (movingItem) {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (cell) {
      hoverCell = cell;
      pathCursor.hidden = false;
      pathCursor.style.transform = `translate(${event.clientX - pathCursor.offsetWidth / 2}px, ${event.clientY - pathCursor.offsetHeight / 2}px)`;
      updatePlacementToolkit(event.clientX, event.clientY);
      const color = moveDestinationOccupied(cell, movingItem) ? 0xe5a28c : 0xf4f6ec;
      setSelectionHighlight(movingItem, cell, color);
    } else {
      hoverCell = null;
      pathCursor.hidden = true;
      placementToolkit.hidden = true;
      dropPreview.visible = false;
    }
    return;
  }
  if (selectedItem) {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (cell) {
      hoverCell = cell;
      pathCursor.hidden = false;
      const touchOffset = event.pointerType === 'touch' ? 44 : 0;
      pathCursor.style.transform = `translate(${event.clientX - pathCursor.offsetWidth / 2}px, ${event.clientY - pathCursor.offsetHeight / 2 - touchOffset}px)`;
      updatePlacementToolkit(event.clientX, event.clientY);
      updateDropPreview(cell, selectedItem.species, selectedItem.rotation);
    } else {
      hoverCell = null;
      pathCursor.hidden = true;
      placementToolkit.hidden = true;
      dropPreview.visible = false;
    }
    if (placementPointerId === event.pointerId) return;
  }
  if (pathStroke?.pointerId === event.pointerId) {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (cell && (cell.x !== pathStroke.lastCell.x || cell.y !== pathStroke.lastCell.y)) {
      strokeLine(pathStroke, pathStroke.lastCell, cell);
      pathStroke.lastCell = cell;
    }
    return;
  }
  if (groundStroke?.pointerId === event.pointerId) {
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (cell && (cell.x !== groundStroke.lastCell.x || cell.y !== groundStroke.lastCell.y)) {
      strokeLine(groundStroke, groundStroke.lastCell, cell, groundStrokeCell);
      groundStroke.lastCell = cell;
    }
    return;
  }
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (drag.moved) {
    const factor = (viewHeight / zoom) / worldElement.clientHeight;
    target.x = drag.targetX - dx * factor;
    target.z = drag.targetZ - dy * factor;
    updateCamera();
  }
});
canvas.addEventListener('pointerup', event => {
  if (movingPointerId === event.pointerId) {
    movingPointerId = null;
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (cell && !moveDestinationOccupied(cell, movingItem)) {
      void performInspectedAction('move', cell, { clientX: event.clientX, clientY: event.clientY });
    } else {
      toolkitHint.textContent = 'Choose an empty square inside the garden.';
      toolkitHint.hidden = false;
      placementToolkit.hidden = false;
    }
    return;
  }
  if (placementPointerId === event.pointerId) {
    placementPointerId = null;
    const cell = cellAtClientPoint(event.clientX, event.clientY);
    if (cell && selectedItem) void placeSelectedItem(cell, event.shiftKey || shiftHeld);
    return;
  }
  if (pathStroke?.pointerId === event.pointerId) {
    const stroke = pathStroke;
    pathStroke = null;
    worldElement.classList.remove('drawing-path');
    void commitPathStroke(stroke);
    return;
  }
  if (groundStroke?.pointerId === event.pointerId) {
    const stroke = groundStroke;
    groundStroke = null;
    worldElement.classList.remove('drawing-path');
    void commitGroundStroke(stroke);
    return;
  }
  if (!drag || drag.pointerId !== event.pointerId) return;
  const wasClick = !drag.moved;
  drag = null;
  worldElement.classList.remove('dragging');
  if (wasClick && selectedItem) void placeSelectedItem(cellAtClientPoint(event.clientX, event.clientY), event.shiftKey || shiftHeld);
  else if (wasClick) inspectAtClientPoint(event.clientX, event.clientY);
});
canvas.addEventListener('pointercancel', () => {
  movingPointerId = null;
  placementPointerId = null;
  pathStroke = null;
  groundStroke = null;
  pathStrokePreview.visible = false;
  dropPreview.visible = false;
  pathCursor.hidden = true;
  placementToolkit.hidden = true;
  hoverCell = null;
  drag = null;
  worldElement.classList.remove('dragging');
  worldElement.classList.remove('drawing-path');
});
canvas.addEventListener('pointerleave', () => {
  if (movingItem || inspectedItem) return;
  if (drag || pathStroke || groundStroke) return;
  hoverCell = null;
  pathCursor.hidden = true;
  placementToolkit.hidden = true;
  dropPreview.visible = false;
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const aspect = worldElement.clientWidth / worldElement.clientHeight;
  const landscapeSpan = WILDERNESS_HALF * 2;
  const minZoom = viewHeight / Math.min(landscapeSpan, landscapeSpan / aspect);
  zoom = THREE.MathUtils.clamp(zoom * (event.deltaY < 0 ? 1.14 : 0.88), minZoom, 4.2);
  updateCamera();
  if (selectedItem) sizeCursorSprite(selectedItem.species);
}, { passive: false });
canvas.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (movingItem) {
    cancelMovingItem();
  } else if (selectedItem) goBackToPicker();
});

let lastFrame = 0;
function animate(now) {
  requestAnimationFrame(animate);
  if (now - lastFrame < 33) return;
  lastFrame = now;
  wilderness.animate(now);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
refreshPresence();
setInterval(refreshPresence, 1300);
