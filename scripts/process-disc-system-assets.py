from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ASSET_DIR = PUBLIC / "portfolio-assets" / "ui" / "disc-system"
COVER_DIR = PUBLIC / "portfolio-assets" / "disc-covers"

FRAME_NAMES = (
    "archive-closed",
    "archive-unlatched",
    "archive-open",
    "archive-case-pulled",
    "work-case-closed",
    "work-case-ajar",
    "work-case-half-open",
    "work-case-open",
)

MISSING_COVERS = (
    "disappear",
    "iron-superman",
    "rain-alley-pagoda-tree",
    "caines-mutiny-stage-review",
    "rango-review",
    "twelve-angry-men-review",
    "2001-space-odyssey-review",
    "game-experience-table",
)

CATEGORY_TINTS = {
    "game-design": (25, 202, 183),
    "game-research": (18, 158, 192),
    "articles": (217, 47, 101),
    "scripts": (224, 67, 115),
    "reviews": (192, 47, 93),
    "experience": (236, 113, 62),
    "photography": (32, 181, 174),
    "short-films": (227, 52, 108),
}


def split_grid(source: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for row in range(rows):
        top = round(row * source.height / rows)
        bottom = round((row + 1) * source.height / rows)
        for column in range(columns):
            left = round(column * source.width / columns)
            right = round((column + 1) * source.width / columns)
            frames.append(source.crop((left, top, right, bottom)))
    return frames


def alpha_bounds(image: Image.Image, padding: int = 10) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox() or (0, 0, image.width, image.height)
    return (
        max(0, bounds[0] - padding),
        max(0, bounds[1] - padding),
        min(image.width, bounds[2] + padding),
        min(image.height, bounds[3] + padding),
    )


def build_animation_frames() -> None:
    sheet = Image.open(ASSET_DIR / "disc-system-sprite-alpha.png").convert("RGBA")
    for name, frame in zip(FRAME_NAMES, split_grid(sheet, 4, 2), strict=True):
        frame.save(ASSET_DIR / f"{name}.png", optimize=True)


def cover_crop(image: Image.Image, size: tuple[int, int] = (512, 768)) -> Image.Image:
    source = ImageOps.exif_transpose(image).convert("RGB")
    return ImageOps.fit(source, size, Image.Resampling.LANCZOS, centering=(0.5, 0.45))


def stylize_cover(image: Image.Image, tint: tuple[int, int, int]) -> Image.Image:
    cover = cover_crop(image)
    cover = ImageEnhance.Contrast(cover).enhance(1.1)
    cover = ImageEnhance.Color(cover).enhance(0.92)

    low_res = cover.resize((256, 384), Image.Resampling.LANCZOS)
    cover = low_res.resize(cover.size, Image.Resampling.NEAREST)

    tint_layer = Image.new("RGB", cover.size, tint)
    tinted = Image.blend(ImageOps.colorize(ImageOps.grayscale(cover), (10, 5, 14), tint), cover, 0.64)
    cover = Image.blend(tinted, tint_layer, 0.08)

    vignette = Image.new("L", cover.size, 0)
    edge = Image.new("L", (cover.width - 54, cover.height - 54), 210)
    edge = edge.filter(ImageFilter.GaussianBlur(54))
    vignette.paste(edge, (27, 27))
    dark = Image.new("RGB", cover.size, (8, 2, 12))
    cover = Image.composite(cover, dark, vignette)

    pixels = cover.load()
    for y in range(1, cover.height, 4):
        for x in range(cover.width):
            red, green, blue = pixels[x, y]
            pixels[x, y] = (int(red * 0.9), int(green * 0.9), int(blue * 0.92))
    return cover


def load_portfolio() -> tuple[list[dict], list[dict]]:
    content = json.loads((ROOT / "src" / "data" / "portfolio-content.json").read_text("utf-8"))
    photo = json.loads((ROOT / "src" / "data" / "photo-albums.json").read_text("utf-8"))
    film = json.loads((ROOT / "src" / "data" / "film-works.json").read_text("utf-8"))
    return (
        [*content["categories"], *film["categories"], *photo["categories"]],
        [*content["works"], *film["works"], *photo["works"]],
    )


def panel_mask(frame: Image.Image, frame_index: int) -> Image.Image:
    rgba = frame.convert("RGBA")
    limit = (1.0, 0.74, 0.42, 0.42)[frame_index]
    mask = Image.new("L", rgba.size, 0)
    source = rgba.load()
    target = mask.load()
    for y in range(rgba.height):
        for x in range(int(rgba.width * limit)):
            red, green, blue, alpha = source[x, y]
            spread = max(red, green, blue) - min(red, green, blue)
            if alpha > 24 and red > 126 and green > 118 and blue > 112 and spread < 74:
                target[x, y] = min(255, int((min(red, green, blue) - 105) * 2.7))
    return mask.filter(ImageFilter.MaxFilter(3))


def place_cover_in_frame(
    frame: Image.Image,
    cover: Image.Image,
    mask: Image.Image,
    bounds: tuple[int, int, int, int] | None,
) -> Image.Image:
    if not bounds:
        return frame.copy()
    panel = ImageOps.fit(
        cover.convert("RGB"),
        (bounds[2] - bounds[0], bounds[3] - bounds[1]),
        Image.Resampling.LANCZOS,
    )
    layer = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    layer.paste(panel.convert("RGBA"), bounds[:2])
    result = frame.copy()
    result.alpha_composite(Image.composite(layer, Image.new("RGBA", frame.size), mask))
    return result


def build_covers(only_category: str | None = None) -> dict[str, dict[str, object]]:
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    opening_dir = PUBLIC / "portfolio-assets" / "disc-openings"
    opening_dir.mkdir(parents=True, exist_ok=True)
    missing_sheet = Image.open(ASSET_DIR / "missing-work-covers-source.png").convert("RGB")
    generated_missing = dict(zip(MISSING_COVERS, split_grid(missing_sheet, 4, 2), strict=True))
    case_frames = [
        Image.open(ASSET_DIR / f"{name}.png").convert("RGBA")
        for name in FRAME_NAMES[4:]
    ]
    case_masks = [panel_mask(frame, index) for index, frame in enumerate(case_frames)]
    case_bounds = [mask.getbbox() for mask in case_masks]
    _, works = load_portfolio()
    manifest_path = ROOT / "src" / "data" / "disc-covers.json"
    manifest: dict[str, dict[str, object]] = (
        json.loads(manifest_path.read_text("utf-8"))
        if only_category and manifest_path.exists()
        else {}
    )

    for work in works:
        slug = work["slug"]
        category = work["category"]
        if only_category and category != only_category:
            continue
        image_path = str(work.get("image") or "").strip()
        if image_path:
            source = Image.open(PUBLIC / image_path.lstrip("/"))
        else:
            source = generated_missing[slug]

        result = stylize_cover(source, CATEGORY_TINTS.get(category, (33, 192, 183)))
        output = COVER_DIR / f"{category}-{slug}.webp"
        result.save(output, "WEBP", quality=88, method=6)
        work_opening_dir = opening_dir / slug
        work_opening_dir.mkdir(parents=True, exist_ok=True)
        opening_frames: list[str] = []
        for frame_index, case_frame in enumerate(case_frames):
            composed = place_cover_in_frame(
                case_frame,
                result,
                case_masks[frame_index],
                case_bounds[frame_index],
            )
            frame_output = work_opening_dir / f"frame-{frame_index}.webp"
            composed.save(frame_output, "WEBP", quality=90, method=4)
            opening_frames.append(f"/portfolio-assets/disc-openings/{slug}/{frame_output.name}")

        manifest[slug] = {
            "coverArt": f"/portfolio-assets/disc-covers/{output.name}",
            "caseImage": opening_frames[0],
            "openingFrames": opening_frames,
        }

    return manifest


def main() -> None:
    only_category = None
    if "--only-category" in sys.argv:
        option_index = sys.argv.index("--only-category")
        try:
            only_category = sys.argv[option_index + 1]
        except IndexError as error:
            raise SystemExit("--only-category requires a category slug") from error

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    if not only_category:
        build_animation_frames()
    manifest = build_covers(only_category)
    output = ROOT / "src" / "data" / "disc-covers.json"
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    selected_count = sum(
        1 for entry in manifest.values()
        if not only_category or f"/{only_category}-" in str(entry.get("coverArt", ""))
    )
    print(
        f"Built {0 if only_category else len(FRAME_NAMES)} base frames, "
        f"{selected_count} selected work covers, and {selected_count * 4} opening frames."
    )


if __name__ == "__main__":
    main()
