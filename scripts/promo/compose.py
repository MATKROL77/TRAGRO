"""Montaje del video promocional: tomas capturadas + textos animados + intro/cierre + música.

Uso: python3 scripts/promo/compose.py <carpeta_tomas> <salida.mp4>
"""
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/promo'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'promo.mp4'
FRAMES_DIR = os.path.join(SRC, '_frames')
os.makedirs(FRAMES_DIR, exist_ok=True)
W, H, FPS = 1920, 1080, 30
DUR = 38.5
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FB = os.path.join(ROOT, 'public/fonts/NotoSans-Bold.ttf')
FR = os.path.join(ROOT, 'public/fonts/NotoSans-Regular.ttf')
NAVY = (27, 39, 71)
BEIGE = (239, 233, 223)
ORANGE = (232, 121, 43)
WHITE = (255, 255, 255)

_fonts: dict = {}


def font(size, bold=True):
    k = (size, bold)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(FB if bold else FR, size)
    return _fonts[k]


def ease_out(k):
    k = max(0.0, min(1.0, k))
    return 1 - (1 - k) ** 3


def ease_back(k):
    k = max(0.0, min(1.0, k))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2


# --------------------------------------------------------------- guion
# (inicio, fin, toma, cuadro inicial de la toma, título, subtítulo)
SEGMENTS = [
    (4.0, 8.0, 'orbit', 0, 'Tu sembradora, en 3D', 'Girala. Acercate. Mirala como si estuvieras ahí.'),
    (8.0, 12.0, 'ui_rows', 0, 'Sumá surcos…', '…y el precio se actualiza solo'),
    (12.0, 16.0, 'sow_ground', 0, 'Mirala sembrando', 'Semilla por semilla, surco por surco'),
    (16.0, 19.0, 'sow_wide', 0, 'Hectáreas por hora', 'Calculadas en vivo'),
    (19.0, 24.0, 'fold', 0, 'Del campo a la ruta', 'en segundos'),
    (24.0, 27.5, 'road', 0, 'Medidas de transporte', 'validadas para circular'),
    (27.5, 31.0, 'explode', 0, 'Cada pieza, explicada', 'Cuchilla · discos · dosificador · tapadoras'),
    (31.0, 33.5, 'ui_perf', 0, 'Cotización y PDF', 'en 4 idiomas  ·  ES  EN  PT  RU'),
]
UI_SHOTS = {'ui_rows', 'ui_perf'}

_cache: dict = {}


def shot_frame(name, idx):
    d = os.path.join(SRC, name)
    files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
    idx = max(0, min(len(files) - 1, idx))
    key = (name, idx)
    if key not in _cache:
        if len(_cache) > 6:
            _cache.clear()
        _cache[key] = Image.open(os.path.join(d, files[idx])).convert('RGB')
    return _cache[key]


def cover(img, scale=1.0, cx=0.5, cy=0.5):
    """Escala la imagen para cubrir 1920x1080 con zoom extra y centro (cx, cy)."""
    s = max(W / img.width, H / img.height) * scale
    nw, nh = int(img.width * s), int(img.height * s)
    im = img.resize((nw, nh), Image.BICUBIC)
    x = int((nw - W) * cx)
    y = int((nh - H) * cy)
    return im.crop((x, y, x + W, y + H))


def rounded_box(draw, xy, r, fill):
    draw.rounded_rectangle(xy, radius=r, fill=fill)


def caption(base, t_local, title, sub, ui=False):
    """Título grande con caja azul + subtítulo, entrada animada (desliza y rebota)."""
    over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    k1 = ease_back((t_local - 0.12) / 0.38)
    k2 = ease_out((t_local - 0.42) / 0.35)
    x0 = 90
    y0 = H - 300 if not ui else H - 340
    if k1 > 0:
        f = font(84)
        tw = d.textlength(title, font=f)
        dy = int((1 - k1) * 60)
        a = int(255 * min(1, k1))
        rounded_box(d, (x0 - 30, y0 - 18 + dy, x0 + tw + 34, y0 + 106 + dy), 22, NAVY + (int(a * 0.94),))
        d.rectangle((x0 - 30, y0 - 18 + dy, x0 - 22, y0 + 106 + dy), fill=ORANGE + (a,))
        d.text((x0, y0 + dy), title, font=f, fill=WHITE + (a,))
    if k2 > 0 and sub:
        f2 = font(40, bold=False)
        tw2 = d.textlength(sub, font=f2)
        dx = int((1 - k2) * -40)
        a2 = int(255 * k2)
        rounded_box(d, (x0 - 30 + dx, y0 + 122, x0 + tw2 + 30 + dx, y0 + 186), 16, (250, 248, 244, int(a2 * 0.95)))
        d.text((x0 + dx, y0 + 128), sub, font=f2, fill=NAVY + (a2,))
    base.alpha_composite(over)


def logo(size):
    """Logo: círculo azul marino con tres surcos blancos."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, size - 1, size - 1), fill=NAVY + (255,))
    lw = max(3, int(size * 0.07))
    for i, alpha in ((-1, 255), (0, 255), (1, 215)):
        pts = []
        for s in range(21):
            u = s / 20
            x = size * (0.22 + 0.56 * u)
            y = size * (0.55 + i * 0.14) - math.sin(u * math.pi) * size * 0.2
            pts.append((x, y))
        d.line(pts, fill=(255, 255, 255, alpha), width=lw, joint='curve')
    return im


LOGO_BIG = logo(240)
LOGO_SMALL = logo(64)


def brand_bug(base):
    d = ImageDraw.Draw(base)
    base.alpha_composite(LOGO_SMALL, (40, 34))
    d.text((118, 44), 'Umbral_exp', font=font(36), fill=WHITE + (255,), stroke_width=2, stroke_fill=NAVY + (180,))


def word_pop(base, text, center, size, t_local, color, start=0.0, per=0.09):
    """Texto centrado que aparece palabra por palabra con rebote (con fundido real)."""
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    f = font(size)
    words = text.split(' ')
    space = d.textlength(' ', font=f)
    widths = [d.textlength(w, font=f) for w in words]
    total = sum(widths) + space * (len(words) - 1)
    x = center[0] - total / 2
    for i, w in enumerate(words):
        k = ease_back((t_local - start - i * per) / 0.32)
        if k > 0:
            a = int(255 * min(1, k))
            dy = (1 - k) * 50
            d.text((x, center[1] - size / 2 + dy), w, font=f, fill=color + (a,))
        x += widths[i] + space
    base.alpha_composite(ov)


def intro(t):
    im = Image.new('RGBA', (W, H), NAVY + (255,))
    d = ImageDraw.Draw(im)
    # franjas diagonales en movimiento (motivo de la marca)
    off = (t * 260) % 240
    for i in range(-3, 14):
        x = i * 240 - off
        d.polygon([(x, H), (x + 70, H), (x + 70 + 420, 0), (x + 420, 0)], fill=(33, 48, 86, 255))
    if t < 2.2:
        word_pop(im, '¿Tu cliente está en Paraguay?', (W / 2, H / 2 - 40), 92, t, WHITE, start=0.3)
        word_pop(im, 'O en Kazajistán. O en Sudáfrica.', (W / 2, H / 2 + 80), 52, t, (232, 200, 160), start=1.0, per=0.07)
    else:
        tt = t - 2.2
        word_pop(im, 'Que arme tu sembradora', (W / 2, H / 2 - 50), 96, tt, WHITE, start=0.1)
        word_pop(im, 'sin viajar.', (W / 2, H / 2 + 70), 110, tt, ORANGE, start=0.55, per=0.12)
    return im


def outro(t):
    im = Image.new('RGBA', (W, H), BEIGE + (255,))
    d = ImageDraw.Draw(im)
    # anillos suaves que se expanden desde el logo (detrás de todo)
    rings = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    for i in range(3):
        r = 140 + (t * 420 + i * 240) % 720
        a = max(0, int(38 * (1 - (r - 140) / 720)))
        rd.ellipse((W / 2 - r, 330 - r, W / 2 + r, 330 + r), outline=NAVY + (a,), width=3)
    im.alpha_composite(rings)
    k = ease_back(t / 0.5)
    if k > 0:
        s = max(1, int(240 * k))
        lg = LOGO_BIG.resize((s, s), Image.LANCZOS)
        im.alpha_composite(lg, (int(W / 2 - s / 2), int(330 - s / 2)))
    word_pop(im, 'Umbral_exp', (W / 2, 560), 120, t, NAVY, start=0.45)
    word_pop(im, 'Configuradores 3D para maquinaria agrícola', (W / 2, 680), 50, t, (75, 79, 88), start=0.9, per=0.06)
    word_pop(im, 'By Matias Colimodio', (W / 2, 770), 44, t, ORANGE, start=1.5)
    k4 = ease_out((t - 2.0) / 0.4)
    if k4 > 0:
        f = font(36)
        txt = 'Probalo:  surco-configurador.matiascolimodio.workers.dev'
        tw = d.textlength(txt, font=f)
        a = int(255 * k4)
        ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(ov)
        rounded_box(od, (W / 2 - tw / 2 - 34, 860, W / 2 + tw / 2 + 34, 936), 38, NAVY + (a,))
        od.text((W / 2 - tw / 2, 875), txt, font=f, fill=WHITE + (a,))
        im.alpha_composite(ov)
    return im


def segment_frame(t):
    for (a, b, name, s0, title, sub) in SEGMENTS:
        if a <= t < b:
            lt = t - a
            idx = s0 + int(round(lt * FPS))
            src = shot_frame(name, idx)
            ui = name in UI_SHOTS
            # golpe de zoom al entrar + zoom lento continuo
            punch = 1 + 0.07 * (1 - ease_out(lt / 0.3))
            drift = 1 + 0.025 * (lt / (b - a))
            base = cover(src, punch * drift).convert('RGBA')
            if not ui:
                brand_bug(base)
            caption(base, lt, title, sub, ui=ui)
            # destello blanco en el corte
            if lt < 0.1:
                fl = Image.new('RGBA', (W, H), (255, 255, 255, int(200 * (1 - lt / 0.1))))
                base.alpha_composite(fl)
            # barra de progreso fina abajo
            dd = ImageDraw.Draw(base)
            dd.rectangle((0, H - 8, int(W * t / DUR), H), fill=ORANGE + (255,))
            return base
    return None


def frame(t):
    if t < 4.0:
        im = intro(t)
        if t > 3.8:  # transición: zoom + blanco hacia la toma
            k = (t - 3.8) / 0.2
            im.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(255 * k))))
        return im
    if t >= 33.5:
        im = outro(t - 33.5)
        if t < 33.6:
            im.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(255 * (1 - (t - 33.5) / 0.1)))))
        return im
    return segment_frame(t)


def main():
    total = int(DUR * FPS)
    only = os.environ.get('ONLY')  # p.ej. ONLY=0,120,300 para previsualizar
    idxs = [int(x) for x in only.split(',')] if only else range(total)
    for i in idxs:
        t = i / FPS
        im = frame(t).convert('RGB')
        im.save(os.path.join(FRAMES_DIR, f'{i:05d}.jpg'), quality=93)
        if not only and i % 150 == 0:
            print('cuadro', i, '/', total, flush=True)
    if only:
        return
    music = os.path.join(SRC, 'music.wav')
    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(FRAMES_DIR, '%05d.jpg'),
        '-i', music, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT,
    ]
    subprocess.run(cmd, check=True)
    print('listo', OUT)


if __name__ == '__main__':
    main()
