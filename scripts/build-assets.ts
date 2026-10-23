// Builds the runtime assets (spec §5, plan Task 7): catalog.json, parts.json, parts.bin, version.txt.
// Usage: `npm run assets` (writes public/assets/). Fails only on malformed input files.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLACEHOLDER_BOX } from '../src/core/approx';
import type {
  Catalog,
  Category,
  Conventions,
  Manifest,
  PartDef,
  PropMeta,
  SocketRole,
  Vec3,
} from '../src/core/catalog-types';
import { applySocketGeometry, parseSocketGeometry } from '../src/core/socket-geometry';
import type { CFrame12, RGB, SocketId } from '../src/core/types';
import { buildSockets, countPairs, workshopFrames, type RawPart } from './lib/catalog';
import { parseMtl } from './lib/mtl';
import { materialBase, subPartName } from './lib/names';
import { parseObj, type ObjMesh } from './lib/obj';
import { groupsOf, packMeshes, type PackInput } from './lib/pack';

const DEFAULT_CONVENTIONS: Conventions = {
  mating: 'rx180',
  orientationOrder: 'XYZ',
  orientationOnPoints: true,
};
const UNPAINTABLE = /^(Input|Output|Glass|Screw|Light)/;
const GREY: RGB = [128, 128, 128];
const ORIENTATIONS = ['OrientationX', 'OrientationY', 'OrientationZ'];

interface MeshGroupInfo {
  subPart: string;
  color: RGB;
  triangles: number;
  min: Vec3;
  max: Vec3;
}

function groupInfo(mesh: ObjMesh, type: string, kd: Record<string, [number, number, number]>) {
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
      subPart: g.material ? subPartName(g.material, type) : type,
      color: c ? [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)] : GREY,
      triangles: g.count / 3,
      min: min as unknown as Vec3,
      max: max as unknown as Vec3,
    };
  });
}

/** Index of the group the `RGB` prop recolors (rule 6), or -1 for unpaintable parts. */
function paintableGroup(groups: readonly MeshGroupInfo[], override: string | undefined): number {
  if (override !== undefined) return groups.findIndex((g) => g.subPart === override);
  const largest = (pool: readonly MeshGroupInfo[]) =>
    pool.reduce<MeshGroupInfo | null>((a, g) => (!a || g.triangles > a.triangles ? g : a), null);
  // Parts whose every group is excluded (e.g. a lamp made only of "Light") paint their largest group.
  const pick = largest(groups.filter((g) => !UNPAINTABLE.test(g.subPart))) ?? largest(groups);
  return pick ? groups.indexOf(pick) : -1;
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
  const c = JSON.parse(readFileSync(path, 'utf8')) as Partial<Conventions>;
  const ok =
    (c.mating === 'rx180' || c.mating === 'rz180') &&
    ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'].includes(String(c.orientationOrder)) &&
    typeof c.orientationOnPoints === 'boolean';
  if (!ok) throw new Error(`${path}: malformed conventions`);
  return c as Conventions;
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

  const raw = readJson<{ parts: Record<string, RawPart> }>('data/part_catalog.json').parts;
  const categories = readJson<Record<string, Category>>('data/curation/categories.json');
  const rolesFix = readJson<Record<string, Record<SocketId, SocketRole>>>(
    'data/curation/roles-fix.json',
  );
  const propMeta = readJson<Record<string, PropMeta>>('data/curation/prop-meta.json');
  const paintGroups = readJson<Record<string, string>>('data/curation/paint-groups.json');
  const partNames = readJson<Record<string, string>>('data/curation/part-names.json');
  const frequency = readJson<{ part_frequency: Record<string, number> }>(
    'data/corpus_stats.json',
  ).part_frequency;
  const workshop = workshopFrames(
    readText('vendor/grambys-workshop/Scripts/GrambyObjects/Part/Part.tscn'),
  );

  const parts: Record<string, PartDef> = {};
  const packInputs: PackInput[] = [];
  for (const type of Object.keys(raw)) {
    const r = raw[type];
    const paintable = Object.hasOwn(r.props ?? {}, 'RGB');
    let mesh: PartDef['mesh'] = null;
    let subParts: Record<string, { cframe: CFrame12; approx: boolean }> = {};
    let mainPartName = partNames[type] ?? type;
    if (r.mesh) {
      const obj = parseObj(readText(r.mesh.obj));
      const mtlPath = `meshes/workshop/${type}/${type}.mtl`;
      const kd = existsSync(at(mtlPath)) ? parseMtl(readText(mtlPath)) : {};
      const groups = groupInfo(obj, type, kd);
      const paint = paintable ? paintableGroup(groups, paintGroups[type]) : -1;
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
        partNames[type] ??
        (groups.some((g) => g.subPart === type) ? type : (largest?.subPart ?? type));
      mesh = { id: packInputs.length, min: obj.min, max: obj.max };
      packInputs.push({
        type,
        mesh: obj,
        groups: groups.map((g, i) => ({
          subPart: g.subPart,
          color: g.color,
          paintable: i === paint,
        })),
      });
    } else {
      subParts = {};
    }
    const meta = readMeshMeta(at(`meshes/rtg-format/${type}/${type}.json`));
    const s = buildSockets(
      r,
      rolesFix[type],
      mesh ?? PLACEHOLDER_BOX,
      type === 'Part' ? workshop : null,
    );
    parts[type] = {
      type,
      category: categories[type] ?? 'Fun & Misc',
      tooltip: meta,
      paintable,
      corpusCount: frequency[type] ?? 0,
      ...s,
      pieces: r.pieces ?? null,
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
