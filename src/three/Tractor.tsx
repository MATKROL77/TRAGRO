import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { getMaterials } from './materials';
import { lugsGeo, rimGeo, roundedBox, tireGeo, cylinderX, barBetween, tube } from '../machines/seeder/parts';

/**
 * Tractor genérico SIN marca (no imita ningún modelo real): gris claro con detalles grafito.
 * Origen = centro del eje trasero a nivel del suelo; mira hacia +Z.
 */
export interface TractorHandle { group: THREE.Group; wheels: THREE.Object3D[] }

function useTractorParts() {
  return useMemo(() => {
    const m = getMaterials();
    const RR = 0.92;
    const RF = 0.62;
    const rearTire = tireGeo(RR, 0.6, RR - 0.32, { segs: 64, squareness: 0.5 });
    const rearLugs = lugsGeo(RR - 0.02, 0.56, 26, 0.06);
    const rearRim = rimGeo(RR - 0.32, 0.55, 0.12);
    const frontTire = tireGeo(RF, 0.42, RF - 0.24, { segs: 56, squareness: 0.5 });
    const frontLugs = lugsGeo(RF - 0.015, 0.4, 20, 0.045);
    const frontRim = rimGeo(RF - 0.24, 0.38, 0.08);
    return { m, RR, RF, rearTire, rearLugs, rearRim, frontTire, frontLugs, frontRim };
  }, []);
}

export const Tractor = forwardRef<THREE.Group, { wheelRefs?: React.MutableRefObject<THREE.Object3D[]> }>(function Tractor({ wheelRefs }, ref) {
  const p = useTractorParts();
  const { m } = p;
  const body = m.tractorBody;
  const dark = m.paintDark;
  const reg = (o: THREE.Object3D | null) => {
    if (o && wheelRefs && !wheelRefs.current.includes(o)) wheelRefs.current.push(o);
  };
  const wb = 2.75; // distancia entre ejes
  const geo = useMemo(
    () => ({
      hood: roundedBox(0.95, 0.85, 2.3, 0.12, 3),
      grille: roundedBox(0.82, 0.62, 0.05, 0.03),
      chassis: roundedBox(0.7, 0.45, 3.4, 0.05),
      cabBase: roundedBox(1.45, 0.25, 1.55, 0.05),
      roof: roundedBox(1.62, 0.12, 1.75, 0.06, 3),
      post: roundedBox(0.07, 1.4, 0.07, 0.02),
      glassSide: new THREE.PlaneGeometry(1.4, 1.25),
      glassFront: new THREE.PlaneGeometry(1.32, 1.3),
      fender: new THREE.CylinderGeometry(1.08, 1.08, 0.66, 32, 1, true, -Math.PI * 0.05, Math.PI * 0.62),
      exhaust: new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12),
      tank: roundedBox(0.35, 0.5, 0.9, 0.06),
      step: roundedBox(0.3, 0.03, 0.22, 0.01),
      hitch: barBetween(new THREE.Vector3(0, 0.56, -0.2), new THREE.Vector3(0, 0.56, -1.05), 0.05, 8, true),
      beacon: new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12),
      lamp: roundedBox(0.2, 0.08, 0.04, 0.015),
      mirrorArm: barBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.45, 0.05, 0.1), 0.012),
      mirror: roundedBox(0.03, 0.22, 0.14, 0.01),
      axle: cylinderX(0.09, 1.7),
      seat: roundedBox(0.5, 0.5, 0.45, 0.08),
      wheelArch: roundedBox(0.36, 0.06, 1.0, 0.02),
      hose: tube([new THREE.Vector3(-0.2, 1.0, -0.8), new THREE.Vector3(-0.15, 0.8, -1.05), new THREE.Vector3(-0.1, 0.7, -1.15)], 0.012, 12, 6),
    }),
    [],
  );
  return (
    <group ref={ref} name="tractor">
      {/* chasis y capot */}
      <mesh geometry={geo.chassis} material={dark} position={[0, 0.75, wb / 2 + 0.1]} castShadow />
      <mesh geometry={geo.hood} material={body} position={[0, 1.45, wb - 0.35]} castShadow receiveShadow />
      <mesh geometry={geo.grille} material={dark} position={[0, 1.43, wb + 0.82]} />
      <mesh geometry={geo.lamp} material={m.chrome} position={[-0.3, 1.66, wb + 0.84]} />
      <mesh geometry={geo.lamp} material={m.chrome} position={[0.3, 1.66, wb + 0.84]} />
      <mesh geometry={geo.exhaust} material={dark} position={[0.38, 2.3, wb - 0.95]} castShadow />
      <mesh geometry={geo.tank} material={dark} position={[-0.62, 1.0, 0.85]} castShadow />
      {/* cabina */}
      <group position={[0, 1.38, -0.05]}>
        <mesh geometry={geo.cabBase} material={dark} position={[0, 0, 0]} castShadow />
        <mesh geometry={geo.seat} material={m.plastic} position={[0, 0.4, -0.25]} />
        {[[-0.72, -0.74], [0.72, -0.74], [-0.72, 0.74], [0.72, 0.74]].map(([x, z], i) => (
          <mesh key={i} geometry={geo.post} material={dark} position={[x, 0.82, z]} castShadow />
        ))}
        <mesh geometry={geo.roof} material={body} position={[0, 1.55, 0]} castShadow />
        <mesh geometry={geo.glassSide} material={m.glass} position={[0.725, 0.85, 0]} rotation={[0, Math.PI / 2, 0]} />
        <mesh geometry={geo.glassSide} material={m.glass} position={[-0.725, 0.85, 0]} rotation={[0, -Math.PI / 2, 0]} />
        <mesh geometry={geo.glassFront} material={m.glass} position={[0, 0.85, 0.745]} />
        <mesh geometry={geo.glassFront} material={m.glass} position={[0, 0.85, -0.745]} rotation={[0, Math.PI, 0]} />
        <mesh geometry={geo.beacon} material={m.lightAmber} position={[0.55, 1.66, -0.6]} />
        <mesh geometry={geo.mirrorArm} material={dark} position={[0.72, 1.2, 0.7]} />
        <mesh geometry={geo.mirror} material={dark} position={[1.17, 1.22, 0.8]} />
        <mesh geometry={geo.mirrorArm} material={dark} position={[-0.72, 1.2, 0.7]} scale={[-1, 1, 1]} />
        <mesh geometry={geo.mirror} material={dark} position={[-1.17, 1.22, 0.8]} />
      </group>
      {/* guardabarros y escalones */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={geo.fender} material={body} position={[s * 0.98, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow />
          <mesh geometry={geo.step} material={m.plate} position={[s * 0.62, 0.55, 0.65]} />
          <mesh geometry={geo.step} material={m.plate} position={[s * 0.62, 0.9, 0.65]} />
          <mesh geometry={geo.lamp} material={m.lightRed} position={[s * 0.55, 1.2, -0.95]} />
        </group>
      ))}
      <mesh geometry={geo.axle} material={dark} position={[0, p.RR, 0]} />
      <mesh geometry={geo.axle} material={dark} position={[0, p.RF, wb]} />
      <mesh geometry={geo.hitch} material={dark} castShadow />
      <mesh geometry={geo.hose} material={m.hose} />
      {/* ruedas */}
      {[-1, 1].map((s) => (
        <group key={`r${s}`} position={[s * 1.0, p.RR, 0]} ref={reg}>
          <mesh geometry={p.rearTire} material={m.tire} castShadow receiveShadow />
          <mesh geometry={p.rearLugs} material={m.rubber} castShadow />
          <mesh geometry={p.rearRim} material={m.rimGrey} scale={[s, 1, 1]} />
        </group>
      ))}
      {[-1, 1].map((s) => (
        <group key={`f${s}`} position={[s * 0.92, p.RF, wb]} ref={reg}>
          <mesh geometry={p.frontTire} material={m.tire} castShadow receiveShadow />
          <mesh geometry={p.frontLugs} material={m.rubber} castShadow />
          <mesh geometry={p.frontRim} material={m.rimGrey} scale={[s, 1, 1]} />
        </group>
      ))}
    </group>
  );
});

export const TRACTOR = { hitchBehindAxle: 1.08, hitchY: 0.56, rearR: 0.92, frontR: 0.62 };
