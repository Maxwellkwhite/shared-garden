# The Common Garden

A browser-based, top-down pixel garden prototype built with Three.js. The world is a hard-bounded 50×50 square, shown as procedural grass and the approved mature pine. A lower-left add menu lets visitors select one of the three pine growth stages; selection is visual only and does not plant anything. The adjacent grid button toggles the underlying 50×50 cell grid.

## Run locally

```sh
python3 server.py
```

Open [http://localhost:4173](http://localhost:4173). Three.js is loaded from jsDelivr; the grass terrain itself is generated locally and does not need an image service or network request.


## Terrain system

- [terrain-core.mjs](./terrain-core.mjs) contains the fixed seed, configurable grass palette, coherent color and density fields, and deterministic tuft and carpet-mark placement.
- [terrain.mjs](./terrain.mjs) renders bounded world-coordinate chunks with a quiet color field, clustered pixel marks, and occasional larger grass tufts. Edge chunks are clipped exactly to the world bounds; the renderer loads visible chunks plus a buffer only within those bounds, and caches generated textures.
- [garden.js](./garden.js) keeps terrain and planted objects on separate scene layers and updates visible terrain as the camera pans or zooms.

The defaults are a 16 world-unit chunk, 16 pixel samples per unit, 1.2-unit tuft spacing, 0.42-unit carpet-mark spacing, one buffered chunk, a 64-texture LRU cache, and seed `0x4c697474`. Change `TERRAIN_DEFAULTS` in `terrain-core.mjs` and the `GrassTerrainLayer` options in `garden.js` to tune the meadow.

The world bounds and the grid overlay are configured in [garden.js](./garden.js). Run the deterministic, chunk-edge, and world-boundary checks with:

```sh
node --test terrain-core.test.mjs
```

The server stores anonymous visitor presence and shared plant placement in `garden.sqlite3`.
