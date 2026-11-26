import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { getMaterials } from './materials';
import { useStore } from '../state/store';
import { roundedBox, cylinderX, barBetween, tube, wheelSet, type WheelGeos } from '../machines/seeder/parts';

/**
 * Tractor genérico SIN marca (no imita ningún modelo real): gris claro con detalles grafito.
 * Origen = centro del eje trasero a nivel del suelo; mira hacia +Z.
 */
export interface TractorHandle { group: THREE.Group; wheels: THREE.Object3D[] }

let partsCache: ReturnType<typeof buildTractorParts> | null = null;
/** Ruedas del tractor: se crean una vez y se comparten entre visitas a Campo/Ruta. */
function useTractorParts() {
  return useMemo(() => (partsCache ??= buildTractorParts()), []);
}

function buildTractorParts() {
  {
    const m = getMaterials();
    const RR = 1.0;
    const RF = 0.66;
    const wheels: Record<string, WheelGeos> = {
      r1: wheelSet(RR, 0.6, { rimR: RR * 0.62, outward: 1, lugH: 0.075, lugs: 26 }),
      r0: wheelSet(RR, 0.6, { rimR: RR * 0.62, outward: -1, lugH: 0.075, lugs: 26 }),
      f1: wheelSet(RF, 0.44, { rimR: RF * 0.6, outward: 1, lugH: 0.055, lugs: 22 }),
      f0: wheelSet(RF, 0.44, { rimR: RF * 0.6, outward: -1, lugH: 0.055, lugs: 22 }),
    };
    return { m, RR, RF, wheels };
  }
}

let geoCache: ReturnType<typeof buildTractorGeo> | null = null;
/** Geometrías del tractor (compartidas, nunca se liberan: no se recrean al cambiar de escena). */
function buildTractorGeo() {
  return {
      // capó con perfil inclinado hacia adelante (extrusión del perfil lateral, con chanfle)
      hood: (() => {
        const sh = new THREE.Shape();
        sh.moveTo(-1.15, -0.42);
        sh.lineTo(1.12, -0.42);
        sh.lineTo(1.18, 0.12);
        sh.quadraticCurveTo(1.12, 0.36, 0.85, 0.4);
        sh.lineTo(-1.15, 0.44);
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 12 });
        g.translate(0, 0, -0.45);
        g.rotateY(-Math.PI / 2);
        return g;
      })(),
      louver: roundedBox(0.02, 0.04, 0.9, 0.008),
      weightPlate: roundedBox(0.9, 0.14, 0.32, 0.03, 2),
      weightBracket: roundedBox(0.7, 0.5, 0.35, 0.04),
      headLens: new THREE.CylinderGeometry(0.075, 0.075, 0.04, 20).rotateX(Math.PI / 2),
      workLamp: roundedBox(0.14, 0.1, 0.08, 0.015),
      steering: new THREE.TorusGeometry(0.17, 0.018, 8, 24),
      console: roundedBox(0.5, 0.35, 0.25, 0.04),
      roofVisor: roundedBox(1.5, 0.04, 0.35, 0.015),
      grille: roundedBox(0.82, 0.62, 0.05, 0.03),
      chassis: roundedBox(0.7, 0.45, 3.4, 0.05),
      cabBase: roundedBox(1.45, 0.25, 1.55, 0.05),
      roof: roundedBox(1.62, 0.12, 1.75, 0.06, 3),
      post: roundedBox(0.07, 1.4, 0.07, 0.02),
      glassSide: new THREE.PlaneGeometry(1.4, 1.25),
      glassFront: new THREE.PlaneGeometry(1.32, 1.3),
      // guardabarros macizo: sector de anillo extruido (con espesor) + reborde, sobre la rueda trasera
      fender: (() => {
        const sh = new THREE.Shape();
        const r0 = 1.13;
        const r1 = 1.19;
        const a0 = Math.PI * 0.12;
        const a1 = Math.PI * 0.82;
        sh.absarc(0, 0, r1, a0, a1, false);
        sh.absarc(0, 0, r0, a1, a0, true);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 32 });
        g.translate(0, 0, -0.35);
        g.rotateY(Math.PI / 2);
        return g;
      })(),
      fenderBracket: roundedBox(0.4, 0.08, 0.5, 0.02),
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
    };
}

let glassHigh: THREE.MeshPhysicalMaterial | null = null;
/** Vidrio físico con transmisión (sólo calidad alta: agrega una pasada de render). */
const glassPhysical = () =>
  (glassHigh ??= new THREE.MeshPhysicalMaterial({ color: '#dfe9ef', metalness: 0, roughness: 0.04, transmission: 0.92, thickness: 0.01, ior: 1.5, envMapIntensity: 1.3, side: THREE.DoubleSide }));
let lensMat: THREE.MeshStandardMaterial | null = null;
const headLens = () => (lensMat ??= new THREE.MeshStandardMaterial({ color: '#f4f7fa', emissive: '#fff4dc', emissiveIntensity: 0.6, roughness: 0.1, metalness: 0 }));

export const Tractor = forwardRef<THREE.Group, { wheelRefs?: React.MutableRefObject<THREE.Object3D[]> }>(function Tractor({ wheelRefs }, ref) {
  const p = useTractorParts();
  const quality = useStore((s) => s.quality);
  const { m } = p;
  const body = m.tractorBody;
  const dark = m.paintDark;
  const reg = (o: THREE.Object3D | null) => {
    if (o && wheelRefs && !wheelRefs.current.includes(o)) wheelRefs.current.push(o);
  };
  const wb = 2.75; // distancia entre ejes
  const geo = useMemo(() => (geoCache ??= buildTractorGeo()), []);
  const glass = quality === 'high' ? glassPhysical() : m.glass;
  return (
    <group ref={ref} name="tractor" dispose={null}>
      {/* chasis y capot */}
      <mesh geometry={geo.chassis} material={dark} position={[0, 0.75, wb / 2 + 0.1]} castShadow />
      <mesh geometry={geo.hood} material={body} position={[0, 1.45, wb - 0.35]} castShadow receiveShadow />
      <mesh geometry={geo.grille} material={dark} position={[0, 1.4, wb + 0.84]} />
      {/* faros con lente emisiva */}
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} geometry={geo.headLens} material={headLens()} position={[x, 1.62, wb + 0.86]} />
      ))}
      {/* rejillas laterales del capó */}
      {[-1, 1].map((sd) => [0, 1, 2, 3, 4].map((i) => <mesh key={`${sd}${i}`} geometry={geo.louver} material={dark} position={[sd * 0.5, 1.28 + i * 0.07, wb - 0.1]} />))}
      {/* contrapesos delanteros */}
      <mesh geometry={geo.weightBracket} material={dark} position={[0, 1.0, wb + 1.0]} castShadow />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} geometry={geo.weightPlate} material={dark} position={[0, 0.82 + i * 0.15, wb + 1.32]} castShadow />
      ))}
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
        <mesh geometry={geo.glassSide} material={glass} position={[0.725, 0.85, 0]} rotation={[0, Math.PI / 2, 0]} />
        <mesh geometry={geo.glassSide} material={glass} position={[-0.725, 0.85, 0]} rotation={[0, -Math.PI / 2, 0]} />
        <mesh geometry={geo.glassFront} material={glass} position={[0, 0.85, 0.745]} />
        <mesh geometry={geo.glassFront} material={glass} position={[0, 0.85, -0.745]} rotation={[0, Math.PI, 0]} />
        {/* interior: volante y consola (se ven a través del vidrio) */}
        <mesh geometry={geo.steering} material={dark} position={[0, 0.72, 0.35]} rotation={[-1.0, 0, 0]} />
        <mesh geometry={geo.console} material={m.plastic} position={[0, 0.32, 0.5]} />
        {/* visera y luces de trabajo en el techo */}
        <mesh geometry={geo.roofVisor} material={dark} position={[0, 1.5, 0.95]} />
        {[-0.6, -0.2, 0.2, 0.6].map((x) => (
          <mesh key={x} geometry={geo.workLamp} material={headLens()} position={[x, 1.52, 0.86]} />
        ))}
        <mesh geometry={geo.beacon} material={m.lightAmber} position={[0.55, 1.66, -0.6]} />
        <mesh geometry={geo.mirrorArm} material={dark} position={[0.72, 1.2, 0.7]} />
        <mesh geometry={geo.mirror} material={dark} position={[1.17, 1.22, 0.8]} />
        <mesh geometry={geo.mirrorArm} material={dark} position={[-0.72, 1.2, 0.7]} scale={[-1, 1, 1]} />
        <mesh geometry={geo.mirror} material={dark} position={[-1.17, 1.22, 0.8]} />
      </group>
      {/* guardabarros y escalones */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={geo.fender} material={body} position={[s * 1.0, p.RR, 0]} castShadow receiveShadow />
          {/* soporte del guardabarros a la cabina */}
          <mesh geometry={geo.fenderBracket} material={dark} position={[s * 0.78, p.RR + 0.62, -0.1]} castShadow />
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
      {([['r', p.RR, 1.0, 0], ['d', p.RR, 1.66, 0], ['f', p.RF, 0.95, wb]] as const).map(([k, r, x, z]) =>
        [-1, 1].map((sd) => {
          // 'd': ruedas duales traseras (mismas geometrías que las traseras)
          const w = p.wheels[`${k === 'd' ? 'r' : k}${sd > 0 ? 1 : 0}`];
          return (
            <group key={`${k}${sd}`} position={[sd * x, r, z]} ref={reg}>
              <mesh geometry={w.tire} material={m.tire} castShadow receiveShadow />
              <mesh geometry={w.lugs} material={m.rubber} castShadow />
              <mesh geometry={w.rim} material={m.rimGrey} />
              <mesh geometry={w.metal} material={m.steel} />
              <mesh geometry={w.dark} material={m.paintDark} />
            </group>
          );
        }),
      )}
    </group>
  );
});

export const TRACTOR = { hitchBehindAxle: 1.08, hitchY: 0.56, rearR: 1.0, frontR: 0.66 };
