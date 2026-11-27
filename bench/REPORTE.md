# Reporte de render y rendimiento (Fases 0–6)

Mediciones con `bench/run.mjs` sobre producción. Todas son en este entorno de nube **sin GPU**: Chromium usa
SwiftShader, que dibuja por software a 1–3 fps.

- **Lo que sirve:** las métricas de tirones de compilación, subida de texturas, creación de geometría, CPU de JavaScript,
  peso de carga, draw calls y triángulos.
- **Lo que no:** los fps y el "cuadro máximo" absolutos, porque cada cuadro tarda 350–700 ms sólo en rasterizar.

**Para validar 60 fps en GTX 1650 / RTX 2060 y 30 fps en un celular de gama media hay que correr el benchmark en una PC con
GPU:**

```bash
npm run bench
```

Comparación completa acción por acción: `bench/comparacion-final.md`. Fase 1: `bench/comparacion-fase1.md`.

## Antes → después (desktop / celular con CPU 4x)

| | Antes | Después |
|---|---:|---:|
| Programas de shader compilados mientras se usa la página | 23 / 4 | 1 / 1 |
| Tiempo compilando shaders durante las acciones | 2,6 s / 0,8 s | 8 ms / 17 ms |
| Tiempo subiendo texturas durante las acciones | 368 ms / 1,1 s | 18 ms / 84 ms |
| Entrar a Campo: compilación | 1646 ms | 0 |
| Entrar a Ruta: texturas (celular) | 845 ms | 0 |
| Tarea más larga al entrar a Ruta (celular) | 3,3 s | 0,34 s (es el raster por software de un cuadro) |
| Mayor tramo de CPU al cambiar una opción | 50–100 ms | ≤14 ms (construcción por pasos de 6 ms/cuadro) |
| Triángulos por cuadro (escena de cierre) | 4,8 M | 1,4 M |
| Triángulos de la máquina con 35 surcos (en movimiento) | 1,53 M | 335 k (≤400 k) |
| Draw calls en Estudio con 35 surcos | ~290 | 145 (89 + 55 de sombras) |
| Peso transferido hasta ver la máquina | 1,10 MB | 1,46 MB (objetivo ≤6 MB) |

La carga sube 0,36 MB por:
- el chunk de calidad adaptativa;
- los benchmarks de GPU del fabricante;
- el transcoder de KTX2.

Campo, Ruta, el cielo HDR y sus texturas se precargan **después** del primer cuadro, en segundo plano.

## Qué quedó en cada nivel de calidad

Ver `src/render-kit/README.md` §2: tabla por nivel y por qué.

## Qué no se pudo cumplir o verificar acá

- **fps y cuadros >50 ms con GPU:** sin GPU no se pueden medir. El benchmark, el modo `?debug=1` y la calidad
  adaptativa están listos para validarlo en tu PC.
- **Path tracing (opción A de la Fase 4):** `three-gpu-pathtracer` 0.0.28 exige three ≥0.187 y el proyecto usa r170.
  Se implementó la opción B (acumulación con jitter, sombras suaves y AO promediado) en todos los niveles.
- **CSM (sombras en cascada) en exteriores:** no se agregó. Con la máquina de ≤20 m y la cámara cerca, un único mapa de
  sombras ajustado a la máquina (2048–4096) da sombra definida. CSM duplicaría las pasadas de sombra sin beneficio
  visible a estas distancias.
- **Un programa de shader al volver a Estudio:** el ShaderMaterial de la cúpula o del desenfoque de las sombras de
  contacto se recompila una vez (~5 ms).
- **HDR del cielo:** queda en RGBE (`.hdr`) de 1k, comprimido en el envío (341 KB). No se pasó a gainmap/UltraHDR.
