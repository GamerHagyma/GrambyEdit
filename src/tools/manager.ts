// The active tool (spec §12): the viewport forwards pointer and key input that navigation did not take.
import { signal } from '@preact/signals';
import type { Vector2 } from 'three';

export type ToolId = 'select' | 'move' | 'rotate' | 'connect' | 'point' | 'paint' | 'place' | 'sockets';

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

/** Tool hotkeys, plain digits in both camera schemes (Ctrl+digits switch browser tabs). */
export const TOOL_KEYS: Readonly<Partial<Record<ToolId, string>>> = {
  select: '1',
  move: '2',
  rotate: '3',
  connect: '4',
  point: '5',
  paint: '6',
};

/** A plain digit switches to its tool. True when the key was used. */
export function toolHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !/^Digit[1-9]$/.test(e.code)) return false;
  const digit = e.code.slice(5);
  const id = (Object.keys(TOOL_KEYS) as ToolId[]).find((t) => TOOL_KEYS[t] === digit);
  if (id === undefined) return false;
  setTool(id);
  return true;
}
