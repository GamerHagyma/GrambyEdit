import { signal } from '@preact/signals';

/** Per-browser projection state; camera framing is maintained by CameraRig. */
export const orthographicSig = signal(false);
