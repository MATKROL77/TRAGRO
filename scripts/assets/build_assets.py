#!/usr/bin/env python3
"""Pipeline reproducible de assets CC0 del configurador.

Paso 1 (este script): descarga los originales (Poly Haven / ambientCG, ambos CC0),
procesa los HDRI y deja las texturas listas como RGBA crudo para el encoder KTX2.
Paso 2: `node encode_ktx2.mjs <work>` convierte los RGBA a .ktx2 con mipmaps.

Uso:
  python3 scripts/assets/build_assets.py <dir_de_trabajo>
  node    scripts/assets/encode_ktx2.mjs  <dir_de_trabajo>

Requiere: Python 3 con numpy y Pillow. No hace falta correrlo en CI: los resultados
ya están versionados en public/assets/.
"""
import io
import json
import os
import sys
import urllib.request
import zipfile

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hdr_tools as H  # noqa: E402

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_HDRI = os.path.join(ROOT, 'public', 'assets', 'hdri')
UA = {'User-Agent': 'asset-pipeline/1.0'}

# ---------------------------------------------------------------------------
# Fuentes (todas CC0 1.0)
# ---------------------------------------------------------------------------
PH_HDR = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{id}_1k.hdr'
PH_JPG = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/{id}.jpg'
ACG_ZIP = 'https://ambientcg.com/get?file={id}_1K-JPG.zip'

STUDIO_ID = 'studio_small_08'
SKIES = {
    # nombre de salida -> id de Poly Haven
    'sky': 'sunflowers_puresky',               # día con cúmulos (principal)
    'sky_golden': 'table_mountain_1_puresky',  # hora dorada, sol bajo (alternativa opcional)
}
# set -> (assetId de ambientCG, mapas a exportar)
TEXTURES = {
    'asphalt': ('Asphalt031', ['Color', 'NormalGL', 'Roughness']),
    'field': ('Grass004', ['Color', 'NormalGL']),
    'gravel': ('Gravel032', ['Color', 'NormalGL']),
    'wood': ('Planks011', ['Color', 'NormalGL', 'Roughness']),
    'diamond': ('DiamondPlate001', ['NormalGL', 'Roughness']),
    'fabric': ('Fabric061', ['NormalGL', 'Roughness']),   # se reduce a 512 px (ver HALF_RES)
    'galvanized': ('SheetMetal002', ['Color']),  # normal y roughness se derivan del color (ver abajo)
}
SUFFIX = {'Color': 'color', 'NormalGL': 'normal', 'Roughness': 'rough'}
# Sets que se guardan a 512 px: tejido muy fino cuyo normal en UASTC 1K pesa >1 MB sin aportar detalle visible.
HALF_RES = {'fabric'}

# Radiancia máxima permitida en los HDRI de cielo: recorta el disco solar para que la
# iluminación directa la aporte una DirectionalLight (con sombras) y no se duplique.
SUN_CLAMP = 30.0
# Albedo aproximado del suelo (mezcla pasto/asfalto) usado para rellenar el hemisferio inferior.
GROUND_ALBEDO = np.array([0.150, 0.145, 0.105], dtype=np.float64)


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print('  descargando', url)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(path, 'wb') as f:
        f.write(r.read())
    return path


def solid_angles(h, w):
    """Ángulo sólido de cada píxel de un equirect h×w y coseno respecto del cenit."""
    theta = (np.arange(h) + 0.5) / h * np.pi          # 0 = cenit
    d_omega = (2 * np.pi / w) * (np.pi / h) * np.sin(theta)
    return np.repeat(d_omega[:, None], w, axis=1), np.cos(theta)[:, None]


def process_studio(work):
    src = fetch(PH_HDR.format(id=STUDIO_ID), os.path.join(work, 'hdr', f'{STUDIO_ID}_1k.hdr'))
    img = H.read_hdr(src)
    assert img.shape[:2] == (512, 1024)
    H.write_hdr(os.path.join(OUT_HDRI, 'studio_1k.hdr'), img)
    H.write_hdr(os.path.join(OUT_HDRI, 'studio_512.hdr'), H.resize_area(img, 512))
    print('studio: max', float(img.max()), 'mean', float(img.mean()))


def process_sky(work, name, pid):
    src = fetch(PH_HDR.format(id=pid), os.path.join(work, 'hdr', f'{pid}_1k.hdr'))
    img = H.read_hdr(src).astype(np.float64)
    h, w, _ = img.shape
    info = H.sun_info(img.astype(np.float32))
    lum_w = np.array([0.2126, 0.7152, 0.0722])
    lum = img @ lum_w
    d_omega, cos_t = solid_angles(h, w)

    # 1) recorte del sol y energía retirada (equivalente a una luz direccional)
    scale = np.minimum(1.0, SUN_CLAMP / np.maximum(lum, 1e-9))
    clamped = img * scale[..., None]
    upper = np.zeros((h, 1), dtype=bool)
    upper[: h // 2] = True
    removed = ((img - clamped) * d_omega[..., None] * upper[..., None]).sum(axis=(0, 1))   # irradiancia normal al sol
    e_sky = (clamped * (d_omega * np.clip(cos_t, 0, None))[..., None] * upper[..., None]).sum(axis=(0, 1))
    elev = np.radians(info['elev'])
    e_horiz = e_sky + removed * np.sin(elev)

    # 2) hemisferio inferior = rebote difuso del suelo (los "puresky" traen el cielo espejado)
    e_lum = float(e_horiz @ lum_w)
    e_soft = 0.5 * e_horiz + 0.5 * e_lum               # media desaturación: evita un rebote demasiado teñido
    ground = GROUND_ALBEDO * e_soft / np.pi
    out = clamped.copy()
    blend_rows = max(2, int(round(1.5 / 180.0 * h)))   # ~1,5° de transición bajo el horizonte
    hz = h // 2
    for i in range(hz, h):
        t = min(1.0, (i - hz + 1) / blend_rows)
        out[i] = out[hz - 1] * (1 - t) + ground * t
    H.write_hdr(os.path.join(OUT_HDRI, f'{name}_1k.hdr'), out)

    # 3) fondo visible 4k (tonemapped por Poly Haven); bajo el horizonte se extiende la bruma
    jpg = fetch(PH_JPG.format(id=pid), os.path.join(work, 'tm', f'{pid}.jpg'))
    bg = Image.open(jpg).convert('RGB').resize((4096, 2048), Image.LANCZOS)
    a = np.asarray(bg).astype(np.float32)
    hz4 = 1024
    band = a[hz4 - 10:hz4 - 2].mean(axis=0)                      # color justo sobre el horizonte, por columna
    k = 400                                                     # suavizado horizontal (~35°) con wrap
    pad = np.concatenate([band[-k:], band, band[:k]], axis=0)
    ker = np.hanning(2 * k + 1); ker /= ker.sum()
    band_s = np.stack([np.convolve(pad[:, c], ker, mode='same') for c in range(3)], axis=1)[k:-k]
    fade = np.clip((np.arange(2048 - hz4) + 1) / 28.0, 0, 1)[:, None, None]
    fade = fade * fade * (3 - 2 * fade)                         # smoothstep
    k2 = 24                                                     # la fila del horizonte, apenas suavizada (~2°)
    row = a[hz4 - 1]
    pad2 = np.concatenate([row[-k2:], row, row[:k2]], axis=0)
    ker2 = np.hanning(2 * k2 + 1); ker2 /= ker2.sum()
    row_s = np.stack([np.convolve(pad2[:, c], ker2, mode='same') for c in range(3)], axis=1)[k2:-k2]
    a[hz4:] = row_s[None] * (1 - fade) + band_s[None] * fade
    horizon_mean = band_s.mean(axis=0)
    Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(
        os.path.join(OUT_HDRI, f'{name}_4k.jpg'), quality=88, optimize=True, progressive=True)

    az = (info['u'] - 0.5) * 2 * np.pi
    direction = [float(np.cos(elev) * np.cos(az)), float(np.sin(elev)), float(np.cos(elev) * np.sin(az))]
    report = {
        'id': pid,
        'sun_uv': [round(info['u'], 4), round(info['v'], 4)],
        'sun_elevation_deg': round(info['elev'], 2),
        'sun_azimuth_deg_from_plusX_towards_plusZ': round(float(np.degrees(az)), 2),
        'sun_direction_three': [round(x, 4) for x in direction],
        'sun_peak_radiance_original': round(info['peak'], 1),
        'sun_clamp': SUN_CLAMP,
        'directional_light_irradiance_rgb': [round(float(x), 3) for x in removed],
        'directional_light_color_srgb_hex': to_hex(removed / removed.max()),
        'sky_horizontal_irradiance_rgb': [round(float(x), 3) for x in e_sky],
        'ground_fill_radiance_rgb': [round(float(x), 4) for x in ground],
        'horizon_color_srgb_hex': '#%02x%02x%02x' % tuple(int(round(x)) for x in horizon_mean),
    }
    print(name, json.dumps(report, indent=1))
    return report


def to_hex(lin):
    lin = np.clip(np.asarray(lin, dtype=np.float64), 0, 1)
    s = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    return '#%02x%02x%02x' % tuple(int(round(x * 255)) for x in s)


def save_raw(work, name, im):
    """RGBA crudo con cabecera 'RGBA' + ancho + alto (uint32 LE): entrada del encoder KTX2."""
    im = im.convert('RGBA')
    assert im.size in ((1024, 1024), (512, 512)), im.size
    os.makedirs(os.path.join(work, 'raw'), exist_ok=True)
    with open(os.path.join(work, 'raw', name + '.rgba'), 'wb') as f:
        f.write(b'RGBA' + np.array(im.size, dtype='<u4').tobytes() + im.tobytes())


def half_res(im, renormalize=False):
    """Reduce a la mitad promediando bloques 2×2 (no rompe el tileado); renormaliza si es un mapa de normales."""
    a = np.asarray(im).astype(np.float32)
    h, w, c = a.shape
    a = a.reshape(h // 2, 2, w // 2, 2, c).mean(axis=(1, 3))
    if renormalize:
        v = a / 127.5 - 1.0
        v /= np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
        a = (v + 1.0) * 127.5
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))


def process_textures(work):
    for name, (aid, maps) in TEXTURES.items():
        d = os.path.join(work, 'zips', aid)          # un directorio propio por zip
        z = zipfile.ZipFile(fetch(ACG_ZIP.format(id=aid), os.path.join(d, aid + '.zip')))
        for m in maps:
            data = z.read(f'{aid}_1K-JPG_{m}.jpg')
            im = Image.open(io.BytesIO(data))
            if m == 'Roughness':
                im = im.convert('L')
            im = im.convert('RGB')
            if name in HALF_RES:
                im = half_res(im, renormalize=(m == 'NormalGL'))
            save_raw(work, f'{name}_{SUFFIX[m]}', im)
            if name == 'galvanized' and m == 'Color':
                derive_galvanized(work, im.convert('RGB'))
        print('textura', name, '<-', aid, maps)


def derive_galvanized(work, color):
    """SheetMetal002 trae normal/roughness de chapa perforada: se derivan del 'spangle' del color."""
    lum = np.asarray(color.convert('L')).astype(np.float32) / 255.0
    lo, hi = np.percentile(lum, [2, 98])
    n = np.clip((lum - lo) / (hi - lo), 0, 1)
    rough = 0.30 + 0.26 * (1.0 - n)                     # cristales oscuros = algo más rugosos
    rimg = Image.fromarray((rough * 255 + 0.5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    save_raw(work, 'galvanized_rough', rimg.convert('RGB'))
    hgt = np.asarray(color.convert('L').filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255.0
    dx = (np.roll(hgt, -1, axis=1) - np.roll(hgt, 1, axis=1)) * 0.5     # con wrap: sigue tileando
    dy = (np.roll(hgt, -1, axis=0) - np.roll(hgt, 1, axis=0)) * 0.5     # y hacia abajo en la imagen
    s = 2.2
    nx, ny, nz = -dx * s, dy * s, np.ones_like(hgt)                     # convención OpenGL (verde hacia arriba)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], axis=-1) * 0.5 + 0.5
    save_raw(work, 'galvanized_normal', Image.fromarray((nrm * 255 + 0.5).astype(np.uint8)))


if __name__ == '__main__':
    work = os.path.abspath(sys.argv[1])
    os.makedirs(OUT_HDRI, exist_ok=True)
    process_studio(work)
    reports = {name: process_sky(work, name, pid) for name, pid in SKIES.items()}
    with open(os.path.join(OUT_HDRI, 'sky_info.json'), 'w') as f:
        json.dump(reports, f, indent=2)
    process_textures(work)
    print('listo. Ahora: node scripts/assets/encode_ktx2.mjs', work)
