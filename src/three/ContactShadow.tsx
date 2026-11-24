import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

interface Props {
  /** Tamaño del área en X y Z (metros). */
  size?: [number, number];
  /** Altura hasta la que una pieza proyecta sombra de contacto. */
  far?: number;
  resolution?: number;
  blur?: number;
  opacity?: number;
  color?: string;
  y?: number;
  /** Cambiar este valor vuelve a calcular la sombra (un solo render). */
  version: number | string;
}

/**
 * Sombra de contacto suave bajo el equipo. Se calcula una sola vez por cambio de
 * modelo (cámara ortográfica desde el piso + desenfoque) y reutiliza siempre los
 * mismos buffers: no pierde memoria al reconstruir.
 */
export function ContactShadow({ size = [30, 12], far = 1.1, resolution = 512, blur = 3.2, opacity = 0.5, color = '#2a241d', y = 0.004, version }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);
  const pending = useRef(2);

  const res = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(resolution, resolution);
    const targetBlur = new THREE.WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = targetBlur.texture.generateMipmaps = false;
    const plane = new THREE.PlaneGeometry(size[0], size[1]).rotateX(Math.PI / 2);
    const blurPlane = new THREE.Mesh(plane);
    blurPlane.visible = false;
    const depth = new THREE.MeshDepthMaterial();
    depth.depthTest = depth.depthWrite = false;
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: new THREE.Color(color) };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
        .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor, ( 1.0 - fragCoordZ ) * 1.0 );');
    };
    const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
    const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
    hBlur.depthTest = vBlur.depthTest = false;
    const camera = new THREE.OrthographicCamera(-size[0] / 2, size[0] / 2, size[1] / 2, -size[1] / 2, -0.02, far);
    camera.rotation.x = Math.PI / 2;
    const display = new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { target, targetBlur, plane, blurPlane, depth, hBlur, vBlur, camera, display };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution, size[0], size[1], far, color]);

  useEffect(
    () => () => {
      res.target.dispose();
      res.targetBlur.dispose();
      res.plane.dispose();
      res.depth.dispose();
      res.hBlur.dispose();
      res.vBlur.dispose();
      res.display.dispose();
    },
    [res],
  );

  useEffect(() => {
    res.display.opacity = opacity;
  }, [res, opacity]);

  useEffect(() => {
    // Dos cuadros: el primero puede llegar antes de que el modelo nuevo esté en la escena.
    pending.current = 2;
    invalidate();
  }, [version, res, invalidate]);

  const blurPass = (amount: number) => {
    const { blurPlane, hBlur, vBlur, target, targetBlur, camera } = res;
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = target.texture;
    hBlur.uniforms.h.value = (amount * 1) / 256;
    gl.setRenderTarget(targetBlur);
    gl.render(blurPlane, camera);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = targetBlur.texture;
    vBlur.uniforms.v.value = (amount * 1) / 256;
    gl.setRenderTarget(target);
    gl.render(blurPlane, camera);
    blurPlane.visible = false;
  };

  useFrame(() => {
    const g = group.current;
    if (!g || pending.current <= 0) return;
    pending.current--;
    const { target, depth, camera } = res;
    const background = scene.background;
    const override = scene.overrideMaterial;
    const clearAlpha = gl.getClearAlpha();
    g.visible = false;
    scene.background = null;
    scene.overrideMaterial = depth;
    gl.setClearAlpha(0);
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);
    scene.overrideMaterial = override;
    blurPass(blur);
    blurPass(blur * 0.4);
    gl.setRenderTarget(null);
    gl.setClearAlpha(clearAlpha);
    scene.background = background;
    g.visible = true;
    if (pending.current > 0) invalidate();
  });

  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh geometry={res.plane} material={res.display} scale={[1, -1, 1]} renderOrder={-4} />
      <primitive object={res.blurPlane} />
      <primitive object={res.camera} />
    </group>
  );
}
