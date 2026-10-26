import { Euler } from 'three';
import { batch } from '@preact/signals';
import { getViewport } from '../../viewport/context';
import {
  insertReferencePlane,
  updateReferencePlane,
  removeReferencePlane,
  referencePlanesSig,
  editingReferencePlaneSig,
  referencePlaneModeSig,
  type ReferenceVector,
  activeReferenceIdSig,
} from '../../state/references';
import { clearSelection } from '../../state/selection';
import { runCommand } from '../../state/commands';
import { showInspectorTab } from '../../state/ui';
import { NumberScrub } from '../widgets/NumberScrub';

export function ReferencePlaneControls({ id }: { id: number }) {
  const plane = referencePlanesSig.value.get(id);
  const editing = editingReferencePlaneSig.value === id;
  const activate = (mode: 'translate' | 'rotate' | 'scale') =>
    batch(() => {
      showInspectorTab('reference');
      runCommand(`tool.${mode === 'rotate' ? 'rotate' : mode === 'translate' ? 'move' : 'select'}`);
      clearSelection();
      activeReferenceIdSig.value = id;
      editingReferencePlaneSig.value = id;
      referencePlaneModeSig.value = mode;
    });
  const insert = () => {
    const rig = getViewport()?.rig;
    const e = rig ? new Euler().setFromQuaternion(rig.camera.quaternion) : new Euler();
    batch(() => {
      insertReferencePlane(
        id,
        rig ? (rig.target.toArray() as [number, number, number]) : [0, 0, 0],
        [e.x, e.y, e.z].map((r) => (r * 180) / Math.PI) as [number, number, number],
      );
      activate('translate');
    });
  };
  return (
    <section class="reference-plane-controls" aria-label="Workspace image plane">
      {!plane ? (
        <button class="button" onClick={insert}>
          Insert image plane
        </button>
      ) : (
        <>
          <div class="reference-actions">
            <button
              class="button"
              aria-pressed={editing}
              onClick={() => {
                if (editing) editingReferencePlaneSig.value = null;
                else activate('translate');
              }}
            >
              {editing ? 'Finish editing plane' : 'Edit plane in workspace'}
            </button>
            <button class="button" onClick={() => removeReferencePlane(id)}>
              Remove plane
            </button>
          </div>
          <div class="reference-actions" role="group" aria-label="Plane gizmo">
            {(['translate', 'rotate', 'scale'] as const).map((mode, i) => (
              <button
                class="button"
                key={mode}
                aria-pressed={referencePlaneModeSig.value === mode && editing}
                onClick={() => {
                  activate(mode);
                }}
              >
                {['Move plane', 'Rotate plane', 'Resize plane'][i]}
              </button>
            ))}
          </div>
          {(['position', 'rotation'] as const).map((key) => (
            <div class="reference-plane-vector" key={key}>
              <span>{key === 'position' ? 'Position' : 'Rotation (°)'}</span>
              {['X', 'Y', 'Z'].map((axis, i) => (
                <label key={axis}>
                  <span class="visually-hidden">Plane {key} </span>
                  {axis}
                  <NumberScrub
                    id={`reference-plane-${id}-${key}-${axis}`}
                    value={plane[key][i]}
                    step={key === 'position' ? 0.1 : 1}
                    placeholder="0"
                    onCommit={(value) => {
                      updateReferencePlane(id, {
                        [key]: plane[key].map((v, k) =>
                          k === i ? value : v,
                        ) as unknown as ReferenceVector,
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
          {(['width', 'height', 'opacity'] as const).map((key) => (
            <label class="reference-plane-number" key={key}>
              {key === 'opacity' ? 'Plane opacity' : `Plane ${key} (studs)`}
              <NumberScrub
                value={plane[key]}
                placeholder="1"
                min={key === 'opacity' ? 0 : 0.01}
                id={`reference-plane-${id}-${key}`}
                max={key === 'opacity' ? 1 : 1e5}
                step={key === 'opacity' ? 0.05 : 0.1}
                onCommit={(v) => updateReferencePlane(id, { [key]: v })}
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={plane.visible}
              onChange={(e) => updateReferencePlane(id, { visible: e.currentTarget.checked })}
            />{' '}
            Show plane
          </label>
        </>
      )}
      <p class="muted">
        Local only; excluded from exports and collaboration. In the Reference tab, click a plane and
        use Select / Move / Rotate (1 / 2 / 3). G / R also move or rotate; T resizes. Esc finishes
        editing.
      </p>
    </section>
  );
}
