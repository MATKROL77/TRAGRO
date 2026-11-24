import * as THREE from 'three';
import { DIM, type SeederLayout } from '../machines/seeder/layout';

/** Caja de la máquina en trabajo o transporte (a partir del layout: coincide con las cotas calculadas). */
export function layoutBox(L: SeederLayout, transport: boolean): THREE.Box3 {
  const b = new THREE.Box3();
  if (!transport) {
    b.min.set(-L.barLength / 2, 0, DIM.rowRearZ);
    b.max.set(L.barLength / 2, L.topY, DIM.hitchZ + 0.1);
    return b;
  }
  const d = L.transportDims;
  if (L.transport === 'longitudinal') {
    const xc = (DIM.rowFrontZ + DIM.rowRearZ) / 2;
    b.min.set(xc - d.width / 2, 0, -(L.barLength / 2 + 0.4));
    b.max.set(xc + d.width / 2, d.height, L.barLength / 2 + DIM.transportDrawbar);
  } else {
    b.min.set(-d.width / 2, 0, DIM.rowRearZ);
    b.max.set(d.width / 2, d.height, DIM.rowRearZ + d.length);
  }
  return b;
}
