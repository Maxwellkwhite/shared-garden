"""Explicit, idempotent seeding for named Little Gardens presets."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import server

ROOT = Path(__file__).resolve().parent
PRESET_DIR = ROOT / "presets"


def load_preset(preset_id: str) -> dict:
    path = PRESET_DIR / f"{preset_id}.json"
    if not path.is_file():
        raise ValueError(f"Unknown garden preset: {preset_id}")
    preset = json.loads(path.read_text())
    if preset.get("id") != preset_id or preset.get("world_size") != server.WORLD_SIZE:
        raise ValueError("Preset ID or world size does not match this garden")
    origin = preset.get("origin")
    if not isinstance(origin, dict) or type(origin.get("x")) is not int or type(origin.get("y")) is not int:
        raise ValueError("Preset origin must have integer X and Y coordinates")
    extent = preset.get("extent", 10)
    if type(extent) is not int or extent < 1 or extent > server.WORLD_SIZE:
        raise ValueError("Preset extent must be a valid world dimension")
    if (origin["x"] < 0 or origin["y"] < 0 or
            origin["x"] + extent > server.WORLD_SIZE or
            origin["y"] + extent > server.WORLD_SIZE):
        raise ValueError("Preset extent falls outside the garden")
    known_plants = set(server.PLANT_KINDS)
    for rows_key, legend_key in (("rows", "legend"), ("path_rows", "path_legend"),
                                 ("ground_rows", "ground_legend")):
        rows, legend = preset.get(rows_key), preset.get(legend_key)
        if rows is None:
            if legend is not None:
                raise ValueError(f"{legend_key} requires {rows_key}")
            continue
        if not isinstance(rows, list) or len(rows) != extent or not isinstance(legend, dict):
            raise ValueError(f"{rows_key} must be a {extent}×{extent} row map with a legend")
        for row in rows:
            if not isinstance(row, str) or len(row) != extent:
                raise ValueError(f"Every {rows_key} row must contain exactly {extent} cells")
            for symbol in row:
                if symbol == ".":
                    continue
                item = legend.get(symbol)
                if rows_key == "rows":
                    normalized = item.replace("-", "_") if isinstance(item, str) else ""
                    if normalized not in known_plants:
                        raise ValueError(f"Preset symbol {symbol!r} does not map to a catalog plant")
                    if f"{normalized}_mature" not in server.PLANT_SIZES:
                        raise ValueError(f"No mature growth stage exists for {item}")
                elif rows_key == "path_rows":
                    normalized = item.replace("-", "_") if isinstance(item, str) else ""
                    definition = server.GARDEN_OBJECTS.get(normalized, {})
                    if definition.get("connect") != "path" or normalized in server.COMING_SOON_OBJECTS:
                        raise ValueError(f"Preset symbol {symbol!r} must map to an available path")
                elif item not in server.GROUND_MATERIALS:
                    raise ValueError(f"Preset symbol {symbol!r} does not map to a ground material")

    return preset


def preset_plantings(preset: dict) -> list[dict]:
    x0, y0 = preset["origin"]["x"], preset["origin"]["y"]
    extent = preset.get("extent", 10)
    plantings = []
    for dy, row in enumerate(preset.get("rows", [])):
        for dx, symbol in enumerate(row):
            if symbol == ".":
                continue
            x, y = x0 + dx, y0 + dy
            if not (0 <= x < server.WORLD_SIZE and 0 <= y < server.WORLD_SIZE and
                    dx < extent and dy < extent):
                raise ValueError(f"Preset cell ({x}, {y}) falls outside the world")
            plant_id = preset["legend"][symbol].replace("-", "_")
            species = f"{plant_id}_mature"
            plantings.append({"x": x, "y": y, "species": species,
                              "size": server.PLANT_SIZES[species]})
    return plantings


def preset_paths(preset: dict) -> list[dict]:
    x0, y0 = preset["origin"]["x"], preset["origin"]["y"]
    paths = []
    for dy, row in enumerate(preset.get("path_rows", [])):
        for dx, symbol in enumerate(row):
            if symbol == ".":
                continue
            species = preset["path_legend"][symbol].replace("-", "_")
            paths.append({"x": x0 + dx, "y": y0 + dy, "species": species})
    return paths


def preset_ground_tiles(preset: dict) -> list[dict]:
    x0, y0 = preset["origin"]["x"], preset["origin"]["y"]
    tiles = []
    for dy, row in enumerate(preset.get("ground_rows", [])):
        for dx, symbol in enumerate(row):
            if symbol == ".":
                continue
            tiles.append({"x": x0 + dx, "y": y0 + dy,
                          "material": preset["ground_legend"][symbol]})
    return tiles


def occupied_cells(db) -> set[tuple[int, int]]:
    occupied = {(row[0], row[1]) for row in db.execute("SELECT x,y FROM plants")}
    occupied.update((row[0], row[1]) for row in db.execute("SELECT x,y FROM garden_object_cells"))
    occupied.update((row[0], row[1]) for row in db.execute("SELECT x,y FROM ground_tiles"))

    # Include object footprints in case an older object record lacks its cell index.
    for row in db.execute("SELECT species,x,y,rotation FROM garden_objects"):
        definition = server.GARDEN_OBJECTS.get(row["species"], {})
        width, height = definition.get("footprint", [1, 1])
        if row["rotation"] % 2:
            width, height = height, width
        occupied.update((row["x"] + dx, row["y"] + dy)
                        for dx in range(width) for dy in range(height))
    return occupied


def seed_preset(preset_id: str, *, dry_run: bool = False) -> dict:
    preset = load_preset(preset_id)
    plantings = preset_plantings(preset)
    paths = preset_paths(preset)
    ground_tiles = preset_ground_tiles(preset)
    marker = f"preset:{preset_id}:v{preset['version']}"

    with server.db_session() as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='plants'").fetchone():
            raise RuntimeError("Garden database is not initialized; start the app before seeding")
        db.execute("BEGIN IMMEDIATE")
        initialized = db.execute("SELECT value FROM world_meta WHERE key=?", (marker,)).fetchone()
        if initialized:
            result = json.loads(initialized[0])
            result["already_initialized"] = True
            return result

        size = db.execute("SELECT value FROM world_meta WHERE key='size'").fetchone()
        if not size or int(size[0]) != server.WORLD_SIZE:
            raise RuntimeError("The active garden is not the expected 50×50 world")

        occupied = occupied_cells(db)
        additions = [plant for plant in plantings if (plant["x"], plant["y"]) not in occupied]
        skipped = [{"x": plant["x"], "y": plant["y"]}
                   for plant in plantings if (plant["x"], plant["y"]) in occupied]
        object_cells = {(row[0], row[1]) for row in db.execute(
            "SELECT x,y FROM garden_object_cells")}
        plant_cells = {(row[0], row[1]) for row in db.execute("SELECT x,y FROM plants")}
        existing_ground = {(row[0], row[1]) for row in db.execute("SELECT x,y FROM ground_tiles")}
        path_additions = [path for path in paths if (path["x"], path["y"]) not in object_cells
                          and (path["x"], path["y"]) not in plant_cells]
        path_skipped = [{"x": path["x"], "y": path["y"]} for path in paths
                        if (path["x"], path["y"]) in object_cells or
                        (path["x"], path["y"]) in plant_cells]
        ground_additions = [tile for tile in ground_tiles
                            if (tile["x"], tile["y"]) not in existing_ground]
        ground_skipped = [{"x": tile["x"], "y": tile["y"]} for tile in ground_tiles
                          if (tile["x"], tile["y"]) in existing_ground]
        if dry_run:
            return {"preset": preset_id,
                    "target_count": {"plants": len(plantings), "paths": len(paths),
                                     "ground_tiles": len(ground_tiles)},
                    "would_add": len(additions), "would_skip": skipped,
                    "would_add_paths": len(path_additions), "would_skip_paths": path_skipped,
                    "would_add_ground_tiles": len(ground_additions),
                    "would_skip_ground_tiles": ground_skipped,
                    "already_initialized": False, "dry_run": True}

        now = time.time()
        for plant in additions:
            plant_id = f"preset-{preset_id}-{plant['x']}-{plant['y']}"
            db.execute(
                "INSERT INTO plants "
                "(id,species,x,y,size,created_by,created_by_id,created_at,locked_until,next_growth_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,NULL)",
                (plant_id, plant["species"], plant["x"], plant["y"], plant["size"],
                 "Little Gardens", None, now, 0),
            )

        for path in path_additions:
            item_id = f"preset-{preset_id}-path-{path['x']}-{path['y']}"
            db.execute("INSERT INTO garden_objects "
                       "(id,species,x,y,rotation,created_by,created_by_id,created_at,locked_until) "
                       "VALUES (?,?,?,?,0,?,?,?,0)",
                       (item_id, path["species"], path["x"], path["y"],
                        "Little Gardens", None, now))
            db.execute("INSERT INTO garden_object_cells (x,y,object_id) VALUES (?,?,?)",
                       (path["x"], path["y"], item_id))

        for tile in ground_additions:
            db.execute("INSERT INTO ground_tiles "
                       "(x,y,material,created_by,created_by_id,created_at,locked_until) "
                       "VALUES (?,?,?,?,?,?,0)",
                       (tile["x"], tile["y"], tile["material"], "Little Gardens", None, now))

        result = {"preset": preset_id,
                  "target_count": {"plants": len(plantings), "paths": len(paths),
                                   "ground_tiles": len(ground_tiles)},
                  "added": len(additions), "skipped": skipped,
                  "added_paths": len(path_additions), "skipped_paths": path_skipped,
                  "added_ground_tiles": len(ground_additions),
                  "skipped_ground_tiles": ground_skipped,
                  "already_initialized": False}
        if additions or path_additions or ground_additions:
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)",
                       (str(server.world_revision(db) + 1),))
        db.execute("INSERT OR REPLACE INTO world_meta VALUES (?,?)",
                   (marker, json.dumps(result, separators=(",", ":"))))
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed an explicit, one-time Little Gardens preset")
    parser.add_argument("preset", help="Preset ID, for example central_botanical_garden")
    parser.add_argument("--dry-run", action="store_true", help="Report additions and occupied cells without writing")
    args = parser.parse_args()

    if not server.DB_PATH.exists():
        if args.dry_run:
            parser.error("No garden database exists yet; start the app before running a dry run")
        server.initialize(include_default_center_pine=False)

    result = seed_preset(args.preset, dry_run=args.dry_run)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
