// Sub-part names from OBJ material names (spec §5.2). Node only; never bundled.

/** Strips the exporter's one `.NNN` suffix: `Glass1Mtl.004` -> `Glass1Mtl`. */
export function materialBase(usemtl: string): string {
  return usemtl.replace(/\.\d+$/, '');
}

/**
 * `Glass1Mtl.004` -> `Glass`. A name equal to the part type ignoring case takes the type's
 * spelling, because the exporter lowercases inner capitals (`Longstick1Mtl` -> `LongStick`).
 */
export function subPartName(usemtl: string, partType: string): string {
  const name = materialBase(usemtl).replace(/Mtl$/, '').replace(/1$/, '');
  return name.toLowerCase() === partType.toLowerCase() ? partType : name;
}
