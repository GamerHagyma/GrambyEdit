// The selection outline (spec §11.1): highlighted instances render into a mask, then a full-screen
// edge pass draws orange around the selection, white around the hovered part and amber around the
// active part. Like Blender's, it works for any number of selected parts.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type WebGLRenderer,
} from 'three';
import type { PartsLayer } from './parts-layer';

const MASK_VERTEX = /* glsl */ `
attribute float aFlags;
varying vec3 vMask;
void main() {
  float sel = mod(aFlags, 2.0);
  float hov = mod(floor(aFlags / 2.0), 2.0);
  float act = mod(floor(aFlags / 32.0), 2.0);
  vMask = vec3(sel, hov, act);
  gl_Position = sel + hov > 0.0
    ? projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0)
    : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const MASK_FRAGMENT = /* glsl */ `
varying vec3 vMask;
void main() { gl_FragColor = vec4(vMask, 1.0); }`;

const EDGE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const EDGE_FRAGMENT = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform vec3 uSelect;
uniform vec3 uHover;
uniform vec3 uActive;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uMask, vUv).rgb;
  vec3 m = vec3(0.0);
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      m = max(m, texture2D(uMask, vUv + vec2(float(x), float(y)) * uTexel).rgb);
    }
  }
  vec4 outColor = vec4(0.0);
  if (m.b > 0.5 && c.b < 0.5) outColor = vec4(uActive, 1.0);
  else if (m.r > 0.5 && c.r < 0.5) outColor = vec4(uSelect, 1.0);
  else if (m.g > 0.5 && c.g < 0.5 && c.r < 0.5) outColor = vec4(uHover, 0.9);
  if (outColor.a == 0.0) discard;
  gl_FragColor = outColor;
  #include <colorspace_fragment>
}`;

export class Outline {
  private mask: WebGLRenderTarget | null = null;
  private readonly maskMaterial = new ShaderMaterial({
    vertexShader: MASK_VERTEX,
    fragmentShader: MASK_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  private readonly edge = new ShaderMaterial({
    uniforms: {
      uMask: { value: null },
      uTexel: { value: new Vector2() },
      uSelect: { value: new Color(0xff9d2e) },
      uHover: { value: new Color(0xffffff) },
      uActive: { value: new Color(0xffc46b) },
    },
    vertexShader: EDGE_VERTEX,
    fragmentShader: EDGE_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera();

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    const quad = new Mesh(g, this.edge);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /** Draws the outline over the frame already on screen. Does nothing without highlights. */
  render(renderer: WebGLRenderer, layer: PartsLayer, camera: Camera): void {
    if (!layer.hasHighlight()) return;
    const canvas = renderer.domElement;
    const W = canvas.width;
    const H = canvas.height;
    this.mask ??= new WebGLRenderTarget(W, H);
    if (this.mask.width !== W || this.mask.height !== H) this.mask.setSize(W, H);

    const meshes = layer.meshes();
    const saved: Material[] = meshes.map((m) => m.material as Material);
    for (const mesh of meshes) mesh.material = this.maskMaterial;
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.mask);
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.render(layer.group, camera);
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(alpha);
    meshes.forEach((mesh, i) => (mesh.material = saved[i]));

    this.edge.uniforms.uMask.value = this.mask.texture;
    this.edge.uniforms.uTexel.value.set(1 / W, 1 / H);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.quadScene, this.quadCamera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.mask?.dispose();
    this.maskMaterial.dispose();
    this.edge.dispose();
  }
}
