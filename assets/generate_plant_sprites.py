"""Build all 30 plant families as deterministic pixel-art stage sprites."""
from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "plants"
W, H, SCALE = 64, 80, 4
STAGES = ("seedling", "young", "growing", "mature")

# dark foliage, foliage, foliage highlight, bloom dark, bloom, bloom highlight,
# trunk/ground, trunk highlight
COLORS = {
    "sunflower": ((26, 60, 34), (47, 99, 48), (118, 157, 62), (110, 67, 28), (222, 157, 35), (255, 211, 72), (91, 57, 33), (166, 111, 54)),
    "tulip": ((29, 62, 36), (54, 112, 54), (132, 171, 73), (100, 39, 48), (186, 63, 72), (242, 127, 111), (77, 83, 39), (163, 139, 61)),
    "rose": ((27, 60, 36), (49, 103, 48), (122, 159, 69), (87, 35, 45), (183, 53, 72), (240, 126, 139), (77, 75, 38), (151, 127, 59)),
    "daisy": ((31, 66, 37), (56, 116, 54), (137, 176, 76), (174, 193, 173), (238, 239, 215), (255, 252, 234), (81, 85, 43), (161, 146, 64)),
    "lavender": ((28, 66, 39), (54, 115, 58), (137, 170, 78), (85, 58, 132), (132, 99, 186), (191, 159, 220), (83, 84, 46), (161, 147, 68)),
    "hydrangea": ((29, 64, 37), (50, 106, 52), (136, 171, 78), (81, 71, 142), (123, 128, 204), (182, 192, 240), (75, 83, 43), (156, 146, 68)),
    "marigold": ((30, 64, 35), (54, 109, 49), (139, 168, 68), (144, 63, 23), (229, 111, 29), (255, 177, 54), (81, 80, 39), (157, 137, 55)),
    "bluebell": ((29, 66, 42), (51, 109, 59), (130, 170, 81), (56, 75, 133), (84, 120, 198), (153, 180, 230), (79, 83, 45), (154, 146, 70)),
    "peony": ((29, 62, 36), (54, 108, 50), (135, 166, 75), (133, 56, 80), (221, 109, 144), (255, 177, 190), (80, 82, 42), (160, 143, 66)),
    "poppy": ((29, 64, 38), (54, 111, 52), (133, 170, 76), (95, 34, 31), (214, 53, 44), (249, 111, 77), (81, 82, 42), (159, 144, 66)),
    "oak-tree": ((24, 57, 31), (50, 101, 43), (115, 150, 60), (68, 78, 39), (116, 143, 58), (170, 183, 83), (79, 48, 30), (151, 96, 49)),
    "pine-tree": ((20, 55, 38), (35, 91, 55), (97, 145, 70), (34, 75, 46), (62, 116, 65), (127, 165, 84), (77, 49, 31), (154, 96, 48)),
    "cherry-blossom-tree": ((37, 68, 47), (76, 121, 70), (145, 173, 95), (156, 84, 112), (224, 143, 170), (255, 203, 210), (78, 48, 32), (153, 96, 50)),
    "weeping-willow": ((27, 60, 39), (55, 111, 63), (139, 166, 85), (75, 82, 39), (137, 155, 68), (188, 196, 104), (75, 47, 30), (148, 96, 49)),
    "apple-tree": ((26, 60, 34), (53, 107, 48), (133, 164, 69), (118, 49, 34), (194, 62, 44), (231, 108, 69), (77, 47, 29), (153, 93, 48)),
    "maple-tree": ((29, 61, 34), (74, 114, 47), (156, 168, 61), (126, 58, 26), (200, 103, 33), (244, 165, 57), (82, 47, 27), (160, 96, 49)),
    "birch-tree": ((41, 70, 40), (91, 133, 60), (164, 183, 83), (83, 98, 47), (151, 166, 70), (200, 199, 107), (205, 193, 151), (244, 230, 190)),
    "azalea": ((26, 62, 35), (48, 106, 49), (124, 163, 66), (131, 53, 75), (218, 112, 142), (255, 181, 191), (74, 78, 38), (147, 138, 59)),
    "boxwood": ((25, 58, 34), (46, 93, 45), (111, 147, 61), (65, 79, 37), (113, 137, 55), (159, 174, 79), (74, 76, 37), (140, 127, 51)),
    "holly-bush": ((22, 56, 34), (40, 91, 48), (109, 148, 66), (117, 38, 38), (185, 48, 43), (228, 90, 66), (73, 73, 35), (144, 130, 52)),
    "blueberry-bush": ((26, 60, 37), (48, 104, 54), (125, 159, 73), (49, 57, 109), (73, 96, 172), (135, 151, 219), (76, 76, 39), (147, 132, 56)),
    "rhododendron": ((25, 60, 36), (46, 103, 51), (123, 162, 67), (119, 48, 85), (193, 86, 151), (242, 155, 197), (76, 75, 38), (151, 130, 57)),
    "boston-fern": ((23, 60, 37), (44, 105, 56), (113, 166, 75), (57, 95, 52), (96, 142, 68), (158, 188, 96), (76, 83, 43), (142, 145, 64)),
    "clover": ((26, 65, 37), (51, 117, 57), (125, 172, 79), (65, 99, 42), (113, 155, 62), (174, 192, 95), (77, 83, 42), (148, 144, 62)),
    "english-ivy": ((25, 61, 38), (47, 108, 57), (121, 168, 82), (56, 93, 51), (99, 143, 72), (157, 188, 110), (76, 82, 44), (145, 143, 67)),
    "cactus": ((27, 64, 44), (57, 126, 75), (137, 181, 102), (157, 64, 49), (213, 111, 84), (246, 176, 112), (132, 105, 62), (196, 165, 99)),
    "palm-tree": ((28, 67, 39), (54, 118, 59), (133, 168, 76), (94, 83, 43), (146, 126, 63), (192, 167, 86), (117, 76, 40), (189, 134, 68)),
    "monstera": ((23, 61, 42), (42, 112, 72), (107, 165, 99), (63, 110, 71), (103, 159, 105), (164, 197, 131), (81, 82, 47), (154, 144, 75)),
    "fly-agaric-mushroom": ((32, 61, 37), (59, 105, 54), (130, 163, 82), (114, 43, 35), (205, 54, 41), (238, 105, 70), (218, 210, 176), (255, 247, 218)),
    "chanterelle-mushroom": ((32, 61, 37), (59, 105, 54), (130, 163, 82), (139, 78, 24), (223, 144, 36), (255, 201, 74), (216, 199, 157), (250, 231, 190)),
}


class Canvas:
    def __init__(self):
        self.p = [[(0, 0, 0, 0) for _ in range(W)] for _ in range(H)]

    def px(self, x, y, color):
        if 0 <= x < W and 0 <= y < H:
            self.p[y][x] = (*color, 255) if len(color) == 3 else color

    def rect(self, x1, y1, x2, y2, color):
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                self.px(x, y, color)

    def line(self, x1, y1, x2, y2, color, width=1):
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        sx, sy = (1 if x1 < x2 else -1), (1 if y1 < y2 else -1)
        err = dx - dy
        while True:
            self.rect(x1 - width // 2, y1 - width // 2, x1 + width // 2, y1 + width // 2, color)
            if x1 == x2 and y1 == y2:
                break
            e2 = 2 * err
            if e2 > -dy: err -= dy; x1 += sx
            if e2 < dx: err += dx; y1 += sy

    def ellipse(self, cx, cy, rx, ry, color):
        rx, ry = max(1, rx), max(1, ry)
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    self.px(x, y, color)

    def poly(self, points, color):
        ys = [p[1] for p in points]
        for y in range(min(ys), max(ys) + 1):
            hits = []
            for i, (x1, y1) in enumerate(points):
                x2, y2 = points[(i + 1) % len(points)]
                if y1 != y2 and min(y1, y2) <= y < max(y1, y2):
                    hits.append(round(x1 + (y - y1) * (x2 - x1) / (y2 - y1)))
            hits.sort()
            for a, b in zip(hits[::2], hits[1::2]):
                self.rect(a, y, b, y, color)


def palette(species):
    d, m, h, bd, b, bh, bark, bark_h = COLORS[species]
    return {"dark": d, "green": m, "light": h, "bloom_dark": bd, "bloom": b,
            "bloom_light": bh, "bark": bark, "bark_light": bark_h, "white": (244, 240, 211)}


def leaf(c, cx, cy, direction, length, p, style=0):
    tipx, tipy = cx + direction * length, cy - max(1, length // 3)
    if style == 1:
        pts = [(cx, cy), (cx + direction * 2, cy - 3), (tipx, tipy), (cx + direction * (length - 2), cy + 2), (cx, cy + 2)]
    else:
        pts = [(cx, cy), (cx + direction * 3, cy - 3), (tipx, tipy), (cx + direction * (length - 2), cy + 3), (cx, cy + 3)]
    c.poly(pts, p["dark"])
    inset = [(x - (direction if x != cx else 0), y + (1 if y < cy else 0)) for x, y in pts]
    c.poly(inset, p["green"])
    c.line(cx + direction, cy + 1, tipx - direction, tipy + 1, p["light"])


def ground(c, p):
    c.ellipse(32, 74, 12, 2, (41, 61, 35))
    c.ellipse(29, 73, 6, 1, p["light"])


def flower(c, species, stage, p):
    head_y = (60, 54, 45, 34)[stage]
    growth = (0.45, 0.62, 0.82, 1.0)[stage]
    c.line(32, head_y + 2, 32, 70, p["dark"], 4)
    c.line(32, head_y + 3, 32, 70, p["green"], 2)
    leaf_len = int(8 + 9 * growth)
    leaf(c, 31, 63, -1, leaf_len, p)
    leaf(c, 33, 68, 1, max(7, leaf_len - 2), p)
    if stage >= 2:
        leaf(c, 31, 57, -1, max(7, leaf_len - 3), p)
    if stage == 0:
        c.ellipse(32, head_y, 2, 3, p["light"])
        return
    bloom_size = (2, 3, 5, 7)[stage]
    if species in ("lavender", "bluebell"):
        c.line(32, head_y + 2, 32, head_y - bloom_size * 3, p["dark"], 3)
        c.line(32, head_y + 2, 32, head_y - bloom_size * 3, p["green"], 1)
        for i in range(3 + stage * 2):
            y = head_y - 2 - i * 2
            x = 32 + (1 if i % 2 else -1)
            if species == "bluebell":
                c.ellipse(x, y + 2, 2, 3, p["bloom_dark"])
                c.ellipse(x, y + 1, 1, 2, p["bloom_light"])
            else:
                c.ellipse(x, y, 2, 2, p["bloom"])
                c.px(x, y - 1, p["bloom_light"])
        return
    if species == "tulip":
        width = (2, 3, 4, 6)[stage]
        c.poly([(32-width, head_y+4), (32-width+1, head_y-2), (31, head_y+1),
                (32, head_y-5-(stage==3)*2), (33, head_y+1), (32+width, head_y-2),
                (32+width, head_y+4), (32+width-2, head_y+6), (32-width+2, head_y+6)], p["bloom_dark"])
        c.poly([(31-width//2, head_y+3), (32-width//2, head_y), (32, head_y+2),
                (33, head_y-2), (33+width//2, head_y+2), (33+width//2, head_y+4)], p["bloom"])
        c.line(30, head_y+3, 31, head_y, p["bloom_light"])
        return
    if species in ("hydrangea", "azalea", "rhododendron"):
        count = (3, 5, 8, 12)[stage]
        for i in range(count):
            ox = ((i * 7) % 11) - 5
            oy = ((i * 5) % 9) - 4
            c.ellipse(32 + ox, head_y + oy, 2, 2, p["bloom_dark"])
            c.ellipse(32 + ox, head_y + oy - 1, 1, 1, p["bloom_light"])
        return
    if species in ("sunflower", "marigold", "daisy", "peony", "poppy", "rose"):
        radius = (2, 3, 5, 7)[stage]
        petals = 6 if species in ("daisy", "poppy") else 8
        for i in range(petals):
            # cardinal and diagonal petal positions on the pixel grid
            offsets = [(0,-radius),(radius,-2),(radius,2),(0,radius),(-radius,2),(-radius,-2),
                       (radius-2,-radius+2),(-radius+2,-radius+2)]
            ox, oy = offsets[i]
            c.ellipse(32 + ox, head_y + oy, 2 if stage < 3 else 3, 3 if stage < 3 else 4, p["bloom_dark"])
            c.ellipse(32 + ox, head_y + oy, 1 if stage < 3 else 2, 2 if stage < 3 else 3, p["bloom_light"])
        center = 3 if species in ("sunflower", "daisy", "marigold") else 2
        c.ellipse(32, head_y, center + 1, center + 1, p["bloom_dark"])
        center_color = p["bark"] if species in ("sunflower", "poppy") else p["bloom"]
        c.ellipse(32, head_y, center, center, center_color)
        c.px(31, head_y - 1, p["bloom_light"])


def tree(c, species, stage, p):
    base_y = 71
    crown_h = (12, 21, 31, 42)[stage]
    crown_w = (8, 14, 22, 29)[stage]
    top = base_y - crown_h
    if species == "weeping-willow":
        c.rect(30, top + 4, 33, base_y, p["bark"])
        c.rect(31, top + 5, 32, base_y - 1, p["bark_light"])
        for side in (-1, 1):
            for i in range(3 + stage * 2):
                x = 32 + side * (5 + i * 3)
                end_y = int(min(73, top + crown_h * 0.55 + (i % 3) * 4))
                c.line(32, top + 8, x, end_y, p["dark"], 3)
                c.line(32, top + 8, x, end_y, p["green"], 2)
                for yy in range(int(end_y) - 4, int(end_y) + 1, 3):
                    c.ellipse(x, yy, 2, 3, p["light"] if yy % 2 else p["green"])
        return
    trunk_w = max(2, stage + 2)
    c.rect(32 - trunk_w, base_y - trunk_w * 4, 32 + trunk_w, base_y, p["bark"])
    c.rect(31, base_y - trunk_w * 3, 32, base_y - 1, p["bark_light"])
    if species == "birch-tree":
        for y in range(base_y - 14, base_y, 5):
            c.rect(30, y, 34, y + 1, p["dark"])
    if species == "pine-tree":
        for tier in range(5 if stage == 3 else 2 + stage):
            y = top + tier * max(3, crown_h // 5)
            half = max(3, round(crown_w * (1 - tier / 5)))
            c.poly([(32, y), (32-half, y+half//2), (32-half+3, y+half//2),
                    (32, y+max(4, crown_h//4)), (32+half-3, y+half//2), (32+half, y+half//2)], p["dark"])
            c.poly([(32, y+1), (32-half+2, y+half//2), (32, y+max(3,crown_h//4)-1), (32+half-2, y+half//2)], p["green"])
            c.line(32, y+2, 32, y+max(4,crown_h//4)-2, p["light"])
    else:
        if species == "maple-tree":
            for dx, dy in ((-10,0),(10,1),(-6,-8),(7,-9),(0,-13),(0,8)):
                c.poly([(32+dx,top+dy-5),(32+dx-3,top+dy-1),(32+dx-5,top+dy+2),
                        (32+dx,top+dy+1),(32+dx+5,top+dy+2),(32+dx+3,top+dy-1)], p["green"])
        else:
            c.ellipse(32, top + crown_h//2, crown_w, max(5,crown_h//2), p["dark"])
            c.ellipse(31, top + crown_h//2 - 2, crown_w - 3, max(4,crown_h//2 - 3), p["green"])
        for i in range(4 + stage * 3):
            x = 32 + ((i * 11) % (crown_w * 2 + 1)) - crown_w
            y = top + ((i * 7) % max(5,crown_h))
            c.ellipse(x, y, 2, 2, p["light"])
        if species == "apple-tree" and stage >= 2:
            for x, y in ((26,top+crown_h//2),(38,top+crown_h//3),(32,top+crown_h//2+4)):
                c.ellipse(x, y, 2, 2, p["bloom"])
        if species == "cherry-blossom-tree":
            for x, y in ((24,top+crown_h//2),(40,top+crown_h//2-3),(32,top+5)):
                c.ellipse(x, y, 3, 3, p["bloom"])


def shrub(c, species, stage, p):
    radius = (7, 11, 16, 21)[stage]
    cy = 70 - radius // 2
    c.ellipse(32, cy, radius, max(5, radius * 2 // 3), p["dark"])
    c.ellipse(31, cy - 2, radius - 3, max(4, radius * 2 // 3 - 3), p["green"])
    for i in range(3 + stage * 3):
        x = 32 + ((i * 9) % (radius * 2 - 3)) - radius + 2
        y = cy - radius // 3 + ((i * 7) % max(3, radius // 2))
        c.ellipse(x, y, 2, 2, p["light"])
    if species in ("azalea", "rhododendron") and stage >= 1:
        for x, y in ((24,cy-4),(34,cy-7),(40,cy-1),(29,cy+1))[:stage+1]:
            c.ellipse(x, y, 3, 3, p["bloom_dark"])
            c.ellipse(x, y-1, 2, 2, p["bloom_light"])
    if species in ("holly-bush", "blueberry-bush") and stage >= 1:
        for x, y in ((25,cy-1),(37,cy-5),(31,cy+2),(41,cy+1))[:stage+1]:
            c.ellipse(x, y, 2, 2, p["bloom_dark"])
            c.ellipse(x, y-1, 1, 1, p["bloom_light"])
    if species == "boxwood":
        c.rect(22, cy-3, 42, cy+3, p["green"])
        c.rect(26, cy-7, 38, cy+1, p["light"])


def fern(c, species, stage, p):
    fronds = (3, 4, 5, 7)[stage]
    span = (10, 15, 21, 27)[stage]
    for i in range(fronds):
        dx = (i - (fronds - 1) / 2) * 5
        tip_x = round(32 + dx)
        tip_y = 69 - span + abs(round(dx)) // 2
        c.line(32, 71, tip_x, tip_y, p["dark"], 3)
        c.line(32, 71, tip_x, tip_y, p["green"], 1)
        for t in range(2, 9):
            y = 71 - round(span * t / 9)
            x = 32 + round(dx * t / 9)
            length = max(2, round(t / 2))
            leaf(c, x, y, -1 if (i+t) % 2 else 1, length, p)
    if species == "clover" and stage > 0:
        for x in (26, 32, 38):
            c.ellipse(x, 66, 4 if stage > 2 else 3, 4 if stage > 2 else 3, p["dark"])
            c.ellipse(x, 65, 3 if stage > 2 else 2, 3 if stage > 2 else 2, p["light"])


def vine(c, stage, p):
    count = (2, 3, 5, 7)[stage]
    c.line(11, 70, 20 + stage * 6, 60 - stage * 7, p["dark"], 3)
    c.line(11, 70, 20 + stage * 6, 60 - stage * 7, p["green"], 1)
    for i in range(count):
        x = 13 + i * 5
        y = 68 - i * (3 + stage)
        leaf(c, x, y, -1 if i % 2 else 1, 7 + stage * 2, p, style=1)


def cactus(c, stage, p):
    height = (14, 24, 34, 44)[stage]
    bottom = 71
    c.rect(27, bottom-height, 38, bottom, p["dark"])
    c.rect(29, bottom-height+2, 36, bottom-2, p["green"])
    c.line(32, bottom-height+5, 32, bottom-4, p["light"])
    for y in range(bottom-height+6, bottom-4, 5):
        c.line(27, y, 24, y+1, p["light"])
        c.line(38, y+2, 41, y+1, p["light"])
    if stage >= 2:
        c.rect(20, bottom-height//2, 27, bottom-height//2+4, p["dark"])
        c.rect(21, bottom-height//2-1, 24, bottom-height//2+2, p["green"])
        c.rect(38, bottom-height//3, 45, bottom-height//3+4, p["dark"])
        c.rect(41, bottom-height//3-4, 44, bottom-height//3+2, p["green"])
    if stage == 3:
        c.ellipse(32, bottom-height-3, 4, 3, p["bloom"])
        c.ellipse(32, bottom-height-3, 2, 2, p["bloom_light"])


def palm(c, stage, p):
    h = (15, 25, 37, 48)[stage]
    bottom = 71
    for i in range(h):
        width = 2 if i < h//2 else 3
        y = bottom - i
        c.rect(32-width, y, 32+width, y, p["bark"] if i % 3 else p["bark_light"])
    if stage == 0:
        leaf(c, 32, bottom-h, -1, 7, p, style=1)
        leaf(c, 32, bottom-h, 1, 7, p, style=1)
        return
    top = bottom - h
    for dx, dy in ((-23,-12),(-17,-21),(-7,-25),(8,-25),(18,-20),(24,-11),(-15,-8),(14,-8)):
        c.line(32, top, 32+dx, top+dy, p["dark"], 4)
        c.line(32, top, 32+dx, top+dy, p["green"], 2)
        for t in range(3, 10, 2):
            x = 32 + round(dx*t/10)
            y = top + round(dy*t/10)
            leaf(c, x, y, -1 if dx > 0 else 1, 4, p, style=1)


def monstera(c, stage, p):
    leaves = (2, 3, 4, 6)[stage]
    for i in range(leaves):
        x = 22 + (i % 3) * 10
        y = 68 - i * 5
        c.line(32, 71, x, y+3, p["dark"], 2)
        pts = [(x,y+5),(x-6,y),(x-7,y-6),(x-3,y-9),(x,y-5),(x+4,y-10),(x+8,y-6),(x+7,y),(x+2,y+5)]
        c.poly(pts, p["dark"])
        c.poly([(px,py+1) for px,py in pts], p["green"])
        c.line(x, y+3, x, y-7, p["light"])
        if stage >= 2:
            c.ellipse(x-3,y-4,1,2,(22,61,42))
            c.ellipse(x+4,y-2,1,2,(22,61,42))


def mushroom(c, species, stage, p):
    height = (9, 13, 18, 23)[stage]
    bottom = 71
    stem_w = 2 + stage // 2
    c.rect(32-stem_w, bottom-height, 32+stem_w, bottom, p["bark"])
    c.rect(32-stem_w+1, bottom-height+2, 32, bottom-1, p["bark_light"])
    radius = (5, 8, 12, 16)[stage]
    if species == "fly-agaric-mushroom":
        c.ellipse(32, bottom-height, radius, max(3,radius//2), p["bloom_dark"])
        c.ellipse(32, bottom-height-1, radius-1, max(2,radius//2-1), p["bloom"])
        if stage >= 1:
            for dx,dy in ((-7,-2),(0,-4),(7,-2),(-3,1),(5,1))[:stage+1]:
                c.ellipse(32+dx,bottom-height+dy,2,1,p["white"])
    else:
        c.poly([(32-radius,bottom-height+4),(32-radius+4,bottom-height-2),(32-3,bottom-height+1),
                (32,bottom-height-5),(32+3,bottom-height+1),(32+radius-4,bottom-height-2),
                (32+radius,bottom-height+4),(32+radius-3,bottom-height+6),(32-radius+3,bottom-height+6)],p["bloom_dark"])
        c.poly([(32-radius+2,bottom-height+3),(32-3,bottom-height),(32,bottom-height-3),
                (32+3,bottom-height),(32+radius-2,bottom-height+3),(32+radius-3,bottom-height+4)],p["bloom_light"])


def render(species, kind, stage):
    c, p = Canvas(), palette(species)
    ground(c, p)
    if kind == "flower": flower(c, species, stage, p)
    elif kind in ("tree", "pine", "willow"): tree(c, "weeping-willow" if kind == "willow" else species, stage, p)
    elif kind == "shrub": shrub(c, species, stage, p)
    elif kind == "fern": fern(c, species, stage, p)
    elif kind == "groundcover": fern(c, species, stage, p)
    elif kind == "vine": vine(c, stage, p)
    elif kind == "cactus": cactus(c, stage, p)
    elif kind == "palm": palm(c, stage, p)
    elif kind == "monstera": monstera(c, stage, p)
    elif kind == "mushroom": mushroom(c, species, stage, p)
    return c.p


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path, pixels):
    raw = bytearray()
    for row in pixels:
        scaled = b"".join(bytes(color) * SCALE for color in row)
        for _ in range(SCALE): raw.append(0); raw.extend(scaled)
    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", struct.pack(">IIBBBBB", W*SCALE, H*SCALE, 8, 6, 0, 0, 0))
    data += png_chunk(b"IDAT", zlib.compress(bytes(raw), 1)) + png_chunk(b"IEND", b"")
    path.write_bytes(data)


if __name__ == "__main__":
    catalog = json.loads((ROOT / "plant-catalog.json").read_text())
    OUT.mkdir(exist_ok=True)
    for category in catalog:
        for plant in category["plants"]:
            for stage_index, stage in enumerate(STAGES):
                write_png(OUT / f"{plant['id']}-{stage}.png", render(plant["id"], plant["kind"], stage_index))
