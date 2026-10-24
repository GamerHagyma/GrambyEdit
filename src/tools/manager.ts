// The active tool (spec §12): the viewport forwards pointer and key input that navigation did not take.
import { signal } from '@preact/signals';
import type { Vector2 } from 'three';

export type ToolId =
  | 'select'
  | 'move'
  | 'rotate'
  | 'connect'
  | 'point'
  | 'paint'
  | 'place'
  | 'sockets'
  | 'pick'
  | 'surface';

export interface ToolPointer {
  kind: 'down' | 'move' | 'up';
  /** The pressed button; -1 for a hover move with no button down. */
  button: number;
  /** Client coordinates, CSS pixels. */
  x: number;
  y: number;
  ndc: Vector2;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export interface Tool {
  readonly id: ToolId;
  activate(): void;
  deactivate(): void;
  onPointer?(e: ToolPointer): void;
  /** True when the tool handled the key. */
  onKey?(e: KeyboardEvent): boolean;
}

export const toolSig = signal<ToolId>('select');
const tools = new Map<ToolId, Tool>();
let active: Tool | null = null;

/** Registers a tool; registering the current tool's id activates it. Idempotent per id. */
export function registerTool(t: Tool): void {
  if (tools.get(t.id) === t) return;
  tools.set(t.id, t);
  if (toolSig.value === t.id) {
    active?.deactivate();
    active = t;
    t.activate();
  }
}

/** Switches tools. Ids without a registered tool (not built yet) are ignored. */
export function setTool(id: ToolId): void {
  const next = tools.get(id);
  if (!next || active === next) return;
  active?.deactivate();
  active = next;
  toolSig.value = id;
  next.activate();
}

export function toolPointer(e: ToolPointer): void {
  active?.onPointer?.(e);
}

export function toolKey(e: KeyboardEvent): boolean {
  return active?.onKey?.(e) ?? false;
}
