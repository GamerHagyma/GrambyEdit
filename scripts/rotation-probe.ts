// Native rotation experiment; no editor rules or catalog frames are changed.
// Run: node --import tsx scripts/rotation-probe.ts [output-directory]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Euler, Matrix4 } from 'three';
import { buildAssets } from './build-assets';
import { matrix4ToCf } from '../src/core/cframe';
import { fromEntries } from '../src/core/doc';
import { computePoses } from '../src/core/pose';
import { validate } from '../src/core/rules';
import { parseShareText, toShareCode } from '../src/core/share';
import { DEFAULT_LIMITS, type CFrame12, type Json } from '../src/core/types';

const out = resolve(process.argv[2] ?? '.claude/rotation-probe');
const { catalog: cat } = await buildAssets({ root: '.', outDir: null });
const rootType = 'SteeringGyro';
const types = [
  'Part',
  'Connector',
  'ShortStick',
  'InputSensor',
  'Bearing',
  'Servo',
  'Servo_Physics',
  'DoorA',
  'GasCap',
  'Spoiler',
];
const mixed = { OrientationX: 37, OrientationY: -23, OrientationZ: 61 };
const rotations: Record<string, Matrix4> = {
  identity: new Matrix4(),
  x90: new Matrix4().makeRotationX(Math.PI / 2),
  y90: new Matrix4().makeRotationY(Math.PI / 2),
  mixed: new Matrix4().makeRotationFromEuler(
    new Euler((20 * Math.PI) / 180, (-35 * Math.PI) / 180, (15 * Math.PI) / 180, 'XYZ'),
  ),
};
const cases: { name: string; rotation: string; props: Record<string, Json> }[] = [
  { name: 'point-neutral', rotation: 'identity', props: {} },
  { name: 'point-frame-X90', rotation: 'x90', props: {} },
  { name: 'point-frame-Y90', rotation: 'y90', props: {} },
  { name: 'point-frame-mixed', rotation: 'mixed', props: {} },
  { name: 'point-OrientationX90', rotation: 'identity', props: { OrientationX: 90 } },
  { name: 'point-OrientationY90', rotation: 'identity', props: { OrientationY: 90 } },
  { name: 'point-OrientationZ90', rotation: 'identity', props: { OrientationZ: 90 } },
  { name: 'point-Orientation-mixed', rotation: 'identity', props: mixed },
  { name: 'point-both-mixed', rotation: 'mixed', props: mixed },
];
const points: Record<string, Json> = {};
const entries: Json[][] = [[rootType, [], { EphemeralAttachments: points, RGB: [255, 220, 40] }]];
const samples: {
  id: number;
  type: string;
  name: string;
  cell: number;
  position: number[];
  host: number;
  parentSocket?: string;
  point: CFrame12;
}[] = [];
let cell = 0;
function add(type: string, conns: Json[], props: Record<string, Json>) {
  if (!cat.parts[type]?.defaultMount) throw new Error(`No captured child mount for ${type}.`);
  const servo = type === 'Servo' || type === 'Servo_Physics';
  entries.push([
    type,
    conns,
    {
      ...(servo ? { Speed: 0, Rotation: 0, Rest: false, LimitEnabled: false } : {}),
      ...props,
    },
  ]);
  return entries.length;
}
function probePoint(rotation: string) {
  const slot = cell++;
  const position = [8 + (slot % 12) * 8, 4, Math.floor(slot / 12) * 8];
  const point = matrix4ToCf(
    rotations[rotation].clone().setPosition(...(position as [number, number, number])),
  ).map((n) => (Math.abs(n) < 1e-10 ? 0 : Number(n.toFixed(9)))) as unknown as CFrame12;
  const uuid = `{a11ce000-0000-4000-8000-${String(slot).padStart(12, '0')}}`;
  points[uuid] = { partName: cat.parts[rootType].mainPartName, cframe: [...point] };
  return { slot, position, point, uuid };
}
for (const type of types) {
  for (const test of cases) {
    const p = probePoint(test.rotation);
    const id = add(type, [[cat.parts[type].defaultMount!, p.uuid, 1]], test.props);
    samples.push({
      id,
      type,
      name: test.name,
      cell: p.slot,
      position: p.position,
      host: 1,
      point: p.point,
    });
  }
  for (const test of ['socket-neutral', 'socket-Orientation-mixed', 'socket-side-rotated-host']) {
    const p = probePoint(test.endsWith('host') ? 'mixed' : 'identity');
    const hostType = type === 'Part' ? 'Connector' : 'Part';
    const host = add(hostType, [[cat.parts[hostType].defaultMount!, p.uuid, 1]], {
      RGB: [80, 80, 80],
    });
    const socket = test.endsWith('host') ? '3' : '6';
    const id = add(
      type,
      [[cat.parts[type].defaultMount!, socket, host]],
      test === 'socket-neutral' ? {} : mixed,
    );
    samples.push({
      id,
      type,
      name: test,
      cell: p.slot,
      position: p.position,
      host,
      parentSocket: socket,
      point: p.point,
    });
  }
}
for (const hostType of ['Roof', 'Bearing', 'Servo', 'Servo_Physics']) {
  const childType = hostType === 'Roof' ? ['DoorA', 'GasCap'] : ['InputSensor'];
  for (const type of childType) {
    for (const turned of [false, true]) {
      const p = probePoint('mixed');
      const host = add(hostType, [[cat.parts[hostType].defaultMount!, p.uuid, 1]], {
        RGB: [80, 80, 80],
      });
      const socket = '2';
      const id = add(type, [[cat.parts[type].defaultMount!, socket, host]], turned ? mixed : {});
      samples.push({
        id,
        type,
        name: `${hostType}-output-${turned ? 'mixed' : 'neutral'}`,
        cell: p.slot,
        position: p.position,
        host,
        parentSocket: socket,
        point: p.point,
      });
    }
  }
}
const parsed = fromEntries(entries);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
const code = toShareCode(parsed.doc),
  roundtrip = parseShareText(code);
if (!roundtrip.ok) throw new Error(roundtrip.message);
const poses = computePoses(roundtrip.doc, cat, cat.conventions);
const issues = validate(roundtrip.doc, cat, DEFAULT_LIMITS, code.length, poses);
if (issues.some((i) => i.severity === 'error')) throw new Error(JSON.stringify(issues));
if (poses.approxCount || [...poses.flags.values()].some((n) => n !== 0))
  throw new Error('Probe contains approximate geometry or a pose cycle.');
const manifest = {
  format: 'grambyedit-rotation-probe-v1',
  codeSHA256: createHash('sha256').update(code).digest('hex'),
  root: { id: 1, type: rootType, primaryPart: cat.parts[rootType].mainPartName },
  partCount: roundtrip.doc.order.length,
  columns: 12,
  spacing: 8,
  samples: samples.map((s) => ({
    ...s,
    hostType: roundtrip.doc.parts.get(s.host)!.type,
    primaryPart: cat.parts[s.type].mainPartName,
    props: roundtrip.doc.parts.get(s.id)!.props,
    editorPrediction: matrix4ToCf(poses.world.get(s.id)!),
    hostEditorPrediction: matrix4ToCf(poses.world.get(s.host)!),
  })),
  note: 'editorPrediction is a hypothesis, not measured geometry. Preserve the original code and measure host-relative native frames before changing any rotation rule.',
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'rotation-probe.txt'), code);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Native rotation probe</title>
<style>body{font:16px system-ui;background:#171c24;color:#eee;max-width:1100px;margin:40px auto;padding:0 24px}button,a{color:white}button{background:#3568ce;border:0;padding:14px 24px;border-radius:6px;cursor:pointer}a{margin-left:20px}textarea{display:block;width:100%;height:90px;margin:20px 0;background:#242d3a;color:#ccd8f0}td,th{text-align:left;padding:5px 16px;border-bottom:1px solid #354050}code{color:#a9cbff}#status{margin:10px 0;color:#a9cbff}</style>
<h1>Native rotation probe</h1><p><strong>${manifest.partCount} parts · ${samples.length} samples · 10 part types</strong></p>
<p>Copy the complete code, spawn it in Road to Gramby's, let it settle, and tell me when it is ready. Leave the test build spawned. Do not activate its servos. No screenshot or re-export is needed for the first capture.</p>
<button id="copy">Copy test creation code</button><a href="rotation-probe.txt" download>Download code</a><div id="status"></div><textarea id="code" readonly></textarea>
<p>The yellow SteeringGyro is the root marker. Each of the 130 samples occupies a separate slot on an 8-stud grid. Gray pieces are socket-control hosts. The rows compare point frames, Orientation fields, ordinary sockets, door hinges and spinning outputs.</p>
<p>Part types: ${types.join(', ')}. The editor's current predictions are saved separately from the future native measurements.</p>
<details><summary>Sample map</summary><table><thead><tr><th>Cell</th><th>Part</th><th>Test</th><th>Entry</th></tr></thead><tbody id="rows"></tbody></table></details>
<script type="module">const code=await(await fetch('./rotation-probe.txt')).text();const m=await(await fetch('./manifest.json')).json();document.querySelector('#code').value=code;document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(code);document.querySelector('#status').textContent='Copied the complete test creation.';}catch{const t=document.querySelector('#code');t.select();document.execCommand('copy');document.querySelector('#status').textContent='Code selected for copying.';}};for(const s of m.samples){const tr=document.createElement('tr');for(const v of [s.cell+1,s.type,s.name,s.id]){const td=document.createElement('td');td.textContent=v;tr.append(td);}document.querySelector('#rows').append(tr);}</script>`,
);
console.log(
  JSON.stringify({
    output: out,
    parts: manifest.partCount,
    samples: samples.length,
    codeChars: code.length,
    issues,
  }),
);
