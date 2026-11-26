/**
 * Acumulador de cuadros en la GPU: promedio progresivo de muchos cuadros "movidos" un
 * poco (jitter subpíxel de la cámara, de la luz y de la lente) → antialiasing perfecto,
 * sombras suaves y profundidad de campo, sin ruido, al quedarse quieto.
 *
 * Después de que el postprocesado dibuja en pantalla: `add()` copia el cuadro a una
 * textura (GPU → GPU), lo mezcla con el promedio (render targets de media precisión,
 * en ping-pong) y `present()` dibuja el promedio en pantalla.
 */
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BLEND = `uniform sampler2D tPrev; uniform sampler2D tFrame; uniform float uWeight; varying vec2 vUv;
void main(){ vec3 p = texture2D(tPrev, vUv).rgb; vec3 f = texture2D(tFrame, vUv).rgb; gl_FragColor = vec4(mix(p, f, uWeight), 1.0); }`;
const SHOW = `uniform sampler2D tAccum; uniform float uOpacity; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tAccum, vUv).rgb, uOpacity); }`;

export class FrameAccumulator {
  private frame = new THREE.FramebufferTexture(1, 1);
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private blend: THREE.ShaderMaterial;
  private show: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new THREE.Vector2();
  /** Cuadros sumados al promedio. */
  count = 0;

  constructor() {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.a = new THREE.WebGLRenderTarget(1, 1, opts);
    this.b = new THREE.WebGLRenderTarget(1, 1, opts);
    this.frame.minFilter = this.frame.magFilter = THREE.NearestFilter;
    this.blend = new THREE.ShaderMaterial({ uniforms: { tPrev: { value: null }, tFrame: { value: this.frame }, uWeight: { value: 1 } }, vertexShader: VERT, fragmentShader: BLEND, depthTest: false, depthWrite: false, toneMapped: false });
    this.show = new THREE.ShaderMaterial({ uniforms: { tAccum: { value: null }, uOpacity: { value: 1 } }, vertexShader: VERT, fragmentShader: SHOW, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, this.blend);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Programas propios compilados de antemano. */
  compile(gl: THREE.WebGLRenderer): void {
    this.quad.material = this.blend;
    gl.compile(this.scene, this.cam);
    this.quad.material = this.show;
    gl.compile(this.scene, this.cam);
  }

  reset(): void {
    this.count = 0;
  }

  private ensure(gl: THREE.WebGLRenderer): void {
    gl.getDrawingBufferSize(this.size);
    const { x, y } = this.size;
    if (this.a.width !== x || this.a.height !== y) {
      this.a.setSize(x, y);
      this.b.setSize(x, y);
      this.frame.dispose();
      this.frame.image.width = x;
      this.frame.image.height = y;
      this.count = 0;
    }
  }

  /** Suma el cuadro que acaba de dibujarse en pantalla al promedio. */
  add(gl: THREE.WebGLRenderer): void {
    this.ensure(gl);
    gl.setRenderTarget(null);
    gl.copyFramebufferToTexture(this.frame, new THREE.Vector2(0, 0));
    this.blend.uniforms.tPrev.value = this.a.texture;
    this.blend.uniforms.uWeight.value = 1 / (this.count + 1);
    this.quad.material = this.blend;
    gl.setRenderTarget(this.b);
    gl.render(this.scene, this.cam);
    gl.setRenderTarget(null);
    [this.a, this.b] = [this.b, this.a];
    this.count++;
  }

  /** Dibuja el promedio en pantalla (encima de lo que haya). */
  present(gl: THREE.WebGLRenderer, opacity = 1): void {
    if (this.count === 0) return;
    this.show.uniforms.tAccum.value = this.a.texture;
    this.show.uniforms.uOpacity.value = opacity;
    this.quad.material = this.show;
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.render(this.scene, this.cam);
    gl.autoClear = auto;
  }

  dispose(): void {
    this.frame.dispose();
    this.a.dispose();
    this.b.dispose();
    this.blend.dispose();
    this.show.dispose();
    this.quad.geometry.dispose();
  }
}

/** Secuencia de Halton (baja discrepancia) para el jitter. */
export function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

export interface JitterTargets {
  camera: THREE.PerspectiveCamera;
  /** Luz principal con sombra (se mueve dentro de un disco para ablandar la sombra). */
  light: THREE.DirectionalLight | null;
  /** Radio del disco de la luz (m) y apertura de la lente (m; 0 = sin profundidad de campo). */
  lightRadius: number;
  aperture: number;
  focusDistance: number;
}

/**
 * Aplica el jitter de la muestra `i` y devuelve la función que deja todo como estaba.
 * Subpíxel (antialiasing), disco de luz (sombras suaves) y lente (profundidad de campo,
 * con el plano de foco fijo).
 */
export function applyJitter(t: JitterTargets, i: number, width: number, height: number): () => void {
  const cam = t.camera;
  const savedPos = cam.position.clone();
  const view = cam.view?.enabled ? { ...cam.view } : null;
  let lx = halton(i + 1, 2) - 0.5;
  let ly = halton(i + 1, 3) - 0.5;
  // Lente: punto del disco de apertura; se compensa el corrimiento para que el foco no se mueva.
  let dx = 0;
  let dy = 0;
  if (t.aperture > 0) {
    const r = Math.sqrt(halton(i + 1, 5)) * t.aperture;
    const a = halton(i + 1, 7) * Math.PI * 2;
    dx = Math.cos(a) * r;
    dy = Math.sin(a) * r;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, dx).addScaledVector(up, dy);
    cam.updateMatrixWorld();
    const pxPerUnit = height / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.max(0.1, t.focusDistance);
    lx -= dx * pxPerUnit;
    ly += dy * pxPerUnit;
  }
  cam.setViewOffset(width, height, lx, ly, width, height);
  // Luz dentro de un disco perpendicular a su dirección.
  let restoreLight = () => undefined as void;
  if (t.light && t.lightRadius > 0) {
    const L = t.light;
    const saved = L.position.clone();
    const dir = saved.clone().sub(L.target.position).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const v = dir.clone().cross(u);
    const r = Math.sqrt(halton(i + 1, 11)) * t.lightRadius;
    const a = halton(i + 1, 13) * Math.PI * 2;
    L.position.addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    L.updateMatrixWorld();
    restoreLight = () => {
      L.position.copy(saved);
      L.updateMatrixWorld();
    };
  }
  return () => {
    cam.position.copy(savedPos);
    cam.updateMatrixWorld();
    if (view) cam.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    else cam.clearViewOffset();
    restoreLight();
  };
}
