import { describe, expect, it } from 'vitest';
import { RoadPath } from '@/render-kit/vehicle/road';
import { TruckKinematics } from '@/render-kit/vehicle/kinematics';
import { ActionMachine, type Command } from '@/render-kit/vehicle/actionMachine';

const geo = { trailerL: 8.2, hitch: 0.45, trailerWheelR: 0.53, tractorWheelR: 0.53, tractorFrontWheelR: 0.53, airSuspension: false };

describe('ruta', () => {
  it('el eje es periódico y la derivada coincide con la diferencia finita', () => {
    const r = new RoadPath();
    expect(r.z(0)).toBeCloseTo(r.z(r.shape.period), 6);
    for (const x of [13, 250, 777]) expect(r.dz(x)).toBeCloseTo((r.z(x + 0.001) - r.z(x - 0.001)) / 0.002, 3);
  });
});

describe('cinemática del camión', () => {
  it('frena de 80 a 0 en 4–6 s, sin golpe al final', () => {
    const k = new TruckKinematics(geo);
    for (let i = 0; i < 120; i++) k.step(1 / 60);
    k.brakeToStop();
    let t = 0;
    let lastA = 0;
    let maxJerk = 0;
    while (!k.stopped && t < 12) {
      const p = k.step(1 / 60);
      maxJerk = Math.max(maxJerk, Math.abs(p.a - lastA) * 60);
      lastA = p.a;
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(4);
    expect(t).toBeLessThan(6.5);
    expect(maxJerk).toBeLessThan(6);
    expect(Math.abs(lastA)).toBeLessThan(0.2);
  });

  it('las ruedas no patinan: ángulo × radio = distancia', () => {
    const k = new TruckKinematics(geo);
    let p = k.step(0);
    const start = p.odometer;
    for (let i = 0; i < 600; i++) p = k.step(1 / 60);
    const dist = p.odometer - start;
    expect(Math.abs(p.wheelAngle.trailer * geo.trailerWheelR - dist) / dist).toBeLessThan(0.02);
  });

  it('el semi nunca se cruza con el tractor (articulación chica en las curvas)', () => {
    const k = new TruckKinematics(geo);
    let maxArt = 0;
    for (let i = 0; i < 60 * 120; i++) maxArt = Math.max(maxArt, Math.abs(k.step(1 / 60).articulation));
    expect(maxArt).toBeLessThan(0.2);
  });

  it('la articulación depende del largo del semi', () => {
    const art = (L: number) => {
      const k = new TruckKinematics({ ...geo, trailerL: L });
      let m = 0;
      for (let i = 0; i < 60 * 60; i++) m = Math.max(m, Math.abs(k.step(1 / 60).articulation));
      return m;
    };
    expect(art(10)).toBeGreaterThan(art(6));
  });
});

describe('rumbo sin saltos (la cámara sigue al semi)', () => {
  /** Recorre `secs` a `fps` y devuelve el mayor salto de rumbo por cuadro y el corrimiento lateral estando parado. */
  const run = (k: TruckKinematics, secs: number, fps: number, onStep?: (t: number) => void) => {
    let prev = k.step(0);
    let maxDPsi = 0;
    let slideStill = 0;
    for (let i = 0; i < secs * fps; i++) {
      onStep?.(i / fps);
      const p = k.step(1 / fps);
      maxDPsi = Math.max(maxDPsi, Math.abs(p.psiTractor - prev.psiTractor), Math.abs(p.psiTrailer - prev.psiTrailer));
      if (p.v < 0.05 && prev.v < 0.05) slideStill = Math.max(slideStill, Math.abs(p.lateral - prev.lateral));
      prev = p;
    }
    return { maxDPsi, slideStill, last: prev };
  };

  for (const fps of [60, 30]) {
    it(`frenar a la banquina y volver a arrancar, a ${fps} fps`, () => {
      const k = new TruckKinematics(geo);
      run(k, 5, fps);
      k.moveTo('shoulder');
      k.brakeToStop();
      const a = run(k, 12, fps);
      expect(k.stopped).toBe(true);
      expect(a.last.lateral).toBeCloseTo(k.opt.shoulderOffset, 2);
      k.moveTo('lane');
      k.setTargetSpeed(k.opt.cruise);
      const b = run(k, 25, fps);
      expect(b.last.lateral).toBeCloseTo(k.opt.laneOffset, 2);
      // A 60 fps, menos de 0,3° por cuadro (antes: 12,8° de golpe al arrancar).
      expect(Math.max(a.maxDPsi, b.maxDPsi)).toBeLessThan(0.005 * (60 / fps));
      expect(Math.max(a.slideStill, b.slideStill)).toBeLessThan(1e-5);
    });
  }

  it('frenar mientras arranca (casi parado y a medio cambio de carril): termina en la banquina sin saltos', () => {
    const k = new TruckKinematics(geo, {}, undefined, false);
    k.placeStopped(true);
    k.moveTo('lane');
    k.setTargetSpeed(k.opt.cruise);
    let asked = false;
    const r = run(k, 30, 60, (t) => {
      if (!asked && t > 1.5) {
        asked = true;
        k.moveTo('shoulder');
        k.brakeToStop();
      }
    });
    expect(k.stopped).toBe(true);
    expect(r.last.lateral).toBeCloseTo(k.opt.shoulderOffset, 2);
    expect(r.maxDPsi).toBeLessThan(0.005);
    expect(r.slideStill).toBeLessThan(1e-5);
  });
});

describe('máquina de estados', () => {
  it('frena, se detiene y recién ahí abre; ignora toques repetidos', () => {
    const cmds: Command[] = [];
    const m = new ActionMachine({ onCommand: (c) => cmds.push(c) });
    expect(m.toggle()).toBe(true);
    expect(m.state).toBe('FRENANDO');
    expect(m.toggle()).toBe(false);
    m.update(0.1, { stopped: false, opened: false, closed: true, cruising: false });
    expect(cmds).toEqual(['frenar']);
    m.update(0.1, { stopped: true, opened: false, closed: true, cruising: false });
    expect(m.state).toBe('ABRIENDO');
    expect(cmds).toEqual(['frenar', 'abrir']);
    m.update(0.1, { stopped: true, opened: true, closed: false, cruising: false });
    expect(m.state).toBe('ABIERTO');
    m.toggle();
    expect(m.state).toBe('CERRANDO');
    m.update(0.1, { stopped: true, opened: false, closed: true, cruising: false });
    expect(m.state).toBe('DETENIDO');
    m.update(0.6, { stopped: true, opened: false, closed: true, cruising: false });
    expect(m.state).toBe('DETENIDO');
    m.update(0.5, { stopped: true, opened: false, closed: true, cruising: false });
    expect(m.state).toBe('ARRANCANDO');
    m.update(0.1, { stopped: false, opened: false, closed: true, cruising: true });
    expect(m.state).toBe('CIRCULANDO');
    expect(cmds).toEqual(['frenar', 'abrir', 'cerrar', 'arrancar']);
  });

  it('cambio de tipo abierto: cierra sin animación y queda detenido', () => {
    const cmds: Command[] = [];
    const m = new ActionMachine({ onCommand: (c) => cmds.push(c) }, 'ABIERTO');
    m.closeImmediately();
    expect(m.state).toBe('DETENIDO');
    m.update(5, { stopped: true, opened: false, closed: true, cruising: false });
    expect(m.state).toBe('DETENIDO');
    expect(cmds).toEqual(['cerrarYa']);
  });
});
