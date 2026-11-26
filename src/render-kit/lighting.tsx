/**
 * Luz y "look" por escena (render-kit).
 *
 * - `useExposure(v)`: exposición del mapeo de tonos (AgX) calibrada por escena.
 * - `<ModelContactShadows>`: sombras de contacto bajo el producto que se re-renderizan sólo cuando el
 *   producto cambia (no en cada cuadro): se pasan `version` (cambia al reconstruir) y `settled`.
 * - `sunPosition(dir, dist)`: luz direccional alineada con el sol del HDR.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib';
import { Environment, useEnvironment, type EnvironmentProps } from '@react-three/drei';
import * as THREE from 'three';
import { useWarmup } from './warmup';

export function useExposure(value: number) {
  const gl = useThree((s) => s.gl);
  const warm = useWarmup();
  useEffect(() => {
    if (warm) return;
    const prev = gl.toneMappingExposure;
    gl.toneMappingExposure = value;
    return () => {
      gl.toneMappingExposure = prev;
    };
  }, [gl, value, warm]);
}

/** Posición de una luz direccional en la dirección del sol (vector unitario hacia el sol). */
export function sunPosition(dir: [number, number, number], dist = 24): [number, number, number] {
  return [dir[0] * dist, dir[1] * dist, dir[2] * dist];
}

interface ContactProps {
  /** devuelve un número que cambia cada vez que el producto se reconstruye o se mueve */
  version: () => number;
  /** el producto está quieto (no se re-renderiza durante animaciones) */
  settled: () => boolean;
  /** lado del área cubierta en metros (fijo: no se recrean recursos si cambia el producto) */
  size?: number;
  opacity?: number;
  blur?: number;
  far?: number;
  resolution?: number;
  color?: string;
}

/**
 * Sombras de contacto bajo el producto, adaptadas de ContactShadows de drei (MIT): los render targets,
 * materiales y geometrías se crean UNA vez; la sombra se re-renderiza sólo cuando `version()` cambia y
 * el producto está quieto (cero costo por cuadro, cero recompilaciones).
 */
type ContactRes = { rt: THREE.WebGLRenderTarget; rtBlur: THREE.WebGLRenderTarget; plane: THREE.PlaneGeometry; blurPlane: THREE.Mesh; depth: THREE.MeshDepthMaterial; hBlur: THREE.ShaderMaterial; vBlur: THREE.ShaderMaterial; cam: THREE.OrthographicCamera; shown: THREE.MeshBasicMaterial };
const contactCache = new Map<string, ContactRes>();

function buildContact(resolution: number, size: number, far: number, color: string, opacity: number): ContactRes {
  const rt = new THREE.WebGLRenderTarget(resolution, resolution);
  const rtBlur = new THREE.WebGLRenderTarget(resolution, resolution);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;
  const plane = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
  const blurPlane = new THREE.Mesh(plane);
  const depth = new THREE.MeshDepthMaterial();
  depth.depthTest = depth.depthWrite = false;
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.ucolor = { value: new THREE.Color(color) };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
      .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );');
  };
  depth.customProgramCacheKey = () => 'contact-depth';
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;
  hBlur.name = 'contactBlurH';
  vBlur.name = 'contactBlurV';
  // misma disposición que drei: la cámara vive dentro del grupo girado y mira hacia arriba desde el piso
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
  const shown = new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity, depthWrite: false });
  return { rt, rtBlur, plane, blurPlane, depth, hBlur, vBlur, cam, shown };
}

export function ModelContactShadows({ version, settled, size = 40, opacity = 0.5, blur = 2.2, far = 1.6, resolution = 1024, color = '#2a2118' }: ContactProps) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const warm = useWarmup();
  const group = useRef<THREE.Group>(null);
  const done = useRef(-1);
  const res = useMemo(() => {
    const key = `${resolution}|${size}|${far}|${color}|${opacity}`;
    const hit = contactCache.get(key);
    if (hit) return hit;
    const made = buildContact(resolution, size, far, color, opacity);
    contactCache.set(key, made);
    return made;
  }, [resolution, size, far, color, opacity]);
  // los recursos se comparten entre montajes (volver a la escena no recompila ni recrea nada);
  // al remontar hay que volver a dibujar la sombra
  useEffect(() => {
    done.current = -1;
  }, [res]);
  const blurPass = (amount: number) => {
    const { blurPlane, hBlur, vBlur, rt, rtBlur, cam } = res;
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = rt.texture;
    hBlur.uniforms.h.value = amount / 256;
    gl.setRenderTarget(rtBlur);
    gl.render(blurPlane, cam);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    gl.setRenderTarget(rt);
    gl.render(blurPlane, cam);
    blurPlane.visible = false;
  };
  useFrame(() => {
    if (warm || !group.current) return;
    const v = version();
    if (v === done.current || !settled()) return;
    done.current = v;
    const prevTarget = gl.getRenderTarget();
    const bg = scene.background;
    const ov = scene.overrideMaterial;
    group.current.visible = false;
    scene.background = null;
    scene.overrideMaterial = res.depth;
    gl.setRenderTarget(res.rt);
    gl.clear();
    gl.render(scene, res.cam);
    blurPass(blur);
    blurPass(blur * 0.4);
    gl.setRenderTarget(prevTarget);
    group.current.visible = true;
    scene.overrideMaterial = ov;
    scene.background = bg;
    invalidate();
  });
  return (
    <group ref={group} position={[0, 0.003, 0]} rotation-x={Math.PI / 2} dispose={null}>
      <mesh geometry={res.plane} material={res.shown} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />
      <primitive object={res.cam} />
    </group>
  );
}

/**
 * Dirección del sol en public/hdri/sky.hdr (píxel más brillante, convención equirectangular de three.js):
 * elevación 48°, hacia +X/+Z.
 */
export const SKY_SUN_DIR_TEX: [number, number, number] = [0.553, 0.743, 0.377];
/**
 * Giro del cielo (eje Y) para que el sol quede del lado de las cámaras de Campo/Ruta (máquina iluminada,
 * sombras visibles). Se aplica igual al fondo y al entorno, y la luz se calcula con el mismo giro.
 */
export const SKY_ROT_Y = 3.02;
/**
 * Dirección del sol en el mundo después del giro: rotY(SKY_ROT_Y)·dirección en la textura
 * (verificado apuntando la cámara a esa dirección: el sol del fondo queda centrado).
 */
export const SKY_SUN_DIR: [number, number, number] = (() => {
  const v = new THREE.Vector3(...SKY_SUN_DIR_TEX).applyEuler(new THREE.Euler(0, SKY_ROT_Y, 0));
  return [v.x, v.y, v.z];
})();
/** Tono del horizonte del HDR (neblina por distancia del mismo color). */
export const SKY_HORIZON = '#c6ced8';

export const SKY_FOG = (color: string, density: number) => new THREE.FogExp2(color, density);

/**
 * Entorno HDR compartido: `<Environment files>` de drei libera la textura al desmontarse (al volver a
 * la escena se regenera el PMREM y se recompilan sus shaders). Con el mapa cargado por la caché de
 * `useEnvironment` y pasado por `map`, la textura y su PMREM quedan vivos entre visitas.
 */
export function SharedEnvironment({ files, ...rest }: { files: string } & Omit<EnvironmentProps, 'files' | 'map'>) {
  const map = useEnvironment({ files });
  return <Environment map={map} {...rest} />;
}
