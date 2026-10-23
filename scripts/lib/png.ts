// The average colour of a part texture (spec §5.1): enough to colour a textured group the way the game
// tints it, without shipping textures. Reads 8-bit RGBA non-interlaced PNGs, which is what every part
// texture is. Node only; never bundled.
import { inflateSync } from 'node:zlib';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** The alpha-weighted mean colour (sRGB, 0–1) of a PNG; null when it is fully transparent. */
export function averageColor(png: Uint8Array): [number, number, number] | null {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (!SIGNATURE.every((b, i) => buf[i] === b)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length;) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colorType, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(
          `unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`,
        );
      }
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  const sum = [0, 0, 0];
  let weight = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const predict = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predict === undefined) throw new Error(`bad PNG filter ${filter}`);
      row[i] = (line[i] + predict) & 255;
    }
    for (let x = 0; x < width; x++) {
      const alpha = row[4 * x + 3] / 255;
      for (let k = 0; k < 3; k++) sum[k] += (row[4 * x + k] / 255) * alpha;
      weight += alpha;
    }
    prev.set(row);
  }
  return weight > 0 ? [sum[0] / weight, sum[1] / weight, sum[2] / weight] : null;
}
