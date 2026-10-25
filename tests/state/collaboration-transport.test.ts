import { FramedChannel } from '../../src/net/collaboration';
test('chunked snapshots reassemble exactly, tiny changes stay one frame and backpressure drains only when ready', () => {
  const frames: string[] = [],
    messages: unknown[] = [],
    errors: string[] = [];
  let buffered = 300000;
  vi.useFakeTimers();
  const receiver = new FramedChannel(
    () => {},
    () => 0,
    (m) => messages.push(m),
    (e) => errors.push(e),
  );
  const sender = new FramedChannel(
    (s) => frames.push(s),
    () => buffered,
    () => {},
    (e) => errors.push(e),
  );
  sender.send({ type: 'snapshot', value: '😎'.repeat(10000) });
  expect(frames).toHaveLength(0);
  buffered = 0;
  vi.advanceTimersByTime(20);
  frames.forEach((f) => receiver.receive(f));
  expect(messages).toEqual([{ type: 'snapshot', value: '😎'.repeat(10000) }]);
  expect(errors).toEqual([]);
  frames.length = 0;
  sender.send({ type: 'check', rev: 1 });
  expect(frames).toHaveLength(1);
  sender.close();
  receiver.close();
  vi.useRealTimers();
});
test('out-of-order and oversized input closes rather than accumulating unbounded memory', () => {
  const errors: string[] = [],
    message = vi.fn();
  const channel = new FramedChannel(
    () => {},
    () => 0,
    message,
    (e) => errors.push(e),
  );
  channel.receive(JSON.stringify({ f: 1, i: 2, n: 3, p: 'wrong' }));
  expect(errors).toHaveLength(1);
  expect(message).not.toHaveBeenCalled();
});
