from __future__ import annotations

import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "public"
    / "portfolio-assets"
    / "ui"
    / "game-card-system-v1"
    / "category-rack-experience-v1.png"
)
BASE = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v6"
MASTER_DIR = BASE / "masters"
RACK_DIR = BASE / "racks"
QA_DIR = BASE / "qa"

LABELS = {
    "experience": "GAME EXPERIENCE",
    "game-design": "GAME DESIGN",
    "game-research": "SYSTEM ANALYSIS",
    "articles": "CULTURE WRITING",
    "short-films": "SHORT FILM",
    "scripts": "SCRIPT",
    "reviews": "REVIEW",
    "photography": "PHOTOGRAPHY",
}

# The inner face of the original V1 plaque. Only this plane may vary.
PLAQUE = np.float32(((88, 948), (817, 1064), (776, 1184), (48, 1067)))
FONT_PATH = Path(r"C:\Windows\Fonts\consolab.ttf")


def clean_alpha(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3]

    # V1 came from a matte extraction. Contract only the nearly invisible halo,
    # retaining the deliberately stepped pixel edge.
    alpha[alpha < 18] = 0
    partial = (alpha > 0) & (alpha < 255)
    if np.any(partial):
        near_white = partial & (rgb.min(axis=2) > 205)
        alpha[near_white] = 0
        partial = (alpha > 0) & (alpha < 255)
        dark = np.minimum(rgb.min(axis=2), 54)
        for channel in range(3):
            rgb[:, :, channel][partial] = np.minimum(
                rgb[:, :, channel][partial], dark[partial] + 22
            )
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def plaque_mask(size: tuple[int, int], inset: int = 0) -> Image.Image:
    points = PLAQUE.copy()
    if inset:
        center = points.mean(axis=0)
        vectors = points - center
        lengths = np.linalg.norm(vectors, axis=1, keepdims=True)
        points = points - vectors / np.maximum(lengths, 1) * inset
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon([tuple(map(float, point)) for point in points], fill=255)
    return mask


def remove_original_text(master: Image.Image) -> Image.Image:
    rgba = np.asarray(master.convert("RGBA")).copy()
    bgr = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
    mask = np.zeros((master.height, master.width), dtype=np.uint8)

    # PLAY HISTORY glyph band, kept inside the plaque bevel.
    text_band = np.float32(((145, 980), (745, 1074), (719, 1134), (120, 1040)))
    cv2.fillPoly(mask, [text_band.astype(np.int32)], 255)
    mask = cv2.GaussianBlur(mask, (3, 3), 0)
    repaired = cv2.inpaint(bgr, mask, 7, cv2.INPAINT_TELEA)
    repaired = cv2.cvtColor(repaired, cv2.COLOR_BGR2RGB)

    result = rgba.copy()
    apply = mask > 0
    result[:, :, :3][apply] = repaired[apply]
    return Image.fromarray(result, "RGBA")


def fit_font(text: str, max_width: int, max_height: int) -> ImageFont.FreeTypeFont:
    for size in range(92, 20, -1):
        font = ImageFont.truetype(str(FONT_PATH), size=size)
        bbox = font.getbbox(text, stroke_width=0)
        if bbox[2] - bbox[0] <= max_width and bbox[3] - bbox[1] <= max_height:
            return font
    return ImageFont.truetype(str(FONT_PATH), size=20)


def render_label(text: str) -> Image.Image:
    width, height = 760, 132
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    font = fit_font(text, 680, 84)
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=1)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (width - tw) // 2 - bbox[0]
    y = (height - th) // 2 - bbox[1] - 1

    # Engraved pixel-metal glyph: recessed dark edge, warm lit face, and one
    # narrow lower bevel. This is drawn directly on the plaque plane, with no
    # backing rectangle or sticker.
    draw.text((x + 4, y + 6), text, font=font, fill=(16, 13, 13, 245), stroke_width=2, stroke_fill=(7, 6, 7, 255))
    draw.text((x + 1, y + 2), text, font=font, fill=(100, 86, 77, 255), stroke_width=2, stroke_fill=(22, 18, 18, 255))
    draw.text((x, y), text, font=font, fill=(196, 174, 151, 255), stroke_width=1, stroke_fill=(48, 39, 36, 255))
    draw.text((x, y - 1), text, font=font, fill=(220, 201, 178, 210), stroke_width=0)

    # Match the source's chunky pixel cadence without soft vector edges.
    small = canvas.resize((380, 66), Image.Resampling.BOX)
    return small.resize(canvas.size, Image.Resampling.NEAREST)


def project_label(label: Image.Image, size: tuple[int, int]) -> Image.Image:
    src = np.float32(((0, 0), (label.width - 1, 0), (label.width - 1, label.height - 1), (0, label.height - 1)))
    matrix = cv2.getPerspectiveTransform(src, PLAQUE)
    data = cv2.warpPerspective(
        np.asarray(label),
        matrix,
        size,
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    return Image.fromarray(data, "RGBA")


def sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def analyze(image: Image.Image, master: Image.Image) -> dict[str, object]:
    rgba = np.asarray(image.convert("RGBA"))
    alpha = rgba[:, :, 3]
    visible = alpha > 0
    rgb = rgba[:, :, :3]
    white_halo = visible & (alpha < 220) & (rgb.min(axis=2) > 190)
    outside = np.asarray(plaque_mask(image.size)) == 0
    delta = np.abs(
        rgba[:, :, :3].astype(np.int16) - np.asarray(master)[:, :, :3].astype(np.int16)
    )
    return {
        "size": list(image.size),
        "alphaBbox": list(image.getchannel("A").getbbox() or ()),
        "cornerAlpha": [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])],
        "whiteHaloPixels": int(white_halo.sum()),
        "changedPixelsOutsidePlaque": int((delta.max(axis=2)[outside] > 0).sum()),
        "sha256": sha256(image),
    }


def main() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    RACK_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)

    source = clean_alpha(Image.open(SOURCE))
    blank = remove_original_text(source)
    blank.save(MASTER_DIR / "rack-master.png", optimize=True)
    alpha = blank.getchannel("A")
    reports: dict[str, object] = {}

    for slug, text in LABELS.items():
        final = blank.copy()
        final.alpha_composite(project_label(render_label(text), final.size))
        final.putalpha(alpha)
        output = RACK_DIR / f"rack-{slug}.png"
        final.save(output, optimize=True)
        reports[slug] = analyze(final, blank)

    alpha_arrays = [np.asarray(Image.open(RACK_DIR / f"rack-{slug}.png").getchannel("A")) for slug in LABELS]
    report = {
        "source": str(SOURCE.relative_to(ROOT)),
        "master": str((MASTER_DIR / "rack-master.png").relative_to(ROOT)),
        "labels": LABELS,
        "identicalAlphaMasks": all(np.array_equal(alpha_arrays[0], item) for item in alpha_arrays[1:]),
        "racks": reports,
    }
    (QA_DIR / "rack-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if not report["identicalAlphaMasks"]:
        raise SystemExit("Rack alpha masks diverged")
    if any(item["changedPixelsOutsidePlaque"] for item in reports.values()):
        raise SystemExit("A rack changed outside the locked plaque")
    if any(any(item["cornerAlpha"]) for item in reports.values()):
        raise SystemExit("A rack has non-transparent corners")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
