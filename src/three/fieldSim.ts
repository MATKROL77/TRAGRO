import * as THREE from 'three';
import { ROW } from '../machines/seeder/rowUnit';
import { runtime } from './runtime';

/**
 * Simulación liviana de siembra (todo en "coordenadas de suelo" g = z + distancia recorrida):
 *  - surco cerrado por hilera (segmentos instanciados),
 *  - surco abierto entre discos y tapadoras,
 *  - semillas en pool reciclado,
 *  - cabecera ya sembrada en diagonal: con corte surco a surco, cada surco se apaga al entrar.
 */

const MAX_SEG = 900;
const MAX_SEEDS = 2400;
const BACK = 70; // metros visibles detrás

type Kind = 0 | 1 | 2; // 0 sembrado · 1 superposición · 2 apagado (corte)
interface Seg { g0: number; g1: number; kind: Kind }
interface Seed { x: number; g: number; born: number; rot: number }

export interface SimParams {
  rowX: number[];
  spacing: number;
  seedsPerM: number;
  sectionControl: boolean;
  seedColor: string;
  seedShape: 'kernel' | 'sphere' | 'sunflower';
}

export interface SimStats { activeRows: number; savedM2: number; overlapM2: number; inHeadland: boolean; headlandPct: number }

function furrowMaterial(uOffset: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOffset = uOffset;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal; varying vec2 vG;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vLocal = position.xz;
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        vG = (modelMatrix * wp).xz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vLocal; varying vec2 vG; uniform float uOffset;
        float fh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ax = abs(vLocal.x) * 2.0; // 0 centro · 1 borde
        float g = vG.y + uOffset;
        float n = fh(floor(vec2(vG.x * 120.0, g * 80.0)));
        float n2 = fh(floor(vec2(vG.x * 30.0, g * 14.0)));
        vec3 soil = vec3(0.2, 0.155, 0.115) * (0.82 + 0.3 * n) * (0.9 + 0.2 * n2);
        float ridge = 1.0 - smoothstep(0.0, 0.2, abs(ax - 0.6));
        soil = mix(soil, vec3(0.3, 0.24, 0.18), ridge * 0.45);
        float press = 1.0 - smoothstep(0.0, 0.18, ax); // marca de las tapadoras
        soil *= 1.0 - press * 0.25;
        diffuseColor.rgb = soil * diffuseColor.rgb;
        diffuseColor.a = (1.0 - smoothstep(0.65, 1.0, ax)) * opacity;`);
  };
  return m;
}

function headlandMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vL;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvL = position.xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vL; uniform float uW; uniform float uH;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rowsP = 0.525;
        float d = abs(fract(vL.y / rowsP) - 0.5) * 2.0;
        float line = 1.0 - smoothstep(0.0, 0.2, d - 0.75);
        float edge = smoothstep(0.0, 0.6, vL.y + ${'{H}'} * 0.5) * smoothstep(0.0, 0.6, ${'{H}'} * 0.5 - vL.y);
        vec3 c = mix(vec3(0.34, 0.27, 0.2), vec3(0.17, 0.13, 0.1), line * 0.9);
        diffuseColor.rgb = c * 1.5;
        diffuseColor.a = 0.82 * edge;`);
  };
  return m;
}

export class FieldSim {
  group = new THREE.Group();
  uOffset = { value: 0 };
  private furrows: THREE.InstancedMesh;
  private seeds: THREE.InstancedMesh;
  private headland: THREE.Mesh;
  private segs: Seg[][] = [];
  private nextSeed: number[] = [];
  private pool: Seed[] = [];
  private params!: SimParams;
  private time = 0;
  private hl = { G: 40, H: 12, tan: Math.tan(THREE.MathUtils.degToRad(22)) };
  private stats: SimStats = { activeRows: 0, savedM2: 0, overlapM2: 0, inHeadland: false, headlandPct: 0 };
  private hlSaved = 0;
  private hlArea = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private seedGeo: THREE.BufferGeometry;
  private seedMat: THREE.MeshStandardMaterial;
  private started = false;

  constructor(params: SimParams) {
    const fg = new THREE.PlaneGeometry(1, 1);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, 0, -0.5); // de z=0 hacia atrás
    this.furrows = new THREE.InstancedMesh(fg, furrowMaterial(this.uOffset), MAX_SEG);
    this.furrows.frustumCulled = false;
    this.furrows.receiveShadow = true;
    this.furrows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SEG * 3).fill(1), 3);
    this.furrows.position.y = 0.006;
    this.seedGeo = new THREE.SphereGeometry(0.0065, 8, 6);
    this.seedMat = new THREE.MeshStandardMaterial({ color: '#E9B949', roughness: 0.45 });
    this.seeds = new THREE.InstancedMesh(this.seedGeo, this.seedMat, MAX_SEEDS);
    this.seeds.frustumCulled = false;
    this.seeds.count = 0;
    const hPlane = this.hl.H * Math.cos(Math.atan(this.hl.tan));
    const hg = new THREE.PlaneGeometry(90, hPlane, 1, 1);
    const hm = headlandMaterial();
    const H = hPlane;
    const orig = hm.onBeforeCompile;
    hm.onBeforeCompile = (sh, r) => {
      orig.call(hm, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace(/\{H\}/g, H.toFixed(2));
    };
    this.headland = new THREE.Mesh(hg, hm);
    this.headland.rotation.order = 'YXZ';
    this.headland.receiveShadow = true;
    this.group.add(this.headland, this.furrows, this.seeds);
    this.setParams(params, 0);
  }

  setParams(p: SimParams, distance: number) {
    const rowsChanged = !this.params || this.params.rowX.length !== p.rowX.length || this.params.spacing !== p.spacing;
    this.params = p;
    if (rowsChanged) {
      this.segs = p.rowX.map(() => []);
      this.nextSeed = p.rowX.map(() => distance + ROW.tubeExit.z);
      this.pool = [];
      this.started = false;
    }
    this.seedMat.color.set(p.seedColor);
    const geo =
      p.seedShape === 'kernel'
        ? new THREE.SphereGeometry(0.0075, 8, 6).scale(1, 0.55, 1.2)
        : p.seedShape === 'sunflower'
          ? new THREE.SphereGeometry(0.006, 8, 6).scale(0.6, 0.5, 1.6)
          : new THREE.SphereGeometry(0.0055, 8, 6);
    this.seeds.geometry.dispose();
    this.seeds.geometry = geo;
    this.seedGeo = geo;
    this.seedMat.color.set(p.seedColor);
  }

  getStats(): SimStats {
    return this.stats;
  }

  private headlandStart(x: number) {
    return this.hl.G + x * this.hl.tan;
  }

  private inHeadland(x: number, g: number) {
    const s = this.headlandStart(x);
    return g >= s && g <= s + this.hl.H;
  }

  update(dt: number, distance: number, moving: boolean) {
    const p = this.params;
    this.time += dt;
    this.uOffset.value = distance;
    const n = p.rowX.length;
    const halfW = (p.rowX[n - 1] ?? 0) + p.spacing;
    // programar la próxima cabecera cuando la anterior quedó atrás
    const hlEnd = this.hl.G + this.hl.H + halfW * this.hl.tan;
    if (hlEnd < distance - 30 || this.hl.G > distance + 200) {
      this.hl.G = distance + 38;
      this.hlSaved = 0;
      this.hlArea = 0;
    }
    if (!this.started) {
      this.started = true;
      for (let i = 0; i < n; i++) this.nextSeed[i] = distance + ROW.tubeExit.z;
    }
    let active = 0;
    let inside = false;
    const gTube = distance + ROW.tubeExit.z;
    if (moving) {
      for (let i = 0; i < n; i++) {
        const x = p.rowX[i];
        const inH = this.inHeadland(x, gTube);
        if (inH) inside = true;
        const kind: Kind = inH ? (p.sectionControl ? 2 : 1) : 0;
        const on = kind !== 2;
        if (on) active++;
        const list = this.segs[i];
        const last = list[list.length - 1];
        if (last && last.kind === kind) last.g1 = gTube;
        else list.push({ g0: last ? last.g1 : gTube - 0.01, g1: gTube, kind });
        // contabilidad
        const dg = Math.max(0, gTube - (this.lastTube ?? gTube));
        if (inH) {
          this.hlArea += dg * p.spacing;
          if (kind === 2) {
            this.stats.savedM2 += dg * p.spacing;
            this.hlSaved += dg * p.spacing;
          } else this.stats.overlapM2 += dg * p.spacing;
        }
        // semillas
        if (on) {
          while (this.nextSeed[i] <= gTube) {
            this.spawn(x + (Math.random() - 0.5) * 0.008, this.nextSeed[i]);
            this.nextSeed[i] += (1 / Math.max(0.5, p.seedsPerM)) * (0.88 + Math.random() * 0.24);
          }
        } else this.nextSeed[i] = gTube + 0.05;
        // descartar segmentos viejos
        while (list.length && list[0].g1 < distance - BACK) list.shift();
      }
      runtimeRowState(this.segs, p.rowX.length);
    } else {
      for (let i = 0; i < n; i++) {
        const lastSeg = this.segs[i][this.segs[i].length - 1];
        if (!lastSeg || lastSeg.kind !== 2) active++;
      }
    }
    this.lastTube = gTube;
    this.stats.activeRows = active;
    this.stats.inHeadland = inside;
    this.stats.headlandPct = this.hlArea > 0 ? this.hlSaved / this.hlArea : 0;
    this.render(distance);
  }
  private lastTube: number | null = null;

  private spawn(x: number, g: number) {
    if (this.pool.length >= MAX_SEEDS) this.pool.shift();
    this.pool.push({ x, g, born: this.time, rot: Math.random() * Math.PI * 2 });
  }

  private render(distance: number) {
    const p = this.params;
    const gClose = distance + ROW.closing.z;
    // surcos: desde la tapadora hacia atrás (cerrado) + tramo abierto entre discos y tapadoras
    let k = 0;
    const w = 0.11;
    for (let i = 0; i < p.rowX.length && k < MAX_SEG - 2; i++) {
      const x = p.rowX[i];
      for (const s of this.segs[i]) {
        const g1 = Math.min(s.g1, gClose);
        if (g1 <= s.g0) continue;
        const z1 = g1 - distance;
        const z0 = Math.max(s.g0 - distance, -BACK);
        if (z1 <= z0) continue;
        this.v.set(x, 0, z1);
        this.s.set(w, 1, z1 - z0);
        this.m4.compose(this.v, this.q.identity(), this.s);
        this.furrows.setMatrixAt(k, this.m4);
        if (s.kind === 1) this.c.setRGB(2.1, 0.9, 0.6);
        else if (s.kind === 2) this.c.setRGB(1.6, 1.55, 1.45);
        else this.c.setRGB(1, 1, 1);
        this.furrows.setColorAt(k, this.c);
        k++;
      }
      // surco abierto (ranura angosta y oscura)
      const lastS = this.segs[i][this.segs[i].length - 1];
      if (lastS && lastS.g1 > gClose - 0.01) {
        this.v.set(x, 0.001, ROW.disc.z - 0.05);
        this.s.set(0.045, 1, ROW.disc.z - 0.05 - ROW.closing.z);
        this.m4.compose(this.v, this.q.identity(), this.s);
        this.furrows.setMatrixAt(k, this.m4);
        this.c.setRGB(0.35, 0.3, 0.28);
        this.furrows.setColorAt(k, this.c);
        k++;
      }
    }
    this.furrows.count = k;
    this.furrows.instanceMatrix.needsUpdate = true;
    if (this.furrows.instanceColor) this.furrows.instanceColor.needsUpdate = true;

    // semillas
    let j = 0;
    const alive: Seed[] = [];
    for (const sd of this.pool) {
      const z = sd.g - distance;
      if (z < ROW.closing.z + 0.06) continue; // cubierta por la tapadora
      alive.push(sd);
      const age = this.time - sd.born;
      const y = age < 0.08 ? 0.05 - (0.042 * age) / 0.08 : 0.008;
      this.v.set(sd.x, y, z);
      this.q.setFromEuler(new THREE.Euler(0.3, sd.rot, 0.2));
      this.s.setScalar(1.35);
      this.m4.compose(this.v, this.q, this.s);
      this.seeds.setMatrixAt(j++, this.m4);
      if (j >= MAX_SEEDS) break;
    }
    this.pool = alive;
    this.seeds.count = j;
    this.seeds.instanceMatrix.needsUpdate = true;

    // cabecera
    const hl = this.hl;
    const ang = Math.atan(hl.tan);
    const zStart = hl.G - distance;
    const mid = new THREE.Vector3(0, 0.004, zStart + hl.H / 2);
    this.headland.position.copy(mid);
    this.headland.rotation.set(-Math.PI / 2, -ang, 0, 'YXZ');
    this.headland.visible = zStart < 120 && zStart + hl.H + 40 > -BACK;
  }

  dispose() {
    this.furrows.geometry.dispose();
    (this.furrows.material as THREE.Material).dispose();
    this.seeds.geometry.dispose();
    this.seedMat.dispose();
    this.headland.geometry.dispose();
    (this.headland.material as THREE.Material).dispose();
    this.furrows.dispose();
    this.seeds.dispose();
  }
}

/** Publica qué surcos están encendidos (para el panel en vivo). */
function runtimeRowState(segs: Seg[][], n: number) {
  for (let i = 0; i < n && i < runtime.rowOn.length; i++) {
    const l = segs[i][segs[i].length - 1];
    runtime.rowOn[i] = l && l.kind === 2 ? 0 : 1;
  }
}
