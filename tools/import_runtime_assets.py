"""Copy a reviewed runtime capture into the editor without changing legacy research.

Usage: python tools/import_runtime_assets.py <capture-directory>
Only complete templates are imported. Native frames and material group names
are recorded in data/runtime_parts.json; OBJ/MTL/PNG bytes remain unchanged.
Pillow (already available in the extraction environment) inspects image alpha.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import sys
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SPACE = 'roblox-primary-part-v1'


def main(capture):
    capture = Path(capture).resolve()
    manifest = json.loads((capture / 'parts/manifest.json').read_text(encoding='utf-8'))
    raw = json.loads((capture / 'runtime-sockets.raw.json').read_text(encoding='utf-8'))
    texture_inventory = json.loads((capture / 'texture-manifest.json').read_text(encoding='utf-8'))
    destination = ROOT / 'meshes/runtime'
    (destination / 'parts').mkdir(parents=True, exist_ok=True)
    (destination / 'assets').mkdir(exist_ok=True)
    parts = {}
    files = {}

    def copy_file(source, target):
        source, target = source.resolve(), target.resolve()
        if not source.is_relative_to(capture) or not target.is_relative_to(destination):
            raise ValueError('asset path escapes capture/import directory')
        shutil.copyfile(source, target)
        files[target.relative_to(ROOT).as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()

    for name, entry in manifest['entries'].items():
        if entry['status'] != 'geometry-complete':
            continue
        meta = json.loads((capture / 'parts' / entry['metadata']).read_text(encoding='utf-8'))
        model = raw['parts'][name]
        copy_file(capture / 'parts' / meta['obj'], destination / 'parts' / meta['obj'])
        copy_file(capture / 'parts' / meta['mtl'], destination / 'parts' / meta['mtl'])
        duplicate_ids = {str(int(float(s['attributes']['Id']))) for s in model['unmappedSockets']}
        subparts = {}
        counts = Counter(p['name'] for p in model['baseParts'].values())
        for path, p in meta['subparts'].items():
            subparts[path] = p['primaryPartLocalCFrame']
            leaf = model['baseParts'][path]['name']
            if counts[leaf] == 1:
                subparts[leaf] = p['primaryPartLocalCFrame']
        groups = {}
        for index, (path, p) in enumerate((x for x in meta['subparts'].items() if x[1]['status'] == 'exported')):
            groups[f'material_{index}'] = model['baseParts'][path]['name']
        sockets = {
            sid: {'side': 'child' if s['name'] == 'BallAttachment' else 'parent',
                  'cframe': s['outwardYPrimaryPartLocalCFrame'],
                  'parentPath': s['parentPath'], 'attributes': s['attributes']}
            for sid, s in model['sockets'].items() if sid not in duplicate_ids
        }
        parts[name] = {
            'obj': f'meshes/runtime/parts/{meta["obj"]}',
            'mtl': f'meshes/runtime/parts/{meta["mtl"]}',
            'primaryPart': model['primaryPart'], 'subParts': subparts,
            'groups': groups, 'sockets': sockets, 'blockedSockets': sorted(duplicate_ids),
            'textureAlphaBlend': {},
            'warnings': meta['warnings'],
        }

    # Preserve every recovered requested image, including currently unsupported
    # decal/PBR maps. Only actual map_Kd references are used by the asset build.
    for texture in texture_inventory['textures']:
        if texture['status'] == 'recovered':
            source = capture / texture['file']
            if hashlib.sha256(source.read_bytes()).hexdigest() != texture['sha256']:
                raise ValueError(f'texture checksum mismatch: {source.name}')
            copy_file(source, destination / 'assets' / source.name)
    # A deduplicated map_Kd can choose another identical cache filename.
    for part in parts.values():
        material = None
        for line in (ROOT / part['mtl']).read_text(encoding='utf-8').splitlines():
            if line.startswith('newmtl '):
                material = line[7:].strip()
            elif line.startswith('map_Kd '):
                relative = line[7:].strip()
                copy_file(capture / 'parts' / relative, (ROOT / part['mtl']).parent / relative)
                with Image.open(capture / 'parts' / relative) as image:
                    alpha = image.convert('RGBA').getchannel('A').histogram()
                if sum(alpha[1:255]):
                    part['textureAlphaBlend'][material] = True
    data = {
        'format': 'grambyedit-runtime-parts', 'version': 1,
        'captured': raw['captured'], 'meshCoordinateSpace': SPACE,
        'source': 'GrambyConnect/captures/runtime-2026-10-24',
        'excludedPartialTemplates': [n for n, e in manifest['entries'].items() if e['status'] != 'geometry-complete'],
        'unavailableTextureIds': [t['assetId'] for t in texture_inventory['textures'] if t['status'] != 'recovered'],
        'parts': parts, 'filesSha256': files,
    }
    (ROOT / 'data/runtime_parts.json').write_text(json.dumps(data, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(f'Imported {len(parts)} templates, {len(files)} local asset files')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
