# NOTAS — decisiones, limitaciones y valores de demo

## Valores de DEMO que el fabricante debe confirmar

| Qué | Dónde | Comentario |
|---|---|---|
| Precios base, por surco y por opción (USD) | `src/config/pricing.json` | Valores realistas de referencia, **no** de ningún fabricante. `exportFactor` / `localFactor` = 1. |
| Pesos de modelos y opciones | `src/config/catalog.json` | Estimaciones de orden de magnitud. |
| Capacidades de tolvas (L) | `catalog.json` → `attrs` | 60/80 L por surco; 1.800/2.600 L central; 1.800/2.800 L fertilizante. |
| Fórmula de HP sugeridos | `src/config/agronomy.json` → `hp` | HP/surco por tamaño + adicionales por opción, rango ×1,00–1,25. |
| Presets de cultivo (semillas/m, peso de mil semillas, densidad) | `agronomy.json` → `crops` | Valores típicos de demo. |
| Eficiencia de campo (0,70), velocidades (4–10 km/h), horas por jornada (12) | `agronomy.json` | Editables. |
| **Límites de transporte por ruta** | `src/config/transport.json` | **Referencias de demo.** Perfil AR: general 2,60 m ancho / 4,10 m alto / 20,5 m largo del tren; "especial" 4,80 / 4,30 / 26 m. **Deben confirmarse con la normativa vigente del país de destino** (la maquinaria agrícola especial tiene requisitos particulares de balizamiento, horarios, permisos y escolta). |
| Geometría de transporte (ancho de vía del tren longitudinal, largo de lanza, levante) | `src/machines/seeder/layout.ts` → `DIM` | Las cotas se calculan desde la misma geometría que se dibuja. |
| Plazos de entrega | `catalog.json` → `leadTimeDays` | Demo. |
| Contacto (WhatsApp, email, dirección) | `src/config/brand.json` | Ficticios (`.example`). |

## Consultas (leads) y modo demo

- Cada consulta se guarda **antes** de abrir WhatsApp/email: `POST /api/lead` al mismo Worker, que la escribe en el KV `surco-configurador-leads` (clave `lead:<fecha>-<id>`, con nombre, canal y n.º de configuración en los metadatos). Se ven en Cloudflare → Storage & Databases → Workers KV → `surco-configurador-leads`.
- `brand.demo = true`: WhatsApp y email se abren **sin destinatario** (no le llega a un número inventado) y el formulario muestra un aviso de demo. En la versión de un fabricante: `demo: false` y cargar `whatsapp`/`email` de ventas en `src/config/brand.json`.
- `VITE_LEAD_WEBHOOK` reemplaza el endpoint por un CRM/webhook propio.

## Estado y encuadre

- La configuración, el idioma y las unidades viven en la URL (`?cfg=…`, con `replaceState`) y en `localStorage`: recargar o volver desde WhatsApp no pierde nada. En modo feria no se guarda.
- La cámara encuadra con `fitPoints()` (esquinas de cada pieza visible, descontando la tarjeta de precio y la barra): pasos, Ruta (tractor + máquina plegada, y reencuadre al terminar de plegar) y las vistas del Resumen/PDF (recorte exacto 2:1).
- Precio "desde" = todas las opciones estándar y el mínimo de surcos; la tarjeta indica "Configuración recomendada / básica".

## Decisiones

- **Idioma**: español (Argentina) por defecto, como pide el documento. El idioma se elige con el selector o con `?lang=` (el link compartido lo conserva). La detección automática por navegador quedó implementada (`browserLang()` en `src/state/bootstrap.ts`) pero apagada.
- **Reglas**: la última elección del usuario gana. Las reglas que dependen solo del modelo o del ancho (por ejemplo, longitudinal obligatorio a más de 10,5 m o presión neumática solo en Grande y Gran ancho) **deshabilitan** la opción con un tooltip que explica por qué. Las reglas entre opciones (tolva central ↔ dosificación, corte surco a surco ↔ dosificación eléctrica y monitor avanzado) **ajustan solas** la otra elección y muestran un aviso con lo que cambió. En la tarjeta de la opción se anticipa qué se va a ajustar. Un test aleatorio de 500 cambios verifica que el estado nunca queda inválido.
- **Plegado**: alas hacia arriba (sección central de aproximadamente 3,1 m). **Transporte longitudinal**: levante, bajada del tren de ruedas en el extremo, rebatimiento de la lanza de trabajo, extensión de la lanza telescópica y giro de 90°. Ambas secuencias son interrumpibles y reversibles (unos 7 s).
- **Simulación de siembra**: la máquina queda quieta y el mundo se desplaza (terreno, rastrojo y surcos se reciclan en loop). Cada 40–50 m aparece una cabecera ya sembrada en diagonal; con corte surco a surco cada surco se apaga al cruzarla (barra de surcos, % y semillas ahorradas en vivo); sin corte se marca la superposición en el surco.
- **Rastrojo**: textura de suelo CC0 más una capa de paja **procedural** (la textura de techo de paja probada primero tenía bandas que no se parecían a un rastrojo) e instancias de tallos y paja cerca de la cámara.
- **SSAO (N8AO)**: activo en estudio y ruta; desactivado en campo porque producía bandas en el suelo con cámara rasante, y además ahorra GPU en la escena más cargada.
- **Tractor**: genérico, gris claro con detalles grafito, sin marca ni formas que imiten un modelo real. Se oculta desde el menú del visor.
- **Captura y renders del PDF**: se toman del propio visor (estudio o escena actual) con cámara y pose controladas.
- **Logo subido**: se aplica como calcomanía y en el PDF, pero no viaja en el link compartido (sería un data URL enorme). Se avisa en la UI.

## Limitaciones conocidas

- **KTX2**: el binario `toktx` (KTX-Software) no se pudo ejecutar en este entorno (bloqueado por política), así que las texturas CC0 se entregan en **WebP 1K/512** (unos 2,1 MB en total, solo las del campo y la ruta se cargan al entrar a esas escenas). Para pasarlas a KTX2: `toktx --t2 --encode uastc --genmipmap` sobre los originales de ambientCG y cambiar `TextureLoader` por `KTX2Loader` en `src/three/ground.ts`, `RoadScene.tsx` y `materials.ts`.
- **Medición de fps**: este entorno no tiene GPU (WebGL por software, SwiftShader), así que los fps medidos acá (~1 fps) **no son representativos**. Los objetivos de 60 fps en notebook con GPU integrada y 30 fps en un Android de gama media hay que validarlos en hardware real. Ya están puestas las técnicas: instancias, `frameloop="demand"`, DPR adaptativo y degradación automática.
- **Primera vista < 3 s**: JS inicial de la app de 72 KB gzip (más three.js y r3f, unos 450 KB gzip, cacheables) más el HDRI de estudio (1,6 MB, con preload). Con 4G rápido debería entrar en ~3 s; hay que medirlo en un dispositivo real. Mejora posible: HDRI de estudio a 512 px o en formato `.ktx2`/`.exr` comprimido.
- **Corte surco a surco**: la simulación apaga cada surco por separado (no por secciones).
- **Normativa de transporte**: el semáforo es orientativo; no reemplaza la verificación legal.

## Ideas para la v2

- Familias nuevas: **pulverizadora de arrastre** (botalón plegable, corte por sección, tanque) y **tolva autodescargable** (sinfín, descarga en camión). La arquitectura ya lo soporta (`src/machines/registry.ts` + `_template/`).
- **Realidad aumentada** (WebXR / Quick Look con export glTF desde el mismo generador) para ver la máquina en el galpón del productor.
- Conexión con la **orden de fábrica / lista de materiales** (cada opción → códigos de pieza).
- Integración con **CRM** y red de **concesionarios** (`submitLead()` + webhook, asignación por país o región).
- Panel de administración visual para editar los JSON, con versionado.
- Financiación y cuotas por país; tipo de cambio en vivo para la versión local.
- Video o GIF automático de la máquina sembrando para compartir por WhatsApp.
