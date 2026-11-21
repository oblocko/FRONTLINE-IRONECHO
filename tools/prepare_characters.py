#!/usr/bin/env python3
"""Build the game's character assets from the Quaternius CC0 packs.

Inputs (download with tools/fetch_itch_free.py, unzip):
  <ubc>  "Universal Base Characters[Standard]" folder
  <ual1> "Universal Animation Library[Standard]" folder
  <ual2> "Universal Animation Library 2[Standard]" folder
Output: assets/characters/
  body_m.glb, body_f.glb     skinned bodies, textures 1024 px JPEG
  hair_*.glb                 hair / eyebrow meshes (origin at 0, attached to the Head bone at runtime)
  anims.glb                  only the clips the game uses, meshes stripped
Needs PIL and the gltf-transform CLI (GT env var: path to its bin, default `npx gltf-transform`).
Usage: python3 tools/prepare_characters.py <ubc> <ual1> <ual2> [gltf-transform-cmd]
"""
import json, os, shutil, struct, subprocess, sys, tempfile
from PIL import Image

ubc, ual1, ual2 = sys.argv[1:4]
GT = (sys.argv[4] if len(sys.argv) > 4 else 'npx gltf-transform').split()
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'characters')
os.makedirs(OUT, exist_ok=True)
CLIPS1 = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Death01', 'Hit_Chest', 'Hit_Head',
          'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Talking_Loop', 'Interact', 'Pistol_Idle_Loop', 'Fixing_Kneeling']
CLIPS2 = ['OverhandThrow', 'LayToIdle', 'Idle_FoldArms_Loop', 'Idle_No_Loop', 'Hit_Knockback', 'Idle_TalkingPhone_Loop', 'Walk_Carry_Loop']

def gt(*args): subprocess.run(GT + list(args), check=True, stdout=subprocess.DEVNULL)

def shrink_images(gltf_path, size=1024):
    """Resize every image referenced by a .gltf and re-encode as JPEG (normals at higher quality)."""
    d = os.path.dirname(gltf_path); j = json.load(open(gltf_path))
    for im in j.get('images', []):
        src = os.path.join(d, im['uri'])
        if not os.path.exists(src):  # some packs reference "X_png.png" but ship "X.png" (or keep it in Textures/)
            alt = [os.path.join(dp, f) for dp, _, fs in os.walk(ubc) for f in fs if f in (im['uri'], im['uri'].replace('_png.png', '.png'))]
            src = alt[0]
        img = Image.open(src).convert('RGB')
        s = size if 'Superhero' in im['uri'] else size // 2
        if max(img.size) > s: img = img.resize((s, s), Image.LANCZOS)
        name = os.path.splitext(im['uri'])[0] + '.jpg'
        img.save(os.path.join(d, name), quality=92 if 'Normal' in name else 85)
        im['uri'] = name; im['mimeType'] = 'image/jpeg'
    json.dump(j, open(gltf_path, 'w'))

def pack_gltf(src_gltf, out_glb, size=1024):
    with tempfile.TemporaryDirectory() as t:
        for f in os.listdir(os.path.dirname(src_gltf)): shutil.copy(os.path.join(os.path.dirname(src_gltf), f), t)
        g = os.path.join(t, os.path.basename(src_gltf)); shrink_images(g, size)
        gt('copy', g, out_glb); gt('prune', out_glb, out_glb); gt('dedup', out_glb, out_glb)
    print('wrote', out_glb, os.path.getsize(out_glb))

def read_glb(p):
    b = open(p, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl]); rest = b[20 + jl:]
    bl = struct.unpack('<I', rest[0:4])[0]; return j, rest[8:8 + bl]
def write_glb(p, j, binb):
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4); binb += b'\0' * ((4 - len(binb) % 4) % 4)
    with open(p, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(binb), 0x004E4942)); f.write(binb)

def anim_subset(src_glb, keep, out_glb):
    j, binb = read_glb(src_glb)
    for n in j['nodes']: n.pop('mesh', None); n.pop('skin', None)
    j['animations'] = [a for a in j['animations'] if a['name'] in keep]
    missing = set(keep) - {a['name'] for a in j['animations']}
    if missing: print('missing clips', missing)
    j.pop('skins', None)
    write_glb(out_glb, j, binb); gt('prune', out_glb, out_glb); print('anims', out_glb, os.path.getsize(out_glb))

body = os.path.join(ubc, 'Base Characters', 'Godot - UE')
pack_gltf(os.path.join(body, 'Superhero_Male_FullBody.gltf'), os.path.join(OUT, 'body_m.glb'))
pack_gltf(os.path.join(body, 'Superhero_Female_FullBody.gltf'), os.path.join(OUT, 'body_f.glb'))
hair = os.path.join(ubc, 'Hairstyles', 'Origin at 0', 'glTF (Godot)')
for h in ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Beard', 'Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale', 'Eyebrows_Regular', 'Eyebrows_Female']:
    src = os.path.join(hair, h + '.gltf')
    if os.path.exists(src): pack_gltf(src, os.path.join(OUT, h.lower() + '.glb'), 512)
with tempfile.TemporaryDirectory() as t:
    a = os.path.join(t, 'a.glb'); b = os.path.join(t, 'b.glb')
    anim_subset(os.path.join(ual1, 'Unreal-Godot', 'UAL1_Standard.glb'), CLIPS1, a)
    anim_subset(os.path.join(ual2, 'Unreal-Godot', 'UAL2_Standard.glb'), CLIPS2, b)
    gt('merge', a, b, os.path.join(OUT, 'anims.glb')); gt('prune', os.path.join(OUT, 'anims.glb'), os.path.join(OUT, 'anims.glb'))
print('anims.glb', os.path.getsize(os.path.join(OUT, 'anims.glb')))
for lic in [os.path.join(ubc, 'License_Standard.txt')]:
    if os.path.exists(lic): shutil.copy(lic, os.path.join(OUT, 'LICENSE_Quaternius.txt'))
