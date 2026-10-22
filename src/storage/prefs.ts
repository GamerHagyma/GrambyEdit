// Small preferences in localStorage, keys prefixed `grambyedit:`. Storage can be missing or full
// (private windows, quota), so every call is guarded; write failures go to a reporter the UI sets.
const PREFIX = 'grambyedit:';

let report: (message: string) => void = () => {};

/** The UI registers a toast here, so storage failures surface without storage importing the UI. */
export function setStorageErrorReporter(fn: (message: string) => void): void {
  report = fn;
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    report('Could not save your preferences: browser storage is unavailable or full.');
  }
}
