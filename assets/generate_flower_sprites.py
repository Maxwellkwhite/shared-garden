"""Generate crisp, reusable pixel-art flower stage sprites."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

W, H, SCALE = 48, 64, 4
OUT = Path(__file__).resolve().parent
TRANSPARENT = (0, 0, 0, 0)

PALETTE = {
    "outline": (28, 57, 35, 255),
    "leaf_dark": (39, 83, 47, 255),
    "leaf": (62, 119, 63, 255),
    "leaf_light": (113, 157, 75, 255),
    "leaf_sun": (154, 183, 77, 255),
    "daisy_edge": (183, 204, 178, 255),
    "daisy": (242, 239, 213, 255),
    "daisy_light": (255, 251, 232, 255),
    "gold_dark": (137, 83, 24, 255),
    "gold": (220, 158, 39, 255),
    "gold_light": (255, 211, 74, 255),
    "tulip_edge": (81, 43, 43, 255),
    "tulip": (176, 64, 69, 255),
    "tulip_light": (232, 116, 103, 255),
    "tulip_glow": (255, 170, 129, 255),
    "soil_dark": (58, 75, 41, 190),
    "soil_light": (111, 132, 60, 160),
    "seed_dark": (80, 48, 32, 255),
    "seed": (137, 83, 40, 255),
}


class PixelCanvas:
    def __init__(self) -> None:
        self.pixels = [[TRANSPARENT for _ in range(W)] for _ in range(H)]

    def put(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < W and 0 <= y < H:
            self.pixels[y][x] = color

    def rect(self, x1: int, y1: int, x2: int, y2: int, color: tuple[int, int, int, int]) -> None:
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                self.put(x, y, color)

    def line(self, x1: int, y1: int, x2: int, y2: int, color: tuple[int, int, int, int], width: int = 1) -> None:
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        sx, sy = (1 if x1 < x2 else -1), (1 if y1 < y2 else -1)
        err = dx - dy
        while True:
            self.rect(x1 - width // 2, y1 - width // 2, x1 + width // 2, y1 + width // 2, color)
            if x1 == x2 and y1 == y2:
                break
            twice = 2 * err
            if twice > -dy:
                err -= dy
                x1 += sx
            if twice < dx:
                err += dx
                y1 += sy

    def polygon(self, points: list[tuple[int, int]], color: tuple[int, int, int, int]) -> None:
        min_y, max_y = min(y for _, y in points), max(y for _, y in points)
        for y in range(min_y, max_y + 1):
            intersections = []
            for i, (x1, y1) in enumerate(points):
                x2, y2 = points[(i + 1) % len(points)]
                if y1 == y2:
                    continue
                if min(y1, y2) <= y < max(y1, y2):
                    intersections.append(round(x1 + (y - y1) * (x2 - x1) / (y2 - y1)))
            intersections.sort()
            for start, end in zip(intersections[::2], intersections[1::2]):
                self.rect(start, y, end, y, color)

    def ellipse(self, cx: int, cy: int, rx: int, ry: int, color: tuple[int, int, int, int]) -> None:
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / max(rx, 1)) ** 2 + ((y - cy) / max(ry, 1)) ** 2 <= 1:
                    self.put(x, y, color)

    def leaf(self, points: list[tuple[int, int]]) -> None:
        self.polygon(points, PALETTE["leaf_dark"])
        inner = [(x + (1 if x < 24 else -1), y - 1) for x, y in points]
        self.polygon(inner, PALETTE["leaf"])
        x1, y1 = points[0]
        x2, y2 = points[len(points) // 2]
        self.line(x1, y1, x2, y2, PALETTE["leaf_light"])


def add_foliage(c: PixelCanvas, head_y: int, size: int) -> None:
    stem_bottom = 58
    stem_top = head_y + 1
    c.line(24, stem_top, 24, stem_bottom, PALETTE["leaf_dark"], 4)
    c.line(24, stem_top, 24, stem_bottom, PALETTE["leaf"], 2)
    spread = {1: 6, 2: 8, 3: 10}[size]
    for y, side in ((48, -1), (53, 1)):
        tip_x = 24 + side * spread
        c.leaf([(24, y), (24 + side * 3, y - 3), (tip_x, y - 1), (24 + side * 4, y + 2), (24, y + 2)])
    if size >= 2:
        c.leaf([(24, 43), (20, 40), (15, 41), (19, 45), (24, 46)])
        c.leaf([(24, 46), (28, 42), (33, 43), (29, 47), (24, 48)])
    c.ellipse(24, 60, 8 if size > 1 else 6, 2, PALETTE["soil_dark"])
    c.ellipse(22, 59, 4, 1, PALETTE["soil_light"])


def daisy_bloom(c: PixelCanvas, cx: int, cy: int, size: int) -> None:
    rx, ry = {1: (2, 3), 2: (3, 4), 3: (4, 5)}[size]
    if size == 1:
        c.ellipse(cx, cy, 3, 3, PALETTE["gold_dark"])
        c.ellipse(cx, cy, 2, 2, PALETTE["gold_light"])
        return
    offsets = [(0, -ry), (rx, -2), (rx, 2), (0, ry), (-rx, 2), (-rx, -2)]
    for ox, oy in offsets:
        c.ellipse(cx + ox, cy + oy, rx if ox else 2, ry if oy else 2, PALETTE["daisy_edge"])
        c.ellipse(cx + ox, cy + oy, max(1, rx - 1) if ox else 1, max(1, ry - 1) if oy else 1, PALETTE["daisy_light"])
    c.ellipse(cx, cy, 4 if size == 3 else 3, 4 if size == 3 else 3, PALETTE["gold_dark"])
    c.ellipse(cx, cy, 3 if size == 3 else 2, 3 if size == 3 else 2, PALETTE["gold"])
    c.put(cx - 1, cy - 1, PALETTE["gold_light"])


def tulip_bloom(c: PixelCanvas, cx: int, cy: int, size: int) -> None:
    if size == 1:
        c.ellipse(cx, cy, 2, 3, PALETTE["tulip_edge"])
        c.ellipse(cx, cy - 1, 1, 2, PALETTE["tulip_light"])
        return
    scale = {2: 1, 3: 2}[size]
    outline = [(cx - 5 * scale, cy + 3 * scale), (cx - 4 * scale, cy - 2 * scale),
               (cx - 1 * scale, cy + 1 * scale), (cx, cy - 5 * scale),
               (cx + 2 * scale, cy + 1 * scale), (cx + 5 * scale, cy - 2 * scale),
               (cx + 5 * scale, cy + 3 * scale), (cx + 3 * scale, cy + 5 * scale),
               (cx - 3 * scale, cy + 5 * scale)]
    c.polygon(outline, PALETTE["tulip_edge"])
    inner = [(round(cx + (x - cx) * 0.72), round(cy + (y - cy) * 0.72)) for x, y in outline]
    c.polygon(inner, PALETTE["tulip"])
    c.line(cx - 2 * scale, cy + 3 * scale, cx - 1 * scale, cy - 2 * scale, PALETTE["tulip_light"], 2)
    c.line(cx, cy - 3 * scale, cx, cy + 2 * scale, PALETTE["tulip_glow"])


def sunflower_bloom(c: PixelCanvas, cx: int, cy: int, size: int) -> None:
    if size == 1:
        c.ellipse(cx, cy, 3, 3, PALETTE["leaf_dark"])
        c.ellipse(cx, cy, 2, 2, PALETTE["leaf_light"])
        return
    ray = {2: 5, 3: 7}[size]
    petal = PALETTE["gold_light"]
    shadow = PALETTE["gold"]
    for dx, dy in ((0, -ray), (ray, 0), (0, ray), (-ray, 0), (ray - 2, -ray + 2),
                   (ray - 2, ray - 2), (-ray + 2, ray - 2), (-ray + 2, -ray + 2)):
        c.ellipse(cx + dx, cy + dy, 2 if size == 2 else 3, 3 if size == 2 else 4, shadow)
        c.put(cx + dx, cy + dy - 1, petal)
    radius = 4 if size == 3 else 3
    c.ellipse(cx, cy, radius + 1, radius + 1, PALETTE["seed_dark"])
    c.ellipse(cx, cy, radius, radius, PALETTE["seed"])
    for dx, dy in ((-1, -1), (1, 0), (0, 2)):
        c.put(cx + dx, cy + dy, PALETTE["gold_dark"])
    c.put(cx - 1, cy - 2, PALETTE["gold_light"])


def make_sprite(flower: str, stage: int) -> list[list[tuple[int, int, int, int]]]:
    c = PixelCanvas()
    head_y = {"small": 40, "medium": 31, "mature": 23}[{1: "small", 2: "medium", 3: "mature"}[stage]]
    add_foliage(c, head_y, stage)
    if flower == "daisy":
        daisy_bloom(c, 24, head_y, stage)
    elif flower == "tulip":
        tulip_bloom(c, 24, head_y, stage)
    else:
        sunflower_bloom(c, 24, head_y, stage)
    return c.pixels


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    width, height = W * SCALE, H * SCALE
    raw = bytearray()
    for row in pixels:
        scaled = b"".join(bytes(color) * SCALE for color in row)
        for _ in range(SCALE):
            raw.append(0)
            raw.extend(scaled)
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


if __name__ == "__main__":
    for flower in ("daisy", "tulip", "sunflower"):
        for stage, label in ((1, "small"), (2, "medium"), (3, "mature")):
            write_png(OUT / f"{flower}-{label}.png", make_sprite(flower, stage))
