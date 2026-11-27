/**
 * Cinemática de un camión con semirremolque sobre una ruta (sin motor de física).
 *
 * - Velocidad con aceleración y frenado limitados y sin golpes (tirón acotado): de 80 a 0
 *   en unos 5 s, con una desaceleración que se suaviza al final.
 * - El eje trasero del tractor sigue el carril (eje de la ruta + desplazamiento lateral, que
 *   cambia suave al pasar a la banquina o volver al carril).
 * - El semi se engancha en el perno rey (adelante del eje trasero del tractor una distancia
 *   `hitch`) y sigue con el modelo de remolque:
 *     dψs/dt = (v·sin(ψt − ψs) + hitch·ψt'·cos(ψt − ψs)) / L
 *   con L = distancia perno rey – centro del grupo de ejes del semi.
 * - Ruedas: ángulo girado = distancia recorrida / radio (sin patinar).
 * - Suspensión: cabeceo al acelerar y frenar, rolido en curva y una vibración mínima.
 */
import { RoadPath } from './road';

export interface TruckGeometry {
  /** Distancia perno rey – centro del grupo de ejes del semi (m). */
  trailerL: number;
  /** El perno rey está esta distancia por delante del eje trasero (o tándem) del tractor (m). */
  hitch: number;
  /** Radios de rueda (m). */
  trailerWheelR: number;
  tractorWheelR: number;
  tractorFrontWheelR: number;
  /** Suspensión neumática (más suave y lenta que la de elásticos). */
  airSuspension: boolean;
}

export interface KinematicsOptions {
  cruise: number;
  accel: number;
  /** Desaceleración máxima de servicio (m/s²). */
  brake: number;
  /** Tirón máximo (m/s³): cuánto puede cambiar la aceleración por segundo. */
  jerk: number;
  /** Desplazamiento lateral del carril respecto del eje de la ruta (m). */
  laneOffset: number;
  /** Desplazamiento lateral sobre la banquina (m). */
  shoulderOffset: number;
  /**
   * Distancia recorrida para cambiar de carril (m): mín. y máx. Un vehículo no se puede correr
   * de costado sin avanzar, así que el cambio de carril avanza con la distancia, no con el reloj.
   */
  laneChangeDistance: [number, number];
  /** Curvatura máxima del rumbo (rad por metro recorrido): el volante no gira de golpe. */
  maxYawPerMeter: number;
  /** Velocidad lenta para terminar de irse a la banquina cuando se pide frenar casi parado (m/s). */
  creepSpeed: number;
}

export const DEFAULT_KINEMATICS: KinematicsOptions = {
  cruise: 80 / 3.6,
  accel: 0.75,
  brake: 4.6,
  jerk: 3.2,
  laneOffset: 1.825,
  shoulderOffset: 4.15,
  laneChangeDistance: [24, 64],
  maxYawPerMeter: 0.12,
  creepSpeed: 3.5,
};

export interface TruckPose {
  /** Abscisa del eje trasero del tractor sobre la ruta (enrollada al período). */
  s: number;
  /** Distancia total recorrida (m). */
  odometer: number;
  v: number;
  a: number;
  /** Posición del perno rey en el marco local (el punto del eje de la ruta en `s` es el origen). */
  kingpin: { x: number; z: number };
  /** Rumbos absolutos del tractor y del semi (rad, desde +x hacia +z). */
  psiTractor: number;
  psiTrailer: number;
  /** Ángulo de articulación (rad). */
  articulation: number;
  /** Ángulo girado por las ruedas (rad, crece al avanzar). */
  wheelAngle: { trailer: number; tractor: number; tractorFront: number };
  /** Cabeceo (+ = nariz abajo), rolido (+ = hacia la derecha) y sube/baja (m) de la carrocería. */
  body: { pitch: number; roll: number; heave: number };
  /** Desplazamiento lateral actual del eje trasero del tractor (m). */
  lateral: number;
  /** -1 izquierda, 0 nada, +1 derecha (para los giros). */
  steeringIntent: -1 | 0 | 1;
}

export class TruckKinematics {
  readonly road: RoadPath;
  readonly opt: KinematicsOptions;
  geo: TruckGeometry;
  private s = 0;
  private odo = 0;
  private v: number;
  private a = 0;
  private targetV: number;
  private lateral: number;
  private lateralFrom: number;
  private lateralTo: number;
  private lateralT = 1;
  /** Distancia del cambio de carril en curso (m). */
  private laneDist = 60;
  /** Rumbo del tractor respecto del eje de la ruta por el cambio de carril (rad), suavizado. */
  private latPsi = 0;
  /** Se pidió detenerse en la banquina pero todavía no alcanza la distancia para frenar. */
  private pendingStop = false;
  /** Rumbo absoluto del tractor y del semi (rad, en el marco de la ruta). */
  private psiT = 0;
  private psiS = 0;
  private prevPsiT = 0;
  private wheel = { trailer: 0, tractor: 0, tractorFront: 0 };
  private body = { pitch: 0, roll: 0, heave: 0, pitchV: 0, rollV: 0 };
  private time = 0;
  /** Control manual: acelerador/freno y volante (-1..1), o null (piloto automático). */
  private manual: { throttle: number; steer: number } | null = null;
  /** Rumbo del tractor relativo al eje de la ruta en modo manual (modelo de bicicleta). */
  private relHeading = 0;
  /** Límites del modo manual. */
  readonly manualLimits = { maxSpeed: 90 / 3.6, maxSteer: 0.14, wheelbase: 3.9, lateral: [-3.2, 5.2] as [number, number] };

    /** Frenado planificado: velocidad inicial, duración y tiempo transcurrido. */
  private brakePlan: { v0: number; T: number; t: number } | null = null;

  constructor(geo: TruckGeometry, opt: Partial<KinematicsOptions> = {}, road = new RoadPath(), moving = true) {
    this.geo = geo;
    this.opt = { ...DEFAULT_KINEMATICS, ...opt };
    this.road = road;
    this.v = moving ? this.opt.cruise : 0;
    this.targetV = this.v;
    this.lateral = this.lateralFrom = this.lateralTo = this.opt.laneOffset;
    this.psiT = this.psiS = this.prevPsiT = this.road.heading(0);
  }

  get speed(): number {
    return this.v;
  }

  /** Detenido de verdad: terminó el frenado (la desaceleración ya volvió a cero). */
  get stopped(): boolean {
    return this.targetV === 0 && this.brakePlan === null && this.v < 0.01;
  }

  get changingLane(): boolean {
    return this.lateralT < 1;
  }

  /** Velocidad objetivo (m/s). */
  setTargetSpeed(v: number): void {
    this.targetV = Math.max(0, v);
    if (v > 0) {
      this.brakePlan = null;
      this.pendingStop = false;
    }
  }

  /**
   * Frenar hasta detenerse con un perfil suave (smoothstep): la desaceleración crece,
   * llega al máximo (1,5 × la media) y vuelve a cero justo al parar (sin golpe).
   * Desaceleración media 4 m/s²: de 80 km/h tarda ≈5,5 s.
   */
  brakeToStop(): void {
    this.pendingStop = false;
    if (!this.tryStartBraking()) {
      // Casi parado y con el cambio de carril a medio hacer: avanza despacio hasta que la
      // frenada alcance para terminarlo (si no, se correría de costado sin avanzar).
      this.pendingStop = true;
      this.brakePlan = null;
      this.targetV = Math.max(this.v, this.opt.creepSpeed);
    }
  }

  /** Distancia de frenado con el perfil suave desde la velocidad actual (m). */
  private brakeDistance(v0: number): number {
    return (v0 * Math.max(1.2, v0 / 4)) / 2;
  }

  /** Arranca el frenado si la distancia alcanza para terminar el cambio de carril. */
  private tryStartBraking(): boolean {
    const v0 = this.v;
    const remaining = this.lateralT < 1 ? 1 - this.lateralT : 0;
    const db = this.brakeDistance(v0);
    if (remaining > 0 && remaining * this.opt.laneChangeDistance[0] > 0.8 * db) return false;
    this.targetV = 0;
    if (remaining > 0) this.laneDist = Math.min(this.laneDist, (0.8 * db) / remaining);
    if (v0 < 0.05) {
      this.v = 0;
      this.a = 0;
      this.brakePlan = null;
      return true;
    }
    this.brakePlan = { v0, T: Math.max(1.2, v0 / 4), t: 0 };
    return true;
  }

  /** Lleva el vehículo al carril (lane) o a la banquina (shoulder). */
  moveTo(where: 'lane' | 'shoulder'): void {
    const to = where === 'lane' ? this.opt.laneOffset : this.opt.shoulderOffset;
    if (to === this.lateralTo) return;
    this.lateralFrom = this.lateral;
    this.lateralTo = to;
    this.lateralT = 0;
    const [dMin, dMax] = this.opt.laneChangeDistance;
    this.laneDist = Math.min(dMax, Math.max(dMin, this.v * 2.6));
  }

  /**
   * Control manual (modelo de bicicleta para el tractor; el semi sigue con el modelo de
   * remolque). Con `null` vuelve el piloto automático: retoma el carril y la velocidad.
   */
  setManual(input: { throttle: number; steer: number } | null): void {
    if (input && !this.manual) {
      this.brakePlan = null;
      this.pendingStop = false;
      this.lateralT = 1;
      this.lateralFrom = this.lateralTo = this.lateral;
    }
    if (!input && this.manual) {
      this.latPsi = this.relHeading;
      this.relHeading = 0;
      this.moveTo('lane');
      this.setTargetSpeed(this.opt.cruise);
    }
    this.manual = input;
  }

  get isManual(): boolean {
    return this.manual !== null;
  }

    /** Coloca el vehículo detenido en la banquina (al entrar a la ruta ya parado). */
  placeStopped(onShoulder: boolean): void {
    this.v = 0;
    this.a = 0;
    this.targetV = 0;
    this.brakePlan = null;
    this.lateral = this.lateralFrom = this.lateralTo = onShoulder ? this.opt.shoulderOffset : this.opt.laneOffset;
    this.lateralT = 1;
    this.latPsi = 0;
    this.pendingStop = false;
  }

  step(dtIn: number): TruckPose {
    const dt = Math.min(Math.max(dtIn, 0), 0.1);
    this.time += dt;
    const o = this.opt;

    // --- Velocidad ---
    if (this.pendingStop && this.tryStartBraking()) this.pendingStop = false;
    let ds: number;
    const bp = this.brakePlan;
    if (this.manual) {
      const lim = this.manualLimits;
      const th = this.manual.throttle;
      const aWanted = th > 0.05 ? th * o.accel * 1.6 : th < -0.05 ? th * o.brake : -0.08 - this.v * 0.004;
      const da = Math.max(-o.jerk * dt, Math.min(o.jerk * dt, aWanted - this.a));
      this.a += da;
      const v0 = this.v;
      this.v = Math.min(lim.maxSpeed, Math.max(0, this.v + this.a * dt));
      if (this.v === 0) this.a = Math.max(0, this.a);
      ds = 0.5 * (v0 + this.v) * dt;
    } else if (bp) {
      // Perfil de frenado: v = v0·(1 − S(u)), S = smoothstep → a(0) = a(T) = 0.
      const S = (u: number) => u * u * (3 - 2 * u);
      const dS = (u: number) => 6 * u * (1 - u);
      const u0 = Math.min(1, bp.t / bp.T);
      bp.t += dt;
      const u1 = Math.min(1, bp.t / bp.T);
      // Distancia exacta del tramo (integral de v): v0·(Δt − T·∫S).
      const intS = (u: number) => u * u * u * (1 - 0.5 * u);
      ds = bp.v0 * ((u1 - u0) * bp.T - bp.T * (intS(u1) - intS(u0)));
      this.v = bp.v0 * (1 - S(u1));
      this.a = (-bp.v0 * dS(u1)) / bp.T;
      if (u1 >= 1) {
        this.v = 0;
        this.a = 0;
        this.brakePlan = null;
      }
    } else {
      // Aceleración objetivo con tirón acotado (sin golpes).
      let aWanted: number;
      if (this.targetV > this.v) aWanted = Math.min(o.accel, (this.targetV - this.v) * 0.6 + 0.05);
      else aWanted = Math.max(-o.brake, (this.targetV - this.v) * 1.2);
      const da = Math.max(-o.jerk * dt, Math.min(o.jerk * dt, aWanted - this.a));
      this.a += da;
      const v0 = this.v;
      this.v = Math.max(0, this.v + this.a * dt);
      if (this.targetV === 0 && this.v < 0.01) {
        this.v = 0;
        this.a = 0;
      }
      ds = 0.5 * (v0 + this.v) * dt;
    }
    this.s = this.road.wrap(this.s + ds);
    this.odo += ds;

    // --- Lateral: cambio de carril con perfil suave (seno), o volante en modo manual ---
    if (this.manual) {
      const lim = this.manualLimits;
      const delta = this.manual.steer * lim.maxSteer;
      this.relHeading += (this.v / lim.wheelbase) * Math.tan(delta) * dt;
      this.relHeading = Math.max(-0.35, Math.min(0.35, this.relHeading));
      const latRate = this.v * Math.sin(this.relHeading);
      const prev = this.lateral;
      this.lateral = Math.max(lim.lateral[0], Math.min(lim.lateral[1], this.lateral + latRate * dt));
      if (this.lateral !== prev + latRate * dt) this.relHeading *= 0.9;
      this.lateralFrom = this.lateralTo = this.lateral;
    } else if (this.lateralT < 1) {
      // Avanza con la distancia recorrida (parado no se corre de costado).
      this.lateralT = Math.min(1, this.lateralT + Math.max(0, ds) / this.laneDist);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * this.lateralT);
      this.lateral = this.lateralFrom + (this.lateralTo - this.lateralFrom) * e;
    }

    // --- Rumbo del tractor: tangente del eje de la ruta + componente del cambio lateral ---
    const roadPsi = this.road.heading(this.s);
    if (this.manual) this.latPsi = this.relHeading;
    else {
      // Pendiente del perfil del cambio de carril (dLateral / ds): no depende de la velocidad.
      const slope = this.lateralT < 1 ? ((this.lateralTo - this.lateralFrom) * 0.5 * Math.PI * Math.sin(Math.PI * this.lateralT)) / this.laneDist : 0;
      const want = Math.atan(slope);
      // El rumbo cambia, como mucho, `maxYawPerMeter` por metro recorrido (sin saltos).
      const maxStep = Math.abs(ds) * o.maxYawPerMeter;
      this.latPsi += Math.max(-maxStep, Math.min(maxStep, want - this.latPsi));
    }
    this.prevPsiT = this.psiT;
    this.psiT = roadPsi + this.latPsi;
    const psiTRate = dt > 0 ? (this.psiT - this.prevPsiT) / dt : 0;

    // --- Semi: modelo de remolque (nunca se cruza: la articulación queda acotada) ---
    const L = Math.max(2, this.geo.trailerL);
    const rel = this.psiT - this.psiS;
    const psiSRate = (this.v * Math.sin(rel) + this.geo.hitch * psiTRate * Math.cos(rel)) / L;
    this.psiS += psiSRate * dt;
    const maxArt = 0.9;
    if (this.psiT - this.psiS > maxArt) this.psiS = this.psiT - maxArt;
    if (this.psiT - this.psiS < -maxArt) this.psiS = this.psiT + maxArt;

    // --- Ruedas ---
    this.wheel.trailer += ds / this.geo.trailerWheelR;
    this.wheel.tractor += ds / this.geo.tractorWheelR;
    this.wheel.tractorFront += ds / this.geo.tractorFrontWheelR;

    // --- Suspensión (masa-resorte amortiguada) ---
    const air = this.geo.airSuspension;
    const kStiff = air ? 26 : 48;
    const damp = air ? 7.5 : 9.5;
    const curv = this.road.curvature(this.s);
    const latAcc = this.v * this.v * curv;
    const targetPitch = -this.a * (air ? 0.0052 : 0.0038);
    const targetRoll = latAcc * (air ? 0.0095 : 0.0065);
    const b = this.body;
    b.pitchV += (kStiff * (targetPitch - b.pitch) - damp * b.pitchV) * dt;
    b.pitch += b.pitchV * dt;
    b.rollV += (kStiff * (targetRoll - b.roll) - damp * b.rollV) * dt;
    b.roll += b.rollV * dt;
    // Vibración muy sutil por el asfalto, proporcional a la velocidad.
    const vib = Math.min(1, this.v / 22) * (air ? 0.0012 : 0.0019);
    b.heave = vib * (Math.sin(this.time * 31.7) * 0.6 + Math.sin(this.time * 47.3 + 1.3) * 0.4);

    // Marco local: el mundo se traslada para que el punto del eje de la ruta en `s` quede en el
    // origen (sin rotarlo). El eje trasero del tractor está en (0, lateral); rumbos absolutos.
    return {
      s: this.s,
      odometer: this.odo,
      v: this.v,
      a: this.a,
      kingpin: { x: this.geo.hitch * Math.cos(this.psiT), z: this.lateral + this.geo.hitch * Math.sin(this.psiT) },
      psiTractor: this.psiT,
      psiTrailer: this.psiS,
      articulation: this.psiT - this.psiS,
      wheelAngle: { ...this.wheel },
      body: { pitch: b.pitch, roll: b.roll, heave: b.heave },
      lateral: this.lateral,
      steeringIntent: this.lateralT < 1 ? (this.lateralTo > this.lateralFrom ? 1 : -1) : 0,
    };
  }
}
