# Configurador 3D de semirremolques

Demo comercial de un configurador 3D en tiempo real para fabricantes de semirremolques y acoplados.
El comprador arma su equipo (tolva cerealera, batea volcadora, plataforma con barandas o furgón/sider), lo ve con los colores y el logo de su flota, sabe cuánto carga legalmente y cuánto cuesta, y pide la cotización por WhatsApp o mail con un PDF profesional.

> **Todo es de demostración.** La marca por defecto es "Umbral_exp" y sus datos de contacto son de ejemplo. Precios, pesos, plazos y valores de normativa también son de ejemplo y se editan en archivos JSON. Ver [`NOTAS.md`](./NOTAS.md).

## Qué incluye

- Visor 3D fotorrealista (three.js + React Three Fiber) con modelos **100 % generados en código** a escala real: chasis, cuello de ganso, perno rey, ejes, suspensión mecánica o neumática, ruedas duales o súper single, accesorios.
- 4 tipos de semirremolque con sus animaciones ("Ver en acción"): compuertas y lona de la tolva, vuelco de la batea, barandas de la plataforma, puertas del furgón y **lateral libre del sider** (la lona se recoge hacia atrás, los parantes se desmontan o corren y el techo corredizo se pliega). El sider tiene sus propias opciones: parantes, tablillas, techo y tensado.
- Opciones con reglas de compatibilidad, autoajuste con aviso y precio en vivo (USD / ARS).
- Colores RAL, logo de flota y texto integrados a la pintura de la caja.
- Ficha técnica con tara, carga útil y **validación legal** (semáforo verde / amarillo / rojo). Si una medida pasa el máximo legal se avisa en el mismo paso (el slider marca el tramo en rojo y dice el máximo), en la tarjeta de precio, en el resumen, en el PDF y en el mensaje de consulta.
- Cambiar de tipo conserva lo que se eligió y sea compatible (medidas, ejes, rodado, colores, logo); lo que no entra se ajusta, se lista en el aviso y se puede deshacer. Cada tarjeta de tipo muestra el precio que va a quedar al elegirla.
- Cada paso mueve la cámara a lo que se está editando. En celular, visor arriba, opciones abajo y una barra fija con el precio y "Siguiente".
- Estudio y exterior (ruta), cámaras predefinidas, puntos de interés, modo inactivo.
- Resumen, comparador A/B, link compartible, PDF de cotización, consulta por WhatsApp o mail.
- Modo vendedor (`?modo=vendedor`) y modo embebido (`/embed`).
- Español rioplatense (por defecto), inglés, portugués de Brasil y ruso, con selector en el encabezado. Sistema métrico (m · kg) o imperial (ft · lb).
- Mismo formato visual que los otros configuradores Umbral_exp (estilo ficha de producto): tarjeta de precio y datos arriba a la izquierda, barra de controles abajo (cámaras, escenario, "Ver en acción", pantalla completa), botón Comparar, pestañas Configurar / Datos técnicos y selector de idioma en el encabezado.

## Cómo correrlo

Requiere Node 20 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abrí `http://localhost:5173`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build estático en `dist/` |
| `npm run preview` | Sirve el build en `http://localhost:4173` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint sin warnings |
| `npm run test` | Tests unitarios (Vitest): precio, reglas, tara, validación legal, URL |
| `npm run e2e` | Pruebas de punta a punta con Playwright (ver abajo) |
| `npm run verificar` | typecheck + lint + test + build |

### Pruebas de punta a punta

Necesitan Playwright (`npm i -D playwright && npx playwright install chromium`) y el build servido:

```bash
npm run build && npm run preview
```

```bash
npm run e2e
```

Generan las capturas en `screenshots/` y los resultados en `tests/e2e/out/`. Se puede correr una sola suite: `npm run e2e flujo`, `npm run e2e capturas` o `npm run e2e rendimiento`.

En una máquina con GPU usá `E2E_GPU=1 npm run e2e` para que las mediciones de fps sean reales. Sin esa variable Chromium dibuja por software: sirve para verificar el flujo y las fugas de memoria, pero es lento (cada suite tarda varios minutos) y sus fps no significan nada.

Otros scripts: `node scripts/fallback.cjs` regenera las imágenes que se muestran cuando no hay WebGL (`public/fallback/`) y `scripts/assets/` documenta cómo se bajaron y convirtieron a KTX2 las texturas CC0.

## Cómo editar catálogo, precios y reglas (sin tocar código)

Todo vive en `src/config/`. Después de editar, `npm run build` y volver a publicar.

| Archivo | Qué se edita |
|---|---|
| `catalog.json` | Tipos de equipo, pasos, opciones (nombre y descripción en es/pt, peso en kg, plazo extra en días, cuál es de serie), textos de los puntos de interés |
| `pricing.json` | Precio base por tipo, precio por metro de largo y de alto, diferencia de precio de cada opción, tipo de cambio ARS/USD |
| `rules.json` | Rangos de largo y alto por tipo, reglas de compatibilidad con sus mensajes |
| `legal.json` | Límites de dimensiones y pesos, tractores de referencia, densidades de carga |
| `colores.json` | Paleta RAL (código, nombre, color en pantalla) |
| `brand.json` | Marca, colores de la interfaz, contacto, pie del PDF |

### Ejemplos

**Cambiar un precio.** En `pricing.json`, `opciones` guarda la diferencia respecto de la opción de serie. Un número, o `{ "usd": 235, "por": "rueda" }` cuando el precio depende de la cantidad de ruedas o de ejes:

```json
"llantas": { "acero": 0, "aluminio": { "usd": 235, "por": "rueda" } },
"frenos": { "abs": 0, "ebs": 2150 }
```

**Actualizar el dólar.** `pricing.json` → `tipoDeCambio.arsPorUsd`.

**Cambiar un peso (tara).** En `catalog.json`, cada opción tiene `pesoKg` y opcionalmente `por` (`"eje"` o `"rueda"`). La tara es la suma de `tipos[].tara` (estructura) más los pesos de las opciones elegidas.

**Agregar una regla.** En `rules.json`:

```json
{
  "id": "single-requiere-neumatica",
  "si": { "ruedas": "single" },
  "entonces": { "suspension": "neumatica" },
  "aviso": { "es": "Cambiamos a suspensión neumática porque las súper single la requieren.", "pt": "…" },
  "motivo": { "es": "Las súper single requieren suspensión neumática.", "pt": "…" }
}
```

- `requiere`: cuando se cumple `si`, se fuerza `entonces` (un valor, o `{ "min": 9.5 }` para medidas). El `aviso` se muestra al autoajustar; el `motivo` aparece en las opciones que quedan deshabilitadas.
- `noDisponible`: la `opcion` no se puede elegir mientras se cumpla `cuando`; si estaba elegida se reemplaza por `alternativa`.
- Las condiciones aceptan un valor, una lista de valores o una comparación numérica (`{ "lt": 9.5 }`, `lte`, `gt`, `gte`). `tipo` también se puede usar como condición.

**Agregar una opción.** Las opciones que solo cambian precio, peso o texto (por ejemplo una garantía extendida o un nuevo color de lona) se agregan en `catalog.json` + `pricing.json` y aparecen solas en la interfaz, el resumen y el PDF. Una opción con geometría propia (por ejemplo un cuarto eje) necesita además código en `src/three/`.

Los tests (`npm run test`) verifican que las reglas apunten a opciones que existen y que las configuraciones por defecto sean válidas: corrélos después de editar.

## Cómo cambiar la marca

1. Editá `src/config/brand.json`: nombre, firma ("By …"), lema, colores, WhatsApp (con código de país, sin `+`), mail, dirección, pie y validez del PDF, idioma y moneda por defecto.
2. Reemplazá `public/brand/marca.svg` (isotipo del encabezado, 64 × 40), `public/brand/logo.svg` y `public/brand/logo-claro.svg` (logo completo: pantalla sin WebGL y PDF) y `public/favicon.svg`.
3. Opcional: cambiá los colores sugeridos de cada tipo en `catalog.json` → `tipos[].colores`.

No hay nombres ni logos de fabricantes reales en el repo.

## Modos y parámetros de URL

| URL | Efecto |
|---|---|
| `/?c=…` | Abre una configuración compartida (comprimida en el link) |
| `/?modo=vendedor` | Modo presentación: interfaz más grande, ocultar precios, atajos, "Reiniciar demo" |
| `/embed` | Sin encabezado, para usar en un iframe |
| `?lang=es` / `en` / `pt` / `ru` | Idioma (inglés y ruso se descargan solo si se piden) |
| `?unidades=imperial` | Arranca en pies y libras |
| `?moneda=ARS` | Moneda inicial |
| `?tipo=batea` | Tipo inicial (`tolva`, `batea`, `plataforma`, `furgon`) |
| `?precios=0` | Arranca con los precios ocultos |

Atajos del modo vendedor: `1`–`7` cámaras, `A` o espacio "Ver en acción", `L` lona, `E` estudio/exterior, `T` tractor, `H` puntos de interés, `P` precios, `F` pantalla completa del visor, `←` `→` pasos, `R` reiniciar.

## Cómo embeberlo en la web del fabricante

```html
<iframe
  src="https://TU-DOMINIO/embed?lang=es"
  title="Configurador 3D de semirremolques"
  style="width:100%;height:min(88vh,860px);border:0;border-radius:12px"
  allow="fullscreen; clipboard-write"
  loading="lazy"
></iframe>
```

El configurador avisa a la página contenedora con `postMessage`:

```js
window.addEventListener('message', (e) => {
  if (e.data?.source !== 'configurador-semirremolques') return;
  if (e.data.type === 'cambio') console.log(e.data.numero, e.data.precioUsd, e.data.cargaUtilKg, e.data.url);
  if (e.data.type === 'consulta') console.log('Nueva consulta', e.data);
});
```

## Conectar las consultas a un CRM

Hoy la consulta abre WhatsApp (`wa.me`) o el programa de mail con todo precargado; no hay servidor ni claves.
El único punto a tocar para integrar un CRM o un webhook es `submitLead()` en `src/lead/submitLead.ts` (está documentado ahí).

## Deploy en Cloudflare

**Publicado en:** https://configurador-semirremolques.matiascolimodio.workers.dev (y `/embed` para iframe).

### Opción A — Workers + KV con token de API (la que está en uso)

```bash
npm run build
```

```bash
CLOUDFLARE_API_TOKEN=tu_token python3 deploy/publicar.py
```

`deploy/publicar.py` sube `dist/` a un namespace de KV (solo los archivos que cambiaron) y publica el Worker de `deploy/worker.js`, que los sirve con caché, compresión y la ruta `/embed`. No usa Wrangler. El token necesita permisos de edición sobre *Workers Scripts* y *Workers KV Storage*. Con `--limpiar` borra de KV los archivos de versiones anteriores.

### Opción B — Cloudflare Pages conectado al repo (deploy automático en cada push)

1. En el panel de Cloudflare: Workers & Pages → Create → Pages → Connect to Git, y elegí este repo.
2. Comando de build: `npm run build`. Directorio de salida: `dist`. (El repo trae `.nvmrc` con Node 22.)
3. Listo: `/embed` funciona con el mismo `index.html` (`public/_redirects`) y `public/_headers` configura la caché.

El build es 100 % estático: se puede servir desde cualquier hosting de archivos.

## Estructura

```
src/config/   catálogo, precios, reglas, normativa, colores y marca (JSON editables)
src/core/     lógica pura y testeada: reglas, precio, layout, tara, validación legal, URL
src/state/    estado (Zustand), valores derivados, arranque desde la URL
src/three/    generadores paramétricos, materiales, escenas, cámaras, capturas
  kit/        primitivas, ensamblador (fusiona piezas por material) y texturas procedurales
  parts/      chasis, tren rodante, ruedas, accesorios, lonas
  bodies/     tolva, batea, plataforma, furgón/sider
src/ui/       paneles, pasos, barra de precio, ficha técnica, modales
src/pdf/      PDF de cotización (se descarga aparte, bajo demanda)
src/lead/     armado y envío de la consulta
deploy/       Worker y script de publicación en Cloudflare (Workers + KV)
src/i18n/     textos en español, inglés, portugués y ruso (catalogo.*.json: catálogo en inglés y ruso)
tests/        unitarios (Vitest) y de punta a punta (Playwright)
```

## Rendimiento

- Ruedas, grano y hebillas con `InstancedMesh`; el resto se fusiona en pocas mallas por material.
- La geometría solo se reconstruye cuando cambia un parámetro geométrico; los colores cambian uniformes.
- `frameloop="demand"`: sin interacción ni animación no se dibuja nada.
- Calidad adaptativa: si caen los fps baja resolución, AO, antialiasing y sombras (ver `NOTAS.md`).
- PDF, modales y escena exterior en chunks separados.
- Al reconstruir se liberan geometrías y texturas (hay una prueba de estrés de 200 cambios).

Las mediciones y sus límites están en [`NOTAS.md`](./NOTAS.md).

## Licencias

Código del proyecto: uso del titular del repo. Assets externos (HDRI y texturas CC0, tipografías OFL, transcoder Basis): ver [`CREDITS.md`](./CREDITS.md).
