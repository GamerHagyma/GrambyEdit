import { NeutralToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';

export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/** sRGB output, Neutral tone mapping, transparent clear so the CSS gradient shows (spec §11.1). */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const r = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  r.outputColorSpace = SRGBColorSpace;
  r.toneMapping = NeutralToneMapping;
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setClearColor(0x000000, 0);
  // Counted per frame across every pass; the frame loop resets it.
  r.info.autoReset = false;
  return r;
}
