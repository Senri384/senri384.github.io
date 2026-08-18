from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5"
MASTER_PATH = BASE / "masters" / "rack-master.png"
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

# Interior face of the generated blank plaque. The surrounding bevel, bolts,
# rack body, and all six cases remain pixel-identical to the master.
PLAQUE_POLYGON = ((105, 918), (785, 1026), (754, 1172), (86, 1062))


def rgba_on_black(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    alpha = rgba[:, :, 3:4] / 255.0
    rgb = rgba[:, :, :3] * alpha
    return cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2BGR)


def align_to_master(raw: Image.Image, master: Image.Image) -> np.ndarray:
    target = rgba_on_black(master)
    source = cv2.cvtColor(np.asarray(raw.convert("RGB")), cv2.COLOR_RGB2BGR)
    source = cv2.resize(source, (master.width, master.height), interpolation=cv2.INTER_LANCZOS4)

    target_gray = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    source_gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    mask = np.asarray(master.getchannel("A"), dtype=np.uint8)
    plaque_mask = np.zeros_like(mask)
    cv2.fillPoly(plaque_mask, [np.asarray(PLAQUE_POLYGON, dtype=np.int32)], 255)
    mask = cv2.bitwise_and(mask, cv2.bitwise_not(plaque_mask))

    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 160, 1e-6)
    cv2.findTransformECC(
        target_gray,
        source_gray,
        warp,
        cv2.MOTION_AFFINE,
        criteria,
        inputMask=mask,
        gaussFiltSize=5,
    )
    return cv2.warpAffine(
        source,
        warp,
        (master.width, master.height),
        flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )


def plaque_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(PLAQUE_POLYGON, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(1.1))


def edge_report(image: Image.Image) -> dict[str, object]:
    rgba = np.asarray(image.convert("RGBA"))
    alpha = rgba[:, :, 3]
    visible = alpha > 0
    rgb = rgba[:, :, :3]
    white = visible & (rgb.min(axis=2) > 235)
    cyan = visible & (rgb[:, :, 1] > rgb[:, :, 0] * 1.35) & (rgb[:, :, 2] > rgb[:, :, 0] * 1.35)
    magenta = visible & (rgb[:, :, 0] > rgb[:, :, 1] * 1.45) & (rgb[:, :, 2] > rgb[:, :, 1] * 1.3)
    ys, xs = np.where(visible)
    bbox = None if not len(xs) else [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
    return {
        "size": list(image.size),
        "bbox": bbox,
        "cornerAlpha": [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])],
        "partialAlphaPixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "whitePixels": int(white.sum()),
        "cyanPixels": int(cyan.sum()),
        "magentaPixels": int(magenta.sum()),
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    master = Image.open(MASTER_PATH).convert("RGBA")
    mask = plaque_mask(master.size)
    reports: dict[str, object] = {}

    for slug in SLUGS:
        raw_path = RAW_DIR / f"rack-{slug}-raw.png"
        aligned_bgr = align_to_master(Image.open(raw_path), master)
        aligned_rgb = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB)
        plaque = Image.fromarray(aligned_rgb, "RGB").convert("RGBA")
        plaque.putalpha(master.getchannel("A"))
        final = Image.composite(plaque, master, mask)
        final.putalpha(master.getchannel("A"))
        output_path = OUT_DIR / f"rack-{slug}.png"
        final.save(output_path, optimize=True)
        reports[slug] = edge_report(final)

    alpha_arrays = [
        np.asarray(Image.open(OUT_DIR / f"rack-{slug}.png").getchannel("A")) for slug in SLUGS
    ]
    identical_alpha = all(np.array_equal(alpha_arrays[0], item) for item in alpha_arrays[1:])
    report = {
        "master": str(MASTER_PATH.relative_to(ROOT)),
        "plaquePolygon": PLAQUE_POLYGON,
        "identicalAlphaMasks": identical_alpha,
        "racks": reports,
    }
    (QA_DIR / "rack-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if not identical_alpha:
        raise SystemExit("Rack alpha masks diverged")
    if any(any(value for value in item["cornerAlpha"]) for item in reports.values()):
        raise SystemExit("A rack has non-transparent corners")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
