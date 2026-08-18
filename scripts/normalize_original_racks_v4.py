from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v1"
OUTPUT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v4" / "racks"
QA = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v4" / "qa"

CANVAS = (1024, 1024)
VISIBLE_MAX = (934, 946)
BOTTOM_MARGIN = 38

RACKS = {
    "game-design": "category-rack-game-design-v2.png",
    "game-research": "category-rack-game-research-v1.png",
    "articles": "category-rack-articles-v1.png",
    "scripts": "category-rack-scripts-v1.png",
    "reviews": "category-rack-reviews-v1.png",
    "experience": "category-rack-experience-v1.png",
    "short-films": "category-rack-short-films-v1.png",
    "photography": "category-rack-photography-v1.png",
}


def cleaned_alpha(image: Image.Image, *, hard_edge: bool) -> Image.Image:
    alpha = image.getchannel("A")
    if hard_edge:
        # The seven early exports contain a fully opaque one-pixel matte.
        # Contract the mask before feathering so that matte cannot survive on
        # bright page backgrounds.
        alpha = alpha.filter(ImageFilter.MinFilter(5))
        alpha = alpha.filter(ImageFilter.GaussianBlur(0.62))
    else:
        alpha = alpha.filter(ImageFilter.GaussianBlur(0.22))
    return alpha


def normalize(source: Path, output: Path, *, hard_edge: bool) -> dict[str, object]:
    image = Image.open(source).convert("RGBA")
    image.putalpha(cleaned_alpha(image, hard_edge=hard_edge))
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"No foreground in {source}")
    image = image.crop(bbox)
    scale = min(VISIBLE_MAX[0] / image.width, VISIBLE_MAX[1] / image.height)
    size = (round(image.width * scale), round(image.height * scale))
    image = image.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = (CANVAS[0] - size[0]) // 2
    y = CANVAS[1] - BOTTOM_MARGIN - size[1]
    canvas.alpha_composite(image, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)

    final_bbox = canvas.getchannel("A").getbbox()
    return {
        "file": output.name,
        "source": source.name,
        "canvas": CANVAS,
        "foreground": final_bbox,
        "visible_size": (final_bbox[2] - final_bbox[0], final_bbox[3] - final_bbox[1]),
    }


def background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    px = image.load()
    for y in range(height):
        for x in range(width):
            t = x / max(1, width - 1)
            r = round(235 * (1 - t) + 61 * t)
            g = round(94 * (1 - t) + 0 * t)
            b = round(76 * (1 - t) + 28 * t)
            px[x, y] = (r, g, b)
    return image


def contact_sheet() -> None:
    cell = (360, 390)
    sheet = background((cell[0] * 4, cell[1] * 2))
    draw = ImageDraw.Draw(sheet)
    for index, slug in enumerate(RACKS):
        rack = Image.open(OUTPUT / f"rack-{slug}.png").convert("RGBA")
        rack.thumbnail((330, 330), Image.Resampling.LANCZOS)
        col, row = index % 4, index // 4
        x = col * cell[0] + (cell[0] - rack.width) // 2
        y = row * cell[1] + 16
        sheet.paste(rack, (x, y), rack)
        draw.text((col * cell[0] + 12, row * cell[1] + 356), slug, fill=(255, 255, 255))
    QA.mkdir(parents=True, exist_ok=True)
    sheet.save(QA / "rack-contact-sheet-red.png", optimize=True)


def main() -> None:
    reports = []
    for slug, filename in RACKS.items():
        reports.append(
            normalize(
                SOURCE / filename,
                OUTPUT / f"rack-{slug}.png",
                hard_edge=slug != "game-design",
            )
        )
    contact_sheet()
    for report in reports:
        print(report)


if __name__ == "__main__":
    main()
