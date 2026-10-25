// Builds the runtime assets (spec §5, plan Task 7): catalog.json, parts.json, parts.bin, version.txt.
// Usage: `npm run assets` (writes public/assets/). Fails only on malformed input files.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLACEHOLDER_BOX } from '../src/core/approx';
import type {
  BodyDef,
  Catalog,
  Category,
  Conventions,
  Manifest,
  PartDef,
  PropMeta,
  SocketDef,
  SocketRole,
  Vec3,
} from '../src/core/catalog-types';
import { splitBodies } from '../src/core/mesh-bodies';
import { applySocketGeometry, parseSocketGeometry } from '../src/core/socket-geometry';
import type { CFrame12, RGB, SocketId } from '../src/core/types';
import { buildSockets, countPairs, workshopFrames, type RawPart } from './lib/catalog';
import { parseMtl, parseMtlOpacities, parseMtlTextures } from './lib/mtl';
import { materialBase, subPartName } from './lib/names';
import { parseObj, type ObjMesh } from './lib/obj';
import { groupsOf, packMeshes, type PackInput } from './lib/pack';
import { averageColor } from './lib/png';
import { parseRuntimeParts, runtimeRawPart, type RuntimePart } from './lib/runtime-parts';

const DEFAULT_CONVENTIONS: Conventions = {
  mating: 'rx180',
  orientationOrder: 'ZYX',
  orientationOnPoints: true,
  orientationPivot: 'part',
  orientationSigns: [-1, -1, -1],
};
const UNPAINTABLE = /^(Input|Output|Glass|Screw|Light)/;
const GREY: RGB = [128, 128, 128];
const ORIENTATIONS = ['OrientationX', 'OrientationY', 'OrientationZ'];
/** A socket facing −Y (rows of Rx(180°)) or +Y, at a point. */
const DOWN = [1, 0, 0, 0, -1, 0, 0, 0, -1] as const;
const UP = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

type BodyCuration = readonly { name: string; sockets: SocketId[]; anchor: Vec3; pivot?: Vec3 }[];

function nativeBodies(bodies: BodyCuration, native: RuntimePart): BodyCuration {
  return bodies.map((body) => {
    const paths = body.sockets.map((id) => native.sockets[id]?.parentPath);
    if (new Set(paths).size !== 1 || paths.some((path) => !path))
      throw new Error(`Missing native body frame: ${body.name}`);
    const frame = native.subParts[paths[0]];
    const origin = frame.slice(0, 3) as unknown as Vec3;
    return { ...body, anchor: origin, pivot: origin };
  });
}

/**
 * A multi-piece part's bodies (D-F3): pivots from the mesh pieces each anchor picks, and frames for
 * uncaptured body sockets on the body's bottom centre (child, −Y) or top centre (parent, +Y), the
 * pattern the user's Button capture shows. Those frames stay approximate.
 */
export function applyBodies(
  sockets: Record<SocketId, SocketDef>,
  mesh: { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> },
  bodies: BodyCuration,
): { bodies: BodyDef[]; pieces: Record<SocketId, string> } {
  const split = splitBodies(
    mesh.positions,
    mesh.indices,
    bodies.map((b) => b.anchor),
  );
  const pieces: Record<SocketId, string> = {};
  const out = bodies.map((b, i): BodyDef => {
    const { min, max } = split.boxes[i];
    const c = [0, 1, 2].map((a) => Number(((min[a] + max[a]) / 2).toFixed(4)) + 0);
    for (const id of b.sockets) {
      const s = sockets[id];
      if (!s) continue;
      pieces[id] = b.name;
      const y = s.side === 'parent' ? max[1] : min[1];
      const frame =
        s.frameSource === 'approx'
          ? ([
              c[0],
              Number(y.toFixed(4)) + 0,
              c[2],
              ...(s.side === 'parent' ? UP : DOWN),
            ] as CFrame12)
          : s.frame;
      sockets[id] = { ...s, piece: b.name, frame };
    }
    return {
      name: b.name,
      sockets: b.sockets,
      anchor: b.anchor,
      pivot: b.pivot ?? (c as unknown as Vec3),
    };
  });
  return { bodies: out, pieces };
}

interface MeshGroupInfo {
  subPart: string;
  color: RGB;
  triangles: number;
  min: Vec3;
  max: Vec3;
}

function groupInfo(
  mesh: ObjMesh,
  type: string,
  kd: Record<string, [number, number, number]>,
  native?: RuntimePart,
) {
  return groupsOf(mesh).map((g): MeshGroupInfo => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = g.start; k < g.start + g.count; k++) {
      const v = mesh.indices[k];
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], mesh.positions[3 * v + a]);
        max[a] = Math.max(max[a], mesh.positions[3 * v + a]);
      }
    }
    const c = kd[materialBase(g.material)];
    return {
      subPart: native?.groups[g.material] ?? (g.material ? subPartName(g.material, type) : type),
      color: c ? [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)] : GREY,
      triangles: g.count / 3,
      min: min as unknown as Vec3,
      max: max as unknown as Vec3,
    };
  });
}

type PaintPiece = Pick<MeshGroupInfo, 'subPart' | 'triangles'>;

/**
 * Indices of the groups the `RGB` prop recolors (rule 6): the pieces `paint-groups.json` lists for the
 * type, else its largest group outside UNPAINTABLE.
 */
export function paintedGroups(
  groups: readonly PaintPiece[],
  type: string,
  curated: readonly string[] | undefined,
): Set<number> {
  if (curated) {
    for (const name of curated)
      if (!groups.some((g) => g.subPart === name))
        throw new Error(`data/curation/paint-groups.json: ${type} has no piece ${name}`);
    return new Set(groups.flatMap((g, i) => (curated.includes(g.subPart) ? [i] : [])));
  }
  const largest = (pool: readonly PaintPiece[]) =>
    pool.reduce<PaintPiece | null>((a, g) => (!a || g.triangles > a.triangles ? g : a), null);
  // Parts whose every group is excluded (e.g. a lamp made only of "Light") paint their largest group.
  const pick = largest(groups.filter((g) => !UNPAINTABLE.test(g.subPart))) ?? largest(groups);
  return new Set(pick ? [groups.indexOf(pick)] : []);
}

/**
 * A Spinner's output (MountType Bearing) comes captured as the game's hinge attachment, its spin axis
 * (X) out of the part. Turned by Rz(−90°) so +Y points out, the catalog's convention, as the Servo's
 * output is captured: a wheel on it then stands upright, as in game (user, 2026-10-24).
 */
function hingeOutward([x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22]: CFrame12): CFrame12 {
  return [x, y, z, -r01, r00, r02, -r11, r10, r12, -r21, r20, r22];
}

function outsideBy(p: CFrame12, min: Vec3, max: Vec3): number {
  let d2 = 0;
  for (let a = 0; a < 3; a++) {
    const d = Math.max(min[a] - p[a], 0, p[a] - max[a]);
    d2 += d * d;
  }
  return Math.sqrt(d2);
}

function readConventions(path: string): Conventions {
  if (!existsSync(path)) return DEFAULT_CONVENTIONS;
  const c = {
    orientationPivot: DEFAULT_CONVENTIONS.orientationPivot,
    orientationSigns: DEFAULT_CONVENTIONS.orientationSigns,
    ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<Conventions>),
  };
  const signs: unknown = c.orientationSigns;
  const ok =
    (c.mating === 'rx180' || c.mating === 'rz180') &&
    ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'].includes(String(c.orientationOrder)) &&
    typeof c.orientationOnPoints === 'boolean' &&
    (c.orientationPivot === 'part' || c.orientationPivot === 'socket') &&
    Array.isArray(signs) &&
    signs.length === 3 &&
    signs.every((s) => s === 1 || s === -1);
  if (!ok) throw new Error(`${path}: malformed conventions`);
  return c as Conventions;
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * `Kd` per material, times the average colour of its texture where it has one: the game tints a
 * textured group by its texture (a white `Kd` with a dark tread texture is a dark tire).
 */
function tinted(mtlPath: string, text: string): Record<string, [number, number, number]> {
  const kd = parseMtl(text);
  for (const [material, file] of Object.entries(parseMtlTextures(text))) {
    const texture = join(dirname(mtlPath), file);
    if (!Object.hasOwn(kd, material) || !existsSync(texture)) continue;
    const avg = averageColor(readFileSync(texture));
    if (avg)
      kd[material] = kd[material].map((v, k) => v * linear(avg[k])) as [number, number, number];
  }
  return kd;
}

/** The corpus lists only the orientations real builds used; every type gets all three. */
export function withOrientation(keys: readonly string[]): string[] {
  return [...keys, ...ORIENTATIONS.filter((k) => !keys.includes(k))];
}

export async function buildAssets(opts: {
  root: string;
  outDir: string | null;
}): Promise<{ catalog: Catalog; manifest: Manifest; bin: Uint8Array<ArrayBuffer> }> {
  const at = (p: string) => join(opts.root, p);
  const readText = (p: string) => readFileSync(at(p), 'utf8');
  const readJson = <T>(p: string): T => JSON.parse(readText(p)) as T;

  const community = readJson<{ parts: Record<string, RawPart> }>('data/part_catalog.json').parts;
  const runtimePath = at('data/runtime_parts.json');
  const runtime = existsSync(runtimePath)
    ? parseRuntimeParts(JSON.parse(readFileSync(runtimePath, 'utf8')))
    : null;
  const raw = { ...community };
  for (const [name, native] of Object.entries(runtime?.parts ?? {}))
    raw[name] = runtimeRawPart(community[name], native);
  const categories = readJson<Record<string, Category>>('data/curation/categories.json');
  const rolesFix = readJson<Record<string, Record<SocketId, SocketRole>>>(
    'data/curation/roles-fix.json',
  );
  const propMeta = readJson<Record<string, PropMeta>>('data/curation/prop-meta.json');
  // The pieces each listed type paints; [] for parts the game does not keep paint on.
  const paintGroups = readJson<Record<string, string[]>>('data/curation/paint-groups.json');
  for (const [type, names] of Object.entries(paintGroups))
    if (!Array.isArray(names) || !names.every((n) => typeof n === 'string'))
      throw new Error(`data/curation/paint-groups.json: ${type} must list piece names`);
  const bodyCuration = readJson<Record<string, BodyCuration>>('data/curation/bodies.json');
  const partNames = readJson<Record<string, string>>('data/curation/part-names.json');
  const frequency = readJson<{ part_frequency: Record<string, number> }>(
    'data/corpus_stats.json',
  ).part_frequency;
  const workshop = workshopFrames(
    readText('vendor/grambys-workshop/Scripts/GrambyObjects/Part/Part.tscn'),
  );

  const parts: Record<string, PartDef> = {};
  const packInputs: PackInput[] = [];
  const textureFiles = new Map<string, string>();
  for (const type of Object.keys(raw)) {
    const r = raw[type];
    const native = runtime?.parts[type];
    const curatedPaint = Object.hasOwn(paintGroups, type) ? paintGroups[type] : undefined;
    const paintable = Object.hasOwn(r.props ?? {}, 'RGB') && curatedPaint?.length !== 0;
    let mesh: PartDef['mesh'] = null;
    let objMesh: ObjMesh | null = null;
    let subParts: Record<string, { cframe: CFrame12; approx: boolean }> = {};
    let mainPartName = partNames[type] ?? type;
    if (r.mesh) {
      const obj = parseObj(readText(r.mesh.obj));
      objMesh = obj;
      const mtlPath = native?.mtl ?? `meshes/workshop/${type}/${type}.mtl`;
      const mtl = existsSync(at(mtlPath)) ? readText(mtlPath) : '';
      const kd = native ? parseMtl(mtl) : tinted(at(mtlPath), mtl);
      // Native MTL diffuse colors are captured sRGB; the vertex shader consumes linear RGB.
      if (native)
        for (const [material, color] of Object.entries(kd))
          kd[material] = color.map(linear) as [number, number, number];
      const textures = native ? parseMtlTextures(mtl) : {};
      const opacities = parseMtlOpacities(mtl);
      const groups = groupInfo(obj, type, kd, native);
      const paint = paintable ? paintedGroups(groups, type, curatedPaint) : new Set<number>();
      for (const g of groups) {
        if (subParts[g.subPart]) continue;
        const same = groups.filter((x) => x.subPart === g.subPart);
        const lo = [0, 1, 2].map((a) => Math.min(...same.map((x) => x.min[a])));
        const hi = [0, 1, 2].map((a) => Math.max(...same.map((x) => x.max[a])));
        const c = lo.map((v, a) => (v + hi[a]) / 2 + 0);
        subParts[g.subPart] = {
          cframe: [c[0], c[1], c[2], 1, 0, 0, 0, 1, 0, 0, 0, 1],
          approx: true,
        };
      }
      const largest = groups.reduce((a, g) => (g.triangles > a.triangles ? g : a), groups[0]);
      mainPartName =
        native?.primaryPart ??
        partNames[type] ??
        (groups.some((g) => g.subPart === type) ? type : (largest?.subPart ?? type));
      mesh = { id: packInputs.length, min: obj.min, max: obj.max };
      packInputs.push({
        type,
        mesh: obj,
        groups: groups.map((g, i) => {
          const material = groupsOf(obj)[i].material;
          const file = textures[material];
          let texture: string | undefined;
          if (file) {
            const source = resolve(dirname(at(mtlPath)), file);
            const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
            texture = `textures/${hash}.png`;
            textureFiles.set(texture, source);
          }
          return {
            subPart: g.subPart,
            color: g.color,
            paintable: paint.has(i),
            ...(texture ? { texture } : {}),
            ...(native?.textureAlphaBlend?.[material] ? { textureAlphaBlend: true } : {}),
            ...(opacities[material] !== undefined ? { opacity: opacities[material] } : {}),
          };
        }),
      });
    } else {
      subParts = {};
    }
    const meta = readMeshMeta(at(`meshes/rtg-format/${type}/${type}.json`));
    const s = buildSockets(
      r,
      rolesFix[type],
      mesh ?? PLACEHOLDER_BOX,
      !native && type === 'Part' ? workshop : null,
    );
    if (native) {
      for (const [id, socket] of Object.entries(native.sockets)) {
        const attributes = socket.attributes ?? {};
        s.sockets[id] = {
          ...s.sockets[id],
          frame:
            socket.side === 'parent' && attributes.MountType === 'Bearing'
              ? hingeOutward(socket.cframe)
              : socket.cframe,
          frameSource: 'captured',
          ...(socket.childCFrame ? { childFrame: socket.childCFrame } : {}),
          ...(socket.side === 'child' && Object.hasOwn(attributes, 'HingeType')
            ? { hinge: true }
            : {}),
          ...(socket.side === 'parent' && typeof attributes.MountType === 'string'
            ? { mountType: attributes.MountType }
            : {}),
        };
      }
      subParts = Object.fromEntries(
        Object.entries(native.subParts).map(([name, cframe]) => [name, { cframe, approx: false }]),
      );
    }
    const originalBodies =
      bodyCuration[type] ?? (native && type === 'Splitter' ? bodyCuration.Splitter_4 : undefined);
    const curated =
      originalBodies && native ? nativeBodies(originalBodies, native) : originalBodies;
    const split = curated && objMesh ? applyBodies(s.sockets, objMesh, curated) : null;
    parts[type] = {
      type,
      category: categories[type] ?? 'Fun & Misc',
      tooltip: meta,
      paintable,
      corpusCount: frequency[type] ?? 0,
      ...s,
      pieces: split ? { ...r.pieces, ...split.pieces } : (r.pieces ?? null),
      bodies: split?.bodies ?? null,
      mainPartName,
      subParts,
      props: withOrientation(Object.keys(r.props ?? {})),
      mesh,
    };
  }

  let catalog: Catalog = {
    version: '',
    parts,
    pairs: countPairs(readText('data/corpus/wiki_codes.txt').split(/\r?\n/)),
    propMeta,
    conventions: readConventions(at('data/conventions.json')),
    ...(runtime ? { socketGeometrySpace: runtime.meshCoordinateSpace } : {}),
  };
  const capturedPath = at('data/socket_geometry.json');
  if (existsSync(capturedPath)) {
    const parsed = parseSocketGeometry(JSON.parse(readFileSync(capturedPath, 'utf8')));
    if (!parsed.ok) throw new Error(`data/socket_geometry.json: ${parsed.error}`);
    catalog = applySocketGeometry(catalog, parsed.file);
  }

  const packed = packMeshes(packInputs);
  const version = createHash('sha256')
    .update(JSON.stringify(catalog))
    .update(packed.bin)
    .update(JSON.stringify(packed.meshes))
    .digest('hex')
    .slice(0, 12);
  catalog = { ...catalog, version };
  const manifest: Manifest = { version, sections: packed.sections, meshes: packed.meshes };

  if (opts.outDir !== null) {
    const out = isAbsolute(opts.outDir) ? opts.outDir : at(opts.outDir);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'catalog.json'), JSON.stringify(catalog));
    writeFileSync(join(out, 'parts.json'), JSON.stringify(manifest));
    writeFileSync(join(out, 'parts.bin'), packed.bin);
    writeFileSync(join(out, 'version.txt'), version + '\n');
    if (textureFiles.size) mkdirSync(join(out, 'textures'), { recursive: true });
    for (const [file, source] of textureFiles) copyFileSync(source, join(out, file));
    for (const line of socketReport(catalog)) console.log(line);
    console.log(
      `assets: wrote ${out} (version ${version}, ${packed.bin.byteLength} bytes of mesh)`,
    );
  }
  return { catalog, manifest, bin: packed.bin };
}

function readMeshMeta(path: string): string | null {
  if (!existsSync(path)) return null;
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const first = Array.isArray(json) ? json[0] : json;
  const tip = (first as { Tooltip?: unknown } | undefined)?.Tooltip;
  return typeof tip === 'string' && tip.trim() !== '' ? tip : null;
}

/** Rule 13: frame-source counts and frames more than 0.25 studs outside their part's bbox. */
export function socketReport(catalog: Catalog): string[] {
  const counts = { captured: 0, workshop: 0, approx: 0 };
  const outside: string[] = [];
  for (const def of Object.values(catalog.parts)) {
    const box = def.mesh ?? PLACEHOLDER_BOX;
    for (const [id, s] of Object.entries(def.sockets)) {
      counts[s.frameSource]++;
      const d = outsideBy(s.frame, box.min, box.max);
      if (d > 0.25) outside.push(`  ${def.type}.${id} is ${d.toFixed(2)} studs outside its bbox`);
    }
  }
  return [
    `sockets: ${counts.captured} captured, ${counts.workshop} workshop, ${counts.approx} approx`,
    ...outside,
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildAssets({ root: process.cwd(), outDir: 'public/assets' });
}
