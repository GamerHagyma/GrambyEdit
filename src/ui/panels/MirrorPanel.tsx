import type { JSX } from 'preact';
import {
  symmetrySig,
  chooseSymmetryAnchor,
  clearSymmetry,
  applySymmetry,
  symmetryPreviewSig,
  symmetrySelection,
  pendingSymmetrySig,
  clearPendingSymmetry,
} from '../../state/symmetry';
import { docSig, catalogSig } from '../../state/store';
import { selectionSig } from '../../state/selection';
import { collaborationReadOnlySig } from '../../state/collaboration';
import type { SymmetryAxis, SymmetryMode } from '../../core/symmetry';
import { NumberScrub } from '../widgets/NumberScrub';
export function MirrorPanel(): JSX.Element {
  const s = symmetrySig.value,
    doc = docSig.value,
    anchor = s.anchor === null ? null : doc.parts.get(s.anchor),
    selected = [...selectionSig.value.parts];
  const canAnchor =
    selected.length === 1 && ['Part', 'Connector'].includes(doc.parts.get(selected[0])?.type ?? '');
  const change = (patch: Partial<typeof s>) => {
    symmetrySig.value = { ...symmetrySig.peek(), ...patch };
  };
  const preview = symmetryPreviewSig.value,
    count = symmetrySelection().length;
  const number = (label: string, key: 'offset' | 'count' | 'size', min?: number, max?: number) => (
    <label class="mirror-field">
      {label}
      <NumberScrub
        id={`mirror-${key}`}
        value={s[key]}
        placeholder=""
        step={key === 'count' ? 1 : 0.1}
        min={min}
        max={max}
        integer={key === 'count'}
        onCommit={(v) => change({ [key]: v })}
      />
    </label>
  );
  return (
    <div class="mirror-panel">
      <h3>Mirror & radial copies</h3>
      <p>
        Anchor a local guide to a Part or Connector. Copies are normal parts; guides and previews
        stay on your screen.
      </p>
      <button class="button" disabled={!canAnchor} onClick={chooseSymmetryAnchor}>
        Use selected Part / Connector
      </button>
      {anchor ? (
        <>
          <p>
            Anchor: {anchor.type} #{doc.order.indexOf(anchor.id) + 1}
          </p>
          <button class="button small" onClick={clearSymmetry}>
            Clear mirror
          </button>
          <label class="mirror-field">
            Symmetry mode
            <select
              aria-label="Symmetry mode"
              value={s.mode}
              onChange={(e) =>
                change({
                  mode: e.currentTarget.value as SymmetryMode,
                  axis: e.currentTarget.value === 'radial' ? 'y' : 'x',
                  offset: 0,
                })
              }
            >
              <option value="plane">Mirror plane</option>
              <option value="radial">Radial</option>
            </select>
          </label>
          <label class="mirror-field">
            {s.mode === 'plane' ? 'Plane (anchor axes)' : 'Radial axis'}
            <select
              aria-label={s.mode === 'plane' ? 'Mirror plane' : 'Radial axis'}
              value={s.axis}
              onChange={(e) => change({ axis: e.currentTarget.value as SymmetryAxis })}
            >
              {(['x', 'y', 'z'] as const).map((axis) => (
                <option value={axis} key={axis}>
                  {s.mode === 'plane'
                    ? { x: 'YZ — left / right', y: 'XZ — above / below', z: 'XY — front / back' }[
                        axis
                      ]
                    : axis.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {s.mode === 'radial' && number('Total sectors', 'count', 2, 16)}
          {s.mode === 'radial' && (
            <p class="muted">Includes the original: {s.count - 1} additional copies per part.</p>
          )}
          {number('Normal / axis offset (studs)', 'offset')}
          <div class="mirror-actions">
            <button class="button small" onClick={() => change({ offset: 0, rotation: [0, 0, 0] })}>
              Center
            </button>
            <button
              class="button small"
              onClick={() =>
                change({
                  axis: 'y',
                  rotation: [0, 0, 0],
                  offset: catalogSig.peek()?.parts[anchor.type].mesh?.max[1] ?? 0,
                })
              }
            >
              Top face
            </button>
          </div>
          <details>
            <summary>Rotate guide (degrees)</summary>
            <div class="mirror-rotation">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <label key={axis}>
                  {axis}
                  <NumberScrub
                    id={`mirror-rotation-${axis}`}
                    value={s.rotation[i]}
                    placeholder="0"
                    step={1}
                    onCommit={(v) => {
                      const rotation = [...s.rotation] as [number, number, number];
                      rotation[i] = v;
                      change({ rotation });
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          {number('Guide size (studs)', 'size', 1, 1000)}
          {(
            [
              ['auto', 'Repeat new placements'],
              ['guide', 'Show guide'],
              ['preview', 'Preview selection'],
              ['children', 'Include attached children'],
              ['skipCentered', 'Skip centered parts'],
            ] as const
          ).map(([key, label]) => (
            <label class="mirror-check" key={key}>
              <input
                type="checkbox"
                checked={s[key]}
                onChange={(e) => change({ [key]: e.currentTarget.checked })}
              />
              {label}
            </label>
          ))}
          <p>
            {count} source {count === 1 ? 'part' : 'parts'}
            {preview?.count !== undefined
              ? ` · ${preview.count} preview ${preview.count === 1 ? 'copy' : 'copies'}`
              : ''}
          </p>
          {pendingSymmetrySig.value.size > 0 && (
            <p>
              {pendingSymmetrySig.value.size} pending placements stay in the preview until approved.{' '}
              <button class="button small" onClick={clearPendingSymmetry}>
                Forget pending previews
              </button>
            </p>
          )}
          {preview?.error && <p role="alert">{preview.error}</p>}
          <button
            class="button primary"
            disabled={!count || collaborationReadOnlySig.value}
            onClick={applySymmetry}
          >
            {pendingSymmetrySig.value.size > 0 ? 'Apply pending & selection' : 'Apply to selection'}
          </button>
          <p class="muted">
            The mirrored cursor preview is always shown. Repeat new placements controls whether
            copies are placed automatically. Originals stay. Apply and automatic placement are
            undoable. Native asymmetric shapes keep their geometry; placement positions and
            rotations are mirrored. Door A/B and C/D variants swap.
          </p>
        </>
      ) : (
        <p>
          Select one Part or Connector and use it as the anchor. Then select the parts to copy, or
          enable automatic placement.
        </p>
      )}
    </div>
  );
}
