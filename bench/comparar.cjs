#!/usr/bin/env node
/**
 * Compara dos resultados del benchmark (antes / después).
 * Uso: node bench/comparar.cjs bench/results-A.json bench/results-B.json [--md]
 * Con --md imprime tablas en Markdown (para los informes).
 */
const fs = require('node:fs');

const [fa, fb] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MD = process.argv.includes('--md');
if (!fa || !fb) {
  console.error('Uso: node bench/comparar.cjs antes.json despues.json [--md]');
  process.exit(1);
}
const A = JSON.parse(fs.readFileSync(fa, 'utf8'));
const B = JSON.parse(fs.readFileSync(fb, 'utf8'));

const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '–' : typeof v === 'number' ? v.toFixed(d) : String(v));
const row = (cells) => (MD ? `| ${cells.join(' | ')} |` : cells.map((c, i) => (i === 0 ? String(c).padEnd(40) : String(c).padStart(12))).join(' '));

for (const perfil of Object.keys(A.perfiles)) {
  const a = A.perfiles[perfil];
  const b = B.perfiles[perfil];
  if (!b) continue;
  console.log(MD ? `\n#### Perfil ${perfil}\n` : `\n== ${perfil} ==`);
  const head = ['Medida', 'Antes', 'Después'];
  console.log(row(head));
  if (MD) console.log(row(head.map(() => '---')));
  const sa = a.resumen;
  const sb = b.resumen;
  const prog = (p) => p.acciones.filter((r) => r.delta).reduce((s, r) => s + Math.max(0, r.delta.programas), 0);
  const recMs = (p) => p.acciones.filter((r) => r.delta).reduce((s, r) => s + Math.max(0, r.delta.reconstruccionMs), 0);
  const recN = (p) => p.acciones.filter((r) => r.delta).reduce((s, r) => s + Math.max(0, r.delta.reconstrucciones), 0);
  const ltMax = (p) => Math.max(0, ...p.acciones.filter((r) => !r.error && !r.omitida).map((r) => r.tareaLargaMaxMs || 0));
  const lines = [
    ['Primer cuadro con el modelo (ms)', a.carga.primerCuadroConModeloMs, b.carga.primerCuadroConModeloMs],
    ['Transferido hasta el primer cuadro (KB)', a.carga.transferidoKB, b.carga.transferidoKB],
    ['Precarga en segundo plano terminada (ms)', a.carga.precargaMs ?? '–', b.carga.precargaMs ?? '–'],
    ['Transferido con la precarga (Exterior y Ruta incluidas, KB)', a.carga.transferidoConPrecargaKB ?? '–', b.carga.transferidoConPrecargaKB ?? '–'],
    ['Cuadro más largo (ms)', sa.cuadroMaxMs, sb.cuadroMaxMs],
    ['Cuadros > 50 ms', sa.cuadrosMayores50, sb.cuadrosMayores50],
    ['Acciones con algún cuadro > 50 ms', `${sa.accionesConCuadrosMayores50}/${sa.acciones}`, `${sb.accionesConCuadrosMayores50}/${sb.acciones}`],
    ['Tarea larga más larga (ms)', ltMax(a), ltMax(b)],
    ['Shaders compilados durante las acciones', prog(a), prog(b)],
    ['Reconstrucciones en el hilo principal', recN(a), recN(b)],
    ['Tiempo de reconstrucción en el hilo principal (ms)', recMs(a), recMs(b)],
    ['fps órbita estudio', sa.fpsOrbitaEstudio, sb.fpsOrbitaEstudio],
    ['fps órbita exterior', sa.fpsOrbitaExterior, sb.fpsOrbitaExterior],
    ['Draw calls máx. por cuadro', sa.drawCallsMax, sb.drawCallsMax],
  ];
  for (const [k, x, y] of lines) console.log(row([k, fmt(x, typeof x === 'number' && x % 1 ? 1 : 0), fmt(y, typeof y === 'number' && y % 1 ? 1 : 0)]));

  // Por acción: las 12 peores de "antes" y cómo quedaron.
  const byLabel = new Map(b.acciones.map((r) => [r.accion, r]));
  const worst = a.acciones.filter((r) => !r.error && !r.omitida).sort((x, y) => (y.cuadroMaxMs || 0) - (x.cuadroMaxMs || 0)).slice(0, 12);
  console.log(MD ? `\nAcciones más pesadas (cuadro más largo, tarea larga, shaders compilados, reconstrucción en el hilo principal):\n` : '\n-- acciones más pesadas --');
  const h2 = ['Acción', 'Antes', 'Después'];
  console.log(row(h2));
  if (MD) console.log(row(h2.map(() => '---')));
  const cell = (r) => (r ? `${fmt(r.cuadroMaxMs)} ms · TL ${fmt(r.tareaLargaMaxMs)} · ${r.delta ? `${r.delta.programas} sh · ${fmt(r.delta.reconstruccionMs)} ms` : '–'}` : '–');
  for (const r of worst) console.log(row([r.accion, cell(r), cell(byLabel.get(r.accion))]));
}
