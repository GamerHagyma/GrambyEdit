import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { averageColor } from '../../scripts/lib/png';
import { parseMtlTextures } from '../../scripts/lib/mtl';

/** A minimal RGBA PNG: one scanline per row, filter byte `filter` on each. */
function png(width: number, rows: number[][], filter = 0): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, data, Buffer.alloc(4)]); // CRC unchecked by the reader
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(rows.length, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.concat(rows.map((r) => Buffer.from([filter, ...r])));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('averages opaque pixels, weighting by alpha', () => {
  // Red, and green at half alpha: (255·1 + 0·0.5) / 1.5 and so on.
  const avg = averageColor(png(2, [[255, 0, 0, 255, 0, 255, 0, 128]]))!;
  expect(avg[0]).toBeCloseTo(255 / (255 + 128), 3);
  expect(avg[1]).toBeCloseTo(128 / (255 + 128), 3);
  expect(avg[2]).toBe(0);
});

test('undoes the Sub and Up scanline filters', () => {
  // Raw pixels (10,20,30,255) (16,26,36,255); Sub stores the second as the difference.
  const sub = png(2, [[10, 20, 30, 255, 6, 6, 6, 0]], 1);
  expect(averageColor(sub)!.map((v) => Math.round(v * 255))).toEqual([13, 23, 33]);
});

test('a fully transparent texture has no average', () =>
  expect(averageColor(png(1, [[9, 9, 9, 0]]))).toBeNull());

test('the Tire texture is dark rubber', () => {
  const avg = averageColor(readFileSync('meshes/workshop/Tire/Tire1Tex.png'))!;
  for (const v of avg) expect(v).toBeLessThan(0.3);
});

test('map_Kd per material', () =>
  expect(parseMtlTextures(readFileSync('meshes/workshop/Tire/Tire.mtl', 'utf8'))).toEqual({
    Tire1Mtl: 'Tire1Tex.png',
  }));
