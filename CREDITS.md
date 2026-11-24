# Créditos y licencias de assets

Todos los **modelos 3D** del configurador (chasis, cajas, ejes, ruedas, accesorios, tractor, entorno) se generan
en código, de forma paramétrica. No se usa ningún modelo descargado de marketplaces.

Las texturas que no figuran en la tabla (dibujo y texto de neumáticos, cintas reflectivas, patente, ruido de
pintura, calcomanías, etc.) son **procedurales**: se generan en tiempo de ejecución con canvas/shaders.

Los únicos assets externos son los de la tabla siguiente. Todos están publicados bajo
**[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/deed.es)** (dominio público): se pueden
usar comercialmente, modificar y redistribuir sin atribución. Se los acredita igual por buena práctica.

## HDRI (iluminación y fondo)

| Archivo final | Original | Autor | Origen | Licencia | Proceso |
|---|---|---|---|---|---|
| `public/assets/hdri/studio_512.hdr` | Studio Small 08 (`studio_small_08`, 1K) | Sergej Majboroda | https://polyhaven.com/a/studio_small_08 | CC0 1.0 | Reducido a 512×256 con filtro de área (liviano para la primera carga) |
| `public/assets/hdri/sky_1k.hdr` | Sunflowers (Pure Sky) (`sunflowers_puresky`, 1K) | Sergej Majboroda (original), Jarod Guest (edición de cielo) | https://polyhaven.com/a/sunflowers_puresky | CC0 1.0 | Disco solar recortado a radiancia 30 (el sol lo aporta una luz direccional) y hemisferio inferior reemplazado por rebote de suelo |
| `public/assets/hdri/sky_4k.jpg` | Sunflowers (Pure Sky), JPG tonemapped 8K | Sergej Majboroda, Jarod Guest | https://polyhaven.com/a/sunflowers_puresky | CC0 1.0 | Reducido a 4096×2048; bajo el horizonte se extiende la bruma |

`public/assets/hdri/sky_info.json` guarda los datos medidos de cada cielo (dirección y color del sol, color del
horizonte) que usa la escena exterior.

## Texturas PBR (KTX2 / Basis Universal, con mipmaps)

Fuente: [ambientCG](https://ambientcg.com) (Lennart Demes), sets 1K-JPG. Mapas de normales en convención OpenGL.

| Archivos finales (`public/assets/tex/`) | Original | Autor | Origen | Licencia | Notas |
|---|---|---|---|---|---|
| `asphalt_color.ktx2`, `asphalt_normal.ktx2`, `asphalt_rough.ktx2` | Asphalt 031 (`Asphalt031`) | ambientCG / Lennart Demes | https://ambientcg.com/a/Asphalt031 | CC0 1.0 | Asfalto de ruta |
| `field_color.ktx2`, `field_normal.ktx2` | Grass 004 (`Grass004`) | ambientCG / Lennart Demes | https://ambientcg.com/a/Grass004 | CC0 1.0 | Pasto de campo/banquina |
| `gravel_color.ktx2`, `gravel_normal.ktx2` | Gravel 032 (`Gravel032`) | ambientCG / Lennart Demes | https://ambientcg.com/a/Gravel032 | CC0 1.0 | Ripio/tierra compactada |
| `wood_color.ktx2`, `wood_normal.ktx2`, `wood_rough.ktx2` | Planks 011 (`Planks011`) | ambientCG / Lennart Demes | https://ambientcg.com/a/Planks011 | CC0 1.0 | Piso de tablones |
| `diamond_normal.ktx2`, `diamond_rough.ktx2` | Diamond Plate 001 (`DiamondPlate001`) | ambientCG / Lennart Demes | https://ambientcg.com/a/DiamondPlate001 | CC0 1.0 | Chapa antideslizante |
| `fabric_normal.ktx2`, `fabric_rough.ktx2` | Fabric 061 (`Fabric061`) | ambientCG / Lennart Demes | https://ambientcg.com/a/Fabric061 | CC0 1.0 | Tejido de lona; reducido a 512 px |
| `galvanized_color.ktx2`, `galvanized_normal.ktx2`, `galvanized_rough.ktx2` | Sheet Metal 002 (`SheetMetal002`) | ambientCG / Lennart Demes | https://ambientcg.com/a/SheetMetal002 | CC0 1.0 | Solo se usa el mapa de color (flor del galvanizado); normal y roughness se **derivan** de ese color porque los originales son de chapa perforada |

## Software de terceros incluido en `public/`

No son assets gráficos, pero se distribuyen con el build:

| Archivo | Qué es | Origen | Licencia |
|---|---|---|---|
| `public/basis/basis_transcoder.js`, `public/basis/basis_transcoder.wasm` | Transcodificador Basis Universal que usa `KTX2Loader` | Copiado de `three/examples/jsm/libs/basis/` (three.js r170) — Binomial LLC | Apache 2.0 |

## Tipografías

Se incluyen localmente vía paquetes [Fontsource](https://fontsource.org) (no se cargan desde ningún CDN):
Manrope (interfaz), Barlow Condensed y Roboto Slab (rotulado sobre la caja), todas bajo **SIL Open Font License 1.1**.

## Cómo se regeneran

El pipeline está documentado y es reproducible en `scripts/assets/` (ver `scripts/assets/README.md`).
