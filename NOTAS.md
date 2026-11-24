# Notas del proyecto

Decisiones tomadas, límites conocidos, valores de demo que hay que confirmar e ideas para la v2.

## 1. Valores de demo que debe confirmar el fabricante

**Nada de lo que sigue es un dato oficial ni de un fabricante real.** Son valores razonables para que la demo funcione; se editan en `src/config/`.

### Precios (`pricing.json`)

- Precios base por tipo, precio por metro de largo/alto y diferencias de cada opción: estimados en USD sin IVA, pensados para ser creíbles en el mercado argentino. **Reemplazar todos.**
- Tipo de cambio ARS/USD: valor de ejemplo con fecha; se actualiza a mano.
- Recargos por logo y texto: inventados.

### Pesos y plazos (`catalog.json`)

- Tara de estructura por tipo (`tipos[].tara`), peso por eje según suspensión, peso por rueda, ahorro de las llantas de aluminio y peso de cada accesorio: estimaciones típicas, no datos de ingeniería.
- Plazos de entrega base y extra por opción: de ejemplo.
- Volúmenes: salen de la geometría del modelo (caja, embudos y rampas interiores). Son coherentes con el 3D, no con un plano de fábrica.

### Normativa (`legal.json`) — confirmar contra el texto vigente

Referencia usada: Ley 24.449 (art. 53), Decreto 779/95 (Anexo R) y modificatorias (Decreto 32/2018). Cargué los valores que conozco; **no los verifiqué contra el Boletín Oficial**.

| Dato | Valor cargado | Observación |
|---|---|---|
| Ancho máximo | 2,60 m | |
| Alto máximo | 4,10 m | |
| Largo máximo tractor + semi | **18,60 m** | Ver discrepancia abajo |
| Largo máximo de combinación | 20,50 m | Tractor + semi + acoplado, sin bitrenes |
| Eje simple, rodado dual | 10,5 t | |
| Tándem doble, rodado dual | 18 t | |
| Tándem triple, rodado dual | 25,5 t | |
| Superanchas (single) | 8 / 16 / 24 t | **El dato menos seguro de la tabla** |
| Tope general del conjunto | 45 t | |
| Configuraciones "escalables" | 4x2 + 1+1+1: 48 t; 6x2 + 1+1+1: 55,5 t; 6x2 + trídem: 49,5 t | Confirmar cuáles aplican y con qué requisitos (potencia/peso, frenos, etc.) |

**Discrepancia con el pedido original.** El documento de requisitos indicaba 20,50 m como largo máximo de "tractor + semi". Según lo que conozco, 20,50 m es el tope de tractor + semirremolque + acoplado y el de tractor + semirremolque es 18,60 m. Están los dos en `legal.json` y el configurador valida el conjunto contra 18,60 m (`largoMaxTractorSemiM`). Si el valor correcto es otro, se cambia ahí y nada más.

Otros supuestos del cálculo:

- La carga útil es `peso bruto máximo del conjunto − tara del tractor − tara del semi`. La tara y el largo del tractor (4x2 y 6x2) son valores típicos de `legal.json`.
- No se calcula la distribución de carga por eje ni sobre el perno rey: solo el total. Un equipo puede cumplir el total y pasarse en un grupo de ejes.
- El eje elevable no cambia el tope legal (se calcula con todos los ejes apoyados).
- Densidades de carga (soja, maíz, trigo, girasol, arena, piedra): valores típicos.
- El semáforo amarillo se enciende al 98,5 % del límite (`umbralAmarillo`).

### Reglas de compatibilidad (`rules.json`)

Son reglas de demo, aunque varias salen de la geometría del modelo:

- Súper single requiere suspensión neumática (pedida como ejemplo en el documento).
- Eje elevable: solo con tres ejes y suspensión neumática.
- 1+1+1 en tolva y batea: largo mínimo 9,5 m (no entran tres ejes separados más de 2,40 m entre las patas y la cola).
- Tolva con trídem: largo mínimo 9,5 m; tercera boca desde 10 m (11 m con trídem, 11,5 m con 1+1+1), porque las bocas van entre los ejes.
- Portaauxilio doble desde 9,5 m; dos cajones en tolva 1+1+1 desde 10,5 m.
- Accionamiento eléctrico de lona requiere lona de 900 g/m².

## 2. Decisiones técnicas

- **Modelo 100 % procedural.** No hay modelos descargados. Cada pieza se genera con primitivas propias (`src/three/kit/geo.ts`) y se fusiona por material y por nodo móvil (`asm.ts`), así el equipo completo son pocas decenas de draw calls. Ruedas, grano y hebillas usan `InstancedMesh`.
- **Layout puro compartido.** `src/core/layout.ts` calcula posiciones de ejes, patas, perno rey, embudos y medidas totales. Lo usan el 3D, la ficha técnica, la validación legal y las cámaras, y está testeado sin navegador.
- **Transiciones.** Al reconstruir geometría se congela el cuadro anterior sobre el visor y se funde con el nuevo (fundido cruzado real, ~260 ms). Los colores interpolan uniformes; las animaciones funcionales avanzan hacia un objetivo, por eso son reversibles e interrumpibles.
- **Logo y texto.** Se componen en un canvas y el shader de la pintura los proyecta sobre la caja: heredan brillo, relieve de parantes y sombras (no es un plano pegado). En el sider se proyectan sobre la lona y se pliegan con ella.
- **Tone mapping.** AgX (como pide el documento) más una corrección leve de saturación y contraste: AgX solo lava mucho los colores RAL y un rojo tráfico quedaba salmón.
- **Texturas.** Las del equipo que se ven en el primer cuadro son procedurales (banda de rodamiento y texto del neumático, cinta reflectiva, desgaste, tejido), así no bloquean la carga. Las CC0 en KTX2 (asfalto, pasto, ripio, madera, chapa antideslizante, tejido, galvanizado) se cargan después o con la escena exterior. Licencias en `CREDITS.md`.
- **Iluminación de estudio.** HDRI local de Poly Haven + softboxes (`Lightformer`) para dibujar reflejos largos; sombra direccional suave + sombra de contacto.
- **Calidad adaptativa propia.** El documento pedía el `PerformanceMonitor` de drei, pero ese componente asume render continuo: con `frameloop="demand"` toma las pausas como caídas de fps y bajaría la calidad en equipos buenos. Lo reemplacé por un monitor equivalente (`AdaptiveQuality` en `Viewer.tsx`) que solo mide ráfagas continuas y baja resolución, AO, antialiasing y tamaño de sombras por niveles (alta → media → baja).
- **Sin servidor.** Link compartido comprimido en la URL (lz-string), PDF generado en el navegador (jsPDF, en un chunk aparte), consulta por `wa.me` / `mailto:`.
- **Estructura.** La lógica pura está en `src/core/` (el documento sugería `src/state/` para validaciones; la separé para poder testearla sin React).
- **Precios en dos archivos.** Las opciones se definen en `catalog.json` y sus precios en `pricing.json`, para que el área comercial toque un solo archivo.

## 3. Limitaciones conocidas

- **Rendimiento medido solo por software.** Este entorno no tiene GPU: Chromium dibuja con SwiftShader. Los fps medidos acá no dicen nada sobre una notebook con Iris Xe ni sobre un celular; ver sección 5. **Hay que medir en hardware real antes de prometer 60 / 30 fps.**
- **No probado en dispositivos físicos.** Las vistas de celular se verificaron con emulación de iPhone 13 en Chromium, no en iOS Safari ni en Android reales.
- **Fidelidad de los modelos.** Son equipos genéricos plausibles, no la réplica de ningún fabricante. Proporciones, cantidad de parantes, forma de los embudos, etc. salen de reglas paramétricas. Para una demo a un fabricante concreto conviene ajustar medidas y detalles a su línea.
- **Tolva.** Las bocas se ubican entre ejes y los embudos son pirámides truncadas; el volumen descuenta rampas interiores simplificadas.
- **Accesorios.** Se ubican solos en los huecos libres del lateral. Si no hay lugar, la regla lo impide; si alguien edita las reglas sin cuidado, el accesorio se cotiza pero puede no dibujarse.
- **Logo.** Viaja en el link solo si es chico (≈6 KB como data URL). Si no, se avisa y hay que volver a subirlo. No se guarda en ningún lado.
- **PDF.** Tipografía Helvetica incorporada (no la de la interfaz), para no sumar peso.
- **Idiomas.** El portugués fue traducido sin revisión de un hablante nativo.
- **Accesibilidad.** Contraste AA verificado por test sobre los colores de marca, navegación por teclado y labels en el panel. El visor 3D en sí no es operable con lector de pantalla (la información equivalente está en el resumen y la ficha técnica).
- **Sin persistencia.** No hay login, base de datos ni panel de administración, por diseño.

## 4. Qué se verificó y cómo

- `npm run verificar`: typecheck, ESLint sin warnings, 65 tests unitarios (precio, reglas de compatibilidad, tara y carga útil, validación legal, layout, serialización de la URL, mensaje de la consulta, CUIT, paridad es/pt, contraste AA de la marca) y build.
- `npm run e2e flujo` (Playwright, 53 verificaciones, todas pasan): elegir tipo, cambiar cada paso, regla con autoajuste y aviso, opción deshabilitada con motivo, RAL con buscador, subir logo, texto, cámaras, "Ver en acción" reversible, hotspots, acercamiento automático y regreso, resumen con 3 renders, PDF, link compartido que reconstruye exactamente la misma configuración (con logo), comparador, formulario y mensaje de WhatsApp, modo vendedor con atajos, `/embed`, fallback sin WebGL y uso en celular (objetivos táctiles ≥ 44 px, sin desborde).
- `npm run e2e capturas`: las 16 capturas de `screenshots/` (4 tipos × estudio/exterior × escritorio 1440×900 / iPhone 13 emulado), revisadas a ojo.
- `npm run e2e rendimiento`: carga, fps y la prueba de estrés de 200 cambios.
- PDF revisado página por página (3 páginas, con y sin datos de cliente).

## 5. Mediciones

Ver los resultados completos en `tests/e2e/out/`. Resumen al cierre:

**Entorno de medición:** contenedor Linux sin GPU, 4 núcleos; Chromium dibuja con SwiftShader (rasterizador por software). Sirve para comparar entre versiones y para detectar fugas, **no** para estimar fps en hardware real.

| Qué | Resultado | Objetivo del documento | Estado |
|---|---|---|---|
| JS inicial sin three.js (gzip) | 382 KB (app 307 + postprocesado 75) | ≤ 400 KB | Cumple, con poco margen |
| three.js (gzip) | 205 KB | — | — |
| Descarga total de la primera vista | ≈ 1,0 MB en 8 pedidos (JS, CSS, 1 tipografía, HDRI de 380 KB) | — | — |
| Chunks diferidos | PDF 131 KB, escena exterior 6 KB + sus texturas, modales 2–3 KB c/u | code-splitting | Cumple |
| Modelo (tolva por defecto) | 49 mallas, ≈ 43.000 triángulos + ruedas instanciadas | — | — |
| Cuadro completo | 122 draw calls (sombras + AO + escena + postprocesado) | — | — |
| Reconstrucción del modelo | promedio 63 ms, p95 125 ms (software, máquina cargada) | "que no se trabe la UI" | Sin medir en hardware real |
| Estrés: 200 cambios de opción | geometrías 73 → 76, texturas 46 → 51, memoria JS 22 → 40 MB | sin fugas | Cumple |
| Primer cuadro interactivo | 9–11 s en este contenedor (software) | < 3 s en 4G rápido | **Sin verificar** (ver abajo) |
| Fps rotando / animando | ≈ 0,5 fps en este contenedor (software) | 60 fps notebook, 30 fps celular | **Sin verificar** (ver abajo) |

Sobre lo que no pude verificar acá:

- **Fps.** Con render por software se obtienen ≈ 0,5 fps a 1440×900, un número que no dice nada de una GPU. El diseño apunta a los objetivos (pocas mallas, instancing, render a demanda, calidad adaptativa en tres niveles), pero **hay que medirlo** en una notebook con Iris Xe y en un Android de gama media: `E2E_GPU=1 npm run e2e rendimiento`.
- **Tiempo de carga.** Lo que se descarga para la primera vista es ≈ 1 MB; en 4G rápido (≈ 10 Mbps) son menos de 1 s de red. El resto es compilar shaders y armar el modelo, que depende del dispositivo. Medirlo con Lighthouse o WebPageTest sobre el deploy real.
- **La fuga que sí encontré y corregí:** la sombra de contacto de drei no libera sus render targets al desmontarse; la reemplacé por una propia que reutiliza los buffers.


## 6. Ideas para la v2

- **Realidad aumentada**: ver el semi en el patio del cliente. El modelo ya está en metros reales y se arma como un único grafo; se puede exportar a GLB/USDZ con los exportadores de three.js o montar una sesión WebXR.
- **CRM**: conectar `submitLead()` a HubSpot/Zoho/Salesforce o a un webhook, con seguimiento del origen (link, vendedor, exposición).
- **Orden de fábrica**: de la configuración a una lista de materiales (BOM) y hoja de ruta; el catálogo ya tiene ids estables por opción.
- **Panel de administración** para precios, opciones y reglas, con vista previa.
- **Distribución de carga por eje** y sobre el perno rey, con centro de gravedad de la carga.
- **Más productos**: acoplados, carretones, tanques, bitrenes, cuarto eje.
- **Financiación y leasing**: cuota estimada, permuta de usado.
- **Stock y plazos reales** por opción, con fecha de entrega estimada.
- **Analítica**: qué opciones se eligen más y dónde se abandona.
- **Modo exposición sin conexión** (PWA) y kiosco táctil.
- **Catálogo multimarca / concesionarios**: un despliegue por concesionario con su contacto y sus precios.
