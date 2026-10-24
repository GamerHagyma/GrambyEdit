// OBJ parser for the build-time asset pipeline (spec §5.1). Node only; never bundled.

export interface ObjGroup {
  material: string;
  name?: string;
  /** Index range into `ObjMesh.indices`. */
  start: number;
  count: number;
}
export interface ObjMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  groups: ObjGroup[];
  min: [number, number, number];
  max: [number, number, number];
}

/** A 0-based face corner; missing texture or normal indices are null. */
interface Corner {
  v: number;
  vt: number | null;
  vn: number | null;
}

interface Group {
  material: string;
  name?: string;
  faces: Corner[][];
}

/** A 1-based OBJ index; a negative one counts back from the last entry defined so far. */
function parseIndex(token: string, count: number): number {
  const i = Number(token);
  if (!Number.isInteger(i) || i === 0) throw new Error(`bad OBJ index "${token}"`);
  return i > 0 ? i - 1 : count + i;
}

/** Accepts `v`, `v/vt`, `v//vn` and `v/vt/vn`. */
function parseCorner(token: string, vCount: number, tCount: number, nCount: number): Corner {
  const [v, vt, vn] = token.split('/');
  return {
    v: parseIndex(v, vCount),
    vt: vt ? parseIndex(vt, tCount) : null,
    vn: vn ? parseIndex(vn, nCount) : null,
  };
}

function parseVec3(rest: string, line: string): [number, number, number] {
  const n = rest.split(/\s+/).slice(0, 3).map(Number);
  if (n.length !== 3 || !n.every(Number.isFinite)) throw new Error(`bad OBJ line: ${line}`);
  return [n[0], n[1], n[2]];
}

/** Newell's method: stays sane for non-planar quads. Zero for a degenerate face. */
function faceNormal(pos: readonly number[], corners: readonly Corner[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  corners.forEach((c, i) => {
    const a = c.v * 3;
    const b = corners[(i + 1) % corners.length].v * 3;
    x += (pos[a + 1] - pos[b + 1]) * (pos[a + 2] + pos[b + 2]);
    y += (pos[a + 2] - pos[b + 2]) * (pos[a] + pos[b]);
    z += (pos[a] - pos[b]) * (pos[a + 1] + pos[b + 1]);
  });
  const len = Math.hypot(x, y, z);
  return len > 0 ? [x / len, y / len, z / len] : [0, 0, 0];
}

export function parseObj(text: string): ObjMesh {
  const pos: number[] = [];
  const nrm: number[] = [];
  const tex: number[] = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const groups: Group[] = [];
  let current: Group | undefined;
  let material = '';
  let name: string | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const kind = line.split(/\s+/, 1)[0];
    const rest = line.slice(kind.length).trim();
    if (kind === 'v') {
      const p = parseVec3(rest, line);
      for (let i = 0; i < 3; i++) {
        pos.push(p[i]);
        min[i] = Math.min(min[i], p[i]);
        max[i] = Math.max(max[i], p[i]);
      }
    } else if (kind === 'vn') {
      nrm.push(...parseVec3(rest, line));
    } else if (kind === 'vt') {
      const uv = rest.split(/\s+/).map(Number);
      if (!rest || uv.length > 3 || !uv.every(Number.isFinite)) {
        throw new Error(`bad OBJ line: ${line}`);
      }
      tex.push(uv[0], uv[1] ?? 0);
    } else if (kind === 'usemtl') {
      material = rest;
      current = undefined;
    } else if (kind === 'g' || kind === 'o') {
      name = rest || undefined;
      current = undefined;
    } else if (kind === 'f') {
      const corners = rest
        .split(/\s+/)
        .map((t) => parseCorner(t, pos.length / 3, tex.length / 2, nrm.length / 3));
      if (corners.length < 3) throw new Error(`OBJ face has ${corners.length} corners: ${line}`);
      if (!current) {
        // Faces before the first usemtl retain an empty material name.
        current = { material, ...(name ? { name } : {}), faces: [] };
        groups.push(current);
      }
      current.faces.push(corners);
    }
  }

  const vCount = pos.length / 3;
  const nCount = nrm.length / 3;
  const tCount = tex.length / 2;
  // One output vertex per distinct (v, vt, vn) tuple. Corners without a normal use the face normal,
  // so they are shared only within their own face.
  const ids = new Map<string, number>();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const out: ObjGroup[] = [];
  let faceNo = 0;

  for (const g of groups) {
    const start = indices.length;
    for (const corners of g.faces) {
      for (const c of corners) {
        if (c.v < 0 || c.v >= vCount) throw new Error(`OBJ vertex index ${c.v + 1} out of range`);
        if (c.vn !== null && (c.vn < 0 || c.vn >= nCount)) {
          throw new Error(`OBJ normal index ${c.vn + 1} out of range`);
        }
        if (c.vt !== null && (c.vt < 0 || c.vt >= tCount)) {
          throw new Error(`OBJ texture index ${c.vt + 1} out of range`);
        }
      }
      const faceN = faceNormal(pos, corners);
      const vid = corners.map((c) => {
        // Some exports write `vn -0 -0 -0`; a zero normal is treated like a missing one.
        const file = c.vn === null ? null : nrm.slice(c.vn * 3, c.vn * 3 + 3);
        const useFile = file !== null && (file[0] !== 0 || file[1] !== 0 || file[2] !== 0);
        const key = `${c.v}/${c.vt}/${useFile ? c.vn : `f${faceNo}`}`;
        const known = ids.get(key);
        if (known !== undefined) return known;
        const id = ids.size;
        ids.set(key, id);
        positions.push(pos[c.v * 3] + 0, pos[c.v * 3 + 1] + 0, pos[c.v * 3 + 2] + 0);
        const n = useFile ? file : faceN;
        normals.push(n[0] + 0, n[1] + 0, n[2] + 0);
        uvs.push(c.vt === null ? 0 : tex[c.vt * 2], c.vt === null ? 0 : tex[c.vt * 2 + 1]);
        return id;
      });
      // Fan triangulation; every face in the data is already a triangle.
      for (let i = 1; i + 1 < vid.length; i++) indices.push(vid[0], vid[i], vid[i + 1]);
      faceNo++;
    }
    out.push({
      material: g.material,
      ...(g.name ? { name: g.name } : {}),
      start,
      count: indices.length - start,
    });
  }

  const bbox = (a: number[]): [number, number, number] => [a[0] + 0, a[1] + 0, a[2] + 0];
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    ...(tCount > 0 ? { uvs: new Float32Array(uvs) } : {}),
    indices: new Uint32Array(indices),
    groups: out,
    min: vCount > 0 ? bbox(min) : [0, 0, 0],
    max: vCount > 0 ? bbox(max) : [0, 0, 0],
  };
}
