import type { JSX } from 'preact';
import type { Vec3 } from '../../core/catalog-types';
import { quadPatch } from '../../core/surfaces/patches';
import type { Corners } from '../../core/surfaces/tiling';
import {
  activeSurfacePatchSig,
  addSurfaceSection,
  applySurfaceEdit,
  redoSurfaceEdit,
  removeSurfaceSection,
  resetSurfaceEdgeHandles,
  selectSurfaceColumn,
  selectSurfaceControl,
  selectSurfaceProfile,
  setSurfaceMode,
  startProfilesFromQuad,
  straightenSurfaceSegment,
  surfaceDraftHistorySig,
  surfaceDraftSig,
  undoSurfaceEdit,
} from '../../state/surface-draft';
import { toggleSurfaceCurves } from '../../state/surfaces';
import { modalActiveSig } from '../../tools/modal';
import { curveControlLayout } from '../../viewport/surface-curve-handles';

export function SurfaceCurveEditor({ corners }: { corners: Corners }): JSX.Element {
  const s = surfaceDraftSig.value,
    d = activeSurfacePatchSig.value,
    history = surfaceDraftHistorySig.value;
  const controls = d ? curveControlLayout(d, s.mode, s.profile) : [];
  const selected = d ? s.selected.filter((id) => Object.hasOwn(d.points, id)) : [];
  const center =
    d && selected.length
      ? [0, 1, 2].map(
          (k) => selected.reduce((sum, id) => sum + d.points[id][k], 0) / selected.length,
        )
      : null;
  const startOver = () => {
    const source = s.curved && s.quad ? s.quad : quadPatch(corners);
    if (
      s.profiles &&
      JSON.stringify(s.profiles) !== JSON.stringify(source) &&
      !window.confirm('Replace the current profiles with the four-corner surface?')
    )
      return;
    startProfilesFromQuad(corners);
  };
  return (
    <fieldset class="surface-curve-editor" disabled={modalActiveSig.value}>
      <legend>Surface shape</legend>
      <label class="gen-field">
        Mode
        <select
          aria-label="Surface mode"
          value={s.mode}
          onChange={(e) => setSurfaceMode(e.currentTarget.value as 'quad' | 'profiles', corners)}
        >
          <option value="quad">Four corners</option>
          <option value="profiles">Profiles</option>
        </select>
      </label>
      {s.mode === 'quad' && (
        <label class="gen-color-toggle">
          <input
            type="checkbox"
            checked={s.curved}
            onChange={(e) => toggleSurfaceCurves(e.currentTarget.checked)}
          />
          Curve edges
        </label>
      )}
      {d && (
        <>
          {s.mode === 'profiles' && (
            <>
              <div class="surface-profiles" aria-label="Profiles">
                {d.vBreaks.map((_, i) => (
                  <button
                    key={i}
                    class="button small"
                    aria-pressed={s.profile === i}
                    title="Select the whole profile; Shift adds or removes it"
                    onClick={(e) => selectSurfaceProfile(i, e.shiftKey)}
                  >
                    Profile {i + 1}
                  </button>
                ))}
              </div>
              <div class="surface-actions">
                <button class="button small" onClick={() => addSurfaceSection('v')}>
                  Add profile
                </button>
                <button
                  class="button small"
                  disabled={s.profile === 0 || s.profile === d.vBreaks.length - 1}
                  onClick={() => removeSurfaceSection('v')}
                >
                  Remove profile
                </button>
              </div>
              <label class="gen-field">
                Profile join
                <select
                  aria-label="Profile join"
                  disabled={s.profile === 0 || s.profile === d.vBreaks.length - 1}
                  value={d.vJoins[s.profile - 1] ?? 'boundary'}
                  onChange={(e) =>
                    applySurfaceEdit({
                      kind: 'join',
                      axis: 'v',
                      index: s.profile - 1,
                      mode: e.currentTarget.value as 'smooth' | 'crease',
                    })
                  }
                >
                  {(s.profile === 0 || s.profile === d.vBreaks.length - 1) && (
                    <option value="boundary">Boundary</option>
                  )}
                  <option value="smooth">Smooth</option>
                  <option value="crease">Crease</option>
                </select>
              </label>
              <label class="gen-field">
                Anchor column
                <select
                  aria-label="Anchor column"
                  value={s.column}
                  onChange={(e) => selectSurfaceColumn(Number(e.currentTarget.value))}
                >
                  {d.uBreaks.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <div class="surface-actions">
                <button class="button small" onClick={() => addSurfaceSection('u')}>
                  Add anchor column
                </button>
                <button
                  class="button small"
                  disabled={s.column === 0 || s.column === d.uBreaks.length - 1}
                  onClick={() => removeSurfaceSection('u')}
                >
                  Remove column
                </button>
              </div>
              <label class="gen-field">
                Column join
                <select
                  aria-label="Column join"
                  disabled={s.column === 0 || s.column === d.uBreaks.length - 1}
                  value={d.uJoins[s.column - 1] ?? 'boundary'}
                  onChange={(e) =>
                    applySurfaceEdit({
                      kind: 'join',
                      axis: 'u',
                      index: s.column - 1,
                      mode: e.currentTarget.value as 'smooth' | 'crease',
                    })
                  }
                >
                  {(s.column === 0 || s.column === d.uBreaks.length - 1) && (
                    <option value="boundary">Boundary</option>
                  )}
                  <option value="smooth">Smooth</option>
                  <option value="crease">Crease</option>
                </select>
              </label>
              <button class="button small" onClick={straightenSurfaceSegment}>
                Straighten profile segment
              </button>
            </>
          )}
          <label class="gen-field">
            Control
            <select
              aria-label="Surface control"
              value={selected.length === 1 ? selected[0] : ''}
              onChange={(e) => selectSurfaceControl(e.currentTarget.value || null)}
            >
              <option value="">Choose anchor or handle…</option>
              {controls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {center && (
            <fieldset class="surface-control-position">
              <legend>
                {selected.length === 1
                  ? (controls.find((c) => c.id === selected[0])?.label ?? 'Control')
                  : `${selected.length} controls · selection center`}{' '}
                (parent axes, studs)
              </legend>
              <div class="gen-field">
                {(['X', 'Y', 'Z'] as const).map((axis, k) => (
                  <label key={axis}>
                    {axis}
                    <input
                      type="number"
                      step="0.05"
                      aria-label={`Control ${axis}`}
                      value={Math.round(center[k] * 1e6) / 1e6}
                      onChange={(e) => {
                        const v = e.currentTarget.valueAsNumber;
                        if (!Number.isFinite(v)) return;
                        const current = activeSurfacePatchSig.peek()!;
                        const liveSelected = surfaceDraftSig
                          .peek()
                          .selected.filter((id) => Object.hasOwn(current.points, id));
                        if (!liveSelected.length) return;
                        const delta =
                          v -
                          liveSelected.reduce((sum, id) => sum + current.points[id][k], 0) /
                            liveSelected.length;
                        applySurfaceEdit({
                          kind: 'move',
                          positions: Object.fromEntries(
                            liveSelected.map((id) => {
                              const p = [...current.points[id]];
                              p[k] += delta;
                              return [id, p as unknown as Vec3];
                            }),
                          ),
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p class="hint">
            Click anchors or handles; Shift selects several. Drag the move gizmo or press G. Ctrl
            uses snap steps; enable World grid for grid coordinates. Esc cancels.
          </p>
          <div class="surface-actions">
            <button class="button small" disabled={!history.undo} onClick={undoSurfaceEdit}>
              Undo draft edit
            </button>
            <button class="button small" disabled={!history.redo} onClick={redoSurfaceEdit}>
              Redo draft edit
            </button>
          </div>
          {s.mode === 'quad' ? (
            <button class="button small" onClick={resetSurfaceEdgeHandles}>
              Reset edge handles
            </button>
          ) : (
            <button class="button small" onClick={startOver}>
              Start profiles from quad
            </button>
          )}
          <p class="hint">
            Guides stay local. Create adds ordinary GasCaps. Fixed-size plates approximate curves;
            tight bends may be unsupported.
          </p>
        </>
      )}
    </fieldset>
  );
}
