# render-kit

Piezas de render reutilizables para configuradores 3D hechos con React Three Fiber
(three.js + @react-three/fiber + drei + postprocessing). Nada de lo que hay acá conoce
semirremolques: lo específico de cada producto (modelos, catálogo, cámaras) queda en
la app. Este kit nació en el configurador de semirremolques; la parte de vehículos en
movimiento está en [`vehicle/`](./vehicle/README.md).

> Nota: no se encontró un `render-kit` previo del configurador de sembradoras entre los
> repositorios accesibles desde esta sesión, así que se creó desde cero con esta
> estructura. Si el de sembradoras existe, conviene unificar los dos en un paquete.

## Estructura

| Carpeta | Qué resuelve |
|---|---|
| `debug/` | Panel de rendimiento con `?debug=1` (r3f-perf, cargado con `import()` dinámico) y muestras por cuadro para el benchmark (`frameStats.ts`). |
| `scheduling/` | Trabajo en momentos ociosos (`whenIdle`, `idleQueue`) y respeto de "ahorro de datos". |
| `precompile/` | Compilación anticipada de shaders (`compileMaterials`, `compileObject`), cuadros de calentamiento (`warmScene`) y subida anticipada de texturas (`uploadTextures`). |
| `quality/` | Niveles de calidad (`tiers.ts`), nivel inicial según la GPU (`detectTier.ts`, detect-gpu con tablas servidas desde el propio sitio) y calidad adaptativa (`AdaptiveQuality.tsx`). |
| `transition/` | Fundido cruzado dentro de la GPU (`FrameCrossfade.tsx`): copia el cuadro con `copyFramebufferToTexture`, sin leer píxeles a la CPU. |
| `materials/` | `patchMaterial` (encadenar `onBeforeCompile` con clave de programa estable) y `addDirt` (suciedad por altura en espacio de mundo). |
| `post/` | `Exposure`: exposición por escena por uniform (no recrea el postprocesado). |
| `refine/` | Refinado progresivo al quedarse quieto (`ProgressiveRefine`) y acumulador GPU con jitter subpíxel, de luz y de lente (`accumulator.ts`); también lo usan las capturas. |
| `models/` | `loadProgressive` (GLB liviano primero, completo con fundido) y `findNodes` (nombres de la especificación). Pipeline: `scripts/models-build.mjs`, especificación en `docs/model-spec.md`. |
| `vehicle/` | Vehículo circulando: ruta infinita, cinemática, máquina de estados de acciones, objetos de la ruta en la GPU, teclado y joystick. Ver [`vehicle/README.md`](./vehicle/README.md). |

## Cómo usarlo en otro configurador

### 1. Medición

```tsx
// Dentro del <Canvas>
const PerfOverlay = lazy(() => import('@/render-kit/debug/PerfOverlay'));
{/[?&]debug/.test(location.search) && <Suspense fallback={null}><PerfOverlay /></Suspense>}
```

`bench/bench.cjs` (en la raíz del repo) es el benchmark con Playwright. Necesita que la
app exponga `window.__store` (estado), `window.__viewer.stats()` y, cuando el benchmark
define `window.__benchRec = true` antes de cargar, `installFrameStats(gl)` + `beginFrame()`
en un `useFrame` de prioridad muy negativa.

### 2. Cero tirones

1. **Compilar antes de mostrar.** Después del primer cuadro, en un momento ocioso:
   `compileMaterials(gl, camera, scene, todosLosMateriales)` compila las variantes normal e
   instanciada con las luces y el entorno reales, dentro de un render target (el
   postprocesado dibuja en un buffer lineal: es otra variante de shader que la pantalla).
2. **Igualar la "firma" de iluminación entre escenas.** Si todas las escenas tienen la
   misma cantidad de luces direccionales (y cuántas con sombra) y el mismo tamaño de
   entorno prefiltrado (PMREM), los materiales del producto usan el mismo shader en todas:
   cambiar de escena no compila nada.
3. **Preparar las escenas ocultas.** Descargar, armar, `uploadTextures` y `compileObject`
   con sus propias luces (una escena temporal con su `environment`, no la principal) y
   dejarlas montadas con `visible={false}`. Un `warmScene` con el estado final compila
   también las variantes de sombra, que `compileAsync` no cubre.
4. **Materiales que cambian de mapa** nacen con un mapa provisorio de 1×1: cambiarlo no
   obliga a recompilar.
5. **Parámetros del postprocesado constantes** entre escenas (si cambian, el efecto se
   recrea y compila).
6. **Geometría fuera del hilo principal.** En este proyecto la genera un Web Worker
   (`src/three/buildWorker.ts`) y el hilo principal arma solo el "esqueleto" (nodos,
   pivotes, animaciones) con geometría ficticia y le asigna los buffers recibidos. El
   patrón está en `src/three/kit/buffers.ts` + `kit/geo.ts` (`geoMode.stub`).

### 3. Calidad adaptativa

```tsx
<AdaptiveQuality tier={tier} onChange={setTier} isActive={isActive} onResolution={() => composer.setSize(w, h)} continuous={rutaEnMovimiento} />
```

- Nivel inicial: `detectTier('/detect-gpu')` (copiar `node_modules/detect-gpu/dist/benchmarks/*.json` a `public/detect-gpu/`).
- Con render a demanda mide solo ráfagas continuas; con render continuo usa el
  `PerformanceMonitor` de drei.
- Cada nivel define resolución máxima, sombras, cascadas, postprocesado, densidad de
  vegetación y tipo de refinado (`TIER_SETTINGS`).

### 4. Transiciones

Montar `<FrameCrossfade />` junto al `EffectComposer` y llamar `frameCrossfade.start(ms)`
justo antes de cambiar el modelo o la escena.

### 5. Luz y materiales

- Encadenar parches de shader con `patchMaterial(mat, 'clave', fn)`: cada parche suma su clave
  al `customProgramCacheKey`, así la precompilación sigue sirviendo.
- `addDirt(material, { top, bottom, amount })`: barro y salpicaduras en la parte baja.
- Barniz con piel de naranja: `clearcoatNormalMap` con un relieve fino (no en el normal de base).
- `Exposure` dentro del `EffectComposer`, antes del tone mapping: `ref.current.exposure = x`.

### 6. Refinado al quedarse quieto

```tsx
// Junto al EffectComposer (dibuja después de él).
<ProgressiveRefine enabled={quieto} settings={{ samples: 96, lightRadius: 0.9, aperture: 0.012 }} isBusy={isActive} focus={() => controls.target} />
// Cualquier cambio de estado de la app: refineControl.poke()
```

Las capturas refinadas usan el mismo `FrameAccumulator` + `applyJitter` (ver
`snapshotRefined` en `src/three/Viewer.tsx`), con tope de tiempo y progreso.

### 7. Niveles de calidad (qué queda en cada uno)

| | Alta | Media | Baja |
|---|---|---|---|
| Resolución máx. | 2 | 1,5 | 1 (y 0,75 mientras se mueve la cámara) |
| Sombras | 2048 | 1024 | 1024 |
| Postprocesado | N8AO + SMAA + bloom sutil + viñeta | N8AO a media resolución + SMAA | FXAA |
| Vidrio del tractor | transmisión física | transparente | transparente |
| Refinado | 96 muestras, sombras suaves, profundidad de campo (estudio) | 48 muestras, sombras suaves | 16 muestras (solo antialiasing) |
| Vegetación de la ruta | 100 % | 55 % | 25 % |
