# Video promocional

`umbral-exp-promo.mp4`: 40 s, 1920 × 1080, 30 fps, H.264 + AAC (≈ 22 MB). En español rioplatense.

Todo es original y se generó acá, sin servicios pagos ni material de terceros:

- **Imagen:** tomas reales del configurador (el mismo 3D de la app), capturadas cuadro por cuadro, y pantallas reales de la interfaz, el PDF y el celular.
- **Composición:** `fuente/promo.html` dibuja cada cuadro en un canvas (títulos, transiciones, escenas) con las tipografías de la app (Inter y Manrope).
- **Música y efectos:** `fuente/musica.py` sintetiza la pista (120 BPM, Do mayor) y los efectos (whoosh, pops, golpes) con numpy, sincronizados con los cortes.

## Guion

| Segundos | Escena |
|---|---|
| 0–4 | "¿Vendés semirremolques? ¡Mostralos en 3D!" |
| 4–8 | Giro alrededor de la tolva · Configurador 3D |
| 8–12 | Los 4 tipos de equipo |
| 12–18 | En acción: volcado de la batea, sider abriendo, lona de la tolva |
| 18–22 | 8 colores RAL |
| 22–24 | Tu logo y tu nombre en la caja |
| 24–28 | Precio en vivo y semáforo de medidas y pesos |
| 28–30 | Escena exterior con tractor |
| 30–34 | Cotización en PDF + WhatsApp, compu y celular, 4 idiomas |
| 34–40 | Cierre con marca, link y "Probá la demo" |

## Cómo regenerarlo

Requiere Node, Playwright con Chromium, Python 3 con numpy y ffmpeg.

1. Build de captura (no se publica): agregar temporalmente en `src/three/Viewer.tsx`, junto a `window.__captura`, estas dos líneas, compilar a otra carpeta y volver el archivo atrás:
   ```ts
   (window as unknown as { __r3f: unknown }).__r3f = get;
   (window as unknown as { __rigLock: unknown }).__rigLock = rigLock;
   ```
   Servir esa carpeta en el puerto 4174 (`npx vite preview --outDir <carpeta> --port 4174`) y la app normal en el 4173.
2. Dentro de `fuente/`: `node capturar.cjs` (tomas 3D, ~25 min con render por software) y `node ui.cjs` (pantallas).
3. Copiar a `fuente/raw/ui/` la primera página del PDF de cotización como `pdf-1.png` y `screenshots/celular-tolva-estudio.png` como `celular.png`.
4. `python3 musica.py audio.wav`
5. Servir `fuente/` (`python3 -m http.server 4180`) y `node render.cjs 0 1200 1 frames`.
6. `ffmpeg -framerate 30 -i frames/%05d.jpg -i audio.wav -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart umbral-exp-promo.mp4`
