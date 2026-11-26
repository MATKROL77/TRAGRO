# render-kit

Piezas de render para configuradores 3D con React Three Fiber, pensadas para reusarse en otros
productos (muebles, semirremolques, maquinaria). Este README crece fase por fase; hoy cubre la Fase 1
("cero tirones").

## Módulos

### `quality.ts` — calidad adaptativa

- `QUALITY_PRESETS`: tres niveles (`high` / `medium` / `low`) con presupuesto explícito: DPR máximo
  (2 / 1,5 / 1), mapa de sombras (4096 / 2048 / 1024), AO (completo / media resolución / no),
  bloom (sólo alto), AA (SMAA / SMAA / FXAA) y densidad de detalle (1 / 0,5 / 0,2).
- `quickGuess()`: nivel para el primer cuadro sin red (celular → medio).
- `detectQuality(url)`: detect-gpu con import dinámico y **benchmarks servidos por el propio sitio**
  (copiar `node_modules/detect-gpu/dist/benchmarks/*.json` a `public/detect-gpu/`). En celular el
  máximo es medio.
- `fpsBounds(mobile)`: límites para `PerformanceMonitor` (60 fps en escritorio, 30 en celular).

Uso típico (ver `src/three/Viewer.tsx`): estado `quality` en el store, `<Canvas dpr={[1, preset.dpr]}>`,
el post-procesado y las luces leen el preset, y un `<PerformanceMonitor onDecline={…lower} onIncline={…higher}>`.
Regla: el post-procesado depende sólo del nivel, nunca de la escena (cambiar de escena no recrea el
compositor ni recompila).

### `warmup.tsx` — precompilación y precarga de escenas

```tsx
<SceneWarmup
  targets={[{ id: 'field', element: <FieldScene /> }, { id: 'road', element: <RoadScene /> }]}
  extraObjects={() => [machineRoot]}       // objetos de la escena principal a compilar con las luces de cada escena
  paused={scene !== 'studio'}              // no trabajar mientras el usuario está en otra escena
  onDone={(stats) => …}
/>
```

En tiempo ocioso monta cada escena en un portal oculto, espera sus recursos (Suspense), compila con
`renderer.compileAsync` **contra un render target lineal** (igual que el EffectComposer, así la clave del
programa coincide), compila los `extraObjects` con las luces/entorno/niebla de esa escena, dibuja un
cuadro de 64×64 (sube texturas, genera el PMREM, compila sombras) y desmonta.

Requisitos para que sirva:

1. Los materiales, texturas y geometrías de las escenas deben ser **compartidos** (cacheados a nivel
   módulo, nunca liberados al desmontar). Si no, al desmontar el portal se liberan los programas.
2. Lógica con efectos dentro de las escenas: `if (useWarmup()) return;` en sus `useFrame`.
3. Objetos singleton que la escena monta con `<primitive>`: usar `useWarmupObject(obj)` y no renderizar
   el primitive cuando devuelve true (un Object3D no puede vivir en dos árboles de R3F).

### `debug/DebugTools.tsx` — `?debug=1`

r3f-perf (fps, CPU/GPU, draw calls, triángulos, geometrías, texturas, programas) y un HUD con el cuadro
máximo y los cuadros >50 ms de los últimos 5 s. Se importa dinámicamente sólo con `?debug=1`.

## Patrones aplicados en el modelo (`src/machines/seeder/SeederModel.ts`)

- **Construcción por pasos**: el modelo expone `buildSteps()` (generador). El visor lo consume con un
  presupuesto de 6 ms por cuadro y deja la máquina anterior en pantalla hasta que la nueva está lista.
- **Caché de piezas repetidas** (LRU): el cuerpo de siembra de cada combinación de opciones se arma y
  fusiona una vez; las ruedas se comparten por medida.
- **Materiales compartidos**: ningún cambio de opción crea materiales (cero compilaciones).
- **Instancias**: un único juego de InstancedMesh para todos los cuerpos (centro y alas: la
  transformación del ala va por instancia).
- **Fusión de piezas fijas** por material dentro de cada grupo móvil.
- **Sombras sólo de piezas que se ven**: bulones, cromados, mangueras, cables, luces y vidrio no
  proyectan sombra.

## Benchmark

Ver `bench/README.md`.
