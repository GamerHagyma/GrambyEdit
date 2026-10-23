// Key bindings per camera scheme (spec Appendix A), as data. No binding uses a Ctrl combination that
// browsers keep for themselves or that reloads the page (Ctrl+T/N/W/Tab, Ctrl+1–9, Ctrl+R).
export type Scheme = 'blender' | 'studio';

export interface KeyBinding {
  /** `G`, `Shift+D`, `Ctrl+Shift+P`, `Numpad7`, `Delete`, `Escape`, `Alt+Z`, `?`. */
  readonly keys: string;
  readonly command: string;
}

const TOOLS: readonly KeyBinding[] = [
  { keys: '1', command: 'tool.select' },
  { keys: '2', command: 'tool.move' },
  { keys: '3', command: 'tool.rotate' },
  { keys: '4', command: 'tool.connect' },
  { keys: '5', command: 'tool.point' },
  { keys: '6', command: 'tool.paint' },
];

/** Bindings both schemes share. */
const COMMON: readonly KeyBinding[] = [
  ...TOOLS,
  { keys: 'Tab', command: 'mode.toggle' },
  { keys: 'G', command: 'transform.grab' },
  { keys: 'R', command: 'transform.rotate' },
  { keys: 'Ctrl+I', command: 'select.invert' },
  { keys: 'L', command: 'select.linked' },
  { keys: 'Ctrl+L', command: 'select.connected' },
  { keys: 'Shift+G', command: 'select.similarType' },
  { keys: 'Ctrl+C', command: 'edit.copy' },
  { keys: 'Ctrl+V', command: 'edit.paste' },
  { keys: 'Ctrl+Z', command: 'edit.undo' },
  { keys: 'Ctrl+Shift+Z', command: 'edit.redo' },
  { keys: 'Ctrl+Y', command: 'edit.redo' },
  { keys: 'H', command: 'view.hide' },
  { keys: 'Alt+H', command: 'view.unhide' },
  { keys: 'Shift+H', command: 'view.isolate' },
  { keys: 'Home', command: 'view.frameAll' },
  { keys: 'Alt+Z', command: 'view.xray' },
  { keys: 'Ctrl+S', command: 'file.save' },
  { keys: 'Ctrl+O', command: 'file.import' },
  { keys: 'Ctrl+E', command: 'file.export' },
  { keys: 'F3', command: 'app.palette' },
  { keys: 'Ctrl+Shift+P', command: 'app.palette' },
  { keys: '?', command: 'app.shortcuts' },
  { keys: 'Escape', command: 'app.cancel' },
];

export const KEYMAPS: Readonly<Record<Scheme, readonly KeyBinding[]>> = {
  blender: [
    ...COMMON,
    { keys: 'A', command: 'select.all' },
    { keys: 'Alt+A', command: 'select.none' },
    { keys: 'B', command: 'select.box' },
    { keys: 'X', command: 'edit.delete' },
    { keys: 'Delete', command: 'edit.delete' },
    { keys: 'Shift+D', command: 'edit.duplicate' },
    { keys: 'Numpad.', command: 'view.frameSelected' },
    { keys: 'Numpad1', command: 'view.front' },
    { keys: 'Numpad3', command: 'view.right' },
    { keys: 'Numpad7', command: 'view.top' },
    { keys: 'Numpad9', command: 'view.flip' },
    { keys: 'Numpad5', command: 'view.ortho' },
  ],
  // W, A, S, D, Q and E fly the Studio camera, so none of them is a command here.
  studio: [
    ...COMMON,
    { keys: 'Ctrl+A', command: 'select.all' },
    { keys: 'Delete', command: 'edit.delete' },
    { keys: 'Ctrl+D', command: 'edit.duplicate' },
    { keys: 'F', command: 'view.frameSelected' },
  ],
};

type KeyEventLike = {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

/** A key event as a binding string: `Ctrl+`, `Alt+`, `Shift+` prefixes (Cmd counts as Ctrl), then the key. */
export function keyString(e: KeyEventLike): string {
  let main: string;
  if (e.code.startsWith('Numpad')) main = e.code === 'NumpadDecimal' ? 'Numpad.' : e.code;
  else if (/^Key[A-Z]$/.test(e.code)) main = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) main = e.code.slice(5);
  else main = e.key;
  // A symbol already says whether Shift was down (? is Shift+/).
  const punctuation = main.length === 1 && !/[A-Za-z0-9]/.test(main);
  return (
    (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') +
    (e.altKey ? 'Alt+' : '') +
    (e.shiftKey && !punctuation ? 'Shift+' : '') +
    main
  );
}

/** The command a key runs in a scheme, or null. */
export function resolveKey(e: KeyEventLike, scheme: Scheme): string | null {
  const keys = keyString(e);
  return KEYMAPS[scheme].find((b) => b.keys === keys)?.command ?? null;
}

/** Every key bound to a command in a scheme, in keymap order. */
export function keysFor(command: string, scheme: Scheme): string[] {
  return KEYMAPS[scheme].filter((b) => b.command === command).map((b) => b.keys);
}

/** Text fields keep their keys: shortcuts never fire while one has focus. */
export function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
  );
}
