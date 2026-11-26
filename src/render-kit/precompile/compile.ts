/**
 * Precompilación de shaders y subida anticipada de texturas.
 *
 * three.js compila el programa de un material la primera vez que lo dibuja: eso es
 * un tirón de decenas a cientos de milisegundos. Acá se compilan por adelantado,
 * con `compileAsync` (KHR_parallel_shader_compile: no bloquea el hilo principal),
 * usando las luces y el entorno de la escena real, en sus variantes normal e
 * instanciada. Las texturas se suben a la GPU con `initTexture` antes de usarse.
 */
import * as THREE from 'three';

const tri = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
  return g;
})();

type AsyncRenderer = THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera, t?: THREE.Scene | null) => Promise<THREE.Object3D> };

let compileTarget: THREE.WebGLRenderTarget | null = null;

/**
 * Compila con un render target activo: el visor dibuja dentro del buffer del postprocesado
 * (espacio de color lineal), y esa es una variante de shader distinta de la de pantalla.
 */
function compileInTarget(gl: THREE.WebGLRenderer, object: THREE.Object3D, camera: THREE.Camera, targetScene: THREE.Scene | null, toScreen: boolean): Promise<unknown> {
  const r = gl as AsyncRenderer;
  if (!compileTarget) compileTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(toScreen ? null : compileTarget);
  try {
    if (r.compileAsync) return r.compileAsync(object, camera, targetScene);
    gl.compile(object, camera, targetScene ?? undefined);
    return Promise.resolve();
  } finally {
    gl.setRenderTarget(prev);
  }
}

export interface CompileOptions {
  /** También la variante instanciada (InstancedMesh). */
  instanced?: boolean;
  /** Variante para dibujar directo en pantalla (sin postprocesado). */
  toScreen?: boolean;
}

/** Compila `materials` para `targetScene` (sus luces, entorno y sombras). */
export async function compileMaterials(gl: THREE.WebGLRenderer, camera: THREE.Camera, targetScene: THREE.Scene, materials: THREE.Material[], { instanced = true, toScreen = false }: CompileOptions = {}): Promise<number> {
  const holder = new THREE.Scene();
  const extra: THREE.InstancedMesh[] = [];
  for (const m of new Set(materials)) {
    const mesh = new THREE.Mesh(tri, m);
    mesh.castShadow = mesh.receiveShadow = true;
    holder.add(mesh);
    if (instanced) {
      const im = new THREE.InstancedMesh(tri, m, 1);
      im.castShadow = im.receiveShadow = true;
      holder.add(im);
      extra.push(im);
    }
  }
  const before = gl.info.programs?.length ?? 0;
  await compileInTarget(gl, holder, camera, targetScene, toScreen);
  extra.forEach((im) => im.dispose());
  return (gl.info.programs?.length ?? 0) - before;
}

/** Compila todos los materiales de un objeto (escena aún no visible) con las luces de `targetScene`. */
export async function compileObject(gl: THREE.WebGLRenderer, camera: THREE.Camera, targetScene: THREE.Scene, object: THREE.Object3D, { toScreen = false }: CompileOptions = {}): Promise<void> {
  const wasVisible = object.visible;
  object.visible = true;
  let p: Promise<unknown>;
  try {
    p = compileInTarget(gl, object, camera, targetScene, toScreen);
  } finally {
    object.visible = wasVisible;
  }
  await p;
}

/**
 * Dibuja `object` una vez fuera de pantalla (render target de 1×1): además de los shaders
 * principales compila los de sus mapas de sombra, que `compileAsync` no cubre.
 */
export function renderOffscreen(gl: THREE.WebGLRenderer, object: THREE.Object3D, camera: THREE.Camera): void {
  if (!compileTarget) compileTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const wasVisible = object.visible;
  const prev = gl.getRenderTarget();
  const autoUpdate = gl.shadowMap.autoUpdate;
  object.visible = true;
  gl.shadowMap.autoUpdate = true;
  gl.shadowMap.needsUpdate = true;
  try {
    gl.setRenderTarget(compileTarget);
    gl.render(object, camera);
  } finally {
    gl.setRenderTarget(prev);
    gl.shadowMap.autoUpdate = autoUpdate;
    object.visible = wasVisible;
  }
}

/** Sube a la GPU todas las texturas de los materiales de `object` (y las sueltas que se pasen). */
export function uploadTextures(gl: THREE.WebGLRenderer, object: THREE.Object3D | null, more: (THREE.Texture | null | undefined)[] = []): number {
  const set = new Set<THREE.Texture>();
  object?.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v && (v as THREE.Texture).isTexture) set.add(v as THREE.Texture);
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) if (x?.value && (x.value as THREE.Texture).isTexture) set.add(x.value as THREE.Texture);
    }
  });
  for (const t of more) if (t) set.add(t);
  for (const t of set) gl.initTexture(t);
  return set.size;
}

/**
 * Cuadro de calentamiento: dibuja la escena completa una vez, fuera de pantalla, en el
 * estado que se indica (qué objetos se ven y cuáles no) y la deja como estaba. Compila
 * todo lo que ese estado necesita, incluidas las variantes de sombra.
 */
export function warmScene(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, state: [THREE.Object3D | undefined | null, boolean][]): void {
  if (!compileTarget) compileTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const items = state.filter((s): s is [THREE.Object3D, boolean] => !!s[0]);
  const saved = items.map(([o]) => o.visible);
  const prev = gl.getRenderTarget();
  const autoUpdate = gl.shadowMap.autoUpdate;
  items.forEach(([o, v]) => (o.visible = v));
  gl.shadowMap.autoUpdate = true;
  try {
    gl.setRenderTarget(compileTarget);
    gl.render(scene, camera);
  } finally {
    gl.setRenderTarget(prev);
    gl.shadowMap.autoUpdate = autoUpdate;
    items.forEach(([o], i) => (o.visible = saved[i]));
  }
}
