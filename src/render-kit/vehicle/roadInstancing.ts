/**
 * Objetos de la ruta que "pasan" junto al vehículo sin tocar la CPU: postes, alambrado,
 * cultivo, postes de luz... Cada instancia guarda su abscisa sobre la ruta (u), su
 * desplazamiento lateral, un giro extra y una escala. En el vertex shader se ubica en el
 * marco local (el mundo se traslada para que el vehículo quede en el origen), siguiendo
 * la curva del eje, y se "recicla" con un módulo: la que queda atrás reaparece adelante.
 *
 * El recorrido avanzado se pasa en `uTravel` (x = abscisa enrollada al período, y = z del
 * eje en esa abscisa). La ventana [inicio, largo] tiene que dividir al período de la ruta.
 */
import * as THREE from 'three';
import { patchMaterial } from '../materials/patch';
import type { RoadPath } from './road';

export interface RoadUniforms {
  uTravel: { value: THREE.Vector2 };
}

export interface RoadItem {
  u: number;
  lateral: number;
  yaw?: number;
  scale?: number;
}

/** Geometría instanciada (sin InstancedMesh: la ubicación la calcula el shader). */
export function roadInstances(base: THREE.BufferGeometry, items: RoadItem[]): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
  const data = new Float32Array(items.length * 4);
  items.forEach((it, i) => data.set([it.u, it.lateral, it.yaw ?? 0, it.scale ?? 1], i * 4));
  g.setAttribute('aRoad', new THREE.InstancedBufferAttribute(data, 4));
  g.instanceCount = items.length;
  return g;
}

function vertexPatch(road: RoadPath, start: number, length: number, withNormal: boolean): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  const place = `{
      rfLx = mod(aRoad.x - uTravel.x - (${start.toFixed(2)}), ${length.toFixed(2)}) + (${start.toFixed(2)});
      rfWx = rfLx + uTravel.x;
      float yaw = atan(roadDZ(rfWx)) + aRoad.z;
      rfC = cos(yaw);
      rfS = sin(yaw);
    }`;
  const move = `{
      vec3 rp = transformed * aRoad.w;
      transformed = vec3(rfC * rp.x - rfS * rp.z, rp.y, rfS * rp.x + rfC * rp.z) + vec3(rfLx, 0.0, roadZ(rfWx) - uTravel.y + aRoad.y);
    }`;
  return (shader) => {
    let v = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute vec4 aRoad;\nuniform vec2 uTravel;\n${road.glsl()}\nfloat rfLx; float rfWx; float rfC; float rfS;`);
    if (withNormal) {
      v = v.replace('#include <beginnormal_vertex>', `${place}\n#include <beginnormal_vertex>\nobjectNormal = vec3(rfC * objectNormal.x - rfS * objectNormal.z, objectNormal.y, rfS * objectNormal.x + rfC * objectNormal.z);`);
      v = v.replace('#include <begin_vertex>', `#include <begin_vertex>\n${move}`);
    } else {
      v = v.replace('#include <begin_vertex>', `${place}\n#include <begin_vertex>\n${move}`);
    }
    shader.vertexShader = v;
  };
}

/** Aplica el seguimiento de la ruta a un material (y devuelve el material de sombra equivalente). */
export function roadFollow<T extends THREE.Material>(mat: T, road: RoadPath, u: RoadUniforms, window: [number, number], key: string): { material: T; depth: THREE.MeshDepthMaterial } {
  const [start, length] = window;
  const patch = vertexPatch(road, start, length, true);
  patchMaterial(mat, `road-${key}-${start}-${length}`, (shader) => {
    Object.assign(shader.uniforms, u);
    patch(shader);
  });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const dpatch = vertexPatch(road, start, length, false);
  patchMaterial(depth, `road-depth-${key}-${start}-${length}`, (shader) => {
    Object.assign(shader.uniforms, u);
    dpatch(shader);
  });
  return { material: mat, depth };
}
