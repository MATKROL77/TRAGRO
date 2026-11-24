#!/usr/bin/env python3
"""Utilidades mínimas para HDRI Radiance (.hdr / RGBE) sin dependencias externas salvo numpy/Pillow.

Uso:
  python3 hdr_tools.py resize  <in.hdr> <out.hdr> <ancho>      # reduce con filtro de área (promedio)
  python3 hdr_tools.py info    <in.hdr>                        # tamaño, rango dinámico, posición del sol
  python3 hdr_tools.py tonemap <in.hdr> <out.jpg> [exposición] [calidad] [ancho]
"""
import sys
import numpy as np


def read_hdr(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 0
    header = []
    while True:
        end = data.index(b'\n', pos)
        line = data[pos:end].decode('ascii', 'replace')
        pos = end + 1
        if line.strip() == '':
            break
        header.append(line)
    end = data.index(b'\n', pos)
    res = data[pos:end].decode('ascii').split()
    pos = end + 1
    assert res[0] == '-Y' and res[2] == '+X', f'orientación no soportada: {res}'
    h, w = int(res[1]), int(res[3])
    buf = np.frombuffer(data, dtype=np.uint8, offset=pos)
    rgbe = np.empty((h, w, 4), dtype=np.uint8)
    p = 0
    for y in range(h):
        if w < 8 or w > 0x7FFF or buf[p] != 2 or buf[p + 1] != 2 or (buf[p + 2] & 0x80):
            # sin RLE (plano)
            rgbe[y:] = buf[p:p + (h - y) * w * 4].reshape(h - y, w, 4)
            break
        assert (int(buf[p + 2]) << 8 | int(buf[p + 3])) == w
        p += 4
        for c in range(4):
            x = 0
            row = rgbe[y, :, c]
            while x < w:
                n = int(buf[p]); p += 1
                if n > 128:
                    n -= 128
                    row[x:x + n] = buf[p]; p += 1
                else:
                    row[x:x + n] = buf[p:p + n]; p += n
                x += n
    e = rgbe[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    rgb = rgbe[..., :3].astype(np.float32) * scale[..., None]
    return rgb


def _rle_channel(row):
    out = bytearray()
    n = len(row)
    i = 0
    while i < n:
        # buscar corrida
        run = 1
        while i + run < n and run < 127 and row[i + run] == row[i]:
            run += 1
        if run >= 4:
            out.append(128 + run); out.append(int(row[i])); i += run
        else:
            start = i
            i += run
            while i < n and (i - start) < 128:
                run = 1
                while i + run < n and run < 127 and row[i + run] == row[i]:
                    run += 1
                if run >= 4:
                    break
                i += run
            if i - start > 128:
                i = start + 128
            out.append(i - start); out.extend(bytes(row[start:i]))
    return bytes(out)


def write_hdr(path, rgb):
    rgb = np.maximum(rgb.astype(np.float64), 0.0)
    h, w, _ = rgb.shape
    m = rgb.max(axis=2)
    e = np.zeros_like(m, dtype=np.int32)
    nz = m > 1e-32
    mant, ex = np.frexp(m[nz])
    e[nz] = ex + 128
    sc = np.zeros_like(m)
    sc[nz] = mant * 256.0 / m[nz]
    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    rgbe[..., :3] = np.clip(rgb * sc[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.clip(e, 0, 255).astype(np.uint8)
    rgbe[~nz] = 0
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
        f.write(f'-Y {h} +X {w}\n'.encode('ascii'))
        for y in range(h):
            f.write(bytes([2, 2, (w >> 8) & 0xFF, w & 0xFF]))
            for c in range(4):
                f.write(_rle_channel(rgbe[y, :, c]))


def resize_area(rgb, new_w):
    h, w, _ = rgb.shape
    new_h = new_w // 2
    fx, fy = w // new_w, h // new_h
    assert fx * new_w == w and fy * new_h == h, 'el factor de reducción debe ser entero'
    return rgb.reshape(new_h, fy, new_w, fx, 3).mean(axis=(1, 3))


def sun_info(rgb):
    h, w, _ = rgb.shape
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # centroide ponderado del 0,02 % más brillante (más estable que un único píxel)
    thr = np.quantile(lum, 0.9998)
    ys, xs = np.nonzero(lum >= thr)
    wts = lum[ys, xs]
    # manejar wrap horizontal usando ángulo
    ang = (xs + 0.5) / w * 2 * np.pi
    cx = np.arctan2((np.sin(ang) * wts).sum(), (np.cos(ang) * wts).sum()) % (2 * np.pi)
    u = cx / (2 * np.pi)
    v = ((ys + 0.5) * wts).sum() / wts.sum() / h
    yb, xb = np.unravel_index(np.argmax(lum), lum.shape)
    return dict(u=float(u), v=float(v), elev=float((0.5 - v) * 180.0), peak=float(lum.max()),
                peak_uv=((xb + 0.5) / w, (yb + 0.5) / h), mean=float(lum.mean()))


def tonemap(rgb, exposure=1.0):
    x = rgb * exposure
    # curva filmica suave (Reinhard extendido) + gamma sRGB
    white = 6.0
    y = x * (1 + x / (white * white)) / (1 + x)
    y = np.clip(y, 0, 1)
    srgb = np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)
    return (srgb * 255 + 0.5).astype(np.uint8)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'resize':
        img = read_hdr(sys.argv[2])
        out = resize_area(img, int(sys.argv[4]))
        write_hdr(sys.argv[3], out)
        chk = read_hdr(sys.argv[3])
        print(f'{sys.argv[3]}: {chk.shape[1]}x{chk.shape[0]} max={chk.max():.2f} mean={chk.mean():.4f} (origen mean={img.mean():.4f})')
    elif cmd == 'info':
        img = read_hdr(sys.argv[2])
        print(img.shape, 'max', float(img.max()), sun_info(img))
    elif cmd == 'tonemap':
        from PIL import Image
        img = read_hdr(sys.argv[2])
        exp = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
        q = int(sys.argv[5]) if len(sys.argv) > 5 else 82
        im = Image.fromarray(tonemap(img, exp))
        if len(sys.argv) > 6:
            nw = int(sys.argv[6]); im = im.resize((nw, nw // 2), Image.LANCZOS)
        im.save(sys.argv[3], quality=q, optimize=True, progressive=True, subsampling=0 if q >= 90 else 2)
        print(sys.argv[3], im.size)
