// The part picker of the Connect and Point tools (spec §12.2): it opens at the cursor for the clicked
// sockets or points, lists the parts that fit, and offers the socket the new part attaches by.
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { defaultChildSocket } from '../../core/defaults';
import { catalogSig, docSig } from '../../state/store';
import {
  attachSocketSig,
  closePicker,
  eligibleFor,
  pickerSig,
  placeParts,
  type PlaceTarget,
} from '../../tools/connect';
import { PartPicker, type PickChoice } from './PartPicker';

/** "Attach by socket N ▾" for the highlighted type; on points the default mount is fixed. */
function AttachBy({
  choice,
  targets,
}: {
  choice: PickChoice | undefined;
  targets: readonly PlaceTarget[];
}): JSX.Element | null {
  const cat = catalogSig.value;
  if (!cat || choice?.kind !== 'part' || !Object.hasOwn(cat.parts, choice.type)) return null;
  const def = cat.parts[choice.type];
  const socket = targets.find((t) => t.kind === 'socket');
  if (!socket || socket.kind !== 'socket') {
    return <p class="part-picker-detail muted">Mounts by socket {def.defaultMount}</p>;
  }
  const hostType = docSig.value.parts.get(socket.part)?.type ?? '';
  const chosen =
    attachSocketSig.value?.type === choice.type
      ? attachSocketSig.value.socket
      : defaultChildSocket(cat, choice.type, hostType, socket.socket);
  return (
    <label class="part-picker-detail">
      <span class="muted">Attach by socket</span>
      <select
        value={chosen ?? ''}
        onChange={(e) => {
          attachSocketSig.value = { type: choice.type, socket: e.currentTarget.value };
        }}
      >
        {def.childSockets.map((cs) => {
          const s = def.sockets[cs];
          return (
            <option key={cs} value={cs}>
              {[cs, s.name, s.role].filter(Boolean).join(' · ')}
            </option>
          );
        })}
      </select>
    </label>
  );
}

const PICKER_W = 300;
const PICKER_H = 380;

export function PickerHost(): JSX.Element | null {
  const req = pickerSig.value;
  const cat = catalogSig.value;
  const box = useRef<HTMLDivElement>(null);
  // A press elsewhere in the page closes it, as a menu would; presses in the 3D view are the tool's,
  // which gathers more targets with Shift+click and closes it otherwise.
  useEffect(() => {
    if (!req) return;
    const close = (e: PointerEvent) => {
      const at = e.target as Element;
      if (!box.current?.contains(at) && !at.closest?.('.viewport')) closePicker();
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [req]);
  if (!req || !cat) return null;
  const n = req.targets.length;
  const onPoint = req.targets[0].kind === 'point';
  const title =
    n > 1
      ? `Place a part on ${n} spots`
      : onPoint
        ? 'Mount a part on this point'
        : 'Attach a part to this socket';
  // Kept on screen near the cursor.
  const anchor = {
    x: Math.max(8, Math.min(req.anchor.x, window.innerWidth - PICKER_W - 8)),
    y: Math.max(8, Math.min(req.anchor.y, window.innerHeight - PICKER_H - 8)),
  };
  return (
    <div ref={box}>
      <PartPicker
        anchor={anchor}
        title={title}
        eligible={eligibleFor(cat, req.targets)}
        onClose={closePicker}
        onPick={(c) => {
          closePicker();
          if (c.kind === 'part') placeParts(c.type, req.targets);
        }}
        detail={(c) => <AttachBy choice={c} targets={req.targets} />}
      />
    </div>
  );
}
