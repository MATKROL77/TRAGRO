"""
Banda sonora original del video promocional, sintetizada desde cero con numpy
(sin samples ni servicios externos). 120 BPM, Do mayor, 40 s.

Guion (segundos):
  0-4   intro: textos "¿Vendés semirremolques?" / "¡Mostralos en 3D!" + subida
  4     DROP
  4-8   héroe (giro)                     8-12  cuatro tipos (1 s c/u)
  12-18 en acción (batea, sider, lona)   18-22 colores (8 x 0,5 s, pops)
  22-24 tu marca (corte de bombo)        24-28 precio y semáforo legal
  28-30 exterior                         30-34 PDF / WhatsApp / idiomas
  34-40 cierre con logo (golpe en 34, acorde final en 38)
"""
import json
import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
DUR = 40.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
DL = np.zeros(N)  # bus seco (bombo, efectos): no se agacha con el sidechain
DR = np.zeros(N)
duck_src = np.zeros(N)  # envolvente de "sidechain" (bombo)


def add(sig, t, gain=1.0, pan=0.0, dry=False):
    """Suma una señal mono en t (s) con paneo -1..1 (ley de potencia constante)."""
    i = int(round(t * SR))
    if i >= N:
        return
    sig = sig[: N - i]
    a = (pan + 1) * np.pi / 4
    bl, br = (DL, DR) if dry else (L, R)
    bl[i : i + len(sig)] += sig * gain * np.cos(a)
    br[i : i + len(sig)] += sig * gain * np.sin(a)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, a, d):
    """Ataque lineal y caída exponencial."""
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def fft_filter(x, lo=None, hi=None):
    """Pasa-banda ideal suave por FFT (sin scipy)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(freq, dur, harm=12, detune=0.0):
    t = tt(dur)
    out = np.zeros_like(t)
    for k in range(1, harm + 1):
        if freq * k > 16000:
            break
        out += np.sin(2 * np.pi * freq * (1 + detune) * k * t) / k
    return out * 0.6


def square(freq, dur, harm=9):
    t = tt(dur)
    out = np.zeros_like(t)
    for k in range(1, harm * 2, 2):
        if freq * k > 15000:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out * 0.8


# ---------------------------------------------------------------- instrumentos
def kick():
    t = tt(0.42)
    f = 46 + 110 * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22)
    click = rng.standard_normal(len(t)) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * 0.9


def clap():
    n = int(0.25 * SR)
    noise = fft_filter(rng.standard_normal(n), lo=900, hi=7000)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for off in (0, 0.009, 0.018):
        k = t >= off
        e[k] += np.exp(-(t[k] - off) / (0.012 if off < 0.018 else 0.09))
    return noise * e * 0.55


def hat(open_=False):
    d = 0.16 if open_ else 0.035
    n = int((d * 4) * SR)
    noise = fft_filter(rng.standard_normal(n), lo=7000)
    return noise * env_ad(n, 0.001, d) * (0.22 if open_ else 0.2)


def crash():
    n = int(2.2 * SR)
    noise = fft_filter(rng.standard_normal(n), lo=3500)
    return noise * env_ad(n, 0.002, 0.7) * 0.32


def bass_note(note, dur):
    f = midi(note)
    s = saw(f, dur, harm=7) * 0.7 + np.sin(2 * np.pi * f / 2 * tt(dur)) * 0.0 + np.sin(2 * np.pi * f * tt(dur)) * 0.5
    return s * env_ad(len(s), 0.004, 0.16) * 0.55


def stab(notes, dur=0.16):
    out = None
    for n in notes:
        f = midi(n)
        v = saw(f, dur, harm=10, detune=0.004) + saw(f, dur, harm=10, detune=-0.004)
        out = v if out is None else out + v
    return out * env_ad(len(out), 0.003, 0.07) * 0.16


def pluck(note, dur=0.22, bright=9):
    f = midi(note)
    s = square(f, dur, harm=bright) * 0.5 + np.sin(2 * np.pi * f * 2 * tt(dur)) * 0.15
    return s * env_ad(len(s), 0.002, 0.08) * 0.22


def pad(notes, dur):
    out = None
    for n in notes:
        v = saw(midi(n), dur, harm=6, detune=0.003) + saw(midi(n), dur, harm=6, detune=-0.003)
        out = v if out is None else out + v
    n = len(out)
    e = np.minimum(1, np.arange(n) / (0.25 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.4 * SR))
    return out * e * 0.06


# ---------------------------------------------------------------- efectos
def whoosh(dur=0.55, up=True):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 8
    for k in range(seg):
        a, b = k * n // seg, (k + 1) * n // seg
        fc = 600 * (2 ** (3 * (k / seg if up else 1 - k / seg)))
        out[a:b] = fft_filter(noise[a:b], lo=fc * 0.5, hi=fc * 2.2)
    t = np.arange(n) / n
    e = np.sin(np.pi * t) ** 1.5
    return out * e * 0.5


def pop(freq=700, dur=0.12):
    t = tt(dur)
    f = freq * (1 + 1.2 * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env_ad(len(t), 0.001, 0.035) * 0.45


def ding(freq=1568, dur=0.9):
    t = tt(dur)
    s = np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * freq * 2.76 * t) + 0.2 * np.sin(2 * np.pi * freq * 5.4 * t)
    return s * env_ad(len(t), 0.001, 0.22) * 0.2


def cha_ching():
    out = np.zeros(int(1.0 * SR))
    c = rng.standard_normal(int(0.08 * SR))
    c = fft_filter(c, lo=2500) * env_ad(len(c), 0.001, 0.015) * 0.6
    out[: len(c)] += c
    d1 = ding(2093, 0.8)
    d2 = ding(2637, 0.9)
    i = int(0.09 * SR)
    out[i : i + len(d1)] += d1[: len(out) - i]
    j = int(0.17 * SR)
    out[j : j + len(d2)] += d2[: len(out) - j]
    return out


def riser(dur=2.0):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 16
    for k in range(seg):
        a, b = k * n // seg, (k + 1) * n // seg
        fc = 400 * (2 ** (4.5 * k / seg))
        out[a:b] = fft_filter(noise[a:b], lo=fc * 0.6, hi=fc * 1.8)
    t = np.arange(n) / n
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2.5 * t)) / SR) * 0.25
    return (out * 0.6 + tone) * t**2 * 0.6


def impact():
    t = tt(1.6)
    f = 32 + 90 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
    return np.tanh(boom * 2) * 0.8


def tick():
    n = int(0.03 * SR)
    return fft_filter(rng.standard_normal(n), lo=3000) * env_ad(n, 0.0005, 0.006) * 0.5


# ---------------------------------------------------------------- arreglo
PROG = {  # acorde por compás (raíz, tríada en octava 4)
    "C": (48, [60, 64, 67]),
    "G": (43, [59, 62, 67]),
    "Am": (45, [60, 64, 69]),
    "F": (41, [60, 65, 69]),
}
ORDER = ["C", "G", "Am", "F"]
MOTIF = {
    "C": [76, 79, 84, 79, 76, 79, 81, 79],
    "G": [74, 79, 83, 79, 74, 79, 81, 83],
    "Am": [72, 76, 81, 76, 72, 76, 79, 76],
    "F": [72, 77, 81, 77, 72, 77, 79, 81],
}

K, CL = kick(), clap()
HC, HO = hat(), hat(True)

bars = int(DUR / BAR)
for b in range(bars):
    t0 = b * BAR
    name = ORDER[b % 4]
    root, triad = PROG[name]
    intro = t0 < 4
    breakdown = 22 <= t0 < 24
    end = t0 >= 38
    if end:
        continue
    # pad de fondo siempre
    add(pad(triad, BAR + 0.3), t0, 1.8 if intro else 1.0)
    for beat in range(4):
        tb = t0 + beat * BEAT
        if not intro and not breakdown:
            add(K, tb, 1.0, dry=True)
            duck_src[int(tb * SR) : int(tb * SR) + int(0.2 * SR)] = np.maximum(duck_src[int(tb * SR) : int(tb * SR) + int(0.2 * SR)], np.exp(-np.arange(int(0.2 * SR)) / SR / 0.08))
        if beat in (1, 3):
            add(CL, tb, 0.9 if not intro else 0.6, 0.05)
        # hats en contratiempo, con fantasmas
        if not intro or t0 >= 2:
            add(HC, tb + BEAT / 2, 1.0, 0.3)
            add(HC, tb + BEAT * 0.75, 0.45, -0.3)
        if not intro and not breakdown and beat % 2 == 1 and b % 2 == 1:
            add(HO, tb + BEAT / 2, 0.8, 0.2)
        # stabs de acordes en contratiempo
        if not intro:
            add(stab(triad), tb + BEAT / 2, 1.0, -0.15)
    # bajo en corcheas con saltos de octava
    if not intro or t0 >= 2:
        pattern = [0, 0, 12, 0, 0, 12, 0, 7]
        for i, iv in enumerate(pattern):
            add(bass_note(root + iv, BEAT / 2), t0 + i * BEAT / 2, 1.0 if not intro else 0.6)
    # motivo (pluck): intro, drops y cierre; pausa en colores
    if not (18 <= t0 < 22):
        for i, n in enumerate(MOTIF[name]):
            add(pluck(n), t0 + i * BEAT / 2, 1.6 if intro else 1.0, 0.25 if i % 2 else -0.25)
            if not intro and not breakdown:
                add(pluck(n + 12, 0.12, 5), t0 + i * BEAT / 2 + 0.25, 0.25, 0.5)

# redoble antes del drop y antes de 24
for i in range(8):
    add(CL, 3.0 + i * BEAT / 4, 0.25 + 0.08 * i)
for i in range(8):
    add(CL, 23.0 + i * BEAT / 4, 0.2 + 0.07 * i)

# acorde final
fin = sum(saw(midi(n), 2.0, harm=10, detune=d) for n in (48, 60, 64, 67, 72) for d in (0.003, -0.003))
add(fin * env_ad(len(fin), 0.002, 0.7) * 0.12, 38.0)
add(K, 38.0, dry=True)
add(crash(), 38.0, 0.8)
add(ding(1046.5, 1.6), 38.05, 0.8)

# ---------------------------------------------------------------- efectos sincronizados
FX = []


def fx(name, t, sig, gain=1.0, pan=0.0):
    FX.append({"t": round(t, 3), "fx": name})
    add(sig, t, gain, pan, dry=True)


for i, t in enumerate([0.1, 0.55, 2.0, 2.5]):
    fx("pop", t, pop(600 + 150 * i), 0.9, -0.2 + 0.13 * i)
fx("riser", 2.0, riser(2.0), 0.9)
fx("impact", 4.0, impact(), 1.0)
fx("crash", 4.0, crash(), 0.9)
for i, t in enumerate([8, 9, 10, 11, 12, 14.5, 17, 22, 24, 26, 28, 30, 32]):
    fx("whoosh", t - 0.18, whoosh(0.5, up=i % 2 == 0), 0.85, -0.5 if i % 2 else 0.5)
for i in range(8):  # colores: escala ascendente de pops
    fx("pop", 18.0 + i * 0.5, pop(midi(72 + [0, 2, 4, 5, 7, 9, 11, 12][i])), 1.0, -0.6 + i * 0.17)
fx("ding", 22.35, ding(1318.5), 0.9)
fx("riser", 23.0, riser(1.0), 0.5)
fx("cha-ching", 24.55, cha_ching(), 1.0)
for i, t in enumerate([26.5, 26.85, 27.2]):
    fx("ding", t, ding(1568 * (1.122 ** i)), 0.75, -0.3 + 0.3 * i)
fx("pop", 30.65, pop(500), 0.8)
fx("pop", 31.25, pop(900), 0.9)
for i, t in enumerate([32.1, 32.55, 33.0, 33.45]):
    fx("tick", t, tick(), 0.9, -0.4 + 0.27 * i)
fx("impact", 34.0, impact(), 0.9)
fx("crash", 34.0, crash(), 0.8)

# ---------------------------------------------------------------- mezcla
# sidechain: el bombo "agacha" todo lo que no es percusión (aprox.: toda la mezcla menos el bombo pierde 35 %)
duck = 1 - 0.4 * duck_src
L = L * duck + DL
R = R * duck + DR
# fade-out final
fade = np.ones(N)
fo = int(1.6 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
L *= fade
R *= fade
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.15)
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix * 32767).astype(np.int16)

out = sys.argv[1] if len(sys.argv) > 1 else "audio.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
json.dump(FX, open(out.replace(".wav", "-fx.json"), "w"), indent=1)
print("ok", out, f"{DUR}s", len(FX), "efectos")
