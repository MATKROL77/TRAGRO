# Créditos y licencias de assets

Todo el modelo 3D (sembradora, tractor genérico, escenario) se genera en código. Los únicos assets externos son:

| Asset | Archivo(s) | Fuente | Licencia |
|---|---|---|---|
| Ground048 (tierra con restos orgánicos) | `public/textures/soil_*.webp` | ambientCG — https://ambientcg.com/view?id=Ground048 | CC0 1.0 |
| Asphalt026B (asfalto) | `public/textures/asphalt_*.webp` | ambientCG — https://ambientcg.com/view?id=Asphalt026B | CC0 1.0 |
| Gravel040 (banquina de ripio) | `public/textures/gravel_*.webp` | ambientCG — https://ambientcg.com/view?id=Gravel040 | CC0 1.0 |
| DiamondPlate001 (chapa antideslizante) | `public/textures/plate_*.webp` | ambientCG — https://ambientcg.com/view?id=DiamondPlate001 | CC0 1.0 |
| Studio Small 09 (HDRI de estudio, 1K) | `public/hdri/studio.hdr` | Poly Haven — https://polyhaven.com/a/studio_small_09 | CC0 1.0 |
| Kloofendal 48d Partly Cloudy (Pure Sky, 1K) | `public/hdri/sky.hdr` | Poly Haven — https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 |
| Noto Sans Regular/Bold (subset latino + cirílico, para el PDF) | `public/fonts/NotoSans-*.ttf` | Google Noto — https://github.com/notofonts/latin-greek-cyrillic | SIL Open Font License 1.1 |
| Inter / Manrope (tipografías de la interfaz, empaquetadas localmente) | `@fontsource-variable/inter`, `@fontsource-variable/manrope` | Fontsource | SIL Open Font License 1.1 |

Texturas propias generadas por código (sin licencia externa): rastrojo de paja, tacos de neumático (normal map), discos de acero, micro-rayas de pintura, calcomanías de marca y franjas de advertencia (`src/three/textures.ts`).

Las texturas de ambientCG se convirtieron de JPG 1K a WebP (ver `NOTAS.md` sobre KTX2).
