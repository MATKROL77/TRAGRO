# Pipeline de assets (CC0)

Regenera todo lo que hay en `public/assets/hdri/` y `public/assets/tex/` a partir de los originales de
Poly Haven y ambientCG. **No hace falta correrlo para compilar el proyecto**: los resultados ya están en el repo.
Sirve como documentación de dónde sale cada archivo y para cambiar un asset por otro.

```bash
# 1) descarga originales, procesa los HDRI y deja las texturas como RGBA crudo en <trabajo>/raw
python3 scripts/assets/build_assets.py /tmp/assets-work
```

```bash
# 2) instala el encoder KTX2 (Basis Universal en WASM) fuera del proyecto
npm install --prefix /tmp/ktx2enc ktx2-encoder@0.6.0
```

```bash
# 3) RGBA -> KTX2 con mipmaps en public/assets/tex
KTX2_ENCODER_DIR=/tmp/ktx2enc node scripts/assets/encode_ktx2.mjs /tmp/assets-work
```

Requisitos: Python 3 con `numpy` y `Pillow`, Node 18+.

## Archivos

| Script | Qué hace |
|---|---|
| `hdr_tools.py` | Lector/escritor Radiance RGBE, reducción con filtro de área, posición del sol, tonemap para previews |
| `build_assets.py` | URLs de origen, elección de assets, procesado de HDRI (recorte del sol, relleno de suelo, fondo 4K) y preparación de texturas |
| `encode_ktx2.mjs` | Perfiles de compresión por textura y escritura de los `.ktx2` |

## Decisiones

- **Cielos**: el disco solar se recorta a radiancia 30 en el `.hdr` de iluminación. La energía retirada queda
  anotada en `public/assets/hdri/sky_info.json` (`directional_light_irradiance_rgb`) para reponerla con una
  `DirectionalLight` que además proyecta sombras. El hemisferio inferior (que en los *puresky* es el cielo
  espejado) se reemplaza por el rebote difuso del suelo, para que el chasis no quede iluminado de azul desde abajo.
- **Volteo en Y**: las texturas se voltean antes de comprimir porque `KTX2Loader` entrega `flipY = false`.
  Quedan igual que con un `TextureLoader` normal; las normales (OpenGL) van con `normalScale` positivo.
- **Formatos**: color en ETC1S sRGB; roughness en ETC1S lineal; normales en UASTC + RDO + Zstd, salvo
  suelos y madera (ruido de alta frecuencia sobre superficies rugosas) que van en ETC1S para ahorrar ~0,8 MB c/u.
- **Encoder**: se usa `ktx2-encoder` (WASM). Los comandos equivalentes con `toktx` de KTX-Software están en la
  cabecera de `encode_ktx2.mjs`.

## Verificación hecha

- Cabeceras KTX2 parseadas (identificador, niveles de mip, esquema de supercompresión, modelo y función de
  transferencia del DFD).
- Carga real de los 17 `.ktx2` con `KTX2Loader` de three r170 en Chromium headless y de los 4 `.hdr` con
  `RGBELoader` + `PMREMGenerator`.
- Orientación comparada contra los JPG originales (correlación > 0,8 al derecho, ~0 volteado).
