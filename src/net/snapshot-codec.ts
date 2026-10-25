// Compression is reserved for large, infrequent snapshots; normal deltas stay tiny JSON messages.
const LIMIT = 16 * 1024 * 1024;
export async function packSnapshot(message: unknown): Promise<unknown> {
  if (
    !message ||
    typeof message !== 'object' ||
    !['welcome', 'snapshot'].includes(String((message as { type?: unknown }).type))
  )
    return message;
  const text = JSON.stringify(message),
    bytes = new TextEncoder().encode(text);
  if (bytes.length > LIMIT) throw new Error('The shared build exceeds the 16 MiB snapshot limit.');
  if (bytes.length < 16384 || typeof CompressionStream === 'undefined') return message;
  const compressed = new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer(),
  );
  if ((compressed.length * 4) / 3 + 100 >= bytes.length * 0.9) return message;
  let binary = '';
  for (let i = 0; i < compressed.length; i += 8192)
    binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
  return { type: 'compressed', encoding: 'gzip', bytes: bytes.length, data: btoa(binary) };
}
export async function unpackSnapshot(message: unknown): Promise<unknown> {
  if (
    !message ||
    typeof message !== 'object' ||
    (message as { type?: unknown }).type !== 'compressed'
  )
    return message;
  const packet = message as Record<string, unknown>;
  if (
    packet.encoding !== 'gzip' ||
    !Number.isSafeInteger(packet.bytes) ||
    Number(packet.bytes) < 1 ||
    Number(packet.bytes) > LIMIT ||
    typeof packet.data !== 'string' ||
    packet.data.length > LIMIT * 1.4 ||
    typeof DecompressionStream === 'undefined'
  )
    throw new Error('Invalid compressed snapshot.');
  const raw = atob(packet.data),
    bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0,
    text = '';
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > Number(packet.bytes) || size > LIMIT)
        throw new Error('Snapshot decompression limit exceeded.');
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  if (size !== packet.bytes) throw new Error('Incomplete compressed snapshot.');
  return JSON.parse(text);
}
