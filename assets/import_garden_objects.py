from pathlib import Path
import sys
sys.path.insert(0, 'assets')
from slice_plant_sheets import decode_png, encode_png
src = Path('/Users/maxwellwhite/.codex/generated_images/01a1c722-5d0b-72c3-9765-8508da68b38b')
out = Path('assets/garden-objects')
out.mkdir(parents=True, exist_ok=True)
files = {
 'wooden-bench':'exec-3afa0f89-c663-4b08-829a-d648d782f48e.png',
 'stone-path':'exec-fc1525d8-9015-41d9-ae5a-4dc3e4a80514.png',
 'gravel-path':'exec-4231d3c1-78ab-46f2-afb2-ce6b21002d3d.png',
 'dirt-path':'exec-b70777b4-3696-432b-abb5-84761589c3cc.png',
 'cobblestone-path':'exec-b0f3d2fc-5c69-48fb-a5ee-7092f19d213e.png',
 'stepping-stones':'exec-1961daf1-dc00-488f-8352-0f6ecaca059e.png',
 'small-rock':'exec-2e05f7c9-4781-41f5-9ea4-638d4834f954.png',
 'large-boulder':'exec-7d9d4182-7c92-491a-bc9e-df03fc01a43a.png',
 'mossy-rock':'exec-633db17f-9821-49c4-88ac-a3a046e2cc38.png',
 'fallen-log':'exec-bd03534f-3f59-499a-9d16-6b8d95ef1619.png',
 'tree-stump':'exec-c507d3aa-0370-4ea3-852e-1011bc94dcb2.png',
 'wooden-fence':'exec-01595bca-623f-444c-95cd-d62997a27b61.png',
 'stone-wall':'exec-277178ad-63d0-4301-86c3-0b1c1224633e.png',
 'wooden-archway':'exec-8756ba08-3048-4009-9726-98314764d004.png',
 'trellis':'exec-c13d2994-1c0a-45a8-bc98-e829d4dc948d.png',
 'birdbath':'exec-a85d628e-7e73-42a4-9b79-fe565dbb8035.png',
 'birdhouse':'exec-ce61cb93-e9e8-4351-bd66-1297a3dd19e1.png',
 'water-fountain':'exec-1575e6fb-bf07-48f9-a698-8e22ce42cf3c.png',
 'garden-lantern':'exec-884cbe5c-5a22-4002-97cb-e99b1b51f2d0.png',
 'flower-pot':'exec-562ee97c-acfa-4fb0-9642-742cd7b506d0.png',
}
paths = {'stone-path','gravel-path','dirt-path','cobblestone-path','stepping-stones'}
for name, filename in files.items():
    w,h,pixels = decode_png(src/filename)
    if name not in paths:
        stride=w*4
        bounds=[(x,y) for y in range(h) for x in range(w) if pixels[(y*w+x)*4+3] > 200]
        if not bounds: raise ValueError(f'No visible content for {name}')
        xs=[xy[0] for xy in bounds]; ys=[xy[1] for xy in bounds]
        x0=max(0,min(xs)-6); x1=min(w,max(xs)+7)
        y0=max(0,min(ys)-6); y1=min(h,max(ys)+7)
        cw,ch=x1-x0,y1-y0
        crop=bytearray(cw*ch*4)
        for y in range(ch): crop[y*cw*4:(y+1)*cw*4]=pixels[((y0+y)*w+x0)*4:((y0+y)*w+x1)*4]
        # Remove the soft generated glow so the alpha edges stay crisp at pixel scale.
        for i in range(3, len(crop), 4):
            if crop[i] < 160: crop[i] = 0
        encode_png(out/f'{name}.png',cw,ch,crop)
    else:
        encode_png(out/f'{name}.png',w,h,pixels)
    print(name,w,h)
