"""Local visitor-presence server for the Common Garden prototype."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from collections import deque
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("GARDEN_DB", ROOT / "garden.sqlite3"))
WORLD_SIZE = 50
ITEM_LOCK_SECONDS = 60 * 60
HOURLY_CHANGE_LIMIT = 15
CHANGE_BUCKET_SECONDS = 60 * 60
REQUEST_RATE_WINDOW_SECONDS = 60
VISITOR_POSTS_PER_MINUTE = 30
IP_POSTS_PER_MINUTE = 120
_post_rate_buckets: dict[tuple[str, str], deque] = {}
_post_rate_lock = threading.Lock()
_post_rate_last_sweep = 0.0
GROWTH_STAGES = ("seedling", "young", "growing", "mature")
HOUR = 60 * 60
DAY = 24 * HOUR
# Each tuple is the time from seedling→young, young→growing, and growing→mature.
# These are intentionally accelerated, with species-specific variation at every stage.
GROWTH_PROFILES = {
    "sunflower": (12 * HOUR, 18 * HOUR, 24 * HOUR),
    "tulip": (18 * HOUR, 36 * HOUR, 48 * HOUR),
    "rose": (2 * DAY, 4 * DAY, 6 * DAY),
    "daisy": (12 * HOUR, 18 * HOUR, 24 * HOUR),
    "lavender": (36 * HOUR, 3 * DAY, 5 * DAY),
    "hydrangea": (3 * DAY, 5 * DAY, 7 * DAY),
    "marigold": (12 * HOUR, 18 * HOUR, 24 * HOUR),
    "bluebell": (18 * HOUR, 36 * HOUR, 48 * HOUR),
    "peony": (4 * DAY, 7 * DAY, 10 * DAY),
    "poppy": (12 * HOUR, 18 * HOUR, 24 * HOUR),
    "oak_tree": (10 * DAY, 15 * DAY, 20 * DAY),
    "pine_tree": (5 * DAY, 10 * DAY, 15 * DAY),
    "cherry_blossom_tree": (3 * DAY, 5 * DAY, 7 * DAY),
    "weeping_willow": (5 * DAY, 10 * DAY, 15 * DAY),
    "apple_tree": (7 * DAY, 10 * DAY, 15 * DAY),
    "maple_tree": (10 * DAY, 15 * DAY, 20 * DAY),
    "birch_tree": (2 * DAY, 4 * DAY, 7 * DAY),
    "azalea": (2 * DAY, 4 * DAY, 6 * DAY),
    "boxwood": (5 * DAY, 10 * DAY, 15 * DAY),
    "holly_bush": (5 * DAY, 10 * DAY, 15 * DAY),
    "blueberry_bush": (2 * DAY, 4 * DAY, 7 * DAY),
    "rhododendron": (7 * DAY, 10 * DAY, 15 * DAY),
    "boston_fern": (24 * HOUR, 2 * DAY, 3 * DAY),
    "clover": (4 * HOUR, 8 * HOUR, 16 * HOUR),
    "english_ivy": (18 * HOUR, 36 * HOUR, 3 * DAY),
    "cactus": (10 * DAY, 15 * DAY, 30 * DAY),
    "palm_tree": (10 * DAY, 15 * DAY, 20 * DAY),
    "monstera": (18 * HOUR, 36 * HOUR, 3 * DAY),
    "fly_agaric_mushroom": (6 * HOUR, 12 * HOUR, 24 * HOUR),
    "chanterelle_mushroom": (4 * HOUR, 8 * HOUR, 16 * HOUR),
    "carrot": (8 * HOUR, 12 * HOUR, 18 * HOUR),
    "tomato": (18 * HOUR, 24 * HOUR, 36 * HOUR),
    "pumpkin": (24 * HOUR, 36 * HOUR, 48 * HOUR),
    "lettuce": (6 * HOUR, 12 * HOUR, 18 * HOUR),
    "corn": (18 * HOUR, 24 * HOUR, 36 * HOUR),
    "strawberry": (18 * HOUR, 24 * HOUR, 36 * HOUR),
    "watermelon": (24 * HOUR, 36 * HOUR, 48 * HOUR),
    "raspberry_bush": (2 * DAY, 4 * DAY, 6 * DAY),
    "pineapple": (3 * DAY, 5 * DAY, 7 * DAY),
}
GROWTH_DEFAULTS_BY_KIND = {
    "flower": (24 * HOUR, 24 * HOUR, 24 * HOUR),
    "tree": (7 * DAY, 10 * DAY, 15 * DAY),
    "pine": (5 * DAY, 10 * DAY, 15 * DAY),
    "willow": (5 * DAY, 10 * DAY, 15 * DAY),
    "shrub": (5 * DAY, 7 * DAY, 10 * DAY),
    "fern": (24 * HOUR, 2 * DAY, 3 * DAY),
    "groundcover": (12 * HOUR, 24 * HOUR, 2 * DAY),
    "vine": (18 * HOUR, 36 * HOUR, 3 * DAY),
    "cactus": (10 * DAY, 15 * DAY, 30 * DAY),
    "palm": (10 * DAY, 15 * DAY, 20 * DAY),
    "monstera": (18 * HOUR, 36 * HOUR, 3 * DAY),
    "mushroom": (6 * HOUR, 12 * HOUR, 24 * HOUR),
    "vegetable": (18 * HOUR, 24 * HOUR, 36 * HOUR),
    "fruit": (24 * HOUR, 36 * HOUR, 48 * HOUR),
}
GROUND_MATERIALS = {"dirt", "sand", "mulch", "pea_gravel", "river_rocks", "wood_chips", "pine_straw"}
PLANT_CATALOG = json.loads((ROOT / "plant-catalog.json").read_text())
PLANT_SIZES = {
    f"{plant['id'].replace('-', '_')}_{stage}": size
    for category in PLANT_CATALOG
    for plant in category["plants"]
    for stage, size in (("seedling", 1), ("young", 2), ("growing", 3), ("mature", 4))
}
PLACEABLE_PLANT_SIZES = {
    f"{plant['id'].replace('-', '_')}_seedling": 1
    for category in PLANT_CATALOG
    for plant in category["plants"]
}
PLANT_KINDS = {
    plant["id"].replace("-", "_"): plant.get("kind", "flower")
    for category in PLANT_CATALOG
    for plant in category["plants"]
}
GARDEN_OBJECTS = {
    item["id"].replace("-", "_"): item
    for category in PLANT_CATALOG
    for item in category.get("objects", [])
}
COMING_SOON_OBJECTS = {
    item["id"].replace("-", "_")
    for category in PLANT_CATALOG
    for item in category.get("objects", [])
    if item.get("comingSoon")
}
# Keep historical plant records placeable and renderable during the catalog update.
PLANT_SIZES.update({
    "pine_sapling": 1, "pine_growing": 2, "pine_mature": 3,
    "daisy_small": 1, "daisy_medium": 2, "daisy_mature": 3,
    "tulip_small": 1, "tulip_medium": 2, "tulip_mature": 3,
    "sunflower_small": 1, "sunflower_medium": 2, "sunflower_mature": 3,
})
PLACEABLE_PLANT_SIZES["pine_sapling"] = 1
LEGACY_PLANT_STAGES = {
    "pine_sapling": ("pine_tree", "seedling"),
    "pine_growing": ("pine_tree", "growing"),
    "pine_mature": ("pine_tree", "mature"),
    "daisy_small": ("daisy", "young"),
    "daisy_medium": ("daisy", "growing"),
    "daisy_mature": ("daisy", "mature"),
    "tulip_small": ("tulip", "young"),
    "tulip_medium": ("tulip", "growing"),
    "tulip_mature": ("tulip", "mature"),
    "sunflower_small": ("sunflower", "young"),
    "sunflower_medium": ("sunflower", "growing"),
    "sunflower_mature": ("sunflower", "mature"),
}


def plant_stage(species: str) -> tuple[str, str] | None:
    """Return a normalized plant id and stage for catalog and legacy species."""
    if species in LEGACY_PLANT_STAGES:
        return LEGACY_PLANT_STAGES[species]
    plant_id, separator, stage = species.rpartition("_")
    if separator and stage in GROWTH_STAGES and plant_id in PLANT_KINDS:
        return plant_id, stage
    return None


def growth_delay(species: str) -> int | None:
    parsed = plant_stage(species)
    if not parsed:
        return None
    plant_id, stage = parsed
    if stage == "mature":
        return None
    kind = PLANT_KINDS.get(plant_id)
    profile = GROWTH_PROFILES.get(plant_id, GROWTH_DEFAULTS_BY_KIND.get(kind))
    return profile[GROWTH_STAGES.index(stage)] if profile else None


def advance_plant_growth(db: sqlite3.Connection, now: float | None = None) -> bool:
    """Advance overdue plants deterministically; return whether the world changed."""
    now = time.time() if now is None else now
    changed = False
    due_plants = db.execute(
        "SELECT id,species,next_growth_at FROM plants "
        "WHERE next_growth_at IS NOT NULL AND next_growth_at<=? ORDER BY next_growth_at,id", (now,)
    ).fetchall()
    for plant in due_plants:
        current = plant_stage(plant["species"])
        if not current:
            db.execute("UPDATE plants SET next_growth_at=NULL WHERE id=?", (plant["id"],))
            changed = True
            continue
        plant_id, stage = current
        due_at = plant["next_growth_at"]
        while stage != "mature" and due_at <= now:
            next_index = GROWTH_STAGES.index(stage) + 1
            stage = GROWTH_STAGES[next_index]
            species = f"{plant_id}_{stage}"
            interval = growth_delay(species)
            due_at = due_at + interval if interval is not None else None
        species = f"{plant_id}_{stage}"
        db.execute("UPDATE plants SET species=?,size=?,next_growth_at=? WHERE id=?",
                   (species, PLANT_SIZES[species], due_at, plant["id"]))
        changed = True
    if changed:
        db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)",
                   (str(world_revision(db) + 1),))
    return changed


def change_allowance(db: sqlite3.Connection, visitor_id: str, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    hour_start = int(now // CHANGE_BUCKET_SECONDS) * CHANGE_BUCKET_SECONDS
    settings_table = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='visitor_settings'"
    ).fetchone()
    setting = db.execute(
        "SELECT unlimited_changes FROM visitor_settings WHERE visitor_id=?", (visitor_id,)
    ).fetchone() if visitor_id and settings_table else None
    unlimited = bool(setting and setting[0])
    row = db.execute(
        "SELECT changes_used FROM hourly_change_usage WHERE visitor_id=? AND hour_start=?",
        (visitor_id or "anonymous", hour_start),
    ).fetchone()
    used = row[0] if row else 0
    return {
        "limit": HOURLY_CHANGE_LIMIT,
        "used": used,
        "remaining": max(0, HOURLY_CHANGE_LIMIT - used),
        "resets_at": hour_start + CHANGE_BUCKET_SECONDS,
        "unlimited": unlimited,
    }


def consume_changes(db: sqlite3.Connection, visitor_id: str, amount: int = 1) -> tuple[bool, dict]:
    """Consume an allowance inside the caller's write transaction."""
    now = time.time()
    allowance = change_allowance(db, visitor_id, now)
    if allowance.get("unlimited"):
        return True, allowance
    if amount < 1 or amount > allowance["remaining"]:
        return False, allowance
    hour_start = int(now // CHANGE_BUCKET_SECONDS) * CHANGE_BUCKET_SECONDS
    db.execute(
        "INSERT INTO hourly_change_usage (visitor_id,hour_start,changes_used) VALUES (?,?,?) "
        "ON CONFLICT(visitor_id,hour_start) DO UPDATE SET changes_used=changes_used+excluded.changes_used",
        (visitor_id or "anonymous", hour_start, amount),
    )
    return True, change_allowance(db, visitor_id, now)


def check_post_rate_limit(ip_address: str, visitor_id: str, now: float | None = None) -> tuple[bool, int]:
    """Apply a modest in-memory sliding-window cap to write requests."""
    global _post_rate_last_sweep
    now = time.monotonic() if now is None else now
    window = REQUEST_RATE_WINDOW_SECONDS
    keys = [("ip", ip_address, IP_POSTS_PER_MINUTE)]
    if visitor_id:
        keys.append(("visitor", visitor_id, VISITOR_POSTS_PER_MINUTE))

    with _post_rate_lock:
        if now - _post_rate_last_sweep >= window:
            for stale_key, events in list(_post_rate_buckets.items()):
                while events and now - events[0] >= window:
                    events.popleft()
                if not events:
                    del _post_rate_buckets[stale_key]
            _post_rate_last_sweep = now

        active = []
        for kind, identity, limit in keys:
            key = (kind, identity)
            events = _post_rate_buckets.setdefault(key, deque())
            while events and now - events[0] >= window:
                events.popleft()
            active.append((events, limit))

        retry_after = 0
        for events, limit in active:
            if len(events) >= limit:
                retry_after = max(retry_after, int(max(1, window - (now - events[0]) + 0.999)))
        if retry_after:
            return False, retry_after

        for events, _limit in active:
            events.append(now)
        return True, 0


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


@contextmanager
def db_session():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize(include_default_center_pine: bool = True) -> None:
    with db_session() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS visitors (
              visitor_id TEXT PRIMARY KEY, last_seen REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS plants (
              id TEXT PRIMARY KEY, species TEXT NOT NULL,
              x INTEGER NOT NULL, y INTEGER NOT NULL, size INTEGER NOT NULL,
              created_by TEXT, created_by_id TEXT, created_at REAL, next_growth_at REAL
            );
            CREATE TABLE IF NOT EXISTS garden_objects (
              id TEXT PRIMARY KEY, species TEXT NOT NULL,
              x INTEGER NOT NULL, y INTEGER NOT NULL,
              rotation INTEGER NOT NULL DEFAULT 0,
              created_by TEXT, created_by_id TEXT, created_at REAL
            );
            CREATE TABLE IF NOT EXISTS garden_object_cells (
              x INTEGER NOT NULL, y INTEGER NOT NULL, object_id TEXT NOT NULL,
              PRIMARY KEY (x,y)
            );
            CREATE TABLE IF NOT EXISTS ground_tiles (
              x INTEGER NOT NULL, y INTEGER NOT NULL, material TEXT NOT NULL,
              created_by TEXT, created_by_id TEXT, created_at REAL,
              PRIMARY KEY (x,y)
            );
            CREATE TABLE IF NOT EXISTS world_meta (
              key TEXT PRIMARY KEY, value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS hourly_change_usage (
              visitor_id TEXT NOT NULL, hour_start INTEGER NOT NULL,
              changes_used INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (visitor_id,hour_start)
            );
            CREATE TABLE IF NOT EXISTS visitor_settings (
              visitor_id TEXT PRIMARY KEY, unlimited_changes INTEGER NOT NULL DEFAULT 0
            );
        """)
        for table in ("plants", "garden_objects", "ground_tiles"):
            columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
            if "created_by" not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN created_by TEXT")
            if "created_by_id" not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN created_by_id TEXT")
            if "created_at" not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN created_at REAL")
            if "locked_until" not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN locked_until REAL NOT NULL DEFAULT 0")
            if table == "plants" and "next_growth_at" not in columns:
                db.execute("ALTER TABLE plants ADD COLUMN next_growth_at REAL")
        migration_time = time.time()
        for row in db.execute("SELECT id,species FROM plants WHERE next_growth_at IS NULL").fetchall():
            delay = growth_delay(row["species"])
            if delay is not None:
                db.execute("UPDATE plants SET next_growth_at=? WHERE id=?",
                           (migration_time + delay, row["id"]))
        db.execute("CREATE INDEX IF NOT EXISTS plants_growth_due ON plants(next_growth_at)")
        profile_migration = db.execute(
            "SELECT value FROM world_meta WHERE key='species_growth_profiles_v1'"
        ).fetchone()
        if not profile_migration:
            changed_profiles = False
            for row in db.execute("SELECT id,species FROM plants").fetchall():
                delay = growth_delay(row["species"])
                if delay is not None:
                    db.execute("UPDATE plants SET next_growth_at=? WHERE id=?",
                               (migration_time + delay, row["id"]))
                    changed_profiles = True
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('species_growth_profiles_v1','1')")
            if changed_profiles:
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)",
                           (str(world_revision(db) + 1),))
        reset = db.execute("SELECT value FROM world_meta WHERE key='grass_patch_v1'").fetchone()
        if not reset:
            # Discard the previous prototype's populated garden during this one-time migration.
            # Clear legacy content while retaining the current schema for fresh databases.
            db.execute("DELETE FROM plants")
            db.execute("DROP TABLE IF EXISTS activity")
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('size',?)", (str(WORLD_SIZE),))
            old_revision = db.execute("SELECT value FROM world_meta WHERE key='revision'").fetchone()
            revision = int(old_revision[0]) + 1 if old_revision else 1
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
            db.execute("INSERT INTO world_meta VALUES ('grass_patch_v1','1')")

        central_preset = db.execute(
            "SELECT 1 FROM world_meta WHERE key='preset:central_botanical_garden:v1'"
        ).fetchone()
        if include_default_center_pine and not central_preset:
            planted = db.execute(
                "INSERT OR IGNORE INTO plants (id,species,x,y,size) VALUES (?,?,?,?,?)",
                ("pine-mature-center", "pine_mature", 25, 25, 3),
            )
            if planted.rowcount:
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)",
                           (str(world_revision(db) + 1),))
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS plants_one_per_cell ON plants(x,y)")
        fence_migration = db.execute("SELECT value FROM world_meta WHERE key='fence_segments_v1'").fetchone()
        if not fence_migration:
            legacy_fences = db.execute(
                "SELECT id,species,x,y,rotation FROM garden_objects WHERE species='wooden_fence'"
            ).fetchall()
            changed = False
            for fence in legacy_fences:
                cells = db.execute(
                    "SELECT x,y FROM garden_object_cells WHERE object_id=? ORDER BY y,x", (fence['id'],)
                ).fetchall()
                if not cells:
                    width, height = (1, 2) if fence['rotation'] % 2 else (2, 1)
                    cells = [{"x": fence['x'] + dx, "y": fence['y'] + dy}
                             for dy in range(height) for dx in range(width)]
                db.execute("DELETE FROM garden_object_cells WHERE object_id=?", (fence['id'],))
                db.execute("DELETE FROM garden_objects WHERE id=?", (fence['id'],))
                for cell in cells:
                    segment_id = str(uuid.uuid4())
                    db.execute("INSERT INTO garden_objects (id,species,x,y,rotation) VALUES (?,?,?, ?,0)",
                               (segment_id, 'wooden_fence', cell['x'], cell['y']))
                    db.execute("INSERT INTO garden_object_cells (x,y,object_id) VALUES (?,?,?)",
                               (cell['x'], cell['y'], segment_id))
                changed = True
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('fence_segments_v1','1')")
            if changed:
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)",
                           (str(world_revision(db) + 1),))
        wall_migration = db.execute("SELECT value FROM world_meta WHERE key='wall_segments_v1'").fetchone()
        if not wall_migration:
            legacy_walls = db.execute(
                "SELECT id,species,x,y,rotation FROM garden_objects WHERE species='stone_wall'"
            ).fetchall()
            changed = False
            for wall in legacy_walls:
                cells = db.execute(
                    "SELECT x,y FROM garden_object_cells WHERE object_id=? ORDER BY y,x", (wall['id'],)
                ).fetchall()
                if not cells:
                    width, height = (1, 2) if wall['rotation'] % 2 else (2, 1)
                    cells = [{"x": wall['x'] + dx, "y": wall['y'] + dy}
                             for dy in range(height) for dx in range(width)]
                db.execute("DELETE FROM garden_object_cells WHERE object_id=?", (wall['id'],))
                db.execute("DELETE FROM garden_objects WHERE id=?", (wall['id'],))
                for cell in cells:
                    segment_id = str(uuid.uuid4())
                    db.execute("INSERT INTO garden_objects (id,species,x,y,rotation) VALUES (?,?,?, ?,0)",
                               (segment_id, 'stone_wall', cell['x'], cell['y']))
                    db.execute("INSERT INTO garden_object_cells (x,y,object_id) VALUES (?,?,?)",
                               (cell['x'], cell['y'], segment_id))
                changed = True
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('wall_segments_v1','1')")
            if changed:
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)",
                           (str(world_revision(db) + 1),))


def world_revision(db: sqlite3.Connection) -> int:
    row = db.execute("SELECT value FROM world_meta WHERE key='revision'").fetchone()
    return int(row[0]) if row else 1


def public_item(row, visitor_id: str) -> dict:
    item = dict(row)
    creator_id = item.pop("created_by_id", None)
    item["can_change_while_locked"] = bool(
        visitor_id and creator_id == visitor_id and item.get("locked_until", 0) > time.time()
    )
    return item


def world_state(db: sqlite3.Connection, unchanged: bool = False, visitor_id: str = "") -> dict:
    visitors = db.execute("SELECT COUNT(*) FROM visitors WHERE last_seen > ?", (time.time() - 300,)).fetchone()[0]
    state = {"size": WORLD_SIZE, "revision": world_revision(db), "visitors": visitors,
             "change_allowance": change_allowance(db, visitor_id)}
    if not unchanged:
        state["plants"] = [public_item(row, visitor_id) for row in db.execute(
            "SELECT id,species,x,y,size,created_by,created_by_id,created_at,locked_until,next_growth_at FROM plants ORDER BY id"
        ).fetchall()]
        state["objects"] = [public_item(row, visitor_id) for row in db.execute(
            "SELECT id,species,x,y,rotation,created_by,created_by_id,created_at,locked_until FROM garden_objects ORDER BY id"
        ).fetchall()]
        state["ground_tiles"] = [public_item(row, visitor_id) for row in db.execute(
            "SELECT x,y,material,created_by,created_by_id,created_at,locked_until FROM ground_tiles ORDER BY y,x"
        ).fetchall()]
    if unchanged:
        state["unchanged"] = True
    return state


class Handler(SimpleHTTPRequestHandler):
    server_version = "CommonGarden/0.2"

    def log_message(self, fmt: str, *args) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_json(self, value: dict, status: int = 200, headers: dict | None = None) -> None:
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, header_value in (headers or {}).items():
            self.send_header(name, str(header_value))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
            since = parse_qs(parsed.query).get("since", [None])[0]
            with db_session() as db:
                if visitor_id:
                    db.execute("INSERT INTO visitors VALUES (?,?) ON CONFLICT(visitor_id) DO UPDATE SET last_seen=excluded.last_seen",
                               (visitor_id, time.time()))
                advance_plant_growth(db)
                revision = world_revision(db)
                unchanged = since is not None and since.isdigit() and int(since) == revision
                self.send_json(world_state(db, unchanged, visitor_id))
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
        allowed, retry_after = check_post_rate_limit(
            self.client_address[0] or "unknown", visitor_id
        )
        if not allowed:
            self.send_json(
                {"error": "rate_limited", "retry_after_seconds": retry_after},
                429,
                {"Retry-After": retry_after},
            )
            return
        if parsed.path == "/api/path-stroke":
            self.do_path_stroke()
            return
        if parsed.path == "/api/visitor-settings":
            if not visitor_id:
                self.send_json({"error": "visitor_id_required"}, 400)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > 1024:
                    raise ValueError("invalid body length")
                payload = json.loads(self.rfile.read(length))
                unlimited = payload.get("unlimited_changes")
                if type(unlimited) is not bool:
                    raise ValueError("unlimited_changes must be a boolean")
            except (ValueError, json.JSONDecodeError, AttributeError, TypeError):
                self.send_json({"error": "invalid_visitor_setting"}, 400)
                return
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                db.execute(
                    "INSERT INTO visitor_settings (visitor_id,unlimited_changes) VALUES (?,?) "
                    "ON CONFLICT(visitor_id) DO UPDATE SET unlimited_changes=excluded.unlimited_changes",
                    (visitor_id, int(unlimited)),
                )
                allowance = change_allowance(db, visitor_id)
            self.send_json({"change_allowance": allowance})
            return
        if parsed.path == "/api/ground-stroke":
            self.do_ground_stroke()
            return
        if parsed.path == "/api/item-action":
            self.do_item_action()
            return
        if parsed.path == "/api/reset":
            visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                db.execute("DELETE FROM plants")
                db.execute("DELETE FROM garden_object_cells")
                db.execute("DELETE FROM garden_objects")
                db.execute("DELETE FROM ground_tiles")
                db.execute("DELETE FROM hourly_change_usage")
                revision = world_revision(db) + 1
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
                allowance = change_allowance(db, visitor_id)
            self.send_json({"revision": revision, "plants": [], "objects": [], "ground_tiles": [],
                            "change_allowance": allowance})
            return
        is_object = parsed.path == "/api/objects"
        visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
        if parsed.path not in ("/api/plants", "/api/objects"):
            self.send_json({"error": "not_found"}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 2048:
                raise ValueError("invalid body length")
            payload = json.loads(self.rfile.read(length))
            species = payload.get("species")
            x = payload.get("x")
            y = payload.get("y")
            created_by = str(payload.get("created_by") or "Garden visitor").strip()[:32] or "Garden visitor"
            created_at = time.time()
            locked_until = created_at + ITEM_LOCK_SECONDS
            allowed = GARDEN_OBJECTS if is_object else PLACEABLE_PLANT_SIZES
            if species not in allowed or type(x) is not int or type(y) is not int:
                raise ValueError("invalid plant placement")
            if is_object and species in COMING_SOON_OBJECTS:
                self.send_json({"error": "coming_soon"}, 403)
                return
            if is_object and GARDEN_OBJECTS[species].get("groundMaterial"):
                self.send_json({"error": "use_ground_tiles_endpoint"}, 400)
                return
            if not (0 <= x < WORLD_SIZE and 0 <= y < WORLD_SIZE):
                raise ValueError("placement outside the garden")
            rotation = payload.get("rotation", 0)
            if is_object and (type(rotation) is not int or not 0 <= rotation <= 3):
                raise ValueError("invalid object rotation")
            if not is_object:
                rotation = 0
        except (ValueError, json.JSONDecodeError, AttributeError):
            self.send_json({"error": "invalid_placement"}, 400)
            return

        if is_object:
            definition = GARDEN_OBJECTS[species]
            width, height = definition["footprint"]
            if rotation % 2:
                width, height = height, width
            if x + width > WORLD_SIZE or y + height > WORLD_SIZE:
                self.send_json({"error": "placement_outside_garden"}, 400)
                return
            object_item = {"id": str(uuid.uuid4()), "species": species, "x": x, "y": y,
                           "rotation": rotation, "created_by": created_by, "created_at": created_at,
                           "locked_until": locked_until, "can_change_while_locked": bool(visitor_id)}
            try:
                with db_session() as db:
                    db.execute("BEGIN IMMEDIATE")
                    for dx in range(width):
                        for dy in range(height):
                            if (db.execute("SELECT 1 FROM plants WHERE x=? AND y=?", (x+dx, y+dy)).fetchone() or
                                    db.execute("SELECT 1 FROM garden_object_cells WHERE x=? AND y=?", (x+dx, y+dy)).fetchone()):
                                raise sqlite3.IntegrityError("occupied_by_plant")
                    allowed_change, allowance = consume_changes(db, visitor_id)
                    if not allowed_change:
                        self.send_json({"error": "change_limit", "change_allowance": allowance}, 429)
                        return
                    for dx in range(width):
                        for dy in range(height):
                            db.execute("INSERT INTO garden_object_cells (x,y,object_id) VALUES (?,?,?)",
                                       (x+dx, y+dy, object_item["id"]))
                    db.execute("INSERT INTO garden_objects (id,species,x,y,rotation,created_by,created_by_id,created_at,locked_until) VALUES (?,?,?,?,?,?,?,?,?)",
                               (object_item["id"], species, x, y, rotation, created_by, visitor_id, created_at, locked_until))
                    revision = world_revision(db) + 1
                    db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
            except sqlite3.IntegrityError:
                self.send_json({"error": "cell_occupied"}, 409)
                return
            self.send_json({"object": object_item, "revision": revision,
                            "change_allowance": allowance}, 201)
            return

        next_growth_at = created_at + growth_delay(species)
        plant = {"id": str(uuid.uuid4()), "species": species, "x": x, "y": y,
                 "size": PLANT_SIZES[species], "created_by": created_by, "created_at": created_at,
                 "locked_until": locked_until, "next_growth_at": next_growth_at,
                 "can_change_while_locked": bool(visitor_id)}
        with db_session() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                if db.execute("SELECT 1 FROM garden_object_cells WHERE x=? AND y=?", (x, y)).fetchone():
                    raise sqlite3.IntegrityError("occupied_by_object")
                allowed_change, allowance = consume_changes(db, visitor_id)
                if not allowed_change:
                    self.send_json({"error": "change_limit", "change_allowance": allowance}, 429)
                    return
                db.execute("INSERT INTO plants (id,species,x,y,size,created_by,created_by_id,created_at,locked_until,next_growth_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                           (plant["id"], species, x, y, plant["size"], created_by, visitor_id, created_at, locked_until, next_growth_at))
            except sqlite3.IntegrityError:
                self.send_json({"error": "cell_occupied"}, 409)
                return
            revision = world_revision(db) + 1
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
        self.send_json({"plant": plant, "revision": revision,
                        "change_allowance": allowance}, 201)

    def do_item_action(self) -> None:
        visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                raise ValueError("invalid body length")
            payload = json.loads(self.rfile.read(length))
            action = payload.get("action")
            kind = payload.get("kind")
            if action not in ("move", "bulldoze", "rotate", "grow") or kind not in ("plant", "object", "ground"):
                raise ValueError("invalid item action")
            if action == "grow" and kind != "plant":
                raise ValueError("only plants can grow")
            if action == "rotate" and kind != "object":
                raise ValueError("this item cannot rotate")
            item_id = payload.get("id")
            source_x, source_y = payload.get("x"), payload.get("y")
            dest = payload.get("destination") or {}
            dest_x, dest_y = dest.get("x"), dest.get("y")
            requested_rotation = payload.get("rotation")
            if kind == "ground":
                if type(source_x) is not int or type(source_y) is not int:
                    raise ValueError("invalid ground item")
            elif not isinstance(item_id, str) or not item_id:
                raise ValueError("invalid item id")
            if action == "move" and (type(dest_x) is not int or type(dest_y) is not int or
                                      not (0 <= dest_x < WORLD_SIZE and 0 <= dest_y < WORLD_SIZE)):
                raise ValueError("invalid destination")
            if kind == "object" and action == "move" and requested_rotation is not None and (
                    type(requested_rotation) is not int or not 0 <= requested_rotation <= 3):
                raise ValueError("invalid rotation")
        except (ValueError, json.JSONDecodeError, AttributeError, TypeError):
            self.send_json({"error": "invalid_item_action"}, 400)
            return

        changed_item = None
        allowance = None

        def charge_one_change() -> bool:
            nonlocal allowance
            allowed, allowance = consume_changes(db, visitor_id)
            if not allowed:
                self.send_json({"error": "change_limit", "change_allowance": allowance}, 429)
                return False
            return True

        with db_session() as db:
            db.execute("BEGIN IMMEDIATE")
            if kind == "ground":
                row = db.execute("SELECT x,y,material,created_by,created_by_id,created_at,locked_until FROM ground_tiles WHERE x=? AND y=?",
                                 (source_x, source_y)).fetchone()
                if not row:
                    self.send_json({"error": "item_not_found"}, 404)
                    return
                if row["locked_until"] > time.time() and not (visitor_id and row["created_by_id"] == visitor_id):
                    self.send_json({"error": "item_locked", "locked_until": row["locked_until"]}, 423)
                    return
                if action == "bulldoze":
                    if not charge_one_change(): return
                    db.execute("DELETE FROM ground_tiles WHERE x=? AND y=?", (source_x, source_y))
                else:
                    occupied = db.execute("SELECT 1 FROM ground_tiles WHERE x=? AND y=?", (dest_x, dest_y)).fetchone()
                    if occupied and (dest_x, dest_y) != (source_x, source_y):
                        self.send_json({"error": "destination_occupied"}, 409)
                        return
                    if (dest_x, dest_y) == (source_x, source_y):
                        self.send_json({"action": action, "kind": kind, "item": public_item(row, visitor_id),
                                        "revision": world_revision(db),
                                        "change_allowance": change_allowance(db, visitor_id)})
                        return
                    if not charge_one_change(): return
                    locked_until = time.time() + ITEM_LOCK_SECONDS
                    db.execute("UPDATE ground_tiles SET x=?,y=?,locked_until=? WHERE x=? AND y=?",
                               (dest_x, dest_y, locked_until, source_x, source_y))
                    changed_item = {**dict(row), "x": dest_x, "y": dest_y, "locked_until": locked_until}
            elif kind == "plant":
                row = db.execute("SELECT id,species,x,y,size,created_by,created_by_id,created_at,locked_until,next_growth_at FROM plants WHERE id=?", (item_id,)).fetchone()
                if not row:
                    self.send_json({"error": "item_not_found"}, 404)
                    return
                if action != "grow" and row["locked_until"] > time.time() and not (visitor_id and row["created_by_id"] == visitor_id):
                    self.send_json({"error": "item_locked", "locked_until": row["locked_until"]}, 423)
                    return
                if action == "grow":
                    current = plant_stage(row["species"])
                    if not current or current[1] == "mature":
                        self.send_json({"error": "plant_fully_grown"}, 409)
                        return
                    plant_id, stage = current
                    next_stage = GROWTH_STAGES[GROWTH_STAGES.index(stage) + 1]
                    next_species = f"{plant_id}_{next_stage}"
                    if not charge_one_change(): return
                    next_growth_at = time.time() + growth_delay(next_species) if next_stage != "mature" else None
                    db.execute("UPDATE plants SET species=?,size=?,next_growth_at=? WHERE id=?",
                               (next_species, PLANT_SIZES[next_species], next_growth_at, item_id))
                    changed_item = {**dict(row), "species": next_species,
                                    "size": PLANT_SIZES[next_species], "next_growth_at": next_growth_at}
                elif action == "bulldoze":
                    if not charge_one_change(): return
                    db.execute("DELETE FROM plants WHERE id=?", (item_id,))
                else:
                    object_hit = db.execute("SELECT 1 FROM garden_object_cells WHERE x=? AND y=?", (dest_x, dest_y)).fetchone()
                    plant_hit = db.execute("SELECT 1 FROM plants WHERE x=? AND y=? AND id<>?", (dest_x, dest_y, item_id)).fetchone()
                    if object_hit or plant_hit:
                        self.send_json({"error": "destination_occupied"}, 409)
                        return
                    if (dest_x, dest_y) == (row["x"], row["y"]):
                        self.send_json({"action": action, "kind": kind, "item": public_item(row, visitor_id),
                                        "revision": world_revision(db),
                                        "change_allowance": change_allowance(db, visitor_id)})
                        return
                    if not charge_one_change(): return
                    next_x, next_y = dest_x, dest_y
                    locked_until = time.time() + ITEM_LOCK_SECONDS
                    db.execute("UPDATE plants SET x=?,y=?,locked_until=? WHERE id=?", (next_x, next_y, locked_until, item_id))
                    changed_item = {**dict(row), "x": next_x, "y": next_y, "locked_until": locked_until}
            else:
                row = db.execute("SELECT id,species,x,y,rotation,created_by,created_by_id,created_at,locked_until FROM garden_objects WHERE id=?",
                                 (item_id,)).fetchone()
                if not row:
                    self.send_json({"error": "item_not_found"}, 404)
                    return
                if row["locked_until"] > time.time() and not (visitor_id and row["created_by_id"] == visitor_id):
                    self.send_json({"error": "item_locked", "locked_until": row["locked_until"]}, 423)
                    return
                if action == "bulldoze":
                    if not charge_one_change(): return
                    db.execute("DELETE FROM garden_object_cells WHERE object_id=?", (item_id,))
                    db.execute("DELETE FROM garden_objects WHERE id=?", (item_id,))
                else:
                    definition = GARDEN_OBJECTS.get(row["species"], {})
                    if action == "rotate" and not (definition.get("rotatable") or definition.get("randomRotation")):
                        self.send_json({"error": "item_cannot_rotate"}, 400)
                        return
                    next_rotation = ((row["rotation"] + 1) % 4 if action == "rotate" else
                                     requested_rotation if action == "move" and requested_rotation is not None else
                                     row["rotation"])
                    next_x, next_y = (row["x"], row["y"]) if action == "rotate" else (dest_x, dest_y)
                    width, height = definition.get("footprint", [1, 1])
                    if next_rotation % 2:
                        width, height = height, width
                    if next_x + width > WORLD_SIZE or next_y + height > WORLD_SIZE:
                        self.send_json({"error": "placement_outside_garden"}, 400)
                        return
                    for dx in range(width):
                        for dy in range(height):
                            x, y = next_x + dx, next_y + dy
                            object_hit = db.execute("SELECT object_id FROM garden_object_cells WHERE x=? AND y=?", (x, y)).fetchone()
                            plant_hit = db.execute("SELECT 1 FROM plants WHERE x=? AND y=?", (x, y)).fetchone()
                            if plant_hit or (object_hit and object_hit["object_id"] != item_id):
                                self.send_json({"error": "destination_occupied"}, 409)
                                return
                    changed = (next_x, next_y, next_rotation) != (row["x"], row["y"], row["rotation"])
                    if changed and not charge_one_change(): return
                    if not changed:
                        changed_item = dict(row)
                        revision = world_revision(db)
                        self.send_json({"action": action, "kind": kind, "item": public_item(changed_item, visitor_id),
                                        "revision": revision, "change_allowance": change_allowance(db, visitor_id)})
                        return
                    db.execute("DELETE FROM garden_object_cells WHERE object_id=?", (item_id,))
                    for dx in range(width):
                        for dy in range(height):
                            db.execute("INSERT INTO garden_object_cells (x,y,object_id) VALUES (?,?,?)",
                                       (next_x + dx, next_y + dy, item_id))
                    locked_until = time.time() + ITEM_LOCK_SECONDS
                    db.execute("UPDATE garden_objects SET x=?,y=?,rotation=?,locked_until=? WHERE id=?",
                               (next_x, next_y, next_rotation, locked_until, item_id))
                    changed_item = {**dict(row), "x": next_x, "y": next_y, "rotation": next_rotation,
                                    "locked_until": locked_until}
            revision = world_revision(db) + 1
            db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
            allowance = allowance or change_allowance(db, visitor_id)
        self.send_json({"action": action, "kind": kind,
                        "item": public_item(changed_item, visitor_id) if changed_item else None,
                        "revision": revision, "change_allowance": allowance})

    def do_ground_stroke(self) -> None:
        visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 128_000:
                raise ValueError("invalid body length")
            payload = json.loads(self.rfile.read(length))
            cells = payload.get("cells")
            created_by = str(payload.get("created_by") or "Garden visitor").strip()[:32] or "Garden visitor"
            created_at = time.time()
            if not isinstance(cells, list) or len(cells) > WORLD_SIZE * WORLD_SIZE:
                raise ValueError("invalid ground stroke")
            changes = {}
            for cell in cells:
                x, y, material = cell.get("x"), cell.get("y"), cell.get("material")
                if type(x) is not int or type(y) is not int or not (0 <= x < WORLD_SIZE and 0 <= y < WORLD_SIZE):
                    raise ValueError("ground cell outside the garden")
                if material is not None and material not in GROUND_MATERIALS:
                    raise ValueError("invalid ground material")
                expected_material = cell.get("expected_material", "__unknown__")
                if expected_material != "__unknown__" and expected_material is not None and expected_material not in GROUND_MATERIALS:
                    raise ValueError("invalid expected ground material")
                changes[(x, y)] = (material, expected_material)
        except (ValueError, json.JSONDecodeError, AttributeError, TypeError):
            self.send_json({"error": "invalid_ground_stroke"}, 400)
            return

        updated, removed = [], []
        conflicts = []
        consumed = 0
        limit_reached = False
        with db_session() as db:
            db.execute("BEGIN IMMEDIATE")
            locked = []
            allowance = change_allowance(db, visitor_id)
            remaining = allowance["remaining"]
            for (x, y), (material, expected_material) in changes.items():
                row = db.execute("SELECT material,created_by_id,locked_until FROM ground_tiles WHERE x=? AND y=?", (x, y)).fetchone()
                current_material = row["material"] if row else None
                if expected_material != "__unknown__" and current_material != expected_material:
                    conflicts.append({"x": x, "y": y, "reason": "changed"})
                    continue
                is_creator = bool(row and visitor_id and row["created_by_id"] == visitor_id)
                if row and material != row["material"] and row["locked_until"] > time.time() and not is_creator:
                    locked.append({"x": x, "y": y, "locked_until": row["locked_until"]})
                    continue
                if material is None:
                    if row:
                        if remaining <= 0:
                            limit_reached = True
                            continue
                        db.execute("DELETE FROM ground_tiles WHERE x=? AND y=?", (x, y))
                        removed.append({"x": x, "y": y})
                        consumed += 1
                        remaining -= 1
                elif not row or row["material"] != material:
                    if remaining <= 0:
                        limit_reached = True
                        continue
                    locked_until = created_at + ITEM_LOCK_SECONDS
                    db.execute("INSERT INTO ground_tiles (x,y,material,created_by,created_by_id,created_at,locked_until) VALUES (?,?,?,?,?,?,?) "
                               "ON CONFLICT(x,y) DO UPDATE SET material=excluded.material,created_by=excluded.created_by,created_by_id=excluded.created_by_id,created_at=excluded.created_at,locked_until=excluded.locked_until",
                               (x, y, material, created_by, visitor_id, created_at, locked_until))
                    updated.append({"x": x, "y": y, "material": material, "created_by": created_by,
                                    "created_at": created_at, "locked_until": locked_until,
                                    "can_change_while_locked": bool(visitor_id)})
                    consumed += 1
                    remaining -= 1
            if consumed:
                _, allowance = consume_changes(db, visitor_id, consumed)
            else:
                allowance = change_allowance(db, visitor_id)
            revision = world_revision(db)
            if updated or removed:
                revision += 1
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
        self.send_json({"updated": updated, "removed": removed, "locked": locked, "conflicts": conflicts, "revision": revision,
                        "limit_reached": limit_reached, "change_allowance": allowance})

    def do_path_stroke(self) -> None:
        visitor_id = self.headers.get("X-Visitor-Id", "")[:80]
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 128_000:
                raise ValueError("invalid body length")
            payload = json.loads(self.rfile.read(length))
            species = payload.get("species")
            action = payload.get("action")
            cells = payload.get("cells")
            created_by = str(payload.get("created_by") or "Garden visitor").strip()[:32] or "Garden visitor"
            created_at = time.time()
            connect_type = GARDEN_OBJECTS.get(species, {}).get("connect")
            if connect_type not in ("path", "fence", "wall") or species in COMING_SOON_OBJECTS:
                raise ValueError("invalid connected stroke type")
            if action not in ("draw", "erase") or not isinstance(cells, list) or len(cells) > WORLD_SIZE * WORLD_SIZE:
                raise ValueError("invalid path stroke")
            normalized = []
            seen = set()
            for cell in cells:
                x, y = cell.get("x"), cell.get("y")
                if type(x) is not int or type(y) is not int or not (0 <= x < WORLD_SIZE and 0 <= y < WORLD_SIZE):
                    raise ValueError("invalid path cell")
                if (x, y) not in seen:
                    seen.add((x, y))
                    normalized.append((x, y))
        except (ValueError, json.JSONDecodeError, AttributeError, TypeError):
            self.send_json({"error": "invalid_path_stroke"}, 400)
            return

        added, removed, locked, conflicts = [], [], [], []
        consumed = 0
        limit_reached = False
        with db_session() as db:
            # Serialize strokes so simultaneous visitors cannot claim the same cell.
            db.execute("BEGIN IMMEDIATE")
            allowance = change_allowance(db, visitor_id)
            remaining = allowance["remaining"]
            for x, y in normalized:
                occupied = db.execute(
                    "SELECT object_id FROM garden_object_cells WHERE x=? AND y=?", (x, y)
                ).fetchone()
                if action == "draw":
                    if occupied or db.execute("SELECT 1 FROM plants WHERE x=? AND y=?", (x, y)).fetchone():
                        conflicts.append({"x": x, "y": y, "reason": "occupied"})
                        continue
                    if remaining <= 0:
                        limit_reached = True
                        continue
                    item = {"id": str(uuid.uuid4()), "species": species, "x": x, "y": y,
                            "rotation": 0, "created_by": created_by, "created_at": created_at,
                            "locked_until": created_at + ITEM_LOCK_SECONDS}
                    item["can_change_while_locked"] = bool(visitor_id)
                    db.execute("INSERT INTO garden_objects (id,species,x,y,rotation,created_by,created_by_id,created_at,locked_until) VALUES (?,?,?,?,0,?,?,?,?)",
                               (item["id"], species, x, y, created_by, visitor_id, created_at, item["locked_until"]))
                    db.execute("INSERT INTO garden_object_cells (x,y,object_id) VALUES (?,?,?)",
                               (x, y, item["id"]))
                    added.append(item)
                    consumed += 1
                    remaining -= 1
                elif occupied:
                    row = db.execute("SELECT id,species,x,y,created_by_id,locked_until FROM garden_objects WHERE id=?",
                                     (occupied["object_id"],)).fetchone()
                    if row and GARDEN_OBJECTS.get(row["species"], {}).get("connect") == connect_type:
                        is_creator = bool(visitor_id and row["created_by_id"] == visitor_id)
                        if row["locked_until"] > time.time() and not is_creator:
                            locked.append({"x": x, "y": y, "locked_until": row["locked_until"]})
                            continue
                        if remaining <= 0:
                            limit_reached = True
                            continue
                        removed.append({"x": row["x"], "y": row["y"]})
                        db.execute("DELETE FROM garden_objects WHERE id=?", (row["id"],))
                        db.execute("DELETE FROM garden_object_cells WHERE object_id=?", (row["id"],))
                        consumed += 1
                        remaining -= 1
            if consumed:
                _, allowance = consume_changes(db, visitor_id, consumed)
            else:
                allowance = change_allowance(db, visitor_id)
            revision = world_revision(db)
            if added or removed:
                revision += 1
                db.execute("INSERT OR REPLACE INTO world_meta VALUES ('revision',?)", (str(revision),))
        self.send_json({"added": added, "removed": removed, "locked": locked, "conflicts": conflicts, "revision": revision,
                        "limit_reached": limit_reached, "change_allowance": allowance})


if __name__ == "__main__":
    os.chdir(ROOT)
    initialize()
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Common Garden is running at http://localhost:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
