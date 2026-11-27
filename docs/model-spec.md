# Especificación de modelos 3D (GLB)

Esta especificación es para los modelos que se exporten desde Blender o CAD y se reemplacen por la geometría
procedural actual. El código busca las piezas por **nombre de nodo** y los materiales por **nombre de
material**, así que estos nombres son el contrato.

Pipeline: dejar el `.glb` en `models/src/` y correr

```bash
npm run models:build
```

Genera `public/models/<nombre>.glb` (completo) y `<nombre>.low.glb` (liviano, primera carga y lejos de la
cámara), con un reporte de triángulos por nodo y avisos de lo que no cumple. Vista previa:
`?debug=1&glb=<nombre>`.

## 1. Formato y ejes

- **GLB** (glTF 2.0 binario), una escena.
- **Metros**, **Y hacia arriba**, la máquina mira hacia **+Z** (el enganche al tractor queda en +Z).
- Origen de la escena en el suelo, en el centro del ancho de labor, a la altura del eje de los cuerpos de siembra.
- **Origen de cada pieza móvil en su eje de giro**:
  - alas: bisagra;
  - ruedas y discos: centro del eje, que gira sobre **X**;
  - cilindros hidráulicos: ojo de cada extremo;
  - lanza: pivote.
- Escala aplicada (Ctrl+A en Blender) y transformaciones limpias: sin escalas negativas ni rotaciones no aplicadas en mallas estáticas.

## 2. Nombres de nodo (todos los que usa el código hoy)

### Bastidor y secciones

| Nodo | Qué es | Notas |
|---|---|---|
| `frame_center` | Tubo porta-herramientas central y todo lo que va fijo a él | Es la referencia de la máquina |
| `wing_L`, `wing_R` | Alas (plegado vertical). Origen = bisagra | Sólo con transporte "Plegado de alas" |
| `drawbar` | Lanza de trabajo. Origen = pivote (gira 90° en longitudinal) | |
| `drawbar_transport` | Lanza telescópica del transporte longitudinal | |
| `hitch` | Empty en el ojo de enganche | Ancla para el tractor |
| `jack_stand` | Pata de apoyo con manivela | |
| `end_kit_L`, `end_kit_R` | Faros, reflectivos y franjas en los extremos | Siguen al extremo del tubo |
| `fold_tower_L/R`, `fold_lug_L/R`, `fold_knuckle_L/R` | Torre, oreja y nudo de la bisagra | Plegado de alas |
| `cyl_L_a`, `cyl_L_b`, `cyl_R_a`, `cyl_R_b` | Empties de los extremos de los cilindros de plegado | El cilindro se genera entre ambos |
| `carriage` | Carro del transporte longitudinal (brazo + ruedas) | |
| `carriage_cyl_a`, `carriage_cyl_b` | Extremos del cilindro del carro | |
| `ladder`, `walkway`, `railing` | Escalera, pasarela y baranda de la tolva | |

### Cuerpo de siembra

Una sola pieza de referencia que el código instancia N veces:

| Nodo | Qué es |
|---|---|
| `row_unit` | Cuerpo de siembra completo. Origen = centro del surco, en el tubo porta-herramientas |
| `row_unit/linkage` | Paralelogramo y soporte |
| `row_unit/body` | Cuerpo central |
| `row_unit/disc_coulter` | Cuchilla (gira; origen en su eje) |
| `row_unit/coulter_spring` | Resorte de la cuchilla |
| `row_unit/coulter_turbo`, `row_unit/coulter_wavy` | Variantes de cuchilla (una visible según la opción) |
| `row_unit/fert_opener` | Abresurco de fertilizante (sólo fertilización al costado) |
| `row_unit/disc_L`, `row_unit/disc_R` | Doble disco desencontrado (giran) |
| `row_unit/gauge_wheel_L`, `row_unit/gauge_wheel_R` | Ruedas limitadoras (giran) |
| `row_unit/meter_chain`, `meter_shaft`, `meter_pneumatic`, `meter_electric` | Dosificador según opción |
| `row_unit/seed_tube` | Tubo de bajada |
| `row_unit/hopper_ind` | Mini-tolva individual (oculta con tolva central) |
| `row_unit/firmer` | Apretador de semilla (opcional) |
| `row_unit/closing_wheel_rubber`, `closing_wheel_iron`, `closing_wheel_spiked` | Ruedas tapadoras según opción (giran) |
| `row_unit/downforce_spring`, `row_unit/downforce_air` | Presión descendente según opción |

Las piezas que giran van como hijos con el origen en su eje.

### Tolvas, ruedas y mangueras

| Nodo | Qué es |
|---|---|
| `hopper_central` | Tolva central de semilla |
| `fert_tank` | Tanque de fertilizante |
| `hopper_central_decal_F`, `hopper_central_decal_S`, `fert_tank_decal_F`, `fert_tank_decal_S` | Empties donde se pegan las calcomanías: frente y costado |
| `hopper_central_out`, `fert_tank_out` | Empties de salida hacia las mangueras |
| `wheel_transport` | Rueda de transporte/apoyo (estándar). Origen = centro del eje |
| `wheel_transport_flotation` | Variante de alta flotación |
| `hoses_seed`, `hoses_fert`, `hoses_hydraulic` | Mangueras. Las puente entre secciones las genera el código |
| `monitor` | Empty de la ficha del monitor (punto técnico) |

### Tractor (archivo aparte: `tractor.glb`)

| Nodo | Qué es |
|---|---|
| `tractor` | Raíz. Origen = centro del eje trasero en el suelo; mira a +Z |
| `tractor_wheel_RL`, `tractor_wheel_RR`, `tractor_wheel_RL2`, `tractor_wheel_RR2` | Traseras y duales (giran sobre X) |
| `tractor_wheel_FL`, `tractor_wheel_FR` | Delanteras |
| `tractor_hitch` | Empty del enganche (1,08 m detrás del eje trasero) |
| `tractor_glass` | Vidrios (material `glass`) |

## 3. Presupuesto

| Qué | Máximo |
|---|---|
| Estudio completo con 35 surcos (contando instancias) | 400 k triángulos |
| `row_unit` | 8 k triángulos |
| Tractor | 120 k triángulos |
| Texturas | 2048 px (1024 en el liviano) |

El pipeline avisa si `row_unit` o `tractor` se pasan. La geometría procedural actual ya respeta esto con dos
niveles de detalle por surco:
- **Lejos (en movimiento):** ~8 k triángulos por cuerpo; 35 surcos = 335 k triángulos.
- **Cerca, o con la imagen quieta refinándose:** ~42 k triángulos por cuerpo.

## 4. Materiales (nombres fijos)

El código cambia color y parámetros por nombre:

| Material | Uso | Notas |
|---|---|---|
| `paint_main` | Color principal (bastidor, tolvas) | El configurador cambia el color: base color blanco o textura en escala de grises |
| `paint_accent` | Color de detalles (resortes, ruedas, tapas) | Idem |
| `paint_dark` | Gris grafito (cilindros, soportes) | |
| `metal_bare` | Discos, cuchillas, ejes | metalness 1, rugosidad 0,25–0,4 |
| `cast_iron` | Fundición | |
| `galvanized` | Galvanizado | |
| `chrome` | Vástagos | |
| `rubber` | Neumáticos y tacos | Rugosidad 0,8–0,9 y normal del dibujo |
| `hose` | Mangueras | Plástico negro semimate |
| `plastic` | Plásticos | |
| `glass` | Vidrios | |
| `decal` | Calcos | Textura con alfa sobre la pintura |

## 5. Calidad de modelado

- **Chanfles reales en todos los bordes visibles:** modificador Bevel de 2–3 segmentos o weighted normals. Nada de cubos con aristas vivas.
- **AO horneada en un segundo UV** (`TEXCOORD_1`, como `aoMap`/lightmap), 1024 px.
- **Normales:** mapas tangent-space OpenGL (Y+).
- **Repetición:** sin piezas duplicadas que deberían ser instancias. Usar *linked duplicates* en Blender: el pipeline (dedup) los deja como una sola malla.
- **Vértices:** sin vértices sueltos ni caras ocultas dentro de otras piezas.

## 6. Qué hace el pipeline

1. `dedup`, `prune`, `weld`.
2. Texturas a WebP redimensionadas (2048 / 1024) y después a **KTX2**: UASTC para normales, ETC1S para el resto.
3. Versión liviana con `simplify` de meshoptimizer: ~35 % de los vértices, error 0,2 %.
4. Compresión de geometría **meshopt** con cuantización.

La app los carga con `<ProgressiveModel name="…">` (render-kit): primero el liviano y después el completo, con
un fundido de 300 ms.
