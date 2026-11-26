# Diagnóstico de rendimiento (Fase 0)

Medido con `bench/run.mjs` (resultados en `bench/results-*.json`). En la nube no hay GPU: Chromium usa
SwiftShader (render por software), así que los fps absolutos no sirven, pero sí la atribución de
tirones: compilación de shaders, subida de texturas, creación de geometría y CPU de JavaScript.

## El cuadro de ~1000 ms al cambiar a Ruta (y al entrar a Campo)

Causas, en orden de peso (medidas con la instrumentación de WebGL del benchmark y un perfil de CPU):

1. **Compilación de shaders al primer uso.** El programa de cada material depende de las luces, la
   niebla, las sombras y el tamaño del mapa de entorno (PMREM) de la escena. Estudio usa un HDR de
   512 px y Campo/Ruta uno de 1024 px, así que *todos* los materiales de la máquina se recompilaban al
   entrar, más los del suelo, el asfalto, el tractor, el cielo y el post-procesado.
   Línea base: Campo +18 programas (1646 ms de compilación); Ruta +2 a +4 programas (232 ms).
2. **Subida de texturas a la GPU** (WebP del asfalto/banquina decodificadas en el primer `texImage2D`,
   HDR del cielo como textura flotante): 204 ms en desktop, 845 ms con CPU 4x.
3. **Generación del PMREM** del HDR del cielo (render a cubo + desenfoques) en el mismo cuadro.
4. **Textura procedural del rastrojo** (canvas 2D con miles de trazos + `getImageData`): ~250 ms de CPU,
   en el primer montaje de Campo o Ruta.
5. **Creación de geometrías y materiales en cada montaje** (texturas cargadas de nuevo, 50 geometrías
   y 50 draw calls sólo para las líneas discontinuas de la ruta, geometrías del tractor sin liberar).
6. **Cambio de compositor de post-procesado**: Campo usaba otra cadena de efectos; al salir de Campo
   se recreaba la de AO y se recompilaban sus 4 shaders.

## Al cambiar una opción

- 2 programas de shader recompilados en *cada* cambio geométrico: el material de las franjas de
  advertencia y el de la calcomanía se creaban de nuevo y se liberaban los viejos (`getProgramInfoLog`
  109 ms en el perfil).
- La calcomanía (canvas) se regeneraba en cada reconstrucción aunque no cambiara.
- Reconstrucción del modelo: 50–100 ms de CPU en un solo cuadro (cuerpo de siembra 17–28 ms, fusión
  15–27 ms, ruedas, tolvas, mangueras…), ×4 en celular.
- Durante el plegado, las mangueras puente creaban una geometría nueva por cuadro.

## Draw calls y triángulos (Estudio)

- Línea base: 152 mallas en la máquina; 316 draw calls por cuadro con 16 surcos (escena + sombras +
  post), ~1,4 M triángulos dibujados; con 35 surcos 1,5 M triángulos sólo de la máquina.
