/**
 * Ensamblador: junta cientos de piezas chicas en muy pocas mallas (una por
 * material y por nodo móvil). Menos draw calls = más fps en GPU integradas.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MatKey, MaterialSet } from '../materials';

interface NodeDef {
  parent: string | null;
  /** Punto de pivote en coordenadas del semi (pose de reposo). */
  pivot: THREE.Vector3;
}

interface Bucket {
  node: string;
  mat: MatKey;
  geos: THREE.BufferGeometry[];
}

export interface BuiltAssembly {
  root: THREE.Group;
  nodes: Record<string, THREE.Group>;
  dispose: () => void;
  triangles: number;
  meshes: number;
}

/** Materiales cuya geometría lleva el atributo de proyección del logo/texto. */
const LIVERY_MATS: MatKey[] = ['bodyPaint', 'lona'];

function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  // mergeGeometries exige los mismos atributos en todas las piezas.
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (g.index) {
    const ng = g.toNonIndexed();
    g.dispose();
    g = ng;
  }
  g.morphAttributes = {};
  return g;
}

export class Assembly {
  private nodes = new Map<string, NodeDef>([['root', { parent: null, pivot: new THREE.Vector3() }]]);
  private buckets = new Map<string, Bucket>();
  private extras: { node: string; object: THREE.Object3D }[] = [];
  private current = 'root';

  /** Declara un nodo móvil (grupo) con su pivote en coordenadas del semi. */
  node(name: string, parent = 'root', pivot: [number, number, number] = [0, 0, 0]): this {
    this.nodes.set(name, { parent, pivot: new THREE.Vector3(...pivot) });
    return this;
  }

  /** Las piezas que se agreguen a continuación van a este nodo. */
  into(name: string): this {
    if (!this.nodes.has(name)) throw new Error(`Nodo no declarado: ${name}`);
    this.current = name;
    return this;
  }

  get currentNode(): string {
    return this.current;
  }

  add(mat: MatKey, ...geos: (THREE.BufferGeometry | THREE.BufferGeometry[] | null | undefined)[]): this {
    const key = `${this.current}|${mat}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { node: this.current, mat, geos: [] };
      this.buckets.set(key, b);
    }
    for (const g of geos) {
      if (!g) continue;
      if (Array.isArray(g)) b.geos.push(...g);
      else b.geos.push(g);
    }
    return this;
  }

  /** Agrega un objeto ya armado (por ejemplo un InstancedMesh) a un nodo. Coordenadas del semi. */
  attach(object: THREE.Object3D, node = this.current): this {
    this.extras.push({ node, object });
    return this;
  }

  build(mats: MaterialSet): BuiltAssembly {
    const groups: Record<string, THREE.Group> = {};
    const disposables: THREE.BufferGeometry[] = [];
    let triangles = 0;
    let meshes = 0;

    for (const [name] of this.nodes) {
      const g = new THREE.Group();
      g.name = name;
      groups[name] = g;
    }
    for (const [name, def] of this.nodes) {
      if (!def.parent) continue;
      const parent = this.nodes.get(def.parent);
      if (!parent) throw new Error(`Nodo padre inexistente: ${def.parent}`);
      groups[def.parent].add(groups[name]);
      groups[name].position.copy(def.pivot).sub(parent.pivot);
      groups[name].userData.rest = groups[name].position.clone();
    }

    for (const b of this.buckets.values()) {
      if (b.geos.length === 0) continue;
      const def = this.nodes.get(b.node)!;
      const parts = b.geos.map(normalize);
      const merged = mergeGeometries(parts, false);
      parts.forEach((p) => p.dispose());
      if (!merged) continue;
      if (LIVERY_MATS.includes(b.mat)) {
        // Posición en reposo (coordenadas del semi): el shader proyecta el logo con esto.
        merged.setAttribute('aLivery', merged.getAttribute('position').clone());
      }
      if (def.pivot.lengthSq() > 0) merged.translate(-def.pivot.x, -def.pivot.y, -def.pivot.z);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mats[b.mat]);
      mesh.name = `${b.node}:${b.mat}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      groups[b.node].add(mesh);
      disposables.push(merged);
      triangles += merged.getAttribute('position').count / 3;
      meshes++;
    }

    for (const e of this.extras) {
      const def = this.nodes.get(e.node)!;
      e.object.position.sub(def.pivot);
      groups[e.node].add(e.object);
      meshes++;
    }

    this.buckets.clear();
    const extras = this.extras;
    return {
      root: groups.root,
      nodes: groups,
      triangles,
      meshes,
      dispose: () => {
        disposables.forEach((g) => g.dispose());
        // Los InstancedMesh comparten geometría cacheada: solo se libera la instancia.
        extras.forEach((e) => (e.object as THREE.InstancedMesh).dispose?.());
      },
    };
  }
}
