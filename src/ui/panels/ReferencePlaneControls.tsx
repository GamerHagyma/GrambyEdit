import { Euler } from 'three';
import { getViewport } from '../../viewport/context';
import {
  insertReferencePlane,
  updateReferencePlane,
  removeReferencePlane,
  referencePlanesSig,
  editingReferencePlaneSig,
  referencePlaneModeSig,
  type ReferenceVector,
} from '../../state/references';
import { NumberScrub } from '../widgets/NumberScrub';

export function ReferencePlaneControls({ id }: { id: number }) {
  const plane = referencePlanesSig.value.get(id);
  const editing = editingReferencePlaneSig.value === id;
  const insert = () => {
    const rig = getViewport()?.rig;
    const e = rig ? new Euler().setFromQuaternion(rig.camera.quaternion) : new Euler();
    insertReferencePlane(
      id,
      rig ? (rig.target.toArray() as [number, number, number]) : [0, 0, 0],
      [e.x, e.y, e.z].map((r) => (r * 180) / Math.PI) as [number, number, number],
    );
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
                editingReferencePlaneSig.value = editing ? null : id;
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
                  referencePlaneModeSig.value = mode;
                  editingReferencePlaneSig.value = id;
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
        Local reference only; excluded from exports and collaboration. Use the plane gizmo or these
        fields. Finish editing to resume part tools.
      </p>
    </section>
  );
}
