from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
V4 = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v4"
MASTER_PATH = V4 / "masters" / "rack-master.png"
MASK_PATH = V4 / "masks" / "rack-mask.png"

SOURCE_RACKS = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v1"
GENERATED = {
    "game-research": SOURCE_RACKS / "category-rack-game-research-v1.png",
    "articles": SOURCE_RACKS / "category-rack-articles-v1.png",
    "scripts": V4 / "raw" / "rack-scripts-renamed.png",
    "reviews": V4 / "raw" / "rack-reviews-renamed.png",
    "experience": V4 / "raw" / "rack-experience-renamed.png",
    "short-films": V4 / "raw" / "rack-short-films-renamed.png",
    "photography": SOURCE_RACKS / "category-rack-photography-v1.png",
}


def prepared_rgba(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = np.array(rgba.getchannel("A"))
    if alpha.max() > 0 and alpha.min() < 255:
        return rgba

    rgb = np.array(rgba.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    # A few generated edits flattened transparency into a light checkerboard.
    # The rack is the only large dark connected component, so recover it
    # without carrying any of the checkerboard into the plaque face.
    candidate = (gray < 205).astype(np.uint8)
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
    if count <= 1:
        raise RuntimeError("Generated rack has no detectable foreground")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    component = (labels == largest).astype(np.uint8) * 255
    component = cv2.dilate(component, np.ones((5, 5), np.uint8), iterations=1)
    component = cv2.GaussianBlur(component, (0, 0), 0.45)
    rgba.putalpha(Image.fromarray(component, mode="L"))
    return rgba


def foreground_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("Generated rack has no detectable foreground")
    return bbox


def fit_subject(image: Image.Image, target_bbox: tuple[int, int, int, int]) -> Image.Image:
    image = prepared_rgba(image)
    source_bbox = foreground_bbox(image)
    source = image.convert("RGBA").crop(source_bbox)
    target_w = target_bbox[2] - target_bbox[0]
    target_h = target_bbox[3] - target_bbox[1]
    fitted = source.resize((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", Image.open(MASTER_PATH).size, (0, 0, 0, 0))
    canvas.alpha_composite(fitted, (target_bbox[0], target_bbox[1]))
    return canvas


def align_to_master(rough: Image.Image, master: Image.Image, hard_region: Image.Image) -> Image.Image:
    source_rgb = cv2.cvtColor(np.array(rough.convert("RGB")), cv2.COLOR_RGB2BGR)
    target_rgb = cv2.cvtColor(np.array(master.convert("RGB")), cv2.COLOR_RGB2BGR)
    source_gray = cv2.cvtColor(source_rgb, cv2.COLOR_BGR2GRAY)
    target_gray = cv2.cvtColor(target_rgb, cv2.COLOR_BGR2GRAY)
    mask = np.array(master.getchannel("A"))
    mask[np.array(hard_region) > 0] = 0
    sift = cv2.SIFT_create(nfeatures=3500, contrastThreshold=0.012)
    source_points, source_desc = sift.detectAndCompute(source_gray, mask)
    target_points, target_desc = sift.detectAndCompute(target_gray, mask)
    if source_desc is None or target_desc is None:
        return rough
    matches = cv2.BFMatcher(cv2.NORM_L2).knnMatch(source_desc, target_desc, k=2)
    good = [a for a, b in matches if a.distance < 0.72 * b.distance]
    if len(good) < 12:
        return rough
    source_xy = np.float32([source_points[item.queryIdx].pt for item in good]).reshape(-1, 1, 2)
    target_xy = np.float32([target_points[item.trainIdx].pt for item in good]).reshape(-1, 1, 2)
    matrix, _ = cv2.findHomography(source_xy, target_xy, cv2.RANSAC, 2.4)
    if matrix is None:
        return rough
    rgba = cv2.cvtColor(np.array(rough), cv2.COLOR_RGBA2BGRA)
    aligned = cv2.warpPerspective(
        rgba,
        matrix,
        master.size,
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    return Image.fromarray(cv2.cvtColor(aligned, cv2.COLOR_BGRA2RGBA))


def plaque_region() -> tuple[Image.Image, Image.Image]:
    size = Image.open(MASTER_PATH).size
    hard = Image.new("L", size, 0)
    # Full recessed face of the plaque. The previous inset clipped the lower
    # halves of long labels, which made correct generated text look corrupt.
    polygon = [(101, 716), (681, 792), (636, 892), (58, 810)]
    ImageDraw.Draw(hard).polygon(polygon, fill=255)
    blend = hard.filter(ImageFilter.GaussianBlur(0.55))
    blend = ImageChops.multiply(blend, hard)
    return blend, hard


def finalize(slug: str, generated_path: Path) -> dict[str, object]:
    master = Image.open(MASTER_PATH).convert("RGBA")
    target_bbox = master.getchannel("A").getbbox()
    if not target_bbox:
        raise RuntimeError("Rack master has no foreground")
    region, hard_region = plaque_region()
    rough = fit_subject(Image.open(generated_path), target_bbox)
    # The source racks already share the master's perspective. A second SIFT
    # homography bends the engraved letters even when the metal shell matches,
    # so preserve the generated plaque pixels at their original proportions.
    aligned = rough
    output = master.copy()
    output.paste(aligned, (0, 0), region)
    # Every category must share the exact same outer silhouette. Generated
    # plaque pixels may change only the recessed face, never its alpha edge.
    output.putalpha(master.getchannel("A"))
    out_path = V4 / "racks" / f"rack-{slug}.png"
    output.save(out_path, optimize=True)

    outside = ImageChops.invert(hard_region)
    diff = ImageChops.difference(output, master)
    outside_diff = Image.new("RGBA", master.size, (0, 0, 0, 0))
    outside_diff.paste(diff, (0, 0), outside)
    return {
        "slug": slug,
        "file": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "size": list(output.size),
        "alphaBBox": list(output.getchannel("A").getbbox() or ()),
        "outsidePlaqueDiff": outside_diff.getbbox() is not None,
    }


def contact_sheet() -> None:
    labels = ["game-design", *GENERATED]
    cell = (320, 350)
    sheet = Image.new("RGB", (cell[0] * 4, cell[1] * 2), (151, 20, 48))
    draw = ImageDraw.Draw(sheet)
    for index, slug in enumerate(labels):
        image = Image.open(V4 / "racks" / f"rack-{slug}.png").convert("RGBA")
        image.thumbnail((290, 300), Image.Resampling.LANCZOS)
        x = index % 4 * cell[0] + (cell[0] - image.width) // 2
        y = index // 4 * cell[1] + 10
        sheet.paste(image, (x, y), image)
        draw.text((index % 4 * cell[0] + 12, index // 4 * cell[1] + 318), slug, fill="white")
    sheet.save(V4 / "qa" / "rack-contact-sheet-uniform.png")


def main() -> None:
    master = Image.open(MASTER_PATH).convert("RGBA")
    (V4 / "racks").mkdir(parents=True, exist_ok=True)
    master.save(V4 / "racks" / "rack-game-design.png", optimize=True)
    reports = [
        {
            "slug": "game-design",
            "file": "public/portfolio-assets/ui/game-card-system-v4/racks/rack-game-design.png",
            "size": list(master.size),
            "alphaBBox": list(master.getchannel("A").getbbox() or ()),
            "outsidePlaqueDiff": False,
        }
    ]
    for slug, path in GENERATED.items():
        reports.append(finalize(slug, path))
    contact_sheet()
    report_path = V4 / "qa" / "rack-report.json"
    report_path.write_text(
        json.dumps({"ok": all(not item["outsidePlaqueDiff"] for item in reports), "racks": reports}, indent=2),
        encoding="utf-8",
    )
    print(report_path)


if __name__ == "__main__":
    main()
