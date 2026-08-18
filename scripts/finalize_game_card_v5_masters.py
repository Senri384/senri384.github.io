from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5"
RAW = BASE / "raw-masters"
OUT = BASE / "masters"
QA = BASE / "qa"


ASSETS = {
    "case-master": (RAW / "case-master-chroma.png", (900, 1100), 0.035),
    "inside-master": (RAW / "inside-master-chroma.png", (1536, 1024), 0.04),
    "cart-master": (RAW / "cart-master-chroma.png", (700, 1000), 0.08),
}


def remove_chroma(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]

    dominance = green - np.maximum(red, blue)
    brightness = green
    alpha = np.ones(green.shape, dtype=np.float32) * 255.0
    alpha[(dominance >= 72) & (brightness >= 150)] = 0

    transition = (dominance > 28) & (dominance < 72) & (brightness > 105)
    alpha[transition] = np.clip((72 - dominance[transition]) / 44 * 255, 0, 255)

    # The generated subject contains no green by design. Remove dim chroma
    # spill as well so exported transparent edges cannot retain a green rim.
    residual_green = (dominance > 12) & (brightness > 24) & (green > red * 1.12) & (green > blue * 1.12)
    alpha[residual_green] = 0

    rgba = np.dstack((rgb, alpha)).astype(np.uint8)
    edge = (alpha > 0) & (alpha < 255)
    if np.any(edge):
        spill = np.maximum(0, rgba[:, :, 1].astype(np.int16) - np.maximum(rgba[:, :, 0], rgba[:, :, 2]))
        rgba[:, :, 1][edge] = np.clip(rgba[:, :, 1][edge].astype(np.int16) - spill[edge], 0, 255)
    return Image.fromarray(rgba, "RGBA")


def normalize(image: Image.Image, size: tuple[int, int], margin: float) -> tuple[Image.Image, dict]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("Chroma removal produced an empty image")

    subject = image.crop(bbox)
    target_w, target_h = size
    usable_w = target_w * (1 - margin * 2)
    usable_h = target_h * (1 - margin * 2)
    scale = min(usable_w / subject.width, usable_h / subject.height)
    scaled_size = (round(subject.width * scale), round(subject.height * scale))
    subject = subject.resize(scaled_size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    offset = ((target_w - subject.width) // 2, (target_h - subject.height) // 2)
    canvas.alpha_composite(subject, offset)
    return canvas, {
        "sourceBbox": list(bbox),
        "outputSize": list(size),
        "subjectSize": list(scaled_size),
        "subjectOffset": list(offset),
        "scale": scale,
    }


def analyze(image: Image.Image) -> dict:
    rgba = np.asarray(image.convert("RGBA"))
    alpha = rgba[:, :, 3]
    visible = alpha > 8
    rgb = rgba[:, :, :3]
    white = visible & (rgb.min(axis=2) > 238)
    saturated = rgb.max(axis=2) - rgb.min(axis=2)
    cyan = visible & (rgb[:, :, 1] > 115) & (rgb[:, :, 2] > 115) & (rgb[:, :, 0] < 80) & (saturated > 55)
    magenta = visible & (rgb[:, :, 0] > 115) & (rgb[:, :, 2] > 90) & (rgb[:, :, 1] < 75) & (saturated > 55)
    green = visible & (rgb[:, :, 1] > 105) & (rgb[:, :, 1] > rgb[:, :, 0] * 1.35) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.35)
    return {
        "alphaBbox": list(image.getchannel("A").getbbox() or ()),
        "transparentCorners": [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])],
        "partialAlphaPixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "whitePixels": int(white.sum()),
        "cyanPixels": int(cyan.sum()),
        "magentaPixels": int(magenta.sum()),
        "greenPixels": int(green.sum()),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, (source, size, margin) in ASSETS.items():
        keyed = remove_chroma(Image.open(source))
        final, geometry = normalize(keyed, size, margin)
        destination = OUT / f"{name}.png"
        final.save(destination, optimize=True)
        report[name] = {"source": str(source.relative_to(ROOT)), **geometry, **analyze(final)}

    (QA / "master-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
