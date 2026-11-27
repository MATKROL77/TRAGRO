/**
 * El camión en la Ruta: une la cinemática y la máquina de estados del render-kit con el
 * modelo del semi, el tractor, la escena, las luces, la cámara y la UI.
 *
 * - El conjunto queda cerca del origen y se mueve el mundo (uniforms de la escena).
 * - "Ver en acción" con el camión circulando: frena en la banquina con el giro puesto y
 *   recién detenido abre; "Volver a cerrar": cierra, espera 1 s y arranca.
 * - Render continuo solo mientras algo se mueve; detenido y quieto vuelve a demanda.
 * - Cámaras: seguimiento (por defecto), lateral paralela y dron, con resorte suave. El
 *   usuario puede orbitar alrededor del camión mientras circula; al soltar, vuelve sola.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useStore, type RutaCam, type VehiculoEstado } from '@/state/store';
import { TruckKinematics } from '@/render-kit/vehicle/kinematics';
import { ActionMachine } from '@/render-kit/vehicle/actionMachine';
import { driveInput, readKeyboard } from '@/render-kit/vehicle/input';
import { materialLibrary } from './materialsLib';
import { ROAD, routeScene, routeUniforms } from './Route';
import { animState, currentModel, snapAnim } from './TrailerObject';
import { currentTractor } from './Tractor';
import { onVehicleRequest, routeVisits, vehicleClock, vehicleDebug } from './vehicleBus';
import { markActive } from './activity';

const CAMS: Record<RutaCam, { pos: [number, number, number]; target: [number, number, number] }> = {
  // Relativas al centro del semi, en su marco (x adelante, z derecha).
  seguimiento: { pos: [-15.5, 6.2, -8.5], target: [2.5, 1.4, 0] },
  lateral: { pos: [0.5, 2.4, -14.5], target: [0.5, 1.6, 0] },
  dron: { pos: [-26, 24, -22], target: [3, 0.5, 0] },
};

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Se monta solo con la ruta a la vista (chunk aparte, junto con la escena). */
export default function RouteController() {
  const active = true;
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitImpl | null;
  const kin = useRef<TruckKinematics | null>(null);
  const machine = useRef<ActionMachine | null>(null);
  const cam = useRef({ dragging: false, releasedAt: -1e9, time: 0, init: false });
  const km = useRef({ lap: -1 });

  const lib = materialLibrary();

  // --- Arranque / salida de la escena -------------------------------------------------------
  useEffect(() => {
    if (!active) return;
    const st = useStore.getState();
    const model = currentModel.value;
    const tractor = currentTractor.value;
    if (!model) return;
    const L = model.layout;
    const axleCenter = L.axles.reduce((s, a) => s + a.x, 0) / L.axles.length;
    kin.current = new TruckKinematics({
      trailerL: L.kingpinX - axleCenter,
      hitch: tractor?.info.hitch ?? 0.4,
      trailerWheelR: L.wheelR,
      tractorWheelR: tractor?.info.wheelR ?? L.wheelR,
      tractorFrontWheelR: tractor?.info.frontWheelR ?? L.wheelR,
      airSuspension: L.suspension === 'neumatica',
    });
    // Abierto (o abriéndose) según el pedido; si se estaba cerrando, todavía no puede circular.
    const open = (st.anim.accion ?? 0) > 0.01;
    const closing = !open && (animState.current.accion ?? 0) > 0.01;
    // La primera vez llega circulando. Al volver: aparece detenido y arranca solo si está cerrado.
    // Con "movimiento reducido" (o en "Tu marca") queda detenido hasta que el usuario lo ponga en marcha.
    const hold = st.ui.reducedMotion || st.ui.paso === 'personalizacion';
    const first = routeVisits.count++ === 0;
    const initial: VehiculoEstado = open ? 'ABIERTO' : first && !hold && !closing ? 'CIRCULANDO' : 'DETENIDO';
    if (initial === 'CIRCULANDO') kin.current.setTargetSpeed(kin.current.opt.cruise);
    else kin.current.placeStopped(true);
    machine.current = new ActionMachine(
      {
        onCommand: (c) => {
          const k = kin.current;
          if (!k) return;
          const s = useStore.getState();
          const tolva = s.config.tipo === 'tolva';
          if (c === 'frenar') {
            k.moveTo('shoulder');
            k.brakeToStop();
          } else if (c === 'abrir') {
            s.setAnim('accion', 1);
            if (tolva) s.setAnim('lona', 1);
          } else if (c === 'cerrar') {
            s.setAnim('accion', 0);
            if (tolva) s.setAnim('lona', 0);
          } else if (c === 'cerrarYa') {
            s.setAnim('accion', 0);
            s.setAnim('lona', 0);
            snapAnim({ accion: 0, lona: 0 });
          } else if (c === 'arrancar') {
            k.moveTo('lane');
            k.setTargetSpeed(k.opt.cruise);
          }
        },
        onState: (state: VehiculoEstado) => {
          vehicleDebug.state = state;
          vehicleDebug.history.push(state);
          if (vehicleDebug.history.length > 50) vehicleDebug.history.shift();
          const m = machine.current;
          useStore.getState().setUi({ vehiculo: state, vehiculoQuieto: state === 'DETENIDO' && !!m?.holding });
          invalidate();
        },
      },
      initial,
    );
    machine.current.reset(initial, hold);
    cam.current.init = false;
    lib.setVehicleLights({ position: 1, brake: 0, left: 0, right: 0, head: 1 });
    invalidate();
    return () => {
      // Al salir: el equipo vuelve a su lugar (abierto o cerrado, como estaba) y quieto.
      const m = currentModel.value;
      m?.root.position.set(0, 0, 0);
      m?.root.rotation.set(0, 0, 0);
      m?.setBody(0, 0, 0);
      m?.setWheelRoll(0);
      const t = currentTractor.value;
      t?.root.position.set(0, 0, 0);
      t?.root.rotation.set(0, 0, 0);
      t?.setWheelRoll(0, 0);
      lib.setLights(useStore.getState().ui.luces ? 1 : 0);
      setFrameloop('demand');
      kin.current = null;
      machine.current = null;
      invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Cambia el modelo (opciones) en plena ruta: la cinemática toma las medidas nuevas.
  const version = useStore((s) => s.modelVersion);
  useEffect(() => {
    const k = kin.current;
    const model = currentModel.value;
    if (!k || !model) return;
    const L = model.layout;
    const axleCenter = L.axles.reduce((s, a) => s + a.x, 0) / L.axles.length;
    k.geo = { ...k.geo, trailerL: L.kingpinX - axleCenter, trailerWheelR: L.wheelR, airSuspension: L.suspension === 'neumatica', hitch: currentTractor.value?.info.hitch ?? k.geo.hitch };
  }, [version]);

  // Pedidos de la UI.
  useEffect(
    () =>
      onVehicleRequest((r) => {
        const m = machine.current;
        if (!m) return;
        if (r === 'accion') m.toggle();
        else if (r === 'arrancar') m.start();
        invalidate();
      }),
    [invalidate],
  );

  // Cambio de tipo con el equipo abierto: se cierra sin animación y queda detenido.
  useEffect(
    () =>
      useStore.subscribe(
        (s) => s.config.tipo,
        () => machine.current?.closeImmediately(),
      ),
    [],
  );

  // "Tu marca": se cierra el equipo y el camión queda detenido, con la cámara lateral (se ve el logo).
  useEffect(
    () =>
      useStore.subscribe(
        (s) => s.ui.paso,
        (paso) => {
          if (paso !== 'personalizacion' || !machine.current) return;
          machine.current.stopAndHold();
          useStore.getState().setUi({ rutaCam: 'lateral' });
        },
      ),
    [],
  );

  // Cámara: el usuario puede orbitar; al soltar, a los 1,5 s vuelve sola a la cámara elegida.
  useEffect(() => {
    if (!active || !controls) return;
    const c = controls as unknown as THREE.EventDispatcher<{ start: object; end: object }>;
    const onStart = () => {
      cam.current.dragging = true;
    };
    const onEnd = () => {
      cam.current.dragging = false;
      cam.current.releasedAt = cam.current.time;
    };
    c.addEventListener('start', onStart);
    c.addEventListener('end', onEnd);
    return () => {
      c.removeEventListener('start', onStart);
      c.removeEventListener('end', onEnd);
    };
  }, [active, controls]);

  // Teclado del modo "Manejar".
  const manejar = useStore((s) => s.ui.manejar);
  useEffect(() => {
    if (!active || !manejar) return;
    return readKeyboard();
  }, [active, manejar]);

  useFrame((state, rawDt) => {
    if (!active) return;
    const k = kin.current;
    const m = machine.current;
    const model = currentModel.value;
    const route = routeScene();
    if (!k || !m || !model || !route) return;
    const st = useStore.getState();
    const dt = vehicleClock.paused ? 0 : Math.min(rawDt, 0.1) * vehicleClock.scale;
    cam.current.time += dt;

    // Modo manual: con alguna tecla o el joystick manda el usuario; 2 s sin tocar nada → piloto automático.
    if (st.ui.manejar && (m.state === 'CIRCULANDO' || m.state === 'ARRANCANDO')) {
      const i = driveInput;
      const touching = Math.abs(i.throttle) > 0.05 || Math.abs(i.steer) > 0.05;
      if (touching) i.idle = 0;
      else i.idle += dt;
      k.setManual(i.idle < 2 ? { throttle: i.throttle, steer: i.steer } : null);
    } else if (k.isManual) k.setManual(null);

    const a = animState.current;
    const opened = (a.accion ?? 0) >= 0.999 && (st.config.tipo !== 'tolva' || (a.lona ?? 0) >= 0.999);
    const closed = (a.accion ?? 0) <= 0.001 && (st.config.tipo !== 'tolva' || (a.lona ?? 0) <= 0.001);
    m.update(dt, { stopped: k.stopped, opened, closed, cruising: k.speed >= k.opt.cruise * 0.97 && !k.changingLane });

    const p = k.step(dt);
    vehicleDebug.speedKmh = p.v * 3.6;
    vehicleDebug.articulation = p.articulation;

    // --- Mundo: el recorrido avanza bajo el camión ---
    routeUniforms.uTravel.value.set(p.s, ROAD.z(p.s));
    route.trees.uTreeShift.value.set(p.odometer % 1500, ROAD.z(p.s));
    // Mojón (cada vuelta de 1200 m, con el kilómetro que corresponde) y cartel de 80.
    const place = (obj: THREE.Object3D, u: number, lateral: number) => {
      const lx = ((((u - p.s) % 1200) + 1200 + 600) % 1200) - 600;
      const wx = p.s + lx;
      obj.position.set(lx, 0, ROAD.z(wx) - ROAD.z(p.s) + lateral);
      obj.rotation.y = -Math.atan(ROAD.dz(wx));
    };
    place(route.roadside.marker, 980, 5.6);
    place(route.roadside.sign, 420, 5.9);
    const lap = Math.floor((p.odometer + 220) / 1200);
    if (lap !== km.current.lap) {
      km.current.lap = lap;
      route.roadside.setKm(214 + lap);
    }

    // --- Semi y tractor: articulados en el perno rey ---
    const L = model.layout;
    const kx = L.kingpinX;
    const placeBody = (root: THREE.Object3D, psi: number) => {
      root.rotation.set(0, -psi, 0);
      root.position.set(p.kingpin.x - Math.cos(psi) * kx, 0, p.kingpin.z - Math.sin(psi) * kx);
    };
    placeBody(model.root, p.psiTrailer);
    model.setBody(p.body.pitch, p.body.roll, p.body.heave);
    model.setWheelRoll(p.wheelAngle.trailer);
    const tractor = currentTractor.value;
    if (tractor) {
      placeBody(tractor.root, p.psiTractor);
      // El tractor cabecea y rola un poco menos (más rígido y con la cabina suspendida aparte).
      tractor.root.rotation.x = p.body.roll * 0.6;
      tractor.root.rotation.z = -p.body.pitch * 0.7;
      tractor.root.position.y = p.body.heave * 0.8;
      tractor.setWheelRoll(p.wheelAngle.tractor, p.wheelAngle.tractorFront);
    }

    // --- Luces: posición siempre; freno al frenar; giro al cambiar de carril; balizas detenido ---
    const blink = Math.floor(state.clock.elapsedTime * 2.6) % 2 === 0 ? 1 : 0;
    const hazards = m.state === 'DETENIDO' || m.state === 'ABRIENDO' || m.state === 'ABIERTO' || m.state === 'CERRANDO';
    const braking = p.a < -0.35 || m.state === 'FRENANDO';
    lib.setVehicleLights({
      position: 1,
      head: 1,
      brake: braking ? 1 : 0,
      left: (hazards || p.steeringIntent < 0 ? 1 : 0) * blink,
      right: (hazards || p.steeringIntent > 0 ? 1 : 0) * blink,
    });

    // --- Cámara ---
    const c = state.controls as unknown as OrbitImpl | null;
    if (c) {
      const preset = CAMS[st.ui.rutaCam];
      const axle = model.layout.axles.reduce((s0, a0) => s0 + a0.x, 0) / model.layout.axles.length;
      const mid = (axle + kx) / 2;
      // Centro del semi en el marco local y su rumbo.
      const cx = p.kingpin.x - Math.cos(p.psiTrailer) * (kx - mid);
      const cz = p.kingpin.z - Math.sin(p.psiTrailer) * (kx - mid);
      const rot = (v: [number, number, number], out: THREE.Vector3) => {
        const ca = Math.cos(p.psiTrailer);
        const sa = Math.sin(p.psiTrailer);
        return out.set(cx + ca * v[0] - sa * v[2], v[1], cz + sa * v[0] + ca * v[2]);
      };
      rot(preset.target, _t);
      rot(preset.pos, _v);
      const free = cam.current.dragging || cam.current.time - cam.current.releasedAt < 1.5;
      if (!cam.current.init) {
        camera.position.copy(_v);
        c.target.copy(_t);
        cam.current.init = true;
      } else if (free) {
        // Órbita relativa al camión: el objetivo sigue al conjunto y la cámara se mueve con él.
        const dx = _t.x - c.target.x;
        const dz = _t.z - c.target.z;
        c.target.x += dx;
        c.target.z += dz;
        camera.position.x += dx;
        camera.position.z += dz;
      } else {
        const kk = 1 - Math.exp(-dt * 2.4);
        c.target.lerp(_t, kk);
        camera.position.lerp(_v, kk);
      }
      camera.lookAt(c.target);
    }

    // --- Render continuo solo cuando algo se mueve ---
    const busy = p.v > 0.01 || m.state !== 'DETENIDO' && m.state !== 'ABIERTO' || cam.current.dragging || cam.current.time - cam.current.releasedAt < 4 || k.changingLane;
    const loop = busy ? 'always' : 'demand';
    if (state.frameloop !== loop && !vehicleClock.manualFrames) setFrameloop(loop);
    if (busy) markActive(400);
  });

  return null;
}
