# Configurador 3D de sembradoras — Surco Pampeano (demo)

Configurador 3D en tiempo real de una **sembradora de grano grueso de precisión para siembra directa**, generada 100 % en código (sin modelos descargados). Incluye reglas de compatibilidad, precio en vivo, animación de plegado o giro a transporte longitudinal, simulación de siembra sobre rastrojo con corte surco a surco, calculadoras agronómicas, validación de transporte por ruta, resumen con renders, PDF de cotización, consulta por WhatsApp o email, comparación A/B, link compartible, 4 idiomas, modo feria y modo embebido.

> **Marca y valores de demostración.** "Surco Pampeano" es una marca ficticia. Todos los precios, pesos, fórmulas y límites de transporte son de demo y se editan en JSON (ver `NOTAS.md`).

## Correr en local

```bash
npm install
```

```bash
npm run dev
```

Abrí http://localhost:5173. Parámetros útiles de URL:

| Parámetro | Efecto |
|---|---|
| `?lang=en` / `pt-BR` / `ru` / `es-AR` | idioma |
| `?u=imp` | unidades imperiales |
| `?modo=feria` | modo stand: UI grande, loop de demo tras 30 s sin uso, atajos de teclado |
| `/embed` o `?embed` | modo embebido (sin encabezado, avisa cambios al sitio padre por `postMessage`) |
| `?q=low` / `medium` / `high` | forzar calidad gráfica (por defecto se adapta sola) |
| `?cfg=…` | configuración compartida (la genera el botón "Compartir") |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (TypeScript estricto) |
| `npm run lint` | ESLint sin warnings |
| `npm test` | Vitest: precio, reglas, agronomía, unidades, transporte, URL e idiomas completos |
| `npm run build` | build estático en `dist/` + informe de peso del JS inicial (falla si la app supera 400 KB gzip) |
| `npm run e2e` | Playwright: flujo completo, capturas (escritorio y celular), fps aproximados y prueba de estrés |

## Estructura

```
src/config/        catalog.json, pricing.json, rules.json, agronomy.json, transport.json, brand.json, ral.json
src/domain/        lógica pura y testeada (reglas, precio, agronomía, transporte, unidades, URL)
src/machines/      registry.ts (familias), seeder/ (generador paramétrico), _template/ (familia nueva)
src/three/         visor: materiales, texturas procedurales, escenas (estudio, campo, ruta), cámara, captura
src/ui/            interfaz (pasos, rendimiento, barra de precio, modales, modo feria y embebido)
src/services/      PDF (jsPDF), resumen, submitLead() (WhatsApp/email/webhook)
src/i18n/          es-AR (por defecto), en, pt-BR, ru (los no activos se cargan bajo demanda)
public/            HDRI y texturas CC0, fuentes del PDF, logo, _redirects y _headers de Cloudflare
```

## Editar catálogo, precios y reglas (sin tocar código)

- **Modelos y opciones**: `src/config/catalog.json`. Cada modelo tiene rango de surcos, ancho máximo, peso base y por surco y plazo. Cada grupo de opciones tiene `type` (`single`/`toggle`), `default`, `geometric` (si reconstruye el 3D) y opciones con `weightKg`, `weightPerRowKg`, `leadTimeDays`, `standard` y `attrs` (capacidades).
- **Precios (USD)**: `src/config/pricing.json`. `models.<id>.base` y `perRow`; `options["grupo.opción"]` con `base` y `perRow`. Variantes condicionales con `@` e `ifSel` (ejemplo: capacidad grande según el tipo de tolva). `exportFactor` y `localFactor` multiplican el total según el destino.
- **Reglas**: `src/config/rules.json`. `if` (tier, model, widthGt, widthLte, rowsGt, sel) → `then` (grupo y opciones permitidas). `revert` indica qué se desactiva si el usuario elige después algo que contradice la regla (la última elección gana). Las reglas sin `sel` deshabilitan la opción con un tooltip; las demás ajustan sola la configuración y muestran un aviso.
- **Agronomía**: `src/config/agronomy.json` (velocidad, eficiencia, horas, cultivos con semillas/m, peso de mil semillas, densidad aparente, regla de HP).
- **Transporte**: `src/config/transport.json` (límites generales y especiales por perfil). **Deben confirmarse con la normativa del país de destino.**
- **Textos de opciones**: en los 4 archivos `src/i18n/locales/*.json` (`models`, `groups`, `options`, `rules`, `hotspots`). `npm test` avisa si falta alguna clave en algún idioma.

## Cambiar la marca (marca blanca)

`src/config/brand.json`: nombre, sigla (prefijo del número de configuración), tagline por idioma, colores, WhatsApp, email, teléfono, dirección, pie del PDF e idiomas habilitados. Reemplazá `public/brand/logo.svg` (y `public/favicon.svg`). Los colores de la interfaz están en las variables CSS de `src/ui/styles.css` (`--primary`, `--accent`). La paleta RAL disponible para la máquina está en `src/config/ral.json`.

## Sumar un idioma

1. Copiá `src/i18n/locales/en.json` a `src/i18n/locales/<código>.json` y traducilo.
2. Agregá el loader en `src/i18n/index.ts` (`loaders`), el código en `LANGS` (`src/domain/url.ts`), el tipo `Lang` (`src/domain/types.ts`) y el locale de formato en `src/domain/units.ts`.
3. Agregalo a `languages`, `tagline` y `pdfFooter` en `brand.json` y a los nombres de `ral.json`.
4. `npm test` verifica que no falte ninguna clave. Si el alfabeto no es latino ni cirílico, sumá una fuente con esos glifos en `public/fonts/` para el PDF.

## Sumar una familia de máquinas (pulverizadora, tolva autodescargable…)

La arquitectura ya está preparada: el motor de reglas, el precio, la UI de pasos, la URL, el resumen y el PDF están dirigidos por el catálogo. Alcanza con:

1. un **catálogo** nuevo (mismo formato, `"family": "<id>"`),
2. un **generador** que implemente `MachineFamily` / `MachineModel` (`src/machines/registry.ts`),
3. **registrarlo** con `registerFamily()`.

La guía paso a paso y una plantilla mínima están en [`src/machines/_template/`](src/machines/_template/README.md).

## Conectar las consultas a un CRM

`src/services/lead.ts` → `submitLead()` está aislada y documentada. Hoy abre WhatsApp (`wa.me`) o el cliente de email con el mensaje precargado en el idioma elegido. Si definís `VITE_LEAD_WEBHOOK` al compilar, además envía un POST JSON con el lead completo (nombre, empresa, país, región, hectáreas, teléfono, email, número y link de la configuración, precio).

## Deploy en Cloudflare Pages

- Comando de build: `npm run build`. Directorio de salida: `dist`. Node 20 o superior.
- `public/_redirects` sirve `/embed` con la misma app; `public/_headers` define la caché de assets y permite el embebido por iframe en `/embed`.
- Para un deploy manual con Wrangler:

```bash
npx wrangler pages deploy dist --project-name surco-configurador
```

Embebido en otro sitio:

```html
<iframe src="https://<tu-proyecto>.pages.dev/embed?lang=en" style="width:100%;height:720px;border:0" allow="fullscreen; clipboard-write"></iframe>
```

## Rendimiento

- Los cuerpos de siembra se instancian (`InstancedMesh`): la cantidad de draw calls no depende de la cantidad de surcos. El rastrojo y las semillas también usan instancias (las semillas con pool y tope).
- `frameloop="demand"`: en reposo no se dibuja nada. `PerformanceMonitor` baja la calidad (DPR, SSAO, tamaño de sombras, densidad de rastrojo) si los fps caen.
- Cambiar colores no reconstruye geometría. Al reconstruir se liberan geometrías e instancias (verificado con 200 cambios seguidos en `e2e/perf.spec.ts`).
- Code-splitting: escena de campo, escena de ruta, detalle del cuerpo, PDF (jsPDF), modales e idiomas no activos.
