# Plantilla para una familia de máquinas nueva

Ejemplo: pulverizadora de arrastre (`sprayer`).

1. **Catálogo**: copiá `src/config/catalog.json` a `src/config/catalog.sprayer.json`, cambiá `"family": "sprayer"`,
   los modelos (rango de "surcos" → por ejemplo, tramos de botalón), `steps` y `groups`
   (tanque, botalón, picos, corte por sección...). Precios en `pricing.json` (claves `grupo.opción`)
   y reglas en `rules.json` (mismo formato `if / then / revert`).
2. **Textos**: agregá en los 4 archivos `src/i18n/locales/*.json` las claves `models.<id>`, `groups.<id>`,
   `options.<grupo>.<opción>` y `rules.<id>`. El test `tests/i18n.test.ts` avisa si falta alguna.
3. **Generador**: copiá `TemplateModel.ts` a `src/machines/sprayer/SprayerModel.ts` e implementá:
   - `root`, `anchors` (puntos para hotspots y cámaras: `hs-*`),
   - `update()` (animaciones por frame, devuelve `true` si se movió),
   - `applyPose(t)` (0 = trabajo, 1 = transporte), `getHitch()`, `setDecal()`, `dispose()`.
   Usá los materiales compartidos de `src/three/materials.ts` y los constructores de `src/machines/seeder/parts.ts`
   (discos, ruedas, mangueras, cilindros...). Liberá todas las geometrías en `dispose()`.
4. **Registro**: en `src/machines/registry.ts` agregá `registerFamily({ id: 'sprayer', signature, create, transportDims })`.
5. **Agronomía**: si las calculadoras cambian (por ejemplo, L/ha y autonomía del tanque), agregá
   un módulo `src/domain/agronomy.sprayer.ts` y mostralo en `PerformancePanel` según `config.family`.
