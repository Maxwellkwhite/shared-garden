import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRAIN_DEFAULTS,
  carpetMarkAt,
  chunkPixelColor,
  grassTuftAt,
  sampleGrassColor,
} from './terrain-core.mjs';
import { intersectChunkWithBounds } from './terrain.mjs';

test('grass colors are deterministic for a seed and world coordinate', () => {
  const first = sampleGrassColor(-42.25, 103.75, 901);
  const second = sampleGrassColor(-42.25, 103.75, 901);
  assert.deepEqual(first, second);
});

test('different world seeds produce different terrain fields', () => {
  const locations = Array.from({ length: 30 }, (_, index) => [index * 7.3, index * -2.1]);
  assert.ok(locations.some(([x, y]) =>
    sampleGrassColor(x, y, 101).some((channel, index) => channel !== sampleGrassColor(x, y, 202)[index]),
  ));
});

test('chunk pixel coordinates map to one continuous world field at boundaries', () => {
  const width = TERRAIN_DEFAULTS.chunkSize * TERRAIN_DEFAULTS.pixelsPerUnit;
  const fromWestChunk = chunkPixelColor(-3, 2, width, 71);
  const fromEastChunk = chunkPixelColor(-2, 2, 0, 71);
  const fromSouthChunk = chunkPixelColor(4, -1, 53, width);
  const fromNorthChunk = chunkPixelColor(4, 0, 53, 0);
  assert.deepEqual(fromWestChunk, fromEastChunk);
  assert.deepEqual(fromSouthChunk, fromNorthChunk);
});

test('terrain chunks clip exactly to the square world boundary', () => {
  const bounds = { minX: -25, minY: -25, maxX: 25, maxY: 25 };
  assert.deepEqual(intersectChunkWithBounds(-2, -2, 16, bounds), {
    minX: -25, minY: -25, maxX: -16, maxY: -16, width: 9, height: 9,
  });
  assert.deepEqual(intersectChunkWithBounds(1, 1, 16, bounds), {
    minX: 16, minY: 16, maxX: 25, maxY: 25, width: 9, height: 9,
  });
  assert.equal(intersectChunkWithBounds(2, 0, 16, bounds), null);
  assert.equal(intersectChunkWithBounds(-3, 0, 16, bounds), null);
});

test('grass tuft placement and shape are stable by world cell', () => {
  const first = grassTuftAt(-11, 24);
  const second = grassTuftAt(-11, 24);
  assert.deepEqual(first, second);
});

test('different grass cells receive varied tuft placement', () => {
  const tufts = [];
  for (let y = -12; y < 12; y += 1) {
    for (let x = -12; x < 12; x += 1) {
      const tuft = grassTuftAt(x, y);
      if (tuft) tufts.push(tuft);
    }
  }
  assert.ok(tufts.length > 30);
  assert.ok(new Set(tufts.map(tuft => `${tuft.x.toFixed(2)},${tuft.y.toFixed(2)}`)).size === tufts.length);
});

test('fine carpet marks are deterministic and spatially varied', () => {
  assert.deepEqual(carpetMarkAt(-22, 14), carpetMarkAt(-22, 14));
  const marks = [];
  for (let y = -40; y < 40; y += 1) {
    for (let x = -40; x < 40; x += 1) {
      const mark = carpetMarkAt(x, y);
      if (mark) marks.push(mark);
    }
  }
  assert.ok(marks.length > 100);
  assert.ok(new Set(marks.map(mark => mark.variant)).size > 1);
});
