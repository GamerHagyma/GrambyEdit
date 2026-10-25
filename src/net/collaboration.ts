// Ordered application framing and bounded WebRTC backpressure; no traffic when the queue is empty.
const CHUNK = 4096,
  MAX_TEXT = 16 * 1024 * 1024,
  MAX_BUFFER = 256 * 1024;
export class FramedChannel {
  get busy(): boolean {
    return this.queue.length > 0 || this.buffered() >= MAX_BUFFER;
  }
  private queue: string[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private serial = 0;
  private closed = false;
  private assembly: {
    id: number;
    next: number;
    count: number;
    parts: string[];
    size: number;
  } | null = null;
  constructor(
    private sendText: (text: string) => void,
    private buffered: () => number,
    private receiveMessage: (message: unknown) => void,
    private fail: (message: string) => void,
    private traffic: (sent: number, received: number) => void = () => {},
  ) {}
  send(message: unknown): void {
    if (this.closed) return;
    const text = JSON.stringify(message);
    if (text.length > MAX_TEXT)
      throw new Error('This shared build exceeds the 16 MiB session limit.');
    const count = Math.ceil(text.length / CHUNK),
      id = ++this.serial;
    if (count <= 1) this.queue.push(text);
    else
      for (let i = 0; i < count; i++)
        this.queue.push(
          JSON.stringify({ f: id, i, n: count, p: text.slice(i * CHUNK, (i + 1) * CHUNK) }),
        );
    if (this.queue.length > 8192) {
      this.close();
      throw new Error('Connection is too slow to keep up with this build.');
    }
    if (!this.timer) this.drain();
  }
  private drain = () => {
    this.timer = undefined;
    if (this.closed) return;
    try {
      while (this.queue.length && this.buffered() < MAX_BUFFER) {
        const text = this.queue.shift()!;
        this.sendText(text);
        this.traffic(new TextEncoder().encode(text).length, 0);
      }
    } catch (e) {
      this.close();
      this.fail((e as Error).message);
      return;
    }
    if (this.queue.length) this.timer = setTimeout(this.drain, 20);
  };
  receive(raw: unknown): void {
    if (this.closed) return;
    try {
      if (typeof raw !== 'string' || raw.length > CHUNK * 8)
        throw new Error('Invalid or oversized network frame.');
      this.traffic(0, new TextEncoder().encode(raw).length);
      const frame = JSON.parse(raw);
      if (frame && typeof frame === 'object' && 'f' in frame) {
        if (
          !Number.isSafeInteger(frame.f) ||
          !Number.isSafeInteger(frame.i) ||
          !Number.isSafeInteger(frame.n) ||
          frame.n < 2 ||
          frame.n > MAX_TEXT / CHUNK ||
          typeof frame.p !== 'string' ||
          frame.p.length > CHUNK
        )
          throw new Error('Invalid chunk.');
        if (frame.i === 0) {
          if (this.assembly) throw new Error('Overlapping snapshots.');
          this.assembly = { id: frame.f, next: 0, count: frame.n, parts: [], size: 0 };
        }
        const a = this.assembly;
        if (!a || a.id !== frame.f || a.next !== frame.i || a.count !== frame.n)
          throw new Error('Unordered chunk.');
        a.parts.push(frame.p);
        a.size += frame.p.length;
        a.next++;
        if (a.size > MAX_TEXT) throw new Error('Oversized message.');
        if (a.next === a.count) {
          this.assembly = null;
          this.receiveMessage(JSON.parse(a.parts.join('')));
        }
      } else {
        if (this.assembly) throw new Error('Interrupted snapshot.');
        this.receiveMessage(frame);
      }
    } catch (e) {
      this.close();
      this.fail((e as Error).message);
    }
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.queue = [];
    this.assembly = null;
  }
}
