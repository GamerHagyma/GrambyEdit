import { HostSession, ClientSession } from '../../../src/core/collaboration/session';
import { docOf, part } from '../../helpers/doc';
import { transact } from '../../../src/core/ops/transact';
import { digest } from '../../../src/core/collaboration/document';

test('optimistic concurrent edits merge, ordered acknowledgement rebases pending edits, idle checks send no snapshot', () => {
  const queue: (() => void)[] = [],
    out: any[] = [];
  const base = docOf(part(1, 'Servo', [], { Speed: 45, Rest: false }));
  const clients = new Map<string, ClientSession>();
  const host = new HostSession(base, (to, msg) => {
    out.push(msg);
    queue.push(() => clients.get(to)?.receive(msg));
  });
  for (const name of ['a', 'b']) {
    host.addPeer(name, 'editor');
    clients.set(
      name,
      new ClientSession(
        base,
        0,
        (msg) => queue.push(() => host.receive(name, msg)),
        () => {},
      ),
    );
  }
  const a = clients.get('a')!,
    b = clients.get('b')!;
  a.local(
    a.visible,
    transact(a.visible, 'speed', (d) => d.set({ ...d.get(1)!, props: { Speed: 90, Rest: false } }))
      .doc,
  );
  b.local(
    b.visible,
    transact(b.visible, 'rest', (d) => d.set({ ...d.get(1)!, props: { Speed: 45, Rest: true } }))
      .doc,
  );
  a.flush();
  b.flush();
  while (queue.length) queue.shift()!();
  expect(host.doc.parts.get(1)!.props).toEqual({ Speed: 90, Rest: true });
  expect(digest(a.visible)).toBe(digest(host.doc));
  expect(digest(b.visible)).toBe(digest(host.doc));
  out.length = 0;
  host.check();
  while (queue.length) queue.shift()!();
  expect(out.every((m) => m.type === 'check')).toBe(true);
});
test('leases avoid simultaneous insertion collisions and viewer edits are rejected by the host', () => {
  const host = new HostSession(docOf(part(1, 'Part')), () => {});
  host.addPeer('a', 'editor');
  host.addPeer('b', 'viewer');
  const a = host.allocate('a'),
    b = host.allocate('host');
  expect(a).not.toBe(b);
  host.receive('b', {
    type: 'edit',
    request: 1,
    ops: [['v', 1, 'RGB', [[1, 2, 3]]]],
    label: 'paint',
  });
  expect(host.doc.parts.get(1)!.props).toEqual({});
});
test('digest mismatch requests a repair, identical checks never install snapshots', () => {
  const sent: any[] = [],
    installed: any[] = [];
  const base = docOf(part(1, 'Part'));
  const client = new ClientSession(
    base,
    0,
    (msg) => sent.push(msg),
    (doc) => installed.push(doc),
  );
  client.receive({ type: 'check', rev: 0, hash: digest(base) });
  expect(sent).toHaveLength(0);
  client.receive({ type: 'check', rev: 0, hash: '0000000000000000' });
  expect(sent[0]).toMatchObject({ type: 'repair', rev: 0 });
  expect(installed).toHaveLength(0);
});

test('a repair can be retried after a lost/rate-limited response', () => {
  vi.useFakeTimers();
  const sent: any[] = [];
  const base = docOf(part(1, 'Part'));
  const client = new ClientSession(
    base,
    0,
    (msg) => sent.push(msg),
    () => {},
  );
  client.receive({ type: 'check', rev: 0, hash: '0000000000000000' });
  vi.advanceTimersByTime(15000);
  client.receive({ type: 'check', rev: 0, hash: '0000000000000000' });
  expect(sent).toHaveLength(2);
  vi.useRealTimers();
});

test('rapid local changes to the same field coalesce before transmission', () => {
  const base = docOf(part(1, 'Servo', [], { Speed: 45 })),
    sent: any[] = [];
  const client = new ClientSession(
    base,
    0,
    (m) => sent.push(m),
    () => {},
  );
  let before = base;
  for (const speed of [50, 60, 70, 80]) {
    const after = transact(before, 'speed', (d) =>
      d.set({ ...d.get(1)!, props: { Speed: speed } }),
    ).doc;
    client.local(before, after);
    before = after;
  }
  expect(sent).toHaveLength(0);
  client.flush();
  expect(sent).toHaveLength(1);
  expect(sent[0].ops).toEqual([['v', 1, 'Speed', [80]]]);
});

test('revision gaps replay recent changes instead of transferring a snapshot; repeated checks do not reinstall', () => {
  const sent: any[] = [];
  const base = docOf(part(1, 'Servo', [], { Speed: 45 }));
  const host = new HostSession(base, (_, m) => sent.push(m));
  host.addPeer('a', 'editor');
  let before = base;
  for (const Speed of [90, 120]) {
    const after = transact(before, 'change', (d) => d.set({ ...d.get(1)!, props: { Speed } })).doc;
    host.local(before, after);
    before = after;
  }
  sent.length = 0;
  host.receive('a', { type: 'repair', rev: 0, hash: digest(base) });
  expect(sent.map((m) => m.type)).toEqual(['update', 'update']);
  const install = vi.fn(),
    client = new ClientSession(before, 2, () => {}, install);
  client.receive({ type: 'snapshot', rev: 2, accepted: 0, doc: host.snapshot('a').doc });
  expect(install).not.toHaveBeenCalled();
});

test('conditional undo reaching the host after a newer edit cannot overwrite it', () => {
  const base = docOf(part(1, 'Servo', [], { Speed: 45 })),
    host = new HostSession(base, () => {});
  host.addPeer('a', 'editor');
  host.receive('a', { type: 'edit', request: 1, label: 'Mine', ops: [['v', 1, 'Speed', [90]]] });
  const after = transact(host.doc, 'newer', (d) =>
    d.set({ ...d.get(1)!, props: { Speed: 100 } }),
  ).doc;
  host.local(host.doc, after);
  host.receive('a', {
    type: 'edit',
    request: 2,
    label: 'Undo',
    ops: [['v', 1, 'Speed', [45]]],
    guards: [[90]],
  });
  expect(host.doc.parts.get(1)!.props.Speed).toBe(100);
});

test('guests can undo their deletion of an original host part, without reviving somebody else deletion', () => {
  const base = docOf(part(1, 'Part')),
    sent: any[] = [];
  const host = new HostSession(base, (_, m) => sent.push(m));
  host.addPeer('a', 'editor');
  host.addPeer('b', 'editor');
  host.receive('a', { type: 'edit', request: 1, label: 'Delete', ops: [['p', 1, null]] });
  host.receive('a', {
    type: 'edit',
    request: 2,
    label: 'Undo delete',
    ops: [['p', 1, { ...base.parts.get(1)!, points: null }]],
    guards: [null],
  });
  expect(host.doc.parts.has(1)).toBe(true);
  host.receive('b', { type: 'edit', request: 1, label: 'Delete', ops: [['p', 1, null]] });
  host.receive('a', {
    type: 'edit',
    request: 3,
    label: 'Stale restore',
    ops: [['p', 1, { ...base.parts.get(1)!, points: null }]],
    guards: [null],
  });
  expect(host.doc.parts.has(1)).toBe(false);
  expect(sent.at(-1).type).toBe('snapshot');
});

test('stale undo cannot revive a part deleted later by another author, even inside its ID lease or on the host', () => {
  const sent: any[] = [],
    base = docOf(part(1, 'Part'));
  const host = new HostSession(base, (_, m) => sent.push(m));
  const lease = host.addPeer('a', 'editor');
  host.addPeer('b', 'editor');
  const p = { id: lease.start, type: 'Part', props: {}, conns: [], points: null };
  host.receive('a', { type: 'edit', request: 1, label: 'Add', ops: [['p', p.id, p]] });
  host.receive('a', { type: 'edit', request: 2, label: 'Delete', ops: [['p', p.id, null]] });
  host.receive('a', {
    type: 'edit',
    request: 3,
    label: 'Restore',
    ops: [['p', p.id, p]],
    guards: [null],
  });
  host.receive('b', { type: 'edit', request: 1, label: 'New delete', ops: [['p', p.id, null]] });
  host.receive('a', {
    type: 'edit',
    request: 4,
    label: 'Stale restore',
    ops: [['p', p.id, p]],
    guards: [null],
  });
  expect(host.doc.parts.has(p.id)).toBe(false);
  const deleted = transact(host.doc, 'Host delete', (d) => d.delete(1)).doc;
  host.local(host.doc, deleted);
  const restored = transact(host.doc, 'Host restore', (d) => d.add(base.parts.get(1)!)).doc;
  host.local(host.doc, restored);
  host.receive('b', {
    type: 'edit',
    request: 2,
    label: 'Guest deletes restored part',
    ops: [['p', 1, null]],
  });
  host.undo();
  host.undo();
  expect(host.doc.parts.has(1)).toBe(false);
});
