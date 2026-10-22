// MTL parser for the build-time asset pipeline (spec §5.1). Node only; never bundled.

/** Diffuse colour (`Kd`, linear RGB) per material, keyed by the exact `newmtl` name. */
export function parseMtl(text: string): Record<string, [number, number, number]> {
  // Object.create(null): a material named `__proto__` must still become an own key.
  const out: Record<string, [number, number, number]> = Object.create(null);
  let current: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const kind = line.split(/\s+/, 1)[0];
    const rest = line.slice(kind.length).trim();
    if (kind === 'newmtl') {
      current = rest;
    } else if (kind === 'Kd' && current !== undefined) {
      const c = rest.split(/\s+/).map(Number);
      if (c.length !== 3 || !c.every(Number.isFinite)) {
        throw new Error(`bad Kd for ${current}: ${line}`);
      }
      out[current] = [c[0] + 0, c[1] + 0, c[2] + 0];
    }
  }
  return out;
}
