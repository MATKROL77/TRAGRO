"""Compone capturas antes/después en una sola imagen: python3 bench/sidebyside.py antes/ despues/ salida.png"""
import sys
from PIL import Image
a_dir, b_dir, out = sys.argv[1:4]
rows = []
for sc in ['estudio', 'campo', 'ruta']:
    a = Image.open(f'{a_dir}/desktop-{sc}.png').convert('RGB')
    b = Image.open(f'{b_dir}/desktop-{sc}.png').convert('RGB')
    w = 560; h = int(a.height * w / a.width)
    row = Image.new('RGB', (w * 2 + 10, h), 'white')
    row.paste(a.resize((w, h), Image.LANCZOS), (0, 0)); row.paste(b.resize((w, h), Image.LANCZOS), (w + 10, 0))
    rows.append(row)
img = Image.new('RGB', (rows[0].width, sum(r.height for r in rows) + 16 * len(rows)), 'white')
y = 0
for r in rows:
    img.paste(r, (0, y)); y += r.height + 16
img.save(out)
