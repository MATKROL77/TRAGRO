/**
 * Tren rodante: ejes, frenos, suspensión mecánica (elásticos) o neumática
 * (fuelles, brazos, amortiguadores), guardabarros y barreros.
 */
import type { Layout } from '@/core/layout';
import type { Assembly } from '../kit/asm';
import { arcBand, bar, box, cyl, extrudeSide, lathe, rbox, rod } from '../kit/geo';
import type { WheelPose } from './wheels';

export const LIFT_HEIGHT = 0.115;
export const BELLOWS_BASE_Y = 0.6;
export const BELLOWS_HEIGHT = 0.26;

export interface RunningGear {
  wheelPoses: WheelPose[];
  /** Posiciones de los barreros traseros (para imprimir el logo). */
  rearFlaps: { x: number; y: number; z: number; w: number; h: number }[];
}

export function buildRunningGear(asm: Assembly, L: Layout, frameBottomY: number, opts: { flapPrint: boolean }): RunningGear {
  const R = L.wheelR;
  const rz = L.railZ;
  const air = L.suspension === 'neumatica';
  const wheelPoses: WheelPose[] = [];
  const rearFlaps: RunningGear['rearFlaps'] = [];
  const outerZ = L.wheelZ[L.wheelZ.length - 1];
  const fenderZ = L.dual ? (L.wheelZ[0] + L.wheelZ[1]) / 2 : L.wheelZ[0];
  const fenderW = L.dual ? 0.69 : 0.47;
  const hubEnd = L.dual ? outerZ - 0.17 : outerZ + 0.12;
  const drumZ = L.dual ? L.wheelZ[0] + 0.02 : outerZ - 0.02;
  let seed = 1;
  const spin = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * Math.PI * 2;
  };

  L.axles.forEach((axle, i) => {
    const x = axle.x;
    const node = `axle${i}`;
    asm.node(node, 'root', [0, 0, 0]);
    asm.node(`bellows${i}`, node, [0, BELLOWS_BASE_Y, 0]);

    // --- Eje, frenos ----------------------------------------------------------
    asm.into(node);
    asm.add('blackSteel', cyl(0.0635, hubEnd * 2, 'z', x, R, 0, 20));
    for (const s of [1, -1]) {
      asm.add('castIron', cyl(0.212, 0.25, 'z', x, R, s * drumZ, 28));
      asm.add('blackSteel', cyl(0.226, 0.01, 'z', x, R, s * (drumZ - 0.13), 28));
      // Pulmón de freno doble con vástago y soporte.
      const bz = s * (rz - 0.17);
      asm.add('castIron', cyl(0.082, 0.11, 'x', x - 0.23, R + 0.01, bz, 18), cyl(0.074, 0.1, 'x', x - 0.335, R + 0.01, bz, 18));
      asm.add('chrome', cyl(0.086, 0.012, 'x', x - 0.28, R + 0.01, bz, 18));
      asm.add('blackSteel', box(0.11, 0.1, 0.02, x - 0.12, R + 0.01, bz), cyl(0.01, 0.2, 'x', x - 0.1, R + 0.01, bz, 8));
      // Leva en S hacia el tambor.
      asm.add('blackSteel', rod({ x: x - 0.06, y: R + 0.075, z: bz }, { x: x - 0.06, y: R + 0.075, z: s * (drumZ - 0.12) }, 0.017));

      for (const [k, wz] of L.wheelZ.entries()) {
        wheelPoses.push({ x, y: R, z: s * wz, side: s as 1 | -1, inner: L.dual && k === 0, axle: i, spin: spin() });
      }
    }

    if (!air) {
      // --- Elásticos ----------------------------------------------------------
      const leaves = 8;
      const t = 0.0125;
      const camber = 0.052;
      const aMain = 0.52;
      const rho = (aMain * aMain + camber * camber) / (2 * camber);
      const yTop = R + 0.0635 + 0.028 + leaves * t;
      for (const s of [1, -1]) {
        const z = s * rz;
        asm.into(node);
        for (let k = 0; k < leaves; k++) {
          const a = aMain - k * 0.049;
          const ang = Math.asin(a / (rho + k * t));
          asm.add('blackSteel', arcBand(x, yTop + rho, rho + k * t + 0.0008, rho + (k + 1) * t, -Math.PI / 2 - ang, -Math.PI / 2 + ang, 0.09, z, 10));
        }
        // Asiento, placa superior y abrazaderas en U con tuercas.
        asm.add('castIron', rbox(0.2, 0.03, 0.12, x, R + 0.0635 + 0.013, z, 0.005));
        asm.add('blackSteel', rbox(0.2, 0.018, 0.14, x, yTop + 0.011, z, 0.004), rbox(0.2, 0.02, 0.15, x, R - 0.08, z, 0.004));
        for (const dx of [-0.07, 0.07]) {
          for (const dz of [-0.057, 0.057]) {
            asm.add('galvanized', cyl(0.0105, yTop + 0.03 - (R - 0.105), 'y', x + dx, (yTop + 0.03 + R - 0.105) / 2, z + dz, 8));
            asm.add('galvanized', cyl(0.019, 0.02, 'y', x + dx, R - 0.1, z + dz, 6));
          }
          asm.add('galvanized', cyl(0.0105, 0.114, 'z', x + dx, yTop + 0.03, z, 8));
        }
        // Tensor (barra de reacción) del soporte delantero al eje.
        asm.add('blackSteel', rod({ x: x + 0.5, y: frameBottomY - 0.17, z: z - s * 0.085 }, { x: x + 0.04, y: R + 0.03, z: z - s * 0.085 }, 0.02, 10));
        asm.add('castIron', cyl(0.034, 0.05, 'z', x + 0.5, frameBottomY - 0.17, z - s * 0.085, 12), cyl(0.034, 0.05, 'z', x + 0.04, R + 0.03, z - s * 0.085, 12));
      }

      // Soportes al chasis: van con la masa suspendida.
      asm.into('sprung');
      const yEnd = yTop + camber - 0.02;
      const hanger = (hx: number, z: number, wide = 0.2) =>
        extrudeSide(
          [
            [hx - wide / 2, frameBottomY],
            [hx + wide / 2, frameBottomY],
            [hx + 0.075, yEnd - 0.03],
            [hx - 0.075, yEnd - 0.03],
          ],
          0.118,
          z,
          0.006,
        );
      const prev = L.axles[i - 1];
      const next = L.axles[i + 1];
      for (const s of [1, -1]) {
        const z = s * rz;
        const frontShared = L.grouped && prev !== undefined;
        const rearShared = L.grouped && next !== undefined;
        if (!frontShared) asm.add('chassisPaint', hanger(x + 0.52, z));
        if (!rearShared) asm.add('chassisPaint', hanger(x - 0.52, z));
        if (rearShared && next) {
          // Balancín compensador entre ejes consecutivos.
          const xm = (x + next.x) / 2;
          asm.add('chassisPaint', hanger(xm, z, 0.26));
          asm.add('blackSteel', rbox(0.34, 0.07, 0.1, xm, yEnd + 0.005, z, 0.01), cyl(0.024, 0.15, 'z', xm, yEnd + 0.045, z, 12));
        }
        asm.add('galvanized', cyl(0.018, 0.14, 'z', x + 0.52, yEnd + 0.01, z, 10), cyl(0.018, 0.14, 'z', x - 0.52, yEnd + 0.01, z, 10));
      }
    } else {
      // --- Suspensión neumática ------------------------------------------------
      const pivotY = 0.655;
      const seatX = x - 0.4;
      for (const s of [1, -1]) {
        const z = s * rz;
        asm.into('sprung');
        asm.add(
          'chassisPaint',
          extrudeSide(
            [
              [x + 0.36, frameBottomY],
              [x + 0.66, frameBottomY],
              [x + 0.585, pivotY - 0.075],
              [x + 0.435, pivotY - 0.075],
            ],
            0.135,
            z,
            0.006,
          ),
        );
        asm.add('galvanized', cyl(0.021, 0.17, 'z', x + 0.51, pivotY, z, 10));
        // Placa superior del fuelle y suplemento hasta el chasis.
        const topY = BELLOWS_BASE_Y + BELLOWS_HEIGHT;
        asm.add('blackSteel', cyl(0.118, 0.014, 'y', seatX, topY + 0.007, z, 24));
        if (frameBottomY - topY - 0.014 > 0.005) asm.add('chassisPaint', rbox(0.22, frameBottomY - topY - 0.014, 0.19, seatX, (frameBottomY + topY + 0.014) / 2, z, 0.006));
        asm.add('chassisPaint', rbox(0.07, 0.09, 0.07, x + 0.2, frameBottomY - 0.045, z - s * 0.105, 0.005));

        asm.into(node);
        // Brazo: ojo delantero, viga sobre el eje y cola hacia el fuelle.
        asm.add('blackSteel', cyl(0.052, 0.09, 'z', x + 0.51, pivotY, z, 16));
        asm.add('blackSteel', bar({ x: x + 0.5, y: pivotY, z }, { x: x + 0.0, y: R + 0.105, z }, 0.078, 0.082), bar({ x: x + 0.02, y: R + 0.105, z }, { x: seatX - 0.02, y: BELLOWS_BASE_Y - 0.14, z }, 0.078, 0.07));
        asm.add('blackSteel', cyl(0.1, 0.016, 'y', seatX, BELLOWS_BASE_Y - 0.108, z, 20), cyl(0.076, 0.1, 'y', seatX, BELLOWS_BASE_Y - 0.05, z, 20));
        // Abrazaderas del eje.
        asm.add('castIron', rbox(0.2, 0.04, 0.12, x, R + 0.0635 + 0.012, z, 0.005), rbox(0.2, 0.022, 0.15, x, R - 0.082, z, 0.004));
        for (const dx of [-0.075, 0.075]) for (const dz of [-0.06, 0.06]) asm.add('galvanized', cyl(0.0105, 0.29, 'y', x + dx, R + 0.045, z + dz, 8), cyl(0.019, 0.02, 'y', x + dx, R - 0.1, z + dz, 6));
        // Amortiguador.
        const a = { x: x - 0.1, y: R + 0.1, z: z - s * 0.105 };
        const b = { x: x + 0.2, y: frameBottomY - 0.05, z: z - s * 0.105 };
        const mid = { x: a.x + (b.x - a.x) * 0.58, y: a.y + (b.y - a.y) * 0.58, z: a.z };
        asm.add('blackSteel', rod(a, mid, 0.033, 12));
        asm.add('chrome', rod(mid, b, 0.015, 10));

        asm.into(`bellows${i}`);
        asm.add(
          'rubber',
          lathe(
            [
              [0.076, 0],
              [0.108, 0.012],
              [0.126, 0.05],
              [0.13, 0.11],
              [0.127, 0.17],
              [0.112, 0.225],
              [0.095, 0.252],
              [0.09, BELLOWS_HEIGHT],
            ],
            'y',
            seatX,
            BELLOWS_BASE_Y,
            z,
            24,
          ),
        );
      }
    }

    // --- Guardabarros y barreros (con la masa suspendida) ------------------------
    asm.into('sprung');
    const rF = R + 0.088;
    const cy = R + 0.012;
    for (const s of [1, -1]) {
      const z = s * fenderZ;
      asm.add('plastic', arcBand(x, cy, rF, rF + 0.009, (22 * Math.PI) / 180, (158 * Math.PI) / 180, fenderW, z, 22));
      // Labio de refuerzo del borde exterior.
      asm.add('plastic', arcBand(x, cy, rF - 0.02, rF + 0.009, (22 * Math.PI) / 180, (158 * Math.PI) / 180, 0.012, z + s * (fenderW / 2 - 0.006), 22));
      for (const dx of [-0.34, 0.34]) {
        const by = cy + Math.sqrt((rF + 0.009) ** 2 - dx * dx) + 0.016;
        asm.add('galvanized', cyl(0.016, fenderW + 0.12, 'z', x + dx, by, z - s * 0.06, 8));
      }
      const hasFlap = !L.grouped || i === L.axles.length - 1;
      if (hasFlap) {
        const fx = x - (rF + 0.03);
        const top = cy + 0.19;
        const fh = top - 0.19;
        const fw = fenderW - 0.06;
        asm.add('rubber', rbox(0.012, fh, fw, fx, top - fh / 2, z, 0.004));
        asm.add('galvanized', box(0.03, 0.03, fw + 0.04, fx, top + 0.005, z));
        if (i === L.axles.length - 1) rearFlaps.push({ x: fx - 0.0075, y: top - fh * 0.42, z, w: fw * 0.8, h: fw * 0.5 });
      }
    }
  });

  void opts;
  return { wheelPoses, rearFlaps };
}
