/**
 * Recorrido de una ruta infinita con curvas suaves y largas.
 *
 * El eje de la ruta es z = zc(x) (x hacia adelante, z hacia la derecha del vehículo).
 * Es periódico en x con período PERIOD: el recorrido se puede "enrollar" (x mod PERIOD)
 * sin saltos, y así las coordenadas nunca crecen (sin errores de precisión en la GPU).
 * Todas las escalas de textura y el espaciado de los objetos de la ruta deben dividir
 * a PERIOD para que el enrollado sea invisible.
 */

export interface RoadShape {
  /** Período del recorrido (m). */
  period: number;
  /** Ondas que forman el eje: amplitud (m), longitud de onda (m, divisor del período) y fase. */
  waves: { amp: number; length: number; phase: number }[];
}

export const DEFAULT_ROAD: RoadShape = {
  period: 1200,
  waves: [
    { amp: 18, length: 1200, phase: 0 },
    { amp: 6, length: 400, phase: 1.1 },
  ],
};

export class RoadPath {
  constructor(public readonly shape: RoadShape = DEFAULT_ROAD) {}

  /** Desplazamiento lateral del eje en la abscisa x. */
  z(x: number): number {
    let z = 0;
    for (const w of this.shape.waves) z += w.amp * Math.sin((2 * Math.PI * x) / w.length + w.phase);
    return z;
  }

  /** Pendiente dz/dx. */
  dz(x: number): number {
    let d = 0;
    for (const w of this.shape.waves) {
      const k = (2 * Math.PI) / w.length;
      d += w.amp * k * Math.cos(k * x + w.phase);
    }
    return d;
  }

  /** Curvatura con signo (1/m). Positiva = gira hacia +z (derecha). */
  curvature(x: number): number {
    let dd = 0;
    for (const w of this.shape.waves) {
      const k = (2 * Math.PI) / w.length;
      dd -= w.amp * k * k * Math.sin(k * x + w.phase);
    }
    const d = this.dz(x);
    return dd / Math.pow(1 + d * d, 1.5);
  }

  /** Rumbo (rad) del eje en x, medido desde +x hacia +z. */
  heading(x: number): number {
    return Math.atan(this.dz(x));
  }

  wrap(x: number): number {
    const p = this.shape.period;
    return ((x % p) + p) % p;
  }

  /** Mismo eje en GLSL: `float roadZ(float x)` y `float roadDZ(float x)`. */
  glsl(): string {
    const term = (fn: 'sin' | 'cos', w: RoadShape['waves'][number], mul = '') => `${mul}${w.amp.toFixed(4)} * ${fn}(${((2 * Math.PI) / w.length).toFixed(8)} * x + ${w.phase.toFixed(4)})`;
    const z = this.shape.waves.map((w) => term('sin', w)).join(' + ');
    const dz = this.shape.waves.map((w) => term('cos', w, `${((2 * Math.PI) / w.length).toFixed(8)} * `)).join(' + ');
    return `float roadZ(float x) { return ${z}; }\nfloat roadDZ(float x) { return ${dz}; }\n`;
  }
}
