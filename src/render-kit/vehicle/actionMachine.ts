/**
 * Máquina de estados de "Ver en acción" para un vehículo que circula.
 *
 *   CIRCULANDO → FRENANDO → DETENIDO → ABRIENDO → ABIERTO → CERRANDO → DETENIDO → ARRANCANDO → CIRCULANDO
 *
 * - La animación nunca empieza con el vehículo en movimiento: el pedido se guarda hasta DETENIDO.
 * - "Volver a cerrar": cierra, espera `restartDelay` detenido y arranca.
 * - Toques repetidos durante una transición se ignoran (no se encolan).
 * - Es pura (sin three.js ni React): el anfitrión le avisa cuándo se detuvo, cuándo terminó
 *   de abrir o de cerrar, y ejecuta las órdenes que devuelve.
 */
export type VehicleState = 'CIRCULANDO' | 'FRENANDO' | 'DETENIDO' | 'ABRIENDO' | 'ABIERTO' | 'CERRANDO' | 'ARRANCANDO';

export type Command = 'frenar' | 'abrir' | 'cerrar' | 'arrancar' | 'cerrarYa';

export interface MachineEvents {
  onCommand: (c: Command) => void;
  onState?: (s: VehicleState) => void;
}

export interface MachineOptions {
  /** Espera detenido entre cerrar y arrancar (s). */
  restartDelay: number;
  /** Al quedar detenido y cerrado, arranca solo (salvo que se pida quedarse quieto). */
  autoRestart: boolean;
}

export class ActionMachine {
  state: VehicleState;
  private wantOpen = false;
  private hold = false;
  private wait = 0;
  private opt: MachineOptions;

  constructor(
    private ev: MachineEvents,
    initial: VehicleState = 'CIRCULANDO',
    opt: Partial<MachineOptions> = {},
  ) {
    this.state = initial;
    this.opt = { restartDelay: 1, autoRestart: true, ...opt };
  }

  private go(s: VehicleState): void {
    if (this.state === s) return;
    this.state = s;
    this.ev.onState?.(s);
  }

  /** Botón "Ver en acción" / "Volver a cerrar". Devuelve false si se ignoró. */
  toggle(): boolean {
    switch (this.state) {
      case 'CIRCULANDO':
      case 'ARRANCANDO':
        this.wantOpen = true;
        this.go('FRENANDO');
        this.ev.onCommand('frenar');
        return true;
      case 'DETENIDO':
        this.wantOpen = false;
        this.go('ABRIENDO');
        this.ev.onCommand('abrir');
        return true;
      case 'ABIERTO':
        this.go('CERRANDO');
        this.ev.onCommand('cerrar');
        return true;
      default:
        // FRENANDO, ABRIENDO, CERRANDO: transición en curso, se ignora.
        return false;
    }
  }

  /** Detener sin abrir (p. ej. ir a "Tu marca"): frena y se queda quieto. */
  stopAndHold(): void {
    this.hold = true;
    this.wantOpen = false;
    if (this.state === 'CIRCULANDO' || this.state === 'ARRANCANDO') {
      this.go('FRENANDO');
      this.ev.onCommand('frenar');
    } else if (this.state === 'ABIERTO' || this.state === 'ABRIENDO') {
      this.go('CERRANDO');
      this.ev.onCommand('cerrar');
    }
  }

  /** Poner en marcha (si está detenido y cerrado). */
  start(): boolean {
    this.hold = false;
    if (this.state !== 'DETENIDO') return false;
    this.go('ARRANCANDO');
    this.ev.onCommand('arrancar');
    return true;
  }

  /** Cambio de tipo con el equipo abierto: se cierra sin animación y queda detenido. */
  closeImmediately(): void {
    if (this.state === 'ABIERTO' || this.state === 'ABRIENDO' || this.state === 'CERRANDO') {
      this.ev.onCommand('cerrarYa');
      this.wantOpen = false;
      this.hold = true;
      this.go('DETENIDO');
    }
  }

  /** Estado inicial al entrar a la escena. */
  reset(state: VehicleState, hold = false): void {
    this.state = state;
    this.hold = hold;
    this.wantOpen = false;
    this.wait = 0;
    this.ev.onState?.(state);
  }

  get holding(): boolean {
    return this.hold;
  }

  /** Avance del reloj y avisos del anfitrión. */
  update(dt: number, s: { stopped: boolean; opened: boolean; closed: boolean; cruising: boolean }): void {
    switch (this.state) {
      case 'FRENANDO':
        if (s.stopped) {
          if (this.wantOpen) {
            this.wantOpen = false;
            this.go('ABRIENDO');
            this.ev.onCommand('abrir');
          } else {
            this.go('DETENIDO');
            this.wait = 0;
          }
        }
        break;
      case 'ABRIENDO':
        if (s.opened) this.go('ABIERTO');
        break;
      case 'CERRANDO':
        if (s.closed) {
          this.go('DETENIDO');
          this.wait = 0;
        }
        break;
      case 'DETENIDO':
        if (!this.hold && this.opt.autoRestart && s.closed) {
          this.wait += dt;
          if (this.wait >= this.opt.restartDelay) {
            this.go('ARRANCANDO');
            this.ev.onCommand('arrancar');
          }
        }
        break;
      case 'ARRANCANDO':
        if (s.cruising) this.go('CIRCULANDO');
        break;
      default:
        break;
    }
  }
}
