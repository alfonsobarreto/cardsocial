"""
Genera iconos para Expo desde el logo fuente:
- cs-app-icon-ios.png: 1024 RGB opaco (iOS / expo.icon) — evita artefactos por alpha.
- cs-app-icon-android-fg.png: 1024 RGBA, logo ~58% del lienzo centrado (adaptive foreground).

Ejecutar desde la raíz del repo: python scripts/build-app-store-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "images" / "cs-icon-logo-bg-transparent.png"
OUT_IOS = ROOT / "assets" / "images" / "cs-app-icon-ios.png"
OUT_ANDROID_FG = ROOT / "assets" / "images" / "cs-app-icon-android-fg.png"

SIZE = 1024
# ~58% del lado: queda dentro de la zona segura ~66% de Android adaptive icon
LOGO_FRAC = 0.58


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    im = Image.open(SRC).convert("RGBA")
    max_side = int(SIZE * LOGO_FRAC)
    w, h = im.size
    ratio = min(max_side / w, max_side / h)
    nw, nh = max(1, int(w * ratio)), max(1, int(h * ratio))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x0, y0 = (SIZE - nw) // 2, (SIZE - nh) // 2

    fg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fg.paste(resized, (x0, y0), resized)
    fg.save(OUT_ANDROID_FG, optimize=True)
    print(f"Wrote {OUT_ANDROID_FG.relative_to(ROOT)}")

    canvas = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    canvas.paste(resized, (x0, y0), resized)
    rgb = canvas.convert("RGB")
    rgb.save(OUT_IOS, optimize=True)
    print(f"Wrote {OUT_IOS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
