"""Split generated four-stage transparent PNG sheets into local plant sprites.

Uses Python's standard library only. It preserves the original PNG pixels and alpha,
trims transparent margins around each isolated plant, and keeps the stage order.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

GENERATED = Path('/Users/maxwellwhite/.codex/generated_images/01a1c722-5d0b-72c3-9765-8508da68b38b')
OUT = Path(__file__).resolve().parent / 'plants'
STAGES = ('seedling', 'young', 'growing', 'mature')
SHEETS = {
    'oak-tree': 'exec-d2bc4097-3a79-41ff-a4d6-1ddd9168aaf5.png',
    'cherry-blossom-tree': 'exec-ebc09470-bf7f-43fe-b39d-b0ce02ff04de.png',
    'weeping-willow': 'exec-437d2f56-c982-4540-aac7-2dc9abb38777.png',
    'apple-tree': 'exec-be4ea43b-cd45-43b0-a9cb-dd0a91563831.png',
    'maple-tree': 'exec-1fc0e9a3-48c1-4fe0-a0a1-07c586dd1cb7.png',
    'birch-tree': 'exec-05107995-a406-45f6-85ff-05662149cbeb.png',
    'sunflower': 'exec-0d742b1d-fb86-4038-88f5-01ff523b2dbb.png',
    'tulip': 'exec-fed918f6-5c38-4332-bd57-e755bd3340ca.png',
    'rose': 'exec-244b92fe-9fbd-4fd0-9603-70ca8ca3a7b4.png',
    'daisy': 'exec-7e3a7a41-9d4a-4c80-895f-f7b07324a34e.png',
    'lavender': 'exec-d8b05ced-4d1f-4580-acfb-2b9fdbc9f2b0.png',
    'hydrangea': 'exec-39bc744e-611c-4d35-b5d3-482e9c5878e9.png',
    'marigold': 'exec-36747b02-f87e-4141-a409-d2315b91bdb9.png',
    'bluebell': 'exec-46dec1be-6b53-4bec-9066-8b8fb65fbc39.png',
    'peony': 'exec-7183919f-5b9c-4c82-b2af-5a3fffe68dcc.png',
    'poppy': 'exec-9ae62fce-1674-41ae-9058-6a3c2a830dcf.png',
    'azalea': 'exec-8dfa4b16-8d66-4e7d-b669-09c687c57721.png',
    'boxwood': 'exec-94f01363-bcbd-4d32-8a2c-407d41d32b73.png',
    'holly-bush': 'exec-6c42530e-74f3-4788-9d12-7388754623ee.png',
    'blueberry-bush': 'exec-4d6c8637-7b5a-4e24-b2a3-c7d82f592545.png',
    'rhododendron': 'exec-750aabca-3a77-4e9e-815c-df942224fe9f.png',
    'boston-fern': 'exec-87c0ec98-e0fa-4dea-8827-d9da4d264270.png',
    'clover': 'exec-ef3783d5-c389-4208-926e-9e98ab7e2260.png',
    'english-ivy': 'exec-6f849d76-c5bd-48bd-aff8-21431606829e.png',
    'cactus': 'exec-f4f317ed-2b95-461d-9d47-5339c6d75e9c.png',
    'palm-tree': 'exec-446f8409-b661-41ed-bf67-048a466902e6.png',
    'monstera': 'exec-30e8c3b7-e4d6-4130-8708-bcfb748fdf20.png',
    'fly-agaric-mushroom': 'exec-3281f1e8-33af-4c09-93b5-e3b2cd663f9a.png',
    'chanterelle-mushroom': 'exec-b81a3a85-53ca-4fa4-b982-5c8cf873c190.png',
}


def decode_png(path: Path):
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'Not a PNG: {path}')
    pos = 8
    compressed = bytearray()
    width = height = color_type = bit_depth = None
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        kind = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        pos += 12 + length
        if kind == b'IHDR':
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunk)
            if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
                raise ValueError(f'Expected non-interlaced RGB8 or RGBA8 PNG: {path}')
        elif kind == b'IDAT':
            compressed.extend(chunk)
        elif kind == b'IEND':
            break
    raw = zlib.decompress(compressed)
    bpp = 3 if color_type == 2 else 4
    stride = width * bpp
    decoded = bytearray(height * stride)
    src = 0
    for y in range(height):
        filt = raw[src]
        src += 1
        row = bytearray(raw[src:src+stride])
        src += stride
        base = y * stride
        for x in range(stride):
            left = row[x-bpp] if x >= bpp else 0
            up = decoded[base-stride+x] if y else 0
            upper_left = decoded[base-stride+x-bpp] if y and x >= bpp else 0
            if filt == 1:
                row[x] = (row[x] + left) & 255
            elif filt == 2:
                row[x] = (row[x] + up) & 255
            elif filt == 3:
                row[x] = (row[x] + ((left + up) >> 1)) & 255
            elif filt == 4:
                p = left + up - upper_left
                pa, pb, pc = abs(p-left), abs(p-up), abs(p-upper_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else upper_left
                row[x] = (row[x] + predictor) & 255
            elif filt != 0:
                raise ValueError(f'Unsupported PNG filter {filt}')
        decoded[base:base+stride] = row
    if color_type == 6:
        return width, height, decoded
    rgba = bytearray(width * height * 4)
    for i in range(width * height):
        rgba[i*4:i*4+3] = decoded[i*3:i*3+3]
        rgba[i*4+3] = 255
    return width, height, rgba


def encode_png(path: Path, width: int, height: int, pixels: bytearray):
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y*stride:(y+1)*stride])
    output = b'\x89PNG\r\n\x1a\n'
    output += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    output += chunk(b'IDAT', zlib.compress(bytes(raw), 6)) + chunk(b'IEND', b'')
    path.write_bytes(output)


def sprite_bounds(width, height, pixels):
    stride = width * 4
    # Detect the four silhouettes from columns with a meaningful number of
    # opaque pixels. Small gaps inside a silhouette occur around narrow stems;
    # merge those while preserving the broad transparent gaps between stages.
    counts = [sum(pixels[y*stride+x*4+3] > 240 for y in range(height)) for x in range(width)]
    runs = []
    start = None
    for x, count in enumerate(counts + [0]):
        if count > 10 and start is None:
            start = x
        elif count <= 10 and start is not None:
            runs.append([start, x])
            start = None
    merged = []
    for run in runs:
        if merged and run[0] - merged[-1][1] <= 35:
            merged[-1][1] = run[1]
        else:
            merged.append(run)
    if len(merged) != 4:
        raise ValueError(f'Expected four separated sprites, found {len(merged)} x ranges: {merged}')
    output = []
    for slot0, slot1 in merged:
        xs, ys = [], []
        for y in range(height):
            row = y * stride
            for x in range(slot0, slot1):
                if pixels[row+x*4+3] > 240:
                    xs.append(x)
                    ys.append(y)
        if not xs:
            raise ValueError(f'No opaque sprite found in slot {slot0}:{slot1}')
        output.append((max(0, min(xs)-2), max(0, min(ys)-2), min(width, max(xs)+3), min(height, max(ys)+3)))
    return output


def main():
    OUT.mkdir(exist_ok=True)
    for plant, filename in SHEETS.items():
        sheet = GENERATED / filename
        width, height, pixels = decode_png(sheet)
        for stage, (x0, y0, x1, y1) in zip(STAGES, sprite_bounds(width, height, pixels)):
            crop_w, crop_h = x1-x0, y1-y0
            crop = bytearray(crop_w * crop_h * 4)
            for y in range(crop_h):
                source = ((y0+y)*width+x0)*4
                target = y*crop_w*4
                crop[target:target+crop_w*4] = pixels[source:source+crop_w*4]
            encode_png(OUT / f'{plant}-{stage}.png', crop_w, crop_h, crop)
        print(f'{plant}: 4 stages')


if __name__ == '__main__':
    main()
