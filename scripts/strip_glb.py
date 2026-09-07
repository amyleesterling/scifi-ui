"""Strip images, textures, materials and skins from a GLB, keeping only the
geometry the accessors reference, and rebuild the binary chunk."""
import struct, json, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src, 'rb') as f:
    magic, ver, length = struct.unpack('<III', f.read(12))
    clen, ctype = struct.unpack('<II', f.read(8)); j = json.loads(f.read(clen))
    blen, btype = struct.unpack('<II', f.read(8)); bin_ = f.read(blen)
for k in ['images', 'textures', 'materials', 'samplers', 'skins', 'animations']:
    j.pop(k, None)
for m in j.get('meshes', []):
    for p in m.get('primitives', []):
        p.pop('material', None)
        for a in list(p.get('attributes', {}).keys()):
            if a.startswith('TEXCOORD') or a.startswith('JOINTS') or a.startswith('WEIGHTS') or a.startswith('COLOR'):
                del p['attributes'][a]
for n in j.get('nodes', []):
    n.pop('skin', None)
used = set()
for a in j.get('accessors', []):
    if 'bufferView' in a: used.add(a['bufferView'])
old_bvs = j['bufferViews']; new_bvs = []; remap = {}; out = bytearray()
for i, bv in enumerate(old_bvs):
    if i not in used: continue
    off = bv.get('byteOffset', 0); ln = bv['byteLength']
    while len(out) % 4: out.append(0)
    nb = dict(bv); nb['byteOffset'] = len(out); nb['buffer'] = 0
    nb.pop('target', None)
    out += bin_[off:off + ln]
    remap[i] = len(new_bvs); new_bvs.append(nb)
for a in j['accessors']:
    if 'bufferView' in a: a['bufferView'] = remap[a['bufferView']]
j['bufferViews'] = new_bvs; j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(out) % 4: out.append(0)
total = 12 + 8 + len(js) + 8 + len(out)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print(dst, 'MB=%.2f' % (total / 1e6))
