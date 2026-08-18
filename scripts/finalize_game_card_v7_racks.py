from __future__ import annotations

import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v7"
RAW_DIR = BASE / "raw-racks"
OUT_DIR = BASE / "racks"
QA_DIR = BASE / "qa"

SLUGS = (
    "experience",
    "game-design",
    "game-research",
    "articles",
    "short-films",
    "scripts",
    "reviews",
    "photography",
)

OUTPUT_SIZE = (1280, 1280)
TARGET_BBOX = (36, 20, 1244, 1262)
PLAQUE_POLYGON = np.asarray(((24, 917), (902, 1024), (858, 1198), (18, 1080)), dtype=np.int32)
MAX_SPECK_HOLE_AREA = 25


def remove_chroma(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    dominance = green - np.maximum(red, blue)
    alpha = np.full(green.shape, 255.0, dtype=np.float32)

    hard = (green >= 145) & (dominance >= 54)
    alpha[hard] = 0
    transition = (green >= 70) & (dominance > 14) & ~hard
    alpha[transition] = np.clip((54 - dominance[transition]) / 40 * 255, 0, 255)

    rgba = np.dstack((rgb, alpha)).astype(np.uint8)
    edge = (alpha > 0) & (alpha < 255)
    if np.any(edge):
        spill = np.maximum(
            0,
            rgba[:, :, 1].astype(np.int16)
            - np.maximum(rgba[:, :, 0], rgba[:, :, 2]).astype(np.int16),
        )
        rgba[:, :, 1][edge] = np.clip(
            rgba[:, :, 1][edge].astype(np.int16) - spill[edge], 0, 255
        )

    # Generated green is never part of this black-and-bronze object.
    residual = (
        (rgba[:, :, 3] > 0)
        & (rgba[:, :, 1] > rgba[:, :, 0] * 1.22)
        & (rgba[:, :, 1] > rgba[:, :, 2] * 1.22)
    )
    rgba[:, :, 3][residual] = 0
    return Image.fromarray(rgba, "RGBA")


def normalize(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("Empty subject after chroma removal")
    subject = image.crop(bbox)
    left, top, right, bottom = TARGET_BBOX
    target_w, target_h = right - left, bottom - top
    scale = min(target_w / subject.width, target_h / subject.height)
    subject = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
    x = (OUTPUT_SIZE[0] - subject.width) // 2
    y = bottom - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def repair_small_alpha_holes(image: Image.Image) -> Image.Image:
    """Restore isolated chroma-key pinholes without changing the outer cutout."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    transparent = (rgba[:, :, 3] == 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(transparent, 8)
    repair = np.zeros(transparent.shape, dtype=np.uint8)
    height, width = transparent.shape

    for component in range(1, count):
        x, y, w, h, area = stats[component]
        touches_border = x == 0 or y == 0 or x + w == width or y + h == height
        if not touches_border and area <= MAX_SPECK_HOLE_AREA:
            repair[labels == component] = 255

    if not np.any(repair):
        return Image.fromarray(rgba, "RGBA")

    rgba[:, :, :3] = cv2.inpaint(rgba[:, :, :3], repair, 2, cv2.INPAINT_TELEA)
    rgba[:, :, 3][repair > 0] = 255
    return Image.fromarray(rgba, "RGBA")


def align_to_reference(image: Image.Image, reference: Image.Image) -> Image.Image:
    source = np.asarray(image.convert("RGBA"))
    target = np.asarray(reference.convert("RGBA"))
    source_gray = cv2.cvtColor(source[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    target_gray = cv2.cvtColor(target[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    mask = ((target[:, :, 3] > 64) * 255).astype(np.uint8)
    cv2.fillPoly(mask, [PLAQUE_POLYGON], 0)

    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 180, 1e-6)
    try:
        cv2.findTransformECC(
            target_gray,
            source_gray,
            warp,
            cv2.MOTION_AFFINE,
            criteria,
            inputMask=mask,
            gaussFiltSize=5,
        )
    except cv2.error:
        warp = np.eye(2, 3, dtype=np.float32)

    aligned = cv2.warpAffine(
        source,
        warp,
        OUTPUT_SIZE,
        flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    source_alpha = aligned[:, :, 3].copy()
    # All members share the approved generated silhouette. This eliminates
    # chroma-key and one-pixel crop variation without repainting the object.
    aligned[:, :, 3] = target[:, :, 3]
    newly_opaque = ((target[:, :, 3] > 0) & (source_alpha == 0)).astype(np.uint8) * 255
    if np.any(newly_opaque):
        aligned[:, :, :3] = cv2.inpaint(
            aligned[:, :, :3], newly_opaque, 2, cv2.INPAINT_TELEA
        )
    transparent = aligned[:, :, 3] == 0
    aligned[:, :, :3][transparent] = 0
    return Image.fromarray(aligned, "RGBA")


def count_small_alpha_holes(alpha: np.ndarray) -> int:
    transparent = (alpha == 0).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(transparent, 8)
    height, width = transparent.shape
    pixels = 0
    for component in range(1, count):
        x, y, w, h, area = stats[component]
        touches_border = x == 0 or y == 0 or x + w == width or y + h == height
        if not touches_border and area <= MAX_SPECK_HOLE_AREA:
            pixels += int(area)
    return pixels


def analyze(image: Image.Image, reference: Image.Image) -> dict[str, object]:
    rgba = np.asarray(image)
    rgb = rgba[:, :, :3]
    alpha = rgba[:, :, 3]
    visible = alpha > 0
    green = (
        visible
        & (rgb[:, :, 1] > 70)
        & (rgb[:, :, 1] > rgb[:, :, 0] * 1.22)
        & (rgb[:, :, 1] > rgb[:, :, 2] * 1.22)
    )
    white_halo = visible & (alpha < 245) & (rgb.min(axis=2) > 205)
    reference_rgba = np.asarray(reference)
    plaque_mask = np.zeros(alpha.shape, dtype=np.uint8)
    cv2.fillPoly(plaque_mask, [PLAQUE_POLYGON], 255)
    compare = visible & (plaque_mask == 0)
    delta = np.abs(rgb.astype(np.int16) - reference_rgba[:, :, :3].astype(np.int16))
    return {
        "size": list(image.size),
        "alphaBbox": list(image.getchannel("A").getbbox() or ()),
        "cornerAlpha": [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])],
        "partialAlphaPixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "smallInteriorAlphaHolePixels": count_small_alpha_holes(alpha),
        "greenPixels": int(green.sum()),
        "whiteHaloPixels": int(white_halo.sum()),
        "outsidePlaqueMeanDelta": round(float(delta[compare].mean()), 3),
        "outsidePlaqueP95Delta": round(float(np.percentile(delta[compare], 95)), 3),
        "sha256": hashlib.sha256(image.tobytes()).hexdigest(),
    }


def contact_sheet(images: dict[str, Image.Image]) -> Image.Image:
    panel_size = (480, 520)
    sheet = Image.new("RGBA", (panel_size[0] * 4, panel_size[1] * 2), (53, 21, 38, 255))
    for index, (slug, image) in enumerate(images.items()):
        preview = image.copy()
        preview.thumbnail((440, 455), Image.Resampling.NEAREST)
        panel = Image.new("RGBA", panel_size, (53, 21, 38, 255))
        panel.alpha_composite(preview, ((panel.width - preview.width) // 2, 4))
        ImageDraw.Draw(panel).text((14, 492), slug, fill=(255, 255, 255, 255))
        sheet.alpha_composite(panel, ((index % 4) * panel.width, (index // 4) * panel.height))
    return sheet


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    normalized: dict[str, Image.Image] = {}
    for slug in SLUGS:
        raw = Image.open(RAW_DIR / f"rack-{slug}-chroma.png")
        normalized[slug] = repair_small_alpha_holes(normalize(remove_chroma(raw)))

    reference = normalized["experience"]
    reference_alpha = np.asarray(reference.getchannel("A"))
    images: dict[str, Image.Image] = {}
    reports: dict[str, object] = {}

    for slug in SLUGS:
        final = reference if slug == "experience" else align_to_reference(normalized[slug], reference)
        output = OUT_DIR / f"rack-{slug}.png"
        final.save(output, optimize=True)
        images[slug] = final
        reports[slug] = analyze(final, reference)

    sheet = contact_sheet(images)
    sheet.save(QA_DIR / "rack-contact-sheet.png", optimize=True)
    report = {"targetBbox": TARGET_BBOX, "racks": reports}
    (QA_DIR / "rack-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if any(item["greenPixels"] for item in reports.values()):
        raise SystemExit("Green spill remains in a rack")
    if any(item["whiteHaloPixels"] for item in reports.values()):
        raise SystemExit("White halo remains in a rack")
    if any(item["smallInteriorAlphaHolePixels"] for item in reports.values()):
        raise SystemExit("A rack still contains chroma-key pinholes")
    if any(any(item["cornerAlpha"]) for item in reports.values()):
        raise SystemExit("A rack has non-transparent corners")
    if any(
        not np.array_equal(np.asarray(image.getchannel("A")), reference_alpha)
        for image in images.values()
    ):
        raise SystemExit("Rack alpha masks are not identical")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
