"""Música y efectos del video promocional, sintetizados por código (sin samples externos: libre de derechos).

120 BPM, Do mayor, progresión C–G–Am–F. Uso: python3 scripts/promo/music.py salida.wav
"""
import sys
import wave

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
BPM = 120
BEAT = 60 / BPM
DUR = 38.5
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def t_(d):
    return np.arange(int(SR * d)) / SR


def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    s = sig[: N - i] * gain
    L[i : i + len(s)] += s * (1 - max(0, pan))
    R[i : i + len(s)] += s * (1 + min(0, pan))


def lp(x, f, order=2):
    b, a = butter(order, f / (SR / 2), 'low')
    return lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = butter(order, f / (SR / 2), 'high')
    return lfilter(b, a, x)


def bp(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return lfilter(b, a, x)


def note(n):  # MIDI → Hz
    return 440 * 2 ** ((n - 69) / 12)


def saw(f, d, detune=0.0):
    t = t_(d)
    ph = (t * f * (1 + detune)) % 1
    return 2 * ph - 1


def env(d, a=0.005, dec=0.2, sus=0.0, rel=0.05):
    n = int(SR * d)
    e = np.ones(n) * sus
    na = max(1, int(a * SR))
    nd = max(1, int(dec * SR))
    e[:na] = np.linspace(0, 1, na)
    end = min(n, na + nd)
    e[na:end] = np.linspace(1, sus, end - na)
    nr = min(n, int(rel * SR))
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


# ---------------- instrumentos ----------------
def kick():
    t = t_(0.35)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * 1.1 + np.sin(ph * 2) * np.exp(-t * 40) * 0.15


def clap():
    t = t_(0.22)
    nz = rng.standard_normal(len(t))
    e = np.exp(-t * 22) + 0.6 * np.exp(-((t - 0.012) * 400) ** 2) + 0.5 * np.exp(-((t - 0.024) * 400) ** 2)
    return bp(nz, 900, 3200) * e * 0.9


def hat(open_=False):
    t = t_(0.18 if open_ else 0.045)
    nz = rng.standard_normal(len(t))
    return hp(nz, 7000) * np.exp(-t * (14 if open_ else 70)) * 0.35


def bass(n, d):
    f = note(n)
    s = saw(f, d) * 0.6 + np.sin(2 * np.pi * f * t_(d)) * 0.7
    return lp(s, 420) * env(d, 0.004, d * 0.6, 0.55, 0.03)


def pad(notes, d):
    s = np.zeros(int(SR * d))
    for n in notes:
        for dt in (-0.006, 0.0, 0.007):
            s += saw(note(n), d, dt)
    s /= len(notes) * 3
    return lp(s, 2600) * env(d, 0.02, 0.3, 0.75, 0.08)


def pluck(n, d=0.28):
    t = t_(d)
    f = note(n)
    s = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * saw(f, d)) * np.exp(-t * 11)
    return lp(s, 5000) * 0.5


def whoosh(d=0.7, up=True):
    t = t_(d)
    nz = rng.standard_normal(len(t))
    out = np.zeros_like(nz)
    seg = 512
    for i in range(0, len(nz), seg):
        k = i / len(nz)
        fc = 300 + (5500 if up else 5500 * (1 - k)) * (k if up else 1)
        out[i : i + seg] = bp(nz[max(0, i - 2048) : i + seg], max(80, fc * 0.6), min(18000, fc * 1.6))[-len(nz[i : i + seg]) :]
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return out * e * 0.55


def riser(d=3.0):
    t = t_(d)
    nz = hp(rng.standard_normal(len(t)), 1500) * (t / d) ** 2 * 0.35
    f = 220 * 2 ** (t / d * 2)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / d) ** 3 * 0.25
    return nz + tone


def impact():
    t = t_(1.6)
    boom = np.sin(2 * np.pi * np.cumsum(60 * np.exp(-t * 2) + 30) / SR) * np.exp(-t * 3.2)
    nz = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 6) * 0.6
    return (boom + nz) * 1.1


def pop(pitch=1.0):
    t = t_(0.09)
    f = (500 + 900 * np.exp(-t * 60)) * pitch
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * 0.45


def ding():
    t = t_(0.9)
    s = np.zeros_like(t)
    for f, a in ((1568, 1), (2093, 0.6), (3136, 0.25)):
        s += np.sin(2 * np.pi * f * t) * a
    return s * np.exp(-t * 5) * 0.22


def engine(d):
    t = t_(d)
    f = 38 + 4 * np.sin(2 * np.pi * 0.7 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sign(np.sin(ph)) * 0.5 + np.sin(ph * 2) * 0.3 + 0.25 * rng.standard_normal(len(t))
    s = lp(s, 260, 3)
    fade = np.minimum(1, np.minimum(t / 0.6, (d - t) / 0.6))
    return s * fade * 0.45


def hiss(d=1.2):
    t = t_(d)
    return bp(rng.standard_normal(len(t)), 2500, 9000) * np.exp(-t * 2.5) * 0.18


# ---------------- arreglo ----------------
DROP = 4.0
END_MUSIC = 36.0
prog = [(48, [60, 64, 67, 72]), (43, [59, 62, 67, 71]), (45, [57, 60, 64, 69]), (41, [57, 60, 65, 69])]  # C G Am F
melody = [72, 76, 79, 76, 74, 79, 83, 79, 72, 76, 81, 76, 72, 77, 81, 77]  # arpegio por corchea

# intro: acordes filtrados + pluck suave + riser
for bar in range(2):
    root, ch = prog[bar % 4]
    place(lp(pad(ch, 4 * BEAT), 900), bar * 4 * BEAT, 0.55)
    for k in range(8):
        place(pluck(melody[(bar * 8 + k) % 16] - 12, 0.25), bar * 4 * BEAT + k * BEAT / 2, 0.35, pan=0.3 if k % 2 else -0.3)
place(riser(3.0), DROP - 3.0, 0.9)

beat_t = DROP
bar_i = 0
while beat_t < END_MUSIC - 1e-6:
    root, ch = prog[bar_i % 4]
    bar_start = beat_t
    stop = 19.0 <= bar_start < 20.9  # mini corte antes del plegado
    place(pad(ch, 4 * BEAT), bar_start, 0.42 if not stop else 0.25)
    for b in range(4):
        tb = bar_start + b * BEAT
        if stop and b >= 2:
            continue
        place(kick(), tb, 0.95)
        if b in (1, 3):
            place(clap(), tb, 0.7)
        for h in range(2):
            place(hat(open_=(h == 1 and b == 3)), tb + h * BEAT / 2, 0.8, pan=0.25)
        # bajo en corcheas a contratiempo (bombeo)
        place(bass(root - 12 + (12 if b == 3 else 0), BEAT / 2 * 0.9), tb + BEAT / 2, 0.75)
        for k in range(2):
            place(pluck(melody[(bar_i * 8 + b * 2 + k) % 16], 0.26), tb + k * BEAT / 2, 0.42, pan=-0.35 if k else 0.35)
    beat_t += 4 * BEAT
    bar_i += 1

# outro: acorde final largo
place(pad([60, 64, 67, 72, 76], 2.5), END_MUSIC, 0.5)
place(pluck(84, 1.2), END_MUSIC, 0.5)

# ---------------- efectos sincronizados con los cortes ----------------
CUTS = [4.0, 8.0, 12.0, 16.0, 19.0, 24.0, 27.5, 31.0, 33.5]
place(impact(), DROP, 0.9)
for c in CUTS[1:]:
    place(whoosh(0.6), c - 0.35, 0.7, pan=-0.2)
place(impact(), 33.5, 0.75)
# "pop" de los textos
for tt in [0.35, 2.35, 4.25, 8.2, 12.2, 16.2, 19.2, 24.2, 27.7, 31.2, 34.0, 34.7]:
    place(pop(1.0 + (tt % 3) * 0.1), tt, 0.9)
# campanita en los cambios de precio (acciones de la toma ui_rows)
for f in (15, 35, 55, 78):
    place(ding(), 8.0 + f / 30 + 0.12, 1.0, pan=0.2)
# motor del tractor en el campo y en la ruta
place(engine(7.0), 12.0, 0.9)
place(engine(3.5), 24.0, 0.8)
# hidráulico al plegar
place(hiss(1.6), 19.0 + 10 / 30, 1.0)
place(hiss(1.4), 20.6, 0.8)

# ---------------- master ----------------
mix = np.stack([L, R], axis=1)
# sidechain suave con el bombo para el "bombeo"
mix = np.tanh(mix * 1.15) * 0.92
fade_out = int(1.2 * SR)
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
mix /= np.max(np.abs(mix)) * 1.02
pcm = (mix * 32767).astype(np.int16)
out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ok', out, f'{DUR}s')
