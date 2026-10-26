// The ground grid: a shader plane with 1-stud minor and 4-stud major lines that fades with distance.
import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAGMENT = /* glsl */ `
uniform float uFade;
uniform vec3 uEye;
uniform vec3 uMinor;
uniform vec3 uMajor;
uniform vec3 uAxisX;
uniform vec3 uAxisZ;
varying vec3 vWorld;

float lines(vec2 p, float size) {
  vec2 c = p / size;
  vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  vec2 p = vWorld.xz;
  float d = length(p - uEye.xz);
  float fade = 1.0 - smoothstep(uFade * 0.45, uFade, d);
  float minor = lines(p, 1.0) * (1.0 - smoothstep(uFade * 0.12, uFade * 0.35, d));
  float major = lines(p, 4.0);
  vec3 color = mix(uMinor, uMajor, major);
  float alpha = max(minor * 0.22, major * 0.42);
  vec2 w = fwidth(p) * 1.5;
  float ax = 1.0 - min(abs(p.y) / w.y, 1.0);
  float az = 1.0 - min(abs(p.x) / w.x, 1.0);
  color = mix(color, uAxisX, ax);
  color = mix(color, uAxisZ, az);
  alpha = max(alpha, max(ax, az) * 0.75) * fade;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;

export interface Grid {
  readonly mesh: Mesh;
  /** Re-centres the plane; `eye` is the navigation eye at the displayed view distance in either projection. */
  update(target: Vector3, distance: number, eye: Vector3): void;
  setTheme(theme: 'dark' | 'light'): void;
}

export function createGrid(): Grid {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const uniforms = {
    uFade: { value: 80 },
    uEye: { value: new Vector3() },
    uMinor: { value: new Color() },
    uMajor: { value: new Color() },
    uAxisX: { value: new Color(0xd9534f) },
    uAxisZ: { value: new Color(0x4a7fe0) },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  const grid: Grid = {
    mesh,
    update(target, distance, eye) {
      // Orthographic cameras are backed off 10,000 studs; fade from the navigation eye instead.
      uniforms.uEye.value.copy(eye);
      const fade = Math.min(3000, Math.max(60, distance * 6));
      uniforms.uFade.value = fade;
      mesh.position.set(Math.round(target.x), 0, Math.round(target.z));
      mesh.scale.setScalar(fade * 2.2);
    },
    setTheme(theme) {
      uniforms.uMinor.value.set(theme === 'dark' ? 0x8b919c : 0x6b7280);
      uniforms.uMajor.value.set(theme === 'dark' ? 0xaeb4be : 0x4b5260);
    },
  };
  grid.setTheme('dark');
  return grid;
}
