#!/usr/bin/env node
/**
 * Compara dos resultados del benchmark y escribe una tabla Markdown.
 *   node bench/compare.mjs bench/results-A.json bench/results-B.json > bench/comparacion.md
 */
import { readFileSync } from 'node:fs';
const [fa, fb] = process.argv.slice(2);
const A = JSON.parse(readFileSync(fa, 'utf8'));
const B = JSON.parse(readFileSync(fb, 'utf8'));
const norm = (s) => s.trim().replace(/\s+/g, ' ');
const sum = (acts, f) => acts.reduce((s, a) => s + f(a), 0);
const out = [];
out.push(`# Benchmark: ${A.label} → ${B.label}`, '', `- A: ${fa} (${A.date})`, `- B: ${fb} (${B.date})`, '');
for (const ra of A.runs) {
  const rb = B.runs.find((r) => r.profile === ra.profile);
  if (!rb) continue;
  const ga = (a) => (a.gl?.compile?.ms ?? 0);
  const ta = (a) => (a.gl?.texture?.ms ?? 0);
  out.push(`## ${ra.profile}${ra.cpuThrottle > 1 ? ` (CPU ${ra.cpuThrottle}x)` : ''}`, '');
  out.push('| Métrica | Antes | Después |', '|---|---:|---:|');
  out.push(`| Primer cuadro con la máquina | ${ra.load.firstModelFrameMs} ms | ${rb.load.firstModelFrameMs} ms |`);
  out.push(`| Transferido hasta ver la máquina | ${(ra.load.transferredBytesUntilModel / 1048576).toFixed(2)} MB | ${(rb.load.transferredBytesUntilModel / 1048576).toFixed(2)} MB |`);
  out.push(`| Programas de shader compilados durante las acciones | ${sum(ra.actions, (a) => Math.max(0, a.newPrograms))} | ${sum(rb.actions, (a) => Math.max(0, a.newPrograms))} |`);
  out.push(`| Tiempo de compilación de shaders (total) | ${sum(ra.actions, ga).toFixed(0)} ms | ${sum(rb.actions, ga).toFixed(0)} ms |`);
  out.push(`| Tiempo de subida de texturas (total) | ${sum(ra.actions, ta).toFixed(0)} ms | ${sum(rb.actions, ta).toFixed(0)} ms |`);
  out.push(`| Draw calls (último cuadro) | ${ra.drawStatsLastFrame?.calls} | ${rb.drawStatsLastFrame?.calls} |`);
  out.push(`| Triángulos (último cuadro) | ${ra.drawStatsLastFrame?.triangles?.toLocaleString('es-AR')} | ${rb.drawStatsLastFrame?.triangles?.toLocaleString('es-AR')} |`);
  out.push('');
  out.push('| Acción | compile ms (A→B) | texturas ms (A→B) | programas (A→B) | tarea más larga ms (A→B) | cuadro máx ms (A→B) |', '|---|---:|---:|---:|---:|---:|');
  for (const a of ra.actions) {
    const b = rb.actions.find((x) => norm(x.action) === norm(a.action));
    if (!b) continue;
    out.push(`| ${norm(a.action)} | ${ga(a).toFixed(0)} → ${ga(b).toFixed(0)} | ${ta(a).toFixed(0)} → ${ta(b).toFixed(0)} | ${a.newPrograms} → ${b.newPrograms} | ${a.longestTaskMs} → ${b.longestTaskMs} | ${a.maxFrameMs} → ${b.maxFrameMs} |`);
  }
  out.push('');
}
console.log(out.join('\n'));
