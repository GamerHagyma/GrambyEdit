// Reproducible native GasCap feasibility artifacts, outside the shipped editor.
// Run: node --import tsx scripts/curved-surface-fixtures.ts [output-directory]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Vector3 } from 'three';
import { capSize, type SurfaceColor } from '../src/core/surfaces/build';
import { buildCurvedSubDoc, curvedPoseValidator } from '../src/core/surfaces/build-curved';
import { tileCurved } from '../src/core/surfaces/curved-tiling';
import { evaluatePatch } from '../src/core/surfaces/patches';
import { computePoses } from '../src/core/pose';
import { parseShareText, toShareCode } from '../src/core/share';
import type { Doc } from '../src/core/types';
import { buildAssets } from './build-assets';
import { parseObj } from './lib/obj';
import { SURFACE_FIXTURES, surfaceFixture, translateFixture } from './lib/surface-fixtures';

const out = resolve(process.argv[2] ?? '.claude/profile-surface-fixtures');
mkdirSync(out, { recursive: true });
const { catalog: cat } = await buildAssets({ root: '.', outDir: null });
const cap = capSize(cat)!;
const mesh = parseObj(readFileSync('meshes/runtime/parts/GasCap.obj', 'utf8'));
// This experiment's solid-volume checks are valid for the captured box mesh.
for (let i = 0; i < mesh.positions.length; i++) {
  const axis = i % 3,
    n = mesh.positions[i];
  if (Math.min(Math.abs(n - mesh.min[axis]), Math.abs(n - mesh.max[axis])) > 1e-7)
    throw new Error('GasCap mesh is no longer a box; update the native solid coverage check.');
}

function image(doc: Doc, name: string): string {
  const poses = computePoses(doc, cat, cat.conventions).world;
  const eye = new Vector3(0.8, 0.85, 1).normalize();
  const right = new Vector3(eye.z, 0, -eye.x).normalize(),
    up = eye.clone().cross(right);
  const triangles: { points: Vector3[]; depth: number; rgb: readonly number[] }[] = [];
  const all: Vector3[] = [];
  for (const [id, pose] of poses) {
    if (doc.parts.get(id)?.type !== 'GasCap') continue;
    const rgb = doc.parts.get(id)!.props.RGB as readonly number[] | undefined;
    const positions: Vector3[] = [];
    for (let i = 0; i < mesh.positions.length; i += 3)
      positions.push(
        new Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]).applyMatrix4(
          pose,
        ),
      );
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const points = [0, 1, 2].map((k) => positions[mesh.indices[i + k]]);
      const normal = points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]))
        .normalize();
      const shade = 0.55 + 0.45 * Math.abs(normal.dot(new Vector3(0.4, 1, 0.6).normalize()));
      triangles.push({
        points,
        depth: points.reduce((s, p) => s + p.dot(eye), 0) / 3,
        rgb: (rgb ?? [160, 163, 173]).map((n) => Math.round(n * shade)),
      });
      all.push(...points);
    }
  }
  const coords = all.map((p) => [p.dot(right), p.dot(up)]);
  const minX = Math.min(...coords.map((p) => p[0])),
    maxX = Math.max(...coords.map((p) => p[0]));
  const minY = Math.min(...coords.map((p) => p[1])),
    maxY = Math.max(...coords.map((p) => p[1]));
  const scale = Math.min(440 / (maxX - minX), 250 / (maxY - minY));
  const project = (p: Vector3) =>
    `${(20 + (p.dot(right) - minX) * scale).toFixed(2)},${(275 - (p.dot(up) - minY) * scale).toFixed(2)}`;
  const shapes = triangles
    .sort((a, b) => a.depth - b.depth)
    .map(
      (t) =>
        `<polygon points="${t.points.map(project).join(' ')}" fill="rgb(${t.rgb.join(',')})"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img" aria-label="${name}"><rect width="480" height="300" fill="#202630"/>${shapes}</svg>`;
}

const rows: Record<string, unknown>[] = [],
  panels: string[] = [];
for (const kind of SURFACE_FIXTURES)
  for (const colorEnabled of [false, true]) {
    const name = `${kind}-${colorEnabled ? 'colored' : 'native'}`;
    const draft = translateFixture(surfaceFixture(kind), [0.0004, 2, 0]);
    const spec = {
      hostType: 'Part',
      colorEnabled,
      color: {
        mode: 'gradient',
        from: [46, 177, 215],
        to: [242, 158, 79],
        axis: 'u',
      } as SurfaceColor,
    };
    const precision = { posDecimals: 3, rotDecimals: 5 };
    const validator = curvedPoseValidator(spec, cat, cat.conventions, precision);
    if (!validator.ok) throw new Error(validator.error);
    const start = performance.now();
    const tiles = await tileCurved(draft, cap, {
      maxElements: 1000,
      poseForValidation: validator.validate,
    });
    const ms = performance.now() - start;
    if (!tiles.ok) throw new Error(`${name}: ${tiles.error}`);
    const built = buildCurvedSubDoc(tiles, spec, cat, cat.conventions, precision);
    if (!built.ok) throw new Error(built.error);
    const code = toShareCode(built.sub),
      parsed = parseShareText(code);
    if (!parsed.ok) throw new Error(parsed.message);
    const inverses = [...computePoses(parsed.doc, cat, cat.conventions).world]
      .filter(([id]) => id !== 1)
      .map(([, f]) => f.clone().invert());
    let gaps = 0;
    for (let j = 0; j <= 60; j++)
      for (let i = 0; i <= 80; i++) {
        const p = new Vector3(...evaluatePatch(draft, i / 80, j / 60).position);
        if (
          !inverses.some((inv) => {
            const q = p.clone().applyMatrix4(inv);
            return [q.x, q.y, q.z].every(
              (n, axis) => n >= mesh.min[axis] - 1e-7 && n <= mesh.max[axis] + 1e-7,
            );
          })
        )
          gaps++;
      }
    if (gaps)
      throw new Error(
        `${name}: ${gaps} uncovered native-solid samples after share-code roundtrip.`,
      );
    writeFileSync(join(out, `${name}.txt`), code + '\n');
    writeFileSync(join(out, `${name}.svg`), image(parsed.doc, name));
    rows.push({
      name,
      caps: tiles.tiles.length,
      samples: 4941,
      uncovered: gaps,
      generationMs: +ms.toFixed(2),
      ...tiles.diagnostics,
    });
    panels.push(
      `<article><h2>${name}</h2><img src="${name}.svg" alt="Exported native GasCaps: ${name}"><p>${tiles.tiles.length} GasCaps · 4,941 solid-volume samples · ${gaps} uncovered</p><p><a href="${name}.txt" download>Share code</a> <button onclick="const t=this.parentElement.nextElementSibling;t.hidden=!t.hidden">Show/copy code</button></p><textarea hidden readonly aria-label="${name} share code" onclick="this.select()">${code}</textarea></article>`,
    );
  }
writeFileSync(join(out, 'metrics.json'), JSON.stringify(rows, null, 2) + '\n');
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Native GasCap surface checks</title><style>body{font:16px system-ui;color:#e4e8f0;background:#10141b;margin:32px;max-width:1300px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}article{background:#202630;padding:18px;border-radius:12px}h1{margin-bottom:8px}h2{font-size:20px}img{width:100%}a{color:#7ad7ef;margin-right:12px}button{padding:6px 12px}textarea{box-sizing:border-box;width:100%;height:90px}p{line-height:1.5}small{color:#bbc3d0}</style><h1>Native GasCap surface checks</h1><p>Import a share code into Road to Gramby's. Inspect the top, underside, seams and sharp ridge. Try <b>crown-native</b>, <b>cylinder-colored</b> and <b>crease90-native</b> first. Tell me about visible holes, flickering, excessive overlap or unwanted part movement. The parent Part sits below the panels.</p><p><small>These are experiment builds, not the new Surfaces UI. Pictures use the actual captured GasCap mesh after share-code export/import. In-game appearance and physics still require your check.</small></p><main>${panels.join('')}</main></html>`,
);
console.table(
  rows.map(({ name, caps, uncovered, maxAssignedDeviation, maxFootprintDeviation }) => ({
    name,
    caps,
    uncovered,
    assigned: Number(maxAssignedDeviation).toFixed(5),
    footprint: Number(maxFootprintDeviation).toFixed(5),
  })),
);
console.log(`Artifacts: ${out}`);
