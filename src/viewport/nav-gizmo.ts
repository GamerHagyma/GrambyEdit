// The navigation gizmo (spec §11.1): an SVG axis widget in the top-right corner. Clicking an axis
// snaps the view to look down it, Blender style. SVG keeps it crisp and costs no draw calls.
import { Vector3, type Camera } from 'three';
import type { ViewAxis } from './cameras/rig';

const NS = 'http://www.w3.org/2000/svg';
const R = 32;

const AXES: readonly {
  dir: Vector3;
  label: string;
  color: string;
  view: ViewAxis;
  positive: boolean;
}[] = [
  { dir: new Vector3(1, 0, 0), label: 'X', color: '#e5484d', view: 'right', positive: true },
  { dir: new Vector3(0, 1, 0), label: 'Y', color: '#46a758', view: 'top', positive: true },
  { dir: new Vector3(0, 0, 1), label: 'Z', color: '#3e7bfa', view: 'front', positive: true },
  { dir: new Vector3(-1, 0, 0), label: '', color: '#e5484d', view: 'left', positive: false },
  { dir: new Vector3(0, -1, 0), label: '', color: '#46a758', view: 'bottom', positive: false },
  { dir: new Vector3(0, 0, -1), label: '', color: '#3e7bfa', view: 'back', positive: false },
];

export interface NavGizmo {
  update(camera: Camera): void;
  dispose(): void;
}

export function createNavGizmo(container: HTMLElement, onView: (axis: ViewAxis) => void): NavGizmo {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'nav-gizmo');
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'View axes');
  container.append(svg);
  const onClick = (e: MouseEvent) => {
    const view = (e.target as Element).closest('[data-view]')?.getAttribute('data-view');
    if (view) onView(view as ViewAxis);
  };
  svg.addEventListener('click', onClick);
  const v = new Vector3();
  let last = '';

  return {
    update(camera) {
      const inv = camera.matrixWorldInverse;
      const items = AXES.map((a) => {
        v.copy(a.dir).transformDirection(inv);
        return { a, x: v.x * R, y: -v.y * R, z: v.z };
      }).sort((p, q) => p.z - q.z);
      const key = items.map((i) => `${i.x.toFixed(1)},${i.y.toFixed(1)}`).join(';');
      if (key === last) return;
      last = key;
      svg.replaceChildren(
        ...items.flatMap(({ a, x, y }) => {
          const nodes: SVGElement[] = [];
          if (a.positive) {
            const line = document.createElementNS(NS, 'line');
            Object.entries({
              x1: 0,
              y1: 0,
              x2: x,
              y2: y,
              stroke: a.color,
              'stroke-width': 2.5,
            }).forEach(([k, val]) => line.setAttribute(k, String(val)));
            nodes.push(line);
          }
          const g = document.createElementNS(NS, 'g');
          g.setAttribute('data-view', a.view);
          g.setAttribute('class', 'nav-axis');
          const label = `${a.positive ? '' : '−'}${a.dir.x ? 'X' : a.dir.y ? 'Y' : 'Z'} view`;
          g.setAttribute('aria-label', label);
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', String(x));
          c.setAttribute('cy', String(y));
          c.setAttribute('r', a.positive ? '9' : '6.5');
          c.setAttribute('fill', a.positive ? a.color : 'transparent');
          c.setAttribute('stroke', a.color);
          c.setAttribute('stroke-width', '2');
          g.append(c);
          if (a.label) {
            const t = document.createElementNS(NS, 'text');
            t.setAttribute('x', String(x));
            t.setAttribute('y', String(y + 3.5));
            t.setAttribute('text-anchor', 'middle');
            t.textContent = a.label;
            g.append(t);
          }
          nodes.push(g);
          return nodes;
        }),
      );
    },
    dispose() {
      svg.removeEventListener('click', onClick);
      svg.remove();
    },
  };
}
