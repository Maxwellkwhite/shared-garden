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
    rows = preset.get("rows")
    legend = preset.get("legend")
    origin = preset.get("origin")
    if not isinstance(rows, list) or len(rows) != 10 or not isinstance(legend, dict):
        raise ValueError("Preset must define a 10×10 row map and a legend")
    if not isinstance(origin, dict) or type(origin.get("x")) is not int or type(origin.get("y")) is not int:
        raise ValueError("Preset origin must have integer X and Y coordinates")

    known_plants = set(server.PLANT_KINDS)
    for row in rows:
        if not isinstance(row, str) or len(row) != 10:
            raise ValueError("Every preset row must contain exactly 10 cells")
        for symbol in row:
            if symbol == ".":
                continue
            plant_id = legend.get(symbol)
            normalized = plant_id.replace("-", "_") if isinstance(plant_id, str) else ""
            if normalized not in known_plants:
                raise ValueError(f"Preset symbol {symbol!r} does not map to a catalog plant")
            if f"{normalized}_mature" not in server.PLANT_SIZES:
                raise ValueError(f"No mature growth stage exists for {plant_id}")

    return preset


def preset_plantings(preset: dict) -> list[dict]:
    x0, y0 = preset["origin"]["x"], preset["origin"]["y"]
    plantings = []
    for dy, row in enumerate(preset["rows"]):
        for dx, symbol in enumerate(row):
            if symbol == ".":
                continue
            x, y = x0 + dx, y0 + dy
            if not (0 <= x < server.WORLD_SIZE and 0 <= y < server.WORLD_SIZE):
                raise ValueError(f"Preset cell ({x}, {y}) falls outside the world")
            plant_id = preset["legend"][symbol].replace("-", "_")
            species = f"{plant_id}_mature"
            plantings.append({"x": x, "y": y, "species": species,
                              "size": server.PLANT_SIZES[species]})
    return plantings


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
        if dry_run:
            return {"preset": preset_id, "target_count": len(plantings),
                    "would_add": len(additions), "would_skip": skipped,
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

        result = {"preset": preset_id, "target_count": len(plantings),
                  "added": len(additions), "skipped": skipped,
                  "already_initialized": False}
        if additions:
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
