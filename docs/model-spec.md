# Especificación de modelos 3D (exportados desde Blender o CAD)

Esta especificación define cómo tienen que venir los modelos para que el configurador los
encuentre, los anime y los pinte sin tocar código. Mientras no haya modelos, el
configurador genera la geometría por código (`src/three/bodies`, `src/three/parts`) con
**los mismos nombres de nodos y materiales**: cada pieza procedural se puede reemplazar por
la exportada, de a una.

## 1. Formato y ejes

- **GLB** (glTF 2.0 binario), un archivo por tipo de equipo y uno por pieza modular.
- **Escala en metros**, **eje Y hacia arriba**, **frente del semi hacia +Z** (convención de
  Blender con "+Y up" al exportar). El cargador gira −90° en Y al importar, porque el código
  trabaja con el frente hacia +X; no hace falta exportar distinto.
- Origen del archivo del semi: **en el piso (Y = 0), centrado a lo ancho**, con el **perno
  rey sobre el eje Z** (X = 0).
- Sin cámaras, luces ni animaciones en el archivo: las animaciones las hace el código
  rotando o desplazando los nodos móviles alrededor de su origen.

## 2. Piezas móviles: origen en su eje de giro o de deslizamiento

| Nodo (glTF) | Nombre actual en el código | Origen (pivote) | Movimiento |
|---|---|---|---|
| `chassis` | `sprung` | piso, centro | sube/baja con la suspensión neumática; cabeceo y rolido en la ruta |
| `kingpin` | — (ancla `pernoRey`) | centro del perno, cara inferior del plato | fijo (referencia del tractor) |
| `landing_gear` | `legs` | piso | sube 0,30 m al enganchar el tractor |
| `axle_group` | — | centro del grupo de ejes, a la altura del eje | referencia de la cinemática (L = perno rey – grupo) |
| `axle_0` … `axle_N` | `axle{i}` | centro del eje | el eje elevable sube 0,16 m |
| `air_spring_0` … | `bellows{i}` | base del fuelle | escala en Y con la suspensión |
| `wheel` (pieza modular) | instancias `wheels:tire`, `wheels:rim` | centro de la rueda, eje en Z | gira con ω = v / r |
| `hopper_gate_0` … (tolva) | `gate{i}` | centro de la boca | se desliza en Z (compuerta) |
| `gate_rack_0` … (tolva) | `hw{i}` | eje del volante de la cremallera | gira 5 vueltas |
| `tarp_roll` (tolva) | grupo de `RollTarp` | eje del rodillo | enrolla la lona (geometría animada por código) |
| `tipper_body` (batea) | `bed` | **bisagra trasera** | gira hasta 50° |
| `tipper_cylinder_stage_0` … `_4` (batea) | `ram` + etapas | base de cada etapa, sobre el eje del cilindro | cada etapa se extiende en su eje |
| `tailgate` (batea, basculante) | `gate` | bisagra superior | cuelga vertical mientras vuelca |
| `tailgate_L`, `tailgate_R` (batea, libro) | `gateL`, `gateR` | bisagra vertical | abren ±112° |
| `side_rail_module_L0` … / `_R0` … (plataforma) | `barL{i}`, `barR{i}` | bisagra inferior del módulo | vuelcan hacia afuera |
| `side_rail_rear` (plataforma) | `barRear` | bisagra inferior | vuelca hacia atrás |
| `rear_door_L`, `rear_door_R` (furgón) | `doorL`, `doorR` | eje de la bisagra | abren 270° |
| `side_post_L0` … / `_R0` … (Sider) | `postL{i}`, `postR{i}` | sobre el riel, base del parante | se deslizan por el riel hasta el marco trasero o se desmontan |
| `side_slats_L`, `side_slats_R` (Sider) | `slatsL`, `slatsR` | base del juego de tablillas | se retiran |
| `tarp_side_L`, `tarp_side_R` (Sider) | grupos de `PleatCurtain` | extremo trasero de la lona | se recoge en acordeón |
| `sliding_roof` (Sider) | `roofSlide` | extremo trasero | se pliega hacia atrás |
| `spare_wheel_carrier`, `toolbox`, `water_tank`, `fire_extinguisher` | accesorios | apoyo en el chasis | fijos (se ubican en los huecos libres) |

Tractor: `tractor_body` (origen en el piso, perno rey del semi en X = 0), `cab_glass`,
`fifth_wheel` (centro del plato), `tractor_wheel_front` y `tractor_wheel_drive` (centro de
la rueda; las traseras son duales).

## 3. Nombres de nodos fijos

Además de los móviles de la tabla, el configurador busca estos nombres (los que falten se
siguen generando por código):

`chassis`, `kingpin`, `landing_gear`, `axle_group`, `axle`, `wheel`, `tire_dual`,
`tire_super_single`, `rim_steel`, `rim_alu`, `mudflap`, `box_body`, `box_panel_corrugated`,
`hopper_gate`, `gate_rack`, `tarp_roll`, `tarp_side_L`, `tarp_side_R`, `roof_rail`,
`side_post`, `side_slat`, `sliding_roof`, `rear_door_L`, `rear_door_R`, `tipper_body`,
`tipper_cylinder_stage_N`, `tailgate`, `side_rail_module`, `toolbox`, `spare_wheel_carrier`,
`water_tank`, `fire_extinguisher`, `catwalk`, `ladder`, `light_tail`, `light_brake`,
`light_turn_L`, `light_turn_R`, `light_marker`, `light_led_extra`, `reflective_tape`,
`logo_area_L`, `logo_area_R`; tractor: `tractor_body`, `cab_glass`, `fifth_wheel`,
`tractor_wheel_front`, `tractor_wheel_drive`.

Todos los que usa hoy el código (nodos móviles): `root`, `sprung`, `legs`, `axle0…axleN`,
`bellows0…bellowsN`, `gate0…gateN`, `hw0…hwN` (tolva), `bed`, `gate`, `gateL`, `gateR`,
`ram` (batea), `barL0…`, `barR0…`, `barRear` (plataforma), `doorL`, `doorR`, `postL0…`,
`postR0…`, `slatsL`, `slatsR`, `roofSlide` (furgón / Sider), `tractor`. Grupos animados
por geometría: `RollTarp` (tolva y cobertor de batea), `PleatCurtain` (Sider), `grain`
(partículas), pilas de descarga.

**Puntos de interés** (hotspots y cámaras): vacíos (empties) llamados `hs_<id>` con
`<id>` = `barandas`, `caja`, `cajon`, `chasis`, `compuertas`, `ejes`, `frente`, `interior`,
`lateralLibre`, `lona`, `matafuego`, `pernoRey`, `piston`, `portaauxilio`, `porton`,
`puertas`, `reflectivos`, `ruedas`, `suspension`, `tanqueAgua`, `trasera`.

`logo_area_L` / `logo_area_R`: rectángulo (plano) donde va el logo y el texto de "Tu marca"
en cada lateral; el configurador proyecta la imagen sobre la pintura o la lona dentro de ese
rectángulo (sigue los pliegues y la corrugación).

## 4. Piezas modulares (se instancian N veces según el largo y los ejes)

| Archivo | Qué es | Origen | Repetición |
|---|---|---|---|
| `mod_panel_corrugated.glb` | Panel corrugado de la caja, 1 módulo de ancho | esquina inferior trasera | a lo largo, según el largo de caja |
| `mod_tarp_bow.glb` | Arco de lona | base del arco, en el eje | cada 1,0–1,2 m |
| `mod_side_post.glb` | Parante (Sider o plataforma) | base, sobre el riel | 2 o 3 por lado |
| `mod_side_slat.glb` | Tablilla | extremo trasero | entre parantes |
| `mod_side_rail.glb` | Módulo de baranda (plataforma) | bisagra inferior | 3–5 por lado |
| `mod_wheel_dual.glb`, `mod_wheel_single.glb` | Rueda completa (neumático + llanta + maza + tuercas) | centro, eje en Z | por eje |

## 5. Presupuesto de triángulos (contando instancias)

| Qué | Máximo |
|---|---|
| Estudio completo con el equipo más complejo (Sider 3 ejes con todos los accesorios) | 400 k |
| Rueda completa | 6 k |
| Tractor | 120 k |
| Escena de Ruta visible, calidad alta | 600 k |

Hoy (procedural): Sider completo ≈ 41 k triángulos del semi + ruedas instanciadas.

## 6. Modelado

- **Chaflanes reales en todos los bordes visibles**: modificador Bevel de 2–3 segmentos (o
  "weighted normals"). Nada de cubos con aristas vivas: no agarran luz.
- Normales suaves donde corresponde (caños, guardabarros) y duras en los quiebres.
- Sin caras ocultas ni dobles; sin n-gons (triangular al exportar).

## 7. Materiales (nombres fijos)

El configurador reemplaza los materiales por los suyos según el **nombre**; así cambia el
color RAL de la caja y del chasis y el de la lona.

| Material en el archivo | Material del código | Notas |
|---|---|---|
| `paint_box` | `bodyPaint` | color RAL elegido, clearcoat, logo y texto proyectados |
| `paint_chassis` | `chassisPaint` | color RAL del chasis |
| `galvanized` | `galvanized` | |
| `rim_steel` | `rimSteel` | |
| `rim_alu` | `rimAlu` | |
| `rubber` | `rubber`, `tireDual`, `tireSingle` | el dibujo y el texto del flanco van en el mapa normal |
| `tarp` | `lona` | color de lona elegido; logo y texto proyectados (Sider) |
| `reflective` | `reflex` | |
| `light_lens` | `lensRed`, `lensAmber`, `lensWhite`, `lensTurnL`, `lensTurnR` | el color sale del nombre del nodo (`light_tail`, `light_turn_L`…) |
| `floor_phenolic` | `phenolic` | |
| `floor_checker` | `diamond` | |
| `plastic_black` | `plastic`, `blackSteel` | |
| `decal` | `plate`, `speed`, `flapPrint` | con canal alfa |

Otros que existen en el código y se pueden usar con el mismo nombre: `bodyInner`, `alu`,
`aluBrushed`, `chrome`, `castIron`, `wood`, `redPaint`, `yellowPaint`, `whitePlastic`,
`roof`, `grain`, `glass`.

## 8. Texturas y oclusión

- Oclusión ambiental **horneada en un segundo UV** (`aoMap`, UV1).
- Mapas en PNG/JPG en el archivo de origen: el build los pasa a **KTX2** (UASTC para
  normales, ETC1S para color) y los limita a 2048 px (1024 en calidad baja).

## 9. Build

```bash
npm run models:build
```

Lee `models/src/*.glb` y escribe en `public/models/`:

- `<nombre>.glb`: dedup, prune, weld, compresión de geometría (meshopt), texturas a KTX2
  (si está instalado `toktx` de KTX-Software) o WebP, máximo 2048 px.
- `<nombre>-low.glb`: versión liviana para la carga progresiva (geometría simplificada al
  25 %, texturas de 512 px). Se muestra primero y la completa entra con un fundido de 300 ms.
