#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vídeo promocional "VIGÍA IA" — 20 s, 1080x1920 (vertical), 30 fps.

Genera cada fotograma con Pillow (supersampling 2x para bordes suaves) y los
envía en crudo (rgb24) a ffmpeg, que codifica el MP4 (H.264, yuv420p).

Escenas:
  1 (0-4 s)   Rejilla de cámara de seguridad + "¿Y si tu cámara pensara?" (máquina de escribir).
  2 (4-9 s)   Detección simulada: siluetas (persona y coche) con cajas verdes
              "PERSONA 98%" y "VEHÍCULO 95%".
  3 (9-14 s)  Características apareciendo una a una.
  4 (14-20 s) Logo "VIGÍA IA" con barrido de escaneo verde, "Vigilancia
              inteligente" y recuadro de detección parpadeando.

Uso:  python3 tools/vigia-promo-video.py [salida.mp4]
"""

import math
import shutil
import subprocess
import sys
from functools import lru_cache

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont

# ---------------------------------------------------------------- constantes
W, H = 1080, 1920          # resolución final
SS = 2                     # factor de supersampling (se dibuja a 2x y se reduce)
FPS = 30
DUR = 20
N_FRAMES = FPS * DUR

GREEN = (0, 255, 136)      # #00FF88
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY_SIL = (38, 38, 38)    # relleno de las siluetas
GRAY_DARK = (21, 21, 21)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONT_BOLD = f"{FONT_DIR}/DejaVuSans-Bold.ttf"
FONT_REG = f"{FONT_DIR}/DejaVuSans.ttf"
FONT_MONO = f"{FONT_DIR}/DejaVuSansMono.ttf"
FONT_MONO_B = f"{FONT_DIR}/DejaVuSansMono-Bold.ttf"

OUT = sys.argv[1] if len(sys.argv) > 1 else "vigia-promo-20s.mp4"


def s(v):
    """Coordenada de diseño (base 1080x1920) -> lienzo supersampleado."""
    return int(round(v * SS))


@lru_cache(maxsize=None)
def font(path, size):
    return ImageFont.truetype(path, s(size))


def cmul(color, a):
    """Atenúa un color hacia negro (el fondo es negro, sirve como alpha)."""
    a = max(0.0, min(1.0, a))
    return tuple(int(c * a) for c in color)


def clamp01(v):
    return max(0.0, min(1.0, v))


def ease_out(t):
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def fit_font(draw, text, path, size, max_w):
    """Reduce el tamaño hasta que el texto quepa en max_w (px de diseño)."""
    while size > 10:
        f = font(path, size)
        if draw.textlength(text, font=f) <= s(max_w):
            return f
        size -= 2
    return font(path, size)


# ---------------------------------------------------------------- decorados

def draw_grid(d, alpha, step=135):
    """Rejilla tenue tipo monitor CCTV."""
    col = cmul(GREEN, alpha)
    for x in range(0, W + step, step):
        d.line([(s(x), 0), (s(x), s(H))], fill=col, width=SS)
    for y in range(0, H + step, step):
        d.line([(0, s(y)), (s(W), s(y))], fill=col, width=SS)


def draw_corners(d, alpha):
    """Esquinas de visor de cámara."""
    col = cmul(GREEN, alpha)
    m, L, w = 48, 110, 7
    for cx, cy, dx, dy in ((m, m, 1, 1), (W - m, m, -1, 1),
                           (m, H - m, 1, -1), (W - m, H - m, -1, -1)):
        d.line([(s(cx), s(cy)), (s(cx + dx * L), s(cy))], fill=col, width=s(w))
        d.line([(s(cx), s(cy)), (s(cx), s(cy + dy * L))], fill=col, width=s(w))


def draw_hud(d, t, label="CAM 01"):
    """REC parpadeante + cámara y hora, como un CCTV real."""
    mono = font(FONT_MONO_B, 30)
    if (t * 2) % 2 < 1.2:  # parpadeo del punto REC
        d.ellipse([s(84), s(96), s(112), s(124)], fill=GREEN)
    d.text((s(130), s(110)), "REC", font=mono, fill=WHITE, anchor="lm")

    secs = int(t)
    clock = f"04:12:{(33 + secs) % 60:02d}"
    d.text((s(W - 84), s(96)), label, font=mono, fill=cmul(WHITE, 0.85), anchor="ra")
    d.text((s(W - 84), s(140)), f"09/07/2026 {clock}",
           font=font(FONT_MONO, 26), fill=cmul(WHITE, 0.6), anchor="ra")


def draw_scanline(d, t, period=6.0, alpha=0.16):
    """Línea horizontal que barre la pantalla lentamente."""
    y = s((t % period) / period * H)
    d.rectangle([0, y - s(12), s(W), y + s(12)], fill=cmul(GREEN, alpha * 0.25))
    d.rectangle([0, y - s(2), s(W), y + s(2)], fill=cmul(GREEN, alpha))


def det_box(d, rect, t, t0, label, pad_label=True):
    """Caja de detección animada con esquinas y etiqueta de confianza."""
    if t < t0:
        return
    p = ease_out((t - t0) / 0.4)
    pulse = 1.0 if p < 1 else 0.88 + 0.12 * math.sin((t - t0) * 5.5)
    a = p * pulse
    x0, y0, x1, y1 = rect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    grow = 1.30 - 0.30 * p          # la caja "encaja" desde fuera
    hw, hh = (x1 - x0) / 2 * grow, (y1 - y0) / 2 * grow
    bx0, by0, bx1, by1 = cx - hw, cy - hh, cx + hw, cy + hh

    col = cmul(GREEN, a)
    d.rectangle([s(bx0), s(by0), s(bx1), s(by1)], outline=col, width=s(4))
    L = 34
    for px, py, dx, dy in ((bx0, by0, 1, 1), (bx1, by0, -1, 1),
                           (bx0, by1, 1, -1), (bx1, by1, -1, -1)):
        d.line([(s(px), s(py)), (s(px + dx * L), s(py))], fill=col, width=s(9))
        d.line([(s(px), s(py)), (s(px), s(py + dy * L))], fill=col, width=s(9))

    if t >= t0 + 0.30:              # etiqueta de confianza
        la = ease_out((t - t0 - 0.30) / 0.25)
        lf = font(FONT_MONO_B, 34)
        tw = d.textlength(label, font=lf) / SS
        ly1 = by0 - 14
        ly0 = ly1 - 56
        d.rectangle([s(bx0), s(ly0), s(bx0 + tw + 36), s(ly1)],
                    fill=cmul(GREEN, la))
        d.text((s(bx0 + 18), s((ly0 + ly1) / 2)), label, font=lf,
               fill=cmul(BLACK, 1), anchor="lm")


# ---------------------------------------------------------------- siluetas

def draw_person(d):
    """Silueta simple de persona de pie (suelo en y=1460)."""
    c = GRAY_SIL
    d.ellipse([s(248), s(983), s(352), s(1087)], fill=c)                    # cabeza
    d.rounded_rectangle([s(245), s(1100), s(355), s(1295)], s(40), fill=c)  # torso
    d.rounded_rectangle([s(222), s(1115), s(250), s(1275)], s(12), fill=c)  # brazo izq
    d.rounded_rectangle([s(350), s(1115), s(378), s(1275)], s(12), fill=c)  # brazo dcho
    d.rounded_rectangle([s(255), s(1290), s(293), s(1458)], s(14), fill=c)  # pierna izq
    d.rounded_rectangle([s(307), s(1290), s(345), s(1458)], s(14), fill=c)  # pierna dcha


def draw_car(d):
    """Silueta simple de coche (suelo en y=1460)."""
    d.rounded_rectangle([s(630), s(1185), s(890), s(1305)], s(42), fill=GRAY_SIL)  # cabina
    d.rounded_rectangle([s(656), s(1207), s(864), s(1285)], s(26), fill=(13, 13, 13))  # ventana
    d.rounded_rectangle([s(555), s(1275), s(965), s(1400)], s(30), fill=GRAY_SIL)  # carrocería
    for wx in (655, 865):                                                          # ruedas
        d.ellipse([s(wx - 48), s(1364), s(wx + 48), s(1460)], fill=GRAY_DARK)
        d.ellipse([s(wx - 18), s(1394), s(wx + 18), s(1430)], fill=(60, 60, 60))


# ---------------------------------------------------------------- escenas

def scene1(d, t):
    """0-4 s — rejilla CCTV + pregunta en modo máquina de escribir."""
    draw_grid(d, 0.10)
    draw_scanline(d, t)
    draw_corners(d, 0.8)
    draw_hud(d, t)

    lines = ["¿Y si tu cámara", "pensara?"]
    total = sum(len(l) for l in lines)
    n = total if t >= 3.0 else max(0, int((t - 0.8) * 14))
    f = font(FONT_BOLD, 92)
    y = 880
    shown = 0
    cursor_pos = None
    for line in lines:
        take = max(0, min(len(line), n - shown))
        part = line[:take]
        lw = d.textlength(line, font=f) / SS
        x0 = (W - lw) / 2
        if part:
            d.text((s(x0), s(y)), part, font=f, fill=WHITE, anchor="lm")
        if take < len(line) and cursor_pos is None:
            cursor_pos = (x0 + d.textlength(part, font=f) / SS, y)
        shown += len(line)
        y += 130

    # cursor rectangular parpadeante
    if t >= 0.6 and (t * 2.4) % 1 < 0.6:
        if cursor_pos is None:                       # texto completo -> tras la última línea
            lw = d.textlength(lines[-1], font=f) / SS
            cursor_pos = ((W - lw) / 2 + lw + 12, y - 130)
        cx, cy = cursor_pos
        d.rectangle([s(cx + 6), s(cy - 40), s(cx + 20), s(cy + 40)], fill=GREEN)

    d.text((s(W / 2), s(1700)), "VIGÍA IA", font=font(FONT_MONO_B, 34),
           fill=cmul(GREEN, min(1, max(0, (t - 2.6) / 0.6))), anchor="mm")


def scene2(d, t):
    """4-9 s — detección simulada sobre siluetas."""
    lt = t - 4.0
    draw_grid(d, 0.07)
    draw_corners(d, 0.8)
    draw_hud(d, t, label="CAM 02")

    d.text((s(W / 2), s(330)), "MODO: DETECCIÓN DE OBJETOS",
           font=font(FONT_MONO, 28), fill=cmul(GREEN, 0.55), anchor="mm")

    # suelo y siluetas
    d.line([(0, s(1462)), (s(W), s(1462))], fill=cmul(WHITE, 0.18), width=s(3))
    draw_person(d)
    draw_car(d)

    # barrido rápido de escaneo antes de la primera detección
    if lt < 0.7:
        y = s(900 + (lt / 0.7) * 620)
        d.rectangle([0, y - s(16), s(W), y + s(16)], fill=cmul(GREEN, 0.12))
        d.rectangle([0, y - s(3), s(W), y + s(3)], fill=cmul(GREEN, 0.5))

    det_box(d, (205, 962, 395, 1462), lt, 0.7, "PERSONA 98%")
    det_box(d, (535, 1165, 985, 1462), lt, 2.2, "VEHÍCULO 95%")

    # estado inferior
    mono = font(FONT_MONO_B, 32)
    if lt < 2.6:
        if (lt * 2) % 1 < 0.7:
            d.text((s(W / 2), s(1610)), "ANALIZANDO...", font=mono,
                   fill=cmul(WHITE, 0.7), anchor="mm")
    else:
        d.text((s(W / 2), s(1610)), "2 OBJETOS DETECTADOS", font=mono,
               fill=GREEN, anchor="mm")


FEATURES = ("Detección en tiempo real", "Sin instalaciones",
            "Funciona en tu navegador")


def scene3(d, t):
    """9-14 s — características una a una."""
    lt = t - 9.0
    draw_grid(d, 0.05)
    draw_corners(d, 0.5)

    d.text((s(W / 2), s(500)), "VIGÍA IA", font=font(FONT_MONO_B, 40),
           fill=GREEN, anchor="mm")
    d.line([(s(390), s(560)), (s(690), s(560))], fill=cmul(GREEN, 0.5), width=s(3))

    starts = (0.5, 1.8, 3.1)
    for i, (feat, t0) in enumerate(zip(FEATURES, starts)):
        p = ease_out((lt - t0) / 0.45)
        if p <= 0:
            continue
        y = 810 + i * 210
        dx = (1 - p) * 70                     # se desliza desde la izquierda
        # icono: cuadrado redondeado con check
        bx = 110 + dx
        d.rounded_rectangle([s(bx), s(y - 44), s(bx + 88), s(y + 44)], s(20),
                            outline=cmul(GREEN, p), width=s(5))
        ck = cmul(GREEN, p)
        d.line([(s(bx + 22), s(y + 2)), (s(bx + 40), s(y + 22))], fill=ck, width=s(8))
        d.line([(s(bx + 40), s(y + 22)), (s(bx + 68), s(y - 18))], fill=ck, width=s(8))
        # texto
        tf = fit_font(d, feat, FONT_BOLD, 56, W - (bx + 130) - 60)
        d.text((s(bx + 130), s(y)), feat, font=tf, fill=cmul(WHITE, p), anchor="lm")


def scene4(img, d, t):
    """14-20 s — logo con barrido de escaneo + recuadro parpadeante."""
    lt = t - 14.0
    draw_grid(d, 0.04)
    draw_corners(d, 0.5)

    logo_f = font(FONT_BOLD, 150)
    seg1, seg2 = "VIGÍA ", "IA"
    w1 = d.textlength(seg1, font=logo_f)
    w2 = d.textlength(seg2, font=logo_f)
    x0 = (s(W) - (w1 + w2)) / 2
    ly = 900                                   # línea base central del logo

    # progreso del barrido de escaneo (revela el logo de arriba abajo)
    p = clamp01((lt - 0.2) / 1.5)
    top, bottom = ly - 95, ly + 95
    scan_y = top + (bottom - top) * p

    # versión tenue completa (aún sin escanear)
    d.text((x0, s(ly)), seg1, font=logo_f, fill=cmul(WHITE, 0.16), anchor="lm")
    d.text((x0 + w1, s(ly)), seg2, font=logo_f, fill=cmul(GREEN, 0.16), anchor="lm")
    if p > 0:
        # la parte ya escaneada se pega brillante, recortada por la línea de escaneo
        bright = Image.new("RGB", (s(W), s(200)), BLACK)
        bd = ImageDraw.Draw(bright)
        bd.text((x0, s(100)), seg1, font=logo_f, fill=WHITE, anchor="lm")
        bd.text((x0 + w1, s(100)), seg2, font=logo_f, fill=GREEN, anchor="lm")
        mask = Image.new("L", (s(W), s(200)), 0)
        md = ImageDraw.Draw(mask)
        md.text((x0, s(100)), seg1, font=logo_f, fill=255, anchor="lm")
        md.text((x0 + w1, s(100)), seg2, font=logo_f, fill=255, anchor="lm")
        cut = int(s(scan_y) - s(ly - 100))
        if cut > 0:
            img.paste(bright.crop((0, 0, s(W), cut)), (0, s(ly - 100)),
                      mask.crop((0, 0, s(W), cut)))
    if 0 < p < 1:                              # línea de escaneo
        ys = s(scan_y)
        d.rectangle([s(90), ys - s(18), s(W - 90), ys + s(18)], fill=cmul(GREEN, 0.18))
        d.rectangle([s(90), ys - s(3), s(W - 90), ys + s(3)], fill=GREEN)

    # tagline
    ta = ease_out((lt - 1.9) / 0.6)
    if ta > 0:
        d.text((s(W / 2), s(1050)), "Vigilancia inteligente",
               font=font(FONT_REG, 54), fill=cmul(WHITE, 0.9 * ta), anchor="mm")

    # recuadro de detección parpadeando alrededor del logo
    if lt >= 2.3:
        on = (lt * 1.25) % 1 < 0.62
        if on:
            col = GREEN
            r = (120, 760, 960, 1130)
            d.rectangle([s(r[0]), s(r[1]), s(r[2]), s(r[3])], outline=col, width=s(4))
            L = 40
            for px, py, dx, dy in ((r[0], r[1], 1, 1), (r[2], r[1], -1, 1),
                                   (r[0], r[3], 1, -1), (r[2], r[3], -1, -1)):
                d.line([(s(px), s(py)), (s(px + dx * L), s(py))], fill=col, width=s(10))
                d.line([(s(px), s(py)), (s(px), s(py + dy * L))], fill=col, width=s(10))
            d.text((s(r[0]), s(r[1] - 26)), "VIGÍA IA · 100%",
                   font=font(FONT_MONO_B, 30), fill=col, anchor="lm")
        d.text((s(W / 2), s(1620)), "vigilancia con IA · sin hardware nuevo",
               font=font(FONT_MONO, 28), fill=cmul(WHITE, 0.5), anchor="mm")


# ---------------------------------------------------------------- montaje

def global_fade(t):
    """Fundidos de entrada/salida y entre escenas."""
    f = clamp01(t / 0.45)                      # fade-in inicial
    f = min(f, clamp01((DUR - t) / 0.5))       # fade-out final
    for b in (4.0, 9.0, 14.0):                 # cortes entre escenas
        if b - 0.22 <= t < b:
            f = min(f, (b - t) / 0.22)
        elif b <= t < b + 0.22:
            f = min(f, (t - b) / 0.22)
    return f


def make_vignette():
    g = Image.radial_gradient("L").resize((W, H))
    return g.point(lambda v: 255 - int(v * 0.24)).convert("RGB")


def render_frame(i, vignette):
    t = i / FPS
    img = Image.new("RGB", (s(W), s(H)), BLACK)
    d = ImageDraw.Draw(img)
    if t < 4:
        scene1(d, t)
    elif t < 9:
        scene2(d, t)
    elif t < 14:
        scene3(d, t)
    else:
        scene4(img, d, t)

    out = img.resize((W, H), Image.LANCZOS)
    out = ImageChops.multiply(out, vignette)
    if t < 9:                                  # grano sutil de CCTV en las escenas 1-2
        noise = Image.effect_noise((W, H), 16).convert("RGB")
        out = Image.blend(out, noise, 0.05)
    fade = global_fade(t)
    if fade < 1:
        out = ImageEnhance.Brightness(out).enhance(fade)
    return out


def main():
    if len(sys.argv) > 3 and sys.argv[1] == "--preview":
        # Escribe fotogramas sueltos como PNG: --preview dir 60,150,320,510
        vignette = make_vignette()
        outdir, frames = sys.argv[2], [int(x) for x in sys.argv[3].split(",")]
        for i in frames:
            render_frame(i, vignette).save(f"{outdir}/frame-{i:03d}.png")
            print(f"  preview {i} ({i / FPS:.1f}s)")
        return

    ff = shutil.which("ffmpeg")
    if not ff:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()

    cmd = [ff, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-",
           "-c:v", "libx264", "-preset", "medium", "-crf", "19",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    vignette = make_vignette()
    for i in range(N_FRAMES):
        proc.stdin.write(render_frame(i, vignette).tobytes())
        if i % 60 == 0:
            print(f"  fotograma {i}/{N_FRAMES} ({i / FPS:.0f}s)", flush=True)
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        sys.exit(f"ffmpeg terminó con código {proc.returncode}")
    print(f"✅ {OUT} generado ({N_FRAMES} fotogramas, {DUR}s @ {FPS}fps)")


if __name__ == "__main__":
    main()
