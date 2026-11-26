# Benchmark del configurador

## Correrlo en tu PC (con GPU)

```bash
npm install
npx playwright install chromium   # sólo la primera vez
npm run bench                      # producción, ventana visible (usa la GPU), desktop + celular
```

Opciones:

| Opción | Qué hace |
|---|---|
| `--url <url>` | Otra URL (por ejemplo `http://localhost:4173` después de `npm run build && npm run preview`). Se le pueden pasar parámetros: `--url "https://…/?q=high"` fija la calidad. |
| `--profile desktop\|mobile\|both` | Perfil. `mobile` = 390×844, DPR 3, táctil y **CPU 4x más lenta** (CDP). |
| `--only steps\|scenes\|all` | Sólo los 7 pasos × 3 opciones, sólo las escenas, o todo. |
| `--channel chrome` | Usa el Chrome instalado en vez del Chromium de Playwright. |
| `--headless` | Sin ventana. **Sin GPU** (SwiftShader): sirve para comparar tirones, compilaciones y subidas, no fps. |
| `--label <texto>` | Etiqueta del archivo de resultados. |

Resultado: `bench/results-<fecha>-<etiqueta>.json`.

## Qué mide

Por cada acción (cambiar de paso, cada opción, cada escena, "Ver sembrando"):

- `fpsAvg`, `fpsP1`, `maxFrameMs`, `framesOver50ms`: cuadros de pantalla (requestAnimationFrame). Un tirón del hilo principal aparece acá aunque la escena esté quieta.
- `renderedFps`: cuadros que dibujó three.js (con `frameloop="demand"` sólo se dibuja cuando algo cambia).
- `longTasks` / `longestTaskMs`: tareas largas del hilo principal (PerformanceObserver).
- `newPrograms`: programas de shader compilados durante la acción (deberían ser 0).
- `newGeometries` / `newTextures`: recursos de GPU nuevos.
- `gl.compile|texture|buffer|draw|readback`: ms y llamadas de WebGL por categoría (se envuelven las funciones del contexto).
- `modelRebuildMs`: CPU total de la reconstrucción del modelo (repartida en varios cuadros).
- Carga: `firstModelFrameMs` (primer cuadro con la máquina), `transferredBytesUntilModel`, GPU detectada y resultado de la precarga de escenas.

## Capturas comparables

```bash
node bench/shots.mjs --url https://… --out bench/shots/<nombre> [--mobile] [--headless]
```

Estudio, Campo (después de sembrar 15 m) y Ruta plegada, sin la UI.
