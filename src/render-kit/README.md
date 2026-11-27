# render-kit

Piezas de render para configuradores 3D con React Three Fiber (three r170, drei 9, postprocessing 6),
pensadas para reusarse en otros productos: muebles, semirremolques, maquinaria.

| Módulo | Para qué |
|---|---|
| `quality.ts` | Calidad adaptativa: 3 niveles, detección de GPU, límites de fps |
| `warmup.tsx` | Precarga y precompilación de escenas en segundo plano (cero tirones al cambiar de escena) |
| `lighting.tsx` | Exposición por escena, sombras de contacto que no cuestan por cuadro, entorno HDR compartido, sol alineado al HDR |
| `refine.tsx` | Refinado progresivo con la cámara quieta ("render de producto") |
| `textures.ts` | Texturas KTX2 con respaldo WebP, cacheadas |
| `ProgressiveModel.tsx` | Carga de GLB del pipeline: liviano primero, completo con fundido |
| `debug/DebugTools.tsx` | `?debug=1`: r3f-perf + HUD de cuadros largos (+ `&glb=<nombre>`) |

Pipeline de modelos: `npm run models:build` (ver `docs/model-spec.md`). Benchmark: `npm run bench` (ver `bench/README.md`).

## Cómo armar un configurador nuevo con el kit

```tsx
<Canvas frameloop="demand" dpr={[1, QUALITY_PRESETS[quality].dpr]} gl={{ antialias: false, toneMapping: THREE.AgXToneMapping }}
        onCreated={({ gl }) => initTextures(gl)}>
  <AdaptiveQuality />                       {/* detectQuality + PerformanceMonitor (ver src/three/Viewer.tsx) */}
  <Suspense fallback={null}>
    <StudioScene />                         {/* SharedEnvironment + luces + ModelContactShadows + useExposure */}
    <Product />                             {/* modelo procedural o <ProgressiveModel name="…" /> */}
  </Suspense>
  <SceneWarmup targets={[{ id: 'exterior', element: <ExteriorScene /> }]} extraObjects={() => [productRoot]} paused={scene !== 'studio'} />
  <PostFX />                                {/* por nivel, nunca por escena */}
  <ProgressiveRefine enabled={scene === 'studio'} target={64} signature={() => `${productVersion}|${colors}`} />
</Canvas>
```

## 1. Entorno y luces (`lighting.tsx`)

- **`useExposure(v)`**: exposición del tone mapping AgX por escena; se restaura al desmontar.
  Valores usados: Estudio 1,0; Campo y Ruta 0,95.
- **`<SharedEnvironment files=… />`**: como `<Environment>` de drei, pero la textura y su PMREM quedan vivos
  entre visitas a la escena. Con `<Environment>`, la textura se libera al desmontar y, al volver, se recompila.
- **`<ModelContactShadows version settled size />`**: sombra de contacto bajo el producto.
  - Se re-renderiza sólo cuando `version()` cambia y el producto está quieto (`settled()`), así que no cuesta nada por cuadro.
  - Los recursos son fijos (no recrea render targets).
- **`SKY_SUN_DIR` / `sunPosition(dir)`**: luz direccional alineada con el sol del HDR del cielo.
  - La dirección se midió en la imagen (píxel más brillante) y se verificó apuntando la cámara a esa dirección.
  - Si cambiás el HDR, recalculala igual.
- **Estudio:**
  - Cúpula con degradé sin costura, del color del piso arriba a un tono más claro.
  - Luz principal con sombra.
  - Luz de relleno y luz de contorno.
  - Niebla `FogExp2` del color del piso.
- **Exteriores:**
  - HDR del cielo con fondo e iluminación del mismo archivo.
  - Sol alineado.
  - `FogExp2` del tono del horizonte.

## 2. Calidad adaptativa (`quality.ts`)

| | Alto | Medio | Bajo |
|---|---|---|---|
| DPR máximo | 2 | 1,5 | 1 |
| Mapa de sombras | 4096 | 2048 | 1024 |
| AO (N8AO) | completo | media resolución | no |
| Bloom (sólo reflejos >1,0) y viñeta | sí | no | no |
| Antialiasing | SMAA | SMAA | FXAA |
| Vidrio físico con transmisión (tractor) | sí | no | no |
| Sombras de contacto en Estudio | sí | sí | no |
| Rastrojo 3D (densidad) | 100 % | 50 % | 20 % |
| Polvo al sembrar | sí | sí | no |
| Pasto en banquinas | sí | sí | no |
| Cuerpos con detalle completo hasta | 12 m | 8 m | 5 m |
| Muestras del refinado | 64 | 32 | 16 |

**Por qué cada técnica queda donde queda**, en orden de costo de GPU:

1. AO de pantalla (una pasada extra de profundidad/normales más el filtro).
2. Mapa de sombras grande.
3. Transmisión del vidrio (otra pasada de la escena).
4. DPR.

En celular (máximo medio) se priorizan 30 fps estables.

**Cómo se elige el nivel:**
- **Primer cuadro:** `quickGuess()`, sin red (celular → medio, escritorio → alto).
- **Después:** `detectQuality(url)` con detect-gpu. Sus benchmarks se sirven desde `public/detect-gpu/` y solo se descarga el archivo del fabricante de la GPU.
- **En uso:** `PerformanceMonitor` baja o sube un nivel según `fpsBounds()`: 52–59 fps en escritorio, 27–50 en celular.
- **Forzarlo:** `?q=high|medium|low` fija el nivel y apaga el ajuste automático.

**Regla:** el post-procesado depende sólo del nivel, nunca de la escena. Cambiar de escena no recrea el
compositor ni recompila.

## 3. Cero tirones (`warmup.tsx` y patrones)

- **`<SceneWarmup>`**: con el usuario en la escena principal, en tiempo ocioso, monta cada escena en un portal
  oculto. Para cada una:
  1. Espera sus recursos.
  2. Compila con `compileAsync` contra un render target lineal (la misma clave de programa que el EffectComposer).
  3. Mueve un instante los `extraObjects` (el producto) a esa escena para compilarlos con sus luces y sombras.
  4. Dibuja un cuadro de 64×64: sube texturas, PMREM y sombras.
- **Requisitos para las escenas:**
  - Materiales, texturas y geometrías cacheados a nivel módulo.
  - `dispose={null}` en el grupo raíz.
  - `if (useWarmup()) return;` en la lógica con efectos.
  - `useWarmupObject(obj)` para los `<primitive>` compartidos.
- **Producto:**
  - Construcción por pasos (generador consumido con 6 ms por cuadro); el modelo anterior queda en pantalla hasta que el nuevo está listo.
  - Caché LRU de piezas repetidas.
  - Materiales compartidos: cambiar una opción no compila nada.
  - Una sola tanda de InstancedMesh para todas las repeticiones; la transformación de cada sección va por instancia.
- **Fusión:** las piezas fijas se fusionan por material dentro de cada grupo móvil.
- **Sombras:** sólo las proyectan las piezas que se ven a esa escala.
- **LOD por instancia:** dos juegos de instancias (completo y liviano). Cada repetición elige el suyo según la
  distancia a la cámara, y todas pasan al completo al refinar o capturar.
- **Profundidad:** superficies coplanares separadas ≥8 cm o con `polygonOffset`. El compositor usa un buffer de
  16 bits y 2 cm no alcanzan.

## 4. Refinado al quedarse quieto (`refine.tsx`)

`<ProgressiveRefine enabled target delay=800 lightJitter signature />`:

- **Cuándo arranca:** cuando la cámara y `signature()` no cambian durante `delay` ms.
- **Cómo acumula:** cada cuadro se renderiza con un desplazamiento de subpíxel (Halton 2,3) y la luz principal
  movida dentro de un disco. El resultado se promedia en un buffer de media precisión.
- **Qué se logra:** antialiasing de muchas muestras, sombras con penumbra y AO sin ruido.
- **Corte:** en el mismo cuadro en que se mueve la cámara o cambia la firma, sin parpadeo.
- **Ya convergido:** si otro componente pide un cuadro sin cambiar la escena, se vuelve a mostrar la imagen refinada.
- **Capturas** (PNG, vistas del Resumen y del PDF): ponen `refineState.force = true` y esperan la convergencia, con tope
  de 4 s y una barra de progreso.
- **Animaciones:** las que no mueven la cámara incrementan `runtime.animTick`, que está en la firma.
- **Path tracing (opción A):** no se usa. `three-gpu-pathtracer` 0.0.28 exige three ≥0.187. Si el proyecto actualiza
  three, se puede enchufar en el mismo lugar: mismo `signature` y `refineState`.

## 5. Texturas (`textures.ts`)

- **`initTextures(gl)`** una vez y **`loadTexture('textures/x', { srgb })`**. Devuelve enseguida un `THREE.Texture` y
  lo convierte en comprimido cuando llega el `.ktx2`.
- **Respaldo:** si el navegador no transcodifica, usa el `.webp`. `?ktx2=0` lo fuerza.
- **Generación:** `npm run textures:ktx2`. Hace ETC1S para color y rugosidad y UASTC para normales, con Y invertida para
  que coincida con la orientación del WebP.
- **Transcoder:** en `public/basis/`.

## 6. Pipeline de modelos

`docs/model-spec.md` tiene el contrato completo: ejes, nombres de nodos, materiales y presupuesto.

```bash
npm run models:build
```

- **Qué hace:** procesa `models/src/*.glb` con dedup, prune, weld, texturas KTX2 y meshopt, y genera además una versión liviana con `simplify`.
- **Reporte:** triángulos por nodo, con aviso si `row_unit` o `tractor` se pasan del presupuesto.
- **Uso en la app:** `<ProgressiveModel name="…">`, que muestra primero el liviano y después el completo con un fundido de 300 ms.
- **Prueba del pipeline:** `node scripts/make-sample-glb.mjs` genera un GLB de ejemplo.

## 7. Diagnóstico

- **`?debug=1`** muestra:
  - r3f-perf: fps, CPU/GPU, draw calls, triángulos, programas y memoria.
  - Un HUD con el cuadro máximo y los cuadros >50 ms de los últimos 5 s.
- **Fuera del bundle:** sin el parámetro no se descarga nada de esto.
- **`npm run bench`** registra por acción:
  - FPS promedio y percentil 1.
  - Cuadro máximo.
  - Long tasks.
  - Programas compilados.
  - Tiempo de WebGL por categoría (compilación, texturas, buffers).
  - Tiempo hasta el primer cuadro y bytes transferidos.
