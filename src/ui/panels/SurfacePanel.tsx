// The Surfaces panel (spec §13.11, D22): GasCaps laid over a face of a parent part. The parent is picked in the
// build, its four corners are set in its own axes, and Create puts the caps on it in one step.
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Vec3 } from '../../core/catalog-types';
import { capSize } from '../../core/surfaces/build';
import {
  clearSurface,
  createSurface,
  enterSurfaceTab,
  leaveSurfaceTab,
  pickSurfaceHost,
  resetCorners,
  selectCorner,
  setCorner,
  setSurfaceColor,
  surfaceBuildSig,
  surfaceCostSig,
  surfaceCreatedSig,
  surfaceHostSig,
  surfaceSig,
} from '../../state/surfaces';
import { catalogSig } from '../../state/store';
import { toolSig } from '../../tools/manager';
import { ColorFields } from '../widgets/ColorFields';

/** The corner `at` with its coordinate `k` (0 for X, 1 for Y, 2 for Z) replaced by `v`. */
function withCoord(at: Vec3, k: number, v: number): Vec3 {
  return [k === 0 ? v : at[0], k === 1 ? v : at[1], k === 2 ? v : at[2]];
}

/**
 * The Surfaces panel. Without a parent it only asks for one; with one it shows the corners, what Create would
 * add, the colours and Create.
 */
export function SurfacePanel(): JSX.Element {
  const cat = catalogSig.value;
  const host = surfaceHostSig.value;
  const { corners, selected, color } = surfaceSig.value;
  const built = surfaceBuildSig.value;
  const cost = surfaceCostSig.value;
  const created = surfaceCreatedSig.value;

  useEffect(() => {
    enterSurfaceTab();
    return () => leaveSurfaceTab();
  }, []);

  if (!cat) {
    return (
      <div class="surfaces">
        <p class="empty">The part library is still loading.</p>
      </div>
    );
  }
  if (!capSize(cat)) {
    return (
      <div class="surfaces">
        <p class="empty">This part library has no GasCap.</p>
      </div>
    );
  }

  return (
    <div class="surfaces">
      <div class="gen-field">
        <span class="gen-label">Parent</span>
        {host ? (
          <>
            <span class="gen-host-picked">
              #{host.id} {host.type}
            </span>
            <button class="button small" onClick={pickSurfaceHost}>
              Pick again
            </button>
            <button class="button small" onClick={clearSurface}>
              Clear
            </button>
          </>
        ) : (
          <button
            class="button small"
            aria-pressed={toolSig.value === 'pick'}
            onClick={pickSurfaceHost}
          >
            Pick parent
          </button>
        )}
      </div>
      {host ? (
        <>
          <fieldset class="surface-corners">
            <legend>Corners (parent axes, studs) · Shift+click for several</legend>
            {corners.map((corner, i) => (
              <div class={selected.includes(i) ? 'gen-field active' : 'gen-field'} key={i}>
                <button
                  class="button small"
                  aria-pressed={selected.includes(i)}
                  title="Shift+click to add or take out corners"
                  onClick={(e) =>
                    // A plain click on the only chosen corner lets it go.
                    e.shiftKey || selected.length !== 1 || selected[0] !== i
                      ? selectCorner(i, e.shiftKey)
                      : selectCorner(null)
                  }
                >
                  Corner {i + 1}
                </button>
                {(['X', 'Y', 'Z'] as const).map((axis, k) => (
                  <input
                    key={axis}
                    type="number"
                    step="0.05"
                    aria-label={`Corner ${i + 1} ${axis}`}
                    // Six decimals: a typed value keeps every digit (a GasCap is 0.6446 wide).
                    value={Math.round(corner[k] * 1e6) / 1e6}
                    onInput={(e) => {
                      // The state's corner, not the one this render drew: a render may still be pending.
                      const v = parseFloat(e.currentTarget.value);
                      if (Number.isFinite(v)) {
                        setCorner(i, withCoord(surfaceSig.value.corners[i], k, v));
                      }
                    }}
                    // Typing into a chosen corner keeps the choice; another corner is chosen alone.
                    onFocus={() => {
                      if (!surfaceSig.value.selected.includes(i)) selectCorner(i);
                    }}
                  />
                ))}
              </div>
            ))}
          </fieldset>
          <button class="button small" onClick={resetCorners}>
            Reset corners
          </button>
          {created !== null ? (
            <p class="gen-cost" role="status">
              Created {created} GasCaps. Undo to adjust and create again.
            </p>
          ) : built?.ok ? (
            <>
              <p class="gen-cost" role="status">
                {built.count} GasCaps in {built.rows} {built.rows === 1 ? 'row' : 'rows'}
              </p>
              {cost?.ok && (
                <>
                  <p class="gen-cost">{cost.cost.text}</p>
                  {cost.cost.crossings.map((x) => (
                    <p key={x} class="gen-warning">
                      Crosses {x}
                    </p>
                  ))}
                </>
              )}
            </>
          ) : (
            built && (
              <p class="gen-error" role="alert">
                {built.error}
              </p>
            )
          )}
          <div class="gen-form">
            <ColorFields
              idPrefix="surf"
              color={color}
              axes={[
                { id: 'u', label: 'Corner 1 → 2' },
                { id: 'v', label: 'Corner 1 → 4' },
              ]}
              onChange={setSurfaceColor}
            />
          </div>
          <button class="button primary" disabled={!built?.ok} onClick={createSurface}>
            Create
          </button>
        </>
      ) : (
        <p class="hint">
          Click the part the surface hangs from. The surface starts on the face you click.
        </p>
      )}
    </div>
  );
}
